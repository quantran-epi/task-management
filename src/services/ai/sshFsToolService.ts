import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import {
  type SshFsToolConfig,
  type SshListDirArgs,
  type SshReadFileArgs,
  type SshGrepFilesArgs,
  type SshFsToolResult,
  type RemoteToolTarget,
  SSH_FS_TOOL_CONFIG_KEY,
} from '../../types/sshFsTool';
import {
  getSshConfigById,
  listRemoteDir,
  readRemoteFileSlice,
  execRemoteCommand,
  testSshConnection,
} from '../sshService';
import type { SshConfig } from '../../types/ssh';

const KNOWN_BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'ico',
  'pdf', 'zip', 'tar', 'gz', 'bz2', '7z', 'xz', 'rar',
  'exe', 'dll', 'so', 'dylib', 'bin', 'iso', 'dmg',
  'mp3', 'mp4', 'wav', 'avi', 'mov', 'mkv',
  'woff', 'woff2', 'ttf', 'eot',
  'class', 'pyc', 'o', 'obj',
]);

export function isLikelyBinaryPath(filePath: string): boolean {
  const parts = filePath.toLowerCase().split('.');
  if (parts.length <= 1) return false;
  const ext = parts[parts.length - 1];
  return KNOWN_BINARY_EXTENSIONS.has(ext || '');
}

