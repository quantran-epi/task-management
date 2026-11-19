import type { GhostDevConfig } from '../agents/ghostDevConfig';

/** A portable capacity rule — natural key is `dayOfWeek` (no id travels in a profile). */
export interface ProfileCapacityRule {
  dayOfWeek: number;
  workMinutes: number;
}

/** A portable capacity override — natural key is `date`. */
export interface ProfileCapacityOverride {
  date: string;
  workMinutes: number;
  note?: string;
}

/**
 * A clean AI-team defaults template. No team names, ids, members, usage, folder ids or
 * `ai_teams_docs_root`; `budgetWarnThresholdPct: null` means inherit the global value.
 */
export interface AiTeamDefaultsTemplate {
  budgetTokens: number;
  concurrencyLimit?: number;
  autoSplitEnabled?: boolean;
  autoApproveMutations?: boolean;
  mcpEnabled?: boolean;
  sshFsToolsEnabled?: boolean;
  oracleToolsEnabled?: boolean;
  budgetWarnThresholdPct?: number | null;
}

export interface ProfileConfig {
  settings: Record<string, unknown>;
  capacityRules: ProfileCapacityRule[];
  capacityOverrides: ProfileCapacityOverride[];
  ghostDevConfig?: GhostDevConfig | null;
  teamDefaults?: AiTeamDefaultsTemplate;
  /** Declared secret fields; every value is `''` in any portable profile. */
  secretFields: Record<string, ''>;
}

/**
 * Telegram is deliberately absent: owner-machine-only configuration, excluded by user
 * decision. No schema section, no export field, no import write.
 */
export interface ConfigurationProfile {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  config: ProfileConfig;
}
