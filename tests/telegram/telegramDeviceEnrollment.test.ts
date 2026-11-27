import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db/index';
import {
  findWhitelistByIdentity,
  recordPendingTelegramUser,
  upsertDeviceEnrollment,
  getWhitelistUser,
  blockPendingUser,
} from '../../src/services/telegram/telegramSettingsService';
import { processTelegramInboundMessage } from '../../src/services/telegram/telegramHeadlessWorker';
import { parsePolicyPayload } from '../../src/services/telegram/telegramDevicePolicy';
import type { TelegramInboundEvent } from '../../src/services/telegram/telegramTypes';

vi.mock('../../src/utils/desktopNotification', () => ({
  sendDesktopNotification: vi.fn(),
}));

function event(text: string, overrides: Partial<TelegramInboundEvent> = {}): TelegramInboundEvent {
  return {
    update_id: Math.floor(Math.random() * 1_000_000_000),
    message_id: 1,
    chat_id: 'chat-abc',
    from_name: 'Device A',
    text,
    date: 1234567890,
    fromUserId: '123456789',
    ...overrides,
  };
}

describe('Telegram device enrollment', () => {
  let testDb: TaskPlannerDatabase;
  const testDbName = 'TestTelegramDeviceEnrollmentDB';
  let replies: string[];
  let mockSendReply: ReturnType<typeof vi.fn<(_token: string, _chatId: string, text: string) => Promise<void>>>;
  let mockSendAction: ReturnType<typeof vi.fn<() => Promise<void>>>;
  let mockSendDirect: ReturnType<typeof vi.fn<() => Promise<void>>>;

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase(testDbName);
    await testDb.open();
    replies = [];
    mockSendReply = vi.fn(async (_token: string, _chatId: string, text: string) => {
      replies.push(text);
    });
    mockSendAction = vi.fn(async () => {});
    mockSendDirect = vi.fn(async () => {});
  });

  afterEach(async () => {
    await testDb.delete();
  });

  async function dispatch(text: string, overrides: Partial<TelegramInboundEvent> = {}) {
    await processTelegramInboundMessage(
      event(text, overrides),
      'test_token',
      testDb,
      mockSendReply,
      mockSendAction,
      mockSendDirect
    );
  }

  it('uses from.id identity for unknown /start and keeps chatId as reply address', async () => {
    await dispatch('/start');

    const pending = await findWhitelistByIdentity('123456789', testDb);
    expect(pending?.chatId).toBe('chat-abc');
    expect(pending?.telegramUserId).toBe('123456789');
    expect(pending?.status).toBe('pending');
    expect(mockSendReply.mock.calls[0]?.[1]).toBe('chat-abc');
    expect(replies[0]).toContain('Telegram User ID:</b> <code>123456789</code>');
  });

  it('updates latest chatId without resetting enrollment state or quota', async () => {
    await recordPendingTelegramUser('chat-old', 'Device A', testDb, '123456789');
    await dispatch('/start', { chat_id: 'chat-new' });

    const row = await findWhitelistByIdentity('123456789', testDb);
    expect(row?.chatId).toBe('chat-new');
    expect(row?.status).toBe('pending');
    expect(row?.usedToday).toBe(0);
    expect(await getWhitelistUser('chat-old', testDb)).toBeUndefined();
  });

  it('falls back to chat_id identity for legacy payloads without fromUserId', async () => {
    await dispatch('/start', { chat_id: '999888777', fromUserId: undefined });

    const legacy = await findWhitelistByIdentity('999888777', testDb);
    expect(legacy?.chatId).toBe('999888777');
    expect(legacy?.status).toBe('pending');
  });

  it('reads numeric from_id from Rust legacy payload as string identity', async () => {
    await dispatch('/start', { chat_id: 'legacy-chat', fromUserId: undefined, from_id: 555666777 });

    const legacy = await findWhitelistByIdentity('555666777', testDb);
    expect(legacy?.chatId).toBe('legacy-chat');
    expect(legacy?.telegramUserId).toBe('555666777');
    expect(legacy?.status).toBe('pending');
  });

  it('rejects /policy for unknown and pending users without emitting a token', async () => {
    await dispatch('/policy');
    expect(replies[0]).toContain('123456789');
    expect(replies[0]).not.toContain('TMMATE_POLICY_V1:');

    replies.length = 0;
    mockSendReply.mockClear();
    await recordPendingTelegramUser('chat-pending', 'Device A', testDb, '123456789');
    await dispatch('/policy', { chat_id: 'chat-pending' });
    expect(replies[0]).toContain('Chờ duyệt');
    expect(replies[0]).not.toContain('TMMATE_POLICY_V1:');
  });

  it('emits a valid rotating policy to approved identity only', async () => {
    await recordPendingTelegramUser('chat-abc', 'Device A', testDb, '123456789');
    await upsertDeviceEnrollment(
      {
        telegramUserId: '123456789',
        chatId: 'chat-abc',
        deviceStatus: 'approved',
        allowedModels: ['model-a'],
        remoteSettings: { maxHistoryTurns: 2 },
      },
      testDb
    );

    await dispatch('/policy');
    expect(replies[0]).toContain('TMMATE_POLICY_V1:');
    const token = replies[0]?.match(/TMMATE_POLICY_V1:[A-Za-z0-9_-]+/)?.[0] ?? '';
    const policy = parsePolicyPayload(token);
    expect(policy.telegramUserId).toBe('123456789');
    expect(policy.allowedModels).toEqual(['model-a']);
    expect(policy.remoteSettings).toEqual({ maxHistoryTurns: 2 });

    const first = await findWhitelistByIdentity('123456789', testDb);
    expect(first?.pairingCode).toMatch(/^[A-Za-z0-9]{6}$/);
    expect(first?.pairingCodeExpiresAt).toBeDefined();

    replies.length = 0;
    mockSendReply.mockClear();
    await dispatch('/policy');
    const second = await findWhitelistByIdentity('123456789', testDb);
    expect(second?.pairingCode).not.toBe(first?.pairingCode);
  });

  it('blocks /policy for a legacy whitelist row blocked by status without telegramUserId', async () => {
    // Admin-added legacy row: no telegramUserId, deviceStatus stayed 'approved'.
    await upsertDeviceEnrollment(
      {
        telegramUserId: '',
        chatId: 'legacy-chat',
        deviceStatus: 'approved',
        allowedModels: ['model-a'],
      },
      testDb
    );
    await blockPendingUser('legacy-chat', testDb);

    await dispatch('/policy', { chat_id: 'legacy-chat', fromUserId: undefined });
    expect(replies[0]).toContain('Chưa thể phát chính sách');
    expect(replies[0]).not.toContain('TMMATE_POLICY_V1:');
    const row = await getWhitelistUser('legacy-chat', testDb);
    expect(row?.status).toBe('blocked');
    expect(row?.deviceStatus).toBe('revoked');
  });

  it('blocks /policy after revoke regardless of active chat status', async () => {
    await recordPendingTelegramUser('chat-abc', 'Device A', testDb, '123456789');
    await upsertDeviceEnrollment(
      {
        telegramUserId: '123456789',
        chatId: 'chat-abc',
        deviceStatus: 'revoked',
        allowedModels: ['model-a'],
      },
      testDb
    );

    await dispatch('/policy');
    expect(replies[0]).toContain('thu hồi');
    expect(replies[0]).not.toContain('TMMATE_POLICY_V1:');
  });

  it('does not attach an identity to legacy rows approved through the old wizard', async () => {
    await upsertDeviceEnrollment(
      {
        telegramUserId: '123456789',
        chatId: 'chat-abc',
        deviceStatus: 'approved',
        allowedModels: ['model-a'],
      },
      testDb
    );
    const legacy = await upsertDeviceEnrollment(
      {
        telegramUserId: '',
        chatId: 'legacy-chat',
        deviceStatus: 'approved',
        allowedModels: ['model-a'],
      },
      testDb
    );
    expect(legacy.telegramUserId).toBeUndefined();
    expect(legacy.status).toBe('active');
  });
});
