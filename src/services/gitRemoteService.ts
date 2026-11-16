import { execRemoteCommand } from './sshService';
import type { SshConfig } from '../types/ssh';
import type {
  RemoteGitBranch,
  RemoteGitCommit,
  RemoteFileStat,
  RemoteGitStatus,
  RemoteDiffSummary,
  RemoteGrepHit,
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
  // Read commands must never execute a repository-configured fsmonitor hook.
  const command = `git -C ${escapeShellArg(repoPath)} -c core.fsmonitor=false --no-pager ${gitArgs.join(' ')}`;
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
    // `--literal-pathspecs` also prevents glob/magic expansion of a single filename.
    ['--literal-pathspecs', 'diff', '--no-ext-diff', '--no-textconv', '--end-of-options', rangeArg, '--', escapeShellArg(filePath)],
    secret
  );
}

export interface GrepRemoteRefOptions {
  pattern: string;
  /** Single repo-relative path or directory. Absent = whole tree. */
  path?: string | undefined;
  caseSensitive?: boolean | undefined;
  /** Default 50, clamped 1..200. */
  limit?: number | undefined;
  /** Literal string match (`-F`) instead of a basic regex. Default false. */
  literal?: boolean | undefined;
}

/** Shell-side byte cap; a broad pattern must not stream megabytes into the turn. */
const GREP_BYTE_CAP = 262144;

/**
 * `git grep` over a ref. Not `runGitCommand`: git grep exits **1** for "no matches", which is a
 * valid empty result, and the `head -c` cap makes the pipeline's own exit status useless. So the
 * git exit code is reported out-of-band on stderr (`###EXIT <n>`) and stdout stays a pure
 * `path\0line\0content\n` record stream.
 */
export async function grepRemoteRef(
  config: SshConfig,
  repoPath: string,
  ref: string,
  options: GrepRemoteRefOptions,
  secret?: string
): Promise<{ hits: RemoteGrepHit[]; truncated: boolean }> {
  const limit = Math.min(Math.max(1, Math.floor(Number(options.limit)) || 50), 200);
  const flags = ['-z', '-n', '-I', '--no-color'];
  if (options.literal) flags.push('-F');
  flags.push(options.caseSensitive === false ? '-i' : '--no-ignore-case');

  const parts = [
    `git -C ${escapeShellArg(repoPath)} -c core.fsmonitor=false --no-pager grep ${flags.join(' ')}`,
    // `-e` so a pattern beginning with `-` is a pattern, never an option.
    `-e ${escapeShellArg(options.pattern)}`,
    // `--end-of-options` so a ref beginning with `-` is a revision, never an option.
    '--end-of-options',
    escapeShellArg(ref),
  ];
  if (options.path) parts.push('--', escapeShellArg(options.path));

  const command = `{ ${parts.join(' ')}; printf '###EXIT %s\\n' "$?" >&2; } | head -c ${GREP_BYTE_CAP}`;
  const res = await execRemoteCommand(config, command, secret);

  const marker = /###EXIT (\d+)\n?$/.exec(res.stderr);
  const gitExit = marker ? Number(marker[1]) : 0;
  const stderr = res.stderr.replace(/###EXIT \d+\n?$/, '').trim();

  // 0 = matches, 1 = no matches, 141 = SIGPIPE because `head -c` closed the pipe at the cap.
  if (gitExit !== 0 && gitExit !== 1 && gitExit !== 141) {
    throw new Error(stderr || `git grep thất bại với exit code ${gitExit}`);
  }

  const hits: RemoteGrepHit[] = [];
  let truncated = gitExit === 141 || res.stdout.length >= GREP_BYTE_CAP;

  // `-z` NUL-separates the FIELDS of one record; the newline ends the record. So the stream is
  // `<ref>:<path>\0<line>\0<content>\n<ref>:<path>\0<line>\0<content>\n…` — splitting on `\0`
  // first would glue the next record's path onto this record's content. Verified against git.
  //
  // A newline alone cannot end a record either: a path may legally contain one, and the
  // stream then reads `HEAD:we\nird.txt\01\0needle`. So a record is complete only when BOTH
  // NUL separators have arrived AND the line field is numeric — that field is the one thing a
  // path can never impersonate.
  const refPrefix = `${ref}:`;
  const chunks = res.stdout === '' ? [] : res.stdout.split('\n');
  // Every complete record ends with a newline, so a non-empty last chunk is a record the byte
  // cap cut mid-content. A partial body is worse than no hit: drop it.
  if (chunks.length > 0) {
    if (chunks[chunks.length - 1] === '') chunks.pop();
    else {
      chunks.pop();
      truncated = true;
    }
  }
  let pending = '';
  for (const chunk of chunks) {
    pending = pending === '' ? chunk : `${pending}\n${chunk}`;
    const fields = pending.split('\0');
    if (fields.length > 3) {
      // Only a NUL inside the matched line can do this; resync rather than emit garbage.
      pending = '';
      truncated = true;
      continue;
    }
    if (fields.length !== 3 || !/^\d+$/.test(fields[1]!)) continue;
    const line = parseInt(fields[1]!, 10);
    const rawPath = fields[0]!;
    hits.push({
      path: rawPath.startsWith(refPrefix) ? rawPath.slice(refPrefix.length) : rawPath,
      line,
      text: fields[2]!,
    });
    pending = '';
  }
  // A record still open at the end was cut by the byte cap; the partial record is dropped.
  if (pending !== '') truncated = true;
  if (hits.length > limit) {
    hits.length = limit;
    truncated = true;
  }
  return { hits, truncated };
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

