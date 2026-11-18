import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SshConfig } from '../../types/ssh';
import * as gitRemoteService from '../gitRemoteService';
import * as sshService from '../sshService';
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
    it('calls git ls-tree with -z and parses NUL-separated output sorted', async () => {
      // WR-03: `-z` output is NUL-terminated per record and never C-quoted, so a Vietnamese
      // directory name arrives verbatim.
      const mockLsTreeOutput = [
        '100644 blob a1b2c3d4 1024\tREADME.md',
        '040000 tree f1e2d3c4    -\tsrc',
        '040000 tree b2c3d4e5    -\tthư-mục',
        '100644 blob c3d4e5f6  512\t.gitignore',
        '',
      ].join('\0');

      const runSpy = vi.spyOn(gitRemoteService, 'runGitCommand').mockResolvedValue(mockLsTreeOutput);

      const tree = await getRemoteTree(dummyConfig, '/home/user/repo', 'main');

      expect(runSpy).toHaveBeenCalledWith(
        dummyConfig,
        '/home/user/repo',
        ['ls-tree', '-l', '-z', '--end-of-options', "'main'"],
        undefined
      );

      expect(tree.map((n) => n.title)).toEqual(['src', 'thư-mục', '.gitignore', 'README.md']);
      expect(tree[0]?.isLeaf).toBe(false);
      expect(tree[2]?.isLeaf).toBe(true);
      expect(tree[2]?.size).toBe(512);
    });

    it('handles subdirectory path in tree reference with clean slashes', async () => {
      const runSpy = vi
        .spyOn(gitRemoteService, 'runGitCommand')
        .mockResolvedValue('100644 blob 12345678 4096\tButton.tsx\0');

      const tree = await getRemoteTree(dummyConfig, '/home/user/repo', 'feature/ui', '/src/components/');

      expect(runSpy).toHaveBeenCalledWith(
        dummyConfig,
        '/home/user/repo',
        ['ls-tree', '-l', '-z', '--end-of-options', "'feature/ui:src/components'"],
        undefined
      );

      expect(tree).toHaveLength(1);
      expect(tree[0]?.key).toBe('src/components/Button.tsx');
      expect(tree[0]?.title).toBe('Button.tsx');
    });
  });

  describe('getRemoteFileContent', () => {
    it('executes literal git cat-file <ref>:<filePath> with escaped arguments', async () => {
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
        ['cat-file', '-p', '--end-of-options', "'main:src/index.ts'"],
        'secret-pass'
      );
      expect(content).toBe('console.log("hello world");');
    });

    // CR-02: the path is confined before any command is built, so `..` cannot reach the
    // `cat` fallback and read a file outside the repo.
    it('refuses a filePath that escapes the repository', async () => {
      const runSpy = vi.spyOn(gitRemoteService, 'runGitCommand');

      await expect(
        getRemoteFileContent(dummyConfig, '/home/user/repo', 'main', '../../../etc/passwd')
      ).rejects.toThrow('ngoài repo');
      expect(runSpy).not.toHaveBeenCalled();
    });

    it('normalises an interior traversal that stays inside the repo', async () => {
      const runSpy = vi
        .spyOn(gitRemoteService, 'runGitCommand')
        .mockResolvedValue('content');

      await getRemoteFileContent(dummyConfig, '/home/user/repo', 'main', 'src/../README.md');

      expect(runSpy).toHaveBeenCalledWith(
        dummyConfig,
        '/home/user/repo',
        ['cat-file', '-p', '--end-of-options', "'main:README.md'"],
        undefined
      );
    });

    // WR-01: a bad ref must propagate, not silently return the working copy.
    it('does not fall back to the working copy when the ref is invalid', async () => {
      vi.spyOn(gitRemoteService, 'runGitCommand').mockRejectedValue(
        new Error("fatal: invalid object name 'mian'.")
      );
      const execSpy = vi.spyOn(sshService, 'execRemoteCommand');

      await expect(
        getRemoteFileContent(dummyConfig, '/home/user/repo', 'mian', 'src/index.ts')
      ).rejects.toThrow('invalid object name');
      expect(execSpy).not.toHaveBeenCalled();
    });

    // WR-01: "exists on disk, but not in <ref>" also covers a path TRACKED but deleted in <ref>.
    // The working copy then holds another branch's version, so it must not be substituted.
    it('does not fall back for a path tracked but deleted in the requested ref', async () => {
      vi.spyOn(gitRemoteService, 'runGitCommand').mockRejectedValueOnce(
        new Error("fatal: path 'gone.txt' exists on disk, but not in 'feature/x'")
      );
      const execSpy = vi.spyOn(sshService, 'execRemoteCommand').mockResolvedValueOnce({
        exitStatus: 0, stdout: 'gone.txt\n', stderr: '',
      });

      await expect(
        getRemoteFileContent(dummyConfig, '/home/user/repo', 'feature/x', 'gone.txt')
      ).rejects.toThrow('exists on disk, but not in');
      expect(execSpy).toHaveBeenCalledExactlyOnceWith(
        dummyConfig,
        "git -C '/home/user/repo' -c core.fsmonitor=false --no-pager --literal-pathspecs ls-files --error-unmatch -- 'gone.txt'",
        undefined
      );
    });

    // WR-01: the phrase match is anchored to the exact path and ref, so a ref whose NAME
    // contains the phrase cannot force the fallback.
    it('does not fall back when the phrase appears only in a bad ref name', async () => {
      vi.spyOn(gitRemoteService, 'runGitCommand').mockRejectedValue(
        new Error("fatal: invalid object name 'x does not exist in'.")
      );
      const execSpy = vi.spyOn(sshService, 'execRemoteCommand');

      await expect(
        getRemoteFileContent(dummyConfig, '/home/user/repo', 'x does not exist in', 'g.txt')
      ).rejects.toThrow('invalid object name');
      expect(execSpy).not.toHaveBeenCalled();
    });

    // WR-02: an untracked symlink inside the repo would let `cat` read its target outside it.
    it('refuses to fall back when the path is a symlink', async () => {
      vi.spyOn(gitRemoteService, 'runGitCommand')
        .mockRejectedValueOnce(
          new Error("fatal: path 'leak' exists on disk, but not in 'HEAD'")
        );
      vi.spyOn(sshService, 'execRemoteCommand')
        .mockResolvedValueOnce({ exitStatus: 1, stdout: '', stderr: 'untracked' })
        .mockResolvedValueOnce({ exitStatus: 77, stdout: '', stderr: '' });

      await expect(
        getRemoteFileContent(dummyConfig, '/home/user/repo', 'HEAD', 'leak')
      ).rejects.toThrow('symlink');
    });
  });
});
