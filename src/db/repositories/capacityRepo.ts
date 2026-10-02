import dayjs from 'dayjs';
import { db, TaskPlannerDatabase } from '../index';
import type { CapacityRule, CapacityOverride } from '../../types/models';
import {
  CapacityRuleInputSchema,
  CapacityOverrideInputSchema,
} from '../../validation/schemas';
import { generateId } from '../../utils/uuid';

/**
 * Sort order helper: Monday (1), Tuesday (2), Wednesday (3), Thursday (4), Friday (5), Saturday (6), Sunday (0).
 */
const DAY_ORDER: Record<number, number> = {
  1: 0,
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  0: 6,
};

/**
 * Fetches all 7 weekly capacity rules, sorted Monday to Sunday (CAP-01, CAP-02).
 */
export async function getCapacityRules(
  targetDb: TaskPlannerDatabase = db
): Promise<CapacityRule[]> {
  const rules = await targetDb.capacityRules.toArray();
  return rules.sort((a, b) => (DAY_ORDER[a.dayOfWeek] ?? 7) - (DAY_ORDER[b.dayOfWeek] ?? 7));
}

/**
 * Updates or creates weekly capacity rule for a weekday (0-6) with bounded work minutes (0-1440) (CAP-01).
 */
export async function updateCapacityRule(
  dayOfWeek: number,
  workMinutes: number,
  targetDb: TaskPlannerDatabase = db
): Promise<void> {
  const validated = CapacityRuleInputSchema.parse({ dayOfWeek, workMinutes });

  await targetDb.transaction('rw', targetDb.capacityRules, async () => {
    const existing = await targetDb.capacityRules.where('dayOfWeek').equals(validated.dayOfWeek).first();
    if (existing) {
      await targetDb.capacityRules.update(existing.id, { workMinutes: validated.workMinutes });
    } else {
      await targetDb.capacityRules.add({
        id: generateId(),
        dayOfWeek: validated.dayOfWeek,
        workMinutes: validated.workMinutes,
      });
    }
  });
}

/**
 * Fetches capacity overrides, optionally filtered by date range, sorted by date ascending (CAP-03).
 */
export async function getCapacityOverrides(
  startDate?: string,
  endDate?: string,
  targetDb: TaskPlannerDatabase = db
): Promise<CapacityOverride[]> {
  let collection = targetDb.capacityOverrides.toCollection();

  if (startDate && endDate) {
    collection = targetDb.capacityOverrides.where('date').between(startDate, endDate, true, true);
  } else if (startDate) {
    collection = targetDb.capacityOverrides.where('date').aboveOrEqual(startDate);
  } else if (endDate) {
    collection = targetDb.capacityOverrides.where('date').belowOrEqual(endDate);
  }

  const overrides = await collection.toArray();
  return overrides.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Upserts a specific date capacity override (CAP-03).
 */
export async function setCapacityOverride(
  date: string,
  workMinutes: number,
  note?: string,
  targetDb: TaskPlannerDatabase = db
): Promise<CapacityOverride> {
  const validated = CapacityOverrideInputSchema.parse({ date, workMinutes, note });

  return await targetDb.transaction('rw', targetDb.capacityOverrides, async () => {
    const existing = await targetDb.capacityOverrides.where('date').equals(validated.date).first();
    if (existing) {
      const updated: CapacityOverride = {
        ...existing,
        workMinutes: validated.workMinutes,
        ...(validated.note !== undefined ? { note: validated.note } : {}),
      };
      if (validated.note === undefined) {
        delete updated.note;
      }
      await targetDb.capacityOverrides.put(updated);
      return updated;
    } else {
      const created: CapacityOverride = {
        id: generateId(),
        date: validated.date,
        workMinutes: validated.workMinutes,
        ...(validated.note !== undefined ? { note: validated.note } : {}),
      };
      await targetDb.capacityOverrides.add(created);
      return created;
    }
  });
}

/**
 * Removes a specific date override, immediately reverting effective capacity to weekly default (CAP-04, D-08).
 */
export async function removeCapacityOverride(
  date: string,
  targetDb: TaskPlannerDatabase = db
): Promise<void> {
  await targetDb.transaction('rw', targetDb.capacityOverrides, async () => {
    await targetDb.capacityOverrides.where('date').equals(date).delete();
  });
}

/**
 * Resolves the effective capacity in minutes for a specific calendar date (CAP-04).
 */
export async function getEffectiveCapacityForDate(
  date: string,
  targetDb: TaskPlannerDatabase = db
): Promise<number> {
  // 1. Check override
  const override = await targetDb.capacityOverrides.where('date').equals(date).first();
  if (override !== undefined) {
    return override.workMinutes;
  }

  // 2. Check weekly template rule
  const dayOfWeek = dayjs(date, 'YYYY-MM-DD').day();
  const rule = await targetDb.capacityRules.where('dayOfWeek').equals(dayOfWeek).first();
  if (rule !== undefined) {
    return rule.workMinutes;
  }

  return 0;
}
