import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AIChatProvider, useAIChat } from '../../src/context/AIChatContext';
import { AIPopoutView } from '../../src/views/AIPopoutView';
import { AI_DRAFT_EVENT } from '../../src/utils/aiPopout';

const { tauriListen, webviewWindow } = vi.hoisted(() => ({
  tauriListen: { listen: vi.fn() },
  webviewWindow: {
    getCurrentWebviewWindow: vi.fn(),
    PhysicalPosition: vi.fn(),
    PhysicalSize: vi.fn(),
    currentMonitor: vi.fn(),
  },
}));

vi.mock('@tauri-apps/api/event', () => tauriListen);
vi.mock('@tauri-apps/api/webviewWindow', () => webviewWindow);
vi.mock('@tauri-apps/api/window', () => ({
  PhysicalPosition: vi.fn(),
  PhysicalSize: vi.fn(),
  currentMonitor: vi.fn().mockResolvedValue(null),
}));

describe('AIPopoutView draft handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it('seeds the composer from a same-origin browser draft message without sending', async () => {
    const DraftProbe = () => {
      const { pendingDraft } = useAIChat();
      return <div data-testid="draft-probe">{pendingDraft ?? ''}</div>;
    };

    render(
      <AIChatProvider>
        <DraftProbe />
        <AIPopoutView />
      </AIChatProvider>
    );

    window.dispatchEvent(
      new MessageEvent('message', {
        origin: window.location.origin,
        data: { type: AI_DRAFT_EVENT, text: 'nội dung từ cửa sổ chính' },
      })
    );

    await waitFor(() => {
      expect(screen.getByTestId('draft-probe').textContent).toBe('nội dung từ cửa sổ chính');
    });
  });

  it('ignores draft messages from another origin', async () => {
    const DraftProbe = () => {
      const { pendingDraft } = useAIChat();
      return <div data-testid="draft-probe">{pendingDraft ?? ''}</div>;
    };

    render(
      <AIChatProvider>
        <DraftProbe />
        <AIPopoutView />
      </AIChatProvider>
    );

    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://evil.example',
        data: { type: AI_DRAFT_EVENT, text: 'độc hại' },
      })
    );

    expect(screen.getByTestId('draft-probe').textContent).toBe('');
  });

  it('registers the Tauri draft event listener alongside the scope listener', async () => {
    (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {};
    tauriListen.listen.mockResolvedValue(() => {});
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

    render(
      <AIChatProvider>
        <AIPopoutView />
      </AIChatProvider>
    );

    await waitFor(() => {
      const events = tauriListen.listen.mock.calls.map((call: unknown[]) => call[0]);
      expect(events).toContain(AI_DRAFT_EVENT);
    });
  });
});
