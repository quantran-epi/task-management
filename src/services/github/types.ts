import type { BackupEnvelope } from '../../types/backup';

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

export interface PullBackupResult {
  payload: BackupEnvelope;
  remoteSha: string;
  exportedAt: string;
  rawEncryptedJson: string;
}

export type SyncStatus = 'idle' | 'testing' | 'pushing' | 'pulling' | 'conflict' | 'error';
