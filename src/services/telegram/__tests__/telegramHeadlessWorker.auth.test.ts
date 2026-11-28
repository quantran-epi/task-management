import { beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { Dexie } from 'dexie';
import { TaskPlannerDatabase } from '../../../db';
import type { TelegramWhitelistUser } from '../telegramTypes';
import { refundQuota } from '../telegramSettingsService';
import { runTelegramChatTurn } from '../telegramChatTurn';
import { executeAdminMutationTurn } from '../telegramMutationSession';
import { routeIntent } from '../../ai/intentRouter';
import {
  clearTelegramProcessedUpdateIdsForTesting,
  processTelegramInboundMessage,
  resolveTelegramCaller,
} from '../telegramHeadlessWorker';

vi.mock('../telegramSettingsService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../telegramSettingsService')>();
  return { ...actual, refundQuota: vi.fn(actual.refundQuota) };
});
vi.mock('../telegramAdminWizard', () => ({
  handleAdminCommand: vi.fn().mockResolvedValue({ handled: false }),
}));
vi.mock('../telegramMutationSession', () => ({
  getPendingMutation: vi.fn(() => null),
  clearPendingMutation: vi.fn(),
  isConfirmationMessage: vi.fn(() => false),
  isCancellationMessage: vi.fn(() => false),
  executeAdminMutationTurn: vi.fn(),
}));
vi.mock('../telegramChatTurn', () => ({ runTelegramChatTurn: vi.fn() }));
vi.mock('../../ai/intentRouter', () => ({ routeIntent: vi.fn() }));
vi.mock('../../ai/nineRouterTokenService', () => ({
  getNineRouterConfig: vi.fn().mockResolvedValue({ endpoint: '', defaultModel: 'default', contextWindowTokens: 0 }),
  getNineRouterApiKey: vi.fn().mockResolvedValue(''),
}));

const refundMock = vi.mocked(refundQuota);
const turnMock = vi.mocked(runTelegramChatTurn);
const mutationMock = vi.mocked(executeAdminMutationTurn);
const routeMock = vi.mocked(routeIntent);

const event = (chatId: string, text: string, updateId: number, fromUserId = '555001') => ({
  update_id: updateId,
  message_id: updateId,
  chat_id: chatId,
  from_name: 'Tester',
  text,
  date: 1_700_000_000,
  fromUserId,
});

function user(overrides: Partial<TelegramWhitelistUser> = {}): TelegramWhitelistUser {
  return {
    chatId: '111',
    name: 'Tester',
    status: 'active',
    dataScope: 'pure_llm',
    dailyLimit: 10,
    usedToday: 0,
    lastActiveDate: '2026-11-28',
    maxHistoryTurns: 0,
    overQuotaCommandsUsed: 0,
    overQuotaAttempts: 0,
    telegramUserId: '555001',
    deviceStatus: 'revoked',
    createdAt: '2026-11-28T00:00:00.000Z',
    updatedAt: '2026-11-28T00:00:00.000Z',
    ...overrides,
  };
}

describe('telegramHeadlessWorker identity + quota', () => {
  let db: TaskPlannerDatabase;
  let replies: string[];

  beforeEach(async () => {
    Dexie.dependencies.indexedDB = indexedDB;
    Dexie.dependencies.IDBKeyRange = IDBKeyRange;
    db = new TaskPlannerDatabase();
    await db.open();
    await db.telegramWhitelist.clear();
    await db.telegramSessionLogs.clear();
    clearTelegramProcessedUpdateIdsForTesting();
    replies = [];
    vi.clearAllMocks();
  });

  it('resolves the whitelist row by Telegram identity, not by the current chat id', async () => {
    await db.telegramWhitelist.put(user());
    expect((await resolveTelegramCaller('555001', '999', db))?.chatId).toBe('111');
    expect((await resolveTelegramCaller('unknown', '999', db))).toBeUndefined();
  });

  it('charges the identity row and refunds exactly once when AI generation throws', async () => {
    await db.telegramWhitelist.put(user());
    turnMock.mockRejectedValueOnce(new Error('AI down'));

    await processTelegramInboundMessage(
      event('999', 'hello', 1),
      '',
      db,
      async (_token, _chatId, text) => {
        replies.push(text);
      }
    );

    expect(refundMock).toHaveBeenCalledTimes(1);
    expect(refundMock).toHaveBeenCalledWith('111', db);
    expect((await db.telegramWhitelist.get('111'))?.usedToday).toBe(0);
    expect(replies.join(' ')).toContain('Lỗi khi xử lý yêu cầu AI');
  });

  it('uses the enrolled model scope and chat even when device policy is revoked', async () => {
    await db.telegramWhitelist.put(user({ deviceStatus: 'revoked', allowedModels: ['allowed-model'] }));
    turnMock.mockResolvedValueOnce({
      replyMarkdown: 'ok',
      tokenUsage: { totalTokens: 1 },
      serverEmptyNotice: '',
      loopLimitReached: false,
    } as Awaited<ReturnType<typeof runTelegramChatTurn>>);

    await processTelegramInboundMessage(
      event('999', 'hello', 2),
      '',
      db,
      async (_token, _chatId, text) => {
        replies.push(text);
      }
    );

    expect(turnMock).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: '111', model: 'default' }),
      expect.any(Function)
    );
    expect((await db.telegramWhitelist.get('111'))?.usedToday).toBe(1);
    expect(refundMock).not.toHaveBeenCalled();
  });

  it('refunds the admin mutation turn on the enrolled chat id exactly once', async () => {
    await db.telegramWhitelist.put(user({ isAdmin: true, deviceStatus: 'approved' }));
    routeMock.mockResolvedValueOnce({ intent: 'operate_taskmate' } as Awaited<ReturnType<typeof routeIntent>>);
    mutationMock.mockResolvedValueOnce({ kind: 'conversational', replyMarkdown: 'done', tokenCount: 0 });

    await processTelegramInboundMessage(
      event('999', 'create task', 3),
      '',
      db,
      async (_token, _chatId, text) => {
        replies.push(text);
      }
    );

    expect(refundMock).toHaveBeenCalledTimes(1);
    expect(refundMock).toHaveBeenCalledWith('111', db);
    expect((await db.telegramWhitelist.get('111'))?.usedToday).toBe(0);
  });
});
