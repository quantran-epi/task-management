export type AgentRole = 'master' | 'worker';

export type AgentStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'awaiting_approval'
  | 'done'
  | 'error'
  | 'interrupted';

export type DiffViewMode = 'unified' | 'split';

export interface WorkerSession {
  workerId: string;
  role: string;
  pid: number;
  model: string;
  status: AgentStatus;
  subtaskPrompt: string;
  startedAt: string;
}

export interface AgentSession {
  taskId: string;
  taskTitle: string;
  repoPath: string;
  worktreePath: string;
  branchName: string;
  masterPid: number;
  masterModel: string;
  workerModel: string;
  status: AgentStatus;
  startedAt: string;
  finishedAt?: string;
  activeWorkers: WorkerSession[];
}

export interface GhostDevStreamChunk {
  taskId: string;
  workerId?: string;
  source: 'master' | 'worker';
  timestamp: string;
  type: 'log' | 'tool_call' | 'tool_result' | 'error' | 'status_change';
  content: string;
}

export interface ShellPermissionRequest {
  taskId: string;
  command: string;
  workingDir: string;
  requestId: string;
}

export interface DiffLine {
  type: 'add' | 'delete' | 'context';
  oldLineNumber?: number;
  newLineNumber?: number;
  content: string;
}

export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  header: string;
  lines: DiffLine[];
}

export interface DiffFile {
  oldPath: string;
  newPath: string;
  status: 'modified' | 'added' | 'deleted';
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
}
