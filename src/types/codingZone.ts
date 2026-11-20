/** Phase 48 D-08/D-09: real SSH remote worktree allocated to the Agent Developer session. */
export interface WorktreeDescriptor {
  sshConfigId: string;
  /** Canonical remote repo root. PROVISIONING ONLY — never a target for edit/diff/read verbs. */
  remoteRepoPath: string;
  /** Required, real remote worktree path. Every confined verb roots here. */
  remoteWorktreePath: string;
  branch: string;
  baseRef?: string | undefined;
}

import type { DiffFile } from './agent';
import type { SshConfig } from './ssh';

/** Phase 48: one shared slice mirrored between modal and popout. */
export interface CodingZoneSharedTab {
  id: string;
  filePath: string;
  kind: 'code' | 'diff';
}

export type CodingZoneHunkState = 'pending' | 'accepted' | 'rejected';

export interface CodingZoneSharedMessage {
  id: string;
  author: string;
  time: string;
  text: string;
  kind?: 'chat' | 'agent' | 'synthesis' | undefined;
}

export interface CodingZoneSharedActivity {
  id: string;
  time: string;
  label: string;
  text: string;
  kind: 'tool' | 'result' | 'status';
}

export interface CodingZoneSharedState {
  tabs: CodingZoneSharedTab[];
  activeTabId: string;
  activeFile: string | null;
  initialLine?: number | undefined;
  hunkStates: Record<string, CodingZoneHunkState>;
  treeScope: 'diff' | 'all';
  treeQuery: string;
  messages: CodingZoneSharedMessage[];
  activity: CodingZoneSharedActivity[];
  descriptor?: WorktreeDescriptor | undefined;
  sshConfig?: SshConfig | undefined;
  allFiles: string[];
  /** Real diff metadata, not pasted into URL/hash — IPC payload only. */
  diffFiles: DiffFile[];
  diffRevision: number;
  connection: ConnectionState;
  onlineCount: number;
}

/** Phase 48: model-supplied hunk data. Untrusted — only filePath/hunk text enter the patch. */
export interface CodeEditArgs {
  filePath: string;
  hunkHeader?: string | undefined;
  action: 'apply' | 'revert';
  patch?: string | undefined;
}

export interface CodeEditResult {
  ok: true;
  filePath: string;
  hunkHeader?: string | undefined;
  action: 'apply' | 'revert';
  message?: string | undefined;
}

export interface CodeEditRefusal {
  ok: false;
  code: string;
  message: string;
}

export interface CodingZoneSyncPayload {
  originWindowId: string;
  revision: number;
  kind: 'tabs' | 'activeFile' | 'hunk' | 'chat' | 'activity' | 'full' | 'request-state';
  payload: unknown;
}

export type ConnectionState =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'invalid-worktree'
  | 'session-ended';

const CONNECTION_STATES: readonly ConnectionState[] = [
  'connecting', 'connected', 'disconnected', 'invalid-worktree', 'session-ended',
];

/** WR-06: untrusted same-origin/Tauri payloads must not flow into write verbs. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function isWorktreeDescriptor(value: unknown): value is WorktreeDescriptor {
  return isRecord(value)
    && typeof value.sshConfigId === 'string' && value.sshConfigId.length > 0
    && typeof value.remoteRepoPath === 'string' && value.remoteRepoPath.length > 0
    && typeof value.remoteWorktreePath === 'string' && value.remoteWorktreePath.length > 0
    && typeof value.branch === 'string'
    && (value.baseRef === undefined || typeof value.baseRef === 'string');
}

export function isConnectionState(value: unknown): value is ConnectionState {
  return typeof value === 'string' && CONNECTION_STATES.includes(value as ConnectionState);
}

export function isDiffHunkGuard(value: unknown): boolean {
  return isRecord(value)
    && typeof value.oldStart === 'number' && typeof value.oldCount === 'number'
    && typeof value.newStart === 'number' && typeof value.newCount === 'number'
    && typeof value.header === 'string' && Array.isArray(value.lines)
    && value.lines.every((line) => isRecord(line)
      && (line.type === 'add' || line.type === 'delete' || line.type === 'context')
      && typeof line.content === 'string');
}

export function isDiffFileGuard(value: unknown): boolean {
  return isRecord(value)
    && typeof value.oldPath === 'string' && typeof value.newPath === 'string'
    && (value.status === 'modified' || value.status === 'added' || value.status === 'deleted')
    && Array.isArray(value.hunks) && value.hunks.every(isDiffHunkGuard)
    && typeof value.additions === 'number' && typeof value.deletions === 'number';
}

/** Strict guard for the `full` sync payload. Reject the whole event if any present field is malformed. */
export function isCodingZoneFullState(value: unknown): value is CodingZoneSharedState {
  if (!isRecord(value)) return false;
  if (!Array.isArray(value.tabs) || !value.tabs.every((tab) => isRecord(tab)
    && typeof tab.id === 'string' && typeof tab.filePath === 'string'
    && (tab.kind === 'code' || tab.kind === 'diff'))) return false;
  if (typeof value.activeTabId !== 'string') return false;
  if (value.activeFile !== null && typeof value.activeFile !== 'string') return false;
  if (value.initialLine !== undefined && typeof value.initialLine !== 'number') return false;
  if (!isRecord(value.hunkStates) || !Object.values(value.hunkStates).every(
    (state) => state === 'pending' || state === 'accepted' || state === 'rejected'
  )) return false;
  if (value.treeScope !== 'diff' && value.treeScope !== 'all') return false;
  if (typeof value.treeQuery !== 'string') return false;
  if (!Array.isArray(value.messages) || !value.messages.every((message) => isRecord(message)
    && typeof message.id === 'string' && typeof message.author === 'string'
    && typeof message.time === 'string' && typeof message.text === 'string')) return false;
  if (!Array.isArray(value.activity) || !value.activity.every((item) => isRecord(item)
    && typeof item.id === 'string' && typeof item.time === 'string' && typeof item.label === 'string'
    && typeof item.text === 'string'
    && (item.kind === 'tool' || item.kind === 'result' || item.kind === 'status'))) return false;
  if (!Array.isArray(value.allFiles) || !value.allFiles.every((file) => typeof file === 'string')) return false;
  if (!Array.isArray(value.diffFiles) || !value.diffFiles.every(isDiffFileGuard)) return false;
  if (typeof value.diffRevision !== 'number') return false;
  if (!isConnectionState(value.connection)) return false;
  if (typeof value.onlineCount !== 'number') return false;
  // Optional fields: reject the whole event if present but malformed.
  if (value.descriptor !== undefined && !isWorktreeDescriptor(value.descriptor)) return false;
  if (value.sshConfig !== undefined && !isRecord(value.sshConfig)) return false;
  return true;
}
