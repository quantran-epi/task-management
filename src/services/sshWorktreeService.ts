import { isTauriApp } from '../utils/timerPopout';
import type { SshConfig } from '../types/ssh';
import type { DiffFile, DiffHunk } from '../types/agent';
import type { WorktreeDescriptor } from '../types/codingZone';
import { shellQuote } from './ai/sshFsToolService';
import { execRemoteCommand, getSshConfigById } from './sshService';
import { parseGitDiff, formatHunkPatch } from '../utils/gitDiffParser';

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

/** Only app-owned provisioning throws carry this type; provider copy never does. */
export class LocalWorktreeError extends Error {
  readonly code = 'WORKTREE_NOT_AVAILABLE';

  constructor(message: string) {
    super(message);
    this.name = 'LocalWorktreeError';
  }
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
    throw new LocalWorktreeError(`${refusal.code}: ${refusal.message}`);
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
    throw new LocalWorktreeError('Tính năng SSH worktree chỉ hoạt động trên môi trường Desktop Tauri.');
  }
  const { invoke } = await import('@tauri-apps/api/core');
  try {
    return await invoke<WorktreeDescriptor>('ssh_worktree_provision', {
      config: params.config ?? null,
      secret: params.secret ?? null,
      remoteRepoPath: params.remoteRepoPath.trim().replace(/\/+$/, ''),
      sessionKey: params.sessionKey,
      baseRef: params.baseRef ?? null,
    });
  } catch (err) {
    // Only this app-owned boundary is allowed to classify a provisioning rejection as local
    // and truthful. Provider/MCP errors elsewhere never pass through here.
    const detail = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
    throw new LocalWorktreeError(detail || 'WORKTREE_NOT_AVAILABLE: không thể chuẩn bị worktree SSH.');
  }
}

// -------------------------------------------------------------------------------------------------
// Phase 48 confined verbs. Every command runs with cwd = desc.remoteWorktreePath and never
// touches desc.remoteRepoPath (the main checkout). Ceiling: lexical confinement here; Rust
// re-verifies with realpath + literal directory boundary on the remote. Add openat-native
// confinement only if hostile concurrent symlink swaps ever become a real threat.
// -------------------------------------------------------------------------------------------------

export class WorktreeVerbError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'WorktreeVerbError';
  }
}

/** Lexical path confinement against the worktree root ONLY. */
export function confineWorktreePath(inputPath: string, desc: WorktreeDescriptor): string {
  const root = desc.remoteWorktreePath.trim().replace(/\/+$/, '');
  const trimmed = (inputPath ?? '').trim();
  if (!trimmed || trimmed.startsWith('/') || trimmed.startsWith('~') || trimmed.includes('\0')
    || trimmed.includes('\n') || trimmed.includes('\r')) {
    throw new WorktreeVerbError('WORKTREE_PATH_ESCAPE', 'Đường dẫn tệp không hợp lệ trong worktree.');
  }
  const parts: string[] = [];
  for (const segment of trimmed.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (parts.length === 0) {
        throw new WorktreeVerbError('WORKTREE_PATH_ESCAPE', 'Đường dẫn nằm ngoài worktree.');
      }
      parts.pop();
      continue;
    }
    parts.push(segment);
  }
  const resolved = `${root}/${parts.join('/')}`;
  if (resolved === root || !resolved.startsWith(`${root}/`)) {
    throw new WorktreeVerbError('WORKTREE_PATH_ESCAPE', 'Đường dẫn nằm ngoài worktree.');
  }
  if (root === desc.remoteRepoPath.trim().replace(/\/+$/, '')) {
    throw new WorktreeVerbError('WORKTREE_PATH_ESCAPE', 'Worktree không được trỏ vào repo chính.');
  }
  return resolved;
}

async function remoteContext(desc: WorktreeDescriptor) {
  requireProvisionedWorktree(desc);
  const config = await getSshConfigById(desc.sshConfigId);
  if (!config) {
    throw new WorktreeVerbError('WORKTREE_NOT_AVAILABLE', 'Không tìm thấy SSH config của worktree.');
  }
  return config;
}

function worktreeCommand(root: string, gitArgs: string): string {
  return `cd ${shellQuote(root)} && ${gitArgs}`;
}

