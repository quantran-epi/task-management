import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db/index';
import {
  splitTelegramMessage,
  resolveScopedContext,
  processTelegramInboundMessage,
  cleanCitationTags,
  broadcastTelegramMessage,
  clearTelegramProcessedUpdateIdsForTesting,
} from '../../src/services/telegram/telegramHeadlessWorker';
import {
  upsertWhitelistUser,
  getRecentTelegramLogs,
  getWhitelistUser,
} from '../../src/services/telegram/telegramSettingsService';
import { getTodayDateString } from '../../src/utils/date';
import type { TelegramInboundEvent } from '../../src/services/telegram/telegramTypes';

import {
  setNineRouterApiKey,
  clearNineRouterMemoryCache,
} from '../../src/services/ai/nineRouterTokenService';

const mockStreamChatEvents = vi.fn(async function* (_args?: any) {
  yield { type: 'text', delta: 'AI reply with [S1] and **bold** formatting' };
  yield { type: 'usage', usage: { total_tokens: 15 } };
});

vi.mock('../../src/services/ai/nineRouterClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/ai/nineRouterClient')>();
  return {
    ...actual,
    streamChatEvents: (args: any) => mockStreamChatEvents(args),
  };
});

const mockRouteIntent = vi.fn();
vi.mock('../../src/services/ai/intentRouter', () => ({
  routeIntent: (query: string, deps?: any) => mockRouteIntent(query, deps),
}));

