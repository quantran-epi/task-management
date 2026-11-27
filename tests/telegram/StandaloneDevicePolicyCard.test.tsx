// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StandaloneDevicePolicyCard } from '../../src/components/settings/StandaloneDevicePolicyCard';
import { TaskPlannerDatabase } from '../../src/db';
import { DEVICE_POLICY_SETTINGS_KEY, buildPolicyPayload, parsePolicyPayload } from '../../src/services/telegram/telegramDevicePolicy';
import { saveAccessState } from '../../src/services/telegram/standaloneAccessService';
import type { TelegramWhitelistUser } from '../../src/services/telegram/telegramTypes';

const { invokeMock, messages } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  messages: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));
vi.mock('../../src/components/ui/message', () => ({ useMessage: () => messages }));

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

describe('StandaloneDevicePolicyCard', () => {
  let db: TaskPlannerDatabase;
  let dbName: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbName = `StandaloneCardTestDB_${Math.random().toString(36).slice(2)}`;
    db = new TaskPlannerDatabase(dbName);
    await db.open();
    (window as unknown as { __TAURI_INTERNALS__: Record<string, unknown> }).__TAURI_INTERNALS__ = {};
  });

  afterEach(async () => {
    cleanup();
    db.close();
    await TaskPlannerDatabase.delete(dbName);
  });

  it('requests access with a valid numeric ID, disables invalid IDs, and never shows a /policy field', () => {
    render(<StandaloneDevicePolicyCard db={db} />);
    expect(screen.queryByLabelText('Dán nội dung /policy')).not.toBeInTheDocument();
    expect(screen.queryByText('Áp dụng chính sách')).not.toBeInTheDocument();
    expect(screen.getByText('Chưa có quyền dùng Chat. Gửi yêu cầu để admin cấp model.')).toBeInTheDocument();

    const button = screen.getByRole('button', { name: 'Request access' });
    const input = screen.getByLabelText('Telegram User ID');
    expect(button).toBeDisabled();
    fireEvent.change(input, { target: { value: '../etc/passwd' } });
    expect(button).toBeDisabled();

    fireEvent.change(input, { target: { value: ID } });
    expect(button).toBeEnabled();
    fireEvent.click(button);

    return waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('standalone_access_request', {
        telegramUserId: ID,
        requestedAt: expect.any(String),
      });
    });
  });

  it('shows pending status with resend, approved whitelist, and revoke action', async () => {
    await saveAccessState(db, { status: 'pending', telegramUserId: ID, requestedAt: '2026-11-27T00:00:00.000Z' });
    const first = render(<StandaloneDevicePolicyCard db={db} />);
    await waitFor(() => expect(screen.getByText(/Đã gửi yêu cầu lúc/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Gửi lại' })).toBeInTheDocument();
    first.unmount();

    await db.settings.put({
      key: DEVICE_POLICY_SETTINGS_KEY,
      value: parsePolicyPayload(buildPolicyPayload(approvedRow(), '2099-01-01T00:00:00.000Z')),
    });
    await saveAccessState(db, { status: 'approved', telegramUserId: ID });
    render(<StandaloneDevicePolicyCard db={db} />);
    await waitFor(() => expect(screen.getByText('model-a')).toBeInTheDocument());
    expect(screen.getByText('model-b')).toBeInTheDocument();
    expect(screen.getByText(/Model mặc định/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Gỡ liên kết' }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('standalone_access_apply', {
      telegramUserId: ID,
      status: 'revoked',
    }));
  });

  it('reflects admin approval live while the settings card stays open', async () => {
    await saveAccessState(db, { status: 'pending', telegramUserId: ID, requestedAt: '2026-11-27T00:00:00.000Z' });
    render(<StandaloneDevicePolicyCard db={db} />);
    await waitFor(() => expect(screen.getByText(/Đã gửi yêu cầu lúc/)).toBeInTheDocument());

    await db.settings.put({
      key: DEVICE_POLICY_SETTINGS_KEY,
      value: parsePolicyPayload(buildPolicyPayload(approvedRow(), '2099-01-01T00:00:00.000Z')),
    });
    await saveAccessState(db, { status: 'approved', telegramUserId: ID });

    await waitFor(() => {
      expect(screen.getByText('model-a')).toBeInTheDocument();
      expect(screen.getByText('model-b')).toBeInTheDocument();
    });
  });

  it('keeps the ID and offers resend for denied, revoked and expired states', async () => {
    for (const status of ['denied', 'revoked', 'expired'] as const) {
      await saveAccessState(db, { status, telegramUserId: ID });
      const view = render(<StandaloneDevicePolicyCard db={db} />);
      await waitFor(() => expect(screen.getByText(`Yêu cầu ${status === 'denied' ? 'bị từ chối' : status === 'revoked' ? 'đã bị thu hồi' : 'đã hết hạn'}. Gửi lại để admin cấp quyền.`)).toBeInTheDocument());
      expect(screen.getByRole('button', { name: 'Gửi lại yêu cầu' })).toBeInTheDocument();
      await waitFor(() => expect(screen.getByLabelText('Telegram User ID')).toHaveValue(ID));
      view.unmount();
    }
  });
});
