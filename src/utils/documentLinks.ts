import { message } from 'antd';
import { isTauriApp } from './timerPopout';

async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const api = await import('@tauri-apps/api/core');
  return args === undefined ? api.invoke<T>(command) : api.invoke<T>(command, args);
}

/**
 * Checks if a string represents a local folder or file path.
 * Supports:
 * - file:// URI scheme
 * - Unix absolute paths: /Users/... or /home/...
 * - Windows drive paths: C:\... or C:/...
 * - Windows UNC paths: \\server\share\...
 */
export function isLocalPath(urlOrPath: string): boolean {
  const trimmed = urlOrPath.trim();
  if (!trimmed) return false;

  return (
    /^file:\/\//i.test(trimmed) ||
    /^\//.test(trimmed) ||
    /^[A-Za-z]:[/\\]/.test(trimmed) ||
    /^\\\\/.test(trimmed)
  );
}

/**
 * Normalizes a local path for shell/native execution by removing file:// prefix
 * and cleaning up Windows drive slashes.
 */
export function normalizeLocalPath(urlOrPath: string): string {
  let cleaned = urlOrPath.trim();
  if (/^file:\/\//i.test(cleaned)) {
    cleaned = cleaned.replace(/^file:\/\//i, '');
    // If on Windows style /C:/..., strip leading slash
    if (/^\/[A-Za-z]:[/\\]/.test(cleaned)) {
      cleaned = cleaned.slice(1);
    }
  }
  return cleaned;
}

/**
 * Opens a document link.
 * If local path:
 * - In Tauri: invokes native `open_local_path` which launches Finder / File Explorer.
 * - In Web Browser: copies path to clipboard and shows an Ant Design notice.
 * If web link (http/https):
 * - In Tauri: invokes native `open_external_url`.
 * - In Web Browser: opens via `window.open`.
 */
export async function openDocumentLink(urlOrPath: string): Promise<void> {
  const trimmed = urlOrPath.trim();
  if (!trimmed) return;

  if (isLocalPath(trimmed)) {
    const cleanPath = normalizeLocalPath(trimmed);
    if (isTauriApp()) {
      try {
        await tauriInvoke('open_local_path', { path: cleanPath });
        return;
      } catch (err: any) {
        message.error(`Không thể mở thư mục/tập tin: ${err?.message || err}`);
        return;
      }
    } else {
      // Browser environment fallback: copy to clipboard
      try {
        if (navigator?.clipboard?.writeText) {
          await navigator.clipboard.writeText(cleanPath);
          message.info(`Đã sao chép đường dẫn vào clipboard: ${cleanPath}`);
        } else {
          message.info(`Đường dẫn máy cục bộ: ${cleanPath}`);
        }
      } catch {
        message.info(`Đường dẫn máy cục bộ: ${cleanPath}`);
      }
      return;
    }
  }

  // Web URL handling
  if (/^https?:\/\//i.test(trimmed)) {
    if (isTauriApp()) {
      try {
        await tauriInvoke('open_external_url', { url: trimmed });
        return;
      } catch (err) {
        console.warn('Tauri open_external_url failed, falling back to window.open:', err);
      }
    }
    window.open(trimmed, '_blank', 'noopener,noreferrer');
    return;
  }

  // Fallback for unclassified links
  window.open(trimmed, '_blank', 'noopener,noreferrer');
}

/**
 * Invokes native directory picker dialog in Tauri desktop app.
 * Returns selected path or null if cancelled or not in Tauri.
 */
export async function browseLocalFolder(): Promise<string | null> {
  if (!isTauriApp()) {
    message.warning('Duyệt thư mục chỉ khả dụng trên ứng dụng Desktop.');
    return null;
  }

  try {
    const picked = await tauriInvoke<string | null>('select_local_folder');
    return picked ?? null;
  } catch (err: any) {
    message.error(`Không thể duyệt thư mục: ${err?.message || err}`);
    return null;
  }
}

/**
 * Invokes native file picker dialog in Tauri desktop app.
 * Returns selected path or null if cancelled or not in Tauri.
 */
export async function browseLocalFile(): Promise<string | null> {
  if (!isTauriApp()) {
    message.warning('Duyệt tập tin chỉ khả dụng trên ứng dụng Desktop.');
    return null;
  }

  try {
    const picked = await tauriInvoke<string | null>('select_local_file');
    return picked ?? null;
  } catch (err: any) {
    message.error(`Không thể duyệt tập tin: ${err?.message || err}`);
    return null;
  }
}
