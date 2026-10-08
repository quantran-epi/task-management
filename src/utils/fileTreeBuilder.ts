import type { DiffFile } from '../types/agent';

export interface FileTreeNode {
  key: string;
  title: string | React.ReactNode;
  isLeaf?: boolean;
  children?: FileTreeNode[];
  path: string;
  isDir: boolean;
  diffFile?: DiffFile;
}

export const DEFAULT_EXCLUDED_PATTERNS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'target',
  '.next',
  '.turbo',
  '.output',
  'coverage',
  '.cache',
  '.DS_Store',
];

export function isPathExcluded(
  filePath: string,
  excludePatterns: string[] = DEFAULT_EXCLUDED_PATTERNS
): boolean {
  if (!excludePatterns.length) return false;
  const segments = filePath.split('/').filter(Boolean);
  return segments.some((seg) => excludePatterns.includes(seg));
}

/**
 * Builds a folder hierarchy tree from all directory relative paths and changed diff files.
 * @param allPaths List of all relative file paths from working directory (e.g. ['src/App.tsx', 'package.json'])
 * @param diffFiles List of files that have git diff
 * @param excludePatterns List of folder/file names to exclude (e.g. node_modules, .git)
 */
export function buildWorktreeFileTree(
  allPaths: string[],
  diffFiles: DiffFile[] = [],
  excludePatterns: string[] = DEFAULT_EXCLUDED_PATTERNS
): FileTreeNode[] {
  const diffMap = new Map<string, DiffFile>();
  for (const df of diffFiles) {
    if (df.newPath && df.newPath !== '/dev/null') {
      diffMap.set(df.newPath.replace(/\\/g, '/'), df);
    } else if (df.oldPath && df.oldPath !== '/dev/null') {
      diffMap.set(df.oldPath.replace(/\\/g, '/'), df);
    }
  }

  // Combine paths from allPaths (filtered) and diffMap
  const pathSet = new Set<string>();
  for (const p of allPaths) {
    const clean = p.replace(/\\/g, '/').replace(/^\.\//, '').trim();
    if (clean && !isPathExcluded(clean, excludePatterns)) {
      pathSet.add(clean);
    }
  }
  for (const p of diffMap.keys()) {
    pathSet.add(p);
  }

  // Internal trie node
  interface TrieNode {
    name: string;
    fullPath: string;
    isDir: boolean;
    children: Map<string, TrieNode>;
    diffFile?: DiffFile;
  }

  const root: TrieNode = {
    name: '',
    fullPath: '',
    isDir: true,
    children: new Map(),
  };

  for (const filePath of pathSet) {
    const parts = filePath.split('/').filter(Boolean);
    let current = root;
    let accumulatedPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      accumulatedPath = accumulatedPath ? `${accumulatedPath}/${part}` : part;
      const isLast = i === parts.length - 1;

      let child = current.children.get(part);
      if (!child) {
        child = {
          name: part,
          fullPath: accumulatedPath,
          isDir: !isLast,
          children: new Map(),
        };
        current.children.set(part, child);
      } else if (!isLast) {
        child.isDir = true;
      }

      if (isLast) {
        child.isDir = false;
        const df = diffMap.get(accumulatedPath);
        if (df) {
          child.diffFile = df;
        }
      }

      current = child;
    }
  }

  function convert(node: TrieNode): FileTreeNode[] {
    const sortedChildren = Array.from(node.children.values()).sort((a, b) => {
      // Directories first, then alphabetical
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    });

    return sortedChildren.map((child) => {
      const isLeaf = !child.isDir;
      const item: FileTreeNode = {
        key: child.fullPath,
        title: child.name,
        path: child.fullPath,
        isDir: child.isDir,
        isLeaf,
      };

      if (child.diffFile) {
        item.diffFile = child.diffFile;
      }

      if (!isLeaf) {
        item.children = convert(child);
      }

      return item;
    });
  }

  return convert(root);
}
