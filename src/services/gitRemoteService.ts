import { execRemoteCommand, getSshSecret } from './sshService';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import type { SshConfig } from '../types/ssh';
import type {
  RemoteGitBranch,
  RemoteGitCommit,
  RemoteFileStat,
  RemoteGitStatus,
  RemoteDiffSummary,
  ProjectRepoSshBinding,
} from '../types/gitRemote';

export function escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

export async function runGitCommand(
  config: SshConfig,
  repoPath: string,
  gitArgs: string[],
  secret?: string
): Promise<string> {
  const command = `git -C ${escapeShellArg(repoPath)} --no-pager ${gitArgs.join(' ')}`;
  const res = await execRemoteCommand(config, command, secret);
  if (res.exitStatus !== 0) {
    throw new Error(res.stderr.trim() || `Lệnh git thất bại với exit code ${res.exitStatus}`);
  }
  return res.stdout;
}

export async function getRemoteBranches(
  config: SshConfig,
  repoPath: string,
  secret?: string
): Promise<RemoteGitBranch[]> {
  const output = await runGitCommand(
    config,
    repoPath,
    ['for-each-ref', '--format="%(refname:short)%x00%(refname)"', 'refs/heads/', 'refs/remotes/origin/'],
    secret
  );

  const branches: RemoteGitBranch[] = [];
  const lines = output.trim().split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split('\0');
    const shortName = parts[0]?.trim() ?? '';
    const fullName = parts[1]?.trim() ?? '';

    if (!shortName || shortName === 'origin/HEAD') continue;

    const isRemote = fullName.startsWith('refs/remotes/');
    branches.push({
      name: shortName,
      isRemote,
      isHead: false,
    });
  }

  return branches;
}

export async function checkDirtyStatus(
  config: SshConfig,
  repoPath: string,
  secret?: string
): Promise<RemoteGitStatus> {
  const output = await runGitCommand(config, repoPath, ['status', '--porcelain=v1'], secret);
  const lines = output.split('\n').filter((l) => l.length > 0);

  if (lines.length === 0) {
    return {
      isClean: true,
      uncommittedFiles: [],
    };
  }

  const uncommittedFiles = lines.map((line) => {
    const indexStatus = line.charAt(0);
    const workingTreeStatus = line.charAt(1);
    const path = line.slice(3).trim();
    return {
      path,
      indexStatus,
      workingTreeStatus,
    };
  });

  return {
    isClean: false,
    uncommittedFiles,
  };
}

export async function getCommitLog(
  config: SshConfig,
  repoPath: string,
  base: string,
  target: string,
  secret?: string
): Promise<RemoteGitCommit[]> {
  const rangeArg = `"${escapeShellArg(base)}..${escapeShellArg(target)}"`;
  const output = await runGitCommand(
    config,
    repoPath,
    ['log', rangeArg, "--format='%x1e%H%x00%h%x00%an%x00%ad%x00%s'", '--date=iso'],
    secret
  );

  const commits: RemoteGitCommit[] = [];
  // Split on record separator %x1e (Record Separator)
  const rawRecords = output.split('\x1e');

  for (const record of rawRecords) {
    const trimmed = record.trim();
    if (!trimmed) continue;
    const parts = trimmed.split('\0');
    if (parts.length >= 5) {
      const sha = parts[0]?.trim() ?? '';
      const shortSha = parts[1]?.trim() ?? '';
      const author = parts[2]?.trim() ?? '';
      const date = parts[3]?.trim() ?? '';
      const message = parts.slice(4).join('\0').trim();

      if (sha) {
        commits.push({
          sha,
          shortSha,
          author,
          date,
          message,
        });
      }
    }
  }

  return commits;
}

export async function getDiffSummary(
  config: SshConfig,
  repoPath: string,
  base: string,
  target: string,
  secret?: string
): Promise<RemoteDiffSummary> {
  const rangeArg = `"${escapeShellArg(base)}..${escapeShellArg(target)}"`;

  // Get target branch HEAD sha
  const headShaOut = await runGitCommand(
    config,
    repoPath,
    ['rev-parse', escapeShellArg(target)],
    secret
  );
  const headSha = headShaOut.trim();

  // Get commit list
  const commits = await getCommitLog(config, repoPath, base, target, secret);

  // Get numstat output: <added>\t<deleted>\t<path>
  const numstatOut = await runGitCommand(
    config,
    repoPath,
    ['diff', '--numstat', rangeArg],
    secret
  );

  // Get name-status output: <status>\t<path>
  const nameStatusOut = await runGitCommand(
    config,
    repoPath,
    ['diff', '--name-status', rangeArg],
    secret
  );

  const statusMap = new Map<string, 'added' | 'modified' | 'deleted' | 'renamed'>();
  for (const line of nameStatusOut.split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    const statusCode = parts[0]?.charAt(0).toUpperCase();
    // For renames, target path is the second filename
    const filePath = parts.length > 2 ? parts[2]?.trim() : parts[1]?.trim();
    if (!filePath) continue;

    let status: 'added' | 'modified' | 'deleted' | 'renamed' = 'modified';
    if (statusCode === 'A') status = 'added';
    else if (statusCode === 'D') status = 'deleted';
    else if (statusCode === 'R') status = 'renamed';

    statusMap.set(filePath, status);
  }

  const files: RemoteFileStat[] = [];
  let totalAdditions = 0;
  let totalDeletions = 0;

  for (const line of numstatOut.split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    if (parts.length >= 3) {
      const addedStr = parts[0]?.trim();
      const deletedStr = parts[1]?.trim();
      const filePath = parts[2]?.trim() ?? '';

      // Binary files show '-' for added/deleted lines
      const additions = addedStr === '-' ? 0 : parseInt(addedStr || '0', 10) || 0;
      const deletions = deletedStr === '-' ? 0 : parseInt(deletedStr || '0', 10) || 0;

      totalAdditions += additions;
      totalDeletions += deletions;

      const fileStatus = statusMap.get(filePath) ?? 'modified';

      files.push({
        path: filePath,
        status: fileStatus,
        additions,
        deletions,
      });
    }
  }

  return {
    baseBranch: base,
    targetBranch: target,
    headSha,
    commits,
    files,
    totalAdditions,
    totalDeletions,
  };
}

export async function getFileDiff(
  config: SshConfig,
  repoPath: string,
  base: string,
  target: string,
  filePath: string,
  secret?: string
): Promise<string> {
  const rangeArg = `"${escapeShellArg(base)}..${escapeShellArg(target)}"`;
  return runGitCommand(
    config,
    repoPath,
    ['diff', rangeArg, '--', escapeShellArg(filePath)],
    secret
  );
}
