import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SshConfig } from '../../types/ssh';
import * as gitRemoteService from '../gitRemoteService';
import {
  parseLsTreeLine,
  sortTreeNodes,
  getRemoteTree,
  getRemoteFileContent,
} from '../gitRemoteTreeService';

describe('gitRemoteTreeService', () => {
  const dummyConfig: SshConfig = {
    id: 'ssh-1',
    name: 'Dev Server',
    host: '192.168.1.10',
    port: 22,
    username: 'developer',
    authType: 'password',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('parseLsTreeLine', () => {
    it('parses tree directory entries correctly with no size', () => {
      const line = '040000 tree d4b81104668270eab949a71617700cd7f492a798    -\tsrc';
      const node = parseLsTreeLine(line);
      expect(node).toEqual({
        key: 'src',
        title: 'src',
        isLeaf: false,
        size: undefined,
        sha: 'd4b81104668270eab949a71617700cd7f492a798',
      });
    });

    it('parses blob file entries with numeric byte size', () => {
      const line = '100644 blob e69de29bb2d1d6434b8b29ae775ad8c2e48c5391 1420\tpackage.json';
      const node = parseLsTreeLine(line);
      expect(node).toEqual({
        key: 'package.json',
        title: 'package.json',
        isLeaf: true,
        size: 1420,
        sha: 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391',
      });
    });

    it('prepends baseDir correctly when provided', () => {
      const line = '100644 blob abcdef1234567890 256\tindex.ts';
      const node = parseLsTreeLine(line, 'src/components');
      expect(node?.key).toBe('src/components/index.ts');
      expect(node?.title).toBe('index.ts');
    });

    it('returns null for malformed or non-tabbed lines', () => {
      expect(parseLsTreeLine('')).toBeNull();
      expect(parseLsTreeLine('malformed line with no tab')).toBeNull();
    });
  });

  describe('sortTreeNodes', () => {
    it('sorts folders first alphabetically, then files alphabetically', () => {
      const nodes = [
        { key: 'zoo.ts', title: 'zoo.ts', isLeaf: true, sha: '1' },
        { key: 'docs', title: 'docs', isLeaf: false, sha: '2' },
        { key: 'app.ts', title: 'app.ts', isLeaf: true, sha: '3' },
        { key: 'api', title: 'api', isLeaf: false, sha: '4' },
      ];

      const sorted = sortTreeNodes(nodes);
      expect(sorted.map((n) => n.title)).toEqual(['api', 'docs', 'app.ts', 'zoo.ts']);
    });
  });

  describe('getRemoteTree', () => {
    it('calls git ls-tree with proper ref and parses output sorted', async () => {
      const mockLsTreeOutput = [
        '100644 blob a1b2c3d4 1024\tREADME.md',
        '040000 tree f1e2d3c4    -\tsrc',
        '040000 tree b2c3d4e5    -\tpublic',
        '100644 blob c3d4e5f6  512\t.gitignore',
      ].join('\n');

      const runSpy = vi.spyOn(gitRemoteService, 'runGitCommand').mockResolvedValue(mockLsTreeOutput);

      const tree = await getRemoteTree(dummyConfig, '/home/user/repo', 'main');

      expect(runSpy).toHaveBeenCalledWith(
        dummyConfig,
        '/home/user/repo',
        ['ls-tree', '-l', "'main'"],
        undefined
      );

      expect(tree.map((n) => n.title)).toEqual(['public', 'src', '.gitignore', 'README.md']);
      expect(tree[0]?.isLeaf).toBe(false);
      expect(tree[2]?.isLeaf).toBe(true);
      expect(tree[2]?.size).toBe(512);
    });

    it('handles subdirectory path in tree reference with clean slashes', async () => {
      const runSpy = vi.spyOn(gitRemoteService, 'runGitCommand').mockResolvedValue(
        '100644 blob 12345678 4096\tButton.tsx'
      );

      const tree = await getRemoteTree(dummyConfig, '/home/user/repo', 'feature/ui', '/src/components/');

      expect(runSpy).toHaveBeenCalledWith(
        dummyConfig,
        '/home/user/repo',
        ['ls-tree', '-l', "'feature/ui:src/components'"],
        undefined
      );

      expect(tree).toHaveLength(1);
      expect(tree[0]?.key).toBe('src/components/Button.tsx');
      expect(tree[0]?.title).toBe('Button.tsx');
    });
  });

  describe('getRemoteFileContent', () => {
    it('executes git show <ref>:<filePath> with escaped arguments', async () => {
      const runSpy = vi.spyOn(gitRemoteService, 'runGitCommand').mockResolvedValue('console.log("hello world");');

      const content = await getRemoteFileContent(
        dummyConfig,
        '/home/user/repo',
        'main',
        'src/index.ts',
        'secret-pass'
      );

      expect(runSpy).toHaveBeenCalledWith(
        dummyConfig,
        '/home/user/repo',
        ['show', "'main:src/index.ts'"],
        'secret-pass'
      );
      expect(content).toBe('console.log("hello world");');
    });
  });
});
