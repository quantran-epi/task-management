export interface SshFsToolConfig {
  enabled: boolean;
  /** Fixed SSH configuration ID to execute file operations on */
  sshConfigId: string;
  /** Optional base path to scope or default searches/reads to (e.g. '/var/log' or '/home/app') */
  defaultBasePath?: string;
  /** Max lines returned in a single ssh_read_file call (default: 200, max: 500) */
  maxLinesPerRead?: number;
  /** Max entries returned by ssh_list_dir (default: 100, max: 200) */
  maxListEntries?: number;
  /** Max matches returned by ssh_grep_files (default: 50, max: 100) */
  maxGrepMatches?: number;
  /** Last tested timestamp ISO string */
  lastTestedAt?: string;
  /** Last test status message */
  lastTestStatus?: string;
}

export const SSH_FS_TOOL_CONFIG_KEY = 'ssh_fs_ai_tool_config';

export interface SshListDirArgs {
  /** Remote absolute or relative path to inspect */
  path: string;
  /** If true, show hidden files starting with '.' (default: false) */
  showHidden?: boolean;
  /** Maximum number of directory entries to return (default: 100, max: 200) */
  limit?: number;
}

export interface SshReadFileArgs {
  /** Remote absolute path of the text file to read */
  path: string;
  /** 1-based line offset to start reading from (default: 1) */
  offset?: number;
  /** Number of lines to read (default: 100, max: 500) */
  limit?: number;
}

export interface SshGrepFilesArgs {
  /** Remote directory or file path to search in */
  path: string;
  /** Text or regex pattern to search for */
  pattern: string;
  /** Search recursively in subdirectories (default: false) */
  recursive?: boolean;
  /** Case-sensitive search (default: true) */
  caseSensitive?: boolean;
  /** Maximum number of matching lines to return (default: 50, max: 100) */
  limit?: number;
}

export interface SshFsToolResult {
  success: boolean;
  action: 'list_dir' | 'read_file' | 'grep_files';
  data?: unknown;
  count?: number;
  truncated?: boolean;
  error?: string;
  executionTimeMs?: number;
}
