import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIChatProvider, useAIChat } from '../../src/context/AIChatContext';
import { AIPopoutView } from '../../src/views/AIPopoutView';
import { AI_DRAFT_EVENT, AI_SCOPE_EVENT } from '../../src/utils/aiPopout';

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
});
