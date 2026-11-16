import type { SshConfig } from '../types/ssh';
import type { RemoteGitTreeNode, RemoteFilePage } from '../types/gitRemote';
import { runGitCommand, escapeShellArg } from './gitRemoteService';
import { execRemoteCommand } from './sshService';

/**
 * Parses git ls-tree -l output lines:
 * Format: <mode> SP <type> SP <object> SP <object size>\t<file>
 * For tree/commit objects, size is '-' or empty space.
 */
export function parseLsTreeLine(line: string, baseDir?: string): RemoteGitTreeNode | null {
  const tabIndex = line.indexOf('\t');
  if (tabIndex === -1) return null;

  const metaPart = line.slice(0, tabIndex).trim();
  const fileName = line.slice(tabIndex + 1);
  if (!fileName) return null;

  const tokens = metaPart.split(/\s+/);
  if (tokens.length < 3) return null;

  const type = tokens[1];
  const sha = tokens[2] || '';
  const sizeToken = tokens[3];

  const isLeaf = type === 'blob';
  const rawSize = sizeToken && sizeToken !== '-' ? parseInt(sizeToken, 10) : undefined;
  const size = typeof rawSize === 'number' && !Number.isNaN(rawSize) ? rawSize : undefined;

  const key = baseDir ? `${baseDir.replace(/\/+$/, '')}/${fileName}` : fileName;

  return {
    key,
    title: fileName,
    isLeaf,
    ...(size !== undefined ? { size } : {}),
    sha,
  };
}

/**
 * Sorts tree nodes: directories first (alphabetical), then files (alphabetical).
 */
export function sortTreeNodes(nodes: RemoteGitTreeNode[]): RemoteGitTreeNode[] {
  return [...nodes].sort((a, b) => {
    if (a.isLeaf !== b.isLeaf) {
      return a.isLeaf ? 1 : -1;
    }
    return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
  });
}

/**
 * Merges uncommitted files into a list of RemoteGitTreeNode items.
 * If baseDir is provided (e.g. "src"), only uncommitted files inside that directory are merged.
 */
export function mergeUncommittedFilesIntoTree(
  nodes: RemoteGitTreeNode[],
  uncommittedFiles: Array<{ path: string; indexStatus: string; workingTreeStatus: string }>,
  baseDir?: string
): RemoteGitTreeNode[] {
  const resultNodes = [...nodes];
  const nodeMap = new Map<string, RemoteGitTreeNode>();
  resultNodes.forEach((n) => nodeMap.set(n.title, n));

  const cleanBaseDir = baseDir ? baseDir.replace(/^\/+|\/+$/g, '') : '';
  const basePrefix = cleanBaseDir ? `${cleanBaseDir}/` : '';

  for (const item of uncommittedFiles) {
    const filePath = item.path.replace(/^\/+/, '');
    if (basePrefix && !filePath.startsWith(basePrefix)) {
      continue;
    }

    const relPath = basePrefix ? filePath.slice(basePrefix.length) : filePath;
    const parts = relPath.split('/');
    const directName = parts[0];
    if (!directName) continue;

    const isDirectLeaf = parts.length === 1;
    // Determine combined status: prefer workingTreeStatus if not space/'?', else indexStatus
    let status = '';
    if (item.indexStatus === '?' || item.workingTreeStatus === '?') {
      status = '?';
    } else {
      const idx = item.indexStatus.trim();
      const wt = item.workingTreeStatus.trim();
      status = `${idx}${wt}` || 'M';
    }

    const existingNode = nodeMap.get(directName);
    if (existingNode) {
      if (isDirectLeaf) {
        existingNode.gitStatus = status;
      } else {
        // Directory containing uncommitted files - mark with indicator if not already set
        if (!existingNode.gitStatus) {
          existingNode.gitStatus = 'M';
        }
      }
    } else {
      // New item not in tree (e.g. untracked file or folder)
      const key = cleanBaseDir ? `${cleanBaseDir}/${directName}` : directName;
      const newNode: RemoteGitTreeNode = {
        key,
        title: directName,
        isLeaf: isDirectLeaf,
        sha: '',
        gitStatus: status,
      };
      nodeMap.set(directName, newNode);
      resultNodes.push(newNode);
    }
  }

  return sortTreeNodes(resultNodes);
}


/**
 * A path this tool will not read, including traversal and symlink policy refusals.
 * The `git_read` handler maps this to `INVALID_ARGUMENT`, not infrastructure failure,
 * so the caller chooses another path instead of reporting a broken SSH connection.
 */
