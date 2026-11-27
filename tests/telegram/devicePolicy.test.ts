import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db/index';
import {
  POLICY_TOKEN_PREFIX,
  buildPolicyPayload,
  parsePolicyPayload,
  isModelAllowed,
  resolveEffectiveChatConfig,
  saveDevicePolicy,
  loadDevicePolicy,
  clearDevicePolicy,
  type TelegramDevicePolicy,
} from '../../src/services/telegram/telegramDevicePolicy';
import type { TelegramWhitelistUser } from '../../src/services/telegram/telegramTypes';

function approvedRow(overrides: Partial<TelegramWhitelistUser> = {}): TelegramWhitelistUser {
  const now = new Date().toISOString();
  return {
    chatId: 'chat-abc',
    telegramUserId: '123456789',
    name: 'Thiết bị A',
    status: 'active',
    deviceStatus: 'approved',
    dataScope: 'full',
    dailyLimit: 20,
    usedToday: 0,
    lastActiveDate: '2026-11-27',
    allowedModels: ['model-a', 'model-b'],
    remoteSettings: { maxHistoryTurns: 5 },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('Telegram device policy', () => {
  let testDb: TaskPlannerDatabase;
  const testDbName = 'TelegramDevicePolicyTestDB';
  const expiresAt = '2099-01-01T00:00:00.000Z';

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase(testDbName);
    await testDb.open();
  });

  afterEach(async () => {
    await testDb.delete();
  });

  function makePolicy(overrides: Partial<Record<string, unknown>> = {}): TelegramDevicePolicy {
    return {
      version: 1,
      telegramUserId: '123456789',
      status: 'approved',
      allowedModels: ['model-a', 'model-b'],
      remoteSettings: { maxHistoryTurns: 5 },
      issuedAt: '2026-11-27T00:00:00.000Z',
      expiresAt,
      ...overrides,
    } as TelegramDevicePolicy;
  }

  it('builds and parses a policy token surrounded by bot markdown', () => {
    const payload = buildPolicyPayload(approvedRow(), expiresAt);
    expect(payload).toContain(POLICY_TOKEN_PREFIX);

    const parsed = parsePolicyPayload(
      `Chính sách thiết bị:\n\`${payload}\`\nDán nội dung trên vào app.`
    );
    expect(parsed.status).toBe('approved');
    expect(parsed.telegramUserId).toBe('123456789');
    expect(parsed.allowedModels).toEqual(['model-a', 'model-b']);
    expect(parsed.remoteSettings).toEqual({ maxHistoryTurns: 5 });
  });

  it('rejects malformed tokens, missing expiry and extra trust-boundary fields', () => {
    expect(() => parsePolicyPayload('không có policy')).toThrow();
    expect(() => parsePolicyPayload(`${POLICY_TOKEN_PREFIX}!!!`)).toThrow();

    const missingExpiry = {
      version: 1,
      telegramUserId: '123456789',
      status: 'approved',
      allowedModels: ['model-a'],
      remoteSettings: {},
      issuedAt: '2026-11-27T00:00:00.000Z',
    };
    const token = `${POLICY_TOKEN_PREFIX}${btoa(JSON.stringify(missingExpiry))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')}`;
    expect(() => parsePolicyPayload(token)).toThrow();

    const extra = { ...makePolicy(), isAdmin: true };
    const extraToken = `${POLICY_TOKEN_PREFIX}${btoa(JSON.stringify(extra))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')}`;
    expect(() => parsePolicyPayload(extraToken)).toThrow();
  });

  it('rejects empty identity, empty whitelist, past expiry and non-approved status', () => {
    expect(() => buildPolicyPayload(approvedRow({ telegramUserId: '' }), expiresAt)).toThrow();
    expect(() => buildPolicyPayload(approvedRow({ allowedModels: [] }), expiresAt)).toThrow();
    expect(() => buildPolicyPayload(approvedRow({ deviceStatus: 'pending' }), expiresAt)).toThrow();
    expect(() => parsePolicyPayload(buildPolicyPayload(approvedRow(), '2020-01-01T00:00:00.000Z'))).toThrow();
    expect(() => buildPolicyPayload(approvedRow({ deviceStatus: 'revoked' }), expiresAt)).toThrow();
  });

  it('compares caller identity against policy identity', () => {
    const policy = parsePolicyPayload(buildPolicyPayload(approvedRow(), expiresAt));
    expect(policy.telegramUserId).toBe('123456789');
    expect(policy.telegramUserId === '987654321').toBe(false);
  });

  it('enforces exact model whitelist after trimming model id', () => {
    const policy = makePolicy();
    expect(isModelAllowed(policy, 'model-a')).toBe(true);
    expect(isModelAllowed(policy, ' model-a ')).toBe(true);
    expect(isModelAllowed(policy, 'model-c')).toBe(false);
    const revoked = { ...policy, status: 'revoked' } as unknown as TelegramDevicePolicy;
    expect(isModelAllowed(revoked, 'model-a')).toBe(false);
  });

  it('merges only present remote settings and flags expired policies', () => {
    const local = {
      defaultModel: 'local-model',
      maxHistoryTurns: 10,
      dataScope: 'tasks_only' as const,
    };
    const active = resolveEffectiveChatConfig(local, makePolicy());
    expect(active).toEqual({ ...local, maxHistoryTurns: 5, policyState: 'active' });

    const partial = resolveEffectiveChatConfig(local, makePolicy({ remoteSettings: {} }));
    expect(partial.defaultModel).toBe('local-model');
    expect(partial.maxHistoryTurns).toBe(10);
    expect(partial.policyState).toBe('active');

    const expired = resolveEffectiveChatConfig(local, makePolicy({ expiresAt: '2020-01-01T00:00:00.000Z' }));
    expect(expired).toEqual({ ...local, policyState: 'expired' });
    expect(resolveEffectiveChatConfig(local, undefined)).toEqual({ ...local, policyState: 'unmanaged' });
  });

  it('saves, loads and clears the policy on the settings key', async () => {
    const key = 'telegram:devicePolicy';
    expect(await loadDevicePolicy(testDb)).toBeUndefined();

    const policy = makePolicy();
    await saveDevicePolicy(testDb, policy);
    const stored = await testDb.settings.get(key);
    expect(stored?.value).toEqual(policy);
    expect(await loadDevicePolicy(testDb)).toEqual(policy);

    await clearDevicePolicy(testDb);
    expect(await testDb.settings.get(key)).toBeUndefined();
    expect(await loadDevicePolicy(testDb)).toBeUndefined();
  });
});
