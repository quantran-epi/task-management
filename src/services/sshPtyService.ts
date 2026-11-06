import { isTauriApp } from '../utils/timerPopout';
import { getSshSecret } from './sshService';
import type { PtySessionConfig } from '../types/sshPty';

/**
 * Starts a native SSH PTY streaming session in Tauri backend.
 */
export async function startPtySession(params: PtySessionConfig): Promise<string> {
  if (!isTauriApp()) {
    // Non-tauri mock fallback for browser/development
    return params.sessionId;
  }

  let effectiveSecret = params.secret;
  if (effectiveSecret === undefined) {
    const stored = await getSshSecret(params.config.id);
    if (stored) {
      effectiveSecret = stored;
    }
  }

  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<string>('ssh_pty_start', {
    config: params.config,
    secret: effectiveSecret ?? null,
    sessionId: params.sessionId,
    workingDir: params.workingDir ?? null,
    cols: params.cols,
    rows: params.rows,
  });
}

/**
 * Sends user keyboard input or paste text into the SSH PTY stdin stream.
 */
export async function writePtyInput(sessionId: string, data: string): Promise<void> {
  if (!isTauriApp()) {
    return;
  }

  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<void>('ssh_pty_write', {
    sessionId,
    data,
  });
}

/**
 * Resizes the remote SSH PTY terminal window (columns and rows).
 */
export async function resizePty(sessionId: string, cols: number, rows: number): Promise<void> {
  if (!isTauriApp()) {
    return;
  }

  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<void>('ssh_pty_resize', {
    sessionId,
    cols,
    rows,
  });
}

/**
 * Closes the active SSH PTY session and releases native resources.
 */
export async function closePtySession(sessionId: string): Promise<void> {
  if (!isTauriApp()) {
    return;
  }

  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<void>('ssh_pty_close', {
    sessionId,
  });
}

/**
 * Subscribes to stdout/stderr data events emitted by Tauri PTY reader.
 * Returns an unlisten function.
 */
export async function subscribePtyData(
  sessionId: string,
  callback: (data: string) => void
): Promise<() => void> {
  if (!isTauriApp()) {
    return () => {};
  }

  const { listen } = await import('@tauri-apps/api/event');
  const unlisten = await listen<string>(`ssh-pty:data:${sessionId}`, (event) => {
    callback(event.payload);
  });
  return unlisten;
}

/**
 * Subscribes to session exit/EOF events emitted when remote shell terminates.
 * Returns an unlisten function.
 */
export async function subscribePtyExit(
  sessionId: string,
  callback: () => void
): Promise<() => void> {
  if (!isTauriApp()) {
    return () => {};
  }

  const { listen } = await import('@tauri-apps/api/event');
  const unlisten = await listen<void>(`ssh-pty:exit:${sessionId}`, () => {
    callback();
  });
  return unlisten;
}
