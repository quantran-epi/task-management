import { describe, it, expect } from 'vitest';
import { buildWorktreeFileTree } from '../fileTreeBuilder';
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
