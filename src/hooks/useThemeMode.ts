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
  if (typeof window !== 'undefined' && 'matchMedia' in window) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

function initialMode(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  return readStoredMode() ?? systemMode();
}

/**
 * Theme choice with precedence localStorage > OS preference > light (D-05/D-06).
 * Invalid stored values are ignored and never reach the DOM or broadcast payload.
 * Every mounted consumer subscribes to broadcasts and re-renders without reload.
 */
export function useThemeMode(): ThemeModeState {
  const [mode, setModeState] = useState<ThemeMode>(initialMode);

  // ponytail: read storage once. Checking it on every mode change detached/reattached
  // the OS listener in every mounted consumer — hundreds of wrappers made toggles lag.
  useEffect(() => {
    if (typeof window === 'undefined' || !('matchMedia' in window)) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => {
      if (!readStoredMode()) setModeState(event.matches ? 'dark' : 'light');
    };
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    // Received mode goes straight to React state: no re-broadcast, no localStorage write.
    // The originating window stays the authority; every popout re-renders here.
    return subscribeToThemeBroadcast((received) => setModeState(received));
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
