/**
 * Utility for managing the floating AI chat assistant popout window.
 * Supports native Tauri secondary WebviewWindow with always-on-top pinning
 * and graceful fallback to browser popup window.
 */

import { isTauriApp } from './timerPopout';

export { isTauriApp };

export const AI_POPOUT_LABEL = 'ai-popout';

export interface AIScopeParams {
  type: string;
  id?: string | undefined;
  title?: string | undefined;
}

export const AI_SCOPE_EVENT = 'ai-set-scope';
export const AI_DRAFT_EVENT = 'ai-set-draft';

export interface AIDraftPayload {
  text: string;
  scope?: AIScopeParams;
}

/** Browser-mode handle for the popout opened via window.open (null/closed => no popout). */
let browserPopoutHandle: Window | null = null;
const BROWSER_POPOUT_NAME = 'task-planner-ai-popout';
/** Survives a page reload so a session-restored named popup can be re-adopted. */
export const BROWSER_POPOUT_SESSION_KEY = 'taskmate.ai-popout.session-active';

function markBrowserPopoutSession(active: boolean): void {
  try {
    if (active) sessionStorage.setItem(BROWSER_POPOUT_SESSION_KEY, '1');
    else sessionStorage.removeItem(BROWSER_POPOUT_SESSION_KEY);
  } catch {
    // Storage unavailable (private mode) — recovery simply will not be attempted.
  }
}

/**
 * Return the live tracked browser handle, or re-adopt the named popup after a session restore.
 * Only a popup whose hash identifies the AI popout is accepted; a stray window is closed.
 */
function recoverBrowserPopout(): Window | null {
  if (browserPopoutHandle && !browserPopoutHandle.closed) return browserPopoutHandle;
  let marked = false;
  try {
    marked = sessionStorage.getItem(BROWSER_POPOUT_SESSION_KEY) === '1';
  } catch {
    return null;
  }
  if (!marked) return null;
  try {
    const handle = window.open('', BROWSER_POPOUT_NAME);
    if (handle && !handle.closed && handle.location?.hash?.startsWith('#ai-popout')) {
      browserPopoutHandle = handle;
      return handle;
    }
    try { handle?.close(); } catch { /* stray window may reject close */ }
  } catch {
    // A cross-origin or blocked re-open cannot be adopted.
  }
  browserPopoutHandle = null;
  markBrowserPopoutSession(false);
  return null;
}

export function buildAiPopoutUrl(base = '', scope?: AIScopeParams): string {
  const params = new URLSearchParams();
  if (scope?.type) {
    params.set('scopeType', scope.type);
    if (scope.id) params.set('scopeId', scope.id);
    if (scope.title) params.set('scopeTitle', scope.title);
  }
  const queryPart = params.toString() ? `?${params.toString()}` : '';
  return `${base}?popoutVersion=${Date.now()}#ai-popout${queryPart}`;
}

export async function openAiPopout(scope?: AIScopeParams): Promise<void> {
  if (isTauriApp()) {
    try {
      const { WebviewWindow, getAllWebviewWindows } = await import('@tauri-apps/api/webviewWindow');
      const windows = await getAllWebviewWindows();
      const existing = windows.find((w) => w.label === AI_POPOUT_LABEL);

      if (existing) {
        await existing.show();
        await existing.setFocus();
        if (scope) {
          const { emitTo } = await import('@tauri-apps/api/event');
          // Scope the handoff to the named webview: no global broadcast (T-quick-07).
          await emitTo(AI_POPOUT_LABEL, AI_SCOPE_EVENT, scope);
        }
        return;
      }

      const webview = new WebviewWindow(AI_POPOUT_LABEL, {
        url: buildAiPopoutUrl('', scope),
        title: 'Trợ lý AI',
        width: 440,
        height: 680,
        minWidth: 360,
        minHeight: 480,
        maximized: false,
        resizable: true,
        alwaysOnTop: true,
        decorations: true,
      });

      await new Promise<void>((resolve, reject) => {
        webview.once('tauri://created', () => resolve());
        webview.once('tauri://error', (e) => reject(e));
      });
      return;
    } catch (err) {
      console.warn('Failed to open Tauri AI WebviewWindow, falling back to window.open:', err);
    }
  }

  // Web browser fallback
  const base = `${window.location.origin}${window.location.pathname}`;
  browserPopoutHandle = window.open(
    buildAiPopoutUrl(base, scope),
    BROWSER_POPOUT_NAME,
    'width=480,height=720,resizable=yes,status=no'
  );
  markBrowserPopoutSession(Boolean(browserPopoutHandle && !browserPopoutHandle.closed));
}

/** True when a floating AI popout is currently open (Tauri webview or browser popup). */
export async function isAiPopoutOpen(): Promise<boolean> {
  if (isTauriApp()) {
    try {
      const { getAllWebviewWindows } = await import('@tauri-apps/api/webviewWindow');
      const windows = await getAllWebviewWindows();
      return windows.some((w) => w.label === AI_POPOUT_LABEL);
    } catch {
      return false;
    }
  }
  return Boolean(recoverBrowserPopout());
}

/**
 * Seed a draft into the open popout without opening a new window. Returns false when no popout
 * exists or the handoff fails; the caller then falls back to the in-app draft flow.
 */
export async function sendTextToAiPopout(text: string, scope?: AIScopeParams): Promise<boolean> {
  const payload: AIDraftPayload = { text, ...(scope ? { scope } : {}) };
  if (isTauriApp()) {
    try {
      if (!(await isAiPopoutOpen())) return false;
      const [{ emitTo }, { getAllWebviewWindows }] = await Promise.all([
        import('@tauri-apps/api/event'),
        import('@tauri-apps/api/webviewWindow'),
      ]);
      // Deliver the draft only to the AI popout webview, never a global broadcast (T-quick-07).
      await emitTo(AI_POPOUT_LABEL, AI_DRAFT_EVENT, payload);
      const existing = (await getAllWebviewWindows()).find((w) => w.label === AI_POPOUT_LABEL);
      await existing?.setFocus();
      return true;
    } catch {
      return false;
    }
  }
  const handle = recoverBrowserPopout();
  if (!handle) return false;
  try {
    handle.postMessage({ type: AI_DRAFT_EVENT, ...payload }, window.location.origin);
    return true;
  } catch {
    return false;
  }
}

export async function isAiWindowAlwaysOnTop(): Promise<boolean> {
  if (!isTauriApp()) {
    return false;
  }
  try {
    const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const win = getCurrentWebviewWindow();
    return await win.isAlwaysOnTop();
  } catch (err) {
    console.warn('Failed to get AI always-on-top state:', err);
    return false;
  }
}

export async function setAiWindowAlwaysOnTop(alwaysOnTop: boolean): Promise<boolean> {
  if (!isTauriApp()) {
    return false;
  }
  try {
    const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const win = getCurrentWebviewWindow();
    await win.setAlwaysOnTop(alwaysOnTop);
    return true;
  } catch (err) {
    console.warn('Failed to set AI always-on-top state:', err);
    return false;
  }
}

export async function closeCurrentAiPopoutWindow(): Promise<void> {
  if (isTauriApp()) {
    try {
      const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      await getCurrentWebviewWindow().close();
      return;
    } catch {
      // Fall through to window.close
    }
  }
  window.close();
}
