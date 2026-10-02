/**
 * Utility for managing the floating timer popout window.
 * Supports native Tauri secondary WebviewWindow with always-on-top pinning
 * and graceful fallback to browser popup window.
 */

export function isTauriApp(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export const TIMER_POPOUT_LABEL = 'timer-popout';

export function buildTimerPopoutUrl(base = ''): string {
  return `${base}?popoutVersion=${Date.now()}#timer-popout`;
}

export async function openTimerPopout(): Promise<void> {
  if (isTauriApp()) {
    try {
      const { WebviewWindow, getAllWebviewWindows } = await import('@tauri-apps/api/webviewWindow');
      const windows = await getAllWebviewWindows();
      const existing = windows.find((w) => w.label === TIMER_POPOUT_LABEL);

      if (existing) {
        await existing.show();
        await existing.setFocus();
        return;
      }

      const webview = new WebviewWindow(TIMER_POPOUT_LABEL, {
        url: buildTimerPopoutUrl(),
        title: 'Bộ đếm thời gian',
        width: 340,
        height: 200,
        minWidth: 260,
        minHeight: 90,
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
      console.warn('Failed to open Tauri WebviewWindow, falling back to window.open:', err);
    }
  }

  // Web browser fallback
  const base = `${window.location.origin}${window.location.pathname}`;
  window.open(buildTimerPopoutUrl(base), 'task-planner-timer-popout', 'width=340,height=200,resizable=yes,status=no');
}

export async function isWindowAlwaysOnTop(): Promise<boolean> {
  if (!isTauriApp()) {
    return false;
  }
  try {
    const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const win = getCurrentWebviewWindow();
    return await win.isAlwaysOnTop();
  } catch (err) {
    console.warn('Failed to get always-on-top state:', err);
    return false;
  }
}

export async function setWindowAlwaysOnTop(alwaysOnTop: boolean): Promise<boolean> {
  if (!isTauriApp()) {
    return false;
  }
  try {
    const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const win = getCurrentWebviewWindow();
    await win.setAlwaysOnTop(alwaysOnTop);
    return true;
  } catch (err) {
    console.warn('Failed to set always-on-top state:', err);
    return false;
  }
}

export async function toggleAlwaysOnTop(): Promise<boolean> {
  const current = await isWindowAlwaysOnTop();
  const next = !current;
  await setWindowAlwaysOnTop(next);
  return next;
}

export async function closeCurrentPopoutWindow(): Promise<void> {
  if (isTauriApp()) {
    try {
      const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      const win = getCurrentWebviewWindow();
      await win.close();
      return;
    } catch {
      // Fall through to window.close
    }
  }
  window.close();
}
