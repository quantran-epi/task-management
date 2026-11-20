import { isTauriApp } from '../utils/timerPopout';
import type { SshConfig } from '../types/ssh';
import type { WorktreeDescriptor } from '../types/codingZone';

const SAFE_ID_RE = /[^A-Za-z0-9_-]/g;
const SAFE_ID_MAX = 40;

function safeSessionId(sessionKey: string): string {
  return sessionKey.replace(SAFE_ID_RE, '-').slice(0, SAFE_ID_MAX);
}

/** Deterministic worktree path. Remote repo root is never the target of an edit verb. */
export function deriveRemoteWorktreePath(remoteRepoPath: string, sessionKey: string): string {
  const root = remoteRepoPath.trim().replace(/\/+$/, '');
  return `${root}/.taskmate-worktrees/agent-developer-${safeSessionId(sessionKey)}`;
}

export function deriveWorktreeBranch(sessionKey: string): string {
  return `taskmate/agent-developer-${safeSessionId(sessionKey)}`;
}

export function worktreeUnavailableRefusal(): { code: string; message: string } {
  return {
    code: 'WORKTREE_NOT_AVAILABLE',
    message: 'Agent Developer chưa có SSH worktree hợp lệ. Phiên không được kích hoạt.',
  };
}

/**
 * Session-start gate. A session is never active without a provisioned descriptor; no verb
 * may run before this passes. Throws the truthful refusal instead of falling back to a
 * main-checkout path.
 */
export function requireProvisionedWorktree(
  descriptor: WorktreeDescriptor | undefined
): WorktreeDescriptor {
  if (!descriptor?.remoteWorktreePath || !descriptor.sshConfigId) {
    const refusal = worktreeUnavailableRefusal();
    throw new Error(`${refusal.code}: ${refusal.message}`);
  }
  return descriptor;
}

export interface ProvisionWorktreeParams {
  sshConfigId: string;
  remoteRepoPath: string;
  sessionKey: string;
  baseRef?: string | undefined;
  secret?: string | undefined;
  /** Resolved from request-bound context; no model-supplied config is ever fetched here. */
  config?: SshConfig | undefined;
}

/**
 * Session-start owner of the real remote worktree. `ssh_worktree_provision` does the remote
 * git worktree add/list and realpath verification; this layer only derives deterministic
 * inputs. No local fs, no synthetic ssh:// path, no model-supplied path.
 */
export async function provisionWorktree(params: ProvisionWorktreeParams): Promise<WorktreeDescriptor> {
  if (!isTauriApp()) {
    throw new Error('Tính năng SSH worktree chỉ hoạt động trên môi trường Desktop Tauri.');
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<WorktreeDescriptor>('ssh_worktree_provision', {
    config: params.config ?? null,
    secret: params.secret ?? null,
    remoteRepoPath: params.remoteRepoPath.trim().replace(/\/+$/, ''),
    sessionKey: params.sessionKey,
    baseRef: params.baseRef ?? null,
  });
}
