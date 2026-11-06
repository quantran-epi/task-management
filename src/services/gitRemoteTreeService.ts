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
  const cleanDir = dirPath ? dirPath.replace(/^\/+|\/+$/g, '') : '';
  const treeRef = cleanDir ? `${ref}:${cleanDir}` : ref;

  const gitArgs = ['ls-tree', '-l', escapeShellArg(treeRef)];
  const stdout = await runGitCommand(config, repoPath, gitArgs, secret);

  const lines = stdout.split('\n');
  const nodes: RemoteGitTreeNode[] = [];

  for (const line of lines) {
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
 * Falls back to reading directly from remote working copy if git show fails (e.g. untracked file).
 */
export async function getRemoteFileContent(
  config: SshConfig,
  repoPath: string,
  ref: string,
  filePath: string,
  secret?: string
): Promise<string> {
  const cleanPath = filePath.replace(/^\/+/, '');
  const objectSpec = `${ref}:${cleanPath}`;
  const gitArgs = ['show', escapeShellArg(objectSpec)];
  try {
    return await runGitCommand(config, repoPath, gitArgs, secret);
  } catch (err: any) {
    // If git show fails (e.g. untracked or newly added file not in ref), fall back to working tree
    try {
      return await getRemoteWorkingFileContent(config, repoPath, cleanPath, secret);
    } catch {
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
  const cleanPath = filePath.replace(/^\/+/, '');
  const targetFile = `${repoPath.replace(/\/+$/, '')}/${cleanPath}`;

  const cmd = `cat -- ${escapeShellArg(targetFile)}`;
  const res = await execRemoteCommand(config, cmd, secret);
  if (res.exitStatus !== 0) {
    throw new Error(res.stderr || `Failed to read ${cleanPath}`);
  }
  return res.stdout || '';
}
