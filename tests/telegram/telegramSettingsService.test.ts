import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db/index';
import {
  getTelegramSettings,
  saveTelegramSettings,
  getWhitelist,
  upsertWhitelistUser,
  deleteWhitelistUser,
  checkAndConsumeQuota,
  checkAndConsumeCommandQuota,
  logTelegramSession,
  getRecentTelegramLogs,
  resetTelegramUserSession,
  getTelegramChatHistory,
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
    expect(req3.overQuotaAttempts).toBe(1);
    expect(req3.isSpamming).toBe(false);
    expect(req3.shouldDropLog).toBe(false);

    // Spamming over quota: attempts increment and triggers drop log when > 3
    const reqSpam2 = await checkAndConsumeQuota('user_limit_2', testDb);
    expect(reqSpam2.overQuotaAttempts).toBe(2);
    expect(reqSpam2.isSpamming).toBe(true);
    expect(reqSpam2.shouldDropLog).toBe(false);

    const reqSpam3 = await checkAndConsumeQuota('user_limit_2', testDb);
    expect(reqSpam3.overQuotaAttempts).toBe(3);
    expect(reqSpam3.shouldDropLog).toBe(false);

    const reqSpam4 = await checkAndConsumeQuota('user_limit_2', testDb);
    expect(reqSpam4.overQuotaAttempts).toBe(4);
    expect(reqSpam4.shouldDropLog).toBe(true);

    // 4. Slash commands don't consume dailyLimit, but allow max 3 commands when over quota
    const cmd1 = await checkAndConsumeCommandQuota('user_limit_2', testDb);
    expect(cmd1.allowed).toBe(true);
    expect(cmd1.isOverQuota).toBe(true);
    expect(cmd1.overQuotaCommandsRemaining).toBe(2);

    const cmd2 = await checkAndConsumeCommandQuota('user_limit_2', testDb);
    expect(cmd2.allowed).toBe(true);
    expect(cmd2.overQuotaCommandsRemaining).toBe(1);

    const cmd3 = await checkAndConsumeCommandQuota('user_limit_2', testDb);
    expect(cmd3.allowed).toBe(true);
    expect(cmd3.overQuotaCommandsRemaining).toBe(0);

    const cmd4 = await checkAndConsumeCommandQuota('user_limit_2', testDb);
    expect(cmd4.allowed).toBe(false);
    expect(cmd4.reason).toBe('quota_exceeded');

    // 5. Auto-reset quota on new day
    await upsertWhitelistUser(
      {
        chatId: 'user_limit_2',
        usedToday: 2,
        overQuotaCommandsUsed: 3,
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

  it('resets user session and extracts bounded chat history', async () => {
    await upsertWhitelistUser(
      {
        chatId: 'user_history_1',
        name: 'History User',
        status: 'active',
        maxHistoryTurns: 3,
      },
      testDb
    );

    // Seed 4 session logs
    await logTelegramSession(
      {
        chatId: 'user_history_1',
        userMessage: 'Question 1',
        aiResponse: 'Answer 1',
        dataScopeUsed: 'full',
        createdAt: '2026-10-19T09:00:00Z',
      },
      testDb
    );

    await logTelegramSession(
      {
        chatId: 'user_history_1',
        userMessage: 'Question 2',
        aiResponse: 'Answer 2',
        dataScopeUsed: 'full',
        createdAt: '2026-10-19T09:05:00Z',
      },
      testDb
    );

    await logTelegramSession(
      {
        chatId: 'user_history_1',
        userMessage: 'Question 3',
        aiResponse: 'Answer 3',
        dataScopeUsed: 'full',
        createdAt: '2026-10-19T09:10:00Z',
      },
      testDb
    );

    await logTelegramSession(
      {
        chatId: 'user_history_1',
        userMessage: 'Question 4',
        aiResponse: 'Answer 4',
        dataScopeUsed: 'full',
        createdAt: '2026-10-19T09:15:00Z',
      },
      testDb
    );

    // Fetch max 2 turns (should be Question 3 and Question 4)
    const history2 = await getTelegramChatHistory('user_history_1', 2, undefined, testDb);
    expect(history2).toHaveLength(4);
    expect(history2[0]).toEqual({ role: 'user', content: 'Question 3' });
    expect(history2[1]).toEqual({ role: 'assistant', content: 'Answer 3' });
    expect(history2[2]).toEqual({ role: 'user', content: 'Question 4' });
    expect(history2[3]).toEqual({ role: 'assistant', content: 'Answer 4' });

    // Reset session at 09:12:00
    const resetUser = await resetTelegramUserSession('user_history_1', testDb);
    expect(resetUser?.sessionResetAt).toBeDefined();

    // Query with sinceIso filter (e.g. 09:12:00)
    const historyAfterReset = await getTelegramChatHistory(
      'user_history_1',
      5,
      '2026-10-19T09:12:00Z',
      testDb
    );
    expect(historyAfterReset).toHaveLength(2);
    expect(historyAfterReset[0]).toEqual({ role: 'user', content: 'Question 4' });
    expect(historyAfterReset[1]).toEqual({ role: 'assistant', content: 'Answer 4' });

    // When maxTurns is 0
    const history0 = await getTelegramChatHistory('user_history_1', 0, undefined, testDb);
    expect(history0).toEqual([]);
  });
});
