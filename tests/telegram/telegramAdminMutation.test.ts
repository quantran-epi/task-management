import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db/index';
import {
  processTelegramInboundMessage,
  clearTelegramProcessedUpdateIdsForTesting,
} from '../../src/services/telegram/telegramHeadlessWorker';
import {
  upsertWhitelistUser,
  getWhitelistUser,
} from '../../src/services/telegram/telegramSettingsService';
import {
  getPendingMutation,
  setPendingMutation,
  clearAllPendingMutationsForTesting,
  isConfirmationMessage,
  isCancellationMessage,
} from '../../src/services/telegram/telegramMutationSession';
import { setNineRouterApiKey } from '../../src/services/ai/nineRouterTokenService';

const mockStreamChatEvents = vi.fn(async function* (args: any) {
  // If tools are provided, simulate model calling create_task tool
  if (args.payload?.tools && args.payload.tools.length > 0) {
    yield {
      type: 'tool_calls',
      calls: [
        {
          id: 'call_1',
          type: 'function',
          function: {
            name: 'create_task',
            arguments: JSON.stringify({
              name: 'Viết test cho Telegram mutation',
              priority: 'High',
              estimateMinutes: 60,
              deadline: '2026-10-25',
            }),
          },
        },
      ],
    };
    yield { type: 'usage', usage: { total_tokens: 30 } };
  } else {
    yield { type: 'text', delta: 'Đã hoàn tất xử lý.' };
    yield { type: 'usage', usage: { total_tokens: 10 } };
  }
});

vi.mock('../../src/services/ai/nineRouterClient', () => ({
  streamChatEvents: (args: any) => mockStreamChatEvents(args),
}));

const mockRouteIntent = vi.fn();
vi.mock('../../src/services/ai/intentRouter', () => ({
  routeIntent: (query: string, deps?: any) => mockRouteIntent(query, deps),
}));

