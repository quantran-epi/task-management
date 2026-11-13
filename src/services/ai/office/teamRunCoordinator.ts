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
  DEFAULT_BUDGET_WARN_THRESHOLD_PCT,
  DEFAULT_TEAM_CONCURRENCY,
  RECENT_WINDOW_TURNS,
} from '../../../types/aiOffice';
import type { ChatTokenUsage } from '../../../types/models';
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
  isAtThreshold,
  nextThresholdOverride,
  resolveThresholdPct,
  splitUsage,
} from './budgetGate';
import { dispatchBudgetWarning, resetBudgetWarnings } from './budgetWarning';
import { estimateTokens } from './tokenEstimate';
import { getGlobalBudgetWarnThresholdPct } from '../budgetWarnSettings';
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
  applyTopUp,
  incrementMemberUsage,
  listTeamMembers,
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
import {
  advanceCursor,
  appendForExistingMessage,
  getCursor,
  readMessagesAfter,
} from './teamEventLog';
import { USER_PARTICIPANT_ID } from '../../../types/teamChat';

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
   * D-21: kept for old backups and the banner's legacy shape. Nothing parks for budget any
   * more (D-01), so both fields are always null; the phase value stays legal.
   */
  pausedAgentId: string | null;
  pausedAgentName: string | null;
  /**
   * UI-SPEC §7: the plan stays on screen with its `role="status"` decision line until
   * the next plan replaces it, so the decision is observable.
   */
  lastPlan: AssignmentPlan | null;
  lastPlanDecision: 'approved' | 'rejected' | null;
  /**
   * D-04/D-05: the resolved percentage every badge and colour agrees on. Distinct from the
   * override below: one number for both would make "inherit the global default"
   * unrepresentable (T-38-30).
   */
  budgetWarnThresholdPct: number;
  /** The team's own value; the key is omitted when the team inherits the global default. */
  budgetWarnThresholdPctOverride?: number | undefined;
  /**
   * Phase 38 D-03/D-06: the two independent warning levels. `member` is the aggregate —
   * true while ANY member is at or past its own share; plan 09 renders the per-member badge
   * from `memberUsage` and the same `isAtThreshold` comparison.
   */
  budgetWarnings: { member: boolean; team: boolean };
  /**
   * Phase 38 D-07/D-22: per-request usage. Plan 08 reads `provisionalInputTokens` for the
   * warning; plan 09 renders an estimated number with a `~` marker.
   */
  memberUsage: MemberUsageSnapshot[];
}

export type TopUpScope = { kind: 'agent'; agentId: string } | { kind: 'team' };

/**
 * Phase 38 D-07/D-22: one request's usage, as the snapshot exposes it. `inputTokens` is the
 * reported or terminal-estimated split (0 while the request is still `pending`);
 * `provisionalInputTokens` is the pre-call payload measurement, a warning input that is
 * never charged.
 */
export interface MemberUsageSnapshot {
  agentId: string;
  inputTokens: number;
  outputTokens: number;
  estimated: boolean;
  provisionalInputTokens: number;
}

/** Phase 38 D-07/D-10/D-22: ONE accounting record per agent per request. */
interface UsageAccountingRecord {
  key: string;
  assignmentId?: string | undefined;
  source: 'pending' | 'provider' | 'estimated';
  /** Cumulative provider totals, so a cumulative report is diffed per side. */
  providerTotal: number;
  providerInput: number;
  providerOutput: number;
  /** What the terminal flush will charge. */
  inputTokens: number;
  outputTokens: number;
  /** D-07: the pre-call payload measurement — a warning input, never a charge. */
  provisionalInputTokens: number;
}

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
   * 37.1 §1.1: the single chat box, always usable. The message is appended to the log first,
   * then routed by `to[]`. `'started'` means a turn began; `'steered'` means a live turn will
   * read it at its next round; `'refused'` means the addressed agent already settled (the
   * leader answers instead); `'blocked'` means the coordinator is disposed.
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
   * Phase 38 D-19: mirror a persisted Settings save into live state. The repo already wrote
   * both tables in one transaction, so this method performs NO Dexie write.
   */
  applyBudgetSettings(result: { team: AiTeam; members: AiTeamMember[] }): void;
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
  /**
   * D-04/D-05: the ONE threshold setter. `undefined` means "inherit the global default" and
   * is the only clear mechanism — the drawer's reset control and any unrelated save route
   * through this same call.
   */
  setTeamThresholdPct(pct: number | undefined): void;
  /** D-07 diagnostic seam: live scheduler slots, so a leak is observable without a provider. */
  getRunningCount(): number;
  /**
   * 37.1 SC5 test seam: the inbox drain, so the disposed gate is provable without a provider.
   * Production reaches it through `beforeToolRound`; this exists for the same reason
   * `finalizeAttempt` is exported.
   */
  drainInbox(participantId: string): Promise<ChatCompletionMessage[]>;
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

/**
 * `@[Name](agent:<id>)` — same syntax `ChatMessageBubble.renderUserMessageWithMentions` parses.
 *
 * 37.1 §1.1: this is the USER's way of choosing a recipient ("tag and message directly"). It
 * only translates the mention into `to[]`; `send()` stays the one write path, so there is no
 * second routing mechanism hiding here.
 */
const AGENT_MENTION = /@\[([^\]]+)\]\(agent:([a-zA-Z0-9-]+)\)/g;

const TERMINAL_STATUSES: readonly AgentRunStatus[] = ['done', 'stopped', 'error'];

/** 37.1 D-22: monotonic id source for `AgentLiveStep` — ids are unique, never meaningful. */
let stepSeq = 0;

/**
 * T-37.1-06-05: the snapshot must stay bounded. This ceiling is a DoS guard, not a UX
 * choice — the popover scrolls, so a real run's steps all fit within it.
 */
const MAX_LIVE_STEPS = 200;

