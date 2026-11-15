import { execRemoteCommand } from './sshService';
import type { SshConfig } from '../types/ssh';
import type {
  RemoteGitBranch,
  RemoteGitCommit,
  RemoteFileStat,
  RemoteGitStatus,
  RemoteDiffSummary,
} from '../types/gitRemote';

/**
 * Canonical POSIX single-quote escape. Security-critical: every user/AI-derived string
 * that reaches a remote shell goes through this. Kept in one place so a fix reaches all
 * callers (research, git, change-pack, claude CLI).
 *
 * Ceiling: this protects the SHELL only. Git still parses any argv element beginning with
 * `-` as an option, so `git log '--output=/path'` truncates that file even though the value
 * was escaped. Every revision-shaped argument therefore also goes through `--end-of-options`
 * (CR-01), and the `git_read` handler refuses a leading `-` before it gets here.
 */
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
    ['for-each-ref', escapeShellArg('--format=%(refname:short)%00%(refname)'), 'refs/heads/', 'refs/remotes/origin/'],
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
  // WR-03: `-z` emits unquoted, NUL-separated paths, so a path with spaces or a rename no
  // longer arrives quoted (`"a b.txt"`) or arrow-joined (`a -> b`). A rename record is
  // `XY <new>\0<old>\0`; the new path is the one that exists now.
  const output = await runGitCommand(config, repoPath, ['status', '--porcelain=v1', '-z'], secret);
  const tokens = output.split('\0').filter((t) => t.length > 0);

  const uncommittedFiles: RemoteGitStatus['uncommittedFiles'] = [];
  for (let i = 0; i < tokens.length; i++) {
    const entry = tokens[i]!;
    if (entry.length < 4) continue;
    const indexStatus = entry.charAt(0);
    const workingTreeStatus = entry.charAt(1);
    const path = entry.slice(3);
    // A rename/copy carries its source as the next token; skip it so it is not read as a path.
    if (indexStatus === 'R' || indexStatus === 'C') i += 1;
    uncommittedFiles.push({ path, indexStatus, workingTreeStatus });
  }

  return {
    isClean: uncommittedFiles.length === 0,
    uncommittedFiles,
  };
}

