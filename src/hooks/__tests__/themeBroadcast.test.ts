import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const tauri = vi.hoisted(() => {

  let handler: ((event: { payload: unknown }) => void) | null = null;
  const emitTo = vi.fn(async () => {});
  const listen = vi.fn(async (_event: string, next: (event: { payload: unknown }) => void) => {
    handler = next;
    return () => { if (handler === next) handler = null; };
  });
  return {
    emitTo,
    listen,
    handler: () => handler,
    reset: () => { handler = null; emitTo.mockClear(); listen.mockClear(); },
  };
});

vi.mock('@tauri-apps/api/event', () => ({ emitTo: tauri.emitTo, listen: tauri.listen }));

import { useThemeMode } from '../useThemeMode';
import {
  isValidThemeModePayload,
  subscribeToThemeBroadcast,
  THEME_MODE_EVENT,
  THEME_STORAGE_KEY,
} from '../../workbench/themeBroadcast';
import {
  AI_POPOUT_LABEL,
} from '../../utils/aiPopout';
import { CODING_ZONE_LABEL } from '../../utils/codingZonePopout';
import { NOTES_POPOUT_LABEL } from '../../utils/notesPopout';
import { TIMER_POPOUT_LABEL } from '../../utils/timerPopout';

function setTauri(isTauri: boolean) {
  if (isTauri) {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: { invoke: async () => undefined, transformCallback: () => 0 },
      configurable: true,
    });
  } else {
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
  }
}

function setOsPreference(isDark: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('prefers-color-scheme: dark') ? isDark : false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

describe('theme broadcast + useThemeMode', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setTauri(false);
    setOsPreference(false);
    tauri.reset();
  });

  afterEach(() => {
    setTauri(false);
    vi.restoreAllMocks();
  });

  it('validates only the exact { mode: enum } payload shape', () => {
    expect(isValidThemeModePayload({ mode: 'dark' })).toBe(true);
    expect(isValidThemeModePayload({ mode: 'light' })).toBe(true);
    expect(isValidThemeModePayload(null)).toBe(false);
    expect(isValidThemeModePayload('dark')).toBe(false);
    expect(isValidThemeModePayload({ mode: 'neon' })).toBe(false);
    expect(isValidThemeModePayload({ mode: 'dark', extra: 1 })).toBe(false);
  });

  it('accepts a valid Tauri payload and ignores malformed ones', () => {
    setTauri(true);
    const onMode = vi.fn();
    const unsubscribe = subscribeToThemeBroadcast(onMode);

    return waitFor(() => expect(tauri.listen).toHaveBeenCalledWith(THEME_MODE_EVENT, expect.any(Function)))
      .then(() => {
        const handler = tauri.handler()!;
        act(() => { handler({ payload: { mode: 'dark' } }); });
        expect(onMode).toHaveBeenCalledExactlyOnceWith('dark');

        handler({ payload: null });
        handler({ payload: { mode: 'neon' } });
        handler({ payload: 'dark' });
        expect(onMode).toHaveBeenCalledTimes(1);
        unsubscribe();
      });
  });

  it('propagates via the browser storage fallback and stops after unsubscribe', () => {
    const onMode = vi.fn();
    const unsubscribe = subscribeToThemeBroadcast(onMode);
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: THEME_STORAGE_KEY, newValue: 'dark' }));
    });
    expect(onMode).toHaveBeenCalledExactlyOnceWith('dark');

    unsubscribe();
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: THEME_STORAGE_KEY, newValue: 'light' }));
    });
    expect(onMode).toHaveBeenCalledTimes(1);
  });

  it('emits once per popout label with the validated enum payload in Tauri', async () => {
    setTauri(true);
    const { result } = renderHook(() => useThemeMode());
    act(() => result.current.setMode('dark'));
    expect(result.current.mode).toBe('dark');
    await vi.waitFor(() => expect(tauri.emitTo).toHaveBeenCalledTimes(4));

    for (const label of [TIMER_POPOUT_LABEL, NOTES_POPOUT_LABEL, AI_POPOUT_LABEL, CODING_ZONE_LABEL]) {
      expect(tauri.emitTo).toHaveBeenCalledWith(label, THEME_MODE_EVENT, { mode: 'dark' });
    }
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(result.current.mode).toBe('dark');
  });

  it('re-renders a mounted consumer on a received valid mode without re-broadcasting', async () => {
    setTauri(true);
    const { result, unmount } = renderHook(() => useThemeMode());
    expect(result.current.mode).toBe('light');

    await waitFor(() => expect(tauri.handler()).not.toBeNull());
    const handler = tauri.handler()!;
    act(() => { handler({ payload: { mode: 'dark' } }); });

    expect(result.current.mode).toBe('dark');
    expect(tauri.emitTo).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();

    unmount();
    act(() => { handler({ payload: { mode: 'light' } }); });
    expect(result.current.mode).toBe('dark');
  });

  it('honours localStorage override, OS fallback and ignores tampered values', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    setOsPreference(false);
    expect(renderHook(() => useThemeMode()).result.current.mode).toBe('dark');

    window.localStorage.clear();
    setOsPreference(true);
    expect(renderHook(() => useThemeMode()).result.current.mode).toBe('dark');

    setOsPreference(false);
    expect(renderHook(() => useThemeMode()).result.current.mode).toBe('light');

    window.localStorage.setItem(THEME_STORAGE_KEY, 'malicious<script>');
    setOsPreference(true);
    const { result } = renderHook(() => useThemeMode());
    expect(result.current.mode).toBe('dark');
    expect(document.documentElement.outerHTML).not.toContain('malicious<script>');
  });
});
