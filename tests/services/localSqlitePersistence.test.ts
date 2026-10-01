import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db';
import {
  configureSqlitePath,
  enqueueLocalSqliteChange,
  flushLocalSqliteNow,
  SQLITE_SETTING_KEYS,
} from '../../src/services/localSqlitePersistence';

const invokeMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

describe('localSqlitePersistence', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`test-local-sqlite-${Date.now()}-${Math.random()}`);
    await db.open();
    invokeMock.mockReset();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('configures selected SQLite path without storing secrets', async () => {
    invokeMock.mockResolvedValueOnce(undefined);

    await configureSqlitePath(db, 'C:/Users/me/tasks.sqlite');

    expect(invokeMock).toHaveBeenCalledWith('sqlite_init', { path: 'C:/Users/me/tasks.sqlite' });
    await expect(db.settings.get(SQLITE_SETTING_KEYS.path)).resolves.toMatchObject({
      value: 'C:/Users/me/tasks.sqlite',
    });
    await expect(db.settings.get(SQLITE_SETTING_KEYS.enabled)).resolves.toMatchObject({ value: true });
    await expect(db.settings.get(SQLITE_SETTING_KEYS.lastFlushAt)).resolves.toBeDefined();
    await expect(db.settings.get('github_token')).resolves.toBeUndefined();
    await expect(db.settings.get('github_passphrase')).resolves.toBeUndefined();
  });

  it('persists hook changes outside transactions that omit settings', async () => {
    await db.transaction('rw', db.tasks, async () => {
      enqueueLocalSqliteChange(db, 'tasks', 'task-1', { id: 'task-1' }, false);
    });

    await expect.poll(async () => (await db.settings.get(SQLITE_SETTING_KEYS.queue))?.value).toEqual([
      expect.objectContaining({ tableName: 'tasks', rowId: 'task-1' }),
    ]);
  });

  it('flushes coalesced row-level changes and clears queue after success', async () => {
    await db.settings.bulkPut([
      { key: SQLITE_SETTING_KEYS.path, value: 'tasks.sqlite' },
      { key: SQLITE_SETTING_KEYS.enabled, value: true },
    ]);
    invokeMock.mockResolvedValueOnce(undefined);

    enqueueLocalSqliteChange(db, 'tasks', 'task-1', { id: 'task-1', name: 'old' }, false);
    enqueueLocalSqliteChange(db, 'tasks', 'task-1', { id: 'task-1', name: 'new' }, false);
    enqueueLocalSqliteChange(db, 'projects', 'project-1', null, true);

    const result = await flushLocalSqliteNow(db);

    expect(result.flushed).toBe(2);
    expect(invokeMock).toHaveBeenCalledWith('sqlite_apply_changes', {
      path: 'tasks.sqlite',
      changes: expect.arrayContaining([
        { tableName: 'tasks', rowId: 'task-1', payloadJson: '{"id":"task-1","name":"new"}', deleted: false },
        { tableName: 'projects', rowId: 'project-1', payloadJson: null, deleted: true },
      ]),
    });
    await expect(db.settings.get(SQLITE_SETTING_KEYS.queue)).resolves.toMatchObject({ value: [] });
    await expect(db.settings.get('github_auto_sync_dirty_since')).resolves.toBeDefined();
  });

  it('marks missing path and keeps queued changes when Tauri reports SQLITE_PATH_MISSING', async () => {
    await db.settings.bulkPut([
      { key: SQLITE_SETTING_KEYS.path, value: 'missing.sqlite' },
      { key: SQLITE_SETTING_KEYS.enabled, value: true },
    ]);
    invokeMock.mockRejectedValueOnce('SQLITE_PATH_MISSING');

    enqueueLocalSqliteChange(db, 'tasks', 'task-1', { id: 'task-1' }, false);

    const result = await flushLocalSqliteNow(db);

    expect(result.missingPath).toBe(true);
    await expect(db.settings.get(SQLITE_SETTING_KEYS.missingPath)).resolves.toMatchObject({ value: true });
    await expect(db.settings.get(SQLITE_SETTING_KEYS.queue)).resolves.toMatchObject({
      value: [expect.objectContaining({ rowId: 'task-1' })],
    });
  });
});
