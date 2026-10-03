import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isTauriApp,
  openAiPopout,
  buildAiPopoutUrl,
  isAiWindowAlwaysOnTop,
  setAiWindowAlwaysOnTop,
  closeCurrentAiPopoutWindow,
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