export class PathOutsideRepoError extends Error {}

/**
 * CR-02: resolves a repo-relative path and refuses anything that escapes the repository.
 *
 * `filePath.replace(/^\/+/, '')` alone let `../../` through, and the `cat` fallback then read
 * any file the SSH user could read. Normalising first collapses `a/../..` to `..`, so the
 * escape check cannot be walked around with a path that only looks contained.
 *
 * No `node:path` import: this module is bundled for the browser/Tauri renderer, where
 * `path.posix` is not available. The subset needed here is small and total.
 */
export function confineRepoPath(filePath: string, label = 'Đường dẫn'): string {
  const stripped = filePath.replace(/^\/+/, '');
  const segments: string[] = [];
  for (const segment of stripped.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      // Popping past the root is the escape; refuse rather than clamp, so the caller learns
      // the path was rejected instead of silently reading a different file.
      if (segments.length === 0) throw new PathOutsideRepoError(`${label} ngoài repo: ${filePath}`);
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  if (segments.length === 0) throw new PathOutsideRepoError(`${label} ngoài repo: ${filePath}`);
  return segments.join('/');
}

/**
 * A `git cat-file` failure that means "this path is not in the ref" — the one case a
 * working-tree fallback can legitimately answer. Anything else (bad ref, SSH down) must
 * propagate, or the reviewer reads the working copy believing it is the branch (WR-01).
 *
 * WR-01: anchored to the exact path AND ref. An unanchored phrase match also fired for a ref
 * whose NAME contains the phrase (`invalid object name 'x does not exist in'`), letting a
 * model-chosen branch name force the fallback at will.
 */
function isNotInRef(err: unknown, cleanPath: string, ref: string): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes(`path '${cleanPath}' does not exist in '${ref}'`) ||
    message.includes(`path '${cleanPath}' exists on disk, but not in '${ref}'`)
  );
}

/**
 * Fetches tree nodes for a given ref and directory inside the remote git repository.
 * Invariant: Read-only command. NEVER calls git checkout or modifies working copy.
 */
export async function getRemoteTree(
  config: SshConfig,
  repoPath: string,
  ref: string,
  dirPath?: string,
  secret?: string
): Promise<RemoteGitTreeNode[]> {
  const cleanDir = dirPath ? confineRepoPath(dirPath, 'Đường dẫn thư mục') : '';
  const treeRef = cleanDir ? `${ref}:${cleanDir}` : ref;

  // CR-01: `--end-of-options` so a ref beginning with `-` is a revision, never an option.
  // WR-03: `-z` so a non-ASCII path arrives verbatim. Without it git C-quotes any path outside
  // ASCII (`"th\306\260-m\341\273\245c"`), and that string is not a usable path — feeding it
  // back as `dirPath` fails, and the model sees escaped octal instead of the real name.
  const gitArgs = ['ls-tree', '-l', '-z', '--end-of-options', escapeShellArg(treeRef)];
  const stdout = await runGitCommand(config, repoPath, gitArgs, secret);

  const nodes: RemoteGitTreeNode[] = [];

  for (const line of stdout.split('\0')) {
    if (!line.trim()) continue;
    const node = parseLsTreeLine(line, cleanDir || undefined);
    if (node) {
      nodes.push(node);
    }
  }

  return sortTreeNodes(nodes);
}

/**
 * Fetches exact file blob content at a ref using git cat-file -p <ref>:<filePath>.
 * Invariant: Read-only command. NEVER calls git checkout or modifies working copy.
 * Falls back to reading directly from remote working copy ONLY when the path genuinely is
 * not in the ref (e.g. an untracked file). A bad ref, an SSH failure or an escaping path
 * propagates so the caller reports the real cause instead of silently returning the working
 * copy labelled as branch content (CR-02, WR-01).
 */
