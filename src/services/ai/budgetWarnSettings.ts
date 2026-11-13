import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import {
  DEFAULT_BUDGET_WARN_THRESHOLD_PCT,
  MAX_BUDGET_WARN_THRESHOLD_PCT,
  MIN_BUDGET_WARN_THRESHOLD_PCT,
  clampBudgetWarnThresholdPct,
} from '../../types/aiOffice';

/** D-04: the global default threshold lives in the `settings` table, never in a constant. */
export const BUDGET_WARN_THRESHOLD_SETTING_KEY = 'ai_budget_warn_threshold_pct';

export async function getGlobalBudgetWarnThresholdPct(
  db: TaskPlannerDatabase = defaultDb
): Promise<number> {
  const rec = await db.settings.get(BUDGET_WARN_THRESHOLD_SETTING_KEY);
  const raw = rec?.value;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return DEFAULT_BUDGET_WARN_THRESHOLD_PCT;
  }
  const rounded = Math.round(raw);
  if (rounded < MIN_BUDGET_WARN_THRESHOLD_PCT || rounded > MAX_BUDGET_WARN_THRESHOLD_PCT) {
    return DEFAULT_BUDGET_WARN_THRESHOLD_PCT;
  }
  return rounded;
}

export async function setGlobalBudgetWarnThresholdPct(
  value: number,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await db.settings.put({
    key: BUDGET_WARN_THRESHOLD_SETTING_KEY,
    value: clampBudgetWarnThresholdPct(value),
  });
}
