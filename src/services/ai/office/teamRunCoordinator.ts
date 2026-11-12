import type { TaskPlannerDatabase } from '../../../db';
import type {
  AgentRunState,
  AgentRunStatus,
  AiEmployee,
  AiLead,
  AiSkill,
  AiTeam,
  AiTeamAssignment,
  AiTeamAssignmentRunStatus,
  AiTeamAssignmentStopReason,
  AiTeamMember,
  TeamRunPhase,
} from '../../../types/aiOffice';
import {
  ASSIGNMENT_HISTORY_CAP,
  DEFAULT_TEAM_CONCURRENCY,
  RECENT_WINDOW_TURNS,
} from '../../../types/aiOffice';
import type { ChatMessage, ChatTokenUsage } from '../../../types/models';
import {
  createDefaultChatTurnDeps,
  SANITIZED_TURN_ERROR,
  type ChatTurnApprovalInfo,
  type ChatTurnOutcome,
  type ChatTurnPhase,
  type ChatTurnRequest,
  type ChatTurnRuntimeDeps,
} from '../../../components/ai/runtime/chatTurnRuntime';
import { dispatchAiToolCall } from '../aiOrchestratorLoop';
import type { ChatCompletionMessage } from '../types';
import { AI_DATABASE_TOOLS, isMutationTool, normalizeToolName, type AiToolDefinition } from '../aiTools';
import {
  EMPLOYEE_READ_ONLY_ALLOWLIST,
  LEAD_TOOL_ALLOWLIST,
  getToolsForTurn,
} from '../chatTurnTools';
import { aiTurnManager } from '../aiTurnManager';
import { createTeamRunRegistry, type TeamRunRegistry } from './teamRunRegistry';
import { createTeamRunScheduler, type SchedulerHandle } from './scheduler';
import { beginTurn, endTurn } from './liveUseRegistry';
import {
  bucketOf,
  createBudgetGate,
  normalizeUsageTotal,
  shouldNotifyPause,
  type BudgetGate,
} from './budgetGate';
import {
  buildEmployeeTurnRequest,
  buildLeadTurnRequest,
  type BatchResult,
  type LinkedItemIndexEntry,
} from './teamPrompts';
import {
  LEAD_ONLY_TEAM_TOOLS,
  TEAM_TOOL_DEFINITIONS,
  executeTeamTool,
  type TeamToolContext,
} from './teamTools';
import {
  findCurrentSynthesisMessageId,
  insertReportMessage,
  listAssignmentHistory,
  listRecentTurns,
  notifyAIChatSync,
  saveTeamMessage,
  supersedeTeamMessage,
} from '../../../db/repositories/teamTranscriptRepo';
import {
  addUsedTokens,
  getTeam,
  listTeamMembers,
  topUpMemberBudget,
  updateTeam,
} from '../../../db/repositories/aiTeamRepo';
import {
  closeBatch,
  createAssignment,
  getAssignment,
  getBatch,
  listBatchAssignments,
  openBatch,
  transitionAssignment,
} from '../../../db/repositories/aiTeamRunRepo';
import { generateId } from '../../../utils/uuid';

/**
 * Headless team-run coordinator (D-01/D-02/D-03, D-06, D-08, D-12/D-13, D-14, D-20/D-21,
 * D-22, D-30). No React import: the run must survive a view switch, so the host creates one
 * coordinator per team outside component state.
 *
 * Composition, not reimplementation: one `ChatTurnRuntime` per agent (registry), gates from
 * `budgetGate`, prompts from `teamPrompts`, tools from `teamTools` + `chatTurnTools`, and the
 * existing loop's `executeToolFn` interception point for `delegate_batch`.
 */

export interface AssignmentPlanEntry {
  agentId: string;
  agentName: string;
  skillName?: string | undefined;
  task: string;
}

export interface AssignmentPlan {
  batchIndex: number;
  assignments: AssignmentPlanEntry[];
}

export interface TeamRunSnapshot {
  phase: TeamRunPhase;
  agents: AgentRunState[];
  pendingPlan: AssignmentPlan | null;
  pendingApproval: ChatTurnApprovalInfo | null;
  /**
   * 37.1 D-03/D-28: steer rows the leader has not drained yet — the "chờ leader đọc"
   * badge. Live-session only; the durable state is derived from the ledger (D-14).
   */
  pendingSteerMessageIds: string[];
  /**
   * D-21: the scope that is actually parked. The banner names the agent when one
   * agent's own gate is closed, so the user tops up the right budget.
   */
  pausedAgentId: string | null;
  pausedAgentName: string | null;
  /**
   * UI-SPEC §7: the plan stays on screen with its `role="status"` decision line until
   * the next plan replaces it, so the decision is observable.
   */
  lastPlan: AssignmentPlan | null;
  lastPlanDecision: 'approved' | 'rejected' | null;
}

export type TopUpScope = { kind: 'agent'; agentId: string } | { kind: 'team' };

/**
 * D-02/D-03/D-07: the roster a turn runs with, read once at the turn's start.
 * `lead` and `teamRow` are optional so an empty group (D-05) and a vanished team row
 * resolve without a fabricated profile.
 */
export interface TurnRoster {
  teamRow: AiTeam | undefined;
  lead: AiLead | undefined;
  employees: AiEmployee[];
  skills: AiSkill[];
  /** D-08: live membership — a de-rostered agent is not mentionable from the next turn. */
  memberAgentIds: string[];
}

export interface TeamRunCoordinatorOptions {
  db: TaskPlannerDatabase;
  team: AiTeam;
  lead: AiLead;
  employees: AiEmployee[];
  skills: AiSkill[];
  threadId: string;
  /** Lead default model, used only when `lead.model` is empty. */
  model: string;
  endpoint: string;
  apiKey: string;
  mcpTools?: AiToolDefinition[] | undefined;
  /** Test seam: production omits it and the coordinator uses the default chat-turn deps. */
  createRuntimeDeps?: ((agentId: string) => Partial<ChatTurnRuntimeDeps>) | undefined;
  /**
   * Test seam (WR-05): the bounded settle-poll deadline. Production omits it — the 120 s
   * default is what stops a row that can never settle from hanging the team turn forever.
   */
  settlePollDeadlineMs?: number | undefined;
  /**
   * Production seam (D-03): resolve a fresh roster from persisted rows at every turn start.
   * When supplied, no construction-time `lead`/`employees`/`skills` value reaches a turn.
   */
  loadRoster?: (() => Promise<TurnRoster>) | undefined;
}

export interface TeamRunCoordinator {
  /**
   * D-01/D-02: the single chat box, always usable. `'started'` means a turn began;
   * `'steered'` means a live run took the message as a steer; `'refused'` means the
   * mentioned agent already settled (the leader reports it honestly); `'blocked'` means
   * the coordinator is disposed and nothing will ever happen.
   */
  send(text: string): Promise<'started' | 'steered' | 'refused' | 'blocked'>;
  /**
   * Internal seam (D-09/D-22): the ONE terminal writer for an attempt. 37-04's `stopAgent`
   * and `abortAll` call it; exported so the "exactly one report row under concurrency"
   * invariant is testable without going through a provider.
   */
  finalizeAttempt(
    assignmentId: string,
    from: AiTeamAssignmentRunStatus,
    to: 'done' | 'stopped' | 'error' | 'skipped',
    stopReason: AiTeamAssignmentStopReason,
    contentWhenMissing?: string,
    diagnosticDetail?: string
  ): Promise<AiTeamAssignment | null>;
  /**
   * D-24: dispatches a batch and returns an ACKNOWLEDGEMENT, not settled results. The lead's
   * turn ends here; `onBatchSettled` opens a new lead turn once every agent is terminal.
   */
  runBatch(assignments: unknown[], signal?: AbortSignal): Promise<string>;
  /**
   * D-12/D-13/D-23: re-run exactly ONE stopped/errored attempt as a NEW attempt row, mark
   * the previous report superseded, then re-synthesize the whole batch once.
   *
   * The task comes from the stored assignment row — never text the user re-typed — and a
   * `done` attempt, a removed agent, a busy phase or an in-flight retry is refused.
   */
  retryAssignment(assignmentId: string): Promise<void>;
  resolvePlan(approved: boolean): void;
  resolveApproval(approved: boolean): void;
  stopAgent(agentId: string): void;
  abortAll(): void;
  topUp(scope: TopUpScope, amount: number): Promise<void>;
  /**
   * D-18: ends a live run in bounded time and leaves the coordinator inert. Resolves once
   * the parks are released and every runtime is aborted — the in-flight `send()` may still
   * be unwinding, so every post-await phase write is gated on `disposed`. Idempotent.
   *
   * `cause` is the teardown's own vocabulary (IN-04/IN-07): a team delete, or app exit. The
   * attempt rows settled by this teardown carry it as `stopReason`, so the ledger and the
   * batch row (`abortedBy`) agree.
   */
  dispose(cause?: 'team-deleted' | 'app-exit'): Promise<void>;
  /** D-25: toggles apply to the live run, not only the next construction. */
  setTeamSettings(
    patch: Partial<Pick<AiTeam, 'autoSplitEnabled' | 'autoApproveMutations' | 'concurrencyLimit'>>
  ): void;
  /** AIO-BUDGET-01: adopt a team-total edit so the next top-up accumulates onto it. */
  setTeamBudget(total: number): void;
  /** D-07 diagnostic seam: live scheduler slots, so a leak is observable without a provider. */
  getRunningCount(): number;
  /**
   * 37.1 SC5 test seam: the inbox drain, so the disposed gate is provable without a provider.
   * Production reaches it through `beforeToolRound`; this exists for the same reason
   * `finalizeAttempt` is exported.
   */
  drainSteerInbox(agentId: string, assignmentId: string): Promise<ChatCompletionMessage[]>;
  subscribe(listener: () => void): () => void;
  getState(): TeamRunSnapshot;
}

const TEAM_TOOL_NAMES = new Set(
  TEAM_TOOL_DEFINITIONS.map((tool) => normalizeToolName(tool.function.name))
);

/** The employee payload is the payload-layer half of D-12; the runtime policy is the other. */
const EMPLOYEE_TEAM_TOOLS = TEAM_TOOL_DEFINITIONS.filter(
  (tool) => !LEAD_ONLY_TEAM_TOOLS.has(normalizeToolName(tool.function.name))
);

/** `@[Name](agent:<id>)` — same syntax `ChatMessageBubble.renderUserMessageWithMentions` parses. */
const AGENT_MENTION = /@\[([^\]]+)\]\(agent:([a-zA-Z0-9-]+)\)/;

/**
 * D-10: a steer reaches an agent as a `role: 'user'` message with this prefix — never a
 * system message, never a tool result. One constant so both drains cannot drift.
 */
const STEER_PREFIX = '[Chỉ đạo từ người dùng] ';

const TERMINAL_STATUSES: readonly AgentRunStatus[] = ['done', 'stopped', 'error'];

/** 37.1 D-22: monotonic id source for `AgentLiveStep` — ids are unique, never meaningful. */
let stepSeq = 0;

/** D-22: a ledger row in one of these is settled — it must never take a second report row. */
const TERMINAL_RUN_STATUSES: ReadonlySet<AiTeamAssignmentRunStatus> = new Set([
  'done',
  'stopped',
  'error',
]);

/**
 * IN-02: phases in which a turn is actually running. Module-local — no UI imports it (the
 * workspace gates on `BUSY_PHASES`), so exporting it only invited the stale claim that an
 * "is the team working" indicator read it.
 */
const LIVE_PHASES: ReadonlySet<TeamRunPhase> = new Set<TeamRunPhase>([
  'lead-thinking',
  'awaiting-plan',
  'batch-running',
  'lead-synthesizing',
]);

/**
 * D-21: live phases PLUS the two park phases. A parked turn still owns the slot, so a
 * second submit is routed as a steer instead of starting a second turn (D-01/D-02).
 */
export const BUSY_PHASES: ReadonlySet<TeamRunPhase> = new Set<TeamRunPhase>([
  ...LIVE_PHASES,
  'awaiting-budget',
  'awaiting-mutation-approval',
]);

const OUTCOME_STATUS: Record<ChatTurnPhase, AgentRunStatus> = {
  complete: 'done',
  cancelled: 'done',
  aborted: 'stopped',
  error: 'error',
  'tool-limit': 'error',
};

/** D-22 terminal mapping for the LEDGER, by what the turn actually did. */
const OUTCOME_RUN_STATUS: Record<ChatTurnPhase, 'done' | 'stopped' | 'error'> = {
  complete: 'done',
  cancelled: 'stopped',
  aborted: 'stopped',
  error: 'error',
  'tool-limit': 'error',
};

const OUTCOME_STOP_REASON: Record<ChatTurnPhase, AiTeamAssignmentStopReason> = {
  complete: 'none',
  cancelled: 'user-abort',
  aborted: 'user-abort',
  error: 'provider',
  'tool-limit': 'tool-limit',
};

/** D-13: the bubble a stopped attempt gets when the runtime wrote no row of its own. */
export const STOPPED_REPORT_COPY =
  'Nhân viên đã dừng trước khi hoàn tất công việc. Bấm "Chạy lại" để tiếp tục mà không phải giao lại việc.';

/** 37.1 D-07: the bubble a leader-amended (cancelled or rewritten) attempt gets. */
const AMENDED_REPORT_COPY =
  'Việc này đã được trưởng nhóm huỷ hoặc thay đổi trước khi bắt đầu. Không có kết quả nào được tạo.';

/**
 * D-17/T-37-07: the ONLY carrier of raw error detail. It reaches `diagnosticDetail` on the
 * assignment row and nothing else — never `content`, a `ChatMessage`, or the backup.
 */