/** D-22: a ledger row in one of these is settled — it must never take a second report row. */
const TERMINAL_RUN_STATUSES: ReadonlySet<AiTeamAssignmentRunStatus> = new Set([
  'done',
  'stopped',
  'error',
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

/**
 * 37.1: one routing per lead turn. Returned as a tool result so the model can correct itself
 * instead of silently double-delivering the request.
 */
const ROUTE_ALREADY_CHOSEN_REFUSAL = JSON.stringify({
  refused: true,
  code: 'ROUTE_ALREADY_CHOSEN',
  message:
    'Lượt này đã chọn một đường (giao việc hoặc gửi tin). Không dùng cả hai cho cùng một yêu cầu — hãy trả lời người dùng bằng kết quả đã có.',
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

  /**
   * 37.1 rework: the ONE bit of the phase that genuinely belongs to a turn. Everything else
   * is derived from live state by `derivePhase`, so no branch can leave a stored phase
   * behind — the class of bug that produced "treo đang tổng hợp" is structurally absent.
   *
   * Set at the start of a lead turn, cleared in that turn's `finally` on every branch.
   */
  let leadTurnKind: 'thinking' | 'synthesizing' | null = null;
  /**
   * 37.1: which routing the CURRENT lead turn already chose. A turn may either delegate or
   * message, never both — doing both delivers the same request twice and shows the user two
   * answers. Enforced here, not only in the prompt: a model can ignore a rule.
   */
  let leadTurnRoute: 'delegated' | 'messaged' | null = null;
  /**
   * 37.1 rework: the settle handler's own claim. The batch row is closed BEFORE the synthesis
   * turn starts, so without this flag `derivePhase` would report `ready` in that window and a
   * caller could start a second turn while the first batch's synthesis is still pending.
   * Cleared in `onBatchSettled`'s `finally` on every branch.
   */
  let synthesisPending = false;
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
  /**
   * 37.1 R14: the message each live turn is answering. Set when the turn starts, cleared in
   * its `finally`, so a reply can never be attributed to a previous turn's question.
   */
  const replyTargetByAgent = new Map<string, string>();
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
  /** Reverse of the above: `finalizeAttempt` is handed an assignment id and needs its agent. */
  const agentByAssignmentId = new Map<string, string>();
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

  const memberIds = new Map<string, string>();
  const memberBudgets = new Map<string, number>();
  const memberUsedInput = new Map<string, number>();
  const memberUsedOutput = new Map<string, number>();
  const memberUsed = new Map<string, number>();
  let membersLoaded = false;

  /**
   * Phase 38 D-07/D-10/D-22: ONE accounting record per agent per request. It exists from
   * dispatch (before `registry.start`) and is the only place a turn's usage accumulates —
   * nothing is written to Dexie until the terminal seam flushes it.
   */
  const usageAccounting = new Map<string, UsageAccountingRecord>();
  /** D-24: the flushed-key guard, so a stop/settle race cannot charge one request twice. */
  const flushedAccounting = new Set<string>();
  /** Serializes ledger writes: two attempts settling in one tick must both land. */
  let usageWriteChain: Promise<void> = Promise.resolve();

  let teamUsed = 0;
  let teamBudget = team.budgetTokens;

  /**
   * D-04: the override (what the team stores) and the effective value (what every surface
   * reads) are separate state. The global default is read once at construction and again on
   * every setter call, so the resolved number is never recomputed per report.
   */
  let teamThresholdOverride: number | undefined = team.budgetWarnThresholdPct;
  let globalThresholdPct = DEFAULT_BUDGET_WARN_THRESHOLD_PCT;
  let budgetWarnThresholdPct = resolveThresholdPct(
    { budgetWarnThresholdPct: teamThresholdOverride },
    globalThresholdPct
  );

  function recomputeThresholdPct(): void {
    budgetWarnThresholdPct = resolveThresholdPct(
      { budgetWarnThresholdPct: teamThresholdOverride },
      globalThresholdPct
    );
    if (teamThresholdOverride !== undefined) {
      liveTeam = { ...liveTeam, budgetWarnThresholdPct: teamThresholdOverride };
    }
  }

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
  const notify = () => {
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        /* a subscriber must never break the run */
      }
    }
  };

  // D-04: the global default arrives asynchronously; the effective value updates without
  // blocking construction. A failure keeps the documented default rather than throwing.
  void getGlobalBudgetWarnThresholdPct(db)
    .then((value) => {
      globalThresholdPct = value;
      recomputeThresholdPct();
      notify();
    })
    .catch(() => {
      /* the default 80 already stands */
    });

  /**
   * 37.1 rework: the phase is DERIVED from live state — never stored. There is no setter to
   * forget, so a phase cannot outlive the condition that justifies it.
   *
   * Every input below is a
   * fact about right now:
   *   1. a pending mutation approval   → awaiting-mutation-approval
   *   2. a plan card waiting on a click→ awaiting-plan
   *   3. a lead turn in flight         → lead-thinking / lead-synthesizing
   *   4. an open batch, or a live agent→ batch-running
   *   5. otherwise                     → ready (idle before the first turn)
   *
   * D-01: a budget crossing has NO phase. The run stays `batch-running`/`lead-thinking`;
   * the legacy parked phase value survives only as a legal value for old backups.
   */
  const derivePhase = (): TeamRunPhase => {
    if (pendingApproval !== null) return 'awaiting-mutation-approval';
    if (pendingPlan !== null) return 'awaiting-plan';
    if (leadTurnKind === 'synthesizing') return 'lead-synthesizing';
    if (leadTurnKind === 'thinking') return 'lead-thinking';
    if (synthesisPending) return 'lead-synthesizing';
    // A retry claims its guard synchronously, before any await, so this is the synchronous
    // "work is in flight" signal. Without it two same-tick clicks on different bubbles both
    // pass the guard and both synthesize.
    if (retryingAssignments.size > 0) return 'batch-running';
    if (openBatchId !== null) return 'batch-running';
    for (const row of agents.values()) {
      if (!TERMINAL_STATUSES.includes(row.status)) return 'batch-running';
    }
    // `idle` and `ready` both mean "not busy" — the distinction was only ever "never used
    // yet", which no caller needs. Reporting `ready` keeps the coordinator's own snapshot
    // honest after a dispose or a remount (the workspace's EMPTY_SNAPSHOT is the only place
    // `idle` is still meaningful, and that exists before a coordinator does).
    return 'ready';
  };

  /**
   * 37.1 §5: "is the team busy" must be asked of the live state, never of a phase label —
   * a label that was ever wrong made the answer wrong.
   */
  const isBusy = (): boolean => {
    if (pendingApproval !== null || pendingPlan !== null) return true;
    if (leadTurnKind !== null || synthesisPending) return true;
    if (retryingAssignments.size > 0 || openBatchId !== null) return true;
    for (const row of agents.values()) {
      if (!TERMINAL_STATUSES.includes(row.status)) return true;
    }
    return false;
  };

  const registry: TeamRunRegistry = createTeamRunRegistry((agentId) =>
    buildRuntimeDeps(agentId)
  );

  const teamTurnId = `team:${teamId}`;
  const agentTurnId = (agentId: string) => `team:${teamId}:agent:${agentId}`;

  /**
   * One lead runtime runs ONE turn at a time — a runtime constraint, not a phase. The
   * consumer loop already serializes log-driven turns by cursor; this chain additionally
   * orders a log-driven turn against the synthesis turn, which is not a message.
   */
  function withLeadRuntime(task: () => Promise<void>): Promise<void> {
    leadTurnChain = leadTurnChain.then(task, task).catch(() => {});
    return leadTurnChain;
  }

  /**
   * 37.1 §4.2: the lead consumer's `handle`. A message addressed to the lead opens a turn;
   * the turn's own round boundary drains whatever else arrived in the meantime.
   */
  async function runLeadTurn(
    text: string,
    batchResults?: readonly BatchResult[],
    announcedPhase: 'lead-thinking' | 'lead-synthesizing' = 'lead-thinking',
    triggerMessageId?: string
  ): Promise<void> {
    if (disposed) return;
    registerTeamTurn();
    try {
      // WR-02: `dispose()` can land while this task waits behind another lead turn. Without
      // this check the turn runs against a deleted team and writes orphan rows.
      await withLeadRuntime(async () => {
        if (disposed) return;
        await startLeadTurn(text, batchResults, announcedPhase, triggerMessageId);
      });
    } finally {
      // D-24: one team turn spans dispatch + batch + synthesis. An open batch owns the turn,
      // so `onBatchSettled` finishes it instead. Derived from `openBatchId`, never stored —
      // a flag would need a reset on every path and could outlive its condition.
      if (openBatchId === null) aiTurnManager.finishTurn(teamTurnId);
    }
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
   * 37.1 D-22: one live step for the indicator popover. Bounded at `MAX_LIVE_STEPS` — a
   * long turn must not grow the snapshot without limit (T-37.1-06-05), but the cap is far
   * above what a user reads at a glance, so the popover can show the whole run. A repeated
   * label is dropped so a `streaming` status that fires per token cannot force a re-render
   * per delta.
   */
  function pushStep(agentId: string, label: string, detail?: string): void {
    const state = agents.get(agentId);
    if (!state) return;
    const steps = state.steps ?? [];
    if (steps[steps.length - 1]?.label === label) return;
    stepSeq += 1;
    const next = [
      ...steps,
      {
        id: 'step-' + stepSeq,
        label,
        at: new Date().toISOString(),
        ...(detail !== undefined ? { detail } : {}),
      },
    ];
    updateAgent(agentId, { steps: next.slice(-MAX_LIVE_STEPS) });
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
    // Phase 38 D-22/R2-B3: the terminal seam runs BEFORE the transaction. The flush's own
    // `rw` scope must complete first (Dexie cannot nest them), and the attempt patch below
    // must never snapshot a pre-estimation value.
    const accountingAgentId = agentByAssignmentId.get(assignmentId);
    const flushed =
      accountingAgentId !== undefined
        ? await flushAccounting(accountingAgentId)
        : { inputTokens: 0, outputTokens: 0, estimated: false };
    // Only the caller that actually committed the terminal write notifies; a losing
    // concurrent caller must not emit a second `message_saved` for the same commit.
    let committed = false;
    // WR-04: the insert branch writes a bubble no other path logs. Remembered in a holder
    // (not a nullable local — TS narrows those to `never` across the closure) so the append
    // can run after the commit; Dexie cannot nest `rw` scopes.
    const inserted: { row?: { id: string; agentId: string; content: string; createdAt: string } } = {};

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
          const reportCreatedAt = new Date().toISOString();
          inserted.row = {
            id: reportId,
            agentId: row.agentId,
            content: contentWhenMissing,
            createdAt: reportCreatedAt,
          };
          await insertReportMessage(
            {
              id: reportId,
              threadId,
              content: contentWhenMissing,
              createdAt: reportCreatedAt,
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
        // Phase 38 D-11: the attempt row carries its OWN usage, stamped from the flushed
        // triple — a retry's second row records its own numbers instead of overwriting.
        const transitioned = await transitionAssignment(
          assignmentId,
          from,
          to,
          {
            endedAt: new Date().toISOString(),
            stopReason,
            reportMessageId: reportId,
            incomplete: to !== 'done',
            inputTokens: flushed.inputTokens,
            outputTokens: flushed.outputTokens,
            ...(flushed.estimated ? { usageEstimated: true } : {}),
            ...(diagnosticDetail !== undefined ? { diagnosticDetail } : {}),
          },
          db
        );
        if (transitioned !== null) committed = true;
        return transitioned;
      }
    );

    if (committed) {
      // Phase 38 D-22: the live counters converge to the ledger once the attempt is over.
      // After the commit, never inside it — Dexie cannot nest `rw` scopes.
      try {
        await reconcileUsage();
      } catch {
        /* a reconcile must never fail the terminal write */
      }
      // After the commit, never inside it: one owner, and the row and the notification
      // carry the same `threadId` value.
      notifyAIChatSync({ type: 'message_saved', threadId });
    }
    // WR-04 / R1: a report this call INSERTED is a real message in the conversation, so it
    // must be in the log too — otherwise a stopped/errored agent's bubble is absent from
    // every cursor and the log stops describing the conversation it claims to record.
    // Appended after the transaction: `appendForExistingMessage` opens its own `rw` scope.
    const insertedRow = inserted.row;
    if (committed && insertedRow !== undefined && roster.lead) {
      await appendForExistingMessage(
        {
          id: insertedRow.id,
          teamId,
          from: insertedRow.agentId,
          to: [roster.lead.id],
          content: insertedRow.content,
          kind: 'report',
          assignmentId,
          ...(finalized?.instructionMessageId !== undefined
            ? { replyToId: finalized.instructionMessageId }
            : {}),
          createdAt: insertedRow.createdAt,
        },
        db
      );
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
      if (agentByAssignmentId.get(finalized.id) === finalized.agentId) {
        agentByAssignmentId.delete(finalized.id);
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

      // 37.1 D-27: the leader's one mid-run mutation. Same lead-only shape as `delegate_batch`.
      if (normalized === 'amend_assignments') {
        if (!roster.lead || agentId !== roster.lead.id) return EMPLOYEE_AMEND_REFUSAL;
        return amendAssignments(args ?? {});
      }

      // 37.1 R6/R9: `send_message` is the one team tool with a side effect beyond its own
      // row — it starts turns — so it is intercepted before the generic team-tool branch.
      if (normalized === 'send_message') {
        return sendFromParticipant(agentId, args ?? {});
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
        const replyToId = replyTargetByAgent.get(agentId);
        const row = await innerSaveMessage(
          replyToId !== undefined && input.role === 'assistant'
            ? { ...input, replyToId }
            : input,
          inputDb ?? db
        );
        // D-12/T-37-25: remember the synthesis row so a re-synthesis can mark it superseded.
        if (input.role === 'assistant' && input.messageKind === 'synthesis') {
          lastSynthesisMessageId = row.id;
          // 37.1 R1: the synthesis is the leader's message to the USER. Agents read it (their
          // cursor covers the whole log) but owe no reply — addressing them would inject the
          // synthesis into their next tool round and make them answer it.
          if (roster.lead) {
            await appendForExistingMessage(
              {
                id: row.id,
                teamId,
                from: roster.lead.id,
                to: [USER_PARTICIPANT_ID],
                content: row.content,
                kind: 'synthesis',
                ...(replyTargetByAgent.get(agentId) !== undefined
                  ? { replyToId: replyTargetByAgent.get(agentId)! }
                  : {}),
                createdAt: row.createdAt,
              },
              db
            );
          }
        }
        const active = activeAssignmentByAgent.get(agentId);
        if (!active || input.role !== 'assistant' || input.messageKind !== 'report') {
          // 37.1: a turn started by a mention or by `send_message` has NO assignment, so the
          // branch below never ran and this answer was never logged. Without a log row no
          // cursor covers it, so the user never saw a read receipt on the agent's reply —
          // the one direction UAT caught. Every assistant answer is a message to the lead.
          if (
            !active &&
            input.role === 'assistant' &&
            input.messageKind === 'report' &&
            roster.lead
          ) {
            await appendForExistingMessage(
              {
                id: row.id,
                teamId,
                from: agentId,
                to: [roster.lead.id],
                content: row.content,
                kind: 'report',
                ...(replyTargetByAgent.get(agentId) !== undefined
                  ? { replyToId: replyTargetByAgent.get(agentId)! }
                  : {}),
                createdAt: row.createdAt,
              },
              db
            );
          }
          return row;
        }
        // One transaction so this stamp and a racing `finalizeAttempt` cannot interleave:
        // Dexie serializes `rw` scopes, so either the attempt is still live here (stamp, and
        // the terminal writer patches THIS row) or it already settled (this row arrived after
        // the terminal one — drop it, or the attempt would own two report bubbles).
        let kept = false;
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
          kept = true;
        });
        // 37.1 R1: the report is a real message (agent → lead). Logged only when the report
        // row survived — a superseded report was deleted above and must not be in the log.
        // Appended outside the transaction: `appendForExistingMessage` opens its own `rw`
        // scope on `teamMessages`, which Dexie cannot nest inside this one.
        if (kept) {
          await appendForExistingMessage(
            {
              id: row.id,
              teamId,
              from: agentId,
              to: [roster.lead?.id ?? USER_PARTICIPANT_ID],
              content: row.content,
              kind: 'report',
              assignmentId: active.assignmentId,
              ...(replyTargetByAgent.get(agentId) !== undefined
                ? { replyToId: replyTargetByAgent.get(agentId)! }
                : {}),
              createdAt: row.createdAt,
            },
            db
          );
        }
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
      // A tool result is noise at this altitude; only the call is a step. 37.1 UAT: the
      // serialized args are kept so the popover can expand a step into its detail.
      onToolEvent: (event) => {
        if (event.phase !== 'call') return;
        pushStep(
          agentId,
          event.name === 'read_skill' ? 'đã đọc skill' : 'đang gọi tool ' + event.name,
          event.args
        );
      },
      onCompleted: ({ content }) => settleAgent(agentId, 'done', content),
      onError: () => settleAgent(agentId, 'error', SANITIZED_TURN_ERROR),
      onUsage: (usage) => handleUsage(agentId, usage, usageBaselineKey.get(agentId) ?? agentId),
      onAwaitingApproval: (info) => {
        pendingApproval = info;
        // The card is rendered from the snapshot, and no status transition follows this
        // callback — without the notify the approval card never appears and the turn parks
        // forever behind a prompt nobody can see.
        notify();
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
      memberUsedInput.set(row.agentId, row.inputTokens ?? 0);
      memberUsedOutput.set(row.agentId, row.outputTokens ?? 0);
    }
    // CR-01: the persisted team row is the budget authority once a turn supplies it.
    // Without this a budget edited in another tab (or restored) is ignored.
    const persistedBudget = roster.teamRow?.budgetTokens;
    if (persistedBudget !== undefined) teamBudget = persistedBudget;
    // CR-05: the team total must hydrate from persisted usage too, otherwise a reactivated
    // team starts over with a full budget.
    teamUsed = rows.reduce((sum, row) => sum + row.usedTokens, 0);
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
   *
   * Phase 38 D-22: memory only. The ledger is written once, at the terminal seam — a
   * per-report write would both diverge from the live counter and double-charge the flush.
   */
  function handleUsage(agentId: string, usage: ChatTokenUsage, accountingKey: string): void {
    const acc = usageAccounting.get(agentId);
    // T-38-28: a report for a superseded turn or attempt must never charge the current one —
    // and a late report for an already-flushed request must never charge it a second time.
    if (!acc || acc.key !== accountingKey || flushedAccounting.has(acc.key)) return;
    const split = splitUsage(usage);
    // D-10: an empty report leaves the request `pending`, so the terminal seam estimates it.
    if (split.inputTokens + split.outputTokens <= 0) return;
    const cumulative = split.inputTokens + split.outputTokens;
    if (cumulative - acc.providerTotal <= 0) return;
    // Per-side deltas, so a cumulative report is diffed on each half, not just in aggregate.
    const inputDelta = Math.max(0, split.inputTokens - acc.providerInput);
    const outputDelta = Math.max(0, split.outputTokens - acc.providerOutput);
    acc.providerTotal = cumulative;
    acc.providerInput = split.inputTokens;
    acc.providerOutput = split.outputTokens;
    acc.inputTokens += inputDelta;
    acc.outputTokens += outputDelta;
    acc.source = 'provider';
    // D-07: the reported number REPLACES the pre-call guess instead of stacking on it.
    acc.provisionalInputTokens = 0;
    // The provisional guess never entered the live maps, so the reported delta is applied whole.
    applyLiveUsage(agentId, inputDelta, outputDelta);
  }

  /**
   * The live counters plus the derived total.
   *
   * D-01: a crossing is never a decision — it raises a warning and the run continues. An
   * estimated charge moves the numbers and may warn too; nothing here can park a turn.
   */
  function applyLiveUsage(agentId: string, inputDelta: number, outputDelta: number): void {
    if (inputDelta === 0 && outputDelta === 0) return;
    memberUsedInput.set(agentId, (memberUsedInput.get(agentId) ?? 0) + inputDelta);
    memberUsedOutput.set(agentId, (memberUsedOutput.get(agentId) ?? 0) + outputDelta);
    memberUsed.set(agentId, (memberUsed.get(agentId) ?? 0) + inputDelta + outputDelta);
    teamUsed += inputDelta + outputDelta;
    evaluateBudgetWarnings();
  }

  /** D-07: a member's live total, plus the pre-call guess until a report supersedes it. */
  function memberWarningTotal(agentId: string): number {
    const provisional = usageAccounting.get(agentId)?.provisionalInputTokens ?? 0;
    return (memberUsedInput.get(agentId) ?? 0) + (memberUsedOutput.get(agentId) ?? 0) + provisional;
  }

  function percentOf(used: number, budget: number): number {
    if (!Number.isFinite(budget) || budget <= 0) return 0;
    return (used / budget) * 100;
  }

  function agentNameFor(agentId: string): string | undefined {
    return (
      roster.employees.find((row) => row.id === agentId)?.name ??
      (roster.lead && roster.lead.id === agentId ? roster.lead.name : undefined)
    );
  }

  /**
   * D-03/D-06/D-07: evaluate BOTH levels independently, in a fixed order (member, then
   * team), and dispatch at most one notification per `(teamId, level)` — the marker set in
   * `budgetWarning` owns the dedupe, so firing on every observation is safe.
   *
   * Pure over live maps apart from the dispatch: it never writes a counter, never touches
   * the ledger, and never parks a turn. A member whose agent row is missing from the
   * directory still warns — the notification key is the team and the level, never the name.
   */
  function evaluateBudgetWarnings(): void {
    const candidates = new Set([...memberBudgets.keys(), ...memberUsed.keys()]);
    for (const agentId of candidates) {
      const budget = memberBudgets.get(agentId) ?? 0;
      if (!isAtThreshold(memberWarningTotal(agentId), budget, budgetWarnThresholdPct)) continue;
      void dispatchBudgetWarning({
        level: 'member',
        teamId,
        teamName: liveTeam.name,
        usedPct: percentOf(memberWarningTotal(agentId), budget),
        agentName: agentNameFor(agentId),
      });
      break;
    }
    if (isAtThreshold(teamUsed, teamBudget, budgetWarnThresholdPct)) {
      void dispatchBudgetWarning({
        level: 'team',
        teamId,
        teamName: liveTeam.name,
        usedPct: percentOf(teamUsed, teamBudget),
      });
    }
  }

  /** D-03: the aggregate badge state — true while ANY member is at or past its own share. */
  function anyMemberAtThreshold(): boolean {
    for (const agentId of new Set([...memberBudgets.keys(), ...memberUsed.keys()])) {
      if (isAtThreshold(memberWarningTotal(agentId), memberBudgets.get(agentId) ?? 0, budgetWarnThresholdPct)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Phase 38 D-07: the exact text handed to the model. Used at BOTH boundaries — the pre-call
   * measurement and the terminal estimate — so the measured text and the charged text cannot
   * drift. Never the user's `text` alone: system messages, history and serialized tool
   * schemas are re-sent every round and are the bulk of the prompt.
   */
  function payloadText(request: ChatTurnRequest): string {
    return [
      ...request.systemMessages.map((message) => message.content),
      ...request.history.map((message) => message.content),
      request.text,
      JSON.stringify(request.tools ?? []),
    ].join('\n');
  }

  /**
   * D-07: measure the outgoing payload BEFORE the model call. Warning-only: a throw or a slow
   * encoder leaves the count at 0 and the turn is dispatched regardless — the estimate is
   * never consulted for a decision, and it is never added to the ledger.
   *
   * The number lives on the accounting record (and so on `getState().memberUsage`), NOT in the
   * live charge maps: it feeds the warning math only, and `handleUsage` zeroes it the moment a
   * provider report supersedes it, so a turn can never be counted twice toward the threshold.
   */
  async function measureProvisionalInput(agentId: string, request: ChatTurnRequest): Promise<void> {
    const acc = usageAccounting.get(agentId);
    if (!acc) return;
    try {
      const tokens = await estimateTokens(payloadText(request));
      // A turn may have been superseded while the encoder ran; never stamp a stale record.
      if (usageAccounting.get(agentId) !== acc) return;
      acc.provisionalInputTokens = tokens;
      // D-07: a prompt that already blows the share warns at dispatch, before the call.
      evaluateBudgetWarnings();
    } catch {
      /* warning input only, never blocks the turn */
    }
  }

  /**
   * Phase 38 D-07/D-10: a request lifecycle starts at DISPATCH, before `registry.start`.
   * It exists whether or not any `onUsage` ever fires, which is what makes a callback-less
   * request chargeable instead of free.
   */
  function beginRequestAccounting(agentId: string, key: string, assignmentId?: string): void {
    usageAccounting.set(agentId, {
      key,
      ...(assignmentId !== undefined ? { assignmentId } : {}),
      source: 'pending',
      providerTotal: 0,
      providerInput: 0,
      providerOutput: 0,
      inputTokens: 0,
      outputTokens: 0,
      provisionalInputTokens: 0,
    });
  }

  /**
   * Phase 38 D-22: THE terminal seam. One ledger increment per accounting key, serialized on
   * one promise chain so two attempts settling in the same tick both land. The key is marked
   * flushed BEFORE the await, so a stop/settle race cannot charge twice (T-38-28).
   *
   * Returns the flushed triple so `finalizeAttempt` can stamp the attempt row with the same
   * numbers it charged — never a re-read that could see a later turn's record.
   */
  async function flushAccounting(
    agentId: string
  ): Promise<{ inputTokens: number; outputTokens: number; estimated: boolean }> {
    const acc = usageAccounting.get(agentId);
    if (!acc || flushedAccounting.has(acc.key)) {
      return { inputTokens: 0, outputTokens: 0, estimated: false };
    }
    flushedAccounting.add(acc.key);
    // D-10/D-12: a request that reported nothing is ESTIMATED here, exactly once — from the
    // payload it actually sent and the text it actually received. Never free, never silent.
    if (acc.source === 'pending') {
      try {
        const request = currentRequests.get(agentId);
        const outputText = agents.get(agentId)?.streamingText ?? '';
        const inputTokens = await estimateTokens(request ? payloadText(request) : '');
        const outputTokens = await estimateTokens(outputText);
        acc.source = 'estimated';
        acc.inputTokens = inputTokens;
        acc.outputTokens = outputTokens;
        // The estimate REPLACES the pre-call guess instead of stacking on it.
        acc.provisionalInputTokens = 0;
        applyLiveUsage(agentId, inputTokens, outputTokens);
      } catch {
        // D-10: a failed estimate falls back to whatever the provider reported (usually
        // nothing) and still completes the flush — the turn must not be blocked by it.
        acc.source = 'provider';
        acc.inputTokens = 0;
        acc.outputTokens = 0;
      }
    }
    const delta = {
      inputTokens: acc.inputTokens,
      outputTokens: acc.outputTokens,
      estimated: acc.source === 'estimated',
    };
    // D-10: an estimate is never skipped, even at 0/0 — the row must be marked estimated
    // rather than silently recorded as free. A reported 0/0 is a no-op.
    const nothingToCharge = delta.inputTokens === 0 && delta.outputTokens === 0;
    if (nothingToCharge && !delta.estimated) return delta;
    const memberId = memberIds.get(agentId);
    if (!memberId) return delta;
    // A failed ledger write must never break the turn (D-22), so the chain swallows it.
    usageWriteChain = usageWriteChain.then(() =>
      incrementMemberUsage(memberId, delta, db).then(
        () => undefined,
        () => undefined
      )
    );
    await usageWriteChain;
    // The record keeps its numbers after the flush: `getState().memberUsage` must still show
    // what was charged, and the flushed-key guard (not a zeroed record) is what prevents a
    // second charge. The next dispatch overwrites the whole record.
    // Plan 09's `~` marker reads this; the UI sees the reconciled figure once, here.
    notify();
    return delta;
  }

  /**
   * Phase 38 D-22 reconcile: after a terminal flush the live counters are re-read from Dexie,
   * so the number the header showed mid-turn converges to the ledger once the attempt is over.
   */
  async function reconcileUsage(): Promise<void> {
    await usageWriteChain;
    const rows = await listTeamMembers(teamId, db);
    for (const row of rows) {
      memberUsed.set(row.agentId, row.usedTokens);
      memberUsedInput.set(row.agentId, row.inputTokens ?? 0);
      memberUsedOutput.set(row.agentId, row.outputTokens ?? 0);
    }
    teamUsed = rows.reduce((sum, row) => sum + row.usedTokens, 0);
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

  function beforeToolRoundFor(agentId: string, triggerMessageId?: string) {
    // D-01: budget never parks a turn — no gate, no wait, no `paused` status write. This
    // round boundary only drains the inbox and honours the loop's own abort signal.
    // 37.1 §4.2: the drain's returned messages are appended by the loop.
    // CR-01: the row that triggered this turn is already the prompt text, so it must not be
    // injected again on round 1.
    const skip = triggerMessageId ? new Set([triggerMessageId]) : undefined;
    return async (
      _round: number,
      signal: AbortSignal
    ): Promise<ChatCompletionMessage[] | void> => {
      signal.throwIfAborted();
      return drainInbox(agentId, skip);
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
    attempt?: AttemptRef,
    /**
     * CR-01: the log row whose text IS this turn's instruction. Its own round-1 drain must
     * skip it, or the model reads its trigger twice. `attempt.instructionMessageId` covers
     * the dispatch path; a mention-started turn passes the user row's id here.
     */
    triggerMessageId?: string
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
        beforeToolRound: beforeToolRoundFor(
          employee.id,
          triggerMessageId ?? attempt?.instructionMessageId
        ),
      };

      currentRequests.set(employee.id, request);
      userStopped.delete(employee.id);
      // CR-01: each turn's usage total restarts at zero, so the cumulative baseline
      // must reset too — otherwise the second turn's delta is zero or negative.
      // D-24: the baseline is keyed per TURN, so a still-running turn's key is never deleted.
      employeeTurnSeq += 1;
      const accountingKey = `${employee.id}:${employeeTurnSeq}`;
      usageBaselineKey.set(employee.id, accountingKey);
      // Phase 38 D-07/D-22: the request lifecycle starts HERE, before dispatch, so a turn
      // that never reports usage is still chargeable at its terminal seam.
      beginRequestAccounting(employee.id, accountingKey, attempt?.assignmentId);
      // D-07: measured before dispatch, so the warning sees a number from the first round.
      await measureProvisionalInput(employee.id, request);
      // D-13: the batch's employees are only known here, so this is where they claim live use.
      claimLiveUse(employee.id, employee.skillId);
      // 37.1 R14: what this turn is answering. A dispatch answers its instruction row; a
      // mention-started turn answers the user's message. Cleared in the `finally` below.
      const replyTarget = triggerMessageId ?? attempt?.instructionMessageId;
      if (replyTarget !== undefined) replyTargetByAgent.set(employee.id, replyTarget);
      else replyTargetByAgent.delete(employee.id);
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
      // 37.1 R14: the reply target belongs to THIS turn; a later turn must not inherit it.
      replyTargetByAgent.delete(employee.id);
      // Phase 38 D-22: the terminal seam for a turn with NO attempt row (a mention-started
      // turn). Idempotent for attempt turns — `finalizeAttempt` already flushed this key.
      try {
        await flushAccounting(employee.id);
        await reconcileUsage();
      } catch {
        /* usage accounting must never break the turn */
      }
    }
  }

  async function startLeadTurn(
    text: string,
    batchResults?: readonly BatchResult[],
    /**
     * 37.1 UAT gap 6: the phase this turn announces. The synthesis turn must not overwrite
     * `lead-synthesizing` with `lead-thinking` — that made the "đang tổng hợp" verb
     * unreachable and left the user reading "đang phân tích" during synthesis.
     */
    announcedPhase: 'lead-thinking' | 'lead-synthesizing' = 'lead-thinking',
    /** CR-01: the row already rendered as this turn's prompt; its drain must skip it. */
    triggerMessageId?: string
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
        beforeToolRound: beforeToolRoundFor(lead.id, triggerMessageId),
      };

      currentRequests.set(lead.id, request);
      userStopped.delete(lead.id);
      // CR-01: same baseline reset as the employee path. D-24: keyed per turn, so the
      // dispatch turn's baseline survives the synthesis turn that follows it.
      leadTurnSeq += 1;
      const leadAccountingKey = `${lead.id}:${leadTurnSeq}`;
      usageBaselineKey.set(lead.id, leadAccountingKey);
      // Phase 38 D-07/D-22: same lifecycle marker as the employee path. A leader turn has no
      // attempt row, but its usage still has to be charged and reconciled.
      beginRequestAccounting(lead.id, leadAccountingKey);
      await measureProvisionalInput(lead.id, request);
      // D-13: leads have no skill, so the claim carries an empty skill list.
      claimLiveUse(lead.id, undefined);
      // 37.1 R14: the synthesis answers the batch; a chat turn answers the user's message.
      if (triggerMessageId !== undefined) replyTargetByAgent.set(lead.id, triggerMessageId);
      else replyTargetByAgent.delete(lead.id);
      updateAgent(lead.id, {
        status: 'running',
        streamingText: '',
        startedAt: new Date().toISOString(),
        steps: [],
      });
      registerAgentTurn(lead.id, lead.name);
      // 37.1 rework: `phase` is DERIVED (see `derivePhase`), so a turn only records which
      // kind of lead turn it is. The `finally` below clears it, and because it is a plain
      // flag owned by the turn it cannot outlive the turn the way a stored phase could.
      leadTurnKind = announcedPhase === 'lead-synthesizing' ? 'synthesizing' : 'thinking';
      leadTurnRoute = null;

      const outcome = await registry.get(lead.id).start(request);
      settleAgent(lead.id, OUTCOME_STATUS[outcome.phase]);
      // Phase 38 D-22: a leader turn never calls `finalizeAttempt`, so this is its terminal
      // seam — flush, then reconcile, before the `finally`'s `notify()`.
      await flushAccounting(lead.id);
      await reconcileUsage();
    } catch (err) {
      // WR-01: same leak as the employee path — release before rethrowing. The lead is not
      // an assignment, so there is no ledger row to finalize here.
      releaseLiveUse(lead.id);
      settleAgent(lead.id, 'error');
      // D-10/D-12: a failed or aborted leader turn is still charged, never free.
      try {
        await flushAccounting(lead.id);
        await reconcileUsage();
      } catch {
        /* usage accounting must never mask the turn's own error */
      }
      throw err;
    } finally {
      // Idempotent safety net: the flushed-key guard makes a second call a no-op.
      try {
        await flushAccounting(lead.id);
      } catch {
        /* usage accounting must never break the turn */
      }
      // 37.1 rework: the ONE place the lead turn's own flag is cleared, on every branch —
      // normal return, parked return, throw. A derived phase needs no other reset.
      leadTurnKind = null;
      leadTurnRoute = null;
      agentDeferreds.delete(lead.id);
      replyTargetByAgent.delete(lead.id);
      notify();
    }
  }

  /**
   * 37.1 R12: EVERY mention in the message, in order, deduplicated. Tagging two agents sends
   * ONE message addressed to both — the same thing a group chat does when you @ two people.
   */
  function parseMentionTargets(text: string): AiEmployee[] {
    const found: AiEmployee[] = [];
    for (const match of text.matchAll(AGENT_MENTION)) {
      const id = match[2];
      if (found.some((row) => row.id === id)) continue;
      const employee = roster.employees.find((row) => row.id === id);
      if (!employee) continue;
      // AIO-TEAM-04: only this team's members are addressable. A non-member has no
      // aiTeamMembers row, so its budget is 0 and the turn would park forever.
      if (!memberIds.has(employee.id)) continue;
      found.push(employee);
    }
    return found;
  }

  /**
   * 37.1 §4.2: the ONE inbox drain. A message reaches a running turn here — at the next
   * tool round, which is where `beforeToolRound` already lands. There is no separate
   * "steer" concept, no delivery tool, and no approval gate: the cursor is the read receipt.
   *
   * The cursor advances over the WHOLE log (so "seen" is real), but only messages that name
   * this participant are returned for injection.
   *
   * `skipIds` are messages whose text is ALREADY in this turn's prompt — the row that
   * triggered the turn. Without this the model reads its own trigger twice (once as the
   * prompt, once as an injected message), which is a real regression: the deleted steer
   * turn carried exactly this skip set. They are still READ (the cursor advances past
   * them), just not re-injected.
   */
  async function drainInbox(
    participantId: string,
    skipIds?: ReadonlySet<string>
  ): Promise<ChatCompletionMessage[]> {
    if (disposed) return [];
    const cursor = await getCursor(teamId, participantId, db);
    const batch = await readMessagesAfter(teamId, cursor.lastSeq, db);
    if (batch.length === 0) return [];
    // SC5: a teardown that landed during the read must not consume messages nobody read.
    if (disposed) return [];
    // Advance BEFORE returning: the loop appends these to the very next model call, so the
    // read has happened. A teardown must not consume a message nobody read.
    await advanceCursor(teamId, participantId, batch[batch.length - 1]!.seq, db);
    notify();
    return batch
      .filter(
        (message) =>
          message.to.includes(participantId) && skipIds?.has(message.id) !== true
      )
      .map((message) => ({
        role: 'user' as const,
        // The sender is named: an anonymous user-role message is indistinguishable from the
        // prompt itself, and agent reports must not read as if the user said them.
        content: `[Tin nhắn từ nhóm — ${message.from}] ${message.content}`,
      }));
  }

  /**
   * 37.1 D-06/D-07/D-08: the leader's ONE mid-run mutation — cancel or rewrite a `queued`
   * assignment, applied immediately. A `running` assignment is refused (a message reaches
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
    // WR-02 (pass 7): the cause is per entry — one rewrite can lose the race while another's
    // replacement write fails, and a single call-wide message would then describe one of them
    // wrongly.
    const refused: Array<{ assignmentId: string; code: 'NOT_QUEUED'; cause: 'race' | 'write' }> =
      [];
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
        refused.push({ assignmentId: row.id, code: 'NOT_QUEUED', cause: 'race' });
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
        refused.push({ assignmentId: row.id, code: 'NOT_QUEUED', cause: 'race' });
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
        // WR-02 (pass 6/7): the cause is a failed replacement write, not a row that started
        // running — the old row is already `skipped` and the transcript says so. Reporting
        // "vừa bắt đầu chạy" would be a false statement the leader repeats to the user.
        refused.push({ assignmentId: row.id, code: 'NOT_QUEUED', cause: 'write' });
        continue;
      }
      // WR-04: the map moves before the replacement can be settled by the retired dispatch's
      // catch — its identity guard then rejects the old attempt's settle.
      assignmentIdsByAgent.set(row.agentId, next.id);
      agentByAssignmentId.set(next.id, row.agentId);
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
      // WR-02 (pass 7): describe each cause honestly. A write failure means the old row was
      // already stopped and no replacement exists; a lost race means the row is running now.
      const writeFailed = refused.some((entry) => entry.cause === 'write');
      const raceLost = refused.some((entry) => entry.cause === 'race');
      const message = writeFailed
        ? raceLost
          ? 'Một số việc không tạo được bản sửa, một số việc khác vừa bắt đầu chạy. Hãy kiểm tra lại danh sách việc.'
          : 'Một số việc không tạo được bản sửa. Việc cũ đã dừng, hãy giao lại nếu cần.'
        : 'Một số việc vừa bắt đầu chạy nên không sửa được. Việc đang chạy chỉ nhận chỉ đạo.';
      return JSON.stringify({
        applied,
        refused: true,
        code: 'NOT_QUEUED',
        message,
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
    // D-06: a new turn is a reset — the next crossing notifies again. Team-scoped only.
    resetBudgetWarnings(teamId);
    lastUserRequest = text;

    // 37.1 §1.1: ONE primitive. The message is appended first — always, whatever is running.
    // `to[]` is who must RESPOND; everyone reads it, so the leader can see a message the user
    // sent to Eva and intervene, and the user can ask the leader to check it.
    const targets = parseMentionTargets(text);
    // R12: one message, many addressees. A plain message (no tag) goes to the leader.
    const recipients = targets.length > 0 ? targets.map((row) => row.id) : [];
    if (recipients.length === 0 && roster.lead) recipients.push(roster.lead.id);

    const row = await saveTeamMessage(
      { threadId: options.threadId, role: 'user', content: text },
      db
    );
    // WR-05: a team with no lead has nobody to answer a plain message. The old code saved the
    // row, appended nothing and returned `'started'` — a silent drop that looked like success.
    // The message stays in the transcript (the user's text is never lost) but it is NOT
    // appended to the log, because the log is the addressing record and there is no addressee.
    // The caller turns this into a visible refusal.
    if (recipients.length === 0) {
      notify();
      return 'refused';
    }
    await appendForExistingMessage(
      {
        id: row.id,
        teamId,
        from: USER_PARTICIPANT_ID,
        to: recipients,
        content: text,
        kind: targets.length > 0 ? 'instruction' : 'chat',
        createdAt: row.createdAt,
      },
      db
    );
    notify();
    if (disposed) return 'steered';

    // AIO-LEAD-03: a mention is a direct instruction. If the agent is live it reads the
    // message at its next tool round; if the team is idle it starts a turn of its own.
    if (targets.length > 0) {
      // AIO-STEER-04: mid-batch, an agent that has already settled has no attempt to attach
      // a turn to. Starting an untracked turn would leave the batch ledger describing a
      // different run than the one happening. Refuse visibly — the leader still answers.
      const busy = openBatchId !== null || synthesisPending;
      // CR-03: liveness comes from the LIVE state, not the ledger map. `assignmentIdsByAgent`
      // is only written by dispatch/amend/retry, so a turn started by a mention was invisible
      // here — a second mention then tried to start a competing turn, hit TURN_IN_PROGRESS,
      // and marked the running agent `error`. The runtime is the authority on "is it running".
      const idle = targets.filter((target) => {
        const runtime = registry.peek(target.id);
        const agentState = agents.get(target.id);
        const live =
          runtime?.isRunning() === true ||
          (agentState !== undefined &&
            agentState.status !== 'done' &&
            agentState.status !== 'stopped' &&
            agentState.status !== 'error');
        return !live;
      });
      // A live addressee reads it at its next round — that is a steer, batch or not.
      if (idle.length === 0) return 'steered';
      if (busy) {
        await runLeadTurn(text, undefined, 'lead-thinking', row.id);
        return 'refused';
      }
      // Team idle: this message IS each agent's turn. They run one after another — the
      // scheduler already bounds concurrency, and awaiting keeps one failure from stranding
      // the rest.
      registerTeamTurn();
      try {
        for (const target of idle) {
          if (disposed) break;
          await startEmployeeTurn(target, text, text, undefined, undefined, row.id);
        }
        return 'started';
      } finally {
        aiTurnManager.finishTurn(teamTurnId);
      }
    }

    // Plain chat with the leader. If its consumer is already turning, the message waits in
    // the log and the current turn's next round drains it — never a second concurrent turn.
    // WR-03: `synthesisPending` counts as busy too — the batch row is already closed at that
    // point, so `leadTurnKind` is still null and a message here would start a second answer
    // alongside the synthesis.
    if (leadTurnKind !== null || synthesisPending) return 'steered';
    await runLeadTurn(text, undefined, 'lead-thinking', row.id);
    return 'started';
  }

  /**
   * 37.1 R6/R9: `send_message` — the fourth way a turn starts, and the ONLY one an agent can
   * use. It is the same primitive as the user's composer: append to the log, then route by
   * `to[]`. Nothing here knows who the sender is beyond its participant id, which is why the
   * leader and an employee share one implementation.
   *
   * A recipient that is already running is left to read the message at its next tool round
   * (that is what makes it a chat, not a call). A recipient that is idle starts a turn, and
   * the sender waits for it — the alternative is a report nobody ever reads, because no
   * mechanism wakes the leader when an agent speaks. Waiting cannot deadlock: the liveness
   * check runs first, so a reply to a participant that is mid-turn is always a steer.
   */
  async function sendFromParticipant(
    fromId: string,
    rawArgs: Record<string, any>
  ): Promise<string> {
    if (disposed) return DISPOSED_REFUSAL;
    // 37.1: symmetric guard — an agent may always speak, but a LEAD turn that already opened
    // a batch must not also message the same people.
    if (fromId === roster.lead?.id && leadTurnRoute === 'delegated') {
      return ROUTE_ALREADY_CHOSEN_REFUSAL;
    }
    const validation = await executeTeamTool('send_message', rawArgs, toolContext(fromId));
    let parsed: any;
    try {
      parsed = JSON.parse(validation);
    } catch {
      return validation;
    }
    if (parsed?.refused === true) return validation;
    const to: string[] = Array.isArray(parsed?.to) ? parsed.to : [];
    const content = String(parsed?.content ?? '');
    if (to.length === 0 || !content) return validation;

    // R14: the message answers whatever this turn was answering, so a chain of exchanges
    // stays readable. A participant with no open turn starts a thread.
    const replyToId = replyTargetByAgent.get(fromId);
    // The row must exist in `chatMessages` too, or the transcript never renders it and the
    // recipient's answer appears BEFORE the question. Same id in both tables, exactly like
    // the composer path — one message, two projections.
    const sender = roster.employees.find((entry) => entry.id === fromId);
    const saved = await saveTeamMessage(
      {
        threadId: options.threadId,
        role: 'assistant',
        content,
        ...(sender
          ? { agentId: sender.id, agentName: sender.name, agentKind: 'employee' as const }
          : roster.lead && fromId === roster.lead.id
            ? { agentId: roster.lead.id, agentName: roster.lead.name, agentKind: 'lead' as const }
            : {}),
        // R14: the rendered row carries the same link as the log row, so the bubble quotes.
        ...(replyToId !== undefined ? { replyToId } : {}),
      },
      db
    );
    await appendForExistingMessage(
      {
        id: saved.id,
        teamId,
        from: fromId,
        to,
        content,
        kind: 'chat',
        ...(replyToId !== undefined ? { replyToId } : {}),
        createdAt: saved.createdAt,
      },
      db
    );
    if (fromId === roster.lead?.id) leadTurnRoute = 'messaged';
    notify();

    const outcomes: Array<{ to: string; outcome: string }> = [];
    for (const recipientId of to) {
      if (recipientId === USER_PARTICIPANT_ID) {
        outcomes.push({ to: recipientId, outcome: 'delivered' });
        continue;
      }
      const employee = roster.employees.find((entry) => entry.id === recipientId);
      if (employee) {
        const runtime = registry.peek(employee.id);
        const agentState = agents.get(employee.id);
        const live =
          runtime?.isRunning() === true ||
          (agentState !== undefined && !TERMINAL_STATUSES.includes(agentState.status));
        // Mid-batch the ledger owns the turn, so a new one would describe a different run
        // than the batch does. The message waits in the log and is read at the next round.
        if (live || openBatchId !== null || synthesisPending) {
          outcomes.push({ to: recipientId, outcome: 'queued' });
          continue;
        }
        registerTeamTurn();
        try {
          await startEmployeeTurn(employee, content, content, undefined, undefined, saved.id);
          outcomes.push({ to: recipientId, outcome: 'started' });
        } finally {
          aiTurnManager.finishTurn(teamTurnId);
        }
        continue;
      }
      if (roster.lead && recipientId === roster.lead.id) {
        // A lead that is mid-turn (including the one calling this tool) reads the message at
        // its next round; starting a second lead turn here would be a re-entrant turn.
        if (leadTurnKind !== null || synthesisPending) {
          outcomes.push({ to: recipientId, outcome: 'queued' });
          continue;
        }
        await runLeadTurn(content, undefined, 'lead-thinking', saved.id);
        outcomes.push({ to: recipientId, outcome: 'started' });
        continue;
      }
      outcomes.push({ to: recipientId, outcome: 'unknown' });
    }
    return JSON.stringify({ sent: saved.id, outcomes });
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
    // 37.1: one routing per turn. A lead that already messaged an agent must not also open a
    // batch for the same request — the recipient would get it twice.
    if (leadTurnRoute === 'messaged') return ROUTE_ALREADY_CHOSEN_REFUSAL;
    leadTurnRoute = 'delegated';
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
      // Nothing else publishes this state: the lead turn is parked on the resolver, so no
      // status transition follows. Without the notify the card only appears when some
      // unrelated write re-renders the host (a tab switch, in UAT) — and the leader looks
      // stuck at "đang phân tích" behind a decision the user cannot see.
      notify();
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
        agentByAssignmentId.set(attemptRow.id, employee.id);
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
        // 37.1 R1: the dispatch is a real message (lead → agent) in the team log. Without
        // this row the leader's own cursor would never cover what it told the agent, so
        // "the leader has seen the whole conversation" would be false for its own turns.
        await appendForExistingMessage(
          {
            id: instructionRow.id,
            teamId,
            from: lead.id,
            to: [employee.id],
            content: assignment.task,
            kind: 'instruction',
            assignmentId: attemptRow.id,
            createdAt: instructionRow.createdAt,
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
      // (`finishTurn` would never fire and every later submit would wait on the log).
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
            // WR-02 (pass 8): `assignmentControllers.abort()` only rejects a parked
            // `scheduler.acquire`. A row already `running` keeps its turn alive past the
            // terminal write, spending tokens and possibly draining a message the ledger now
            // calls undelivered. Abort the runtime too, so "terminal" is true for both
            // statuses and the marker strip below is honest.
            registry.abort(row.agentId);
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
        // `batch-running`, so later submits append to the log until the row settles.
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
      // 37.1 rework: the LEDGER is the authority on attempt status (D-09 — `transitionAssignment`
      // is its only writer), so reconcile the in-memory agent map with it before deriving any
      // phase. A row the amend path or a deadline pass settled externally would otherwise leave
      // an agent `queued`/`running` in memory forever, and a derived phase would report
      // `batch-running` with nothing running — the exact stall the old stored phase hid.
      for (const [agentId, row] of latestByAgent) {
        if (row.runStatus === 'queued' || row.runStatus === 'running') continue;
        const state = agents.get(agentId);
        if (!state || TERMINAL_STATUSES.includes(state.status)) continue;
        const mapped: AgentRunStatus =
          row.runStatus === 'done'
            ? 'done'
            : row.runStatus === 'error'
              ? 'error'
              : 'stopped';
        settleAgent(agentId, mapped, undefined, row.id);
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

      // 37.1 rework: the batch row closes here, but the phase must still say "synthesizing"
      // until the turn actually finishes. `synthesisPending` is that claim — a plain flag
      // cleared in the `finally` below, so it cannot outlive this handler on any branch.
      if (openBatchId === batchId) openBatchId = null;
      synthesisPending = true;
      notify();
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
        await withLeadRuntime(() =>
          startLeadTurn(SYNTHESIS_INSTRUCTION, synthesisResults, 'lead-synthesizing')
        );
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
      // 37.1 rework: the ONE place the settle handler's phase claim is released, on every
      // branch — a throw, an abort, or a lost race. A derived phase needs no other reset.
      synthesisPending = false;
      aiTurnManager.finishTurn(teamTurnId);
      notify();
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
    if (isBusy()) throw new Error('Nhóm đang chạy. Hãy chờ lượt hiện tại kết thúc.');
    retryingAssignments.add(assignmentId);
    // WR-04: the phase is claimed SYNCHRONOUSLY, with no await between the guard above and
    // this write. Otherwise two clicks on different bubbles in one tick both pass the guard,
    // both create attempts, and both run a lead synthesis — which then race on the previous
    // synthesis id and leave one synthesis current forever.
    // 37.1 D-01: the phase is claimed synchronously so a submit during the retry routes as a
    // message instead of opening a second turn.

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
      agentByAssignmentId.set(attemptRow.id, source.agentId);
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
        // WR-01: same serialization as every other lead turn. A message turn does not change
        // the phase, so a retry clicked during one would otherwise hit TURN_IN_PROGRESS and
        // half-apply (new report saved, source superseded, no synthesis).
        const retryResults = await collectBatchReports(source.batchId);
        await withLeadRuntime(() =>
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
      // starts a turn instead of appending into a finished one.
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
    notify();
  }

  /**
   * D-04: the ONE threshold setter. `undefined` clears the override back to "inherit the
   * global default" — the reset control and any unrelated save both land here, so no
   * separate clear method exists whose absence would make the reset path unreachable.
   */
  function setTeamThresholdPct(pct: number | undefined): void {
    teamThresholdOverride = nextThresholdOverride(teamThresholdOverride, pct);
    recomputeThresholdPct();
    notify();
  }

  function resolveApproval(approved: boolean): void {
    // WR-05: `get` would instantiate a runtime when the lead turn already settled.
    if (roster.lead) registry.peek(roster.lead.id)?.resolveApproval(approved);
    pendingApproval = null;
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
    aiTurnManager.finishTurn(teamTurnId);
    registry.abortAll();
    for (const agentId of agents.keys()) settleAgent(agentId, 'stopped');
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

    // Release every park: the plan card. Budget no longer parks anything (D-01).
    planResolver?.(false);
    planResolver = null;
    // D-06/T-38-33: the team-scoped reset — disposing team A must never clear team B.
    resetBudgetWarnings(teamId);

    // D-11/D-18: a per-assignment controller is the only cancellation channel for a
    // queued assignment, so aborting them all is what rejects every parked acquire.
    abortAllAssignmentControllers(assignmentControllers);

    // D-24/T-37.1-01: abort every batch controller so a parked `onBatchSettled` ledger poll
    // and every queued acquire reject instead of resuming on a dead coordinator.
    for (const controller of batchControllers.values()) controller.abort();
    aiTurnManager.finishTurn(teamTurnId);

    // `clear()` aborts and drops every runtime (teamRunRegistry).
    registry.clear();

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
    // Phase 38 D-17/D-18: the repo reads the roster fresh inside its transaction, so a member
    // added mid-turn is reachable. `ensureMembers()`'s `membersLoaded` early return is exactly
    // what made it unreachable (WR-13) — it must not be on this path.
    const result = await applyTopUp(teamId, scope, amount, db);
    mirrorBudgetResult(result);
    // D-06: a top-up is a reset — the next crossing notifies again. The mirror already did
    // the team-scoped reset, so nothing else is needed here.
    // D-18: this tail runs after an await, so a top-up that resolves after `dispose()` must
    // not resurrect `batch-running` on a coordinator that is already gone.
    notify();
  }

  /**
   * Phase 38 D-19: mirror a persisted budget write (top-up or absolute settings save) into
   * live state. Writes NOTHING to Dexie — the repo already did, in one transaction. Every
   * returned row is adopted, including members this coordinator had never seen, so a member
   * added mid-turn becomes addressable without a new coordinator.
   */
  function mirrorBudgetResult(result: { team: AiTeam; members: AiTeamMember[] }): void {
    for (const row of result.members) {
      memberIds.set(row.agentId, row.id);
      memberBudgets.set(row.agentId, row.budgetTokens);
      // D-22: a member row the coordinator has never seen starts from its persisted split.
      if (!memberUsed.has(row.agentId)) {
        memberUsed.set(row.agentId, row.usedTokens);
        memberUsedInput.set(row.agentId, row.inputTokens ?? 0);
        memberUsedOutput.set(row.agentId, row.outputTokens ?? 0);
      }
    }
    teamBudget = result.team.budgetTokens;
    liveTeam = { ...liveTeam, budgetTokens: teamBudget };
    // D-06: a top-up or an absolute settings save resets this team's markers only, so the
    // next crossing notifies again (T-38-33).
    resetBudgetWarnings(teamId);
  }

  /** Phase 38 D-19: the Settings save already persisted; this only mirrors it. */
  function applyBudgetSettings(result: { team: AiTeam; members: AiTeamMember[] }): void {
    mirrorBudgetResult(result);
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
    return {
      phase: derivePhase(),
      agents: [...agents.values()],
      pendingPlan,
      pendingApproval,
      // D-01: nothing parks for budget any more, so these stay null. The fields survive
      // because the legacy parked phase value is still legal for old backups.
      pausedAgentId: null,
      pausedAgentName: null,
      lastPlan,
      lastPlanDecision,
      budgetWarnThresholdPct,
      // D-03/D-06: the two independent levels; the per-member badge is plan 09.
      budgetWarnings: {
        member: anyMemberAtThreshold(),
        team: isAtThreshold(teamUsed, teamBudget, budgetWarnThresholdPct),
      },
      // Phase 38 D-07/D-22: reported split (0 while pending) plus the pre-call measurement.
      memberUsage: [...usageAccounting.entries()].map(([agentId, acc]) => ({
        agentId,
        inputTokens: acc.inputTokens,
        outputTokens: acc.outputTokens,
        estimated: acc.source === 'estimated',
        provisionalInputTokens: acc.provisionalInputTokens,
      })),
      // `exactOptionalPropertyTypes`: omit the key entirely when the team inherits.
      ...(teamThresholdOverride === undefined
        ? {}
        : { budgetWarnThresholdPctOverride: teamThresholdOverride }),
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
    applyBudgetSettings,
    dispose,
    setTeamSettings,
    setTeamBudget,
    setTeamThresholdPct,
    getRunningCount,
    drainInbox,
    subscribe,
    getState,
  };
}
