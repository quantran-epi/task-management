// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db/index';
import {
  ACCESS_STATE_SETTINGS_KEY,
  clearStandaloneAccess,
  pollStandaloneAccess,
  pollStandaloneAccessOnce,
  readAccessState,
  requestStandaloneAccess,
  type StandaloneAccessRecord,
} from '../../src/services/telegram/standaloneAccessService';
import {
  DEVICE_POLICY_SETTINGS_KEY,
  buildPolicyPayload,
  loadDevicePolicy,
  type TelegramDevicePolicy,
} from '../../src/services/telegram/telegramDevicePolicy';
import type { TelegramWhitelistUser } from '../../src/services/telegram/telegramTypes';

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));

const ID = '123456789';

function approvedRow(): TelegramWhitelistUser {
  const now = new Date().toISOString();
  return {
    chatId: ID,
    telegramUserId: ID,
    name: `Standalone ${ID}`,
    status: 'active',
    deviceStatus: 'approved',
    dataScope: 'full',
    dailyLimit: 10,
    usedToday: 0,
    lastActiveDate: '2026-11-27',
    maxHistoryTurns: 5,
    overQuotaCommandsUsed: 0,
    overQuotaAttempts: 0,
    allowedModels: ['model-a', 'model-b'],
    remoteSettings: { defaultModel: 'model-a' },
    createdAt: now,
    updatedAt: now,
  };
}

function record(status: StandaloneAccessRecord['status'], policyToken?: string): StandaloneAccessRecord {
  return {
    telegramUserId: ID,
    status,
    requestedAt: '2026-11-27T00:00:00.000Z',
    updatedAt: '2026-11-27T00:01:00.000Z',
    issuedAt: status === 'approved' ? '2026-11-27T00:01:00.000Z' : undefined,
    policyToken,
  };
}

