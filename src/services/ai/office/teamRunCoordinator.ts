import type { TaskPlannerDatabase } from '../../../db';
import type {
  AgentRunState,
  AgentRunStatus,
  AiEmployee,
  AiLead,
  AiSkill,
  AiTeam,
  AiTeamMember,
  TeamRunPhase,
} from '../../../types/aiOffice';
import {
  ASSIGNMENT_HISTORY_CAP,
  RECENT_WINDOW_TURNS,
} from '../../../types/aiOffice';
import type { ChatTokenUsage } from '../../../types/models';
import {
  createDefaultChatTurnDeps,
  SANITIZED_TURN_ERROR,
  type ChatTurnApprovalInfo,
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
  listAssignmentHistory,
  listRecentTurns,
  saveTeamMessage,
} from '../../../db/repositories/teamTranscriptRepo';
import {
  addUsedTokens,
  getTeam,
  listTeamMembers,
  topUpMemberBudget,
  updateTeam,
} from '../../../db/repositories/aiTeamRepo';

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
  send(text: string): Promise<void>;
  runBatch(assignments: unknown[], signal?: AbortSignal): Promise<string>;
  resolvePlan(approved: boolean): void;
  resolveApproval(approved: boolean): void;
  stopAgent(agentId: string): void;
  abortAll(): void;
  topUp(scope: TopUpScope, amount: number): Promise<void>;
  /** D-25: toggles apply to the live run, not only the next construction. */
  setTeamSettings(patch: Partial<Pick<AiTeam, 'autoSplitEnabled' | 'autoApproveMutations'>>): void;
  /** AIO-BUDGET-01: adopt a team-total edit so the next top-up accumulates onto it. */
  setTeamBudget(total: number): void;
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

/** WR-02: phases in which a turn is actually running — a second `send()` must be dropped. */
export const LIVE_PHASES: ReadonlySet<TeamRunPhase> = new Set<TeamRunPhase>([
  'lead-thinking',
  'awaiting-plan',
  'batch-running',
  'lead-synthesizing',
]);

const OUTCOME_STATUS: Record<ChatTurnPhase, AgentRunStatus> = {
  complete: 'done',
  cancelled: 'done',
  aborted: 'stopped',
  error: 'error',
  'tool-limit': 'error',
};