/** Shared `%x1e`-separated, `%x00`-fielded record parser for every `git log` caller. */
function parseCommitLog(output: string): RemoteGitCommit[] {
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

export async function getCommitLog(
  config: SshConfig,
  repoPath: string,
  base: string,
  target: string,
  secret?: string
): Promise<RemoteGitCommit[]> {
  const rangeArg = escapeShellArg(`${base}..${target}`);
  const output = await runGitCommand(
    config,
    repoPath,
    // CR-01: options first, revision after `--end-of-options`. Without the terminator a
    // range beginning with `-` (e.g. `--output=/path..main`) is parsed as a git option.
    ['log', "--format='%x1e%H%x00%h%x00%an%x00%ad%x00%s'", '--date=iso', '--end-of-options', rangeArg],
    secret
  );
  return parseCommitLog(output);
}

/**
 * Last `limit` commits of one branch. `getCommitLog` builds a `base..target` range, which
 * cannot express this: `branch..branch` is empty and `branch~N` fails on a short branch.
 */
export async function getRecentCommits(
  config: SshConfig,
  repoPath: string,
  branch: string,
  limit: number,
  secret?: string
): Promise<RemoteGitCommit[]> {
  const output = await runGitCommand(
    config,
    repoPath,
    [
      'log',
      '-n',
      String(limit),
      "--format='%x1e%H%x00%h%x00%an%x00%ad%x00%s'",
      '--date=iso',
      // CR-01: every option precedes the terminator; the branch is a revision, never an option.
      '--end-of-options',
      escapeShellArg(branch),
    ],
    secret
  );
  return parseCommitLog(output);
}

export async function getDiffSummary(
  config: SshConfig,
  repoPath: string,
  base: string,
  target: string,
  secret?: string
): Promise<RemoteDiffSummary> {
  const rangeArg = escapeShellArg(`${base}..${target}`);

  // Get target branch HEAD sha. `--verify` is required: plain `rev-parse` echoes the literal
  // `--end-of-options` back as a revision (CR-01).
  const headShaOut = await runGitCommand(
    config,
    repoPath,
    ['rev-parse', '--verify', '--end-of-options', escapeShellArg(target)],
    secret
  );
  const headSha = headShaOut.trim();

  // Get commit list
  const commits = await getCommitLog(config, repoPath, base, target, secret);

  // WR-12: `--no-ext-diff --no-textconv` so repo-local diff drivers never run on read.
  // CR-01: `--end-of-options` before the range.
  const diffFlags = ['--no-ext-diff', '--no-textconv', '--end-of-options', rangeArg];

  // Get numstat output — `-z` so a rename arrives as two NUL-separated paths, not `a => b`.
  const numstatOut = await runGitCommand(
    config,
    repoPath,
    ['diff', '--numstat', '-z', '-M', ...diffFlags],
    secret
  );

  // Get name-status output — same `-z` shape.
  const nameStatusOut = await runGitCommand(
    config,
    repoPath,
    ['diff', '--name-status', '-z', '-M', ...diffFlags],
    secret
  );

  const statusMap = new Map<string, 'added' | 'modified' | 'deleted' | 'renamed'>();
  for (const { path, status } of parseNameStatusZ(nameStatusOut)) {
    statusMap.set(path, status);
  }

  const files: RemoteFileStat[] = [];
  let totalAdditions = 0;
  let totalDeletions = 0;

  for (const { path, additions, deletions } of parseNumstatZ(numstatOut)) {
    totalAdditions += additions;
    totalDeletions += deletions;
    files.push({
      path,
      // WR-02: both sides now key on the SAME target path, so a rename is reported as
      // `renamed` instead of falling back to `modified` with an `a => b` path.
      status: statusMap.get(path) ?? 'modified',
      additions,
      deletions,
    });
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

type DiffFileStatus = 'added' | 'modified' | 'deleted' | 'renamed';

/**
 * Parses `git diff --name-status -z`: `<status>\0<path>\0`, and for a rename/copy
 * `<R100|C100>\0<old>\0<new>\0`. Returns the TARGET path, which is what exists after the diff.
 */
export function parseNameStatusZ(output: string): Array<{ path: string; status: DiffFileStatus }> {
  const tokens = output.split('\0');
  const rows: Array<{ path: string; status: DiffFileStatus }> = [];

  for (let i = 0; i < tokens.length; i++) {
    const code = tokens[i];
    if (!code) continue;
    const letter = code.charAt(0).toUpperCase();
    const isRename = letter === 'R' || letter === 'C';
    // A rename/copy consumes two path tokens; everything else consumes one.
    const path = isRename ? tokens[i + 2] : tokens[i + 1];
    i += isRename ? 2 : 1;
    if (!path) continue;

    const status: DiffFileStatus =
      letter === 'A'
        ? 'added'
        : letter === 'D'
          ? 'deleted'
          : letter === 'R'
            ? 'renamed'
            : 'modified';
    rows.push({ path, status });
  }

  return rows;
}

/**
 * Parses `git diff --numstat -z`: `<added>\t<deleted>\t<path>\0`, and for a rename
 * `<added>\t<deleted>\t\0<old>\0<new>\0` — the empty third field is what distinguishes it.
 * Returns the TARGET path so the join with `parseNameStatusZ` lands.
 */
export function parseNumstatZ(
  output: string
): Array<{ path: string; additions: number; deletions: number }> {
  const tokens = output.split('\0');
  const rows: Array<{ path: string; additions: number; deletions: number }> = [];

  for (let i = 0; i < tokens.length; i++) {
    const entry = tokens[i];
    if (!entry) continue;
    // WR-04: `-z` leaves the path verbatim, so a tab INSIDE a filename is indistinguishable from
    // a field separator. Split on the first two tabs only; the rest is the path.
    const firstTab = entry.indexOf('\t');
    const secondTab = firstTab === -1 ? -1 : entry.indexOf('\t', firstTab + 1);
    if (firstTab === -1 || secondTab === -1) continue;

    const additionsRaw = entry.slice(0, firstTab);
    const deletionsRaw = entry.slice(firstTab + 1, secondTab);

    // Binary files show '-' for added/deleted lines.
    const additions = additionsRaw === '-' ? 0 : parseInt(additionsRaw || '0', 10) || 0;
    const deletions = deletionsRaw === '-' ? 0 : parseInt(deletionsRaw || '0', 10) || 0;

    let path: string | undefined = entry.slice(secondTab + 1);
    if (!path) {
      // Rename: the paths are the next two tokens; the target is the second.
      path = tokens[i + 2];
      i += 2;
    }
    if (!path) continue;

    rows.push({ path, additions, deletions });
  }

  return rows;
}

export async function getFileDiff(
  config: SshConfig,
  repoPath: string,
  base: string,
  target: string,
  filePath: string,
  secret?: string
): Promise<string> {
  const rangeArg = escapeShellArg(`${base}..${target}`);
  return runGitCommand(
    config,
    repoPath,
    // WR-12: no repo-local diff drivers. CR-01: `--end-of-options` before the range; the
    // `--` path separator then keeps the file path a path.
    ['diff', '--no-ext-diff', '--no-textconv', '--end-of-options', rangeArg, '--', escapeShellArg(filePath)],
    secret
  );
}

export async function checkHeadDrift(
  config: SshConfig,
  repoPath: string,
  targetBranch: string,
  expectedHeadSha: string,
  secret?: string
): Promise<{ drifted: boolean; currentHeadSha: string }> {
  const stdout = await runGitCommand(
    config,
    repoPath,
    ['rev-parse', '--verify', '--end-of-options', escapeShellArg(targetBranch)],
    secret
  );
  const currentHeadSha = stdout.trim();
  return {
    drifted: currentHeadSha !== expectedHeadSha,
    currentHeadSha,
  };
}

