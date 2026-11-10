/**
 * AI Office domain contract (Phase 34).
 *
 * Self-contained union-first-then-records module, mirroring `src/types/agent.ts`.
 * Every persisted date is an ISO string; every id is a client-generated UUID.
 *
 * The backup-schema denylist in `src/validation/backupSchemas.ts` rejects credential
 * and instruction-text field names recursively, so the only free-text carriers here
 * are `persona` (agents/leads) and `body` (skills).
 */

export type AiTeamStatus = 'active' | 'idle';

export type AiTeamMemberRole = 'lead' | 'employee';

export type AiTeamLinkItemType = 'cr' | 'task' | 'system' | 'note' | 'document';

/** D-35: a NEW run-state union, independent of the chat turn status surface. */
export type TeamRunPhase =
  | 'idle'
  | 'ready'
  | 'lead-thinking'
  | 'awaiting-plan'
  | 'batch-running'
  | 'awaiting-budget'
  | 'awaiting-mutation-approval'
  | 'lead-synthesizing'
  | 'error';

export type AgentRunStatus = 'queued' | 'running' | 'paused' | 'stopped' | 'error' | 'done';

export type AiMessageKind = 'instruction' | 'report' | 'synthesis' | 'plan';

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

export interface AgentRunState {
  agentId: string;
  status: AgentRunStatus;
  streamingText: string;
  startedAt?: string | undefined;
  incomplete?: boolean | undefined;
}

export interface AgentIdentity {
  name: string;
  role: string;
  isLead: boolean;
  /** UI-SPEC §Avatar deterministic palette entry. */
  color: string;
}

export const MAX_BATCH_SIZE = 3; // D-02
export const RECENT_WINDOW_TURNS = 10; // D-10
export const ASSIGNMENT_HISTORY_CAP = 50; // D-29
export const BUDGET_PAUSE_THRESHOLD = 0.8; // D-20
