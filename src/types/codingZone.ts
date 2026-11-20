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
