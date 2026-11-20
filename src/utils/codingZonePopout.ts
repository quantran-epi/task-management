/**
 * Phase 48 D-06/D-15: real Tauri Coding Zone secondary window.
 * Mirrors aiPopout.ts — dedicated label, dedupe, targeted handoff, safe browser fallback.
 * No worktree path, token or passphrase ever travels in the URL/hash.
 */

import { isTauriApp } from './timerPopout';

export { isTauriApp };

export const CODING_ZONE_LABEL = 'coding-zone-popout';
export const CODING_ZONE_HANDOFF_EVENT = 'coding-zone-handoff';
export const CODING_ZONE_SYNC_EVENT = 'coding-zone-sync';

const BROWSER_POPOUT_NAME = 'taskmate-coding-zone-popout';
const BROWSER_SESSION_KEY = 'taskmate.coding-zone.popout.session-active';

let browserPopoutHandle: Window | null = null;

/** Build a bare hash route: state is handed off over IPC/postMessage, never encoded here. */
export function buildCodingZonePopoutUrl(base = ''): string {
  return `${base}#/coding-zone-popout`;
}

function markBrowserSession(active: boolean): void {
  try {
    if (active) sessionStorage.setItem(BROWSER_SESSION_KEY, '1');
    else sessionStorage.removeItem(BROWSER_SESSION_KEY);
  } catch {
    // Storage unavailable — recovery is simply skipped.
  }
}

function recoverBrowserPopout(): Window | null {
  if (browserPopoutHandle && !browserPopoutHandle.closed) return browserPopoutHandle;
  let marked = false;
  try {
    marked = sessionStorage.getItem(BROWSER_SESSION_KEY) === '1';
  } catch {
    return null;
  }
  if (!marked) return null;
  try {
    const handle = window.open('', BROWSER_POPOUT_NAME);
    if (handle && !handle.closed && handle.location?.hash?.startsWith('#/coding-zone-popout')) {
      browserPopoutHandle = handle;
      return handle;
    }
    try { handle?.close(); } catch { /* stray popup */ }
  } catch {
    // Cross-origin or blocked recovery cannot be adopted.
  }
  browserPopoutHandle = null;
  markBrowserSession(false);
  return null;
}

/**
 * Open (or focus) the dedicated Coding Zone window and hand it the current shared state.
 * The state argument is opaque here; shape validation belongs to the receiving sync hook.
 */
export async function openCodingZonePopout(state?: unknown): Promise<void> {
  if (isTauriApp()) {
    try {
      const { WebviewWindow, getAllWebviewWindows } = await import('@tauri-apps/api/webviewWindow');
      const existing = (await getAllWebviewWindows()).find((w) => w.label === CODING_ZONE_LABEL);
      if (existing) {
        await existing.show();
        await existing.setFocus();
        if (state !== undefined) await sendCodingZoneHandoff(state);
        return;
      }

      const webview = new WebviewWindow(CODING_ZONE_LABEL, {
        url: buildCodingZonePopoutUrl(),
        title: 'Coding Zone',
        width: 1200,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        maximized: false,
        resizable: true,
      });
      await new Promise<void>((resolve, reject) => {
        webview.once('tauri://created', () => resolve());
        webview.once('tauri://error', (error) => reject(error));
      });
      if (state !== undefined) await sendCodingZoneHandoff(state);
      return;
    } catch (error) {
      console.warn('Failed to open Tauri Coding Zone window, falling back to popup:', error);
    }
  }

  const base = `${window.location.origin}${window.location.pathname}`;
  browserPopoutHandle = window.open(
    buildCodingZonePopoutUrl(base),
    BROWSER_POPOUT_NAME,
    'width=1200,height=800,resizable=yes,status=no'
  );
  markBrowserSession(Boolean(browserPopoutHandle && !browserPopoutHandle.closed));
  if (state !== undefined) sendCodingZoneHandoff(state);
}

/**
 * Targeted initial handoff: Tauri emitTo for the dedicated window, same-origin
 * postMessage in browser. Wrapped as a full revision-0 sync event so the receiver
 * validates it through the same echo/replay gate as every other state update.
 */
export async function sendCodingZoneHandoff(state: unknown): Promise<boolean> {
  const event = {
    originWindowId: 'coding-zone-main',
    revision: 0,
    kind: 'full',
    payload: state,
  };
  if (isTauriApp()) {
    try {
      const { emitTo } = await import('@tauri-apps/api/event');
      await emitTo(CODING_ZONE_LABEL, CODING_ZONE_HANDOFF_EVENT, event);
      return true;
    } catch {
      return false;
    }
  }
  const handle = recoverBrowserPopout();
  if (!handle) return false;
  try {
    handle.postMessage({ type: CODING_ZONE_HANDOFF_EVENT, payload: event }, window.location.origin);
    return true;
  } catch {
    return false;
  }
}

export async function isCodingZonePopoutOpen(): Promise<boolean> {
  if (isTauriApp()) {
    try {
      const { getAllWebviewWindows } = await import('@tauri-apps/api/webviewWindow');
      return (await getAllWebviewWindows()).some((w) => w.label === CODING_ZONE_LABEL);
    } catch {
      return false;
    }
  }
  return Boolean(recoverBrowserPopout());
}

/** Close the popout: from inside it closes its own webview; from main it closes the named one. */
export async function closeCodingZonePopout(): Promise<void> {
  if (isTauriApp()) {
    try {
      const { getCurrentWebviewWindow, getAllWebviewWindows } = await import('@tauri-apps/api/webviewWindow');
      const current = getCurrentWebviewWindow();
      if (current.label === CODING_ZONE_LABEL) {
        await current.close();
        return;
      }
      await (await getAllWebviewWindows()).find((w) => w.label === CODING_ZONE_LABEL)?.close();
      return;
    } catch {
      // Fall through to browser close.
    }
  }
  const handle = recoverBrowserPopout();
  handle?.close();
  browserPopoutHandle = null;
  markBrowserSession(false);
}
