export type SshAuthType = 'password' | 'key_file' | 'agent';

export interface SshConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: SshAuthType;
  keyPath?: string | undefined;
  defaultRemotePath?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface RemoteFileInfo {
  name: string;
  path: string;
  isDir: boolean;
  isSymlink: boolean;
  size: number;
  modified: number;
  permissions?: number | undefined;
}

export interface RemoteFileSliceResult {
  lines: string[];
  totalLines: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export interface CommandOutput {
  stdout: string;
  stderr: string;
  exitStatus: number;
}

export const SSH_CONFIGS_SETTING_KEY = 'ssh_configurations';
