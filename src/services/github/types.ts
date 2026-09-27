export interface GitHubConfig {
  owner: string;
  repo: string;
  branch: string;
}

export interface RemoteFileMetadata {
  exists: boolean;
  sha?: string;
  size?: number;
  contentBase64?: string;
  lastModified?: string;
}

export interface UploadBackupResult {
  sha: string;
  commitSha: string;
  exportedAt: string;
}

export type SyncStatus = 'idle' | 'testing' | 'pushing' | 'pulling' | 'conflict' | 'error';
