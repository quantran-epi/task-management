import dayjs from 'dayjs';
import type { CapacityRule, CapacityOverride } from '../types/models';
import type {
  CandidateAllocation,
  DateInspectionItem,
  FeasibilityEvaluationInput,
  FeasibilityResult,
} from '../types/feasibility';
import { getEffectiveDailyCapacity } from './capacity';
import { getTodayDateString, isValidMinutes } from './date';

/**
 * Evaluates date capacity metrics and status category (CALC-01, CALC-02, CALC-04, D-01, D-04).
 */
export function inspectDateCapacity(
  date: string,
  today: string,
  taskId: string,
  rules: Map<number, number> | CapacityRule[],
  overrides: Map<string, number> | CapacityOverride[],
  otherTasksActiveLoad: number
): DateInspectionItem {
  void taskId;
  const isPast = date < today;
  const capacityMinutes = getEffectiveDailyCapacity(date, rules, overrides);
  const netBalanceMinutes = Math.max(0, capacityMinutes - otherTasksActiveLoad);
  const dayOfWeek = dayjs(date, 'YYYY-MM-DD').day();

  let status: DateInspectionItem['status'];
  if (isPast) {
    status = 'excluded-past';
  } else if (capacityMinutes === 0) {
    status = 'excluded-non-working';
  } else if (otherTasksActiveLoad > capacityMinutes) {
    status = 'overloaded';
  } else if (netBalanceMinutes === 0) {
    status = 'full';
  } else {
    status = 'available';
  }

  return {
    date,
    dayOfWeek,
    capacityMinutes,
    activeLoadMinutes: otherTasksActiveLoad,
    netBalanceMinutes,
    status,
  };
}

/**
 * Projects forward to find earliest feasible completion date (CALC-03, D-09, T-04-01).
 * Hard-capped at maxHorizonDays (default 365) to prevent infinite loops.
 */
export function findEarliestFeasibleDate(
  startDate: string,
  requiredMinutes: number,
  rules: Map<number, number> | CapacityRule[],
  overrides: Map<string, number> | CapacityOverride[],
  getOtherLoadForDate: (date: string) => number,
  maxHorizonDays = 365
): string | undefined {
  if (requiredMinutes <= 0) return startDate;

  let accumulated = 0;
  let cursor = dayjs(startDate, 'YYYY-MM-DD');

  for (let i = 0; i < maxHorizonDays; i++) {
    const dateStr = cursor.format('YYYY-MM-DD');
    const cap = getEffectiveDailyCapacity(dateStr, rules, overrides);
    if (cap > 0) {
      const otherLoad = getOtherLoadForDate(dateStr);
      const available = Math.max(0, cap - otherLoad);
      accumulated += available;
      if (accumulated >= requiredMinutes) {
        return dateStr;
      }
    }
    cursor = cursor.add(1, 'day');
  }

  return undefined;
}

/**
 * Balanced spread distribution algorithm (CALC-05, D-05, D-07).
 * Iteratively allocates 15-minute quanta to lowest loaded eligible day.
 * Breaks ties using earlier calendar date.
 */
export function distributeBalancedSpread(
  eligibleDays: { date: string; capacityMinutes: number; activeLoad: number; maxMinutes: number }[],
  minutesToDistribute: number,
  quantum = 15
): Map<string, number> {
  const proposed = new Map<string, number>();
  for (const d of eligibleDays) proposed.set(d.date, 0);

  let remaining = minutesToDistribute;
  while (remaining >= quantum) {
    const candidates = eligibleDays.filter(
      (d) => (proposed.get(d.date) ?? 0) + quantum <= d.maxMinutes
    );
    if (candidates.length === 0) break;

    candidates.sort((a, b) => {
      const loadA = (a.activeLoad + (proposed.get(a.date) ?? 0)) / a.capacityMinutes;
      const loadB = (b.activeLoad + (proposed.get(b.date) ?? 0)) / b.capacityMinutes;
      if (Math.abs(loadA - loadB) > 0.0001) {
        return loadA - loadB;
      }
      return a.date.localeCompare(b.date);
    });

    const chosen = candidates[0]!;
    proposed.set(chosen.date, (proposed.get(chosen.date) ?? 0) + quantum);
    remaining -= quantum;
  }

  // Consolidate non-quantum residual (< 15m) into first eligible day with capacity (D-07)
  if (remaining > 0) {
    for (const d of eligibleDays) {
      const cur = proposed.get(d.date) ?? 0;
      if (cur + remaining <= d.maxMinutes) {
        proposed.set(d.date, cur + remaining);
        break;
      }
    }
  }

  return proposed;
}

