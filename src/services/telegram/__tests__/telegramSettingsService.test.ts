import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { Dexie } from 'dexie';
import { TaskPlannerDatabase } from '../../../db';
import {
  approvePendingUser,
  recordPendingTelegramUser,
  saveTelegramSettings,
  upsertWhitelistUser,
} from '../telegramSettingsService';

describe('telegramSettingsService - approvePendingUser', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    Dexie.dependencies.indexedDB = indexedDB;
    Dexie.dependencies.IDBKeyRange = IDBKeyRange;
    db = new TaskPlannerDatabase();
    await db.open();
    await db.telegramSettings.clear();
    await db.telegramWhitelist.clear();
  });

  it('applies current settings.defaultScope when approving pending user without explicit dataScope override', async () => {
    await saveTelegramSettings({ defaultScope: 'knowledge_only' }, db);

    const { user: pendingUser } = await recordPendingTelegramUser('123456', 'Pending Person', db);
    expect(pendingUser.status).toBe('pending');
    expect(pendingUser.dataScope).toBe('knowledge_only');

    const approved = await approvePendingUser('123456', {}, db);
    expect(approved.status).toBe('active');
    expect(approved.dataScope).toBe('knowledge_only');
  });

  it('preserves explicit overrides.dataScope when provided', async () => {
    await saveTelegramSettings({ defaultScope: 'knowledge_only' }, db);

    await recordPendingTelegramUser('123456', 'Pending Person', db);

    const approved = await approvePendingUser('123456', { dataScope: 'tasks_only' }, db);
    expect(approved.status).toBe('active');
    expect(approved.dataScope).toBe('tasks_only');
  });

  it('preserves existing dataScope for active user if called again without override', async () => {
    await saveTelegramSettings({ defaultScope: 'knowledge_only' }, db);

    await upsertWhitelistUser(
      {
        chatId: '789012',
        name: 'Active User',
        status: 'active',
        dataScope: 'pure_llm',
      },
      db
    );

    const reApproved = await approvePendingUser('789012', {}, db);
    expect(reApproved.status).toBe('active');
    expect(reApproved.dataScope).toBe('pure_llm');
  });
});
