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
   * Production seam (D-03): resolve a fresh roster from persisted rows at every turn start.
   * When supplied, no construction-time `lead`/`employees`/`skills` value reaches a turn.
   */
  loadRoster?: (() => Promise<TurnRoster>) | undefined;
}

export interface TeamRunCoordinator {
  /**
   * D-20/D-21: the three-way dispatch edge 37-06 needs. `'busy'` means a live OR parked
   * turn holds the slot and will settle on its own (requeue); `'blocked'` means the
   * coordinator is disposed and never will (surface an error, requeue nothing).
   */
  send(text: string): Promise<'started' | 'busy' | 'blocked'>;
  /**
   * Internal seam (D-09/D-22): the ONE terminal writer for an attempt. 37-04's `stopAgent`
   * and `abortAll` call it; exported so the "exactly one report row under concurrency"
   * invariant is testable without going through a provider.
   */
  finalizeAttempt(
    assignmentId: string,
    from: AiTeamAssignmentRunStatus,
    to: 'done' | 'stopped' | 'error',
    stopReason: AiTeamAssignmentStopReason,
    contentWhenMissing?: string,
    diagnosticDetail?: string
  ): Promise<AiTeamAssignment | null>;
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
   */
  dispose(): Promise<void>;
  /** D-25: toggles apply to the live run, not only the next construction. */
  setTeamSettings(
    patch: Partial<Pick<AiTeam, 'autoSplitEnabled' | 'autoApproveMutations' | 'concurrencyLimit'>>
  ): void;
  /** AIO-BUDGET-01: adopt a team-total edit so the next top-up accumulates onto it. */
  setTeamBudget(total: number): void;
  /** D-07 diagnostic seam: live scheduler slots, so a leak is observable without a provider. */
  getRunningCount(): number;
  subscribe(listener: () => void): () => void;
  getState(): TeamRunSnapshot;
}

const TEAM_TOOL_NAMES = new Set(
  TEAM_TOOL_DEFINITIONS.map((tool) => normalizeToolName(tool.function.name))
);

/** The employee payload is the payload-layer half of D-12; the runtime policy is the other. */
const EMPLOYEE_TEAM_TOOLS = TEAM_TOOL_DEFINITIONS.filter(
  (tool) => normalizeToolName(tool.function.name) !== 'delegate_batch'
);

/** `@[Name](agent:<id>)` — same syntax `ChatMessageBubble.renderUserMessageWithMentions` parses. */
const AGENT_MENTION = /@\[([^\]]+)\]\(agent:([a-zA-Z0-9-]+)\)/;

const TERMINAL_STATUSES: readonly AgentRunStatus[] = ['done', 'stopped', 'error'];

/** D-22: a ledger row in one of these is settled — it must never take a second report row. */
const TERMINAL_RUN_STATUSES: ReadonlySet<AiTeamAssignmentRunStatus> = new Set([
  'done',
  'stopped',
  'error',
]);

/** WR-02: phases in which a turn is actually running — a second `send()` must be dropped. */
export const LIVE_PHASES: ReadonlySet<TeamRunPhase> = new Set<TeamRunPhase>([
  'lead-thinking',
  'awaiting-plan',
  'batch-running',
  'lead-synthesizing',
]);

/**
 * D-21: live phases PLUS the two park phases. A parked turn still owns the slot — a second
 * turn beside it is exactly what `send()` must refuse, so `send()` gates on this set while
 * "is the team working" UI stays on `LIVE_PHASES`.
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
 * Every advertised team tool must resolve to a handler. `dispatchAiToolCall` only routes
 * `AI_DATABASE_TOOLS` members to `executeAiTool`; anything else falls through to the dynamic
 * MCP path and throws "unknown MCP server". This guard keeps that drift visible in tests.
 */