/**
 * Front-load distribution algorithm (CALC-05, D-05).
 * Fills available capacity from earliest eligible date forward.
 */
export function distributeFrontLoad(
  eligibleDays: { date: string; capacityMinutes: number; activeLoad: number; maxMinutes: number }[],
  minutesToDistribute: number,
  quantum = 15
): Map<string, number> {
  void quantum;
  const proposed = new Map<string, number>();
  for (const d of eligibleDays) proposed.set(d.date, 0);

  const sortedDays = [...eligibleDays].sort((a, b) => a.date.localeCompare(b.date));
  let remaining = minutesToDistribute;

  for (const d of sortedDays) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, d.maxMinutes);
    proposed.set(d.date, take);
    remaining -= take;
  }

  return proposed;
}

/**
 * Greedy fill distribution algorithm (CALC-05, D-05).
 * Fills lowest-load days completely to minimize active working days.
 */
export function distributeGreedyFill(
  eligibleDays: { date: string; capacityMinutes: number; activeLoad: number; maxMinutes: number }[],
  minutesToDistribute: number,
  quantum = 15
): Map<string, number> {
  void quantum;
  const proposed = new Map<string, number>();
  for (const d of eligibleDays) proposed.set(d.date, 0);

  const sortedDays = [...eligibleDays].sort((a, b) => {
    const loadA = a.activeLoad / a.capacityMinutes;
    const loadB = b.activeLoad / b.capacityMinutes;
    if (Math.abs(loadA - loadB) > 0.0001) {
      return loadA - loadB;
    }
    return a.date.localeCompare(b.date);
  });

  let remaining = minutesToDistribute;
  for (const d of sortedDays) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, d.maxMinutes);
    proposed.set(d.date, take);
    remaining -= take;
  }

  return proposed;
}

/**
 * Master feasibility evaluator (CALC-01 through CALC-05, D-01 through D-09, T-04-02).
 * Pure function evaluating task feasibility, surplus/deficit, projection, and candidate allocations.
 */
