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
  sshConfigId?: string;
  remoteRepoPath?: string;
  baseBranch?: string;
  targetBranch?: string;
  branch?: string;
  baseCommit?: string;
  headSha?: string;
  headCommit?: string;
  commitCount?: number;
  commitShas?: string[];
  filesChangedCount?: number;
  fileStats?: RemoteFileStat[];
  filesSummary?: RemoteFileStat[] | unknown;
  totalAdditions?: number;
  totalDeletions?: number;
  approvedAt: string;
}

