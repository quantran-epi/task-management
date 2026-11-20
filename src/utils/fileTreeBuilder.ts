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

export interface CompactFileNode {
  key: string;
  path: string;
  name: string;
  label: string;
  chain: string[];
  children: CompactFileNode[];
  isLeaf: boolean;
  isDir: boolean;
  diffFile?: DiffFile;
}

/**
 * Song song với remoteTreeCompact nhưng khác node shape/badge semantics
 * (diffFile thay gitStatus). Cố tình không generic hóa để không đụng remote tree đã verify.
 */
export function compactFileTree(
  nodes: FileTreeNode[],
  options: { revealTargets?: readonly string[] } = {}
): CompactFileNode[] {
  const revealTargets = new Set(options.revealTargets ?? []);
  const segmentName = (fullPath: string): string => fullPath.split('/').pop() ?? fullPath;

  function compactNode(node: FileTreeNode): CompactFileNode {
    if (!node.isDir) {
      return {
        key: node.key,
        path: node.path,
        name: node.title && typeof node.title === 'string' ? node.title : segmentName(node.path),
        label: node.title && typeof node.title === 'string' ? node.title : segmentName(node.path),
        chain: [node.key],
        children: [],
        isLeaf: true,
        isDir: false,
        ...(node.diffFile ? { diffFile: node.diffFile } : {}),
      };
    }

    const chain: string[] = [node.key];
    const names: string[] = [segmentName(node.key)];
    let end = node;
    // Reveal target được gộp vào chain rồi mới dừng để key map trỏ đúng node cần reveal.
    // Node có diffFile là diff target — dừng ngay ở node hiện tại.
    if (!end.diffFile) {
      while (true) {
        const children = end.children ?? [];
        if (children.length !== 1) break;
        const only = children[0]!;
        if (only.isLeaf || only.diffFile) break;
        end = only;
        chain.push(end.key);
        names.push(segmentName(end.key));
        if (end.diffFile || revealTargets.has(end.key)) break;
      }
    }

    return {
      key: chain[0]!,
      path: end.path,
      name: names[names.length - 1]!,
      label: names.length > 1 ? names.join('.') : names[0]!,
      chain,
      children: compactNodeChildren(end.children ?? []),
      isLeaf: false,
      isDir: true,
      ...(end.diffFile ? { diffFile: end.diffFile } : {}),
    };
  }

  function compactNodeChildren(children: FileTreeNode[]): CompactFileNode[] {
    return children.map(compactNode);
  }

  return nodes.map(compactNode);
}

/** Map mọi path trong chain về key của node đã gộp, đệ quy. */
export function fileKeyOfPathFor(nodes: CompactFileNode[]): Map<string, string> {
  const map = new Map<string, string>();
  function visit(list: CompactFileNode[]): void {
    for (const node of list) {
      for (const path of node.chain) map.set(path, node.key);
      visit(node.children);
    }
  }
  visit(nodes);
  return map;
}
