import dayjs from 'dayjs';
import type { CapacityRule, CapacityOverride } from '../types/models';

export type DailyLoadState = 'no-capacity' | 'available' | 'busy' | 'overloaded';

export interface DayCapacityMetrics {
  date: string; // YYYY-MM-DD
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  effectiveCapacityMinutes: number;
  activeAllocatedMinutes: number;
  inactiveAllocatedMinutes: number;
  netBalanceMinutes: number; // positive = available remaining, negative = overloaded
  loadState: DailyLoadState;
  percent: number; // integer 0 - N%
  isOverloaded: boolean;
  activeTaskCount: number;
  isHighContextSwitching: boolean;
}

/**
 * Resolves effective daily work capacity in minutes for a given calendar date (CAP-03, CAP-04).
 * Checks specific date override first; falls back to weekly template rule; defaults to 0.
 */
export function getEffectiveDailyCapacity(
  date: string,
  rules: Map<number, number> | CapacityRule[],
  overrides: Map<string, number | CapacityOverride> | CapacityOverride[]
): number {
  // 1. Check override
  if (overrides instanceof Map) {
    if (overrides.has(date)) {
      const val = overrides.get(date)!;
      return typeof val === 'number' ? val : val.workMinutes;
    }
  } else {
    const override = overrides.find((o) => o.date === date);
    if (override !== undefined) {
      return override.workMinutes;
    }
  }

  // 2. Check weekly rule
  const dayOfWeek = dayjs(date, 'YYYY-MM-DD').day();
  if (rules instanceof Map) {
    if (rules.has(dayOfWeek)) {
      return rules.get(dayOfWeek)!;
    }
  } else {
    const rule = rules.find((r) => r.dayOfWeek === dayOfWeek);
    if (rule !== undefined) {
      return rule.workMinutes;
    }
  }

  return 0;
}

/**
 * Calculates day capacity metrics, net balance, load state, and context switching flag (D-13, D-14, D-17).
 */
export function calculateDayMetrics(
  date: string,
  capacityMinutes: number,
  activeAllocatedMinutes: number,
  inactiveAllocatedMinutes: number,
  activeTaskCount: number,
  contextSwitchThreshold = 4
): DayCapacityMetrics {
  const dayOfWeek = dayjs(date, 'YYYY-MM-DD').day();
  const netBalanceMinutes = capacityMinutes - activeAllocatedMinutes;

  let loadState: DailyLoadState;
  let percent: number;

  if (capacityMinutes === 0) {
    if (activeAllocatedMinutes > 0) {
      loadState = 'overloaded';
      percent = 100;
    } else {
      loadState = 'no-capacity';
      percent = 0;
    }
  } else {
    const ratio = activeAllocatedMinutes / capacityMinutes;
    percent = Math.round(ratio * 100);
    if (ratio > 1) {
      loadState = 'overloaded';
    } else if (ratio >= 0.8) {
      loadState = 'busy';
    } else {
      loadState = 'available';
    }
  }

  const isOverloaded = loadState === 'overloaded';
  const isHighContextSwitching = activeTaskCount > contextSwitchThreshold;

  return {
    date,
    dayOfWeek,
    effectiveCapacityMinutes: capacityMinutes,
    activeAllocatedMinutes,
    inactiveAllocatedMinutes,
    netBalanceMinutes,
    loadState,
    percent,
    isOverloaded,
    activeTaskCount,
    isHighContextSwitching,
  };
}
