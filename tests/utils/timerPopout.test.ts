import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isTauriApp,
  openTimerPopout,
  buildTimerPopoutUrl,
  isWindowAlwaysOnTop,
  setWindowAlwaysOnTop,
  toggleAlwaysOnTop,
  closeCurrentPopoutWindow,
  TIMER_POPOUT_LABEL,
} from '../../src/utils/timerPopout';
import { buildNotesPopoutUrl, openNotesPopout } from '../../src/utils/notesPopout';

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
    it('calls window.open with fresh pre-hash cache busting route and options', async () => {
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

      await openTimerPopout();

      expect(openSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\?popoutVersion=\d+#timer-popout$/),
        'task-planner-timer-popout',
        expect.stringContaining('width=340')
      );
    });
  });

  describe('buildTimerPopoutUrl', () => {
    it('inserts popoutVersion before hash route', () => {
      expect(buildTimerPopoutUrl('/task-management/')).toMatch(
        /^\/task-management\/\?popoutVersion=\d+#timer-popout$/
      );
    });
  });

  describe('openNotesPopout in browser mode', () => {
    it('calls window.open with fresh pre-hash cache busting notes route and entity filters', async () => {
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

      await openNotesPopout({ entityType: 'task', entityId: 'task-1' });

      expect(openSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\?popoutVersion=\d+#notes-popout\?entityType=task&entityId=task-1$/),
        'task-planner-notes-popout',
        expect.stringContaining('width=420')
      );
    });
  });

  describe('buildNotesPopoutUrl', () => {
    it('inserts popoutVersion before notes hash route and encodes filters', () => {
      expect(buildNotesPopoutUrl('/task-management/', { entityType: 'task', entityId: 'task 1' })).toMatch(
        /^\/task-management\/\?popoutVersion=\d+#notes-popout\?entityType=task&entityId=task%201$/
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

    it('toggleAlwaysOnTop returns true (negated current false) and calls setWindowAlwaysOnTop', async () => {
      const res = await toggleAlwaysOnTop();
      expect(res).toBe(true);
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
