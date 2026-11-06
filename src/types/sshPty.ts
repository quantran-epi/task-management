import type { SshConfig } from './ssh';

export interface PtySessionConfig {
  sessionId: string;
  config: SshConfig;
  secret?: string;
  workingDir?: string;
  cols: number;
  rows: number;
}

export interface PtyResizePayload {
  sessionId: string;
  cols: number;
  rows: number;
}

export type PtySessionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';