function boundedDiagnostic(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}`.slice(0, 300) : 'unknown';
}

const PLAN_REJECTED = JSON.stringify({
  cancelled: true,
  message: 'Người dùng đã từ chối kế hoạch phân việc. Không nhân viên nào được giao việc.',
});

/** D-18: a disposed run accepts no new batch, so the lead gets a structured refusal. */
const DISPOSED_REFUSAL = JSON.stringify({
  cancelled: true,
  message: 'Nhóm đã bị đóng. Không nhân viên nào được giao việc.',
});

/**
 * WR-06: the batch's create/dispatch loop failed (a ledger or transcript write threw). The
 * lead gets a refusal instead of a thrown tool error, so its turn completes normally.
 */
const BATCH_DISPATCH_FAILED = JSON.stringify({
  cancelled: true,
  message: 'Không mở được lô chạy. Chưa nhân viên nào được giao việc.',
});

/**
 * D-24/T-37.1-02: a second `delegate_batch` while a batch is open would overwrite
 * `openBatchId` and orphan the first batch's settle handler. Refuse it.
 */
const ALREADY_RUNNING_REFUSAL = JSON.stringify({
  cancelled: true,
  message: 'Một lô đang chạy. Hãy chờ lô đó xong rồi giao việc mới.',
});

/**
 * D-18/D-11: abort every per-assignment controller and empty the map, so every parked
 * `scheduler.acquire` rejects with `AbortError` instead of parking forever.
 */
export function abortAllAssignmentControllers(
  controllers: Map<string, AbortController>
): void {
  for (const controller of controllers.values()) controller.abort();
  controllers.clear();
}

/** Lead-only tool: an employee that hallucinates the name gets a structured refusal. */
const EMPLOYEE_DELEGATE_REFUSAL = JSON.stringify({
  refused: true,
  code: 'AGENT_NOT_IN_ROSTER',
  message: 'Chỉ trưởng nhóm được giao việc cho nhân viên.',
});

/** 37.1 D-28: `deliver_steer` is the leader's gate — an employee call writes nothing. */
export const EMPLOYEE_DELIVER_STEER_REFUSAL = JSON.stringify({
  refused: true,
  code: 'AGENT_NOT_IN_ROSTER',
  message: 'Chỉ trưởng nhóm được giao chỉ đạo cho nhân viên.',
});

/** 37.1 D-27: `amend_assignments` is leader-only — same shape as the delegate refusal. */
export const EMPLOYEE_AMEND_REFUSAL = JSON.stringify({
  refused: true,
  code: 'AGENT_NOT_IN_ROSTER',
  message: 'Chỉ trưởng nhóm được huỷ hoặc sửa việc.',
});

/**
 * Every advertised team tool must resolve to a handler. `dispatchAiToolCall` only routes
 * `AI_DATABASE_TOOLS` members to `executeAiTool`; anything else falls through to the dynamic
 * MCP path and throws "unknown MCP server". This guard keeps that drift visible in tests.
 */
export function resolveTeamToolName(name: string): 'coordinator' | 'teamTools' | 'unknown' {
  const normalized = normalizeToolName(name);
  if (
    normalized === 'delegate_batch' ||
    normalized === 'deliver_steer' ||
    normalized === 'amend_assignments'
  ) {
    return 'coordinator';
  }
  if (TEAM_TOOL_NAMES.has(normalized)) return 'teamTools';
  return 'unknown';
}

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}

function createDeferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

export function createTeamRunCoordinator(
  options: TeamRunCoordinatorOptions
): TeamRunCoordinator {
  const { db, team } = options;
  const teamId = team.id;
  // D-25: the toggles are read at run time, so a change in the sidebar or settings
  // drawer applies without reconstructing the coordinator.
  let liveTeam: AiTeam = team;

  /**
   * D-03/D-07: the roster a turn runs with. With a `loadRoster` seam it starts EMPTY, so no
   * construction-time profile can reach a turn; without one it seeds from the options exactly
   * as before (legacy harness path).
   */
  let roster: TurnRoster = options.loadRoster
    ? { teamRow: undefined, lead: undefined, employees: [], skills: [], memberAgentIds: [] }
    : {
        teamRow: team,
        lead: options.lead,
        employees: options.employees,
        skills: options.skills,
        memberAgentIds: [],
      };

  let phase: TeamRunPhase = 'idle';
  /**
   * D-18: set once at the top of `dispose()` and never cleared. Every post-await phase
   * write checks it, because `dispose()` cannot await the in-flight `send()`/`runBatch` —
   * releasing the parks is what lets them finish, so a late tail would resurrect a phase.
   */
  let disposed = false;
  /**
   * 37-03 writes this when a batch row is opened; 37-02 establishes the slot so the
   * dispose close is a no-op until then.
   */
  let openBatchId: string | null = null;
  /**
   * D-24/T-37.1-01: the batch owns cancellation, never the lead's tool-call signal. One
   * controller per open batch; `abortAll`/`dispose` abort every entry, and
   * `onBatchSettled`'s `finally` owns deletion.
   */
  const batchControllers = new Map<string, AbortController>();
  /**
   * D-24: one team turn spans dispatch + batch + synthesis. `send()`'s `finally` must not
   * finish it while a batch is still running; `onBatchSettled` finishes it instead.
   */
  let batchOwnsTeamTurn = false;
  /** D-24: two lead turns per batch, so the usage baseline is keyed per TURN, not per agent. */
  const usageBaselineKey = new Map<string, string>();
  let leadTurnSeq = 0;
  let employeeTurnSeq = 0;
  /** D-24: two lead turns must never overlap on one runtime. */
  let leadTurnChain: Promise<void> = Promise.resolve();
  /** D-22: which attempt the agent's next report save belongs to (cleared on terminal). */
  const activeAssignmentByAgent = new Map<
    string,
    { batchId: string; assignmentId: string; attemptNo: number }
  >();
  /** D-10/D-11/D-18: the cancellation channel for a still-queued assignment. */
  const assignmentControllers = new Map<string, AbortController>();
  /**
   * WR-04: attempts the leader has retired. A parked dispatch that wakes after the amend
   * must not settle the agent — that would release the batch's deferred before the
   * replacement ran. The terminal write is already guarded by `from: 'queued'`; this guards
   * the in-memory settle, which has no such guard.
   */
  const retiredAssignmentIds = new Set<string>();
  /** D-07/D-05: the per-team scheduler — the ONLY rule deciding how many agents run. */
  const scheduler = createTeamRunScheduler(
    team.concurrencyLimit ?? DEFAULT_TEAM_CONCURRENCY
  );
  /**
   * D-10/D-11: agentId → its current assignment id, registered at CREATION time. A queued
   * assignment has no runtime and no `activeAssignmentByAgent` entry, so this map is the only
   * way a stop can find what to cancel.
   */
  const assignmentIdsByAgent = new Map<string, string>();
  const agents = new Map<string, AgentRunState>();
  const reports = new Map<string, string>();
  const listeners = new Set<() => void>();

  let pendingPlan: AssignmentPlan | null = null;
  let lastPlan: AssignmentPlan | null = null;
  let lastPlanDecision: 'approved' | 'rejected' | null = null;
  let planResolver: ((approved: boolean) => void) | null = null;
  let pendingApproval: ChatTurnApprovalInfo | null = null;
  let batchIndex = 0;
  let lastUserRequest = '';
  // D-03 / AIO-TEAM-03: a later batch's employees see the previous batch's settled
  // reports. Same-batch peers stay isolated — no mid-batch barrier.
  let priorBatchResults: BatchResult[] = [];

  const agentGates = new Map<string, BudgetGate>();
  const teamGate = createBudgetGate();

  const memberIds = new Map<string, string>();
  const memberBudgets = new Map<string, number>();
  const memberUsed = new Map<string, number>();
  const lastBuckets = new Map<string, number>();
  let membersLoaded = false;

  const usageTotals = new Map<string, number>();
  let teamUsed = 0;
  let teamBudget = team.budgetTokens;
  let lastTeamBucket = 0;

  const currentRequests = new Map<string, ChatTurnRequest>();
  const agentDeferreds = new Map<string, Deferred>();
  /** D-13: agents whose live-use claim is currently held (pairing guard for release). */
  const liveAgents = new Set<string>();
  /**
   * D-10/D-11: agents the user stopped, and WHY. `settleAgent` can be called by the settle
   * path too, so the UI state alone cannot prove who stopped the turn — this marker can, and
   * the value is the stop reason both racing writers must record, so the row can never end
   * with one path's reason and the other path's status. IN-07: a teardown (delete / app
   * exit) writes its OWN reason here, so the ledger agrees with the batch row.
   */
  const userStopped = new Map<string, AiTeamAssignmentStopReason>();
  /**
   * IN-07: the teardown reason, when one happened. `dispose()` marks the agents it can SEE,
   * but an assignment created just after it (or one whose marker was cleared by its turn's
   * start) still owes the ledger this reason instead of the generic `user-abort`.
   *
   * Only `team-deleted` is an assignment `stopReason` (D-22 union). `app-exit` has no
   * assignment-level value and adding one would change the backup schema, so an app exit
   * keeps `user-abort` on the attempt rows while the BATCH row carries `abortedBy:
   * 'app-exit'` — the exit fact lives where the union can express it.
   */
  let disposeCause: 'team-deleted' | null = null;
  /** T-37-22: agents with a retry in flight, so a double click cannot append a third row. */
  const retryingAgents = new Set<string>();
  /** Same guard keyed by assignment id, set BEFORE any await so a double click cannot race. */
  const retryingAssignments = new Set<string>();
  /** Latest synthesis row written by the runtime, so a retry can supersede its predecessor. */
  let lastSynthesisMessageId: string | null = null;
  /**
   * 37.1 D-03/D-28: steer rows persisted but not yet read by the leader. Live-session
   * only — the durable "undelivered" state is derived from the ledger (D-14).
   */
  const pendingSteerMessageIds = new Set<string>();
  /**
   * 37.1 D-03/D-28: steer ids already injected into an attempt's prompt this session. The
   * ledger field is the durable "delivered" marker and is never cleared (D-25/D-14), so this
   * set is what stops a second round boundary from re-injecting the same text.
   */
  const injectedSteerIdsByAttempt = new Map<string, Set<string>>();

  const notify = () => {
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        /* a subscriber must never break the run */
      }
    }
  };

  /**
   * D-18: the single phase writer. A write that lands after `dispose()` resolved would
   * resurrect a dead run (the in-flight `send()` is still unwinding), so it is dropped —
   * and dropping it drops the `notify()` with it.
   */
  const setPhase = (next: TeamRunPhase): void => {
    if (disposed) return;
    phase = next;
    notify();
  };

  const registry: TeamRunRegistry = createTeamRunRegistry((agentId) =>
    buildRuntimeDeps(agentId)
  );

  const teamTurnId = `team:${teamId}`;
  const agentTurnId = (agentId: string) => `team:${teamId}:agent:${agentId}`;

  /**
   * D-24: serializes lead turns on the one lead runtime. A rejected task must not break the
   * chain for the next turn, so both arms continue it.
   */
  function runLeadTurnSerialized(task: () => Promise<void>): Promise<void> {
    leadTurnChain = leadTurnChain.then(task, task).catch(() => {});
    return leadTurnChain;
  }

  function gateFor(agentId: string): BudgetGate {
    let gate = agentGates.get(agentId);
    if (!gate) {
      gate = createBudgetGate();
      agentGates.set(agentId, gate);
    }
    return gate;
  }

  function updateAgent(agentId: string, patch: Partial<AgentRunState>): void {
    const existing: AgentRunState = agents.get(agentId) ?? {
      agentId,
      status: 'queued',
      streamingText: '',
    };
    agents.set(agentId, { ...existing, ...patch });
    notify();
  }

  /**
   * 37.1 D-22: one live step for the indicator popover. Capped at 6 — the popover is a
   * glance, not a log — and a repeated label is dropped so a `streaming` status that fires
   * per token cannot grow the snapshot or force a re-render per delta.
   */
  function pushStep(agentId: string, label: string): void {
    const state = agents.get(agentId);
    if (!state) return;
    const steps = state.steps ?? [];
    if (steps[steps.length - 1]?.label === label) return;
    stepSeq += 1;
    const next = [...steps, { id: 'step-' + stepSeq, label, at: new Date().toISOString() }];
    updateAgent(agentId, { steps: next.slice(-6) });
  }

  /**
   * WR-04: `attemptId` makes the settle identity-aware. A rewritten assignment's old parked
   * dispatch can wake AFTER the replacement is registered; settling then would overwrite the
   * replacement's `queued`/`running` state and release ITS deferred, so the batch would
   * synthesize before the replacement finished. A settle for a superseded attempt is dropped.
   */
  function settleAgent(
    agentId: string,
    status: AgentRunStatus,
    report?: string,
    attemptId?: string
  ): void {
    if (attemptId !== undefined) {
      const current = assignmentIdsByAgent.get(agentId);
      if (current !== undefined && current !== attemptId) return;
    }
    const state = agents.get(agentId);
    // WR-01: the status write and the deferred release are independent — a settle that
    // lands on an already-terminal agent must still release the batch's await.
    if (state && !TERMINAL_STATUSES.includes(state.status)) {
      agents.set(agentId, {
        ...state,
        status,
        ...(status === 'stopped' ? { incomplete: true } : {}),
      });
      if (report !== undefined) reports.set(agentId, report);
      // `finishTurn`'s default final status is the completed one; only the two failure
      // outcomes need naming.
      if (status === 'error') aiTurnManager.finishTurn(agentTurnId(agentId), 'error');
      else if (status === 'stopped') aiTurnManager.finishTurn(agentTurnId(agentId), 'aborted');
      else aiTurnManager.finishTurn(agentTurnId(agentId));
    }
    releaseLiveUse(agentId);
    agentDeferreds.get(agentId)?.resolve();
    agentDeferreds.delete(agentId);
    notify();
  }

  /** D-13: claim the profile (and skill) a turn is about to run with. */
  function claimLiveUse(agentId: string, skillId: string | undefined): void {
    if (liveAgents.has(agentId)) return;
    liveAgents.add(agentId);
    beginTurn(agentId, skillId ? [skillId] : []);
  }

  /** Paired with `claimLiveUse`: a double settle must not decrement twice. */
  function releaseLiveUse(agentId: string): void {
    if (!liveAgents.delete(agentId)) return;
    endTurn(agentId);
  }

  /**
   * D-09/D-22: THE terminal writer for one attempt — the single place a report row's link
   * fields reach their terminal values and the only caller of the attempt's terminal
   * `transitionAssignment`.
   *
   * Round-2 design wrote the ledger id in one step and decided on it in another, so a
   * stop/settle race produced two report rows. One `rw` transaction over BOTH tables closes
   * that window: Dexie serializes overlapping transactions, so a losing concurrent caller
   * observes the winner's terminal status, inserts nothing and reuses `reportMessageId`.
   *
   * `from` is the attempt's ACTUAL prior status (`'queued'` before `start()`, `'running'`
   * after), so the guard rejects a caller that lost the race instead of patching twice.
   */
  async function finalizeAttempt(
    assignmentId: string,
    from: AiTeamAssignmentRunStatus,
    to: 'done' | 'stopped' | 'error' | 'skipped',
    stopReason: AiTeamAssignmentStopReason,
    contentWhenMissing?: string,
    diagnosticDetail?: string
  ): Promise<AiTeamAssignment | null> {
    const threadId = options.threadId;
    // Only the caller that actually committed the terminal write notifies; a losing
    // concurrent caller must not emit a second `message_saved` for the same commit.
    let committed = false;

    const finalized = await db.transaction(
      'rw',
      [db.chatMessages, db.aiTeamAssignments],
      async (): Promise<AiTeamAssignment | null> => {
        const row = await db.aiTeamAssignments.get(assignmentId);
        // A vanished row (team deleted mid-run) writes nothing — there is no ledger to link.
        if (!row) return null;

        let reportId = row.reportMessageId;
        if (row.runStatus !== from) {
          // Lost the race: the winner already wrote the terminal row (and usually the row's
          // id). Report what is stored; never insert a second message.
          return row.runStatus === 'done' || row.runStatus === 'stopped' || row.runStatus === 'error'
            ? row
            : null;
        }

        if (reportId === undefined) {
          if (contentWhenMissing === undefined) {
            // `done` normally has a runtime row. If it does not, a bubble is still better
            // than silence (D-13), but the missing copy is a programming error, not a state.
            throw new Error(`finalizeAttempt: missing report content for ${assignmentId}`);
          }
          reportId = generateId();
          await insertReportMessage(
            {
              id: reportId,
              threadId,
              content: contentWhenMissing,
              createdAt: new Date().toISOString(),
              agentId: row.agentId,
              agentName: row.agentName,
              batchId: row.batchId,
              assignmentId: row.id,
              attemptNo: row.attemptNo,
              runStatus: to,
              stopReason,
              incomplete: to !== 'done',
            },
            db
          );
        } else {
          // The runtime saved this row through `saveMessage` and the override stamped
          // `runStatus: 'running'` as its INITIAL value. Exactly three fields are superseded;
          // `content` (the runtime's clean text) and `supersededByMessageId` (37-07) are not.
          await db.chatMessages.update(reportId, {
            runStatus: to,
            stopReason,
            incomplete: to !== 'done',
          });
        }

        // D-09: the one status writer, composed INSIDE this transaction so its get/put join
        // the outer `rw` lock. `reportMessageId` must be carried or the re-read drops it.
        const transitioned = await transitionAssignment(
          assignmentId,
          from,
          to,
          {
            endedAt: new Date().toISOString(),
            stopReason,
            reportMessageId: reportId,
            incomplete: to !== 'done',
            ...(diagnosticDetail !== undefined ? { diagnosticDetail } : {}),
          },
          db
        );
        if (transitioned !== null) committed = true;
        return transitioned;
      }
    );

    if (committed) {
      // After the commit, never inside it: one owner, and the row and the notification
      // carry the same `threadId` value.
      notifyAIChatSync({ type: 'message_saved', threadId });
    }
    // The `userStopped` marker is cleared only when that agent starts its NEXT turn: the
    // stop path and the settle path race to finalize, and both must map to `stopped`.
    // WR-07: unlink only when the stored entry is STILL this attempt. A late finalize of
    // attempt 1 must not remove attempt 2's link — that would save attempt 2's report with
    // no link fields and then read its `done` as the missing-report error.
    if (finalized !== null) {
      const active = activeAssignmentByAgent.get(finalized.agentId);
      if (active?.assignmentId === finalized.id) {
        activeAssignmentByAgent.delete(finalized.agentId);
      }
    }
    return finalized;
  }

  function toolContext(agentId: string): TeamToolContext {
    const employee = roster.employees.find((row) => row.id === agentId);
    const skillId = employee?.skillId;
    return {
      db,
      teamId,
      threadId: options.threadId,
      agentId,
      ...(skillId ? { skillId } : {}),
    };
  }

  function skillFor(employee: AiEmployee): AiSkill | undefined {
    return employee.skillId
      ? roster.skills.find((row) => row.id === employee.skillId)
      : undefined;
  }

  function leadTools(): AiToolDefinition[] {
    // CR-04 / D-13: the lead is the only agent allowed to mutate, so its payload must
    // actually advertise the mutation tools — the runtime parks each one on the
    // approval card. Without them the prompt promises writes the payload forbids.
    const reads = getToolsForTurn(true, options.mcpTools ?? [], LEAD_TOOL_ALLOWLIST);
    const advertised = new Set(reads.map((tool) => normalizeToolName(tool.function.name)));
    const mutations = AI_DATABASE_TOOLS.filter(
      (tool) =>
        isMutationTool(tool.function.name) &&
        !advertised.has(normalizeToolName(tool.function.name))
    );
    return [...reads, ...mutations, ...TEAM_TOOL_DEFINITIONS];
  }

  function employeeTools(): AiToolDefinition[] {
    return [...getToolsForTurn(true, [], EMPLOYEE_READ_ONLY_ALLOWLIST), ...EMPLOYEE_TEAM_TOOLS];
  }

  /**
   * Three-tier dispatch. Tier 1 is the only place `delegate_batch` is ever executed; tier 2
   * keeps every other advertised team tool out of the dynamic-MCP fall-through.
   */
  function makeExecuteToolFn(agentId: string) {
    return async (
      name: string,
      args: Record<string, any>,
      toolDb: TaskPlannerDatabase,
      signal?: AbortSignal
    ): Promise<string> => {
      const normalized = normalizeToolName(name);
      const ctx = toolContext(agentId);

      if (normalized === 'delegate_batch') {
        if (!roster.lead || agentId !== roster.lead.id) return EMPLOYEE_DELEGATE_REFUSAL;
        const assignments = Array.isArray(args?.assignments) ? args.assignments : [];
        return dispatchBatch(assignments, signal);
      }

      // 37.1 D-28: same lead-only shape as `delegate_batch`, but the coordinator — not the
      // validator — decides, because only it can check the live ledger.
      if (normalized === 'deliver_steer') {
        if (!roster.lead || agentId !== roster.lead.id) return EMPLOYEE_DELIVER_STEER_REFUSAL;
        const steerMessageId =
          typeof args?.steerMessageId === 'string' ? args.steerMessageId : '';
        return deliverSteer(steerMessageId);
      }

      // 37.1 D-27: the leader's one mid-run mutation. Same lead-only shape as `delegate_batch`.
      if (normalized === 'amend_assignments') {
        if (!roster.lead || agentId !== roster.lead.id) return EMPLOYEE_AMEND_REFUSAL;
        return amendAssignments(args ?? {});
      }

      if (TEAM_TOOL_NAMES.has(normalized)) {
        return executeTeamTool(name, args, ctx);
      }

      const request = currentRequests.get(agentId);
      return dispatchAiToolCall(name, args, toolDb, signal, {
        allowMutation: request?.autoApprove ?? false,
      });
    };
  }

  function buildRuntimeDeps(agentId: string): ChatTurnRuntimeDeps {
    const base = createDefaultChatTurnDeps(db);
    const overrides = options.createRuntimeDeps?.(agentId) ?? {};
    const innerRunLoop = overrides.runLoop ?? base.runLoop;
    const innerSaveMessage = overrides.saveMessage ?? base.saveMessage;

    return {
      ...base,
      ...overrides,
      db,
      // The runtime builds its own `executeToolFn`; the only seam that reaches it is the loop.
      runLoop: ((loopOptions) =>
        innerRunLoop({
          ...loopOptions,
          executeToolFn: makeExecuteToolFn(agentId),
        })) as ChatTurnRuntimeDeps['runLoop'],
      /**
       * D-22: TAG the row the runtime wrote — it is the report row for the active attempt.
       * `runStatus: 'running'` is the correct INITIAL value for the live render;
       * `finalizeAttempt` supersedes it with the terminal triple in the same transaction as
       * the assignment transition. `reportMessageId` is the durable idempotency key: without
       * it the `complete` path's row would be invisible to the terminal writer and it would
       * insert a duplicate. Only non-status fields are written, so D-09 is untouched.
       */
      saveMessage: (async (input: Parameters<typeof innerSaveMessage>[0], inputDb: any) => {
        const row = await innerSaveMessage(input, inputDb ?? db);
        // D-12/T-37-25: remember the synthesis row so a re-synthesis can mark it superseded.
        if (input.role === 'assistant' && input.messageKind === 'synthesis') {
          lastSynthesisMessageId = row.id;
        }
        const active = activeAssignmentByAgent.get(agentId);
        if (!active || input.role !== 'assistant' || input.messageKind !== 'report') {
          return row;
        }
        // One transaction so this stamp and a racing `finalizeAttempt` cannot interleave:
        // Dexie serializes `rw` scopes, so either the attempt is still live here (stamp, and
        // the terminal writer patches THIS row) or it already settled (this row arrived after
        // the terminal one — drop it, or the attempt would own two report bubbles).
        await db.transaction('rw', [db.chatMessages, db.aiTeamAssignments], async () => {
          const assignment = await db.aiTeamAssignments.get(active.assignmentId);
          const settled =
            !assignment ||
            assignment.reportMessageId !== undefined ||
            TERMINAL_RUN_STATUSES.has(assignment.runStatus);
          if (settled) {
            await db.chatMessages.delete(row.id);
            return;
          }
          await db.chatMessages.update(row.id, {
            batchId: active.batchId,
            assignmentId: active.assignmentId,
            attemptNo: active.attemptNo,
            runStatus: 'running',
            stopReason: 'none',
          });
          await db.aiTeamAssignments.update(active.assignmentId, {
            reportMessageId: row.id,
          });
        });
        return row;
      }) as ChatTurnRuntimeDeps['saveMessage'],
      onDelta: (delta) => {
        const state = agents.get(agentId);
        if (!state) return;
        updateAgent(agentId, { streamingText: state.streamingText + delta });
      },
      // 37.1 D-22: the popover's live steps. Only three statuses say anything a user would
      // repeat back; the rest are runtime bookkeeping.
      onStatus: (status) => {
        const label =
          status === 'streaming'
            ? 'đang viết'
            : status === 'synthesizing'
              ? 'đang tổng hợp'
              : status === 'preparing'
                ? 'đang chuẩn bị'
                : null;
        if (label) pushStep(agentId, label);
      },
      // A tool result is noise at this altitude; only the call is a step.
      onToolEvent: (event) => {
        if (event.phase !== 'call') return;
        pushStep(agentId, event.name === 'read_skill' ? 'đã đọc skill' : 'đang gọi tool ' + event.name);
      },
      onCompleted: ({ content }) => settleAgent(agentId, 'done', content),
      onError: () => settleAgent(agentId, 'error', SANITIZED_TURN_ERROR),
      onUsage: (usage) => handleUsage(agentId, usage, usageBaselineKey.get(agentId) ?? agentId),
      onAwaitingApproval: (info) => {
        pendingApproval = info;
        setPhase('awaiting-mutation-approval');
      },
    };
  }

  /**
   * Budget/usage hydrate from persisted member rows. Runs once per turn when the
   * `loadRoster` seam supplies membership (see `applyRosterMembership`), and once per
   * coordinator on the legacy path. Membership itself is the caller's decision.
   */
  async function hydrateBudgets(): Promise<AiTeamMember[]> {
    const rows = await listTeamMembers(teamId, db);
    for (const row of rows) {
      memberBudgets.set(row.agentId, row.budgetTokens);
      memberUsed.set(row.agentId, row.usedTokens);
      lastBuckets.set(row.agentId, bucketOf(row.usedTokens, row.budgetTokens));
    }
    // CR-01: the persisted team row is the budget authority once a turn supplies it.
    // Without this a budget edited in another tab (or restored) is ignored, and a
    // name-only group (budget 0) closes the gate before the first turn.
    const persistedBudget = roster.teamRow?.budgetTokens;
    if (persistedBudget !== undefined) teamBudget = persistedBudget;
    // CR-05: the team total must hydrate from persisted usage too, otherwise a
    // reactivated team starts over with a full budget. A team that is already past
    // the threshold starts parked — the crossing rule only fires on a change, so
    // seeding the bucket alone would leave the gate open.
    teamUsed = rows.reduce((sum, row) => sum + row.usedTokens, 0);
    lastTeamBucket = bucketOf(teamUsed, teamBudget);
    if (lastTeamBucket >= 8) {
      teamGate.close();
      // CR-01: a closed gate with no banner is an invisible hang. Surface the park.
      setPhase('awaiting-budget');
    }
    return rows;
  }

  async function ensureMembers(): Promise<void> {
    if (membersLoaded) return;
    const rows = await hydrateBudgets();
    for (const row of rows) memberIds.set(row.agentId, row.id);
    membersLoaded = true;
  }

  /**
   * D-08 blocker fix: with a `loadRoster` seam, membership comes from the turn's snapshot,
   * not from a construction-lifetime cache. `ensureMembers()`'s early return would otherwise
   * keep a de-rostered agent mentionable forever.
   */
  function applyRosterMembership(rows: AiTeamMember[]): void {
    const live = new Set(roster.memberAgentIds);
    memberIds.clear();
    memberBudgets.clear();
    for (const row of rows) {
      if (!live.has(row.agentId)) continue;
      // The value is the member row id, which `addUsedTokens` needs.
      memberIds.set(row.agentId, row.id);
      memberBudgets.set(row.agentId, row.budgetTokens);
    }
    membersLoaded = true;
  }

  /**
   * D-24: `accountingKey` identifies the TURN that reported, so two lead turns in one batch
   * each get their own baseline. Everything user-facing (member totals, buckets, gates) stays
   * keyed by the real `agentId`.
   */
  function handleUsage(agentId: string, usage: ChatTokenUsage, accountingKey: string): void {
    const total = normalizeUsageTotal(usage);
    const previousTotal = usageTotals.get(accountingKey) ?? 0;
    const delta = total - previousTotal;
    if (delta <= 0) return;
    usageTotals.set(accountingKey, total);
    teamUsed += delta;

    const used = (memberUsed.get(agentId) ?? 0) + delta;
    memberUsed.set(agentId, used);
    const current = bucketOf(used, memberBudgets.get(agentId) ?? 0);
    const previous = lastBuckets.get(agentId) ?? 0;
    lastBuckets.set(agentId, current);
    // D-20: pause, never abort. The turn parks at its next tool-round boundary.
    // WR-04: a late usage chunk after settle must not flip a ready coordinator back to
    // awaiting-budget with nothing parked.
    const anyLive = () =>
      [...agents.values()].some((row) => !TERMINAL_STATUSES.includes(row.status));

    if (shouldNotifyPause(previous, current)) {
      gateFor(agentId).close();
      const state = agents.get(agentId);
      if (state && !TERMINAL_STATUSES.includes(state.status)) {
        updateAgent(agentId, { status: 'paused' });
      }
      if (anyLive()) {
        setPhase('awaiting-budget');
      }
    }

    const teamCurrent = bucketOf(teamUsed, teamBudget);
    if (shouldNotifyPause(lastTeamBucket, teamCurrent)) {
      teamGate.close();
      if (anyLive()) {
        setPhase('awaiting-budget');
      }
    }
    lastTeamBucket = teamCurrent;

    const memberId = memberIds.get(agentId);
    if (memberId) {
      void addUsedTokens(memberId, delta, db).catch(() => {
        /* usage accounting must never break a turn */
      });
    }
  }

  function registerTeamTurn(): void {
    aiTurnManager.registerTurn({
      id: teamTurnId,
      scopeKey: teamId,
      title: liveTeam.name,
      status: 'preparing',
      streamingStatusLabel: null,
      abort: () => abortAll(),
    });
  }

  function registerAgentTurn(agentId: string, name: string): void {
    aiTurnManager.registerTurn({
      id: agentTurnId(agentId),
      scopeKey: teamId,
      title: name,
      status: 'preparing',
      streamingStatusLabel: null,
      abort: () => stopAgent(agentId),
    });
  }

  async function loadLinkedItems(): Promise<LinkedItemIndexEntry[]> {
    if (!roster.lead) return [];
    try {
      const raw = await executeTeamTool('list_linked_items', {}, toolContext(roster.lead.id));
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((item: any) => ({
        itemId: String(item.itemId),
        itemType: String(item.itemType),
        name: String(item.name ?? item.itemId),
      }));
    } catch {
      return [];
    }
  }

  function beforeToolRoundFor(agentId: string, attempt?: AttemptRef, skipSteerIds?: Set<string>) {
    // D-21 / Pitfall 8: the loop's own signal reaches both gates, so a Stop while parked
    // rejects instead of hanging. The trailing throw covers a hook that resolved post-abort.
    // 37.1 D-09: the drain runs AFTER the gates — a parked agent must not consume its steer
    // while paused — and its returned messages are appended by the loop.
    return async (
      _round: number,
      signal: AbortSignal
    ): Promise<ChatCompletionMessage[] | void> => {
      await gateFor(agentId).wait(signal);
      await teamGate.wait(signal);
      signal.throwIfAborted();
      return roster.lead && agentId === roster.lead.id
        ? drainLeaderSteerQueue(skipSteerIds)
        : drainSteerInbox(agentId, attempt);
    };
  }

  /** The ledger identity of one attempt, when the turn is a delegated assignment. */
  interface AttemptRef {
    batchId: string;
    assignmentId: string;
    attemptNo: number;
    /** Reused from the source row on a retry, so one instruction pairs with every attempt. */
    instructionMessageId?: string | undefined;
  }

  /** D-22 content for the insert branch: sanitized, never provider text (D-17). */
  function reportContentFor(outcome: ChatTurnOutcome): string | undefined {
    if (outcome.phase === 'complete') return undefined;
    // `cancelled` covers a declined proposal and a read-only refusal; the runtime already
    // sanitized the richer copy, so use it when present.
    if (outcome.phase === 'cancelled') {
      return outcome.cancellationResult ?? STOPPED_REPORT_COPY;
    }
    if (outcome.phase === 'aborted') return STOPPED_REPORT_COPY;
    return SANITIZED_TURN_ERROR;
  }

  /** D-17: the technical detail is bounded and goes to the ledger row only. */
  function diagnosticFor(outcome: ChatTurnOutcome): string | undefined {
    if (outcome.phase !== 'error') return undefined;
    const code = outcome.error?.code ?? 'provider';
    return boundedDiagnostic(new Error(code));
  }

  async function startEmployeeTurn(
    employee: AiEmployee,
    instruction: string,
    originalRequest: string,
    batchResults?: readonly BatchResult[],
    attempt?: AttemptRef
  ): Promise<void> {
    // Created first so a throw anywhere below still has a release target (Pitfall 7).
    if (!agentDeferreds.has(employee.id)) {
      agentDeferreds.set(employee.id, createDeferred());
    }

    try {
      const [assignmentHistory, recentTurns] = await Promise.all([
        listAssignmentHistory(options.threadId, employee.id, ASSIGNMENT_HISTORY_CAP, db),
        listRecentTurns(options.threadId, RECENT_WINDOW_TURNS, db),
      ]);
      const skill = skillFor(employee);
      const prompt = buildEmployeeTurnRequest({
        employee,
        ...(skill ? { skill } : {}),
        team: liveTeam,
        instruction,
        originalRequest,
        ...(batchResults && batchResults.length > 0 ? { batchResults } : {}),
        assignmentHistory,
        recentTurns,
      });

      const request: ChatTurnRequest = {
        ...prompt,
        threadId: options.threadId,
        scopeKey: 'team:' + teamId,
        endpoint: options.endpoint,
        apiKey: options.apiKey,
        model: employee.model || options.model,
        analysisMode: true,
        autoApprove: false,
        tools: employeeTools(),
        mutationPolicy: 'read-only',
        persistUserMessage: false,
        agentKind: 'employee',
        messageKind: 'report',
        agentId: employee.id,
        agentName: employee.name,
        beforeToolRound: beforeToolRoundFor(employee.id, attempt),
      };

      currentRequests.set(employee.id, request);
      userStopped.delete(employee.id);
      // CR-01: each turn's usage total restarts at zero, so the cumulative baseline
      // must reset too — otherwise the second turn's delta is zero or negative.
      // D-24: the baseline is keyed per TURN, so a still-running turn's key is never deleted.
      employeeTurnSeq += 1;
      const accountingKey = `${employee.id}:${employeeTurnSeq}`;
      usageBaselineKey.set(employee.id, accountingKey);
      usageTotals.delete(accountingKey);
      // D-13: the batch's employees are only known here, so this is where they claim live use.
      claimLiveUse(employee.id, employee.skillId);
      updateAgent(employee.id, {
        status: 'running',
        streamingText: '',
        startedAt: new Date().toISOString(),
        steps: [],
      });
      registerAgentTurn(employee.id, employee.name);

      if (attempt) {
        // D-09: the one status writer moves queued -> running immediately before the turn.
        // WR-03: `null` means the row is no longer `queued` — a leader amend retired it while
        // this task was parked past its last ledger read. Running the turn anyway would spend
        // tokens on an attempt whose report is dropped by `saveMessage`'s settled guard.
        const started = await transitionAssignment(
          attempt.assignmentId,
          'queued',
          'running',
          { startedAt: new Date().toISOString() },
          db
        );
        if (started === null) throw new DOMException('Aborted', 'AbortError');
        // D-22/D-09: a non-status field, written at START time (describes when the attempt
        // began, not how it ended) — outside the terminal transaction by design.
        if (attempt.instructionMessageId !== undefined) {
          await db.aiTeamAssignments.update(attempt.assignmentId, {
            instructionMessageId: attempt.instructionMessageId,
          });
        }
        activeAssignmentByAgent.set(employee.id, {
          batchId: attempt.batchId,
          assignmentId: attempt.assignmentId,
          attemptNo: attempt.attemptNo,
        });
      }

      const outcome = await registry.get(employee.id).start(request);
      const state = agents.get(employee.id);
      // A parked loop cannot resolve `start()`; if the state is still paused the deferred is
      // the authority, so the batch keeps waiting (D-30). Stop/abort ledger writes for a
      // parked attempt belong to the stop path (37-04), not here.
      if (state && state.status === 'paused') {
        await agentDeferreds.get(employee.id)?.promise;
        return;
      }
      settleAgent(employee.id, OUTCOME_STATUS[outcome.phase], undefined, attempt?.assignmentId);
      if (attempt) {
        // The ONE terminal writer. On `complete` the runtime already saved the report row
        // through `deps.saveMessage`, so this takes the existing-row patch branch (and its
        // `runStatus: 'running'` stamp is superseded); every other outcome returned before
        // that save and gets a sanitized row inserted here (D-13).
        //
        // A Stop that landed while this turn was unwinding already settled the agent, so the
        // ledger must record what the user saw — never a `done` for a turn they stopped.
        const stopReasonByUser = userStopped.get(employee.id);
        const runStatus = stopReasonByUser ? 'stopped' : OUTCOME_RUN_STATUS[outcome.phase];
        const stopReason = stopReasonByUser ?? OUTCOME_STOP_REASON[outcome.phase];
        await finalizeAttempt(
          attempt.assignmentId,
          'running',
          runStatus,
          stopReason,
          reportContentFor(outcome) ?? (runStatus === 'done' ? undefined : STOPPED_REPORT_COPY),
          diagnosticFor(outcome)
        );
      }
    } catch (err) {
      // D-16/T-37-08: a throw must settle the agent AND its ledger row, never hang the batch.
      releaseLiveUse(employee.id);
      // WR-03: a retired row's own dispatch neither starts nor settles — the amend path owns
      // the terminal write and the replacement's live state. Settling here would race the
      // replacement's `queued` state with a phantom `error`.
      if (attempt && retiredAssignmentIds.has(attempt.assignmentId)) {
        // CR-01: `onBatchSettled` awaits this agent's deferred. The amend path owns the
        // terminal write, but leaving the deferred unresolved hangs the batch forever — no
        // synthesis, `openBatchId` stuck, phase stuck `batch-running`, and `dispose()` cannot
        // unblock it. Release it without settling: the amend path's replacement dispatch
        // registers its own deferred, and the ledger poll covers the gap. If the amend path
        // refuses instead (create throw), it settles the agent itself.
        agentDeferreds.get(employee.id)?.resolve();
        agentDeferreds.delete(employee.id);
        throw err;
      }
      try {
        if (attempt) {
          // `from` must be a literal status, so read the row and branch rather than passing
          // whatever it happens to hold: an already-terminal row must not be re-finalized.
          const current = (await getAssignment(attempt.assignmentId, db))?.runStatus;
          if (current === 'queued') {
            await finalizeAttempt(
              attempt.assignmentId,
              'queued',
              'error',
              'provider',
              SANITIZED_TURN_ERROR,
              boundedDiagnostic(err)
            );
          } else if (current === 'running') {
            await finalizeAttempt(
              attempt.assignmentId,
              'running',
              'error',
              'provider',
              SANITIZED_TURN_ERROR,
              boundedDiagnostic(err)
            );
          }
        }
      } finally {
        settleAgent(employee.id, 'error', SANITIZED_TURN_ERROR, attempt?.assignmentId);
      }
      throw err;
    } finally {
      // Pitfall 7: no deferred outlives its turn. `settleAgent` normally removed it already.
      agentDeferreds.delete(employee.id);
    }
  }

  async function startLeadTurn(
    text: string,
    batchResults?: readonly BatchResult[]
  ): Promise<void> {
    // D-05: an empty group has no lead — a silent no-op, not a throw.
    const lead = roster.lead;
    if (!lead) return;
    try {
      const [recentTurns, linkedItems] = await Promise.all([
        listRecentTurns(options.threadId, RECENT_WINDOW_TURNS, db),
        loadLinkedItems(),
      ]);
      const prompt = buildLeadTurnRequest({
        lead,
        team: roster.teamRow ?? team,
        roster: roster.employees,
        linkedItems,
        originalRequest: text,
        recentTurns,
        ...(batchResults && batchResults.length > 0 ? { batchResults } : {}),
      });

      const request: ChatTurnRequest = {
        ...prompt,
        threadId: options.threadId,
        scopeKey: 'team:' + teamId,
        endpoint: options.endpoint,
        apiKey: options.apiKey,
        model: lead.model || options.model,
        analysisMode: true,
        autoApprove: liveTeam.autoApproveMutations === true,
        tools: leadTools(),
        mutationPolicy: 'approve',
        persistUserMessage: false,
        agentKind: 'lead',
        messageKind: 'synthesis',
        agentId: lead.id,
        agentName: lead.name,
        beforeToolRound: beforeToolRoundFor(lead.id),
      };

      currentRequests.set(lead.id, request);
      userStopped.delete(lead.id);
      // CR-01: same baseline reset as the employee path. D-24: keyed per turn, so the
      // dispatch turn's baseline survives the synthesis turn that follows it.
      leadTurnSeq += 1;
      const leadAccountingKey = `${lead.id}:${leadTurnSeq}`;
      usageBaselineKey.set(lead.id, leadAccountingKey);
      usageTotals.delete(leadAccountingKey);
      // D-13: leads have no skill, so the claim carries an empty skill list.
      claimLiveUse(lead.id, undefined);
      updateAgent(lead.id, {
        status: 'running',
        streamingText: '',
        startedAt: new Date().toISOString(),
        steps: [],
      });
      registerAgentTurn(lead.id, lead.name);
      setPhase('lead-thinking');

      const outcome = await registry.get(lead.id).start(request);
      const state = agents.get(lead.id);
      if (state && state.status === 'paused') {
        await agentDeferreds.get(lead.id)?.promise;
        return;
      }
      settleAgent(lead.id, OUTCOME_STATUS[outcome.phase]);
      if (phase === 'lead-thinking' || phase === 'lead-synthesizing') {
        setPhase('ready');
      }
    } catch (err) {
      // WR-01: same leak as the employee path — release before rethrowing. The lead is not
      // an assignment, so there is no ledger row to finalize here.
      releaseLiveUse(lead.id);
      setPhase('ready');
      settleAgent(lead.id, 'error');
      throw err;
    } finally {
      agentDeferreds.delete(lead.id);
    }
  }

  function parseMentionTarget(text: string): AiEmployee | null {
    const match = AGENT_MENTION.exec(text);
    if (!match) return null;
    const id = match[2];
    const employee = roster.employees.find((row) => row.id === id);
    if (!employee) return null;
    // AIO-TEAM-04: only this team's members are addressable. A non-member has no
    // aiTeamMembers row, so its budget is 0 and the turn would park forever.
    if (!memberIds.has(employee.id)) return null;
    return employee;
  }

  /**
   * 37.1 D-01/D-02/D-28: a submit while a turn is live is a STEER, not a refusal and not a
   * queued second turn. The row is persisted immediately — the leader always reads it —
   * and the leader decides whether the mentioned agent ever receives it (`deliver_steer`).
   *
   * `steer()` NEVER writes `steerMessageIds`: the leader is the gate (D-28). A direct write
   * here would hand the text to the agent before the leader judged it.
   */
  async function steer(text: string): Promise<'steered' | 'refused' | 'blocked'> {
    if (disposed) return 'blocked';
    const target = parseMentionTarget(text);
    // D-16: the leader always sees the message, so the row is persisted unconditionally.
    // D-15: a user row — never `agentId`/`agentName`, which would render an agent bubble.
    const row = await saveTeamMessage(
      {
        threadId: options.threadId,
        role: 'user',
        content: text,
        messageKind: 'steer',
        ...(target ? { targetAgentId: target.id } : {}),
        ...(openBatchId !== null ? { batchId: openBatchId } : {}),
      },
      db
    );
    // The persist already happened; `'blocked'` would duplicate the text in the composer.
    if (disposed) return 'steered';
    pendingSteerMessageIds.add(row.id);
    notify();

    if (!target) {
      void runLeadSteerTurn(text);
      return 'steered';
    }

    const assignmentId = assignmentIdsByAgent.get(target.id);
    const assignment = assignmentId ? await getAssignment(assignmentId, db) : undefined;
    // WR-03: the row is already persisted, so `'blocked'` would duplicate the text in the
    // composer (D-12's "keep the text" rule is about the nothing-was-written case). The
    // leader still reads it, so the honest outcome is `'steered'`.
    if (disposed) return 'steered';
    // D-11: the agent already settled. The row stays pending and the leader reports it
    // honestly; the leader turn still runs so the user gets an answer.
    if (
      !assignment ||
      (assignment.runStatus !== 'queued' && assignment.runStatus !== 'running')
    ) {
      void runLeadSteerTurn(text);
      return 'refused';
    }
    // D-28: write nothing to the assignment. The leader decides whether to `deliver_steer`.
    void runLeadSteerTurn(text);
    return 'steered';
  }

  /**
   * 37.1 D-09/D-17: drain the steers delivered to this attempt into its next round. The
   * caller runs this AFTER the budget gates, so a parked agent never consumes a steer while
   * paused.
   *
   * CR-04/CR-05: the ledger field is the DURABLE delivered marker (D-14/D-25) and is never
   * cleared — clearing it erased the "delivered" fact and made every consumed steer render
   * "chưa giao" forever. Re-injection inside one session is prevented by
   * `injectedSteerIdsByAttempt`, so the drain writes nothing and cannot lose a concurrent
   * `deliver_steer` (no read-modify-write on the array).
   */
  async function drainSteerInbox(
    _agentId: string,
    attempt?: AttemptRef
  ): Promise<ChatCompletionMessage[]> {
    if (!attempt) return [];
    const row = await getAssignment(attempt.assignmentId, db);
    const delivered = row?.steerMessageIds ?? [];
    if (delivered.length === 0) return [];
    const injected =
      injectedSteerIdsByAttempt.get(attempt.assignmentId) ?? new Set<string>();
    const fresh = delivered.filter((id) => !injected.has(id));
    if (fresh.length === 0) return [];
    // WR-01 (pass 6): claim the ids BEFORE the await. The settle-poll deadline reads this set
    // to decide which markers are safe to drop; claiming after `bulkGet` left a window where a
    // steer being read right now looked undrained and lost its marker.
    for (const id of fresh) injected.add(id);
    injectedSteerIdsByAttempt.set(attempt.assignmentId, injected);
    const messages = await db.chatMessages.bulkGet(fresh);
    // 37.1 SC5: a teardown must leave the ledger honest for the post-relaunch `undelivered`
    // read (D-14) — and must not consume a steer nobody read.
    if (disposed) {
      for (const id of fresh) injected.delete(id);
      return [];
    }
    notify();
    return messages
      .filter((message): message is ChatMessage => message !== undefined)
      .map((message) => ({ role: 'user' as const, content: STEER_PREFIX + message.content }));
  }

  /**
   * 37.1 D-16: the leader reads EVERY user message, including the ones addressed to an
   * agent. Draining at the round boundary is what makes that true for a steer that arrived
   * mid-turn.
   *
   * WR-01: `skipIds` are the ids already rendered in this turn's system prompt
   * (`[CHỈ ĐẠO CHỜ XỬ LÝ]`). Re-injecting them as user messages would make the leader read
   * one instruction twice and could double-apply an amend. They stay pending, so a turn that
   * never reads them re-injects them next time (CR-01).
   */
  async function drainLeaderSteerQueue(
    skipIds?: Set<string>
  ): Promise<ChatCompletionMessage[]> {
    const ids = [...pendingSteerMessageIds].filter((id) => skipIds?.has(id) !== true);
    if (ids.length === 0) return [];
    // SC5: gate the clearing write — a teardown must not consume a steer nobody read.
    if (disposed) return [];
    for (const id of ids) pendingSteerMessageIds.delete(id);
    notify();
    const messages = await db.chatMessages.bulkGet(ids);
    return messages
      .filter((message): message is ChatMessage => message !== undefined)
      .map((message) => ({ role: 'user' as const, content: STEER_PREFIX + message.content }));
  }

  /**
   * 37.1 D-28: the steer turn's tool list. Reads plus `deliver_steer` and `amend_assignments`
   * — the leader is the gate, so it must be able to see both. `delegate_batch` is deliberately
   * absent (a second batch would overwrite `openBatchId`).
   */
  function leadSteerTools(): AiToolDefinition[] {
    const reads = getToolsForTurn(true, options.mcpTools ?? [], LEAD_TOOL_ALLOWLIST);
    const leadToolsForSteer = TEAM_TOOL_DEFINITIONS.filter((tool) => {
      const name = normalizeToolName(tool.function.name);
      return name === 'deliver_steer' || name === 'amend_assignments';
    });
    return [...reads, ...leadToolsForSteer];
  }

  /** The pending steers as prompt rows, so the leader has a real id to pass to `deliver_steer`. */
  async function loadPendingSteers(): Promise<
    Array<{ id: string; content: string; targetAgentName?: string }>
  > {
    const ids = [...pendingSteerMessageIds];
    if (ids.length === 0) return [];
    const rows = await db.chatMessages.bulkGet(ids);
    return rows
      .filter((row): row is ChatMessage => row !== undefined)
      .map((row) => {
        const target = row.targetAgentId
          ? roster.employees.find((employee) => employee.id === row.targetAgentId)
          : undefined;
        return {
          id: row.id,
          content: row.content,
          ...(target ? { targetAgentName: target.name } : {}),
        };
      });
  }

  /**
   * 37.1 D-04/D-28: the lead re-plan turn a steer opens. It reads the live ledger, reports
   * where every agent is, and decides whether to deliver the steer.
   *
   * It never touches the phase, the plan resolver or the batch: the batch owns all of them.
   * Serialized through `runLeadTurnSerialized` so it can never overlap the synthesis turn.
   */
  async function runLeadSteerTurn(text: string): Promise<void> {
    if (disposed) return;
    const lead = roster.lead;
    if (!lead) return;
    await runLeadTurnSerialized(async () => {
      if (disposed) return;
      const [recentTurns, linkedItems, pendingSteers] = await Promise.all([
        listRecentTurns(options.threadId, RECENT_WINDOW_TURNS, db),
        loadLinkedItems(),
        loadPendingSteers(),
      ]);
      const ledger = openBatchId === null ? [] : await listBatchAssignments(openBatchId, db);
      if (disposed) return;
      // WR-01: these ids are about to be rendered in the system prompt, so the round-1
      // `beforeToolRound` drain must skip them — otherwise the leader reads the same
      // instruction twice (once as `[CHỈ ĐẠO CHỜ XỬ LÝ]`, once as `[Chỉ đạo từ người dùng]`)
      // and can double-apply an amend. They stay pending until a read outcome (CR-01).
      const promptSteerIds = new Set(pendingSteers.map((steer) => steer.id));
      const prompt = buildLeadTurnRequest({
        lead,
        team: roster.teamRow ?? team,
        roster: roster.employees,
        linkedItems,
        originalRequest: text,
        recentTurns,
        ledger,
        pendingSteers,
      });
      const request: ChatTurnRequest = {
        ...prompt,
        threadId: options.threadId,
        scopeKey: 'team:' + teamId,
        endpoint: options.endpoint,
        apiKey: options.apiKey,
        model: lead.model || options.model,
        analysisMode: true,
        autoApprove: liveTeam.autoApproveMutations === true,
        tools: leadSteerTools(),
        mutationPolicy: 'approve',
        persistUserMessage: false,
        agentKind: 'lead',
        messageKind: 'plan',
        agentId: lead.id,
        agentName: lead.name,
        beforeToolRound: beforeToolRoundFor(lead.id, undefined, promptSteerIds),
      };
      // WR-02: the steer turn is a real lead turn — its own usage baseline (D-13 bills the
      // read to the lead) and a live state, so the indicator shows the leader reading.
      // CR-01: `start()` throws `TURN_IN_PROGRESS` on a live lead runtime, and the running
      // turn's own round-boundary drain injects the pending steers (D-16). Claim nothing in
      // that case — every piece of prior state is restored below.
      const priorAgent = agents.get(lead.id);
      const priorRequest = currentRequests.get(lead.id);
      const priorTurn = aiTurnManager.getTurn(agentTurnId(lead.id));
      const priorAccountingKey = usageBaselineKey.get(lead.id);
      const alreadyLive = liveAgents.has(lead.id);
      currentRequests.set(lead.id, request);
      leadTurnSeq += 1;
      const leadAccountingKey = `${lead.id}:${leadTurnSeq}`;
      usageBaselineKey.set(lead.id, leadAccountingKey);
      usageTotals.delete(leadAccountingKey);
      claimLiveUse(lead.id, undefined);
      updateAgent(lead.id, {
        status: 'running',
        streamingText: '',
        startedAt: new Date().toISOString(),
        steps: [],
      });
      registerAgentTurn(lead.id, lead.name);
      let started = false;
      let steerStatus: AgentRunStatus = 'done';
      try {
        const outcome = await registry.get(lead.id).start(request);
        started = true;
        steerStatus = OUTCOME_STATUS[outcome.phase];
        // CR-01: the leader has now READ these — the "chờ leader đọc" badge clears here. A
        // steer that arrives after this point is picked up by `drainLeaderSteerQueue` at the
        // next round boundary instead. A failed turn keeps the ids pending (D-28: never
        // silently lost).
        if (
          outcome.phase === 'complete' ||
          outcome.phase === 'cancelled' ||
          outcome.phase === 'tool-limit'
        ) {
          for (const id of promptSteerIds) pendingSteerMessageIds.delete(id);
        }
      } catch {
        /* a steer turn must never break the batch; the ids stay pending */
      } finally {
        if (started && !disposed) {
          settleAgent(lead.id, steerStatus);
        } else if (!started) {
          // WR-02: this turn never registered one of its own, so restore the FULL prior
          // state — not just `status`. The running turn's live steps, streaming text and
          // request must survive, and the turn manager must not be finished (that would
          // purge the running turn's entry after 800 ms and drop it from the indicator).
          if (priorAccountingKey !== undefined) usageBaselineKey.set(lead.id, priorAccountingKey);
          else usageBaselineKey.delete(lead.id);
          if (!alreadyLive) releaseLiveUse(lead.id);
          if (priorRequest !== undefined) currentRequests.set(lead.id, priorRequest);
          else currentRequests.delete(lead.id);
          if (priorAgent !== undefined) agents.set(lead.id, priorAgent);
          else agents.delete(lead.id);
          if (priorTurn !== undefined) {
            aiTurnManager.registerTurn(priorTurn);
          } else {
            // No prior entry to restore: purge the one this turn registered, or the
            // indicator shows a lead turn that will never run (there is no plain delete).
            aiTurnManager.finishTurn(agentTurnId(lead.id), 'aborted');
          }
        }
      }
      notify();
      // SC5: a teardown during the turn must leave nothing behind for a new instance.
      if (disposed) return;
    });
  }

  /**
   * 37.1 D-28: the ONLY writer of `steerMessageIds`. Every check is against the live ledger —
   * the model's id is never trusted. Idempotent: a repeat call appends nothing.
   */
  async function deliverSteer(steerMessageId: string): Promise<string> {
    if (disposed) return DISPOSED_REFUSAL;
    const message = await db.chatMessages.get(steerMessageId);
    // WR-07: same cross-team read guard every other team tool enforces (T-34-07) — a
    // model-supplied id from another thread must never enter this team's agent prompt.
    if (message?.threadId !== options.threadId) {
      return JSON.stringify({
        refused: true,
        code: 'TURN_NOT_IN_TEAM',
        message: 'Không tìm thấy chỉ đạo hợp lệ để giao.',
      });
    }
    if (message.messageKind !== 'steer' || message.targetAgentId === undefined) {
      return JSON.stringify({
        refused: true,
        code: 'INVALID_ARGUMENT',
        message: 'Không tìm thấy chỉ đạo hợp lệ để giao.',
      });
    }
    const assignmentId = assignmentIdsByAgent.get(message.targetAgentId);
    const assignment = assignmentId ? await getAssignment(assignmentId, db) : undefined;
    if (
      !assignment ||
      assignment.batchId !== openBatchId ||
      (assignment.runStatus !== 'queued' && assignment.runStatus !== 'running')
    ) {
      return JSON.stringify({
        refused: true,
        code: 'NOT_QUEUED',
        message: 'Việc của nhân viên này không còn nhận chỉ đạo được nữa.',
      });
    }
    // CR-01: the steer row may have been persisted while no batch was open (the ordinary
    // "steer while the plan card is up" flow), so it carries no `batchId`. The workspace
    // derives delivery state by querying assignments on the STEER's `batchId`, so the batch
    // must be stamped onto the row here — this is the one place it is known. Same `rw` scope
    // as the append, so the marker and the delivery fact can never disagree.
    //
    // WR-01: the outer guard read the row two awaits ago, so the attempt can have settled or
    // the batch can have changed since. Re-validate INSIDE the transaction — a stamp on a
    // terminal/foreign row would report a delivery no `drainSteerInbox` can ever honour.
    const appended = await db.transaction(
      'rw',
      [db.aiTeamAssignments, db.chatMessages],
      async (): Promise<boolean | null> => {
        const live = await db.aiTeamAssignments.get(assignment.id);
        if (
          !live ||
          live.batchId !== openBatchId ||
          (live.runStatus !== 'queued' && live.runStatus !== 'running')
        ) {
          return null;
        }
        const current = live.steerMessageIds ?? [];
        // WR-02: the delivery marker lives on the assignment that was APPENDED, possibly in
        // an earlier batch. Re-stamping here would repoint the row at the current batch,
        // whose assignments do not carry the marker — the badge would say "chưa giao" again.
        if (current.includes(steerMessageId)) return false;
        await db.aiTeamAssignments.update(assignment.id, {
          steerMessageIds: [...current, steerMessageId],
        });
        await db.chatMessages.update(steerMessageId, { batchId: live.batchId });
        return true;
      }
    );
    if (appended === null) {
      return JSON.stringify({
        refused: true,
        code: 'NOT_QUEUED',
        message: 'Việc của nhân viên này không còn nhận chỉ đạo được nữa.',
      });
    }
    if (!appended) {
      return JSON.stringify({ delivered: true, duplicate: true, agentId: message.targetAgentId });
    }
    pendingSteerMessageIds.delete(steerMessageId);
    notify();
    return JSON.stringify({ delivered: true, agentId: message.targetAgentId });
  }

  /**
   * 37.1 D-06/D-07/D-08: the leader's ONE mid-run mutation — cancel or rewrite a `queued`
   * assignment, applied immediately. A `running` assignment is refused (only steer reaches
   * it), and the WHOLE list is refused when any row is not queued, so the leader's report
   * always matches the ledger (T-37.1-24).
   *
   * Both operations write through `finalizeAttempt` — the single terminal writer — so a
   * retired row always gets its report bubble and `listInterruptedAssignments` stays quiet
   * (T-37.1-22). Ledger membership is checked against `listBatchAssignments(openBatchId)`,
   * never `getAssignment` alone (T-37.1-20).
   */
  async function amendAssignments(rawArgs: Record<string, any>): Promise<string> {
    if (disposed) return DISPOSED_REFUSAL;
    const batchId = openBatchId;
    if (batchId === null) {
      return JSON.stringify({
        refused: true,
        code: 'ASSIGNMENT_NOT_IN_BATCH',
        message: 'Không có lô nào đang chạy.',
      });
    }
    // IN-04: the validator ignores its context, so pass the real lead id rather than
    // fabricating an empty caller. Tier-1 dispatch already proved the caller IS the lead.
    const validation = await executeTeamTool(
      'amend_assignments',
      rawArgs,
      toolContext(roster.lead!.id)
    );
    let parsed: any;
    try {
      parsed = JSON.parse(validation);
    } catch {
      return validation;
    }
    if (parsed?.refused === true) return validation;
    const operations: Array<{ op: 'cancel' | 'rewrite_task'; assignmentId: string; task?: string; reason?: string }> =
      Array.isArray(parsed?.operations) ? parsed.operations : [];

    const rows = await listBatchAssignments(batchId, db);
    const byId = new Map(rows.map((row) => [row.id, row]));
    // WR-09: a rewrite needs a live batch controller to dispatch its replacement. Without
    // one the row would sit `queued` forever and hang the settle poll, so refuse the WHOLE
    // list before mutating anything.
    const batchController = batchControllers.get(batchId);
    for (const operation of operations) {
      const row = byId.get(operation.assignmentId);
      if (!row) {
        return JSON.stringify({
          refused: true,
          code: 'ASSIGNMENT_NOT_IN_BATCH',
          message: 'Việc này không thuộc lô đang chạy.',
        });
      }
      if (row.runStatus !== 'queued') {
        return JSON.stringify({
          refused: true,
          code: 'NOT_QUEUED',
          message: 'Chỉ huỷ hoặc sửa được việc đang xếp hàng. Việc đang chạy chỉ nhận chỉ đạo.',
        });
      }
      // CR-03/WR-03/IN-01: a queued row can already hold delivered-but-undrained steers
      // (D-28). Neither amend op can carry them: a replacement row would not inherit them,
      // and a cancel ends the row — the badge derivation suppresses a terminal attempt, so a
      // steer the agent never read would render as delivered. Refuse BOTH while any steer is
      // pending; the leader must let the agent read it first (it drains on the first round of
      // its turn). A row that never starts is still ended by the settle-poll deadline.
      if ((row.steerMessageIds ?? []).length > 0) {
        return JSON.stringify({
          refused: true,
          code: 'STEER_PENDING',
          message:
            operation.op === 'rewrite_task'
              ? 'Việc này đang có chỉ đạo chưa đọc. Hãy để nhân viên nhận chỉ đạo trước khi sửa việc.'
              : 'Việc này đang có chỉ đạo chưa đọc. Hãy để nhân viên nhận chỉ đạo trước khi huỷ việc.',
        });
      }
      if (operation.op === 'rewrite_task' && batchController === undefined) {
        return JSON.stringify({
          refused: true,
          code: 'NOT_QUEUED',
          message: 'Lô đang chạy không còn nhận thay đổi. Hãy chờ lô kết thúc.',
        });
      }
      // CR-02: the roster check belongs in pre-validation, not the apply loop — a list of
      // [cancel A, rewrite_task B] must not cancel A and then report a total refusal.
      if (
        operation.op === 'rewrite_task' &&
        !roster.employees.some((candidate) => candidate.id === row.agentId)
      ) {
        return JSON.stringify({
          refused: true,
          code: 'AGENT_NOT_IN_ROSTER',
          message: 'Nhân viên không còn trong nhóm.',
        });
      }
    }
    // A dispose that landed during the reads above must not mutate a dead run.
    if (disposed) return DISPOSED_REFUSAL;

    // WR-04: pre-validation ran before several awaits, so a parked dispatch may have taken a
    // free slot and moved a row `queued -> running` since. Re-read the WHOLE list here, before
    // any mutation, so the all-or-nothing contract still holds (a mid-loop refusal would have
    // applied the earlier operations and then reported a total refusal).
    const liveById = new Map(
      (await listBatchAssignments(batchId, db)).map((row) => [row.id, row])
    );
    for (const operation of operations) {
      if (liveById.get(operation.assignmentId)?.runStatus !== 'queued') {
        return JSON.stringify({
          refused: true,
          code: 'NOT_QUEUED',
          message: 'Chỉ huỷ hoặc sửa được việc đang xếp hàng. Việc đang chạy chỉ nhận chỉ đạo.',
        });
      }
    }
    if (disposed) return DISPOSED_REFUSAL;

    const applied: Array<{ op: string; assignmentId: string; replacementId?: string }> = [];
    // WR-04: rows that lost the `queued -> running` race after pre-validation. Reported, not
    // silently dropped — the leader's report must match the ledger (T-37.1-24).
    const refused: Array<{ assignmentId: string; code: 'NOT_QUEUED' }> = [];
    // WR-02 (pass 6): a failed replacement write is a different cause from a lost race, so
    // the summary message must not claim the row started running.
    let createFailed = false;
    for (const operation of operations) {
      const row = byId.get(operation.assignmentId)!;

      if (operation.op === 'cancel') {
        // The marker goes in BEFORE the abort: the parked `dispatchAssignment` catch races
        // this finalize with `userStopped.get(...) ?? disposeCause ?? 'user-abort'`, and
        // whichever transaction commits first wins the `from: 'queued'` guard. `stopAgent`
        // sets the marker first for exactly this reason.
        userStopped.set(row.agentId, 'leader-amend');
        try {
          // WR-04: abort BEFORE the finalize, so a parked dispatch cannot start a turn the
          // abort could no longer stop. The whole-list re-read above proves every row was
          // still queued, and `finalizeAttempt`'s `from` guard keeps the ledger honest if one
          // went running in between (its own turn then owns the settle).
          assignmentControllers.get(row.id)?.abort();
          await finalizeAttempt(row.id, 'queued', 'stopped', 'leader-amend', AMENDED_REPORT_COPY);
          // WR-04: identity-aware — a replacement registered for this agent must not be
          // settled by the retired row's cancel.
          settleAgent(row.agentId, 'stopped', undefined, row.id);
          if (assignmentIdsByAgent.get(row.agentId) === row.id) {
            assignmentIdsByAgent.delete(row.agentId);
          }
        } finally {
          userStopped.delete(row.agentId);
        }
        applied.push({ op: 'cancel', assignmentId: row.id });
        continue;
      }

      // The roster check already passed in pre-validation, so this cannot be undefined.
      const employee = roster.employees.find((candidate) => candidate.id === row.agentId)!;
      // WR-04: retire the old attempt's controller BEFORE `createAssignment`. During that
      // await a parked dispatch can take a free slot and start a turn the abort could no
      // longer stop, which would leave two turns for one agent. Aborting first rejects the
      // parked `acquire`, so the row cannot transition behind our back. The `leader-amend`
      // marker goes in BEFORE the abort, so whichever writer wins the `from: 'queued'` guard
      // records the leader's reason rather than `user-abort`.
      userStopped.set(row.agentId, 'leader-amend');
      retiredAssignmentIds.add(row.id);
      assignmentControllers.get(row.id)?.abort();
      // Re-read after the abort: if the row still left `queued`, it is running and must not
      // be rewritten. Report it honestly instead of claiming an apply that did not happen.
      const liveRow = await getAssignment(row.id, db);
      if (liveRow?.runStatus !== 'queued') {
        userStopped.delete(row.agentId);
        retiredAssignmentIds.delete(row.id);
        refused.push({ assignmentId: row.id, code: 'NOT_QUEUED' });
        continue;
      }
      // WR-03: the finalize is the authoritative claim on the row. `null` means it left
      // `queued` between the re-read above and this write (a dispatch already past its own
      // ledger read). Dispatching a replacement then would start a SECOND turn for one agent
      // while the leader is told the rewrite applied, so refuse instead. Finalizing BEFORE
      // the create keeps the refusal free of an orphan replacement row that the settle poll
      // would then wait on forever.
      let skipped: AiTeamAssignment | null;
      try {
        skipped = await finalizeAttempt(
          row.id,
          'queued',
          'skipped',
          'leader-amend',
          AMENDED_REPORT_COPY
        );
      } finally {
        userStopped.delete(row.agentId);
      }
      if (skipped === null) {
        // Not retired after all: the row is running and its own turn owns the settle, so the
        // marker must not make that turn's catch skip its finalize.
        retiredAssignmentIds.delete(row.id);
        refused.push({ assignmentId: row.id, code: 'NOT_QUEUED' });
        continue;
      }
      // D-08: append, never mutate in place — attempt = a new row (D-23).
      // WR-01: a throwing create (batch row deleted mid-amend) must not leave the retired row
      // terminal with no replacement and the agent stuck `queued` — that row would never
      // settle and the whole `applied` list would be discarded by the throw. Refuse instead.
      let next: AiTeamAssignment;
      try {
        next = await createAssignment(
          {
            batchId,
            agentId: row.agentId,
            agentName: row.agentName,
            ...(row.skillId !== undefined ? { skillId: row.skillId } : {}),
            ...(row.skillVersion !== undefined ? { skillVersion: row.skillVersion } : {}),
            ...(row.dependsOn !== undefined ? { dependsOn: row.dependsOn } : {}),
            model: row.model,
            task: operation.task ?? row.task,
            retryOfAssignmentId: row.id,
          },
          db
        );
      } catch {
        // WR-01: the retired dispatch's own catch early-returns on the marker without
        // settling, so after this refusal NO writer is left — the agent would stay
        // `queued`/`running` forever and the synthesis would report it unfinished. Settle it
        // here, then drop the marker so the row's identity guard is not left armed.
        settleAgent(row.agentId, 'stopped', undefined, row.id);
        retiredAssignmentIds.delete(row.id);
        // WR-02 (pass 6): the cause is a failed replacement write, not a row that started
        // running — the old row is already `skipped` and the transcript says so. Reporting
        // "vừa bắt đầu chạy" would be a false statement the leader repeats to the user.
        createFailed = true;
        refused.push({ assignmentId: row.id, code: 'NOT_QUEUED' });
        continue;
      }
      // WR-04: the map moves before the replacement can be settled by the retired dispatch's
      // catch — its identity guard then rejects the old attempt's settle.
      assignmentIdsByAgent.set(row.agentId, next.id);
      updateAgent(row.agentId, { status: 'queued', streamingText: '', incomplete: false });
      // The replacement must actually run; `onBatchSettled`'s ledger poll is what makes the
      // batch wait for it (T-37.1-23). Pre-validation proved the controller exists.
      void dispatchAssignment(
        employee,
        next.task,
        {
          batchId,
          assignmentId: next.id,
          attemptNo: next.attemptNo,
          ...(row.instructionMessageId !== undefined
            ? { instructionMessageId: row.instructionMessageId }
            : {}),
        },
        batchController!
      ).catch(() => {
        /* dispatchAssignment already settled the agent and its ledger row */
      });
      applied.push({ op: 'rewrite_task', assignmentId: row.id, replacementId: next.id });
    }

    notify();
    if (refused.length > 0) {
      return JSON.stringify({
        applied,
        refused: true,
        code: 'NOT_QUEUED',
        message: createFailed
          ? 'Một số việc không tạo được bản sửa. Việc cũ đã dừng, hãy giao lại nếu cần.'
          : 'Một số việc vừa bắt đầu chạy nên không sửa được. Việc đang chạy chỉ nhận chỉ đạo.',
      });
    }
    return JSON.stringify({ applied });
  }

  async function send(
    text: string
  ): Promise<'started' | 'steered' | 'refused' | 'blocked'> {
    // D-18: a disposed coordinator is inert. Nothing may start, persist or register — and
    // no state change will ever make it work again, so the caller must not requeue.
    if (disposed) return 'blocked';
    // D-01/D-02: a live OR parked turn no longer refuses the submit — it takes it as a steer.
    if (BUSY_PHASES.has(phase)) return steer(text);
    // D-03/D-07: read the roster exactly ONCE per turn, before any read of it.
    if (options.loadRoster) {
      roster = await options.loadRoster();
      // D-08: membership is per turn, so a de-rostered agent stops being mentionable.
      applyRosterMembership(await hydrateBudgets());
    } else {
      await ensureMembers();
    }
    // The roster load is an await: a dispose during it must not let the turn start.
    if (disposed) return 'blocked';
    lastUserRequest = text;
    const target = parseMentionTarget(text);

    await saveTeamMessage({ threadId: options.threadId, role: 'user', content: text }, db);
    registerTeamTurn();

    // D-19: the team turn is finished here, in `finally`, so an early return or a throw
    // cannot leave `team:<teamId>` registered forever.
    try {
      if (target) {
        setPhase('batch-running');
        await startEmployeeTurn(target, text, text);
        if (phase === 'batch-running') {
          setPhase('ready');
        }
        return 'started';
      }

      // D-24/37.1: serialized so a steer turn arriving during `lead-thinking` queues behind
      // this one instead of hitting `TURN_IN_PROGRESS` on a live runtime.
      await runLeadTurnSerialized(() => startLeadTurn(text));
      return 'started';
    } finally {
      // D-24: when the turn opened a batch, the batch owns the team turn — `onBatchSettled`
      // finishes it once the synthesis turn is done. Finishing here would drop the indicator
      // while agents are still running.
      if (!batchOwnsTeamTurn) aiTurnManager.finishTurn(teamTurnId);
    }
  }

  /**
   * D-07/D-10: one assignment = one async task that owns the WHOLE
   * `acquire -> start -> settle -> release` span inside a single `try/finally`.
   *
   * The `try` begins before `acquire`, so a parked assignment (queued) and a started one
   * share one release point. `finally` is the ONLY place a slot is released: `startEmployeeTurn`
   * settles the agent itself, so a release there is always after `settleAgent` (Pitfall 10).
   */
  async function dispatchAssignment(
    employee: AiEmployee,
    task: string,
    attempt: AttemptRef,
    batchController: AbortController
  ): Promise<void> {
    const assignmentId = attempt.assignmentId;
    // D-10/D-11: the controller — never a scheduler handle — is the cancellation channel
    // for a queued assignment; no handle exists before `acquire` resolves.
    const controller = new AbortController();
    assignmentControllers.set(assignmentId, controller);
    // D-24/T-37.1-01: the batch controller is the ONLY bridge from a teardown to this agent.
    // The lead's tool-call signal is deliberately not wired — its turn ends as soon as the
    // batch is dispatched, and that abort must not cancel a running batch.
    const onBatchAbort = () => controller.abort();
    if (batchController.signal.aborted) controller.abort();
    else batchController.signal.addEventListener('abort', onBatchAbort, { once: true });

    let handle: SchedulerHandle | undefined;
    try {
      handle = await scheduler.acquire(controller.signal);
      // CR-02: `acquire` resolving is an await boundary. If dispose landed while parked its
      // `registry.clear()` already ran, so starting now would build a fresh runtime for a
      // deleted team. Throw the abort the catch below already knows how to settle — a bare
      // `return` would leave the attempt row `queued` forever.
      if (disposed) throw new DOMException('Aborted', 'AbortError');
      // WR-04: the leader retired this attempt while it was parked. The amend path owns the
      // terminal write and the replacement's settle, so this task must touch neither.
      if (retiredAssignmentIds.has(assignmentId)) {
        throw new DOMException('Aborted', 'AbortError');
      }
      // T-37.1-04: a stop/amend that landed while this assignment was parked has already
      // written a terminal status. Re-read the ledger so a cancelled row never starts.
      const ledgerRow = await getAssignment(assignmentId, db);
      if (!ledgerRow || ledgerRow.runStatus !== 'queued') {
        throw new DOMException('Aborted', 'AbortError');
      }
      await startEmployeeTurn(employee, task, lastUserRequest, priorBatchResults, attempt);
    } catch (err) {
      // WR-04: a retired attempt is already finalized by the amend path. Settling here would
      // release the batch's deferred before the replacement ran (and could overwrite the
      // replacement's live state), so this task is done.
      if (retiredAssignmentIds.has(assignmentId)) return;
      // The acquire rejected (a stop/abort/dispose) or the prologue threw. The agent and
      // its ledger row must still settle — nothing may hang the batch (T-37-11).
      const aborted =
        controller.signal.aborted ||
        (err instanceof DOMException && err.name === 'AbortError');
      try {
        if (aborted) {
          // The abort may be a per-agent Stop (its marker is already in `userStopped`) or a
          // global abort/dispose. The stop path and this catch race to finalize; the `from`
          // guard decides, so either writer produces one row and one terminal status.
          // `null` is expected when `stopAgent`/`abortAll` already committed the transition.
          await finalizeAttempt(
            assignmentId,
            'queued',
            'stopped',
            userStopped.get(employee.id) ?? disposeCause ?? 'user-abort',
            STOPPED_REPORT_COPY
          );
          settleAgent(employee.id, 'stopped', undefined, assignmentId);
        } else {
          await finalizeAttempt(
            assignmentId,
            'queued',
            'error',
            'provider',
            SANITIZED_TURN_ERROR,
            boundedDiagnostic(err)
          );
          settleAgent(employee.id, 'error', SANITIZED_TURN_ERROR, assignmentId);
        }
      } catch {
        /* a ledger write must never leak the slot */
      }
    } finally {
      batchController.signal.removeEventListener('abort', onBatchAbort);
      assignmentControllers.delete(assignmentId);
      // The retired marker has done its job once this task has ended.
      retiredAssignmentIds.delete(assignmentId);
      if (assignmentIdsByAgent.get(employee.id) === assignmentId) {
        assignmentIdsByAgent.delete(employee.id);
      }
      // The single release point. `release` is idempotent (37-02), so a stop path that
      // already released cannot corrupt the count.
      if (handle !== undefined) {
        scheduler.release(handle);
      }
    }
  }

  /**
   * D-24: the dispatch half of the old `runBatch`. Opens the batch row, creates one attempt
   * per assignment, starts every agent, and returns an ACK — the lead's turn ends here.
   * `onBatchSettled` owns the wait, the reports and the synthesis turn.
   */
  async function dispatchBatch(rawAssignments: unknown[], signal?: AbortSignal): Promise<string> {
    // T-37.1-02: a second dispatch while a batch is open would overwrite `openBatchId` and
    // orphan the first batch's settle handler. Checked before `disposed` on purpose.
    if (openBatchId !== null) return ALREADY_RUNNING_REFUSAL;
    // D-18: a disposed coordinator starts no batch and opens no ledger row.
    if (disposed) return DISPOSED_REFUSAL;
    // D-05: no lead means no delegation authority — refuse rather than throw.
    const lead = roster.lead;
    if (!lead) return EMPLOYEE_DELEGATE_REFUSAL;
    const validation = await executeTeamTool(
      'delegate_batch',
      { assignments: rawAssignments },
      toolContext(lead.id)
    );
    // CR-02: `executeTeamTool` is an await — a dispose that landed during it must not open
    // a batch or start agents against a deleted team.
    if (disposed) return DISPOSED_REFUSAL;
    let parsed: any;
    try {
      parsed = JSON.parse(validation);
    } catch {
      return validation;
    }
    // T-34-34: a refusal returns to the lead as the tool result; no turn starts.
    if (parsed?.refused === true) return validation;

    const assignments: Array<{ agentId: string; task: string }> = Array.isArray(
      parsed?.assignments
    )
      ? parsed.assignments
      : [];

    // D-24: the plan the user actually saw is the snapshot, captured before any card.
    const planSnapshot = {
      original: assignments.map((assignment) => ({
        agentId: assignment.agentId,
        agentName:
          roster.employees.find((row) => row.id === assignment.agentId)?.name ??
          assignment.agentId,
        task: assignment.task,
      })),
    };

    let planDecision: 'approved' | 'rejected' | 'auto' = 'auto';
    if (liveTeam.autoSplitEnabled !== true) {
      batchIndex += 1;
      const plan: AssignmentPlan = {
        batchIndex,
        assignments: assignments.map((assignment) => {
          const employee = roster.employees.find((row) => row.id === assignment.agentId);
          const skill = employee ? skillFor(employee) : undefined;
          return {
            agentId: assignment.agentId,
            agentName: employee?.name ?? assignment.agentId,
            ...(skill ? { skillName: skill.name } : {}),
            task: assignment.task,
          };
        }),
      };
      pendingPlan = plan;
      lastPlanDecision = null;
      setPhase('awaiting-plan');
      const approved = await new Promise<boolean>((resolve) => {
        planResolver = resolve;
      });
      planResolver = null;
      pendingPlan = null;
      // CR-02: `dispose()` releases this park, so the resolution is an await like any other.
      // Opening a ledger row now would write into a team the delete is removing.
      if (disposed) return DISPOSED_REFUSAL;
      // UI-SPEC §7: the decided plan stays visible with its status line until the next
      // plan replaces it, so the decision is observable rather than flashing away.
      lastPlan = plan;
      lastPlanDecision = approved ? 'approved' : 'rejected';
      planDecision = approved ? 'approved' : 'rejected';
      if (!approved) {
        // A rejected plan still leaves a ledger row — the decision is part of the record —
        // and it is closed immediately because no attempt exists.
        const rejectedBatch = await openBatch(
          {
            teamId,
            threadId: options.threadId,
            batchIndex,
            userRequest: lastUserRequest,
            leadId: lead.id,
            planSnapshot,
            planDecision: 'rejected',
          },
          db
        );
        // IN-09: a rejection is not an abort — `planDecision: 'rejected'` already carries the
        // fact, and a reader of `abortedBy` alone must not confuse it with a user Stop.
        await closeBatch(rejectedBatch.id, { phaseAtEnd: 'ready', abortedBy: 'none' }, db);
        setPhase('ready');
        return PLAN_REJECTED;
      }
    } else {
      batchIndex += 1;
    }

    signal?.throwIfAborted();

    // D-24/D-08: the row opens only once the decision resolved, so its snapshot is the list
    // the user saw. `openBatchId` is what `abortAll`/`dispose` close.
    const batch = await openBatch(
      {
        teamId,
        threadId: options.threadId,
        batchIndex,
        userRequest: lastUserRequest,
        leadId: lead.id,
        planSnapshot,
        planDecision,
      },
      db
    );
    // CR-02: `openBatch` is an await and `dispose()` may have run during it — it saw
    // `openBatchId === null`, so this row would never be closed. Close it here, in the
    // teardown's own vocabulary, and refuse the batch.
    if (disposed) {
      try {
        await closeBatch(batch.id, { phaseAtEnd: 'ready', abortedBy: 'team-deleted' }, db);
      } catch {
        /* the refusal must not throw on a ledger write */
      }
      return DISPOSED_REFUSAL;
    }
    openBatchId = batch.id;
    // D-24/T-37.1-01: the batch owns the cancellation channel from here on.
    const batchController = new AbortController();
    batchControllers.set(batch.id, batchController);

    setPhase('batch-running');

    const attemptIdsByAgent = new Map<string, string>();
    // WR-06: the create/dispatch loop awaits `createAssignment`/`saveTeamMessage` per
    // assignment. A throw there escapes `runBatch` to the orchestrator's tool-error path;
    // `startLeadTurn` only resets `ready` from the lead phases, so the coordinator was left
    // in `batch-running` — every submit queued forever and the batch row had no `endedAt`.
    // Close the batch, release the phase, and hand the lead a structured refusal.
    try {
      for (const assignment of assignments) {
        const employee = roster.employees.find((row) => row.id === assignment.agentId);
        if (!employee) continue;
        // D-22: one attempt row per run, `queued` until the turn actually starts.
        const skill = skillFor(employee);
        const attemptRow = await createAssignment(
          {
            batchId: batch.id,
            agentId: employee.id,
            agentName: employee.name,
            ...(skill ? { skillId: skill.id } : {}),
            model: employee.model || options.model,
            task: assignment.task,
          },
          db
        );
        // D-10/D-11: registered at CREATION time (queued), so a stop can find the assignment
        // before any runtime exists. Cleared by the dispatch task's `finally`.
        assignmentIdsByAgent.set(employee.id, attemptRow.id);
        attemptIdsByAgent.set(employee.id, attemptRow.id);
        // Queued means nothing has started: no runtime, no live-use claim, no turn registration.
        updateAgent(employee.id, { status: 'queued', streamingText: '', steps: [] });
        // D-31: the instruction row is attributed to the lead, so the employee's own history
        // reads as (instruction, report) pairs. D-22 links make the pair explicit.
        // WR-01: link fields ONLY. Nothing updates an instruction row's `runStatus`/
        // `stopReason` (the terminal writer patches the REPORT row), so stamping `queued` here
        // rendered a permanent queue badge, a stop button for the lead, and a retry button
        // that refuses. The ledger row is the single source of attempt status.
        const instructionRow = await saveTeamMessage(
          {
            threadId: options.threadId,
            role: 'assistant',
            content: assignment.task,
            agentId: lead.id,
            agentName: lead.name,
            agentKind: 'lead',
            messageKind: 'instruction',
            // CR-06: display attribution is the lead's, but the row belongs to the assignee
            // so `listAssignmentHistory` can find it.
            targetAgentId: employee.id,
            batchId: batch.id,
            assignmentId: attemptRow.id,
            attemptNo: attemptRow.attemptNo,
          },
          db
        );
        // D-16/T-37-08: the dispatch task is not awaited here, but a rejection must still not
        // surface as unhandled — the task itself settles the agent and its ledger row.
        void dispatchAssignment(
          employee,
          assignment.task,
          {
            batchId: batch.id,
            assignmentId: attemptRow.id,
            attemptNo: attemptRow.attemptNo,
            instructionMessageId: instructionRow.id,
          },
          batchController
        ).catch(() => {
          /* dispatchAssignment already settled the agent and its ledger row */
        });
      }
    } catch {
      // Anything already dispatched still settles itself; the batch is closed here so the
      // ledger tail is honest and `dispose`/`abortAll` cannot double-close it.
      batchControllers.delete(batch.id);
      if (openBatchId === batch.id) {
        openBatchId = null;
        try {
          await closeBatch(batch.id, { phaseAtEnd: 'ready', abortedBy: 'none' }, db);
        } catch {
          /* the ledger close must never mask the original failure */
        }
      }
      setPhase('ready');
      return BATCH_DISPATCH_FAILED;
    }

    // D-24: the ack is all the lead needs — the settled results arrive through the synthesis
    // turn that `onBatchSettled` opens. Building it here keeps the tool result honest about
    // what was dispatched without waiting for anyone.
    const ack = JSON.stringify({
      dispatched: attemptIdsByAgent.size,
      batchId: batch.id,
      status: 'dispatched',
      agents: [...attemptIdsByAgent.entries()].map(([agentId, assignmentId]) => ({
        agentId,
        agentName: roster.employees.find((row) => row.id === agentId)?.name ?? agentId,
        assignmentId,
      })),
    });

    // D-24: one team turn spans dispatch + batch + synthesis, so `send()` must not finish it.
    batchOwnsTeamTurn = true;
    // Fire-and-forget: the settle handler must never throw into the void, and the lead's turn
    // has to end now.
    void onBatchSettled(batch.id, assignments, attemptIdsByAgent).catch(() => {
      /* a settle handler must never surface as an unhandled rejection */
    });
    return ack;
  }

  /**
   * D-24: the event half of the old `runBatch`. Waits for every agent to reach a terminal
   * state, polls the ledger so a cancelled-but-still-parked row cannot be missed, builds the
   * batch results, closes the batch row, and opens the synthesis lead turn.
   *
   * Cancellable by design: `abortAll`/`dispose` abort the batch controller, which rejects the
   * ledger poll's park and every agent's `acquire`, so this handler never resurrects a lead
   * turn on a closed coordinator.
   */
  async function onBatchSettled(
    batchId: string,
    assignments: Array<{ agentId: string; task: string }>,
    attemptIdsByAgent: Map<string, string>
  ): Promise<void> {
    const batchController = batchControllers.get(batchId);
    try {
      // Terminal-only settle: a paused agent's deferred is still pending, so the lead cannot
      // synthesize past it (D-30, Pitfall 7).
      await Promise.all([...agentDeferreds.values()].map((deferred) => deferred.promise));
      // Ledger poll (Pitfall 5): a cancelled queued row may never have had a deferred.
      // WR-09: bounded — a row that can never settle must not hang the team turn forever
      // (`finishTurn` would never fire and every later submit would route as a steer).
      const deadline = Date.now() + (options.settlePollDeadlineMs ?? 120_000);
      let deadlineExpired = false;
      while (!disposed && !batchController?.signal.aborted) {
        const rows = await listBatchAssignments(batchId, db);
        if (!rows.some((row) => row.runStatus === 'queued' || row.runStatus === 'running')) break;
        if (Date.now() > deadline) {
          deadlineExpired = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      if (disposed || batchController?.signal.aborted) return;

      // WR-05: the deadline must not be mistaken for a settled batch. Closing it here would
      // report a still-`running` agent as unfinished, and a later `send()` would open a
      // SECOND batch and overwrite `assignmentIdsByAgent`. Finalize the stuck rows instead:
      // abort their controllers, write the terminal triple, and settle the agent so no
      // phantom "đang làm việc" line survives.
      if (deadlineExpired) {
        // A few bounded passes: an aborted dispatch settles itself asynchronously, so one
        // pass can still observe a row mid-transition.
        for (let pass = 0; pass < 5; pass += 1) {
          const live = (await listBatchAssignments(batchId, db)).filter(
            (row) => row.runStatus === 'queued' || row.runStatus === 'running'
          );
          if (live.length === 0) break;
          for (const row of live) {
            assignmentControllers.get(row.id)?.abort();
            // Both writers (this one and the row's own dispatch catch) must record the same
            // reason, or the row ends with one path's reason and the other path's status.
            userStopped.set(row.agentId, 'tool-limit');
            try {
              await finalizeAttempt(
                row.id,
                row.runStatus,
                'stopped',
                'tool-limit',
                STOPPED_REPORT_COPY
              );
              // WR-02: `steerMessageIds` is the durable "delivered" marker, and the badge
              // suppresses on it. A steer this row never drained was NOT read by the agent —
              // leaving the marker would tell the user their instruction landed. The row is
              // terminal, so no later round can drain it: drop only the ids never injected
              // (an injected one WAS read). Inside a transaction so a concurrent write during
              // this await cannot be lost (CR-05).
              //
              // WR-01 (pass 6): `dispose()` clears `injectedSteerIdsByAttempt`, so after a
              // teardown every id would look undrained. The ledger is the user's only record
              // then — leave it untouched.
              if (!disposed) {
                const injected = injectedSteerIdsByAttempt.get(row.id);
                await db.transaction('rw', [db.aiTeamAssignments], async () => {
                  const live = await db.aiTeamAssignments.get(row.id);
                  const ids = live?.steerMessageIds ?? [];
                  const kept = ids.filter((id) => injected?.has(id) ?? false);
                  if (kept.length !== ids.length) {
                    await db.aiTeamAssignments.update(row.id, { steerMessageIds: kept });
                  }
                });
              }
            } finally {
              userStopped.delete(row.agentId);
            }
            settleAgent(row.agentId, 'stopped', undefined, row.id);
          }
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        const stillLive = (await listBatchAssignments(batchId, db)).some(
          (row) => row.runStatus === 'queued' || row.runStatus === 'running'
        );
        // A row that survived the abort is a lost race, not a settled batch: leave
        // `openBatchId` set (the reviewer's floor) so no second batch opens over this one.
        // The ceiling: the team turn finishes in `finally` and the phase stays
        // `batch-running`, so later submits route as steers until the row settles.
        if (stillLive) return;
      }

      // D-14: the lead must be able to say what is missing, so every entry carries the
      // ledger's terminal triple — `status`, `stopReason`, `incomplete` — not just the UI state.
      // 37.1 D-08: an amended assignment's replacement is a NEW attempt row, so the latest
      // attempt per agent is what the synthesis must read — never the dispatch-time id.
      const ledgerRows = await listBatchAssignments(batchId, db);
      const latestByAgent = new Map<string, AiTeamAssignment>();
      for (const row of ledgerRows) {
        const previous = latestByAgent.get(row.agentId);
        if (!previous || row.attemptNo > previous.attemptNo) latestByAgent.set(row.agentId, row);
      }
      const results = await Promise.all(
        assignments.map(async (assignment) => {
          const employee = roster.employees.find((row) => row.id === assignment.agentId);
          const state = agents.get(assignment.agentId);
          const status: AgentRunStatus = state?.status ?? 'error';
          const report =
            status === 'error' ? SANITIZED_TURN_ERROR : reports.get(assignment.agentId) ?? '';
          const assignmentId = attemptIdsByAgent.get(assignment.agentId);
          const row =
            latestByAgent.get(assignment.agentId) ??
            (assignmentId ? await getAssignment(assignmentId, db) : undefined);
          const stopped = status === 'stopped' || row?.runStatus === 'stopped';
          return {
            agentId: assignment.agentId,
            agentName: employee?.name ?? assignment.agentId,
            status,
            report,
            stopReason: row?.stopReason ?? (stopped ? 'user-abort' : 'none'),
            incomplete: row?.incomplete ?? stopped,
          };
        })
      );

      agentDeferreds.clear();
      // Carry this batch's settled reports into the next one (AIO-TEAM-03).
      priorBatchResults = results
        .filter((row) => row.status === 'done' && row.report.trim().length > 0)
        .map((row) => ({ agentName: row.agentName, content: row.report }));

      // D-14: the `kind: 'unfinished'` tail no longer travels in the tool result, so the
      // honesty has to reach the lead through the synthesis prompt. An unfinished agent is
      // named in the `KẾT QUẢ CỦA LÔ` block with its terminal triple.
      const synthesisResults: BatchResult[] = results.map((row) => ({
        agentName: row.agentName,
        content:
          row.incomplete === true || row.status !== 'done'
            ? `${row.report}\n[Chưa hoàn tất — ${row.status}/${row.stopReason}]`
            : row.report,
      }));

      setPhase('lead-synthesizing');
      // The run is over: close the batch row so `dispose`/`abortAll` never double-close it.
      if (openBatchId === batchId) openBatchId = null;
      await closeBatch(batchId, { phaseAtEnd: 'lead-synthesizing', abortedBy: 'none' }, db);
      // D-24: the dispatch turn's own answer is a synthesis row too, so it must be
      // superseded by the real synthesis — otherwise the transcript keeps two "current"
      // syntheses. Same shape as `retryAssignment`'s predecessor handling.
      const previousSynthesisId =
        lastSynthesisMessageId ??
        (await findCurrentSynthesisMessageId(options.threadId, db)) ??
        null;
      lastSynthesisMessageId = null;
      try {
        await runLeadTurnSerialized(() => startLeadTurn(SYNTHESIS_INSTRUCTION, synthesisResults));
      } finally {
        if (
          lastSynthesisMessageId !== null &&
          previousSynthesisId !== null &&
          previousSynthesisId !== lastSynthesisMessageId
        ) {
          await supersedeTeamMessage(previousSynthesisId, lastSynthesisMessageId, db);
        }
      }
    } catch {
      // A settle handler must never throw into the void: an AbortError from a teardown and a
      // ledger failure both end here.
    } finally {
      batchControllers.delete(batchId);
      // D-24/T-37.1-03: the team turn spans the whole batch, so it finishes exactly here.
      batchOwnsTeamTurn = false;
      aiTurnManager.finishTurn(teamTurnId);
    }
  }

  /** D-12: text handed to the lead for a re-synthesis pass (no delegation expected). */
  const SYNTHESIS_INSTRUCTION =
    'Tổng hợp lại kết quả của lô vừa chạy. BẮT BUỘC nêu rõ những việc chưa hoàn tất và lý do.';

  /** D-12/D-14: a latest attempt with no current report still contributes an entry. */
  function unfinishedReportCopy(row: AiTeamAssignment): string {
    const reason = row.stopReason === 'none' ? row.runStatus : `${row.runStatus}/${row.stopReason}`;
    return `Chưa hoàn tất (${reason}). Không có báo cáo cho lần chạy này.`;
  }

  /**
   * D-12: resolve the batch's current report TEXT from the ledger.
   *
   * The ledger stores `reportMessageId`, not content: every entry here is a
   * `db.chatMessages.get()` on the latest attempt's report, skipping superseded ones so
   * the lead synthesizes only what is current.
   */
  async function collectBatchReports(batchId: string): Promise<BatchResult[]> {
    const rows = await listBatchAssignments(batchId, db);
    const latestByAgent = new Map<string, AiTeamAssignment>();
    for (const row of rows) {
      const previous = latestByAgent.get(row.agentId);
      if (!previous || row.attemptNo > previous.attemptNo) latestByAgent.set(row.agentId, row);
    }

    const results: BatchResult[] = [];
    for (const row of latestByAgent.values()) {
      const message =
        row.reportMessageId === undefined ? undefined : await db.chatMessages.get(row.reportMessageId);
      if (!message || message.supersededByMessageId !== undefined) {
        results.push({ agentName: row.agentName, content: unfinishedReportCopy(row) });
        continue;
      }
      results.push({ agentName: row.agentName, content: message.content });
    }
    return results;
  }

  /**
   * D-12/D-13/D-23: run ONE stored assignment again as a new attempt, supersede its old
   * report, then re-synthesize the batch once with the full report set.
   *
   * Refusals: disposed, a busy phase, an in-flight retry (ignored), a non-retryable status,
   * or a de-rostered agent. The task is the STORED one — never text the user re-typed — and
   * the plan card is never reopened (D-13).
   */
  async function retryAssignment(assignmentId: string): Promise<void> {
    if (disposed) throw new Error('Nhóm đã bị đóng. Không thể chạy lại.');
    // T-37-22: claimed BEFORE any await, so two clicks in the same tick cannot both pass.
    // Checked before the busy guard too: a second click on the SAME assignment while its
    // retry runs is the double click this guard exists for, not a busy-phase refusal.
    if (retryingAssignments.has(assignmentId)) return;
    if (BUSY_PHASES.has(phase)) throw new Error('Nhóm đang chạy. Hãy chờ lượt hiện tại kết thúc.');
    retryingAssignments.add(assignmentId);
    // WR-04: the phase is claimed SYNCHRONOUSLY, with no await between the guard above and
    // this write. Otherwise two clicks on different bubbles in one tick both pass the guard,
    // both create attempts, and both run a lead synthesis — which then race on the previous
    // synthesis id and leave one synthesis current forever.
    // 37-06: the outbox queues against this phase instead of dispatching beside the retry.
    setPhase('batch-running');

    let claimed = false;
    let claimedAgentId: string | null = null;
    // WR-03: ONE try/finally from the phase claim onward. The method throws by design
    // (missing row, non-retryable status, no report to supersede, a throwing transcription
    // write); before this, any such throw left `phase === 'batch-running'` — a BUSY phase —
    // so every later submit queued and the release effect never fired.
    try {
      const source = await getAssignment(assignmentId, db);
      if (!source) throw new Error('Không tìm thấy lần chạy cần chạy lại.');
      if (source.runStatus !== 'stopped' && source.runStatus !== 'error') {
        throw new Error('Chỉ chạy lại được lần chạy đã dừng hoặc bị lỗi.');
      }
      // A retry already in flight for this agent (a second, different assignment id) is
      // the same double-click: ignored, so no third attempt row appears.
      if (retryingAgents.has(source.agentId)) return;

      const employee = roster.employees.find((row) => row.id === source.agentId);
      if (!employee) throw new Error('Nhân viên không còn trong nhóm. Không thể chạy lại.');

      const batch = await getBatch(source.batchId, db);
      if (!batch) throw new Error('Không tìm thấy lô chạy.');

      const attemptRow = await createAssignment(
        {
          batchId: source.batchId,
          agentId: source.agentId,
          agentName: source.agentName,
          ...(source.skillId !== undefined ? { skillId: source.skillId } : {}),
          ...(source.skillVersion !== undefined ? { skillVersion: source.skillVersion } : {}),
          model: source.model,
          task: source.task,
          retryOfAssignmentId: source.id,
        },
        db
      );

      // CR-02: a dispose that landed during `createAssignment` means no agent may start.
      // The teardown already closed the batch, so this row must be settled here or it
      // would sit `queued` forever with no writer left.
      if (disposed) {
        try {
          await finalizeAttempt(
            attemptRow.id,
            'queued',
            'stopped',
            'team-deleted',
            STOPPED_REPORT_COPY
          );
        } catch {
          /* the refusal must not throw on a ledger write */
        }
        return;
      }

      claimed = true;
      claimedAgentId = source.agentId;
      retryingAgents.add(source.agentId);
      assignmentIdsByAgent.set(source.agentId, attemptRow.id);
      updateAgent(source.agentId, { status: 'queued', streamingText: '', incomplete: false });

      const attempt: AttemptRef = {
        batchId: source.batchId,
        assignmentId: attemptRow.id,
        attemptNo: attemptRow.attemptNo,
        ...(source.instructionMessageId !== undefined
          ? { instructionMessageId: source.instructionMessageId }
          : {}),
      };
      const controller = new AbortController();
      assignmentControllers.set(attemptRow.id, controller);

      let handle: SchedulerHandle | undefined;
      try {
        handle = await scheduler.acquire(controller.signal);
        // CR-02: same await boundary as the batch path — a dispose during the park cleared
        // the registry, so a start here would create a runtime for a deleted team.
        if (disposed) throw new DOMException('Aborted', 'AbortError');
        await startEmployeeTurn(employee, source.task, batch.userRequest, priorBatchResults, attempt);
      } catch {
        // Same terminal contract as the batch wrapper: an aborted parked retry still owes
        // exactly one report row, and `null` is expected when the stop path already won.
        try {
          await finalizeAttempt(
            attemptRow.id,
            'queued',
            'stopped',
            'user-abort',
            STOPPED_REPORT_COPY
          );
          settleAgent(source.agentId, 'stopped', undefined, attemptRow.id);
        } catch {
          /* a ledger write must never leak the slot */
        }
      } finally {
        assignmentControllers.delete(attemptRow.id);
        if (assignmentIdsByAgent.get(source.agentId) === attemptRow.id) {
          assignmentIdsByAgent.delete(source.agentId);
        }
        if (handle !== undefined) {
          scheduler.release(handle);
        }
      }

      const settled = await getAssignment(attemptRow.id, db);
      if (!settled || settled.reportMessageId === undefined) {
        // No terminal write means the attempt never ran (disposed mid-park). Nothing to
        // supersede and nothing new to synthesize; the outer `finally` restores the phase.
        return;
      }

      // D-23: the SOURCE report is superseded by the new one. `finalizeAttempt` always sets
      // `reportMessageId` for a terminal attempt (including one stopped before `start()`), so
      // an absent id is a broken invariant, not a state to skip silently.
      if (source.reportMessageId === undefined) {
        throw new Error(`retryAssignment: source attempt ${source.id} has no report to supersede`);
      }
      await supersedeTeamMessage(source.reportMessageId, settled.reportMessageId, db);

      // D-12: the lead sees the FULL batch — including agents that succeeded on attempt 1.
      // WR-05: resolve the predecessor from the TRANSCRIPT, not the memory slot. A retry
      // after a remount/relaunch runs on a fresh coordinator whose `lastSynthesisMessageId`
      // is null, so a memory-only lookup left the old synthesis current forever. The slot
      // stays as a fast path (it is what a same-session retry already knows).
      const previousSynthesisId =
        lastSynthesisMessageId ??
        (await findCurrentSynthesisMessageId(options.threadId, db)) ??
        null;
      lastSynthesisMessageId = null;
      try {
        // WR-01: same serialization as every other lead turn. A steer turn does not change
        // the phase, so a retry clicked during one would otherwise hit TURN_IN_PROGRESS and
        // half-apply (new report saved, source superseded, no synthesis).
        const retryResults = await collectBatchReports(source.batchId);
        await runLeadTurnSerialized(() =>
          startLeadTurn(SYNTHESIS_INSTRUCTION, retryResults)
        );
      } finally {
        if (lastSynthesisMessageId !== null && previousSynthesisId !== null) {
          await supersedeTeamMessage(previousSynthesisId, lastSynthesisMessageId, db);
        }
      }

      // The batch was closed when the first attempt run ended; the retry is its new tail.
      try {
        const batchRow = await getBatch(source.batchId, db);
        if (batchRow?.endedAt !== undefined && batchRow.phaseAtEnd !== 'ready') {
          await db.aiTeamBatches.update(source.batchId, { phaseAtEnd: 'ready' });
        }
      } catch {
        /* the ledger tail must never fail the retry */
      }
    } finally {
      // WR-03: the ONE phase reset for this call. Whatever escaped the body — a refusal
      // throw with no attempt created, a missing source report, a throwing transcription
      // write — leaves the coordinator `ready` and the guards clear, so the next send()
      // starts a turn instead of being steered into a finished one.
      if (phase === 'batch-running' || phase === 'lead-synthesizing') setPhase('ready');
      retryingAssignments.delete(assignmentId);
      if (claimed && claimedAgentId !== null) retryingAgents.delete(claimedAgentId);
    }
  }

  function resolvePlan(approved: boolean): void {
    const resolver = planResolver;
    planResolver = null;
    resolver?.(approved);
  }

  /**
   * D-25: the sidebar switches and the settings drawer both land here.
   * D-04: a limit change applies to the run in flight — the scheduler drains its queue on a
   * raise and preempts nothing on a lower.
   */
  function setTeamSettings(
    patch: Partial<
      Pick<AiTeam, 'autoSplitEnabled' | 'autoApproveMutations' | 'concurrencyLimit'>
    >
  ): void {
    liveTeam = { ...liveTeam, ...patch };
    scheduler.setLimit(liveTeam.concurrencyLimit ?? DEFAULT_TEAM_CONCURRENCY);
    notify();
  }

  /**
   * AIO-BUDGET-01: a team-total edit made in the settings drawer must become the
   * coordinator's base, otherwise the next top-up writes a stale total back.
   */
  function setTeamBudget(total: number): void {
    teamBudget = total;
    liveTeam = { ...liveTeam, budgetTokens: total };
    lastTeamBucket = bucketOf(teamUsed, teamBudget);
    // A raise that puts usage back under the 80% bucket reopens the team gate and
    // clears the paused phase, so the banner does not linger on a run that resumed.
    if (lastTeamBucket < 8) {
      teamGate.open();
      if (phase === 'awaiting-budget') setPhase('batch-running');
    }
    notify();
  }

  function resolveApproval(approved: boolean): void {
    // WR-05: `get` would instantiate a runtime when the lead turn already settled.
    if (roster.lead) registry.peek(roster.lead.id)?.resolveApproval(approved);
    pendingApproval = null;
    if (phase === 'awaiting-mutation-approval') setPhase('lead-thinking');
    notify();
  }

  function stopAgent(agentId: string): void {
    // CR-03: stopping the lead while its batch is parked must release the park too.
    if (roster.lead !== undefined && agentId === roster.lead.id && planResolver) {
      planResolver(false);
      planResolver = null;
    }
    userStopped.set(agentId, 'user-per-agent');
    // D-10/D-11: creation-time link, because a QUEUED assignment has no runtime entry and
    // no `activeAssignmentByAgent` row yet. Without it the queue would be unstoppable.
    const assignmentId = assignmentIdsByAgent.get(agentId);
    registry.abort(agentId);
    settleAgent(agentId, 'stopped');
    if (assignmentId === undefined) return;
    // The assignment's own controller is the cancellation channel: aborting it rejects a
    // parked `scheduler.acquire` with `AbortError`. `scheduler.cancel` cannot do this — no
    // handle exists before admission (37-02). A running assignment's controller is a no-op.
    assignmentControllers.get(assignmentId)?.abort();
    // D-10/D-13: a stopped attempt still owes the transcript a bubble, and the `from`
    // token must be the row's ACTUAL status. `from: 'queued'` is what proves the queued
    // path committed; a racing settle loses the guard and `finalizeAttempt` returns `null`.
    void (async () => {
      const current = (await getAssignment(assignmentId, db))?.runStatus;
      if (current === 'queued') {
        await finalizeAttempt(
          assignmentId,
          'queued',
          'stopped',
          'user-per-agent',
          STOPPED_REPORT_COPY
        );
      } else if (current === 'running') {
        await finalizeAttempt(
          assignmentId,
          'running',
          'stopped',
          'user-per-agent',
          STOPPED_REPORT_COPY
        );
      }
    })().catch(() => {
      /* a stop must never throw out of the abort path */
    });
  }

  function abortAll(): void {
    // CR-03: a plan park is only released by resolvePlan. Without this the lead's
    // tool call stays pending forever and send() never resolves.
    planResolver?.(false);
    planResolver = null;
    // D-11: a global abort ends EVERY agent as a user abort, so the turn's own settle path
    // (which may win the race for a running agent) must map to stopped/user-abort too.
    for (const agentId of agents.keys()) userStopped.set(agentId, 'user-abort');
    // D-11: the queue is torn down first. Aborting each controller rejects its parked
    // acquire; the queued rows get their terminal write here, in case the dispatch task's
    // own catch loses the race. A running row fails the `from: 'queued'` guard and is
    // settled by its own turn's abort path instead.
    for (const assignmentId of assignmentIdsByAgent.values()) {
      assignmentControllers.get(assignmentId)?.abort();
      void finalizeAttempt(
        assignmentId,
        'queued',
        'stopped',
        'user-abort',
        STOPPED_REPORT_COPY
      ).catch(() => {
        /* the run must end even if the ledger write fails */
      });
    }
    // D-24/T-37.1-01: the batch controller is the only channel that reaches a parked or
    // running agent. `onBatchSettled`'s `finally` owns the map deletion.
    for (const controller of batchControllers.values()) controller.abort();
    // D-24: a teardown mid-batch still owes the team turn a finish.
    batchOwnsTeamTurn = false;
    aiTurnManager.finishTurn(teamTurnId);
    registry.abortAll();
    for (const agentId of agents.keys()) settleAgent(agentId, 'stopped');
    setPhase('ready');
    // D-11: close the batch row here, because `runBatch`'s own close (abortedBy: 'none')
    // would otherwise win the race and misreport a user abort. `closeBatch` is idempotent.
    if (openBatchId !== null) {
      const batchId = openBatchId;
      openBatchId = null;
      void closeBatch(batchId, { phaseAtEnd: 'ready', abortedBy: 'user' }, db).catch(() => {
        /* teardown must not throw out of the abort path */
      });
    }
  }

  /**
   * D-18: end a live run in bounded time and leave the coordinator inert.
   *
   * It cannot await the in-flight `send()`/`runBatch` — releasing the parks is what lets
   * them finish — so the `disposed` flag is what keeps a late tail from resurrecting a
   * phase. Idempotent: the second call finds every collection already empty.
   */
  async function dispose(cause: 'team-deleted' | 'app-exit' = 'team-deleted'): Promise<void> {
    disposed = true;
    // `ready` is the terminal state; set it before the ledger await so no observer sees a
    // live phase after the flag is up and before the close resolves.
    phase = 'ready';
    // IN-07: the stop path and this teardown race to settle the same attempts. Marking every
    // live agent with the teardown's own reason is what makes both writers record
    // `team-deleted`/`app-exit` instead of the generic `user-abort`.
    // IN-07: `team-deleted` IS an assignment stop reason; `app-exit` is only a batch
    // `abortedBy` value, so an app exit records `user-abort` on the attempt rows and the
    // exit fact lives on the batch row.
    if (cause === 'team-deleted') {
      disposeCause = 'team-deleted';
      for (const agentId of agents.keys()) userStopped.set(agentId, 'team-deleted');
    }

    // Release every park: plan card, agent gates, team gate.
    planResolver?.(false);
    planResolver = null;
    for (const gate of agentGates.values()) gate.open();
    teamGate.open();

    // D-11/D-18: a per-assignment controller is the only cancellation channel for a
    // queued assignment, so aborting them all is what rejects every parked acquire.
    abortAllAssignmentControllers(assignmentControllers);

    // D-24/T-37.1-01: abort every batch controller so a parked `onBatchSettled` ledger poll
    // and every queued acquire reject instead of resuming on a dead coordinator.
    for (const controller of batchControllers.values()) controller.abort();
    batchOwnsTeamTurn = false;
    aiTurnManager.finishTurn(teamTurnId);

    // `clear()` aborts and drops every runtime (teamRunRegistry).
    registry.clear();

    // 37.1 SC5: no stale steer badge may survive into a new coordinator for this team id.
    pendingSteerMessageIds.clear();
    injectedSteerIdsByAttempt.clear();

    for (const agentId of agents.keys()) settleAgent(agentId, 'stopped');

    if (openBatchId !== null) {
      const batchId = openBatchId;
      openBatchId = null;
      try {
        await closeBatch(batchId, { phaseAtEnd: 'ready', abortedBy: cause }, db);
      } catch {
        /* the ledger close must never block the teardown */
      }
    }

    notify();
  }

  async function topUp(scope: TopUpScope, amount: number): Promise<void> {
    await ensureMembers();
    if (scope.kind === 'agent') {
      const memberId = memberIds.get(scope.agentId);
      if (memberId) {
        const row = await topUpMemberBudget(memberId, amount, db);
        memberBudgets.set(scope.agentId, row.budgetTokens);
      }
      lastBuckets.set(
        scope.agentId,
        bucketOf(memberUsed.get(scope.agentId) ?? 0, memberBudgets.get(scope.agentId) ?? 0)
      );
      gateFor(scope.agentId).open();
      // A turn parked on the team gate too is still parked; only flip it back when both
      // scopes are open, otherwise the snapshot would claim a running turn that is waiting.
      if (!teamGate.isClosed()) {
        const state = agents.get(scope.agentId);
        if (state?.status === 'paused') updateAgent(scope.agentId, { status: 'running' });
      }
    } else {
      // WR-03: read the persisted total inside the call — another writer (a second tab,
      // a restore, applyEvenSplit) may have moved it since construction.
      const current = await getTeam(teamId, db);
      const base = current?.budgetTokens ?? teamBudget;
      const updated = await updateTeam(teamId, { budgetTokens: base + amount }, db);
      teamBudget = updated.budgetTokens;
      lastTeamBucket = bucketOf(teamUsed, teamBudget);
      teamGate.open();
      for (const [agentId, state] of agents) {
        if (state.status === 'paused' && !gateFor(agentId).isClosed()) {
          updateAgent(agentId, { status: 'running' });
        }
      }
    }
    // WR-04: only claim a paused phase when something is actually parked.
    // D-18: this tail runs after two awaits, so a top-up that resolves after `dispose()`
    // must not resurrect `batch-running` on a coordinator that is already gone.
    if (phase === 'awaiting-budget' && !teamGate.isClosed()) {
      const anyLive = [...agents.values()].some(
        (state) => !TERMINAL_STATUSES.includes(state.status)
      );
      setPhase(anyLive ? 'batch-running' : 'ready');
    }
    notify();
  }

  function getRunningCount(): number {
    return scheduler.getRunningCount();
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function getState(): TeamRunSnapshot {
    const paused = [...agents.values()].filter((row) => row.status === 'paused');
    // Only an agent whose own gate is closed needs an agent-scoped top-up; a pause that
    // comes from the team gate alone is fixed by the team top-up.
    const agentParked = paused.find((row) => gateFor(row.agentId).isClosed()) ?? null;
    return {
      phase,
      agents: [...agents.values()],
      pendingPlan,
      pendingApproval,
      pendingSteerMessageIds: [...pendingSteerMessageIds],
      pausedAgentId: agentParked?.agentId ?? null,
      pausedAgentName: agentParked
        ? roster.employees.find((row) => row.id === agentParked.agentId)?.name ??
          (roster.lead && agentParked.agentId === roster.lead.id
            ? roster.lead.name
            // IN-08d: never a raw UUID in UI copy — a neutral label until the roster loads.
            : 'Nhân viên')
        : null,
      lastPlan,
      lastPlanDecision,
    };
  }

  return {
    send,
    finalizeAttempt,
    runBatch: dispatchBatch,
    retryAssignment,
    resolvePlan,
    resolveApproval,
    stopAgent,
    abortAll,
    topUp,
    dispose,
    setTeamSettings,
    setTeamBudget,
    getRunningCount,
    drainSteerInbox: (agentId: string, assignmentId: string) =>
      drainSteerInbox(agentId, { batchId: '', assignmentId, attemptNo: 1 }),
    subscribe,
    getState,
  };
}