const PLAN_REJECTED = JSON.stringify({
  cancelled: true,
  message: 'Người dùng đã từ chối kế hoạch phân việc. Không nhân viên nào được giao việc.',
});

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

  const notify = () => {
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        /* a subscriber must never break the run */
      }
    }
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
        phase = 'awaiting-mutation-approval';
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
      phase = 'awaiting-budget';
      notify();
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
        phase = 'awaiting-budget';
        notify();
      }
    }

    const teamCurrent = bucketOf(teamUsed, teamBudget);
    if (shouldNotifyPause(lastTeamBucket, teamCurrent)) {
      teamGate.close();
      if (anyLive()) {
        phase = 'awaiting-budget';
        notify();
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

  async function startEmployeeTurn(
    employee: AiEmployee,
    instruction: string,
    originalRequest: string,
    batchResults?: readonly BatchResult[]
  ): Promise<void> {
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

    // WR-02: every employee turn gets a deferred, not just the batch path, so a paused
    // mention turn is awaited instead of letting `send()` report the team ready.
    if (!agentDeferreds.has(employee.id)) {
      agentDeferreds.set(employee.id, createDeferred());
    }

    let outcome;
    try {
      outcome = await registry.get(employee.id).start(request);
    } catch (err) {
      // WR-01: `start()` throws TURN_IN_PROGRESS when the agent already runs. Without this
      // release the claim leaks and the profile becomes permanently undeletable.
      releaseLiveUse(employee.id);
      settleAgent(employee.id, 'error');
      throw err;
    }
    const state = agents.get(employee.id);
    // A parked loop cannot resolve `start()`; if the state is still paused the deferred is
    // the authority, so the batch keeps waiting (D-30).
    if (state && state.status === 'paused') {
      await agentDeferreds.get(employee.id)?.promise;
      return;
    }
    settleAgent(employee.id, OUTCOME_STATUS[outcome.phase]);
  }

  async function startLeadTurn(text: string): Promise<void> {
    // D-05: an empty group has no lead — a silent no-op, not a throw.
    const lead = roster.lead;
    if (!lead) return;
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
    phase = 'lead-thinking';
    notify();

    let outcome;
    try {
      outcome = await registry.get(lead.id).start(request);
    } catch (err) {
      // WR-01: same leak as the employee path — release before rethrowing.
      releaseLiveUse(lead.id);
      settleAgent(lead.id, 'error');
      phase = 'ready';
      notify();
      throw err;
    }
    const state = agents.get(lead.id);
    if (state && state.status === 'paused') {
      await agentDeferreds.get(lead.id)?.promise;
      return;
    }
    settleAgent(lead.id, OUTCOME_STATUS[outcome.phase]);
    if (phase === 'lead-thinking' || phase === 'lead-synthesizing') {
      phase = 'ready';
      notify();
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

  async function send(text: string): Promise<void> {
    // WR-02: a second submit while a turn is live would persist a duplicate user row and
    // then throw TURN_IN_PROGRESS out of `void sendTurn(...)` as an unhandled rejection.
    // A parked phase (`awaiting-budget` / `awaiting-mutation-approval`) is not live: the
    // user may send after topping up, and approval is answered on the card.
    if (LIVE_PHASES.has(phase)) return;
    // D-03/D-07: read the roster exactly ONCE per turn, before any read of it.
    if (options.loadRoster) {
      roster = await options.loadRoster();
      // D-08: membership is per turn, so a de-rostered agent stops being mentionable.
      applyRosterMembership(await hydrateBudgets());
    } else {
      await ensureMembers();
    }
    lastUserRequest = text;
    const target = parseMentionTarget(text);

    await saveTeamMessage({ threadId: options.threadId, role: 'user', content: text }, db);
    registerTeamTurn();

    if (target) {
      phase = 'batch-running';
      notify();
      await startEmployeeTurn(target, text, text);
      if (phase === 'batch-running') {
        phase = 'ready';
        notify();
      }
      return;
    }

    await startLeadTurn(text);
  }

  async function runBatch(rawAssignments: unknown[], signal?: AbortSignal): Promise<string> {
    // D-05: no lead means no delegation authority — refuse rather than throw.
    const lead = roster.lead;
    if (!lead) return EMPLOYEE_DELEGATE_REFUSAL;
    const validation = await executeTeamTool(
      'delegate_batch',
      { assignments: rawAssignments },
      toolContext(lead.id)
    );
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
      phase = 'awaiting-plan';
      notify();
      const approved = await new Promise<boolean>((resolve) => {
        planResolver = resolve;
      });
      planResolver = null;
      pendingPlan = null;
      // UI-SPEC §7: the decided plan stays visible with its status line until the next
      // plan replaces it, so the decision is observable rather than flashing away.
      lastPlan = plan;
      lastPlanDecision = approved ? 'approved' : 'rejected';
      if (!approved) {
        phase = 'ready';
        notify();
        return PLAN_REJECTED;
      }
    }

    signal?.throwIfAborted();
    phase = 'batch-running';
    notify();

    const started: Array<Promise<void>> = [];
    for (const assignment of assignments) {
      const employee = roster.employees.find((row) => row.id === assignment.agentId);
      if (!employee) continue;
      // D-31: the instruction row is attributed to the lead, so the employee's own history
      // reads as (instruction, report) pairs.
      await saveTeamMessage(
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
        },
        db
      );
      // WR-02: the deferred is created by startEmployeeTurn for both paths.
      started.push(
        startEmployeeTurn(employee, assignment.task, lastUserRequest, priorBatchResults)
      );
    }

    // Concurrency: one runtime per agent, so three turns really do run at once (D-02).
    await Promise.allSettled(started);
    // Terminal-only settle: a paused agent's deferred is still pending, so the lead cannot
    // synthesize past it (D-30, Pitfall 7).
    await Promise.all(
      [...agentDeferreds.values()].map((deferred) => deferred.promise)
    );

    const results = assignments.map((assignment) => {
      const employee = roster.employees.find((row) => row.id === assignment.agentId);
      const state = agents.get(assignment.agentId);
      const status: AgentRunStatus = state?.status ?? 'error';
      const report =
        status === 'error' ? SANITIZED_TURN_ERROR : reports.get(assignment.agentId) ?? '';
      return {
        agentId: assignment.agentId,
        agentName: employee?.name ?? assignment.agentId,
        status,
        report,
        ...(status === 'stopped' ? { incomplete: true } : {}),
      };
    });

    agentDeferreds.clear();
    // Carry this batch's settled reports into the next one (AIO-TEAM-03). A stopped or
    // errored agent contributes nothing readable, so only real reports are kept.
    priorBatchResults = results
      .filter((row) => row.status === 'done' && row.report.trim().length > 0)
      .map((row) => ({ agentName: row.agentName, content: row.report }));
    phase = 'lead-synthesizing';
    notify();
    return JSON.stringify(results);
  }

  function resolvePlan(approved: boolean): void {
    const resolver = planResolver;
    planResolver = null;
    resolver?.(approved);
  }

  /** D-25: the sidebar switches and the settings drawer both land here. */
  function setTeamSettings(
    patch: Partial<Pick<AiTeam, 'autoSplitEnabled' | 'autoApproveMutations'>>
  ): void {
    liveTeam = { ...liveTeam, ...patch };
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
      if (phase === 'awaiting-budget') phase = 'batch-running';
    }
    notify();
  }

  function resolveApproval(approved: boolean): void {
    // WR-05: `get` would instantiate a runtime when the lead turn already settled.
    if (roster.lead) registry.peek(roster.lead.id)?.resolveApproval(approved);
    pendingApproval = null;
    if (phase === 'awaiting-mutation-approval') phase = 'lead-thinking';
    notify();
  }

  function stopAgent(agentId: string): void {
    // CR-03: stopping the lead while its batch is parked must release the park too.
    if (roster.lead !== undefined && agentId === roster.lead.id && planResolver) {
      planResolver(false);
      planResolver = null;
    }
    registry.abort(agentId);
    settleAgent(agentId, 'stopped');
  }

  function abortAll(): void {
    // CR-03: a plan park is only released by resolvePlan. Without this the lead's
    // tool call stays pending forever and send() never resolves.
    planResolver?.(false);
    planResolver = null;
    registry.abortAll();
    for (const agentId of agents.keys()) settleAgent(agentId, 'stopped');
    phase = 'ready';
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
    if (phase === 'awaiting-budget' && !teamGate.isClosed()) {
      const anyLive = [...agents.values()].some(
        (state) => !TERMINAL_STATUSES.includes(state.status)
      );
      phase = anyLive ? 'batch-running' : 'ready';
    }
    notify();
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
    runBatch,
    resolvePlan,
    resolveApproval,
    stopAgent,
    abortAll,
    topUp,
    setTeamSettings,
    setTeamBudget,
    subscribe,
    getState,
  };
}
