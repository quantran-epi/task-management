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
          const { emit } = await import('@tauri-apps/api/event');
          await emit(AI_SCOPE_EVENT, scope);
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
    'task-planner-ai-popout',
    'width=480,height=720,resizable=yes,status=no'
  );
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
  return Boolean(browserPopoutHandle && !browserPopoutHandle.closed);
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
      const [{ emit }, { getAllWebviewWindows }] = await Promise.all([
        import('@tauri-apps/api/event'),
        import('@tauri-apps/api/webviewWindow'),
      ]);
      await emit(AI_DRAFT_EVENT, payload);
      const existing = (await getAllWebviewWindows()).find((w) => w.label === AI_POPOUT_LABEL);
      await existing?.setFocus();
      return true;
    } catch {
      return false;
    }
  }
  if (!browserPopoutHandle || browserPopoutHandle.closed) return false;
  try {
    browserPopoutHandle.postMessage({ type: AI_DRAFT_EVENT, ...payload }, window.location.origin);
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
