// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../../src/db/index';
import {
  BUDGET_WARN_THRESHOLD_SETTING_KEY,
  getGlobalBudgetWarnThresholdPct,
  setGlobalBudgetWarnThresholdPct,
} from '../../../src/services/ai/budgetWarnSettings';
import { isSafeBackupSetting } from '../../../src/services/backup/exportBackup';
import { DEFAULT_BUDGET_WARN_THRESHOLD_PCT } from '../../../src/types/aiOffice';

describe('budgetWarnSettings (AIO-BUDGET-06, D-04)', () => {
  let db: TaskPlannerDatabase;
  let dbName: string;

  beforeEach(async () => {
    dbName = 'TestBudgetWarnSettings_' + Math.random().toString(36).slice(2);
    db = new TaskPlannerDatabase(dbName);
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('reads the default when the row is absent', async () => {
    expect(await getGlobalBudgetWarnThresholdPct(db)).toBe(DEFAULT_BUDGET_WARN_THRESHOLD_PCT);
    expect(DEFAULT_BUDGET_WARN_THRESHOLD_PCT).toBe(80);
  });

  it('reads a stored value unchanged', async () => {
    await db.settings.put({ key: BUDGET_WARN_THRESHOLD_SETTING_KEY, value: 65 });
    expect(await getGlobalBudgetWarnThresholdPct(db)).toBe(65);
  });

  it('falls back to the default for out-of-band stored values', async () => {
    await db.settings.put({ key: BUDGET_WARN_THRESHOLD_SETTING_KEY, value: 0 });
    expect(await getGlobalBudgetWarnThresholdPct(db)).toBe(DEFAULT_BUDGET_WARN_THRESHOLD_PCT);

    await db.settings.put({ key: BUDGET_WARN_THRESHOLD_SETTING_KEY, value: 1000 });
    expect(await getGlobalBudgetWarnThresholdPct(db)).toBe(DEFAULT_BUDGET_WARN_THRESHOLD_PCT);
  });

  it('falls back to the default for a non-numeric stored value', async () => {
    await db.settings.put({ key: BUDGET_WARN_THRESHOLD_SETTING_KEY, value: '65' });
    expect(await getGlobalBudgetWarnThresholdPct(db)).toBe(DEFAULT_BUDGET_WARN_THRESHOLD_PCT);
  });

  it('reads 100 when 100 is stored', async () => {
    await db.settings.put({ key: BUDGET_WARN_THRESHOLD_SETTING_KEY, value: 100 });
    expect(await getGlobalBudgetWarnThresholdPct(db)).toBe(100);
  });

  it('clamps before writing', async () => {
    await setGlobalBudgetWarnThresholdPct(0, db);
    expect((await db.settings.get(BUDGET_WARN_THRESHOLD_SETTING_KEY))?.value).toBe(1);

    await setGlobalBudgetWarnThresholdPct(1000, db);
    expect((await db.settings.get(BUDGET_WARN_THRESHOLD_SETTING_KEY))?.value).toBe(100);
  });

  it('round-trips a written value', async () => {
    await setGlobalBudgetWarnThresholdPct(65, db);
    expect(await getGlobalBudgetWarnThresholdPct(db)).toBe(65);
  });

  it('passes the backup whitelist without widening it', () => {
    expect(isSafeBackupSetting(BUDGET_WARN_THRESHOLD_SETTING_KEY)).toBe(true);
  });
});
