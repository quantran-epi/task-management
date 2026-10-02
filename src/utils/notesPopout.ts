/**
 * Utility for managing the floating notes list popout window (D-20, D-21, D-22, D-23).
 * Supports native Tauri secondary WebviewWindow with always-on-top pinning
 * and graceful fallback to browser popup window.
 */

export function isTauriApp(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export const NOTES_POPOUT_LABEL = 'notes-popout';

export interface NotesFilterParams {
  entityType?: string;
  entityId?: string;
}

export const NOTES_FILTER_EVENT = 'notes-set-filter';

export function buildNotesPopoutUrl(base = '', entityFilter?: NotesFilterParams): string {
  const queryPart = entityFilter?.entityType && entityFilter?.entityId
    ? `?entityType=${encodeURIComponent(entityFilter.entityType)}&entityId=${encodeURIComponent(entityFilter.entityId)}`
    : '';
  return `${base}?popoutVersion=${Date.now()}#notes-popout${queryPart}`;
}

export async function openNotesPopout(entityFilter?: NotesFilterParams): Promise<void> {

  if (isTauriApp()) {
    try {
      const { WebviewWindow, getAllWebviewWindows } = await import('@tauri-apps/api/webviewWindow');
      const windows = await getAllWebviewWindows();
      const existing = windows.find((w) => w.label === NOTES_POPOUT_LABEL);

      if (existing) {
        await existing.show();
        await existing.setFocus();
        if (entityFilter) {
          const { emit } = await import('@tauri-apps/api/event');
          await emit(NOTES_FILTER_EVENT, entityFilter);
        }
        return;
      }

      const webview = new WebviewWindow(NOTES_POPOUT_LABEL, {
        url: buildNotesPopoutUrl('', entityFilter),
        title: 'Ghi chú nhanh',
        width: 420,
        height: 640,
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
      console.warn('Failed to open Tauri Notes WebviewWindow, falling back to window.open:', err);
    }
  }

  // Web browser fallback
  const base = `${window.location.origin}${window.location.pathname}`;
  window.open(buildNotesPopoutUrl(base, entityFilter), 'task-planner-notes-popout', 'width=420,height=640,resizable=yes,status=no');
}

export async function isNotesWindowAlwaysOnTop(): Promise<boolean> {
  if (!isTauriApp()) {
    return false;
  }
  try {
    const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const win = getCurrentWebviewWindow();
    return await win.isAlwaysOnTop();
  } catch (err) {
    console.warn('Failed to get notes always-on-top state:', err);
    return false;
  }
}

export async function setNotesWindowAlwaysOnTop(alwaysOnTop: boolean): Promise<boolean> {
  if (!isTauriApp()) {
    return false;
  }
  try {
    const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const win = getCurrentWebviewWindow();
    await win.setAlwaysOnTop(alwaysOnTop);
    return true;
  } catch (err) {
    console.warn('Failed to set notes always-on-top state:', err);
    return false;
  }
}

export async function closeCurrentNotesPopoutWindow(): Promise<void> {
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
