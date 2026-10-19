import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db/index';
import {
  splitTelegramMessage,
  resolveScopedContext,
  processTelegramInboundMessage,
  cleanCitationTags,
  broadcastTelegramMessage,
} from '../../src/services/telegram/telegramHeadlessWorker';
import {
  upsertWhitelistUser,
  getRecentTelegramLogs,
  getWhitelistUser,
} from '../../src/services/telegram/telegramSettingsService';
import { getTodayDateString } from '../../src/utils/date';
import type { TelegramInboundEvent } from '../../src/services/telegram/telegramTypes';

vi.mock('../../src/services/ai/nineRouterClient', () => ({
  streamChatEvents: vi.fn(async function* () {
    yield { type: 'text', delta: 'AI reply with [S1] and **bold** formatting' };
    yield { type: 'usage', usage: { total_tokens: 15 } };
  }),
}));

const mockSendDesktopNotification = vi.fn();
vi.mock('../../src/utils/desktopNotification', () => ({
  sendDesktopNotification: (...args: any[]) => mockSendDesktopNotification(...args),
}));

describe('Telegram Headless Worker', () => {
  let testDb: TaskPlannerDatabase;
  const testDbName = 'TestTelegramWorkerDB';

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase(testDbName);
    await testDb.open();
  });

  afterEach(async () => {
    await testDb.delete();
  });

  it('splits long messages correctly into chunks within length limit', () => {
    const shortText = 'Short message';
    expect(splitTelegramMessage(shortText, 50)).toEqual(['Short message']);

    const longParagraphs = 'Paragraph 1\n\nParagraph 2\n\nParagraph 3';
    const chunks = splitTelegramMessage(longParagraphs, 15);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(15);
    }
  });

  it('cleans citation tags properly', () => {
    const raw = 'Answer based on [S1] and [Doc 2] and [Source 3] sources.';
    expect(cleanCitationTags(raw)).toBe('Answer based on  and  and  sources.');
  });

  it('converts markdown with multiple inline codes and underscores correctly without placeholder leak', async () => {
    const { markdownToTelegramHtml } = await import('../../src/services/telegram/telegramHtml');
    const input = 'Bảng giao dịch phổ biến trong SmartVista FE thường là `TXN_LOG` hoặc `AUTH_LOG`, nhưng cần xác nhận trực tiếp trên schema DB của môi trường DEV (`10.4.97.110`).';
    const result = markdownToTelegramHtml(input);
    expect(result).not.toContain('TG_INLINE_CODE');
    expect(result).toContain('<code>TXN_LOG</code>');
    expect(result).toContain('<code>AUTH_LOG</code>');
    expect(result).toContain('<code>10.4.97.110</code>');
  });

  it('resolves scoped context based on dataScope', async () => {
    // 1. pure_llm returns empty string
    const pure = await resolveScopedContext('pure_llm', 'test', testDb);
    expect(pure.contextText).toBe('');
    expect(pure.matchedSourceTitles).toEqual([]);

    // Seed task and note
    await testDb.tasks.add({
      id: 'task-1',
      name: 'Implement Telegram Bot',
      status: 'Open',
      priority: 'High',
      progress: 50,
      estimateMinutes: 120,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await testDb.notes.add({
      id: 'note-1',
      title: 'Bot Architecture Note',
      body: 'Long polling with CancellationToken and HTML parse_mode',
      type: 'quick_note',
      tags: ['bot', 'architecture'],
      isPinned: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // 2. tasks_only contains tasks, not notes
    const tasksOnly = await resolveScopedContext('tasks_only', 'Implement Telegram', testDb);
    expect(tasksOnly.contextText).toContain('Implement Telegram Bot');
    expect(tasksOnly.contextText).not.toContain('Bot Architecture Note');

    // 3. knowledge_only contains notes, not tasks
    const knowledgeOnly = await resolveScopedContext('knowledge_only', 'CancellationToken', testDb);
    expect(knowledgeOnly.contextText).toContain('Bot Architecture Note');
    expect(knowledgeOnly.matchedSourceTitles).toContain('Bot Architecture Note');
    expect(knowledgeOnly.contextText).not.toContain('Implement Telegram Bot');

    // 4. full contains both
    const full = await resolveScopedContext('full', 'Telegram', testDb);
    expect(full.contextText).toContain('Implement Telegram Bot');
    expect(full.contextText).toContain('Bot Architecture Note');
  });

  it('handles /reset and /clear slash commands without invoking AI', async () => {
    await upsertWhitelistUser(
      {
        chatId: 'slash_user_1',
        name: 'Slash User',
        status: 'active',
        dataScope: 'full',
      },
      testDb
    );

    const replies: string[] = [];
    const mockSendReply = vi.fn(async (_token: string, _chatId: string, text: string) => {
      replies.push(text);
    });
    const mockSendAction = vi.fn(async () => {});

    const event: TelegramInboundEvent = {
      update_id: 10,
      message_id: 201,
      chat_id: 'slash_user_1',
      from_name: 'Slash User',
      text: '/reset',
      date: 1234567,
    };

    await processTelegramInboundMessage(
      event,
      'test_token',
      testDb,
      mockSendReply,
      mockSendAction
    );

    expect(mockSendAction).not.toHaveBeenCalled();
    expect(mockSendReply).toHaveBeenCalledTimes(1);
    expect(replies[0]).toContain('Đã đặt lại phiên trò chuyện');

    const updatedUser = await getWhitelistUser('slash_user_1', testDb);
    expect(updatedUser?.sessionResetAt).toBeDefined();
  });

  it('handles /help and /start slash commands without invoking AI', async () => {
    await upsertWhitelistUser(
      {
        chatId: 'slash_user_2',
        name: 'Help User',
        status: 'active',
        dataScope: 'full',
        dailyLimit: 30,
        usedToday: 5,
      },
      testDb
    );

    const replies: string[] = [];
    const mockSendReply = vi.fn(async (_token: string, _chatId: string, text: string) => {
      replies.push(text);
    });
    const mockSendAction = vi.fn(async () => {});

    const event: TelegramInboundEvent = {
      update_id: 11,
      message_id: 202,
      chat_id: 'slash_user_2',
      from_name: 'Help User',
      text: '/help',
      date: 1234568,
    };

    await processTelegramInboundMessage(
      event,
      'test_token',
      testDb,
      mockSendReply,
      mockSendAction
    );

    expect(mockSendAction).not.toHaveBeenCalled();
    expect(mockSendReply).toHaveBeenCalledTimes(1);
    expect(replies[0]).toContain('TaskMate AI Bot — Trợ lý Thông minh');
    expect(replies[0]).toContain('Help User');
  });

  it('allows 3 /help or /reset command executions when over quota but rejects regular messages', async () => {
    await upsertWhitelistUser(
      {
        chatId: 'over_quota_user',
        name: 'Over Quota User',
        status: 'active',
        dailyLimit: 2,
        usedToday: 2,
      },
      testDb
    );

    const replies: string[] = [];
    const mockSendReply = vi.fn(async (_token: string, _chatId: string, text: string) => {
      replies.push(text);
    });
    const mockSendAction = vi.fn(async () => {});

    // 1. Regular chat message -> blocked immediately
    await processTelegramInboundMessage(
      {
        update_id: 20,
        message_id: 301,
        chat_id: 'over_quota_user',
        from_name: 'Over Quota User',
        text: 'Hello, what are my tasks?',
        date: 1234570,
      },
      'test_token',
      testDb,
      mockSendReply,
      mockSendAction
    );
    expect(replies[0]).toContain('Hết hạn mức trong ngày');
    replies.length = 0;

    // 2. /help -> allowed (1/3)
    await processTelegramInboundMessage(
      {
        update_id: 21,
        message_id: 302,
        chat_id: 'over_quota_user',
        from_name: 'Over Quota User',
        text: '/help',
        date: 1234571,
      },
      'test_token',
      testDb,
      mockSendReply,
      mockSendAction
    );
    expect(replies[0]).toContain('TaskMate AI Bot — Trợ lý Thông minh');
    expect(replies[0]).toContain('đã hết hạn mức - còn 2/3 lượt lệnh');
    replies.length = 0;

    // 3. /reset -> allowed (2/3)
    await processTelegramInboundMessage(
      {
        update_id: 22,
        message_id: 303,
        chat_id: 'over_quota_user',
        from_name: 'Over Quota User',
        text: '/reset',
        date: 1234572,
      },
      'test_token',
      testDb,
      mockSendReply,
      mockSendAction
    );
    expect(replies[0]).toContain('Đã đặt lại phiên trò chuyện');
    expect(replies[0]).toContain('còn 1/3 lượt lệnh');
    replies.length = 0;

    // 4. /help -> allowed (3/3)
    await processTelegramInboundMessage(
      {
        update_id: 23,
        message_id: 304,
        chat_id: 'over_quota_user',
        from_name: 'Over Quota User',
        text: '/help',
        date: 1234573,
      },
      'test_token',
      testDb,
      mockSendReply,
      mockSendAction
    );
    expect(replies[0]).toContain('TaskMate AI Bot — Trợ lý Thông minh');
    replies.length = 0;

    // 5. 4th command -> blocked
    await processTelegramInboundMessage(
      {
        update_id: 24,
        message_id: 305,
        chat_id: 'over_quota_user',
        from_name: 'Over Quota User',
        text: '/help',
        date: 1234574,
      },
      'test_token',
      testDb,
      mockSendReply,
      mockSendAction
    );
    expect(replies[0]).toContain('Hết hạn mức trong ngày');
    expect(replies[0]).toContain('3 lượt lệnh');
  });

  it('handles over-quota chat message spam with progressive warnings and drops logs after threshold', async () => {
    await upsertWhitelistUser(
      {
        chatId: 'spam_tester',
        name: 'Spam User',
        status: 'active',
        dailyLimit: 1,
        usedToday: 1,
        lastActiveDate: getTodayDateString(),
      },
      testDb
    );

    const replies: string[] = [];
    const mockSendReply = vi.fn(async (_token: string, _chatId: string, text: string) => {
      replies.push(text);
    });
    const mockSendAction = vi.fn(async () => {});

    // Attempt 1: First over-quota message -> standard notice + log
    await processTelegramInboundMessage(
      {
        update_id: 50,
        message_id: 501,
        chat_id: 'spam_tester',
        from_name: 'Spam User',
        text: 'hello over quota 1',
        date: 1234580,
      },
      'test_token',
      testDb,
      mockSendReply,
      mockSendAction
    );
    expect(replies[0]).toContain('Hết hạn mức trong ngày');
    let logs = await getRecentTelegramLogs(50, testDb);
    expect(logs.some((l) => l.userMessage === 'hello over quota 1')).toBe(true);
    replies.length = 0;

    // Attempt 2: Second over-quota message -> spam warning (2/3) + log
    await processTelegramInboundMessage(
      {
        update_id: 51,
        message_id: 502,
        chat_id: 'spam_tester',
        from_name: 'Spam User',
        text: 'hello over quota 2',
        date: 1234581,
      },
      'test_token',
      testDb,
      mockSendReply,
      mockSendAction
    );
    expect(replies[0]).toContain('Cảnh báo spam (2/3)');
    logs = await getRecentTelegramLogs(50, testDb);
    expect(logs.some((l) => l.userMessage === 'hello over quota 2')).toBe(true);
    replies.length = 0;

    // Attempt 3: Third over-quota message -> spam warning (3/3) + log
    await processTelegramInboundMessage(
      {
        update_id: 52,
        message_id: 503,
        chat_id: 'spam_tester',
        from_name: 'Spam User',
        text: 'hello over quota 3',
        date: 1234582,
      },
      'test_token',
      testDb,
      mockSendReply,
      mockSendAction
    );
    expect(replies[0]).toContain('Cảnh báo spam (3/3)');
    logs = await getRecentTelegramLogs(50, testDb);
    expect(logs.some((l) => l.userMessage === 'hello over quota 3')).toBe(true);
    replies.length = 0;

    // Attempt 4: Fourth over-quota message -> final warning + DROP LOG
    await processTelegramInboundMessage(
      {
        update_id: 53,
        message_id: 504,
        chat_id: 'spam_tester',
        from_name: 'Spam User',
        text: 'hello spam flood 4',
        date: 1234583,
      },
      'test_token',
      testDb,
      mockSendReply,
      mockSendAction
    );
    expect(replies[0]).toContain('Tạm ngưng phản hồi');
    expect(replies[0]).toContain('4 lần');
    // Verify log for message 4 was dropped (not persisted in DB)
    logs = await getRecentTelegramLogs(50, testDb);
    expect(logs.some((l) => l.userMessage === 'hello spam flood 4')).toBe(false);
  });

  it('rejects unauthorized chat ID with approval instructions in HTML format, saves pending user, logs session, and sends desktop notification', async () => {
    mockSendDesktopNotification.mockClear();
    const replies: string[] = [];
    const mockSendReply = vi.fn(async (_token: string, _chatId: string, text: string) => {
      replies.push(text);
    });
    const mockSendAction = vi.fn(async () => {});

    const event: TelegramInboundEvent = {
      update_id: 1,
      message_id: 101,
      chat_id: 'unknown_999',
      from_name: 'Stranger',
      text: 'Who are you?',
      date: 1234567,
    };

    await processTelegramInboundMessage(
      event,
      'test_token',
      testDb,
      mockSendReply,
      mockSendAction
    );

    expect(mockSendReply).toHaveBeenCalledTimes(1);
    expect(replies[0]).toContain('Chưa được phân quyền truy cập');
    expect(replies[0]).toContain('@quan_tr96');
    expect(replies[0]).toContain('<code>unknown_999</code>');
    expect(mockSendAction).not.toHaveBeenCalled();

    // Verify user was recorded as pending
    const pendingUser = await getWhitelistUser('unknown_999', testDb);
    expect(pendingUser).toBeDefined();
    expect(pendingUser?.status).toBe('pending');
    expect(pendingUser?.name).toBe('Stranger');

    // Verify session was logged
    const logs = await getRecentTelegramLogs(10, testDb);
    expect(logs.some((l) => l.chatId === 'unknown_999' && l.userMessage === 'Who are you?')).toBe(true);

    // Verify desktop notification dispatched on first inbound
    expect(mockSendDesktopNotification).toHaveBeenCalledTimes(1);
    expect(mockSendDesktopNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining('Người dùng mới'),
        tag: 'telegram-pending-unknown_999',
      })
    );

    // Second message from same pending user -> notification should NOT trigger again (isNew === false)
    mockSendDesktopNotification.mockClear();
    await processTelegramInboundMessage(
      {
        update_id: 2,
        message_id: 102,
        chat_id: 'unknown_999',
        from_name: 'Stranger',
        text: 'Still waiting for access',
        date: 1234568,
      },
      'test_token',
      testDb,
      mockSendReply,
      mockSendAction
    );
    expect(mockSendDesktopNotification).not.toHaveBeenCalled();
  });

  it('records pending user, sends notification, and logs session for unauthorized /start command', async () => {
    mockSendDesktopNotification.mockClear();
    const replies: string[] = [];
    const mockSendReply = vi.fn(async (_token: string, _chatId: string, text: string) => {
      replies.push(text);
    });
    const mockSendAction = vi.fn(async () => {});

    const event: TelegramInboundEvent = {
      update_id: 3,
      message_id: 103,
      chat_id: 'unauth_slash_1',
      from_name: 'Newcomer',
      text: '/start',
      date: 1234569,
    };

    await processTelegramInboundMessage(
      event,
      'test_token',
      testDb,
      mockSendReply,
      mockSendAction
    );

    expect(mockSendReply).toHaveBeenCalledTimes(1);
    expect(replies[0]).toContain('Chưa được phân quyền truy cập');

    // Pending user recorded
    const pending = await getWhitelistUser('unauth_slash_1', testDb);
    expect(pending?.status).toBe('pending');

    // Log recorded for /start
    const logs = await getRecentTelegramLogs(10, testDb);
    expect(logs.some((l) => l.chatId === 'unauth_slash_1' && l.userMessage === '/start')).toBe(true);

    // Desktop notification triggered
    expect(mockSendDesktopNotification).toHaveBeenCalledTimes(1);
  });

  it('processes authorized user message, strips citations, formats HTML, and logs session', async () => {
    await upsertWhitelistUser(
      {
        chatId: 'authorized_user_1',
        name: 'Duc Quan',
        status: 'active',
        dataScope: 'full',
        dailyLimit: 10,
      },
      testDb
    );

    const replies: string[] = [];
    const mockSendReply = vi.fn(async (_token: string, _chatId: string, text: string) => {
      replies.push(text);
    });
    const mockSendAction = vi.fn(async () => {});

    const event: TelegramInboundEvent = {
      update_id: 2,
      message_id: 102,
      chat_id: 'authorized_user_1',
      from_name: 'Duc Quan',
      text: 'Summary my projects',
      date: 1234568,
    };

    await processTelegramInboundMessage(
      event,
      'test_token',
      testDb,
      mockSendReply,
      mockSendAction
    );

    expect(mockSendAction).toHaveBeenCalledWith('test_token', 'authorized_user_1', 'typing');
    // Notice reply + AI reply
    expect(mockSendReply).toHaveBeenCalledTimes(2);
    expect(replies[0]).toContain('Đang truy vấn dữ liệu');
    // [S1] citation stripped, **bold** converted to <b>bold</b>
    expect(replies[1]).toContain('<b>bold</b>');
    expect(replies[1]).not.toContain('[S1]');

    const logs = await getRecentTelegramLogs(5, testDb);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.chatId).toBe('authorized_user_1');
    expect(logs[0]?.userMessage).toBe('Summary my projects');
    expect(logs[0]?.aiResponse).toContain('AI reply with');
  });

  it('broadcastTelegramMessage sends messages to all target chat IDs and reports results', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url: any, opts: any) => {
      const body = typeof opts?.body === 'string' ? JSON.parse(opts.body) : {};
      if (body.chat_id === 'fail_chat') {
        return {
          ok: false,
          status: 400,
          json: async () => ({ ok: false, description: 'Chat not found' }),
        } as any;
      }
      return {
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 999 } }),
      } as any;
    });

    const res = await broadcastTelegramMessage('dummy_token', ['user_1', 'fail_chat', 'user_2'], 'Hello **World**');
    expect(res.total).toBe(3);
    expect(res.successCount).toBe(2);
    expect(res.failureCount).toBe(1);
    expect(res.failures).toHaveLength(1);
    expect(res.failures[0]?.chatId).toBe('fail_chat');

    fetchSpy.mockRestore();
  });
});
