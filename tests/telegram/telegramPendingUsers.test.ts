import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../src/db/index';
import { useTelegramPendingUsers } from '../../src/hooks/useTelegramPendingUsers';
import {
  recordPendingTelegramUser,
  getWhitelistUser,
} from '../../src/services/telegram/telegramSettingsService';

const mockSendTelegramDirectMessage = vi.fn();
vi.mock('../../src/services/telegram/telegramHeadlessWorker', () => ({
  sendTelegramDirectMessage: (...args: any[]) => mockSendTelegramDirectMessage(...args),
}));

describe('useTelegramPendingUsers hook', () => {
  let testDb: TaskPlannerDatabase;
  const testDbName = 'TestTelegramPendingHookDB';

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase(testDbName);
    await testDb.open();
    mockSendTelegramDirectMessage.mockClear();
  });

  afterEach(async () => {
    await testDb.delete();
  });

  it('provides pending users list and pending count reactively', async () => {
    await recordPendingTelegramUser('chat_test_1', 'Pending User 1', testDb);
    await recordPendingTelegramUser('chat_test_2', 'Pending User 2', testDb);

    const { result } = renderHook(() => useTelegramPendingUsers(testDb));

    // Wait for Dexie liveQuery initial load
    await vi.waitFor(() => {
      expect(result.current.pendingCount).toBe(2);
    });

    expect(result.current.pendingUsers).toHaveLength(2);
    expect(result.current.pendingUsers.map((u) => u.chatId)).toContain('chat_test_1');
    expect(result.current.pendingUsers.map((u) => u.chatId)).toContain('chat_test_2');
  });

  it('quickApprove activates user and sends telegram welcome message if token provided', async () => {
    await recordPendingTelegramUser('chat_approve_1', 'Duc Quan', testDb);

    const { result } = renderHook(() => useTelegramPendingUsers(testDb));

    await vi.waitFor(() => {
      expect(result.current.pendingCount).toBe(1);
    });

    await act(async () => {
      await result.current.quickApprove('chat_approve_1', 'bot_token_123');
    });

    const user = await getWhitelistUser('chat_approve_1', testDb);
    expect(user?.status).toBe('active');

    expect(mockSendTelegramDirectMessage).toHaveBeenCalledTimes(1);
    expect(mockSendTelegramDirectMessage).toHaveBeenCalledWith(
      'bot_token_123',
      'chat_approve_1',
      expect.stringContaining('Tài khoản của bạn đã được phê duyệt')
    );

    await vi.waitFor(() => {
      expect(result.current.pendingCount).toBe(0);
    });
  });

  it('blockUser updates status to blocked', async () => {
    await recordPendingTelegramUser('chat_block_1', 'Spammer', testDb);

    const { result } = renderHook(() => useTelegramPendingUsers(testDb));

    await vi.waitFor(() => {
      expect(result.current.pendingCount).toBe(1);
    });

    await act(async () => {
      await result.current.blockUser('chat_block_1');
    });

    const user = await getWhitelistUser('chat_block_1', testDb);
    expect(user?.status).toBe('blocked');

    await vi.waitFor(() => {
      expect(result.current.pendingCount).toBe(0);
    });
  });

  it('dismissUser removes user record completely', async () => {
    await recordPendingTelegramUser('chat_dismiss_1', 'To Delete', testDb);

    const { result } = renderHook(() => useTelegramPendingUsers(testDb));

    await vi.waitFor(() => {
      expect(result.current.pendingCount).toBe(1);
    });

    await act(async () => {
      await result.current.dismissUser('chat_dismiss_1');
    });

    const user = await getWhitelistUser('chat_dismiss_1', testDb);
    expect(user).toBeUndefined();

    await vi.waitFor(() => {
      expect(result.current.pendingCount).toBe(0);
    });
  });
});
