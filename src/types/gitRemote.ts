export interface RemoteGitBranch {
  name: string;
  isRemote: boolean;
  isHead: boolean;
}

export interface RemoteGitCommit {
  sha: string;
  shortSha: string;
  author: string;
  date: string;
  message: string;
}

export interface RemoteFileStat {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
}

export interface RemoteGitStatus {
  isClean: boolean;
  uncommittedFiles: Array<{
    path: string;
    indexStatus: string;
    workingTreeStatus: string;
  }>;
}

export interface RemoteDiffSummary {
  baseBranch: string;
  targetBranch: string;
  headSha: string;
  commits: RemoteGitCommit[];
  files: RemoteFileStat[];
  totalAdditions: number;
  totalDeletions: number;
}

export interface ProjectRepoSshBinding {
  sshConfigId: string;
  remoteRepoPath: string;
  defaultBaseBranch?: string;
  updatedAt: string;
}

export interface BranchSnapshot {
  sshConfigId?: string | undefined;
  remoteRepoPath?: string | undefined;
  baseBranch?: string | undefined;
  targetBranch?: string | undefined;
  branch?: string | undefined;
  baseCommit?: string | undefined;
  headSha?: string | undefined;
  headCommit?: string | undefined;
  commitCount?: number | undefined;
  commitShas?: string[] | undefined;
  filesChangedCount?: number | undefined;
  fileStats?: RemoteFileStat[] | undefined;
  filesSummary?: RemoteFileStat[] | Record<string, unknown> | string | undefined;
  totalAdditions?: number | undefined;
  totalDeletions?: number | undefined;
  approvedAt: string;
}

