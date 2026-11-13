import { DEFAULT_BUDGET_WARN_THRESHOLD_PCT } from '../../src/types/aiOffice';
import type { TeamRunSnapshot } from '../../src/services/ai/office/teamRunCoordinator';

/**
 * The single home of the `TeamRunSnapshot` test stub. Four `TeamWorkspace*.test.tsx` files
 * used to spell the shape out by hand and had already drifted; a required field added to the
 * snapshot (plan 08 widens it again) now touches this helper instead of four files.
 *
 * `budgetWarnThresholdPctOverride` is omitted rather than set to `undefined` because
 * `exactOptionalPropertyTypes` is on: an absent key IS the "inherit the global default"
 * representation.
 */
export function makeTeamRunSnapshot(overrides: Partial<TeamRunSnapshot> = {}): TeamRunSnapshot {
  return {
    phase: 'idle',
    agents: [],
    pendingPlan: null,
    pendingApproval: null,
    pausedAgentId: null,
    pausedAgentName: null,
    lastPlan: null,
    lastPlanDecision: null,
    budgetWarnThresholdPct: DEFAULT_BUDGET_WARN_THRESHOLD_PCT,
    ...overrides,
  };
}
