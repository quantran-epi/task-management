/**
 * Cross-window theme propagation (D-07, TOKEN-02).
 * Tauri: targeted emitTo for the four known popouts. Browser: same-origin storage event.
 * Every received payload is validated before it can reach React state or data-theme.
 */

import { emitTo, listen } from '@tauri-apps/api/event';
import { isTauriApp } from '../utils/timerPopout';
import {
  AI_POPOUT_LABEL,
} from '../utils/aiPopout';
import { CODING_ZONE_LABEL } from '../utils/codingZonePopout';
import { NOTES_POPOUT_LABEL } from '../utils/notesPopout';
import { TIMER_POPOUT_LABEL } from '../utils/timerPopout';
import type { ThemeMode } from '../styles/tokens';

export const THEME_MODE_EVENT = 'taskmate:theme-mode';
/** Same-window fan-out: the storage event never fires in the document that wrote it (CR-01). */
export const THEME_LOCAL_EVENT = 'taskmate:theme-mode-local';
export const THEME_STORAGE_KEY = 'taskmate_theme';

const POPOUT_LABELS = [TIMER_POPOUT_LABEL, NOTES_POPOUT_LABEL, AI_POPOUT_LABEL, CODING_ZONE_LABEL] as const;

export function isValidThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark';
}

/** Exact `{ mode: enum }` shape — null, strings, extra keys and bad enums are ignored. */
export function isValidThemeModePayload(value: unknown): value is { mode: ThemeMode } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === 1 && keys[0] === 'mode' && isValidThemeMode((value as { mode?: unknown }).mode);
}

export function broadcastThemeMode(mode: ThemeMode): void {
  if (!isValidThemeMode(mode)) return;
  // Deliver to every hook in this same window before the cross-window channels.
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(THEME_LOCAL_EVENT, { detail: { mode } }));
  }
  if (isTauriApp()) {
    void Promise.all(POPOUT_LABELS.map((label) => emitTo(label, THEME_MODE_EVENT, { mode })))
      .catch(() => { /* popout may not exist yet — non-fatal */ });
  }
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch { /* storage disabled — Tauri event still carries the change */ }
}

/** Returns an unsubscribe function that detaches every listener, including late Tauri ones. */
export function subscribeToThemeBroadcast(onMode: (mode: ThemeMode) => void): () => void {
  let closed = false;
  const deliver = (payload: unknown) => {
    if (closed || !isValidThemeModePayload(payload)) return;
    onMode(payload.mode);
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    // Validate through the same enum gate as IPC — a tampered value never reaches state.
    deliver({ mode: event.newValue });
  };
  const onLocal = (event: Event) => deliver((event as CustomEvent).detail);
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage);
    window.addEventListener(THEME_LOCAL_EVENT, onLocal);
  }

  let unlistenTauri: (() => void) | undefined;
  if (isTauriApp()) {
    void listen(THEME_MODE_EVENT, (event) => deliver(event.payload))
      .then((unlisten) => {
        unlistenTauri = unlisten;
        if (closed) unlisten();
      })
      .catch(() => { /* IPC unavailable — storage listener remains */ });
  }

  return () => {
    closed = true;
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(THEME_LOCAL_EVENT, onLocal);
    }
    unlistenTauri?.();
  };
}
