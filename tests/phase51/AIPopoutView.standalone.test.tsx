// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIChatProvider, useAIChat } from '../../src/context/AIChatContext';
import { AIPopoutView } from '../../src/views/AIPopoutView';
import { AI_DRAFT_EVENT, AI_SCOPE_EVENT } from '../../src/utils/aiPopout';
import { TaskPlannerDatabase } from '../../src/db';
import { DEVICE_POLICY_SETTINGS_KEY, buildPolicyPayload } from '../../src/services/telegram/telegramDevicePolicy';
import { saveAccessState } from '../../src/services/telegram/standaloneAccessService';
import type { TelegramWhitelistUser } from '../../src/services/telegram/telegramTypes';

const { invokeMock, messages } = vi.hoisted(() => ({ invokeMock: vi.fn(), messages: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));
vi.mock('../../src/components/ui/message', () => ({ useMessage: () => messages }));

const { tauriListen, webviewWindow, tauriWindow } = vi.hoisted(() => ({
  tauriListen: { listen: vi.fn() },
  webviewWindow: {
    getCurrentWebviewWindow: vi.fn(),
  },
  tauriWindow: {
    isAiWindowAlwaysOnTop: vi.fn(),
    setAiWindowAlwaysOnTop: vi.fn(),
    closeCurrentAiPopoutWindow: vi.fn(),
    PhysicalPosition: vi.fn(),
    PhysicalSize: vi.fn(),
    currentMonitor: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('@tauri-apps/api/event', () => tauriListen);
vi.mock('@tauri-apps/api/webviewWindow', () => webviewWindow);
vi.mock('@tauri-apps/api/window', () => tauriWindow);
vi.mock('../../src/utils/aiPopout', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/utils/aiPopout')>();
  return { ...actual, ...tauriWindow };
});

const ScopeProbe = () => {
  const { activeScope } = useAIChat();
  return <div data-testid="scope-probe">{`${activeScope.type}:${activeScope.id ?? ''}`}</div>;
};

describe('standalone chat shell', () => {
  let messageSpy: ReturnType<typeof vi.spyOn>;
  let storageGetSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.location.hash = '#ai-popout?scopeType=task&scopeId=malicious&scopeTitle=leak';
    (window as unknown as { __TAURI_INTERNALS__: Record<string, unknown> }).__TAURI_INTERNALS__ = {};
    tauriListen.listen.mockResolvedValue(() => {});
    tauriWindow.isAiWindowAlwaysOnTop.mockResolvedValue(false);
    localStorage.setItem('planner:ai_popout_geometry', JSON.stringify({ width: 900, height: 900, alwaysOnTop: true }));
    webviewWindow.getCurrentWebviewWindow.mockReturnValue({
      unmaximize: vi.fn().mockResolvedValue(undefined),
      setSize: vi.fn().mockResolvedValue(undefined),
      setPosition: vi.fn().mockResolvedValue(undefined),
      setAlwaysOnTop: vi.fn().mockResolvedValue(undefined),
      onMoved: vi.fn().mockResolvedValue(() => {}),
      onResized: vi.fn().mockResolvedValue(() => {}),
      outerPosition: vi.fn(),
      outerSize: vi.fn(),
      isAlwaysOnTop: vi.fn(),
    });
    messageSpy = vi.spyOn(window, 'addEventListener');
    storageGetSpy = vi.spyOn(Storage.prototype, 'getItem');
  });

  it('registers no parent listeners and performs no geometry work (T-51-05/06/07)', async () => {
    render(
      <AIChatProvider>
        <AIPopoutView standaloneChat />
      </AIChatProvider>
    );
    await new Promise((resolve) => setTimeout(resolve, 50));

    const listenedEvents = tauriListen.listen.mock.calls.map((call: unknown[]) => call[0]);
    expect(listenedEvents).not.toContain(AI_SCOPE_EVENT);
    expect(listenedEvents).not.toContain(AI_DRAFT_EVENT);
    expect(messageSpy.mock.calls.filter((call: unknown[]) => call[0] === 'message')).toHaveLength(0);
    expect(webviewWindow.getCurrentWebviewWindow).not.toHaveBeenCalled();
    expect(tauriWindow.isAiWindowAlwaysOnTop).not.toHaveBeenCalled();
    expect(tauriWindow.setAiWindowAlwaysOnTop).not.toHaveBeenCalled();
    expect(storageGetSpy.mock.calls.filter((call: unknown[]) => call[0] === 'planner:ai_popout_geometry')).toHaveLength(0);
    expect(window.dispatchEvent(new MessageEvent('message', {
      origin: window.location.origin,
      data: { type: AI_DRAFT_EVENT, text: 'parent draft' },
    }))).toBe(true);
  });

  it('hides popout affordances, forces global scope, and keeps tab bar and composer', () => {
    render(
      <AIChatProvider>
        <ScopeProbe />
        <AIPopoutView standaloneChat />
      </AIChatProvider>
    );

    expect(screen.getByTestId('scope-probe')).toHaveTextContent('global:');
    expect(screen.queryByLabelText('Đóng ngăn trò chuyện')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Tùy chọn khác')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Đổi phạm vi ngữ cảnh')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Mở cửa sổ riêng (Popout)')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Nội dung tin nhắn trò chuyện AI')).toBeInTheDocument();
  });

  it('opens a full-width settings Modal without remounting chat or losing draft', async () => {
    render(
      <AIChatProvider>
        <AIPopoutView standaloneChat />
      </AIChatProvider>
    );

    const composer = screen.getByLabelText('Nội dung tin nhắn trò chuyện AI');
    fireEvent.change(composer, { target: { value: 'giữ nháp khi mở cài đặt' } });
    const gear = screen.getByTestId('chat-settings-gear');
    expect(gear).toHaveAccessibleName('Mở Cài đặt AI');

    fireEvent.click(gear);

    await waitFor(() => {
      expect(screen.getByText('AI Settings · tất cả')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Nội dung tin nhắn trò chuyện AI')).toHaveValue('giữ nháp khi mở cài đặt');
    expect(document.querySelector('.ant-modal-container')).not.toBeNull();
    expect(document.querySelector('.ant-drawer')).toBeNull();
    const modal = screen.getByText('AI Settings · tất cả').closest('.ant-modal') as HTMLElement | null;
    expect(modal).not.toBeNull();
    expect(modal?.style.width).toBe('calc(100vw - 48px)');
  });

  it('routes every AI surface to the standalone chat DB singleton', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/views/AIPopoutView.tsx'), 'utf8');
    expect(source).toContain("import { chatWindowDb } from '../db/chatWindowDb'");
    expect(source).toMatch(/standaloneChat\s*\?\s*chatWindowDb\s*:\s*defaultDb/);
    expect(source).toContain('db={activeDb}');
  });

  it('blocks chat while access state is pending even with a stored policy', async () => {
    const dbName = `StandalonePopoutTestDB_${Math.random().toString(36).slice(2)}`;
    const db = new TaskPlannerDatabase(dbName);
    await db.open();
    const now = new Date().toISOString();
    const row: TelegramWhitelistUser = {
      chatId: '123456789', telegramUserId: '123456789', name: 'Standalone', status: 'active',
      deviceStatus: 'approved', dataScope: 'full', dailyLimit: 10, usedToday: 0,
      lastActiveDate: '2026-11-27', maxHistoryTurns: 5, overQuotaCommandsUsed: 0, overQuotaAttempts: 0,
      allowedModels: ['model-a'], remoteSettings: {}, createdAt: now, updatedAt: now,
    };
    await db.settings.put({ key: DEVICE_POLICY_SETTINGS_KEY, value: buildPolicyPayload(row, '2099-01-01T00:00:00.000Z') });
    await saveAccessState(db, { status: 'pending', telegramUserId: '123456789' });
    const blockedSource = readFileSync(resolve(process.cwd(), 'src/views/AIPopoutView.tsx'), 'utf8');
    expect(blockedSource).toContain('ACCESS_STATE_SETTINGS_KEY');
    expect(blockedSource).toContain("saveAccessState");
    expect(blockedSource).toContain('pollStandaloneAccess');

    const view = render(<AIChatProvider><AIPopoutView standaloneChat db={db} /></AIChatProvider>);
    const composer = screen.getByLabelText('Nội dung tin nhắn trò chuyện AI');
    fireEvent.change(composer, { target: { value: 'chưa có quyền' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi tin nhắn' }));
    await waitFor(() => {
      expect(messages.error).toHaveBeenCalledWith('Chưa có quyền dùng Chat. Liên hệ admin để được cấp quyền.');
    });
    expect(screen.getByTestId('chat-settings-gear')).toBeInTheDocument();
    view.unmount();
    db.close();
    await TaskPlannerDatabase.delete(dbName);
  });
});
