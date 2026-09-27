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
