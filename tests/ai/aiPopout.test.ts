import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { tauriWindows, tauriEmit } = vi.hoisted(() => ({
  tauriWindows: {
    getAllWebviewWindows: vi.fn(),
    WebviewWindow: vi.fn(),
  },
  tauriEmit: { emit: vi.fn() },
}));

vi.mock('@tauri-apps/api/webviewWindow', () => tauriWindows);
vi.mock('@tauri-apps/api/event', () => tauriEmit);
import {
  isTauriApp,
  openAiPopout,
  buildAiPopoutUrl,
  isAiWindowAlwaysOnTop,
  setAiWindowAlwaysOnTop,
  closeCurrentAiPopoutWindow,
  AI_DRAFT_EVENT,
  isAiPopoutOpen,
  sendTextToAiPopout,
} from '../../src/utils/aiPopout';

describe('aiPopout utility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  describe('isTauriApp', () => {
    it('returns false when __TAURI_INTERNALS__ is not present', () => {
      expect(isTauriApp()).toBe(false);
    });

    it('returns true when __TAURI_INTERNALS__ is present on window', () => {
      (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {};
      expect(isTauriApp()).toBe(true);
    });
  });

  describe('buildAiPopoutUrl', () => {
    it('inserts popoutVersion before hash route with empty scope', () => {
      expect(buildAiPopoutUrl('/task-management/')).toMatch(
        /^\/task-management\/\?popoutVersion=\d+#ai-popout$/
      );
    });

    it('encodes scope query parameters into the URL', () => {
      const url = buildAiPopoutUrl('/task-management/', {
        type: 'task',
        id: 't-123',
        title: 'Lập kế hoạch',
      });
      expect(url).toMatch(/scopeType=task/);
      expect(url).toMatch(/scopeId=t-123/);
      expect(url).toMatch(/#ai-popout/);
    });
  });

  describe('openAiPopout in browser mode', () => {
    it('calls window.open with resizable popout window options', async () => {
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

      await openAiPopout({ type: 'task', id: 't-1' });

      expect(openSpy).toHaveBeenCalledWith(
        expect.stringMatching(/#ai-popout\?scopeType=task/),
        'task-planner-ai-popout',
        expect.stringContaining('resizable=yes')
      );
    });
  });

  describe('draft handoff', () => {
    it('exports a namespaced draft event constant', () => {
      expect(AI_DRAFT_EVENT).toBeTruthy();
      expect(AI_DRAFT_EVENT).toContain('ai-');
    });

    it('reports browser popout open only while a live handle is tracked', async () => {
      const fakeHandle = { closed: false, postMessage: vi.fn() } as unknown as WindowProxy;
      vi.spyOn(window, 'open').mockReturnValue(fakeHandle);
      expect(await isAiPopoutOpen()).toBe(false);
      await openAiPopout();
      expect(await isAiPopoutOpen()).toBe(true);
      (fakeHandle as unknown as { closed: boolean }).closed = true;
      expect(await isAiPopoutOpen()).toBe(false);
    });

    it('posts a namespaced draft to the tracked browser handle', async () => {
      const postMessage = vi.fn();
      const fakeHandle = { closed: false, postMessage } as unknown as WindowProxy;
      vi.spyOn(window, 'open').mockReturnValue(fakeHandle);
      await openAiPopout();
      await sendTextToAiPopout('đoạn trích', { type: 'task', id: 't-1' });
      expect(postMessage).toHaveBeenCalledWith(
        { type: AI_DRAFT_EVENT, text: 'đoạn trích', scope: { type: 'task', id: 't-1' } },
        window.location.origin
      );
    });

    it('does nothing when no popout handle exists', async () => {
      vi.spyOn(window, 'open').mockReturnValue(null);
      await openAiPopout(); // clears any handle tracked by an earlier test
      expect(await isAiPopoutOpen()).toBe(false);
      await expect(sendTextToAiPopout('text')).resolves.toBe(false);
    });
  });

  describe('draft handoff in Tauri', () => {
    beforeEach(() => {
      (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {};
      tauriWindows.getAllWebviewWindows.mockResolvedValue([
        { label: 'ai-popout', show: vi.fn(), setFocus: vi.fn() },
      ]);
      tauriEmit.emit.mockResolvedValue(undefined);
    });

    it('reports open when the ai-popout webview exists', async () => {
      expect(await isAiPopoutOpen()).toBe(true);
      tauriWindows.getAllWebviewWindows.mockResolvedValue([{ label: 'other' }]);
      expect(await isAiPopoutOpen()).toBe(false);
    });

    it('emits the draft event to the existing popout', async () => {
      const focus = vi.fn();
      tauriWindows.getAllWebviewWindows.mockResolvedValue([
        { label: 'ai-popout', show: vi.fn(), setFocus: focus },
      ]);
      const result = await sendTextToAiPopout('nội dung', { type: 'remote', id: 'r-1' });
      expect(result).toBe(true);
      expect(tauriEmit.emit).toHaveBeenCalledWith(AI_DRAFT_EVENT, {
        text: 'nội dung',
        scope: { type: 'remote', id: 'r-1' },
      });
      expect(focus).toHaveBeenCalled();
    });
  });

  describe('Tauri window helper fallbacks', () => {
    it('returns false for isAiWindowAlwaysOnTop outside Tauri', async () => {
      expect(await isAiWindowAlwaysOnTop()).toBe(false);
    });

    it('returns false for setAiWindowAlwaysOnTop outside Tauri', async () => {
      expect(await setAiWindowAlwaysOnTop(true)).toBe(false);
    });

    it('calls window.close in browser mode', async () => {
      const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => {});
      await closeCurrentAiPopoutWindow();
      expect(closeSpy).toHaveBeenCalled();
    });
  });
});