export async function getRemoteFileContent(
  config: SshConfig,
  repoPath: string,
  ref: string,
  filePath: string,
  secret?: string
): Promise<string> {
  const cleanPath = confineRepoPath(filePath, 'Đường dẫn tệp');
  const objectSpec = `${ref}:${cleanPath}`;
  // CR-01: `--end-of-options` so a ref beginning with `-` cannot become `--output=<file>`.
  // Literal object lookup: `show` can silently succeed with no output for a missing glob.
  // cat-file does not invoke repo-local diff drivers or textconv.
  const gitArgs = ['cat-file', '-p', '--end-of-options', escapeShellArg(objectSpec)];
  try {
    return await runGitCommand(config, repoPath, gitArgs, secret);
  } catch (err: any) {
    if (!isNotInRef(err, cleanPath, ref)) throw err;
    // WR-01: "exists on disk, but not in <ref>" also matches a path that is TRACKED but deleted
    // in <ref> — and the working copy then holds whatever another branch has. Fall back only
    // for a path git does not track at all, i.e. a genuine untracked file.
    const probe = await execRemoteCommand(
      config,
      `git -C ${escapeShellArg(repoPath)} -c core.fsmonitor=false --no-pager --literal-pathspecs ` +
        `ls-files --error-unmatch -- ${escapeShellArg(cleanPath)}`,
      secret
    );
    if (probe.exitStatus === 0) throw err;
    // Only exit 1 means untracked; infrastructure and SSH failures must stay failures.
    if (probe.exitStatus !== 1) {
      throw new Error(probe.stderr.trim() || `Lệnh git thất bại với exit code ${probe.exitStatus}`);
    }
    return await getRemoteWorkingFileContent(config, repoPath, cleanPath, secret);
  }
}

/**
 * Reads a file directly from the remote working tree using cat.
 * Invariant: Read-only command. Uses safe shell argument escaping to mitigate T-quick-01.
 */
export async function getRemoteWorkingFileContent(
  config: SshConfig,
  repoPath: string,
  filePath: string,
  secret?: string
): Promise<string> {
  // CR-02: exported, so it confines on its own rather than trusting the caller's path.
  const cleanPath = confineRepoPath(filePath, 'Đường dẫn tệp');
  const res = await execRemoteCommand(config, workingCopyCatSnippet(repoPath, cleanPath), secret);
  if (res.exitStatus === 77) {
    throw new PathOutsideRepoError(`Đường dẫn symlink ngoài repo, từ chối đọc: ${cleanPath}`);
  }
  if (res.exitStatus !== 0) {
    throw new Error(res.stderr || `Failed to read ${cleanPath}`);
  }
  return res.stdout || '';
}

/**
 * Canonicalize BOTH paths: parent/leaf symlinks, relative roots and symlinked roots.
 * Appending '/' preserves trailing newlines through shell command substitution; remove
 * that sentinel and realpath's output newline before checking a literal directory boundary.
 * Missing/failed realpath must stop before cat. Exit 77 is policy refusal, not file content.
 *
 * No `-e`: that flag is GNU-only and BSD/macOS rejects it ("illegal option -- e"), which made
 * every read fail closed on a macOS remote. Plain `realpath --` is POSIX-portable and already
 * strict — it refuses a path whose components do not exist on both implementations.
 * ponytail: assumes a stable remote filesystem; hostile concurrent swaps need native openat.
 */
function workingCopyCatSnippet(repoPath: string, cleanPath: string): string {
  const targetFile = `${repoPath.replace(/\/+$/, '')}/${cleanPath}`;
  return (
    `root=$(realpath -- ${escapeShellArg(repoPath)} && printf /) || exit 1; ` +
    `root=\${root%?}; root=\${root%?}; ` +
    `target=$(realpath -- ${escapeShellArg(targetFile)} && printf /) || exit 1; ` +
    `target=\${target%?}; target=\${target%?}; ` +
    `case "$target" in "\${root%/}/"*) cat -- "$target" ;; *) exit 77 ;; esac`
  );
}

const PAGE_TOTAL_PREFIX = '###TOTAL ';

/**
 * One remote pass yields the page AND the line total. The source's exit status is reported
 * out-of-band on stderr (`###EXIT <n>`) because the pipeline's own status is awk's.
 *
 * A subshell, not `{ ...; }`: dash does not run an EXIT trap for the last command of a brace
 * group inside a pipeline, and the working-copy snippet's `exit 77` must still be reported.
 */
function pageCommand(source: string, offset: number, limit: number): string {
  return (
    `( trap 'printf "###EXIT %s\\n" "$?" >&2' EXIT; ${source} ) | ` +
    `awk -v s=${offset} -v e=${offset + limit - 1} ` +
    `'NR>=s&&NR<=e{print NR": "$0} END{print "${PAGE_TOTAL_PREFIX}"NR}'`
  );
}

/** First 1024 bytes of the same source; exit 0 means a NUL byte is present. */
function binaryProbeCommand(source: string): string {
  return `{ ${source}; } | head -c 1024 | od -An -tx1 | tr -s ' ' '\\n' | grep -qx 00`;
}

