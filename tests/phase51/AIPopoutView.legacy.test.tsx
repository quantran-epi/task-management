import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIChatProvider, useAIChat } from '../../src/context/AIChatContext';
import { AIPopoutView } from '../../src/views/AIPopoutView';
import { AI_DRAFT_EVENT } from '../../src/utils/aiPopout';

const { tauriListen, webviewWindow, tauriWindow, win } = vi.hoisted(() => ({
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
    currentMonitor: vi.fn(),
  },
  win: {
    unmaximize: vi.fn(),
    setSize: vi.fn(),
    setPosition: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    onMoved: vi.fn(),
    onResized: vi.fn(),
    outerPosition: vi.fn(),
    outerSize: vi.fn(),
    isAlwaysOnTop: vi.fn(),
  },
}));

vi.mock('@tauri-apps/api/event', () => tauriListen);
vi.mock('@tauri-apps/api/webviewWindow', () => webviewWindow);
vi.mock('@tauri-apps/api/window', () => ({
  PhysicalPosition: tauriWindow.PhysicalPosition,
  PhysicalSize: tauriWindow.PhysicalSize,
  currentMonitor: tauriWindow.currentMonitor,
}));
vi.mock('../../src/utils/aiPopout', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/utils/aiPopout')>();
  return { ...actual, ...tauriWindow };
});

const DraftProbe = () => {
  const { pendingDraft } = useAIChat();
  return <div data-testid="draft-probe">{pendingDraft ?? ''}</div>;
};

describe('legacy AI popout behaviour', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.location.hash = '#ai-popout';
    (window as unknown as { __TAURI_INTERNALS__: Record<string, unknown> }).__TAURI_INTERNALS__ = {};
    localStorage.setItem('planner:ai_popout_geometry', JSON.stringify({
      x: 40,
      y: 60,
      width: 1200,
      height: 2000,
      alwaysOnTop: true,
    }));
    tauriListen.listen.mockResolvedValue(() => {});
    tauriWindow.isAiWindowAlwaysOnTop.mockResolvedValue(true);
    webviewWindow.getCurrentWebviewWindow.mockReturnValue(win);
    win.unmaximize.mockResolvedValue(undefined);
    win.setSize.mockResolvedValue(undefined);
    win.setPosition.mockResolvedValue(undefined);
    win.setAlwaysOnTop.mockResolvedValue(undefined);
    win.onMoved.mockResolvedValue(() => {});
    win.onResized.mockResolvedValue(() => {});
    tauriWindow.currentMonitor.mockResolvedValue({
      position: { x: 0, y: 0 },
      size: { width: 1920, height: 1080 },
    });
  });

  it('keeps parent listeners, geometry clamp and pin/close affordances', async () => {
    render(
      <AIChatProvider>
        <DraftProbe />
        <AIPopoutView standaloneChat={false} />
      </AIChatProvider>
    );

    await waitFor(() => {
      expect(tauriListen.listen.mock.calls.map((call: unknown[]) => call[0])).toContain(AI_DRAFT_EVENT);
    });
    expect(tauriListen.listen.mock.calls.map((call: unknown[]) => call[0])).toContain('ai-set-scope');
    expect(win.unmaximize).toHaveBeenCalled();
    expect(win.setSize).toHaveBeenCalled();
    const requested = win.setSize.mock.calls[0]?.[0];
    expect(requested).toBeDefined();
    await waitFor(() => {
      expect(win.setAlwaysOnTop).toHaveBeenCalledWith(true);
    });
    expect(screen.getByLabelText('Đóng ngăn trò chuyện')).toBeInTheDocument();
    expect(screen.getByLabelText('Tùy chọn khác')).toBeInTheDocument();
    expect(screen.getByLabelText('Nội dung tin nhắn trò chuyện AI')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-settings-gear')).not.toBeInTheDocument();
  });

  it('still accepts same-origin browser drafts when not in Tauri', async () => {
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    render(
      <AIChatProvider>
        <DraftProbe />
        <AIPopoutView standaloneChat={false} />
      </AIChatProvider>
    );

    window.dispatchEvent(new MessageEvent('message', {
      origin: window.location.origin,
      data: { type: AI_DRAFT_EVENT, text: 'legacy draft' },
    }));

    await waitFor(() => {
      expect(screen.getByTestId('draft-probe')).toHaveTextContent('legacy draft');
    });
  });

  it('keeps the default TaskMate DB on the legacy popout path', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/views/AIPopoutView.tsx'), 'utf8');
    expect(source).toMatch(/standaloneChat\s*\?\s*chatWindowDb\s*:\s*defaultDb/);
    expect(source).toContain('interface AIPopoutViewProps');
    expect(source).toMatch(/db\??:\s*TaskPlannerDatabase\s*\|\s*undefined/);
  });
});
