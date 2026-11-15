import type { SshConfig } from '../types/ssh';
import type { RemoteGitTreeNode } from '../types/gitRemote';
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
 * WR-05: an argument the caller got wrong, not an infrastructure failure. The `git_read`
 * handler maps this to `INVALID_ARGUMENT` so the model corrects the path instead of retrying
 * the same escape or reporting a broken SSH connection.
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
 * A `git show` failure that means "this path is not in the ref" — the one case a
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
 * Fetches exact file blob content at a ref using git show <ref>:<filePath>.
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
  // WR-12: no repo-local diff drivers on a read.
  const gitArgs = ['show', '--no-ext-diff', '--no-textconv', '--end-of-options', escapeShellArg(objectSpec)];
  try {
    return await runGitCommand(config, repoPath, gitArgs, secret);
  } catch (err: any) {
    if (!isNotInRef(err, cleanPath, ref)) throw err;
    // WR-01: "exists on disk, but not in <ref>" also matches a path that is TRACKED but deleted
    // in <ref> — and the working copy then holds whatever another branch has. Fall back only
    // for a path git does not track at all, i.e. a genuine untracked file.
    const tracked = await runGitCommand(
      config,
      repoPath,
      ['ls-files', '--error-unmatch', '--', escapeShellArg(cleanPath)],
      secret
    ).catch(() => '');
    if (tracked.trim()) throw err;
    try {
      return await getRemoteWorkingFileContent(config, repoPath, cleanPath, secret);
    } catch (fallbackErr) {
      // WR-02: a refused symlink is a deliberate answer, not a fallback failure — report it.
      if (fallbackErr instanceof PathOutsideRepoError) throw fallbackErr;
      // Re-throw original git error if fallback also fails
      throw err;
    }
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
  const targetFile = `${repoPath.replace(/\/+$/, '')}/${cleanPath}`;

  // WR-02: `confineRepoPath` confines the path STRING, but `cat` resolves symlinks — an untracked
  // symlink inside the repo is exactly what this fallback serves, and it would read the target.
  // Refuse a symlink rather than follow it out of the repository. One round trip: `test -L`
  // prints the marker, otherwise `cat` runs. A file whose whole content is the marker is
  // refused too — failing closed on a vanishingly unlikely name beats a second SSH call.
  const SYMLINK_MARKER = '__GIT_READ_SYMLINK_REFUSED__';
  const cmd =
    `test -L ${escapeShellArg(targetFile)} && echo ${SYMLINK_MARKER} || ` +
    `cat -- ${escapeShellArg(targetFile)}`;
  const res = await execRemoteCommand(config, cmd, secret);
  if (res.exitStatus !== 0) {
    throw new Error(res.stderr || `Failed to read ${cleanPath}`);
  }
  if (res.stdout.trimEnd() === SYMLINK_MARKER) {
    throw new PathOutsideRepoError(`Đường dẫn là symlink, từ chối đọc: ${cleanPath}`);
  }
  return res.stdout || '';
}
