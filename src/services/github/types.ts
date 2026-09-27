export interface GitHubConfig {
  owner: string;
  repo: string;
  branch: string;
}

export interface RemoteFileMetadata {
  exists: boolean;
  sha?: string | undefined;
  size?: number | undefined;
  contentBase64?: string | undefined;
  lastModified?: string | undefined;
}

export interface UploadBackupResult {
  sha: string;
  commitSha: string;
  exportedAt: string;
}

export type SyncStatus = 'idle' | 'testing' | 'pushing' | 'pulling' | 'conflict' | 'error';
