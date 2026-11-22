import { useCallback, useEffect, useState } from 'react';
import type { ThemeMode } from '../styles/tokens';
import {
  broadcastThemeMode,
  isValidThemeMode,
  subscribeToThemeBroadcast,
  THEME_STORAGE_KEY,
} from '../workbench/themeBroadcast';

export interface ThemeModeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

function readStoredMode(): ThemeMode | null {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isValidThemeMode(raw) ? raw : null;
  } catch {
    return null;
  }
}

function systemMode(): ThemeMode {
  if (typeof window === 'undefined' || !('matchMedia' in window)) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function initialMode(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  return readStoredMode() ?? systemMode();
}

/**
 * One shared broadcast/OS subscription for every consumer. Before this, each
 * wrapper called `subscribeToThemeBroadcast()` itself — in Tauri that meant a
 * separate IPC `listen` per mounted control, which stalled the renderer.
 */
type ModeListener = (mode: ThemeMode) => void;
const modeListeners = new Set<ModeListener>();
let sharedSubscription: (() => void) | undefined;
let mediaListener: ((event: MediaQueryListEvent) => void) | undefined;
let mediaQuery: MediaQueryList | undefined;

function ensureSharedSubscription(): void {
  if (typeof window === 'undefined' || sharedSubscription) return;
  sharedSubscription = subscribeToThemeBroadcast((mode) => {
    for (const listener of modeListeners) listener(mode);
  });
  if ('matchMedia' in window) {
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaListener = (event) => {
      if (readStoredMode()) return;
      const mode: ThemeMode = event.matches ? 'dark' : 'light';
      for (const listener of modeListeners) listener(mode);
    };
    mediaQuery.addEventListener('change', mediaListener);
  }
}

function releaseSharedSubscription(): void {
  if (modeListeners.size > 0 || typeof window === 'undefined') return;
  sharedSubscription?.();
  sharedSubscription = undefined;
  if (mediaQuery && mediaListener) mediaQuery.removeEventListener('change', mediaListener);
  mediaQuery = undefined;
  mediaListener = undefined;
}

/** Per-consumer state; only the transport is shared. */
export function useThemeMode(): ThemeModeState {
  const [mode, setModeState] = useState<ThemeMode>(initialMode);

  useEffect(() => {
    ensureSharedSubscription();
    const listener: ModeListener = (next) => setModeState(next);
    modeListeners.add(listener);
    return () => {
      modeListeners.delete(listener);
      releaseSharedSubscription();
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    if (!isValidThemeMode(next)) return;
    setModeState(next);
    broadcastThemeMode(next);
  }, []);

  const toggle = useCallback(() => {
    setMode(mode === 'dark' ? 'light' : 'dark');
  }, [mode, setMode]);

  return { mode, setMode, toggle };
}
