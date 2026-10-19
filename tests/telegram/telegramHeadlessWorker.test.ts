import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db/index';
import {
  splitTelegramMessage,
  resolveScopedContext,
  processTelegramInboundMessage,
  cleanCitationTags,
} from '../../src/services/telegram/telegramHeadlessWorker';
import {
  upsertWhitelistUser,
  getRecentTelegramLogs,
  getWhitelistUser,
} from '../../src/services/telegram/telegramSettingsService';
import type { TelegramInboundEvent } from '../../src/services/telegram/telegramTypes';

vi.mock('../../src/services/ai/nineRouterClient', () => ({
  streamChatEvents: vi.fn(async function* () {
    yield { type: 'text', delta: 'AI reply with [S1] and **bold** formatting' };
    yield { type: 'usage', usage: { total_tokens: 15 } };
  }),
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

  it('rejects unauthorized chat ID with approval instructions in HTML format', async () => {
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
});
