import { message, Modal, Button } from 'antd';
import { FolderOutlined, FolderOpenOutlined, CodeOutlined } from '@ant-design/icons';
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
 * Opens a local file or directory in Finder / File Explorer.
 */
export async function openLocalPathInExplorer(cleanPath: string): Promise<void> {
  if (isTauriApp()) {
    try {
      await tauriInvoke('open_local_path', { path: cleanPath });
      return;
    } catch (err: any) {
      message.error(`Không thể mở thư mục/tập tin: ${err?.message || err}`);
      return;
    }
  }

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
}

/**
 * Launches Command Prompt / Terminal with Claude Code at the given directory.
 */
export async function launchClaudeAtLocalPath(cleanPath: string): Promise<void> {
  const terminalCmd = `cd '${cleanPath.replace(/'/g, "'\\''")}' && claude`;
  if (isTauriApp()) {
    try {
      await tauriInvoke('launch_claude_at_local_path', { path: cleanPath });
      message.success('Đang mở Command Prompt chạy Claude Code...');
      return;
    } catch (err: any) {
      console.warn('Tauri launch_claude_at_local_path failed, copying command:', err);
    }
  }

  // Web Browser fallback: copy terminal command to clipboard
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(terminalCmd);
      message.success(`Đã sao chép lệnh chạy Claude Code vào clipboard: ${terminalCmd}`);
    } else {
      message.info(`Lệnh Claude Code: ${terminalCmd}`);
    }
  } catch {
    message.info(`Lệnh Claude Code: ${terminalCmd}`);
  }
}

/**
 * Prompts user to pick between opening in File Explorer or running Claude Code in terminal.
 */
export function promptLocalPathAction(cleanPath: string): Promise<void> {
  return new Promise<void>((resolve) => {
    let resolved = false;
    const safeResolve = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };

    const modal = Modal.confirm({
      title: 'Thao tác với đường dẫn cục bộ',
      icon: <FolderOutlined style={{ color: '#1677ff' }} />,
      width: 520,
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
          <div
            style={{
              wordBreak: 'break-all',
              backgroundColor: '#f5f5f5',
              padding: '8px 12px',
              borderRadius: 6,
              fontSize: 12,
              fontFamily: 'monospace',
              border: '1px solid #e8e8e8',
            }}
          >
            {cleanPath}
          </div>
          <div style={{ fontSize: 13, color: '#595959' }}>
            Chọn thao tác bạn muốn thực hiện với đường dẫn này:
          </div>
        </div>
      ),
      footer: () => (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <Button
            onClick={() => {
              modal.destroy();
              safeResolve();
            }}
          >
            Đóng
          </Button>
          <Button
            icon={<FolderOpenOutlined />}
            onClick={async () => {
              modal.destroy();
              await openLocalPathInExplorer(cleanPath);
              safeResolve();
            }}
          >
            Mở File Explorer
          </Button>
          <Button
            type="primary"
            icon={<CodeOutlined />}
            onClick={async () => {
              modal.destroy();
              await launchClaudeAtLocalPath(cleanPath);
              safeResolve();
            }}
          >
            Mở Claude Code
          </Button>
        </div>
      ),
      onCancel: () => safeResolve(),
    });
  });
}

export interface OpenDocumentLinkOptions {
  quickClaude?: boolean;
}

/**
 * Opens a document link.
 * If local path:
 * - If quickClaude option is true (e.g. Alt+Click): directly launches Claude Code in terminal.
 * - Otherwise: prompts user to choose File Explorer or Claude Code in terminal.
 * If web link (http/https):
 * - In Tauri: invokes native `open_external_url`.
 * - In Web Browser: opens via `window.open`.
 */
export async function openDocumentLink(
  urlOrPath: string,
  options?: OpenDocumentLinkOptions
): Promise<void> {
  const trimmed = urlOrPath.trim();
  if (!trimmed) return;

  if (isLocalPath(trimmed)) {
    const cleanPath = normalizeLocalPath(trimmed);
    if (options?.quickClaude) {
      await launchClaudeAtLocalPath(cleanPath);
    } else {
      await promptLocalPathAction(cleanPath);
    }
    return;
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
