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
