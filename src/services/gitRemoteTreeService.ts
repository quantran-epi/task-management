import type { SshConfig } from '../types/ssh';
import type { RemoteGitTreeNode } from '../types/gitRemote';
import { runGitCommand, escapeShellArg } from './gitRemoteService';

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
    size,
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
  return runGitCommand(config, repoPath, gitArgs, secret);
}
