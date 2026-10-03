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
        width: 480,
        height: 720,
        minWidth: 360,
        minHeight: 480,
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
  window.open(
    buildAiPopoutUrl(base, scope),
    'task-planner-ai-popout',
    'width=480,height=720,resizable=yes,status=no'
  );
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
