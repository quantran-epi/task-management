import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isTauriApp,
  openTimerPopout,
  isWindowAlwaysOnTop,
  setWindowAlwaysOnTop,
  closeCurrentPopoutWindow,
  TIMER_POPOUT_LABEL,
} from '../../src/utils/timerPopout';

describe('timerPopout utility', () => {
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

  describe('openTimerPopout in browser mode', () => {
    it('calls window.open with correct hash route and options', async () => {
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

      await openTimerPopout();

      expect(openSpy).toHaveBeenCalledWith(
        expect.stringContaining('#timer-popout'),
        'task-planner-timer-popout',
        expect.stringContaining('width=340')
      );
    });
  });

  describe('alwaysOnTop helpers in browser mode', () => {
    it('isWindowAlwaysOnTop returns false in non-Tauri browser', async () => {
      const res = await isWindowAlwaysOnTop();
      expect(res).toBe(false);
    });

    it('setWindowAlwaysOnTop returns false in non-Tauri browser', async () => {
      const res = await setWindowAlwaysOnTop(true);
      expect(res).toBe(false);
    });
  });

  describe('closeCurrentPopoutWindow', () => {
    it('calls window.close in browser environment', async () => {
      const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => {});
      await closeCurrentPopoutWindow();
      expect(closeSpy).toHaveBeenCalled();
    });
  });

  describe('constants', () => {
    it('has standard label', () => {
      expect(TIMER_POPOUT_LABEL).toBe('timer-popout');
    });
  });
});
