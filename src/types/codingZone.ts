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
  kind: 'tabs' | 'activeFile' | 'hunk' | 'chat' | 'activity' | 'full';
  payload: unknown;
}

export type ConnectionState =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'invalid-worktree'
  | 'session-ended';
