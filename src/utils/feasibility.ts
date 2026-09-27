import dayjs from 'dayjs';
import type { CapacityRule, CapacityOverride } from '../types/models';
import type { DateInspectionItem } from '../types/feasibility';
import { getEffectiveDailyCapacity } from './capacity';

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
