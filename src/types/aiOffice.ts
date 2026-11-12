/**
 * AI Office domain contract (Phase 34).
 *
 * Self-contained union-first-then-records module, mirroring `src/types/agent.ts`.
 * Every persisted date is an ISO string; every id is a client-generated UUID.
 *
 * The backup-schema denylist in `src/validation/backupSchemas.ts` rejects credential
 * and instruction-text field names recursively (it matches object KEYS), so the free-text
 * carriers here are `persona` (agents/leads), `body` (skills) and `evidence`
 * (skill versions, capped at 2000 characters). `evidence` is exempt from the denylist
 * because it is a value, not a key — the key-matched scan cannot see it; the length cap
 * is what bounds it.
 */

import type { ChatTokenUsage } from './models';

export type AiTeamStatus = 'active' | 'idle';

export type AiTeamMemberRole = 'lead' | 'employee';

export type AiTeamLinkItemType = 'cr' | 'task' | 'system' | 'note' | 'document';

/**
 * D-35: a NEW run-state union, independent of the chat turn status surface.
 *
 * IN-08: there is deliberately no `'error'` phase. A failed turn settles back to `ready`
 * (D-16 forbids parking in a running phase), and an `'error'` member nothing writes would be
 * silently NON-busy — letting a new turn start beside a failed one. Every member here has a
 * writer in `teamRunCoordinator`.
 */
export type TeamRunPhase =
  | 'idle'
  | 'ready'
  | 'lead-thinking'
  | 'awaiting-plan'
  | 'batch-running'
  | 'awaiting-budget'
  | 'awaiting-mutation-approval'
  | 'lead-synthesizing';

export type AgentRunStatus = 'queued' | 'running' | 'paused' | 'stopped' | 'error' | 'done';

export type AiMessageKind = 'instruction' | 'report' | 'synthesis' | 'plan' | 'steer';

