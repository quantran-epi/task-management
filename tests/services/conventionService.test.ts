import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db/index';
import {
  GLOBAL_CONVENTIONS_SETTING_KEY,
  getGlobalConventions,
  saveGlobalConventions,
  clearGlobalConventions,
} from '../../src/services/conventionService';
import { isSafeBackupSetting } from '../../src/services/backup/exportBackup';

describe('conventionService', () => {
  let testDb: TaskPlannerDatabase;

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase('TestConventionDB_' + Math.random().toString(36).slice(2));
    await testDb.open();
  });

  afterEach(async () => {
    await testDb.delete();
  });

  it('exports GLOBAL_CONVENTIONS_SETTING_KEY as global_conventions', () => {
    expect(GLOBAL_CONVENTIONS_SETTING_KEY).toBe('global_conventions');
  });

  it('returns empty string when setting does not exist in db.settings (empty state preserved)', async () => {
    const content = await getGlobalConventions(testDb);
    expect(content).toBe('');
  });

  it('saves and retrieves global conventions in db.settings', async () => {
    const sampleConventions = '# Tiêu chuẩn kỹ thuật\n\n- Tuân thủ RESTful API\n- Viết test Vitest';
    await saveGlobalConventions(sampleConventions, testDb);

    const storedRow = await testDb.settings.get(GLOBAL_CONVENTIONS_SETTING_KEY);
    expect(storedRow).toBeDefined();
    expect(storedRow?.value).toBe(sampleConventions);

    const retrieved = await getGlobalConventions(testDb);
    expect(retrieved).toBe(sampleConventions);
  });

  it('clears global conventions from db.settings', async () => {
    await saveGlobalConventions('Nội dung tạm thời', testDb);
    expect(await getGlobalConventions(testDb)).toBe('Nội dung tạm thời');

    await clearGlobalConventions(testDb);
    expect(await getGlobalConventions(testDb)).toBe('');
    const row = await testDb.settings.get(GLOBAL_CONVENTIONS_SETTING_KEY);
    expect(row).toBeUndefined();
  });

  it('isSafeBackupSetting returns true for global_conventions to ensure backup inclusion', () => {
    expect(isSafeBackupSetting(GLOBAL_CONVENTIONS_SETTING_KEY)).toBe(true);
  });
});