/** UTF-8 safe base64 that works in both the Tauri webview and Node test runners. */
function base64EncodeUtf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function runWorktreeCommand(
  desc: WorktreeDescriptor,
  args: string,
  callId?: string
): Promise<string> {
  const config = await remoteContext(desc);
  const res = await execRemoteCommand(config, worktreeCommand(desc.remoteWorktreePath, args), undefined, callId);
  if (res.exitStatus === 77) {
    throw new WorktreeVerbError('WORKTREE_PATH_ESCAPE', 'Đường dẫn symlink nằm ngoài worktree.');
  }
  if (res.exitStatus !== 0) {
    throw new WorktreeVerbError('WORKTREE_GIT_FAILED', res.stderr || 'Lệnh git worktree thất bại.');
  }
  return res.stdout ?? '';
}

export async function listWorktreeFiles(desc: WorktreeDescriptor): Promise<string[]> {
  const out = await runWorktreeCommand(desc, 'git ls-files --cached --others --exclude-standard');
  return out.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 2000);
}

/** Remote realpath boundary snippet; exit 77 = refusal, not content. */
function readSnippet(root: string, target: string): string {
  return (
    `root=$(realpath -- ${shellQuote(root)} && printf /) || exit 1; root=\${root%?}; root=\${root%?}; ` +
    `target=$(realpath -- ${shellQuote(target)} && printf /) || exit 1; target=\${target%?}; target=\${target%?}; ` +
    `case "$target" in "\${root%/}/"*) cat -- "$target" ;; *) exit 77 ;; esac`
  );
}

export async function readWorktreeFile(desc: WorktreeDescriptor, filePath: string): Promise<string> {
  const clean = confineWorktreePath(filePath, desc);
  const out = await runWorktreeCommand(desc, readSnippet(desc.remoteWorktreePath, clean));
  if (out.length > 5 * 1024 * 1024) {
    throw new WorktreeVerbError('WORKTREE_FILE_TOO_LARGE', 'Tệp worktree vượt 5MB.');
  }
  return out;
}

export async function getWorktreeDiff(desc: WorktreeDescriptor): Promise<DiffFile[]> {
  const out = await runWorktreeCommand(desc, 'git diff --no-ext-diff --unified=3');
  return parseGitDiff(out);
}

export async function applyHunk(
  desc: WorktreeDescriptor,
  filePath: string,
  hunk: DiffHunk,
  secret?: string
): Promise<void> {
  await applyPatch(desc, filePath, hunk, false, secret);
}

export async function revertHunk(
  desc: WorktreeDescriptor,
  filePath: string,
  hunk: DiffHunk,
  secret?: string
): Promise<void> {
  await applyPatch(desc, filePath, hunk, true, secret);
}

async function applyPatch(
  desc: WorktreeDescriptor,
  filePath: string,
  hunk: DiffHunk,
  reverse: boolean,
  secret?: string
): Promise<void> {
  const clean = confineWorktreePath(filePath, desc);
  const relative = clean.slice(desc.remoteWorktreePath.length + 1);
  const patch = formatHunkPatch(relative, hunk);
  // CR-01: never place untrusted patch bytes in a shell heredoc — a newline in the path or
  // hunk text would close PATCH_EOF and execute the rest as shell commands. Mirror the Rust
  // apply path: base64 over a pipe, with only base64 alphabet inside shell quotes.
  const encoded = base64EncodeUtf8(patch);
  const config = await remoteContext(desc);
  // WR-01: the diff is the working-tree change already present. "Accept" must STAGE that
  // change and commit it (mirroring agent_manager.rs accept_patch_diff); a forward
  // `git apply` against the working tree is a no-op failure. Revert stays a working-tree
  // reverse apply. `--cached` touches only the index, not the working-tree bytes.
  const args = reverse
    ? 'git apply --reverse -'
    : `git apply --recount --cached - && (git commit -m ${shellQuote('chore(coding-zone): accept hunk')} || git diff --cached --quiet)`;
  // `cd` runs in the shell first, then the pipe feeds git apply's stdin. Only base64
  // alphabet appears inside shell quotes.
  const command = worktreeCommand(desc.remoteWorktreePath, `printf %s ${shellQuote(encoded)} | base64 -d | ${args}`);
  const res = await execRemoteCommand(config, command, secret);
  if (res.exitStatus !== 0) {
    throw new WorktreeVerbError(
      'WORKTREE_APPLY_FAILED',
      `${reverse ? 'Revert' : 'Apply'} hunk thất bại: ${res.stderr || 'git apply failed'}`
    );
  }
}