export function evaluateTaskFeasibility(input: FeasibilityEvaluationInput): FeasibilityResult {
  const today = input.today ?? getTodayDateString();
  const strategy = input.strategy ?? 'balanced-spread';

  // 1. T-04-02: validate minutes and clamp
  const estimateMinutes = isValidMinutes(input.task.estimateMinutes)
    ? input.task.estimateMinutes
    : 0;

  const totalExistingAllocated = input.existingTaskAllocations.reduce(
    (sum, a) => sum + (isValidMinutes(a.allocatedMinutes) ? a.allocatedMinutes : 0),
    0
  );

  const remainingTaskEstimateMinutes = Math.max(0, estimateMinutes - totalExistingAllocated);

  const taskExistingByDate = new Map<string, number>();
  for (const a of input.existingTaskAllocations) {
    if (isValidMinutes(a.allocatedMinutes)) {
      taskExistingByDate.set(a.date, (taskExistingByDate.get(a.date) ?? 0) + a.allocatedMinutes);
    }
  }

  // 2. Iterate dates in range [startDate, endDate]
  const dateBreakdown: DateInspectionItem[] = [];
  const eligibleDays: {
    date: string;
    capacityMinutes: number;
    activeLoad: number;
    maxMinutes: number;
    existingTaskMinutes: number;
  }[] = [];

  let cursor = dayjs(input.startDate, 'YYYY-MM-DD');
  const end = dayjs(input.endDate, 'YYYY-MM-DD');

  let totalAvailableNetMinutes = 0;

  while (!cursor.isAfter(end)) {
    const dateStr = cursor.format('YYYY-MM-DD');
    const otherLoad = input.activeAllocationsByDate[dateStr] ?? 0;
    const inspection = inspectDateCapacity(
      dateStr,
      today,
      input.task.id,
      input.rules,
      input.overrides,
      otherLoad
    );
    dateBreakdown.push(inspection);

    const existingTask = taskExistingByDate.get(dateStr) ?? 0;

    // Eligible if not past, capacity > 0, netBalance > 0
    if (dateStr >= today && inspection.capacityMinutes > 0 && inspection.netBalanceMinutes > 0) {
      const netAvailableForTask = Math.max(0, inspection.netBalanceMinutes - existingTask);
      totalAvailableNetMinutes += netAvailableForTask;

      let maxAllowedForTask = netAvailableForTask;
      if (input.maxMinutesPerDay !== undefined && input.maxMinutesPerDay > 0) {
        maxAllowedForTask = Math.min(
          netAvailableForTask,
          Math.max(0, input.maxMinutesPerDay - existingTask)
        );
      }

      eligibleDays.push({
        date: dateStr,
        capacityMinutes: inspection.capacityMinutes,
        activeLoad: otherLoad,
        maxMinutes: maxAllowedForTask,
        existingTaskMinutes: existingTask,
      });
    }

    cursor = cursor.add(1, 'day');
  }

  const isFeasible = remainingTaskEstimateMinutes <= totalAvailableNetMinutes;
  const surplusMinutes = Math.max(0, totalAvailableNetMinutes - remainingTaskEstimateMinutes);
  const deficitMinutes = Math.max(0, remainingTaskEstimateMinutes - totalAvailableNetMinutes);

  let earliestFeasibleDate: string | undefined;
  if (!isFeasible) {
    const getOtherLoad = (d: string) =>
      (input.activeAllocationsByDate[d] ?? 0) + (taskExistingByDate.get(d) ?? 0);
    earliestFeasibleDate = findEarliestFeasibleDate(
      input.startDate,
      remainingTaskEstimateMinutes,
      input.rules,
      input.overrides,
      getOtherLoad
    );
  }

  // 3. Generate candidate allocations
  const minutesToDistribute = Math.min(remainingTaskEstimateMinutes, totalAvailableNetMinutes);
  let distributionMap = new Map<string, number>();

  if (minutesToDistribute > 0 && eligibleDays.length > 0) {
    if (strategy === 'front-load') {
      distributionMap = distributeFrontLoad(eligibleDays, minutesToDistribute);
    } else if (strategy === 'greedy-fill') {
      distributionMap = distributeGreedyFill(eligibleDays, minutesToDistribute);
    } else {
      distributionMap = distributeBalancedSpread(eligibleDays, minutesToDistribute);
    }
  }

  const candidateAllocations: CandidateAllocation[] = eligibleDays.map((d) => {
    const proposed = distributionMap.get(d.date) ?? 0;
    return {
      date: d.date,
      dayOfWeek: dayjs(d.date, 'YYYY-MM-DD').day(),
      existingAllocatedMinutes: d.existingTaskMinutes,
      proposedAllocatedMinutes: proposed,
      totalResultingMinutes: d.existingTaskMinutes + proposed,
      maxAvailableMinutes: d.maxMinutes,
      included: true,
    };
  });

  return {
    isFeasible,
    remainingTaskEstimateMinutes,
    totalAvailableNetMinutes,
    surplusMinutes,
    deficitMinutes,
    earliestFeasibleDate,
    candidateAllocations,
    dateBreakdown,
  };
}
