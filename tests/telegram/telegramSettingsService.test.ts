import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db/index';
import {
  getTelegramSettings,
  saveTelegramSettings,
  getWhitelist,
  upsertWhitelistUser,
  deleteWhitelistUser,
  checkAndConsumeQuota,
  logTelegramSession,
  getRecentTelegramLogs,
} from '../../src/services/telegram/telegramSettingsService';
import { getTodayDateString } from '../../src/utils/date';

describe('Telegram Settings Service (Dexie V12)', () => {
  let testDb: TaskPlannerDatabase;
  const testDbName = 'TestTelegramSettingsDB';

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase(testDbName);
    await testDb.open();
  });

  afterEach(async () => {
    await testDb.delete();
  });

  it('retrieves default settings when none exist', async () => {
    const settings = await getTelegramSettings(testDb);
    expect(settings.id).toBe('default');
    expect(settings.botToken).toBe('');
    expect(settings.isEnabled).toBe(false);
    expect(settings.autoStartOnLaunch).toBe(false);
    expect(settings.defaultScope).toBe('full');
  });

  it('saves and updates telegram settings', async () => {
    await saveTelegramSettings(
      {
        botToken: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
        isEnabled: true,
        autoStartOnLaunch: true,
        defaultScope: 'tasks_only',
      },
      testDb
    );

    const updated = await getTelegramSettings(testDb);
    expect(updated.botToken).toBe('123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11');
    expect(updated.isEnabled).toBe(true);
    expect(updated.autoStartOnLaunch).toBe(true);
    expect(updated.defaultScope).toBe('tasks_only');
  });

  it('manages whitelist users correctly', async () => {
    await upsertWhitelistUser(
      {
        chatId: '987654321',
        name: 'Duc Quan',
        status: 'active',
        dataScope: 'full',
        dailyLimit: 25,
      },
      testDb
    );

    const list = await getWhitelist(testDb);
    expect(list).toHaveLength(1);
    expect(list[0]?.chatId).toBe('987654321');
    expect(list[0]?.name).toBe('Duc Quan');
    expect(list[0]?.dailyLimit).toBe(25);

    await deleteWhitelistUser('987654321', testDb);
    const emptyList = await getWhitelist(testDb);
    expect(emptyList).toHaveLength(0);
  });

  it('enforces whitelist authorization and daily quota limits', async () => {
    // 1. Unknown user -> not whitelisted
    const unknown = await checkAndConsumeQuota('999999', testDb);
    expect(unknown.allowed).toBe(false);
    expect(unknown.reason).toBe('not_whitelisted');

    // 2. Blocked user -> blocked
    await upsertWhitelistUser(
      {
        chatId: 'blocked_user',
        status: 'blocked',
        dailyLimit: 10,
      },
      testDb
    );
    const blocked = await checkAndConsumeQuota('blocked_user', testDb);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe('blocked');

    // 3. Active user with limit 2
    await upsertWhitelistUser(
      {
        chatId: 'user_limit_2',
        status: 'active',
        dailyLimit: 2,
        usedToday: 0,
        lastActiveDate: getTodayDateString(),
      },
      testDb
    );

    const req1 = await checkAndConsumeQuota('user_limit_2', testDb);
    expect(req1.allowed).toBe(true);
    expect(req1.usedToday).toBe(1);

    const req2 = await checkAndConsumeQuota('user_limit_2', testDb);
    expect(req2.allowed).toBe(true);
    expect(req2.usedToday).toBe(2);

    const req3 = await checkAndConsumeQuota('user_limit_2', testDb);
    expect(req3.allowed).toBe(false);
    expect(req3.reason).toBe('quota_exceeded');

    // 4. Auto-reset quota on new day
    await upsertWhitelistUser(
      {
        chatId: 'user_limit_2',
        usedToday: 2,
        lastActiveDate: '2020-01-01',
      },
      testDb
    );
    const reqNewDay = await checkAndConsumeQuota('user_limit_2', testDb);
    expect(reqNewDay.allowed).toBe(true);
    expect(reqNewDay.usedToday).toBe(1);
  });

  it('logs telegram sessions and returns recent logs in descending order', async () => {
    await logTelegramSession(
      {
        chatId: '123',
        userName: 'Tester',
        userMessage: 'Hello bot',
        aiResponse: 'Hello user',
        dataScopeUsed: 'full',
        tokenCount: 42,
        createdAt: '2026-10-19T10:00:00Z',
      },
      testDb
    );

    await logTelegramSession(
      {
        chatId: '123',
        userName: 'Tester',
        userMessage: 'What are my tasks?',
        aiResponse: 'Here are your tasks',
        dataScopeUsed: 'tasks_only',
        tokenCount: 65,
        createdAt: '2026-10-19T10:05:00Z',
      },
      testDb
    );

    const logs = await getRecentTelegramLogs(10, testDb);
    expect(logs).toHaveLength(2);
    expect(logs[0]?.userMessage).toBe('What are my tasks?');
    expect(logs[1]?.userMessage).toBe('Hello bot');
  });
});
