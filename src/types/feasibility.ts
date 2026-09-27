import type { Task, PlannedAllocation, CapacityRule, CapacityOverride } from './models';

export type DistributionStrategy = 'balanced-spread' | 'front-load' | 'greedy-fill';

export type DateInspectionStatus =
  | 'available'
  | 'full'
  | 'overloaded'
  | 'excluded-past'
  | 'excluded-non-working';

export interface CandidateAllocation {
  date: string; // YYYY-MM-DD
  dayOfWeek: number;
  existingAllocatedMinutes: number;
  proposedAllocatedMinutes: number;
  totalResultingMinutes: number;
  maxAvailableMinutes: number;
  included: boolean;
}

export interface DateInspectionItem {
  date: string; // YYYY-MM-DD
  dayOfWeek: number;
  capacityMinutes: number;
  activeLoadMinutes: number;
  netBalanceMinutes: number;
  status: DateInspectionStatus;
}

export interface FeasibilityEvaluationInput {
  task: Task;
  existingTaskAllocations: PlannedAllocation[];
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  rules: Map<number, number> | CapacityRule[];
  overrides: Map<string, number> | CapacityOverride[];
  activeAllocationsByDate: Record<string, number>; // other tasks active load
  strategy?: DistributionStrategy;
  maxMinutesPerDay?: number;
  today?: string; // YYYY-MM-DD (defaults to getTodayDateString())
}

export interface FeasibilityResult {
  isFeasible: boolean;
  remainingTaskEstimateMinutes: number;
  totalAvailableNetMinutes: number;
  surplusMinutes: number;
  deficitMinutes: number;
  earliestFeasibleDate?: string;
  candidateAllocations: CandidateAllocation[];
  dateBreakdown: DateInspectionItem[];
}