export interface AiEmployee {
  id: string;
  name: string; // ≤ 60
  role: string; // ≤ 60
  capability: string; // ≤ 300 — the text the lead sees in the roster (D-04)
  persona: string; // Markdown
  model: string;
  /** Scalar, not an array: D-25 "at most one skill" is enforced structurally. */
  skillId?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface AiLead {
  id: string;
  name: string; // ≤ 60
  role: string; // ≤ 60
  capability: string; // ≤ 300
  persona: string; // Markdown
  model: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiSkill {
  id: string;
  name: string; // ≤ 60
  description: string; // ≤ 300
  body: string; // Markdown
  createdAt: string;
  updatedAt: string;
}

export interface AiTeam {
  id: string;
  name: string; // ≤ 60
  /** D-05: a group may exist without a leader — an empty group is a legal stored row. */
  leadId?: string | undefined;
  /** D-09: durable leader lock, set at the first run; survives relaunch and backup. */
  leaderLockedAt?: string | undefined;
  status: AiTeamStatus;
  budgetTokens: number;
  /** D-06: "Tự động chia việc" bypass. */
  autoSplitEnabled?: boolean | undefined;
  /** D-13: skip the mutation approval gate. */
  autoApproveMutations?: boolean | undefined;
  /** Phase 37 D-03: per-team run concurrency; absent means `DEFAULT_TEAM_CONCURRENCY`. */
  concurrencyLimit?: number | undefined;
  createdAt: string;
  updatedAt: string;
}

/** D-32: per-agent budget home — not a JSON array on the team row. */
export interface AiTeamMember {
  id: string;
  teamId: string;
  agentId: string;
  role: AiTeamMemberRole;
  budgetTokens: number;
  usedTokens: number;
}

export interface AiTeamLink {
  id: string;
  teamId: string;
  itemType: AiTeamLinkItemType;
  itemId: string;
  createdAt: string;
}

/** Phase 36 (D-16, D-22): a stored skill revision. `pending` is data, never an approval. */
export type AiSkillVersionStatus = 'pending' | 'approved' | 'rejected';

export interface AiSkillVersion {
  id: string;
  skillId: string;
  /** 1-based, monotonic per skill. */
  version: number;
  status: AiSkillVersionStatus;
  name: string; // ≤ 60
  description: string; // ≤ 300
  body: string; // Markdown
  evidence?: string | undefined;
  createdAt: string;
  decidedAt?: string | undefined;
}

/** Phase 37 (D-22): why a batch stopped. `none` = still running or ended normally. */
export type AiTeamBatchAbortedBy = 'user' | 'team-deleted' | 'app-exit' | 'none';

/** D-24: `auto` = the plan card was skipped; the other two are an explicit choice. */
export type AiTeamBatchPlanDecision = 'approved' | 'rejected' | 'auto';

/**
 * Phase 37 (D-22, D-24): the ledger's run status.
 *
 * Deliberately NOT `AgentRunStatus` — that union is the UI surface (`paused`/`done`) and
 * cannot carry `skipped`, `blocked` or `needs-input`.
 */
export type AiTeamAssignmentRunStatus =
  | 'queued'
  | 'running'
  | 'done'
  | 'stopped'
  | 'error'
  | 'skipped'
  | 'blocked'
  | 'needs-input';

export type AiTeamAssignmentStopReason =
  | 'user-per-agent'
  | 'user-abort'
  | 'team-deleted'
  | 'provider'
  | 'tool-limit'
  | 'budget-pause'
  | 'leader-amend'
  | 'none';

export interface AiTeamPlanEntry {
  agentId: string;
  /** Snapshot at plan time (D-25) — the roster may change before a retry. */
  agentName: string;
  task: string;
}

/** D-24: the approved original is never overwritten by an edited plan. */
export interface AiTeamPlanSnapshot {
  original: AiTeamPlanEntry[];
  edited?: AiTeamPlanEntry[] | undefined;
}

export interface AiTeamBatch {
  id: string;
  teamId: string;
  threadId: string;
  /** D-24: 1-based, monotonic within one turn's thread. */
  batchIndex: number;
  userRequest: string;
  leadId: string;
  planSnapshot: AiTeamPlanSnapshot;
  planDecision: AiTeamBatchPlanDecision;
  startedAt: string;
  endedAt?: string | undefined;
  phaseAtEnd?: TeamRunPhase | undefined;
  abortedBy: AiTeamBatchAbortedBy;
}

/**
 * Phase 37 (D-22, D-23, D-25): one row per attempt. Retry appends, never mutates.
 *
 * The profile fields are snapshots so history and retry never depend on the live roster.
 * `diagnosticDetail` (D-17) stays out of the transcript and out of backup-facing keys.
 */
export interface AiTeamAssignment {
  id: string;
  batchId: string;
  agentId: string;
  agentName: string;
  skillId?: string | undefined;
  skillVersion?: number | undefined;
  model: string;
  task: string;
  runStatus: AiTeamAssignmentRunStatus;
  stopReason: AiTeamAssignmentStopReason;
  /** D-23: 1-based per attempt chain; allocated inside the insert transaction. */
  attemptNo: number;
  /** Points at the first attempt of this chain for attempt 2+; absent on attempt 1. */
  retryOfAssignmentId?: string | undefined;
  incomplete: boolean;
  queuedAt: string;
  startedAt?: string | undefined;
  endedAt?: string | undefined;
  instructionMessageId?: string | undefined;
  reportMessageId?: string | undefined;
  /** 37.1 D-14/D-25: steer message ids not yet drained into this attempt's prompt. */
  steerMessageIds?: string[] | undefined;
  tokenUsage?: ChatTokenUsage | undefined;
  toolCallCount?: number | undefined;
  /** D-17: technical detail for debugging; never rendered and never exported. */
  diagnosticDetail?: string | undefined;
  /** D-24 handoff: upstream assignments that must finish first. */
  dependsOn?: string[] | undefined;
}

/**
 * 37.1 D-22: one live step for the activity popover. Runtime-only — never persisted, so no
 * backup schema or Dexie version changes.
 */
export interface AgentLiveStep {
  id: string;
  label: string;
  at: string;
}

export interface AgentRunState {
  agentId: string;
  status: AgentRunStatus;
  streamingText: string;
  startedAt?: string | undefined;
  incomplete?: boolean | undefined;
  /** 37.1 D-22: capped live step list for the indicator popover. Never rendered as text. */
  steps?: AgentLiveStep[] | undefined;
}

export interface AgentIdentity {
  name: string;
  role: string;
  isLead: boolean;
  /** UI-SPEC §Avatar deterministic palette entry. */
  color: string;
}

export const RECENT_WINDOW_TURNS = 10; // D-10
export const ASSIGNMENT_HISTORY_CAP = 50; // D-29
export const BUDGET_PAUSE_THRESHOLD = 0.8; // D-20

/**
 * Phase 37 (D-02): per-team run concurrency.
 *
 * Only the *range* matches `ghostDevConfig.ts:54`; the ghost-dev default is 6, so 3 here
 * is a Phase 37 choice, not parity.
 */
export const DEFAULT_TEAM_CONCURRENCY = 3;
export const MIN_TEAM_CONCURRENCY = 1;
export const MAX_TEAM_CONCURRENCY = 12;

/** Total: every input yields an integer in [1, 12]; non-finite input falls back to the default. */
export function clampTeamConcurrency(n: number): number {
  const finite = Number.isFinite(n) ? n : DEFAULT_TEAM_CONCURRENCY;
  return Math.max(MIN_TEAM_CONCURRENCY, Math.min(MAX_TEAM_CONCURRENCY, Math.round(finite)));
}
