import { describe, it, expect } from 'vitest';
import {
  buildWorktreeFileTree,
  compactFileTree,
  fileKeyOfPathFor,
  type FileTreeNode,
} from '../fileTreeBuilder';
import type { DiffFile } from '../../types/agent';

describe('buildWorktreeFileTree', () => {
  it('builds a hierarchical folder tree from paths', () => {
    const paths = ['src/components/App.tsx', 'src/index.ts', 'package.json', 'README.md'];
    const tree = buildWorktreeFileTree(paths);

    expect(tree.length).toBe(3); // src (dir), package.json, README.md
    expect(tree[0]?.title).toBe('src');
    expect(tree[0]?.isDir).toBe(true);
    expect(tree[0]?.children?.length).toBe(2); // components (dir), index.ts (file)

    const componentsNode = tree[0]?.children?.[0];
    expect(componentsNode?.title).toBe('components');
    expect(componentsNode?.children?.[0]?.title).toBe('App.tsx');
  });

  it('associates diffFile with corresponding tree node', () => {
    const paths = ['src/App.tsx'];
    const diffFiles: DiffFile[] = [
      {
        oldPath: 'src/App.tsx',
        newPath: 'src/App.tsx',
        status: 'modified',
        hunks: [],
        additions: 5,
        deletions: 2,
      },
    ];

    const tree = buildWorktreeFileTree(paths, diffFiles);
    const appNode = tree[0]?.children?.[0];
    expect(appNode?.diffFile).toBeDefined();
    expect(appNode?.diffFile?.additions).toBe(5);
  });

  it('includes diffFiles even if not in allPaths', () => {
    const paths: string[] = [];
    const diffFiles: DiffFile[] = [
      {
        oldPath: 'new-folder/new-file.ts',
        newPath: 'new-folder/new-file.ts',
        status: 'added',
        hunks: [],
        additions: 10,
        deletions: 0,
      },
    ];

    const tree = buildWorktreeFileTree(paths, diffFiles);
    expect(tree.length).toBe(1);
    expect(tree[0]?.title).toBe('new-folder');
    expect(tree[0]?.children?.[0]?.title).toBe('new-file.ts');
  });

  it('filters out default excluded directories such as node_modules and .git', () => {
    const paths = [
      'node_modules/react/index.js',
      'node_modules/lodash/lodash.js',
      '.git/config',
      'dist/bundle.js',
      'build/index.html',
      'src/App.tsx',
    ];

    const tree = buildWorktreeFileTree(paths);
    expect(tree.length).toBe(1);
    expect(tree[0]?.title).toBe('src');
    expect(tree[0]?.children?.[0]?.title).toBe('App.tsx');
  });

  it('supports custom exclusion patterns', () => {
    const paths = ['src/App.tsx', 'temp/cache.json', 'docs/readme.md'];
    const tree = buildWorktreeFileTree(paths, [], ['temp', 'docs']);

    expect(tree.length).toBe(1);
    expect(tree[0]?.title).toBe('src');
  });
});

function dir(path: string, children: FileTreeNode[] = []): FileTreeNode {
  return {
    key: path,
    title: path.split('/').pop() ?? path,
    path,
    isDir: true,
    isLeaf: false,
    children,
  };
}

function file(path: string, diffFile?: DiffFile): FileTreeNode {
  return {
    key: path,
    title: path.split('/').pop() ?? path,
    path,
    isDir: false,
    isLeaf: true,
    ...(diffFile ? { diffFile } : {}),
  };
}

const sampleDiff: DiffFile = {
  oldPath: 'com/A.java',
  newPath: 'com/A.java',
  status: 'modified',
  hunks: [],
  additions: 1,
  deletions: 0,
};

describe('compactFileTree', () => {
  it('gộp chain folder single-child thành một node dotted, không mutate input', () => {
    const input = [dir('com', [dir('com/acme', [dir('com/acme/orders', [])])])];
    const before = JSON.stringify(input);

    const result = compactFileTree(input);

    expect(result).toHaveLength(1);
    const node = result[0]!;
    expect(node.key).toBe('com');
    expect(node.path).toBe('com/acme/orders');
    expect(node.label).toBe('com.acme.orders');
    expect(node.chain).toEqual(['com', 'com/acme', 'com/acme/orders']);
    expect(node.isLeaf).toBe(false);
    expect(node.isDir).toBe(true);
    expect(node.children).toEqual([]);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('dừng gộp ở branch point (>=2 children)', () => {
    const input = [dir('com', [dir('com/acme', []), dir('com/other', [])])];
    const result = compactFileTree(input);
    expect(result[0]?.chain).toEqual(['com']);
    expect(result[0]?.children).toHaveLength(2);
  });

  it('dừng gộp ở node có diffFile và giữ nguyên field', () => {
    const withDiff = { ...dir('com', [dir('com/acme', [])]), diffFile: sampleDiff };
    const result = compactFileTree([withDiff]);
    expect(result[0]?.chain).toEqual(['com']);
    expect(result[0]?.diffFile).toBe(sampleDiff);
  });

  it('dừng gộp ở node nằm trong revealTargets', () => {
    const input = [dir('com', [dir('com/acme', [dir('com/acme/orders', [])])])];
    const result = compactFileTree(input, { revealTargets: ['com/acme'] });
    expect(result[0]?.chain).toEqual(['com', 'com/acme']);
  });

  it('dừng gộp khi single child là file leaf, node con vẫn ở lại', () => {
    const leaf = file('com/acme/Foo.java');
    const input = [dir('com', [dir('com/acme', [leaf])])];
    const result = compactFileTree(input);
    expect(result[0]?.chain).toEqual(['com', 'com/acme']);
    expect(result[0]?.children).toHaveLength(1);
    expect(result[0]?.children?.[0]?.isLeaf).toBe(true);
    expect(result[0]?.children?.[0]?.path).toBe('com/acme/Foo.java');
  });

  it('pass-through leaf giữ key/path, chain một segment', () => {
    const leaf = file('Foo.java', sampleDiff);
    const result = compactFileTree([leaf]);
    expect(result[0]).toMatchObject({
      key: 'Foo.java',
      path: 'Foo.java',
      name: 'Foo.java',
      label: 'Foo.java',
      chain: ['Foo.java'],
      isLeaf: true,
      isDir: false,
      diffFile: sampleDiff,
    });
  });
});

describe('fileKeyOfPathFor', () => {
  it('map mọi path trong chain về key node đã gộp và đệ quy vào children', () => {
    const leaf = file('com/acme/Foo.java');
    const input = [dir('com', [dir('com/acme', [leaf])])];
    const map = fileKeyOfPathFor(compactFileTree(input));

    expect(map.get('com')).toBe('com');
    expect(map.get('com/acme')).toBe('com');
    expect(map.get('com/acme/Foo.java')).toBe('com/acme/Foo.java');
  });

  it('path lạ trả undefined', () => {
    const map = fileKeyOfPathFor(compactFileTree([file('Foo.java')]));
    expect(map.get('unknown/path')).toBeUndefined();
  });
});