const mockRunGroundedTurn = vi.fn();
vi.mock('../../src/services/ai/groundedTurn', () => ({
  runGroundedTurn: (...args: any[]) => mockRunGroundedTurn(...args),
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
    clearTelegramProcessedUpdateIdsForTesting();
    clearNineRouterMemoryCache();
    mockRouteIntent.mockReset();
    mockRouteIntent.mockResolvedValue({
      intent: 'query_taskmate',
      confidence: 0.95,
      entities: [],
      language: 'vi',
      needs_clarification: false,
      clarify_question: null,
      speculation_requested: false,
    });
    mockRunGroundedTurn.mockReset();
    mockRunGroundedTurn.mockResolvedValue({
      kind: 'operational',
      routedQuery: '',
    });
  });

  afterEach(async () => {
    clearTelegramProcessedUpdateIdsForTesting();
    clearNineRouterMemoryCache();
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

  it('splits long HTML without breaking tags and keeps every chunk balanced', () => {
    const longCode = `<pre><code>${'row_value = 1;\n'.repeat(500)}</code></pre>`;
    const chunks = splitTelegramMessage(longCode, 500);
    expect(chunks.length).toBeGreaterThan(1);

    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(500);
      const stack: string[] = [];
      for (const match of chunk.matchAll(/<\/?([a-zA-Z][\w-]*)(?:\s[^>]*)?>/g)) {
        const name = match[1]!;
        if (match[0].startsWith('</')) {
          expect(stack.pop()).toBe(name);
        } else {
          stack.push(name);
        }
      }
      expect(stack).toEqual([]);
    }
  });

  it('never splits a character reference across chunks', () => {
    const text = `${'x'.repeat(8)}&amp;${'y'.repeat(40)}`;
    const chunks = splitTelegramMessage(text, 10);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(10);
      expect(chunk).not.toMatch(/&[a-zA-Z#0-9]{1,7}$/);
    }
    expect(chunks.join('')).toBe(text);
  });

  it('never splits a UTF-16 surrogate pair across chunks', () => {
    const text = `${'a'.repeat(9)}😀${'b'.repeat(40)}`;
    const chunks = splitTelegramMessage(text, 10);
    const loneSurrogate =
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(10);
      expect(chunk).not.toMatch(loneSurrogate);
    }
    expect(chunks.join('')).toBe(text);
  });

  it('reopens bold and inline code tags carried across a split', () => {
    const text = `<b>${'từ '.repeat(300)}<code>ISS_DATE</code>${' cuối'.repeat(200)}</b>`;
    const chunks = splitTelegramMessage(text, 400);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk).toContain('<b>');
      expect(chunk).toContain('</b>');
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

    // 4. full contains both when query matches both
    const full = await resolveScopedContext('full', 'Bot', testDb);
    expect(full.contextText).toContain('Implement Telegram Bot');
    expect(full.contextText).toContain('Bot Architecture Note');

    // 5. query_knowledge with NO matching notes strictly does NOT leak arbitrary notes
    const noMatchKnowledge = await resolveScopedContext(
      'knowledge_only',
      'NonExistentTopic',
      testDb,
      'query_knowledge'
    );
    expect(noMatchKnowledge.matchedSourceTitles).toEqual([]);
    expect(noMatchKnowledge.contextText).toContain('Không tìm thấy tài liệu');
    expect(noMatchKnowledge.contextText).not.toContain('Bot Architecture Note');

    // 6. query_taskmate intent on full scope includes tasks but NOT notes
    const taskmateIntent = await resolveScopedContext(
      'full',
      'Bot',
      testDb,
      'query_taskmate'
    );
    expect(taskmateIntent.contextText).toContain('Implement Telegram Bot');
    expect(taskmateIntent.contextText).not.toContain('Bot Architecture Note');
    expect(taskmateIntent.matchedSourceTitles).toEqual([]);
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
    // AI reply only (no intermediate query notice message to avoid duplicate clutter)
    expect(mockSendReply).toHaveBeenCalledTimes(1);
    // [S1] citation stripped, **bold** converted to <b>bold</b>
    expect(replies[0]).toContain('<b>bold</b>');
    expect(replies[0]).not.toContain('[S1]');

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

  it('routes admin user messages through admin wizard commands and notifies approved user', async () => {
    // 1. Setup admin and pending guest
    await upsertWhitelistUser(
      {
        chatId: 'admin_worker_chat',
        name: 'The Admin',
        status: 'active',
        isAdmin: true,
      },
      testDb
    );

    await upsertWhitelistUser(
      {
        chatId: 'guest_to_approve',
        name: 'Guest Pending',
        status: 'pending',
      },
      testDb
    );

    const replies: Array<{ chatId: string; text: string }> = [];
    const mockSendReply = vi.fn(async (_token: string, chatId: string, text: string) => {
      replies.push({ chatId, text });
    });
    const mockSendAction = vi.fn(async () => {});

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url: any, init: any) => {
      const body = JSON.parse(init.body);
      replies.push({ chatId: body.chat_id, text: body.text });
      return {
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 111 } }),
      } as any;
    });

    // 1. Admin sends /approve_user
    await processTelegramInboundMessage(
      {
        update_id: 80,
        message_id: 801,
        chat_id: 'admin_worker_chat',
        from_name: 'The Admin',
        text: '/approve_user',
        date: 1234590,
      },
      'test_token',
      testDb,
      mockSendReply,
      mockSendAction
    );
    expect(replies[0]?.text).toContain('Vui lòng nhập <b>Chat ID</b>');
    replies.length = 0;

    // 2. Admin replies with Chat ID to approve
    await processTelegramInboundMessage(
      {
        update_id: 81,
        message_id: 802,
        chat_id: 'admin_worker_chat',
        from_name: 'The Admin',
        text: 'guest_to_approve',
        date: 1234591,
      },
      'test_token',
      testDb,
      mockSendReply,
      mockSendAction
    );

    // Response to admin
    expect(replies.some((r) => r.chatId === 'admin_worker_chat' && r.text.includes('Phê duyệt thành công!'))).toBe(true);
    // Direct notification sent to approved guest
    expect(replies.some((r) => r.chatId === 'guest_to_approve' && r.text.includes('Tài khoản của bạn đã được phê duyệt!'))).toBe(true);

    const approvedUser = await getWhitelistUser('guest_to_approve', testDb);
    expect(approvedUser?.status).toBe('active');

    fetchSpy.mockRestore();
  });

  it('deduplicates duplicate inbound events with identical update_id', async () => {
    await upsertWhitelistUser(
      {
        chatId: 'dedup_user',
        name: 'Dedup User',
        status: 'active',
        dataScope: 'pure_llm',
        dailyLimit: 10,
        usedToday: 0,
        lastActiveDate: getTodayDateString(),
      },
      testDb
    );

    const replies: string[] = [];
    const mockSendReply = vi.fn(async (_token: string, _chatId: string, text: string) => {
      replies.push(text);
    });
    const mockSendAction = vi.fn(async () => {});

    const duplicateEvent: TelegramInboundEvent = {
      update_id: 999123,
      message_id: 777,
      chat_id: 'dedup_user',
      from_name: 'Dedup User',
      text: '/help',
      date: 1234599,
    };

    // First delivery -> processed
    await processTelegramInboundMessage(
      duplicateEvent,
      'test_token',
      testDb,
      mockSendReply,
      mockSendAction
    );
    expect(mockSendReply).toHaveBeenCalledTimes(1);

    // Second delivery of same update_id -> dropped, no second reply
    await processTelegramInboundMessage(
      duplicateEvent,
      'test_token',
      testDb,
      mockSendReply,
      mockSendAction
    );
    expect(mockSendReply).toHaveBeenCalledTimes(1);
  });

  it('routes clarify intent and returns clarify question without streaming AI response', async () => {
    await setNineRouterApiKey('test-key', testDb);
    mockStreamChatEvents.mockClear();

    await upsertWhitelistUser(
      {
        chatId: 'clarify_user',
        name: 'Clarify User',
        status: 'active',
        dataScope: 'full',
      },
      testDb
    );

    mockRouteIntent.mockResolvedValueOnce({
      intent: 'clarify',
      confidence: 0.9,
      entities: [],
      language: 'vi',
      needs_clarification: true,
      clarify_question: 'Bạn muốn hỏi về tiến độ task nào cụ thể?',
      speculation_requested: false,
    });

    const replies: string[] = [];
    const mockSendReply = vi.fn(async (_token: string, _chatId: string, text: string) => {
      replies.push(text);
    });
    const mockSendAction = vi.fn(async () => {});

    await processTelegramInboundMessage(
      {
        update_id: 111,
        message_id: 901,
        chat_id: 'clarify_user',
        from_name: 'Clarify User',
        text: 'cái đó sao rồi',
        date: 1234600,
      },
      'test_token',
      testDb,
      mockSendReply,
      mockSendAction
    );

    expect(mockRouteIntent).toHaveBeenCalledTimes(1);
    expect(mockStreamChatEvents).not.toHaveBeenCalled();
    expect(mockSendReply).toHaveBeenCalledTimes(1);
    expect(replies[0]).toContain('Bạn muốn hỏi về tiến độ task nào cụ thể?');
  });

  it('enforces scope security gate when tasks_only user queries knowledge', async () => {
    await setNineRouterApiKey('test-key', testDb);
    mockStreamChatEvents.mockClear();

    await upsertWhitelistUser(
      {
        chatId: 'tasks_only_user',
        name: 'Tasks Only User',
        status: 'active',
        dataScope: 'tasks_only',
      },
      testDb
    );

    mockRouteIntent.mockResolvedValueOnce({
      intent: 'query_knowledge',
      confidence: 0.95,
      entities: ['Quy trình onboarding'],
      language: 'vi',
      needs_clarification: false,
      clarify_question: null,
      speculation_requested: false,
    });

    const replies: string[] = [];
    const mockSendReply = vi.fn(async (_token: string, _chatId: string, text: string) => {
      replies.push(text);
    });
    const mockSendAction = vi.fn(async () => {});

    await processTelegramInboundMessage(
      {
        update_id: 112,
        message_id: 902,
        chat_id: 'tasks_only_user',
        from_name: 'Tasks Only User',
        text: 'Quy trình onboarding như thế nào?',
        date: 1234601,
      },
      'test_token',
      testDb,
      mockSendReply,
      mockSendAction
    );

    expect(mockRouteIntent).toHaveBeenCalledTimes(1);
    expect(mockRunGroundedTurn).not.toHaveBeenCalled();
    expect(mockStreamChatEvents).not.toHaveBeenCalled();
    expect(mockSendReply).toHaveBeenCalledTimes(1);
    expect(replies[0]).toContain('Phạm vi truy cập bị giới hạn');
    expect(replies[0]).toContain('tasks_only');
  });

  it('enforces scope security gate when knowledge_only user queries tasks or operations', async () => {
    await setNineRouterApiKey('test-key', testDb);
    mockStreamChatEvents.mockClear();

    await upsertWhitelistUser(
      {
        chatId: 'knowledge_only_user',
        name: 'Knowledge User',
        status: 'active',
        dataScope: 'knowledge_only',
      },
      testDb
    );

    mockRouteIntent.mockResolvedValueOnce({
      intent: 'query_taskmate',
      confidence: 0.95,
      entities: ['Task hôm nay'],
      language: 'vi',
      needs_clarification: false,
      clarify_question: null,
      speculation_requested: false,
    });

    const replies: string[] = [];
    const mockSendReply = vi.fn(async (_token: string, _chatId: string, text: string) => {
      replies.push(text);
    });
    const mockSendAction = vi.fn(async () => {});

    await processTelegramInboundMessage(
      {
        update_id: 113,
        message_id: 903,
        chat_id: 'knowledge_only_user',
        from_name: 'Knowledge User',
        text: 'Hôm nay tôi có task nào gấp?',
        date: 1234602,
      },
      'test_token',
      testDb,
      mockSendReply,
      mockSendAction
    );

    expect(mockRouteIntent).toHaveBeenCalledTimes(1);
    expect(mockStreamChatEvents).not.toHaveBeenCalled();
    expect(mockSendReply).toHaveBeenCalledTimes(1);
    expect(replies[0]).toContain('Phạm vi truy cập bị giới hạn');
    expect(replies[0]).toContain('knowledge_only');
  });

  it('passes anti-hallucination rules and temperature 0.1 to streamChatEvents', async () => {
    await setNineRouterApiKey('test-key', testDb);
    mockStreamChatEvents.mockClear();

    await upsertWhitelistUser(
      {
        chatId: 'grounded_user',
        name: 'Grounded User',
        status: 'active',
        dataScope: 'full',
      },
      testDb
    );

    mockRouteIntent.mockResolvedValueOnce({
      intent: 'query_taskmate',
      confidence: 0.98,
      entities: ['Task'],
      language: 'vi',
      needs_clarification: false,
      clarify_question: null,
      speculation_requested: false,
    });

    const replies: string[] = [];
    const mockSendReply = vi.fn(async (_token: string, _chatId: string, text: string) => {
      replies.push(text);
    });
    const mockSendAction = vi.fn(async () => {});

    await processTelegramInboundMessage(
      {
        update_id: 114,
        message_id: 904,
        chat_id: 'grounded_user',
        from_name: 'Grounded User',
        text: 'Kiểm tra task của tôi',
        date: 1234603,
      },
      'test_token',
      testDb,
      mockSendReply,
      mockSendAction
    );

    expect(mockStreamChatEvents).toHaveBeenCalledTimes(1);
    const callArgs = (mockStreamChatEvents.mock.calls as any)[0]?.[0];
    expect(callArgs?.payload?.temperature).toBe(0.1);
    const systemMessage = callArgs?.payload?.messages?.find((m: any) => m.role === 'system');
    expect(systemMessage?.content).toContain('CRITICAL ANTI-HALLUCINATION RULES:');
    expect(systemMessage?.content).toContain('1. NEVER GUESS, ASSUME, OR INVENT DATA.');
    expect(systemMessage?.content).toContain('EXPLICITLY STATE THAT IT IS NOT RECORDED');
  });

  it('invokes federated runGroundedTurn and formats grounded answer with citations for authorized knowledge query', async () => {
    await setNineRouterApiKey('test-key', testDb);
    mockStreamChatEvents.mockClear();
    mockRunGroundedTurn.mockClear();

    await upsertWhitelistUser(
      {
        chatId: 'knowledge_reader',
        name: 'Knowledge Reader',
        status: 'active',
        dataScope: 'full',
      },
      testDb
    );

    mockRouteIntent.mockResolvedValueOnce({
      intent: 'query_knowledge',
      confidence: 0.98,
      entities: ['Quy trình CYTP1002'],
      language: 'vi',
      needs_clarification: false,
      clarify_question: null,
      speculation_requested: false,
    });

    mockRunGroundedTurn.mockResolvedValueOnce({
      kind: 'grounded_answer',
      grounding: {
        schemaVersion: 1,
        authority: 'server',
        outcome: 'READY',
        answer: {
          schemaVersion: 2,
          conclusion: 'Quy trình CYTP1002 hoàn tất bước xác thực OTP theo đặc tả [S1].',
          confidence: 'high',
          confidenceReason: 'Trực tiếp trích xuất từ tài liệu.',
          claims: [
            {
              id: 'C1',
              text: 'Khách hàng phải xác thực mã OTP qua tin nhắn SMS.',
              classification: 'DIRECT',
              citationIds: ['S1'],
              pathId: null,
            },
          ],
          hypotheses: [],
          unsupportedParts: [],
        },
        citations: [
          {
            citationId: 'S1',
            documentId: '11111111-1111-1111-1111-111111111111',
            documentTitle: 'Đặc tả kỹ thuật CYTP1002',
            sectionAnchor: 'section-1',
            lineStart: 1,
            lineEnd: 10,
            authority: 'server',
            evidenceClass: 'OBSERVED',
            snapshotId: 'gsnap_00000001',
            publishedContentHash: 'a'.repeat(64),
            citedExcerpt: 'Khách hàng phải xác thực mã OTP...',
          },
        ],
        paths: null,
        conflicts: null,
        scope: null,
        modalityDiagnostics: null,
        coverageWarnings: [],
        fallbackReason: 'NONE',
        routerVersion: 'router-v1',
        promptVersion: 'grounded-v1',
        modelId: 'gpt-4o',
        createdAt: new Date().toISOString(),
      },
    });

    const replies: string[] = [];
    const mockSendReply = vi.fn(async (_token: string, _chatId: string, text: string) => {
      replies.push(text);
    });
    const mockSendAction = vi.fn(async () => {});

    await processTelegramInboundMessage(
      {
        update_id: 115,
        message_id: 905,
        chat_id: 'knowledge_reader',
        from_name: 'Knowledge Reader',
        text: 'Quy trình CYTP1002 hoạt động như thế nào?',
        date: 1234604,
      },
      'test_token',
      testDb,
      mockSendReply,
      mockSendAction
    );

    expect(mockRunGroundedTurn).toHaveBeenCalledTimes(1);
    expect(mockStreamChatEvents).not.toHaveBeenCalled();
    expect(mockSendReply).toHaveBeenCalledTimes(1);
    // Structural parity with GroundedAnswerCard: claims replace conclusion prose.
    expect(replies[0]).not.toContain('Quy trình CYTP1002 hoàn tất bước xác thực OTP');
    expect(replies[0]).toContain('Khách hàng phải xác thực mã OTP qua tin nhắn SMS');
    expect(replies[0]).toContain('Nguồn tài liệu:</b> Đặc tả kỹ thuật CYTP1002');
  });

  it('handles local_fallback_results from runGroundedTurn with friendly no-evidence message', async () => {
    await setNineRouterApiKey('test-key', testDb);
    mockStreamChatEvents.mockClear();
    mockRunGroundedTurn.mockClear();

    await upsertWhitelistUser(
      {
        chatId: 'knowledge_fallback_user',
        name: 'Knowledge Fallback',
        status: 'active',
        dataScope: 'knowledge_only',
      },
      testDb
    );

    mockRouteIntent.mockResolvedValueOnce({
      intent: 'query_knowledge',
      confidence: 0.95,
      entities: ['Quy tắc lạ'],
      language: 'vi',
      needs_clarification: false,
      clarify_question: null,
      speculation_requested: false,
    });

    mockRunGroundedTurn.mockResolvedValueOnce({
      kind: 'local_fallback_results',
      grounding: {
        schemaVersion: 1,
        authority: 'local',
        outcome: 'NO_EVIDENCE',
        answer: null,
        citations: [],
        paths: null,
        conflicts: null,
        scope: null,
        modalityDiagnostics: null,
        coverageWarnings: [],
        fallbackReason: 'SERVER_DISABLED',
        routerVersion: null,
        promptVersion: 'grounded-v1',
        modelId: null,
        createdAt: new Date().toISOString(),
      },
    });

    const replies: string[] = [];
    const mockSendReply = vi.fn(async (_token: string, _chatId: string, text: string) => {
      replies.push(text);
    });
    const mockSendAction = vi.fn(async () => {});

    await processTelegramInboundMessage(
      {
        update_id: 116,
        message_id: 906,
        chat_id: 'knowledge_fallback_user',
        from_name: 'Knowledge Fallback',
        text: 'Tìm quy tắc lạ',
        date: 1234605,
      },
      'test_token',
      testDb,
      mockSendReply,
      mockSendAction
    );

    expect(mockRunGroundedTurn).toHaveBeenCalledTimes(1);
    expect(mockStreamChatEvents).not.toHaveBeenCalled();
    expect(mockSendReply).toHaveBeenCalledTimes(1);
    expect(replies[0]).toContain('Không tìm thấy tài liệu hoặc bằng chứng nào phù hợp');
  });

  describe('Dynamic MCP Capabilities and Grounding in Telegram Worker', () => {
    beforeEach(async () => {
      await testDb.settings.put({
        key: 'nine_router_config',
        value: {
          endpoint: 'https://api.openai.com/v1',
          defaultModel: 'gpt-4o',
        },
      });
    });

    it('loads enabled MCP capabilities and passes them to routeIntent', async () => {
      await setNineRouterApiKey('test-key', testDb);
      await upsertWhitelistUser(
        {
          chatId: 'mcp_user_1',
          name: 'MCP User',
          status: 'active',
          dataScope: 'full',
        },
        testDb
      );

      // Seed an enabled MCP server
      await testDb.settings.put({
        key: 'mcp_servers',
        value: [
          {
            id: 'mock-mcp',
            name: 'Mock MCP Server',
            url: 'http://localhost:9999/mcp',
            enabled: true,
            instruction: 'Mock instruction',
            cachedTools: ['lookup_table', 'search_facts'],
          },
        ],
      });

      mockRouteIntent.mockResolvedValueOnce({
        intent: 'query_knowledge',
        confidence: 0.95,
        entities: ['Card schema'],
        language: 'vi',
        needs_clarification: false,
        clarify_question: null,
        speculation_requested: false,
        require_mcp: true,
        target_mcp_servers: ['mock-mcp'],
      });

      const mockSendReply = vi.fn(async () => {});
      const mockSendAction = vi.fn(async () => {});

      await processTelegramInboundMessage(
        {
          update_id: 201,
          message_id: 1001,
          chat_id: 'mcp_user_1',
          from_name: 'MCP User',
          text: 'Tra cứu bảng thẻ CMS',
          date: 1234610,
        },
        'test_token',
        testDb,
        mockSendReply,
        mockSendAction
      );

      expect(mockRouteIntent).toHaveBeenCalledTimes(1);
      const routeIntentDeps = mockRouteIntent.mock.calls[0]?.[1];
      expect(routeIntentDeps?.mcpCapabilities).toBeDefined();
      expect(routeIntentDeps.mcpCapabilities.some((c: any) => c.id === 'mock-mcp')).toBe(true);
    });

    it('blocks MCP tool retrieval when user dataScope is tasks_only and require_mcp is true', async () => {
      await setNineRouterApiKey('test-key', testDb);
      await upsertWhitelistUser(
        {
          chatId: 'tasks_only_mcp_user',
          name: 'Tasks Only MCP',
          status: 'active',
          dataScope: 'tasks_only',
        },
        testDb
      );

      mockRouteIntent.mockResolvedValueOnce({
        intent: 'query_taskmate',
        confidence: 0.95,
        entities: [],
        language: 'vi',
        needs_clarification: false,
        clarify_question: null,
        speculation_requested: false,
        require_mcp: true,
        target_mcp_servers: ['mock-mcp'],
      });

      const replies: string[] = [];
      const mockSendReply = vi.fn(async (_t: string, _c: string, text: string) => {
        replies.push(text);
      });
      const mockSendAction = vi.fn(async () => {});

      await processTelegramInboundMessage(
        {
          update_id: 202,
          message_id: 1002,
          chat_id: 'tasks_only_mcp_user',
          from_name: 'Tasks Only MCP',
          text: 'Tra cứu schema hệ thống ngoài',
          date: 1234611,
        },
        'test_token',
        testDb,
        mockSendReply,
        mockSendAction
      );

      expect(mockSendReply).toHaveBeenCalledTimes(1);
      expect(replies[0]).toContain('tasks_only');
      expect(replies[0]).toContain('không thể tra cứu công cụ hệ thống bên ngoài');
      expect(mockRunGroundedTurn).not.toHaveBeenCalled();
      expect(mockStreamChatEvents).not.toHaveBeenCalled();
    });

    it('formatGroundedAnswerForTelegram formats M* citations with Live MCP label', async () => {
      const { formatGroundedAnswerForTelegram } = await import(
        '../../src/services/telegram/telegramHeadlessWorker'
      );

      const grounding: any = {
        schemaVersion: 1,
        authority: 'server',
        outcome: 'READY',
        answer: {
          schemaVersion: 2,
          conclusion: 'Bảng CMS_CARD chứa thông tin thẻ.',
          confidence: 'high',
          claims: [{ id: 'C1', text: 'PAN được mã hóa trong bảng.', classification: 'DIRECT', citationIds: ['M1'] }],
          hypotheses: [],
          unsupportedParts: [],
        },
        citations: [
          {
            citationId: 'S1',
            documentTitle: 'Tài liệu nghiệp vụ thẻ',
          },
          {
            citationId: 'M1',
            documentTitle: 'Graphiti Banking MCP: search_nodes',
          },
        ],
      };

      const formatted = formatGroundedAnswerForTelegram(grounding);
      // Structural parity with GroundedAnswerCard: claims replace conclusion prose.
      expect(formatted).not.toContain('Bảng CMS_CARD chứa thông tin thẻ.');
      expect(formatted).toContain('PAN được mã hóa trong bảng.');
      expect(formatted).toContain('📚 **Nguồn tài liệu:** Tài liệu nghiệp vụ thẻ');
      expect(formatted).toContain('🔌 **Dữ liệu thực tế từ MCP:** Graphiti Banking MCP: search_nodes');
    });

    it('cleanCitationTags removes [M1], [M2] MCP citation tags as well', async () => {
      const raw = 'Thông tin thẻ [M1] và quy trình [S2] từ máy chủ [M12].';
      expect(cleanCitationTags(raw)).toBe('Thông tin thẻ  và quy trình  từ máy chủ .');
    });

    it('non-admin user is rejected from executing dynamic MCP mutation tools', async () => {
      await setNineRouterApiKey('test-key', testDb);
      await upsertWhitelistUser(
        {
          chatId: 'regular_user_mcp',
          name: 'Regular User',
          status: 'active',
          isAdmin: false,
          dataScope: 'full',
        },
        testDb
      );

      mockRouteIntent.mockResolvedValueOnce({
        intent: 'operate_taskmate',
        confidence: 0.95,
        entities: [],
        language: 'vi',
        needs_clarification: false,
        clarify_question: null,
        speculation_requested: false,
        require_mcp: true,
      });

      const replies: string[] = [];
      const mockSendReply = vi.fn(async (_t: string, _c: string, text: string) => {
        replies.push(text);
      });
      const mockSendAction = vi.fn(async () => {});

      await processTelegramInboundMessage(
        {
          update_id: 203,
          message_id: 1003,
          chat_id: 'regular_user_mcp',
          from_name: 'Regular User',
          text: 'Thực thi công cụ sửa đổi ngoài',
          date: 1234612,
        },
        'test_token',
        testDb,
        mockSendReply,
        mockSendAction
      );

      expect(mockSendReply).toHaveBeenCalledTimes(1);
      expect(replies[0]).toContain('Không có quyền thao tác dữ liệu');
      expect(replies[0]).toContain('Chỉ quản trị viên (Admin)');
    });

    it('admin user previews and executes dynamic MCP mutation tool upon confirmation', async () => {
      await setNineRouterApiKey('test-key', testDb);
      await upsertWhitelistUser(
        {
          chatId: 'admin_mcp_user',
          name: 'Admin MCP',
          status: 'active',
          isAdmin: true,
          dataScope: 'full',
        },
        testDb
      );

      // Seed MCP server with a mutating tool
      await testDb.settings.put({
        key: 'mcp_servers',
        value: [
          {
            id: 'banking-core',
            name: 'Banking Core Server',
            url: 'http://localhost:9999/mcp',
            enabled: true,
            instruction: 'Banking tools',
            cachedTools: ['update_card_status'],
          },
        ],
      });

      mockRouteIntent.mockResolvedValueOnce({
        intent: 'operate_taskmate',
        confidence: 0.95,
        entities: [],
        language: 'vi',
        needs_clarification: false,
        clarify_question: null,
        speculation_requested: false,
        require_mcp: true,
      });

      // Mock streamChatEvents to simulate LLM returning tool_calls for update_card_status
      mockStreamChatEvents.mockImplementationOnce((async function* () {
        yield {
          type: 'tool_calls',
          calls: [
            {
              id: 'call_mcp_1',
              type: 'function',
              function: {
                name: 'update_card_status',
                arguments: JSON.stringify({ cardId: 'CARD-123', status: 'BLOCKED' }),
              },
            },
          ],
        } as any;
      }) as any);

      const replies: string[] = [];
      const mockSendReply = vi.fn(async (_t: string, _c: string, text: string) => {
        replies.push(text);
      });
      const mockSendAction = vi.fn(async () => {});

      // Mock discoverAllMcpTools via mcpClient
      const mcpClient = await import('../../src/services/ai/mcpClient');
      const discoverSpy = vi.spyOn(mcpClient, 'discoverAllMcpTools').mockResolvedValueOnce([
        {
          type: 'function',
          function: {
            name: 'update_card_status',
            description: '[Banking Core Server] Cập nhật trạng thái thẻ',
            parameters: {
              type: 'object',
              properties: {
                cardId: { type: 'string' },
                status: { type: 'string' },
              },
              required: ['cardId', 'status'],
            },
          },
        },
      ]);

      // 1. Initial request from Admin
      await processTelegramInboundMessage(
        {
          update_id: 204,
          message_id: 1004,
          chat_id: 'admin_mcp_user',
          from_name: 'Admin MCP',
          text: 'Khóa thẻ CARD-123 trên hệ thống ngoài',
          date: 1234613,
        },
        'test_token',
        testDb,
        mockSendReply,
        mockSendAction
      );

      expect(replies.length).toBeGreaterThan(0);
      const previewText = replies[0]!;
      expect(previewText).toContain('Xác nhận thực thi MCP Tool');
      expect(previewText).toContain('update_card_status');
      expect(previewText).toContain('CARD-123');
      expect(previewText).toContain('BLOCKED');
      replies.length = 0;

      // 2. Admin confirms with OK
      const { getPendingMutation } = await import(
        '../../src/services/telegram/telegramMutationSession'
      );
      const pending = getPendingMutation('admin_mcp_user');
      expect(pending).toBeDefined();
      expect(pending?.isMcp).toBe(true);

      const executeSpy = vi.spyOn(mcpClient, 'executeDynamicMcpTool').mockResolvedValueOnce(
        JSON.stringify({ success: true, message: 'Thẻ CARD-123 đã bị khóa thành công' })
      );

      await processTelegramInboundMessage(
        {
          update_id: 205,
          message_id: 1005,
          chat_id: 'admin_mcp_user',
          from_name: 'Admin MCP',
          text: 'OK',
          date: 1234614,
        },
        'test_token',
        testDb,
        mockSendReply,
        mockSendAction
      );

      expect(executeSpy).toHaveBeenCalledWith(
        'update_card_status',
        { cardId: 'CARD-123', status: 'BLOCKED' },
        testDb,
        { allowMutation: true }
      );
      expect(replies[0]).toContain('Đã thực hiện thành công');
      expect(replies[0]).toContain('Thẻ CARD-123 đã bị khóa thành công');
      executeSpy.mockRestore();
      discoverSpy.mockRestore();
    });
  });

  describe('Telegram Read Tool Execution Loop & Synthesis', () => {
    it('executes read tool query_tasks and synthesizes complete answer for project detail query', async () => {
      await setNineRouterApiKey('test-key', testDb);
      mockStreamChatEvents.mockClear();

      // Seed project and tasks
      const projectId = 'proj-core-banking-1';
      await testDb.projects.add({
        id: projectId,
        name: 'Core Banking Modernization',
        description: 'Upgrade core banking microservices',
        status: 'In Progress',
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-15T00:00:00.000Z',
      });
      await testDb.tasks.add({
        id: 'task-cb-1',
        name: 'Implement ISO8583 Adapter',
        status: 'In Progress',
        priority: 'High',
        progress: 60,
        estimateMinutes: 180,
        projectId,
        createdAt: '2026-10-02T00:00:00.000Z',
        updatedAt: '2026-10-18T00:00:00.000Z',
      });
      await testDb.tasks.add({
        id: 'task-cb-2',
        name: 'Setup HSM Security Module',
        status: 'Open',
        priority: 'Urgent',
        progress: 10,
        estimateMinutes: 240,
        projectId,
        createdAt: '2026-10-03T00:00:00.000Z',
        updatedAt: '2026-10-19T00:00:00.000Z',
      });

      await upsertWhitelistUser(
        {
          chatId: 'query_tool_user',
          name: 'Project Manager',
          status: 'active',
          dataScope: 'full',
          dailyLimit: 20,
        },
        testDb
      );

      mockRouteIntent.mockResolvedValueOnce({
        intent: 'query_taskmate',
        confidence: 0.95,
        entities: ['Core Banking'],
        language: 'vi',
        needs_clarification: false,
        clarify_question: null,
        speculation_requested: false,
      });

      // First call emits tool_calls calling query_tasks
      mockStreamChatEvents.mockImplementationOnce((async function* () {
        yield {
          type: 'tool_calls',
          calls: [
            {
              id: 'call_query_1',
              type: 'function',
              function: {
                name: 'query_tasks',
                arguments: JSON.stringify({ search: 'ISO8583' }),
              },
            },
          ],
        } as any;
      }) as any);

      // Synthesis pass yields final answer
      mockStreamChatEvents.mockImplementationOnce((async function* () {
        yield {
          type: 'text',
          delta: 'Dự án **Core Banking Modernization** có task **Implement ISO8583 Adapter** đang ở trạng thái In Progress (60%).',
        };
        yield { type: 'usage', usage: { total_tokens: 45 } };
      }) as any);

      const replies: string[] = [];
      const mockSendReply = vi.fn(async (_t: string, _c: string, text: string) => {
        replies.push(text);
      });
      const mockSendAction = vi.fn(async () => {});

      await processTelegramInboundMessage(
        {
          update_id: 301,
          message_id: 1101,
          chat_id: 'query_tool_user',
          from_name: 'Project Manager',
          text: 'Cho tôi biết chi tiết dự án Core Banking',
          date: 1234700,
        },
        'test_token',
        testDb,
        mockSendReply,
        mockSendAction
      );

      expect(mockStreamChatEvents).toHaveBeenCalledTimes(2);
      // Verify tools provided in call 1
      const firstCallArgs = (mockStreamChatEvents.mock.calls as any)[0]?.[0];
      expect(firstCallArgs?.payload?.tools).toBeDefined();
      expect(firstCallArgs.payload.tools.some((t: any) => t.function.name === 'query_tasks')).toBe(true);
      expect(firstCallArgs.payload.tools.some((t: any) => t.function.name === 'get_item_details')).toBe(true);
      // Verify mutation tools were excluded
      expect(firstCallArgs.payload.tools.some((t: any) => t.function.name === 'create_task')).toBe(false);
      expect(firstCallArgs.payload.tools.some((t: any) => t.function.name === 'delete_project')).toBe(false);

      // Verify second call (synthesis) was triggered with tool output in messages
      const secondCallArgs = (mockStreamChatEvents.mock.calls as any)[1]?.[0];
      const toolMsg = secondCallArgs?.payload?.messages?.find((m: any) => m.role === 'tool');
      expect(toolMsg).toBeDefined();
      expect(toolMsg.content).toContain('Implement ISO8583 Adapter');

      // Verify user received synthesized answer
      expect(mockSendReply).toHaveBeenCalledTimes(1);
      expect(replies[0]).toContain('Core Banking Modernization');
      expect(replies[0]).toContain('Implement ISO8583 Adapter');
    });

    it('rejects mutation tool execution during normal user query turn without modifying DB', async () => {
      await setNineRouterApiKey('test-key', testDb);
      mockStreamChatEvents.mockClear();

      await upsertWhitelistUser(
        {
          chatId: 'normal_user_hacker',
          name: 'Normal User',
          status: 'active',
          isAdmin: false,
          dataScope: 'full',
          dailyLimit: 20,
        },
        testDb
      );

      mockRouteIntent.mockResolvedValueOnce({
        intent: 'query_taskmate',
        confidence: 0.9,
        entities: [],
        language: 'vi',
        needs_clarification: false,
        clarify_question: null,
        speculation_requested: false,
      });

      // Model attempts to call create_task in query loop
      mockStreamChatEvents.mockImplementationOnce((async function* () {
        yield {
          type: 'tool_calls',
          calls: [
            {
              id: 'call_hack_1',
              type: 'function',
              function: {
                name: 'create_task',
                arguments: JSON.stringify({ name: 'Malicious Task' }),
              },
            },
          ],
        } as any;
      }) as any);

      // Synthesis pass yields rejection explanation
      mockStreamChatEvents.mockImplementationOnce((async function* () {
        yield {
          type: 'text',
          delta: 'Không thể tạo tác vụ vì yêu cầu quyền Admin.',
        };
        yield { type: 'usage', usage: { total_tokens: 30 } };
      }) as any);

      const mockSendReply = vi.fn(async () => {});
      const mockSendAction = vi.fn(async () => {});

      await processTelegramInboundMessage(
        {
          update_id: 302,
          message_id: 1102,
          chat_id: 'normal_user_hacker',
          from_name: 'Normal User',
          text: 'Tạo task hack',
          date: 1234701,
        },
        'test_token',
        testDb,
        mockSendReply,
        mockSendAction
      );

      // Verify task was NOT created in DB
      const allTasks = await testDb.tasks.toArray();
      expect(allTasks.some((t) => t.name === 'Malicious Task')).toBe(false);

      // Verify tool message sent to model contained error explanation
      const secondCallArgs = (mockStreamChatEvents.mock.calls as any)[1]?.[0];
      const toolMsg = secondCallArgs?.payload?.messages?.find((m: any) => m.role === 'tool');
      expect(toolMsg?.content).toContain('Thao tác thay đổi dữ liệu yêu cầu quyền Admin');
    });
  });

  describe('Phase 24 seed-only Telegram handling (SC-6)', () => {
    const SET_ID = '10000000-0000-0000-0000-000000000001';
    const SEED_URN = 'urn:plannermate:core:process:cytp1002';

    function seedOnlyGrounding(overrides: Record<string, unknown> = {}): any {
      return {
        schemaVersion: 1,
        authority: 'server',
        outcome: 'SEED_ONLY',
        answer: null,
        citations: [],
        paths: [],
        conflicts: [],
        scope: {
          setIds: [SET_ID],
          routedScope: { domain: null, environment: null, version: null, comparisonMode: 'single' },
        },
        modalityDiagnostics: {
          fulltext: { status: 'ok', latencyMs: 1, itemCount: 0 },
          vector: { status: 'ok', latencyMs: 1, itemCount: 0 },
          graph: { status: 'ok', latencyMs: 1, itemCount: 1, entityCount: 1, edgeCount: 0, pathCount: 0 },
        },
        coverageWarnings: [],
        fallbackReason: 'NONE',
        routerVersion: 'router-v1',
        promptVersion: 'grounded-v1',
        modelId: 'gpt-4o',
        entities: [
          {
            urn: SEED_URN,
            canonicalName: 'CYTP1002',
            kind: 'ScheduledProcess',
            snapshotId: 'gsnap_11111111',
          },
        ],
        graphCounts: { entity: 1, edge: 0, path: 0 },
        createdAt: new Date().toISOString(),
        ...overrides,
      };
    }

    it('formats a found-entity message instead of no-answer copy', async () => {
      const { formatGroundedAnswerForTelegram } = await import(
        '../../src/services/telegram/telegramHeadlessWorker'
      );

      const formatted = formatGroundedAnswerForTelegram(seedOnlyGrounding());

      expect(formatted).toContain('Đã tìm thấy thực thể');
      expect(formatted).toContain('CYTP1002');
      expect(formatted).toContain(SEED_URN);
      expect(formatted).toContain('Thực thể: 1 · Cạnh: 0 · Đường dẫn: 0');
      expect(formatted).not.toContain('Không tìm thấy câu trả lời phù hợp');
      expect(formatted).not.toContain('Không tìm thấy tài liệu');
    });

    it('prints only failed-seed URNs and stable codes, never stage text', async () => {
      const { formatGroundedAnswerForTelegram } = await import(
        '../../src/services/telegram/telegramHeadlessWorker'
      );

      const formatted = formatGroundedAnswerForTelegram(
        seedOnlyGrounding({
          stageDiagnostics: [
            {
              stage: 'neo4j_traversal',
              status: 'ok',
              latencyMs: 8,
              accepted: 1,
              rejected: 0,
              truncated: true,
              fallback: true,
              fallbackReason: 'FALLBACK_ONE_HOP',
              reasonCodes: ['SEED_FOUND_NO_RELATION'],
            },
          ],
          failedSeeds: [
            { urn: 'urn:plannermate:core:process:missing', reasonCode: 'SEED_NOT_FOUND' },
          ],
        })
      );

      expect(formatted).toContain('urn:plannermate:core:process:missing');
      expect(formatted).toContain('SEED_NOT_FOUND');
      expect(formatted).not.toContain('neo4j_traversal');
      expect(formatted).not.toContain('FALLBACK_ONE_HOP');
      expect(formatted).not.toContain('truncated');
    });

    it('sends the seed-only formatter result for an evidence_only server result', async () => {
      await setNineRouterApiKey('test-key', testDb);
      mockStreamChatEvents.mockClear();
      mockRunGroundedTurn.mockClear();

      await upsertWhitelistUser(
        {
          chatId: 'seed_only_reader',
          name: 'Seed Only Reader',
          status: 'active',
          dataScope: 'full',
        },
        testDb
      );

      mockRouteIntent.mockResolvedValueOnce({
        intent: 'query_knowledge',
        confidence: 0.95,
        entities: ['CYTP1002'],
        language: 'vi',
        needs_clarification: false,
        clarify_question: null,
        speculation_requested: false,
      });

      mockRunGroundedTurn.mockResolvedValueOnce({
        kind: 'evidence_only',
        grounding: seedOnlyGrounding(),
      });

      const replies: string[] = [];
      const mockSendReply = vi.fn(async (_t: string, _c: string, text: string) => {
        replies.push(text);
      });
      const mockSendAction = vi.fn(async () => {});

      await processTelegramInboundMessage(
        {
          update_id: 401,
          message_id: 1201,
          chat_id: 'seed_only_reader',
          from_name: 'Seed Only Reader',
          text: 'CYTP1002 là gì?',
          date: 1234801,
        },
        'test_token',
        testDb,
        mockSendReply,
        mockSendAction
      );

      expect(mockSendReply).toHaveBeenCalledTimes(1);
      expect(replies[0]).toContain('Đã tìm thấy thực thể');
      expect(replies[0]).toContain('CYTP1002');
      expect(replies[0]).not.toContain('Không tìm thấy tài liệu hoặc bằng chứng');
    });

    it('keeps READY grounded-answer formatting unchanged', async () => {
      const { formatGroundedAnswerForTelegram } = await import(
        '../../src/services/telegram/telegramHeadlessWorker'
      );

      const formatted = formatGroundedAnswerForTelegram({
        ...seedOnlyGrounding({ outcome: 'READY', entities: undefined, graphCounts: undefined }),
        answer: {
          schemaVersion: 2,
          conclusion: 'Quy trình CYTP1002 hoàn tất OTP.',
          confidence: 'high',
          confidenceReason: 'Đầy đủ.',
          claims: [],
          hypotheses: [],
          unsupportedParts: [],
        },
      });

      expect(formatted).toContain('Quy trình CYTP1002 hoàn tất OTP.');
      expect(formatted).not.toContain('Đã tìm thấy thực thể');
    });

    it('MCP retrieval contract stays outcome-independent (Open Question 6)', async () => {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const source = await fs.readFile(
        path.resolve(process.cwd(), 'src/services/ai/mcpRetrievalRunner.ts'),
        'utf8'
      );

      expect(source).toContain('interface McpRetrievalResult');
      expect(source).toMatch(/items:\s*McpRetrievedItem\[\]/);
      expect(source).toMatch(/warnings:\s*string\[\]/);
      expect(source).not.toContain('RetrievalOutcome');
      expect(source).not.toContain('itemCount');
    });
  });
});