describe('Telegram Admin Mutation Flow', () => {
  let testDb: TaskPlannerDatabase;
  const testDbName = 'TestTelegramAdminMutationDB';

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase(testDbName);
    await testDb.open();
    clearTelegramProcessedUpdateIdsForTesting();
    clearAllPendingMutationsForTesting();
    mockRouteIntent.mockReset();
    mockStreamChatEvents.mockClear();
  });

  afterEach(async () => {
    clearTelegramProcessedUpdateIdsForTesting();
    clearAllPendingMutationsForTesting();
    await testDb.delete();
  });

  it('correctly detects confirmation and cancellation keywords', () => {
    expect(isConfirmationMessage('OK')).toBe(true);
    expect(isConfirmationMessage('ok.')).toBe(true);
    expect(isConfirmationMessage('xác nhận')).toBe(true);
    expect(isConfirmationMessage('đồng ý')).toBe(true);
    expect(isConfirmationMessage('tiến hành!')).toBe(true);
    expect(isConfirmationMessage('làm đi')).toBe(true);
    expect(isConfirmationMessage('hello')).toBe(false);

    expect(isCancellationMessage('Hủy')).toBe(true);
    expect(isCancellationMessage('cancel')).toBe(true);
    expect(isCancellationMessage('bỏ qua')).toBe(true);
    expect(isCancellationMessage('không')).toBe(true);
    expect(isCancellationMessage('thôi')).toBe(true);
    expect(isCancellationMessage('xác nhận')).toBe(false);
  });

  it('rejects mutation intent when user is not an Admin', async () => {
    await setNineRouterApiKey('test-key', testDb);
    await upsertWhitelistUser(
      {
        chatId: 'regular_user_1',
        name: 'Regular User',
        status: 'active',
        isAdmin: false,
        dailyLimit: 10,
        usedToday: 0,
      },
      testDb
    );

    mockRouteIntent.mockResolvedValueOnce({
      intent: 'operate_taskmate',
      confidence: 0.98,
      entities: ['Task mới'],
      language: 'vi',
      needs_clarification: false,
      clarify_question: null,
      speculation_requested: false,
    });

    const replies: string[] = [];
    const mockSendReply = vi.fn(async (_token: string, _chatId: string, text: string) => {
      replies.push(text);
    });

    await processTelegramInboundMessage(
      {
        update_id: 201,
        message_id: 1,
        chat_id: 'regular_user_1',
        from_name: 'Regular',
        text: 'Tạo task mới kiểm thử hệ thống',
        date: 123456,
      },
      'bot_token',
      testDb,
      mockSendReply
    );

    expect(replies[0]).toContain('Không có quyền thao tác dữ liệu');
    expect(replies[0]).toContain('Chỉ quản trị viên (Admin)');

    // Ensure pending mutation was NOT set
    expect(getPendingMutation('regular_user_1')).toBeUndefined();
  });

  it('admin mutation generates preview, stores pending state, and does not deduct quota', async () => {
    await setNineRouterApiKey('test-key', testDb);
    await upsertWhitelistUser(
      {
        chatId: 'admin_chat_1',
        name: 'Super Admin',
        status: 'active',
        isAdmin: true,
        dailyLimit: 5,
        usedToday: 2,
      },
      testDb
    );

    mockRouteIntent.mockResolvedValueOnce({
      intent: 'operate_taskmate',
      confidence: 0.98,
      entities: ['Viết test'],
      language: 'vi',
      needs_clarification: false,
      clarify_question: null,
      speculation_requested: false,
    });

    const replies: string[] = [];
    const mockSendReply = vi.fn(async (_token: string, _chatId: string, text: string) => {
      replies.push(text);
    });

    await processTelegramInboundMessage(
      {
        update_id: 202,
        message_id: 2,
        chat_id: 'admin_chat_1',
        from_name: 'Admin',
        text: 'Tạo task Viết test cho Telegram mutation deadline 2026-10-25',
        date: 123457,
      },
      'bot_token',
      testDb,
      mockSendReply
    );

    expect(replies[0]).toContain('Xác nhận thao tác TaskMate');
    expect(replies[0]).toContain('create_task');
    expect(replies[0]).toContain('Viết test cho Telegram mutation');
    expect(replies[0]).toContain('Gõ <b>OK</b> hoặc <b>Xác nhận</b> để thực hiện');

    // Pending state must be stored
    const pending = getPendingMutation('admin_chat_1');
    expect(pending).toBeDefined();
    expect(pending?.toolName).toBe('create_task');
    expect(pending?.args.name).toBe('Viết test cho Telegram mutation');

    // Quota check: admin usedToday should NOT be incremented (refunded/exempt)
    const adminUser = await getWhitelistUser('admin_chat_1', testDb);
    expect(adminUser?.usedToday).toBe(2);

    // Verify task is NOT yet created in database before confirmation
    const tasksBefore = await testDb.tasks.toArray();
    expect(tasksBefore).toHaveLength(0);
  });

  it('admin confirms mutation with OK: executes tool, saves to IndexedDB, and clears pending state', async () => {
    await setNineRouterApiKey('test-key', testDb);
    await upsertWhitelistUser(
      {
        chatId: 'admin_chat_1',
        name: 'Super Admin',
        status: 'active',
        isAdmin: true,
      },
      testDb
    );

    // Seed pending mutation in session
    setPendingMutation({
      chatId: 'admin_chat_1',
      toolName: 'create_task',
      args: {
        name: 'Tác vụ đã xác nhận',
        priority: 'Urgent',
        estimateMinutes: 90,
      },
      summary: 'Tạo tác vụ mới: "Tác vụ đã xác nhận" [Ưu tiên: Urgent]',
      createdAt: Date.now(),
      chatHistory: [],
    });

    const replies: string[] = [];
    const mockSendReply = vi.fn(async (_token: string, _chatId: string, text: string) => {
      replies.push(text);
    });

    await processTelegramInboundMessage(
      {
        update_id: 203,
        message_id: 3,
        chat_id: 'admin_chat_1',
        from_name: 'Admin',
        text: 'OK',
        date: 123458,
      },
      'bot_token',
      testDb,
      mockSendReply
    );

    expect(replies[0]).toContain('Đã thực hiện thành công!');
    expect(replies[0]).toContain('Tác vụ đã xác nhận');

    // Verify pending state is cleared
    expect(getPendingMutation('admin_chat_1')).toBeUndefined();

    // Verify task is actually committed in IndexedDB
    const tasks = await testDb.tasks.toArray();
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.name).toBe('Tác vụ đã xác nhận');
    expect(tasks[0]?.priority).toBe('Urgent');
    expect(tasks[0]?.estimateMinutes).toBe(90);
  });

  it('admin cancels mutation with Huy: clears pending state and creates nothing in DB', async () => {
    await setNineRouterApiKey('test-key', testDb);
    await upsertWhitelistUser(
      {
        chatId: 'admin_chat_1',
        name: 'Super Admin',
        status: 'active',
        isAdmin: true,
      },
      testDb
    );

    setPendingMutation({
      chatId: 'admin_chat_1',
      toolName: 'create_task',
      args: {
        name: 'Tác vụ sẽ bị hủy',
      },
      summary: 'Tạo tác vụ mới: "Tác vụ sẽ bị hủy"',
      createdAt: Date.now(),
      chatHistory: [],
    });

    const replies: string[] = [];
    const mockSendReply = vi.fn(async (_token: string, _chatId: string, text: string) => {
      replies.push(text);
    });

    await processTelegramInboundMessage(
      {
        update_id: 204,
        message_id: 4,
        chat_id: 'admin_chat_1',
        from_name: 'Admin',
        text: 'Hủy thao tác này đi',
        date: 123459,
      },
      'bot_token',
      testDb,
      mockSendReply
    );

    expect(replies[0]).toContain('Đã hủy thao tác');
    expect(getPendingMutation('admin_chat_1')).toBeUndefined();

    const tasks = await testDb.tasks.toArray();
    expect(tasks).toHaveLength(0);
  });

  it('admin adjustments update the pending draft with new arguments', async () => {
    await setNineRouterApiKey('test-key', testDb);
    await upsertWhitelistUser(
      {
        chatId: 'admin_chat_1',
        name: 'Super Admin',
        status: 'active',
        isAdmin: true,
      },
      testDb
    );

    setPendingMutation({
      chatId: 'admin_chat_1',
      toolName: 'create_task',
      args: {
        name: 'Tác vụ ban đầu',
        estimateMinutes: 30,
      },
      summary: 'Tạo tác vụ mới: "Tác vụ ban đầu"',
      createdAt: Date.now(),
      chatHistory: [],
    });

    mockStreamChatEvents.mockImplementationOnce(async function* () {
      yield {
        type: 'tool_calls',
        calls: [
          {
            id: 'call_adj',
            type: 'function',
            function: {
              name: 'create_task',
              arguments: JSON.stringify({
                name: 'Tác vụ ban đầu',
                estimateMinutes: 120,
                deadline: '2026-10-30',
              }),
            },
          },
        ],
      };
      yield { type: 'usage', usage: { total_tokens: 25 } };
    });

    const replies: string[] = [];
    const mockSendReply = vi.fn(async (_token: string, _chatId: string, text: string) => {
      replies.push(text);
    });

    await processTelegramInboundMessage(
      {
        update_id: 205,
        message_id: 5,
        chat_id: 'admin_chat_1',
        from_name: 'Admin',
        text: 'Đổi estimate thành 2h và deadline 30/10 nhé',
        date: 123460,
      },
      'bot_token',
      testDb,
      mockSendReply
    );

    expect(replies[0]).toContain('Đã cập nhật đề xuất thao tác');

    const updatedPending = getPendingMutation('admin_chat_1');
    expect(updatedPending).toBeDefined();
    expect(updatedPending?.args.estimateMinutes).toBe(120);
    expect(updatedPending?.args.deadline).toBe('2026-10-30');
  });
});