/** Escape a string for safe usage inside single-quoted shell command */
export function shellQuote(str: string): string {
  return `'${str.replace(/'/g, `'\\''`)}'`;
}

/** Retrieve persisted SSH File System Tool Configuration */
export async function getSshFsToolConfig(
  db: TaskPlannerDatabase = defaultDb,
): Promise<SshFsToolConfig | null> {
  const record = await db.settings.get(SSH_FS_TOOL_CONFIG_KEY);
  if (!record || typeof record.value !== 'object') {
    return null;
  }
  return record.value as SshFsToolConfig;
}

/** Save SSH File System Tool Configuration */
export async function saveSshFsToolConfig(
  config: SshFsToolConfig,
  db: TaskPlannerDatabase = defaultDb,
): Promise<void> {
  await db.settings.put({
    key: SSH_FS_TOOL_CONFIG_KEY,
    value: config,
  });
}

/**
 * Helper to validate config and retrieve the corresponding SshConfig.
 *
 * Phase 47 D-13 (ASVS V4): when a remote chat scope supplies an explicit target, its
 * `sshConfigId` WINS over the global config and there is no fallback to another host or the
 * global id. The global config still supplies `defaultBasePath`/caps when present, but a remote
 * turn works with no global config at all (Pitfall 6) — only the target's identity is required.
 * Escaping, path confinement and all caps applied by callers stay unchanged.
 */
async function resolveSshConfig(
  db: TaskPlannerDatabase,
  remoteTarget?: RemoteToolTarget,
): Promise<{ fsConfig: SshFsToolConfig; sshConfig: SshConfig }> {
  const persisted = await getSshFsToolConfig(db);
  const configId = remoteTarget?.sshConfigId || persisted?.sshConfigId || '';
  if (!configId) {
    throw new Error(
      remoteTarget
        ? 'Remote target không có SSH Host hợp lệ.'
        : 'Chưa cấu hình SSH Host cho công cụ SSH File System. Vui lòng chọn một kết nối SSH trong Settings.',
    );
  }

  // The scope target is identity-only (no base path/caps). When a target is active we do NOT
  // inherit the global config's sshConfigId, but its base path/caps stay as tuning defaults.
  const fsConfig: SshFsToolConfig = persisted
    ? { ...persisted, sshConfigId: configId }
    : { sshConfigId: configId };

  const sshConfig = await getSshConfigById(configId, db);
  if (!sshConfig) {
    throw new Error(
      `Không tìm thấy cấu hình SSH với ID: "${configId}". Có thể kết nối này đã bị xoá.`,
    );
  }

  return { fsConfig, sshConfig };
}

/** Normalize remote path taking defaultBasePath into account */
export function resolveRemotePath(inputPath: string, basePath?: string): string {
  const trimmed = (inputPath || '').trim();
  if (!trimmed || trimmed === '.' || trimmed === './') {
    return basePath && basePath.trim().length > 0 ? basePath.trim() : '.';
  }
  if (trimmed.startsWith('/') || trimmed.startsWith('~')) {
    return trimmed;
  }
  if (basePath && basePath.trim().length > 0) {
    const cleanBase = basePath.trim().replace(/\/+$/, '');
    return `${cleanBase}/${trimmed}`;
  }
  return trimmed;
}

/** Lexically normalize a POSIX path. Browser renderer has no node:path module. */
function normalizePosixPath(path: string): string {
  const absolute = path.startsWith('/');
  const parts: string[] = [];
  for (const segment of path.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (parts.length === 0) {
        throw new Error('Đường dẫn nằm ngoài repo của remote target.');
      }
      parts.pop();
      continue;
    }
    parts.push(segment);
  }
  return `${absolute ? '/' : ''}${parts.join('/')}` || '.';
}

/**
 * Phase 47 review WR-01/CR-01: an explicit remote target must confine SSH FS reads to its repo path.
 * Paths are lexically normalized BEFORE the containment check and the normalized path is what
 * reaches SSH, so `..` cannot escape the repo on the remote host. The global config remains
 * host-wide for legacy callers; only remote chat turns are confined.
 */
export function resolveRemoteToolPath(
  inputPath: string,
  defaultBasePath: string | undefined,
  remoteTarget: RemoteToolTarget | undefined,
): string {
  const repoPath = remoteTarget?.repoPath?.trim();
  if (!repoPath) {
    return resolveRemotePath(inputPath, defaultBasePath);
  }

  const trimmed = (inputPath || '').trim();
  if (trimmed.startsWith('~')) {
    throw new Error('Đường dẫn "~" không được phép khi công cụ SSH đang gắn với một repo cụ thể.');
  }

  const normalizedRepo = normalizePosixPath(repoPath);
  const resolved = normalizePosixPath(resolveRemotePath(trimmed, normalizedRepo));
  if (normalizedRepo === '/' && resolved.startsWith('/')) return resolved;
  if (resolved === normalizedRepo || resolved.startsWith(`${normalizedRepo}/`)) {
    return resolved;
  }
  throw new Error(`Đường dẫn "${trimmed}" nằm ngoài repo của remote target.`);
}

/**
 * Execute ssh_list_dir tool call
 */
export async function executeSshListDir(
  args: SshListDirArgs,
  db: TaskPlannerDatabase = defaultDb,
  remoteTarget?: RemoteToolTarget,
): Promise<string> {
  const start = performance.now();
  try {
    const { fsConfig, sshConfig } = await resolveSshConfig(db, remoteTarget);
    const targetPath = resolveRemoteToolPath(args.path, fsConfig.defaultBasePath, remoteTarget);

    const rawFiles = await listRemoteDir(sshConfig, targetPath);

    const showHidden = Boolean(args.showHidden);
    const filtered = rawFiles.filter((f) => {
      if (!showHidden && f.name.startsWith('.') && f.name !== '.' && f.name !== '..') {
        return false;
      }
      return true;
    });

    // Directories first, then alphabetical
    filtered.sort((a, b) => {
      if (a.isDir !== b.isDir) {
        return a.isDir ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    const maxLimit = Math.min(
      Math.max(1, Number(args.limit) || fsConfig.maxListEntries || 100),
      200,
    );

    const isTruncated = filtered.length > maxLimit;
    const subset = filtered.slice(0, maxLimit).map((item) => ({
      name: item.name,
      path: item.path,
      isDir: item.isDir,
      isSymlink: item.isSymlink,
      sizeBytes: item.size,
      modified: item.modified ? new Date(item.modified * 1000).toISOString() : null,
      permissions: item.permissions ? `0${(item.permissions & 0o777).toString(8)}` : null,
    }));

    const result: SshFsToolResult = {
      success: true,
      action: 'list_dir',
      count: subset.length,
      truncated: isTruncated,
      executionTimeMs: Math.round(performance.now() - start),
      data: {
        queriedPath: targetPath,
        totalEntriesFound: filtered.length,
        returnedEntries: subset.length,
        entries: subset,
      },
    };

    return JSON.stringify(result);
  } catch (err: any) {
    const result: SshFsToolResult = {
      success: false,
      action: 'list_dir',
      error: err?.message || String(err),
      executionTimeMs: Math.round(performance.now() - start),
    };
    return JSON.stringify(result);
  }
}

/**
 * Execute ssh_read_file_page tool call
 */
export async function executeSshReadFile(
  args: SshReadFileArgs,
  db: TaskPlannerDatabase = defaultDb,
  remoteTarget?: RemoteToolTarget,
): Promise<string> {
  const start = performance.now();
  try {
    if (!args.path || !args.path.trim()) {
      throw new Error('Tham số "path" không được để trống.');
    }

    const { fsConfig, sshConfig } = await resolveSshConfig(db, remoteTarget);
    const targetPath = resolveRemoteToolPath(args.path, fsConfig.defaultBasePath, remoteTarget);

    if (isLikelyBinaryPath(targetPath)) {
      throw new Error(
        `Không thể đọc file nhị phân: "${targetPath}". Tool này chỉ hỗ trợ các file văn bản (text/code/config/logs).`,
      );
    }

    const offset = Math.max(1, Number(args.offset) || 1);
    const limit = Math.min(
      Math.max(1, Number(args.limit) || fsConfig.maxLinesPerRead || 100),
      500,
    );

    // Call sshService slice reader
    const slice = await readRemoteFileSlice(sshConfig, targetPath, offset, limit);

    const formattedLines = slice.lines.map((line, idx) => `${offset + idx}: ${line}`);

    const result: SshFsToolResult = {
      success: true,
      action: 'read_file',
      count: slice.lines.length,
      truncated: slice.hasMore,
      executionTimeMs: Math.round(performance.now() - start),
      data: {
        path: targetPath,
        offset,
        limit,
        returnedLines: slice.lines.length,
        totalLines: slice.totalLines,
        hasMore: slice.hasMore,
        content: formattedLines.join('\n'),
      },
    };

    return JSON.stringify(result);
  } catch (err: any) {
    const result: SshFsToolResult = {
      success: false,
      action: 'read_file',
      error: err?.message || String(err),
      executionTimeMs: Math.round(performance.now() - start),
    };
    return JSON.stringify(result);
  }
}

/**
 * Execute ssh_grep_files tool call
 */
export async function executeSshGrepFiles(
  args: SshGrepFilesArgs,
  db: TaskPlannerDatabase = defaultDb,
  callId?: string,
  remoteTarget?: RemoteToolTarget,
): Promise<string> {
  const start = performance.now();
  try {
    if (!args.path || !args.path.trim()) {
      throw new Error('Tham số "path" không được để trống.');
    }
    if (!args.pattern || !args.pattern.trim()) {
      throw new Error('Tham số "pattern" không được để trống.');
    }

    const { fsConfig, sshConfig } = await resolveSshConfig(db, remoteTarget);
    const targetPath = resolveRemoteToolPath(args.path, fsConfig.defaultBasePath, remoteTarget);

    const limit = Math.min(
      Math.max(1, Number(args.limit) || fsConfig.maxGrepMatches || 50),
      100,
    );

    // Construct read-only grep command
    const isRecursive = Boolean(args.recursive);
    const caseSensitive = args.caseSensitive !== false;

    const flags: string[] = ['-n', '-I', '-s'];
    if (isRecursive) flags.push('-r');
    if (!caseSensitive) flags.push('-i');

    const quotedPattern = shellQuote(args.pattern);
    const quotedPath = shellQuote(targetPath);

    // Command piped to head to strictly prevent overwhelming buffer/network
    const command = `grep ${flags.join(' ')} -- ${quotedPattern} ${quotedPath} | head -n ${limit + 1}`;

    const output = await execRemoteCommand(sshConfig, command, undefined, callId);

    if (output.exitStatus !== 0 && output.exitStatus !== 1) {
      throw new Error(
        output.stderr.trim() || `Lệnh grep thất bại với mã lỗi ${output.exitStatus}`,
      );
    }

    const rawLines = output.stdout.split('\n').filter((l) => l.trim().length > 0);
    const isTruncated = rawLines.length > limit;
    const matches = rawLines.slice(0, limit).map((line) => {
      // Format from grep -n: [filename:]lineNumber:content
      const match = line.match(/^(?:(.*?):)?(\d+):(.*)$/);
      if (match) {
        return {
          file: match[1] || targetPath,
          line: parseInt(match[2] || '0', 10),
          text: match[3] || '',
        };
      }
      return { file: targetPath, line: 0, text: line };
    });

    const result: SshFsToolResult = {
      success: true,
      action: 'grep_files',
      count: matches.length,
      truncated: isTruncated,
      executionTimeMs: Math.round(performance.now() - start),
      data: {
        path: targetPath,
        pattern: args.pattern,
        recursive: isRecursive,
        matches,
      },
    };

    return JSON.stringify(result);
  } catch (err: any) {
    const result: SshFsToolResult = {
      success: false,
      action: 'grep_files',
      error: err?.message || String(err),
      executionTimeMs: Math.round(performance.now() - start),
    };
    return JSON.stringify(result);
  }
}

/** Test SSH connection for FS tool */
export async function testSshFsConnection(
  db: TaskPlannerDatabase = defaultDb,
): Promise<{ success: boolean; message: string }> {
  try {
    const { fsConfig, sshConfig } = await resolveSshConfig(db);
    const testResult = await testSshConnection(sshConfig);

    const now = new Date().toISOString();
    await saveSshFsToolConfig(
      {
        ...fsConfig,
        lastTestedAt: now,
        lastTestStatus: `Thành công: ${testResult}`,
      },
      db,
    );

    return {
      success: true,
      message: `Kết nối thành công tới ${sshConfig.username}@${sshConfig.host}:${sshConfig.port}: ${testResult}`,
    };
  } catch (err: any) {
    const errorMsg = err?.message || String(err);
    const fsConfig = await getSshFsToolConfig(db);
    if (fsConfig) {
      await saveSshFsToolConfig(
        {
          ...fsConfig,
          lastTestedAt: new Date().toISOString(),
          lastTestStatus: `Lỗi: ${errorMsg}`,
        },
        db,
      );
    }
    return {
      success: false,
      message: `Lỗi kết nối: ${errorMsg}`,
    };
  }
}