function parsePage(
  stdout: string,
  filePath: string,
  offset: number,
  limit: number
): RemoteFilePage {
  const lines = stdout.split('\n');
  // The trailing element is a split artefact, not a line.
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  // awk's END block prints the total last, so the marker is the last line by construction.
  // Body lines are always prefixed with `NR": "`, so a file line can never be mistaken for it.
  let totalLines = 0;
  const last = lines[lines.length - 1];
  if (last !== undefined && last.startsWith(PAGE_TOTAL_PREFIX)) {
    totalLines = parseInt(last.slice(PAGE_TOTAL_PREFIX.length), 10) || 0;
    lines.pop();
  }
  return {
    filePath,
    offset,
    limit,
    linesRead: lines.length,
    totalLines,
    hasMore: offset + lines.length - 1 < totalLines,
    isBinary: false,
    lines,
  };
}

/**
 * One page of a ref blob, with a line-numbered body and the file's total line count.
 * `getRemoteFileContent` stays whole-file: `RemoteFileViewer` needs it for the editor, and it
 * is not an AI tool result. Same confinement and untracked fallback as that function.
 */
export async function readRemoteFilePage(
  config: SshConfig,
  repoPath: string,
  ref: string,
  filePath: string,
  offset: number,
  limit: number,
  secret?: string
): Promise<RemoteFilePage> {
  const cleanPath = confineRepoPath(filePath, 'Đường dẫn tệp');
  const pageOffset = Math.max(1, Math.floor(Number(offset)) || 1);
  const pageLimit = Math.min(Math.max(1, Math.floor(Number(limit)) || 200), 2000);
  const objectSpec = `${ref}:${cleanPath}`;
  const refSource =
    `git -C ${escapeShellArg(repoPath)} -c core.fsmonitor=false --no-pager ` +
    `cat-file -p --end-of-options ${escapeShellArg(objectSpec)}`;

  try {
    return await readPageFromSource(
      config,
      refSource,
      filePath,
      pageOffset,
      pageLimit,
      secret
    );
  } catch (err: any) {
    if (!isNotInRef(err, cleanPath, ref)) throw err;
    // WR-01: fall back only for a path git does not track at all, i.e. a genuine untracked file.
    const probe = await execRemoteCommand(
      config,
      `git -C ${escapeShellArg(repoPath)} -c core.fsmonitor=false --no-pager --literal-pathspecs ` +
        `ls-files --error-unmatch -- ${escapeShellArg(cleanPath)}`,
      secret
    );
    if (probe.exitStatus === 0) throw err;
    // Only exit 1 means untracked; infrastructure and SSH failures must stay failures.
    if (probe.exitStatus !== 1) {
      throw new Error(probe.stderr.trim() || `Lệnh git thất bại với exit code ${probe.exitStatus}`);
    }
    return await readPageFromSource(
      config,
      workingCopyCatSnippet(repoPath, cleanPath),
      filePath,
      pageOffset,
      pageLimit,
      secret
    );
  }
}

async function readPageFromSource(
  config: SshConfig,
  source: string,
  filePath: string,
  offset: number,
  limit: number,
  secret?: string
): Promise<RemoteFilePage> {
  // A later page of a file already known binary never reaches here, so probe on page 1 only.
  if (offset === 1) {
    const probe = await execRemoteCommand(config, binaryProbeCommand(source), secret);
    if (probe.exitStatus === 0) {
      return {
        filePath,
        offset,
        limit,
        linesRead: 0,
        totalLines: 0,
        hasMore: false,
        isBinary: true,
        lines: [],
      };
    }
  }

  const res = await execRemoteCommand(config, pageCommand(source, offset, limit), secret);
  const marker = /###EXIT (\d+)\n?$/.exec(res.stderr);
  const sourceExit = marker ? Number(marker[1]) : 0;
  const stderr = res.stderr.replace(/###EXIT \d+\n?$/, '').trim();

  if (sourceExit === 77) {
    throw new PathOutsideRepoError(`Đường dẫn symlink ngoài repo, từ chối đọc: ${filePath}`);
  }
  if (sourceExit !== 0) {
    // The message is what `isNotInRef` matches on, so it must survive verbatim.
    throw new Error(stderr || `Lệnh git thất bại với exit code ${sourceExit}`);
  }
  // The probe covers page 1 only. That is a real ceiling: a file whose first 1024 bytes are
  // text but which has a NUL later is not flagged on a later page. It cannot leak raw bytes
  // though — awk ends the string at the NUL, so the page holds a truncated line, never binary.
  return parsePage(res.stdout, filePath, offset, limit);
}