describe('standalone access bridge service', () => {
  let db: TaskPlannerDatabase;
  let dbName: string;

  beforeEach(async () => {
    dbName = `StandaloneAccessTestDB_${Math.random().toString(36).slice(2)}`;
    db = new TaskPlannerDatabase(dbName);
    await db.open();
    invokeMock.mockReset();
    (window as unknown as { __TAURI_INTERNALS__: Record<string, unknown> }).__TAURI_INTERNALS__ = {};
  });

  afterEach(async () => {
    vi.useRealTimers();
    db.close();
    await TaskPlannerDatabase.delete(dbName);
  });

  it('rejects invalid Telegram User ID before touching the bridge', async () => {
    await expect(requestStandaloneAccess(db, '../etc/passwd')).rejects.toThrow('Telegram User ID');
    expect(invokeMock).not.toHaveBeenCalled();
    expect(await readAccessState(db)).toBeUndefined();
  });

  it('writes pending record and local state on request', async () => {
    await requestStandaloneAccess(db, ID, '2026-11-27T00:00:00.000Z');
    expect(invokeMock).toHaveBeenCalledWith('standalone_access_request', {
      telegramUserId: ID,
      requestedAt: '2026-11-27T00:00:00.000Z',
    });
    expect(await readAccessState(db)).toMatchObject({ status: 'pending', telegramUserId: ID });
  });

  it('clears a stale policy when requesting with a corrected identity', async () => {
    await db.settings.put({ key: DEVICE_POLICY_SETTINGS_KEY, value: {
      version: 1,
      telegramUserId: '999888777',
      status: 'approved',
      allowedModels: ['old-model'],
      remoteSettings: { defaultModel: 'old-model' },
      issuedAt: '2026-11-27T00:00:00.000Z',
      expiresAt: '2099-01-01T00:00:00.000Z',
    } satisfies TelegramDevicePolicy });

    await requestStandaloneAccess(db, ID);

    expect(await loadDevicePolicy(db)).toBeUndefined();
    expect(await readAccessState(db)).toMatchObject({ status: 'pending', telegramUserId: ID });
  });

  it('polls every 2s, saves a valid approved policy and updates state', async () => {
    const token = buildPolicyPayload(approvedRow(), '2099-01-01T00:00:00.000Z');
    invokeMock.mockResolvedValue([record('approved', token)]);
    await db.settings.put({ key: ACCESS_STATE_SETTINGS_KEY, value: { status: 'pending', telegramUserId: ID } });

    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const cleanup = pollStandaloneAccess(db, ID);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.waitFor(async () => {
      expect((await readAccessState(db))?.status).toBe('approved');
    });

    const policy = await loadDevicePolicy(db);
    expect(policy?.allowedModels).toEqual(['model-a', 'model-b']);
    expect(policy?.remoteSettings.defaultModel).toBe('model-a');
    cleanup();
    await vi.advanceTimersByTimeAsync(4000);
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it('clears local policy for denied/revoked/pending records', async () => {
    const token = buildPolicyPayload(approvedRow(), '2099-01-01T00:00:00.000Z');
    const policy = JSON.parse(
      new TextDecoder().decode(Uint8Array.from(atob(token.split(':')[1]!.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)))
    ) as TelegramDevicePolicy;
    await db.settings.put({ key: DEVICE_POLICY_SETTINGS_KEY, value: policy });

    invokeMock.mockResolvedValue([record('revoked')]);
    await pollStandaloneAccessOnce(db, ID);
    expect(await loadDevicePolicy(db)).toBeUndefined();
    expect((await readAccessState(db))?.status).toBe('revoked');
  });

  it('ignores a malformed or expired token instead of granting access', async () => {
    invokeMock.mockResolvedValue([record('approved', 'TMMATE_POLICY_V1:bm90LWpzb24')]);
    await pollStandaloneAccessOnce(db, ID);
    expect(await loadDevicePolicy(db)).toBeUndefined();
    expect((await readAccessState(db))?.status).toBeUndefined();
  });

  it('does not overwrite a newer cached policy from an older bridge record', async () => {
    const token = buildPolicyPayload(approvedRow(), '2099-01-01T00:00:00.000Z');
    await db.settings.put({
      key: DEVICE_POLICY_SETTINGS_KEY,
      value: {
        version: 1,
        telegramUserId: ID,
        status: 'approved',
        allowedModels: ['newer-model'],
        remoteSettings: {},
        issuedAt: '2099-01-02T00:00:00.000Z',
        expiresAt: '2099-02-01T00:00:00.000Z',
      } satisfies TelegramDevicePolicy,
    });
    invokeMock.mockResolvedValue([record('approved', token)]);
    await pollStandaloneAccessOnce(db, ID);
    expect((await loadDevicePolicy(db))?.allowedModels).toEqual(['newer-model']);
  });

  it('writes revoked marker and clears local state when unlinking', async () => {
    await db.settings.put({ key: DEVICE_POLICY_SETTINGS_KEY, value: {
      version: 1,
      telegramUserId: ID,
      status: 'approved',
      allowedModels: ['model-a'],
      remoteSettings: {},
      issuedAt: '2026-11-27T00:00:00.000Z',
      expiresAt: '2099-01-01T00:00:00.000Z',
    } satisfies TelegramDevicePolicy });

    await clearStandaloneAccess(db, ID);
    expect(invokeMock).toHaveBeenCalledWith('standalone_access_apply', {
      telegramUserId: ID,
      status: 'revoked',
    });
    expect(await loadDevicePolicy(db)).toBeUndefined();
    expect(await readAccessState(db)).toBeUndefined();
  });

  it('keeps local state only and starts no bridge timer in browser fallback', async () => {
    delete (window as unknown as { __TAURI_INTERNALS__?: Record<string, unknown> }).__TAURI_INTERNALS__;
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });

    await requestStandaloneAccess(db, ID);
    const cleanup = pollStandaloneAccess(db, ID);
    await vi.advanceTimersByTimeAsync(6000);

    expect(invokeMock).not.toHaveBeenCalled();
    expect((await readAccessState(db))?.status).toBe('pending');
    cleanup();
  });
});