export function resolveTeamToolName(name: string): 'coordinator' | 'teamTools' | 'unknown' {
  const normalized = normalizeToolName(name);
  if (normalized === 'delegate_batch') return 'coordinator';
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
  /** D-22: which attempt the agent's next report save belongs to (cleared on terminal). */
  const activeAssignmentByAgent = new Map<
    string,
    { batchId: string; assignmentId: string; attemptNo: number }
  >();
  /** D-10/D-11/D-18: the cancellation channel for a still-queued assignment. */
  const assignmentControllers = new Map<string, AbortController>();
  /** D-07/D-05: the per-team scheduler — the ONLY rule deciding how many agents run. */
  const scheduler = createTeamRunScheduler(
    team.concurrencyLimit ?? DEFAULT_TEAM_CONCURRENCY
  );
  /** Admitted slots, keyed by assignment id, released in the per-assignment `finally`. */
  const scheduledHandles = new Map<string, SchedulerHandle>();
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
   * with one path's reason and the other path's status.
   */
  const userStopped = new Map<string, 'user-per-agent' | 'user-abort'>();
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

  function settleAgent(agentId: string, status: AgentRunStatus, report?: string): void {
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
    to: 'done' | 'stopped' | 'error',
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
        return runBatch(assignments, signal);
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
      onCompleted: ({ content }) => settleAgent(agentId, 'done', content),
      onError: () => settleAgent(agentId, 'error', SANITIZED_TURN_ERROR),
      onUsage: (usage) => handleUsage(agentId, usage),
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

  function handleUsage(agentId: string, usage: ChatTokenUsage): void {
    const total = normalizeUsageTotal(usage);
    const previousTotal = usageTotals.get(agentId) ?? 0;
    const delta = total - previousTotal;
    if (delta <= 0) return;
    usageTotals.set(agentId, total);
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

  function beforeToolRoundFor(agentId: string) {
    // D-21 / Pitfall 8: the loop's own signal reaches both gates, so a Stop while parked
    // rejects instead of hanging. The trailing throw covers a hook that resolved post-abort.
    return async (_round: number, signal: AbortSignal): Promise<void> => {
      await gateFor(agentId).wait(signal);
      await teamGate.wait(signal);
      signal.throwIfAborted();
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
        beforeToolRound: beforeToolRoundFor(employee.id),
      };

      currentRequests.set(employee.id, request);
      userStopped.delete(employee.id);
      // CR-01: each turn's usage total restarts at zero, so the cumulative baseline
      // must reset too — otherwise the second turn's delta is zero or negative.
      usageTotals.delete(employee.id);
      // D-13: the batch's employees are only known here, so this is where they claim live use.
      claimLiveUse(employee.id, employee.skillId);
      updateAgent(employee.id, {
        status: 'running',
        streamingText: '',
        startedAt: new Date().toISOString(),
      });
      registerAgentTurn(employee.id, employee.name);

      if (attempt) {
        // D-09: the one status writer moves queued -> running immediately before the turn.
        await transitionAssignment(
          attempt.assignmentId,
          'queued',
          'running',
          { startedAt: new Date().toISOString() },
          db
        );
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
      settleAgent(employee.id, OUTCOME_STATUS[outcome.phase]);
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
        settleAgent(employee.id, 'error', SANITIZED_TURN_ERROR);
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
      // CR-01: same baseline reset as the employee path.
      usageTotals.delete(lead.id);
      // D-13: leads have no skill, so the claim carries an empty skill list.
      claimLiveUse(lead.id, undefined);
      updateAgent(lead.id, {
        status: 'running',
        streamingText: '',
        startedAt: new Date().toISOString(),
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

  async function send(text: string): Promise<'started' | 'busy' | 'blocked'> {
    // D-18: a disposed coordinator is inert. Nothing may start, persist or register — and
    // no state change will ever make it work again, so the caller must not requeue.
    if (disposed) return 'blocked';
    // WR-02/D-21: a second submit while a turn is live OR parked would persist a duplicate
    // user row. A parked turn will settle on its own, so this is `'busy'` (requeue), never a
    // dropped submit the caller cannot distinguish from a started turn.
    if (BUSY_PHASES.has(phase)) return 'busy';
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

      await startLeadTurn(text);
      return 'started';
    } finally {
      aiTurnManager.finishTurn(teamTurnId);
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
    signal: AbortSignal | undefined
  ): Promise<void> {
    const assignmentId = attempt.assignmentId;
    // D-10/D-11: the controller — never a scheduler handle — is the cancellation channel
    // for a queued assignment; no handle exists before `acquire` resolves.
    const controller = new AbortController();
    assignmentControllers.set(assignmentId, controller);
    const onAbort = () => controller.abort();
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }

    let handle: SchedulerHandle | undefined;
    try {
      handle = await scheduler.acquire(controller.signal);
      scheduledHandles.set(assignmentId, handle);
      // CR-02: `acquire` resolving is an await boundary. If dispose landed while parked its
      // `registry.clear()` already ran, so starting now would build a fresh runtime for a
      // deleted team. Throw the abort the catch below already knows how to settle — a bare
      // `return` would leave the attempt row `queued` forever.
      if (disposed) throw new DOMException('Aborted', 'AbortError');
      await startEmployeeTurn(employee, task, lastUserRequest, priorBatchResults, attempt);
    } catch (err) {
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
            userStopped.get(employee.id) ?? 'user-abort',
            STOPPED_REPORT_COPY
          );
          settleAgent(employee.id, 'stopped');
        } else {
          await finalizeAttempt(
            assignmentId,
            'queued',
            'error',
            'provider',
            SANITIZED_TURN_ERROR,
            boundedDiagnostic(err)
          );
          settleAgent(employee.id, 'error', SANITIZED_TURN_ERROR);
        }
      } catch {
        /* a ledger write must never leak the slot */
      }
    } finally {
      if (signal) signal.removeEventListener('abort', onAbort);
      assignmentControllers.delete(assignmentId);
      if (assignmentIdsByAgent.get(employee.id) === assignmentId) {
        assignmentIdsByAgent.delete(employee.id);
      }
      // The single release point. `release` is idempotent (37-02), so a stop path that
      // already released cannot corrupt the count.
      if (handle !== undefined) {
        scheduledHandles.delete(assignmentId);
        scheduler.release(handle);
      }
    }
  }

  async function runBatch(rawAssignments: unknown[], signal?: AbortSignal): Promise<string> {
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
        await closeBatch(rejectedBatch.id, { phaseAtEnd: 'ready', abortedBy: 'user' }, db);
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

    setPhase('batch-running');

    const started: Array<Promise<void>> = [];
    /** This batch's attempt ids by agent, kept after the dispatch `finally` for the result. */
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
        updateAgent(employee.id, { status: 'queued', streamingText: '' });
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
        // D-16/T-37-08: the promise is settled by `Promise.allSettled`, but a rejection from
        // the dispatch task must still not surface as unhandled — the task itself settles the
        // agent and its ledger row.
        started.push(
          dispatchAssignment(
            employee,
            assignment.task,
            {
              batchId: batch.id,
              assignmentId: attemptRow.id,
              attemptNo: attemptRow.attemptNo,
              instructionMessageId: instructionRow.id,
            },
            signal
          ).catch(() => {
            /* dispatchAssignment already settled the agent and its ledger row */
          })
        );
      }
    } catch {
      // Anything already dispatched still settles itself; the batch is closed here so the
      // ledger tail is honest and `dispose`/`abortAll` cannot double-close it.
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

    // Concurrency: one runtime per agent, so three turns really do run at once (D-02).
    await Promise.allSettled(started);
    // Terminal-only settle: a paused agent's deferred is still pending, so the lead cannot
    // synthesize past it (D-30, Pitfall 7).
    await Promise.all(
      [...agentDeferreds.values()].map((deferred) => deferred.promise)
    );

    // D-14: the lead must be able to say what is missing, so every entry carries the
    // ledger's terminal triple — `status`, `stopReason`, `incomplete` — not just the UI state.
    const results = await Promise.all(
      assignments.map(async (assignment) => {
        const employee = roster.employees.find((row) => row.id === assignment.agentId);
        const state = agents.get(assignment.agentId);
        const status: AgentRunStatus = state?.status ?? 'error';
        const report =
          status === 'error' ? SANITIZED_TURN_ERROR : reports.get(assignment.agentId) ?? '';
        const assignmentId = attemptIdsByAgent.get(assignment.agentId);
        const row = assignmentId ? await getAssignment(assignmentId, db) : undefined;
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
    // D-14: a batch with unfinished agents must not read as complete. The result stays an
    // ARRAY — the `delegate_batch` contract and every existing consumer/tests treat it as
    // one — so the honesty travels as a final `kind: 'unfinished'` ENTRY rather than a
    // wrapper object, which would change the tool result's shape for every caller.
    const unfinished = results.filter(
      (row) => row.incomplete === true || row.status === 'stopped' || row.status === 'error'
    );
    const resultPayload: Array<Record<string, unknown>> = [...results];
    if (unfinished.length > 0) {
      resultPayload.push({
        kind: 'unfinished',
        agents: unfinished.map((row) => ({
          agentId: row.agentId,
          agentName: row.agentName,
          status: row.status,
          stopReason: row.stopReason,
        })),
      });
    }
    // Carry this batch's settled reports into the next one (AIO-TEAM-03). A stopped or
    // errored agent contributes nothing readable, so only real reports are kept.
    priorBatchResults = results
      .filter((row) => row.status === 'done' && row.report.trim().length > 0)
      .map((row) => ({ agentName: row.agentName, content: row.report }));
    // D-18: `Promise.all(deferreds)` is an await, so a dispose during it must not resurrect
    // `lead-synthesizing` on an already-disposed coordinator.
    setPhase('lead-synthesizing');
    // The run is over: close the batch row so `dispose`/`abortAll` never double-close it.
    if (openBatchId !== null) {
      const batchId = openBatchId;
      openBatchId = null;
      await closeBatch(batchId, { phaseAtEnd: 'lead-synthesizing', abortedBy: 'none' }, db);
    }
    return JSON.stringify(resultPayload);
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
        scheduledHandles.set(attemptRow.id, handle);
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
          settleAgent(source.agentId, 'stopped');
        } catch {
          /* a ledger write must never leak the slot */
        }
      } finally {
        assignmentControllers.delete(attemptRow.id);
        if (assignmentIdsByAgent.get(source.agentId) === attemptRow.id) {
          assignmentIdsByAgent.delete(source.agentId);
        }
        if (handle !== undefined) {
          scheduledHandles.delete(attemptRow.id);
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
        await startLeadTurn(SYNTHESIS_INSTRUCTION, await collectBatchReports(source.batchId));
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
      // starts instead of returning 'busy' forever.
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
  async function dispose(): Promise<void> {
    disposed = true;
    // `ready` is the terminal state; set it before the ledger await so no observer sees a
    // live phase after the flag is up and before the close resolves.
    phase = 'ready';

    // Release every park: plan card, agent gates, team gate.
    planResolver?.(false);
    planResolver = null;
    for (const gate of agentGates.values()) gate.open();
    teamGate.open();

    // D-11/D-18: a per-assignment controller is the only cancellation channel for a
    // queued assignment, so aborting them all is what rejects every parked acquire.
    abortAllAssignmentControllers(assignmentControllers);

    // `clear()` aborts and drops every runtime (teamRunRegistry).
    registry.clear();

    for (const agentId of agents.keys()) settleAgent(agentId, 'stopped');

    if (openBatchId !== null) {
      const batchId = openBatchId;
      openBatchId = null;
      try {
        await closeBatch(batchId, { phaseAtEnd: 'ready', abortedBy: 'team-deleted' }, db);
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
    runBatch,
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
    subscribe,
    getState,
  };
}
