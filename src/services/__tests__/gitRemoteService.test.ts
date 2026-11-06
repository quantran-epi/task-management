import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { SshConfig } from '../../types/ssh';
import {
  escapeShellArg,
  runGitCommand,
  getRemoteBranches,
  checkDirtyStatus,
} from '../gitRemoteService';
import * as sshService from '../sshService';

vi.mock('../sshService', () => ({
  execRemoteCommand: vi.fn(),
  getSshConfigById: vi.fn(),
  getSshSecret: vi.fn(),
}));

describe('gitRemoteService - Task 1 Tracer Slice', () => {
  const dummyConfig: SshConfig = {
    id: 'ssh-cfg-1',
    name: 'Dev Server',
    host: '192.168.1.10',
    port: 22,
    username: 'gituser',
    authType: 'password',
    createdAt: '2026-11-06T00:00:00.000Z',
    updatedAt: '2026-11-06T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('escapeShellArg', () => {
    it('wraps safe strings in single quotes', () => {
      expect(escapeShellArg('main')).toBe("'main'");
      expect(escapeShellArg('/var/git/repo.git')).toBe("'/var/git/repo.git'");
    });

    it('escapes embedded single quotes to prevent injection', () => {
      expect(escapeShellArg("foo'bar")).toBe("'foo'\\''bar'");
      expect(escapeShellArg("'; rm -rf /; echo '")).toBe("''\\''; rm -rf /; echo '\\'''");
    });
  });

  describe('runGitCommand', () => {
    it('constructs git -C command with escaped args and runs execRemoteCommand', async () => {
      vi.mocked(sshService.execRemoteCommand).mockResolvedValueOnce({
        stdout: 'git version 2.43.0\n',
        stderr: '',
        exitStatus: 0,
      });

      const res = await runGitCommand(dummyConfig, '/var/repo', ['--version']);
      expect(sshService.execRemoteCommand).toHaveBeenCalledWith(
        dummyConfig,
        "git -C '/var/repo' --no-pager --version",
        undefined
      );
      expect(res).toBe('git version 2.43.0\n');
    });

    it('throws error when command exitStatus is non-zero', async () => {
      vi.mocked(sshService.execRemoteCommand).mockResolvedValueOnce({
        stdout: '',
        stderr: 'fatal: not a git repository\n',
        exitStatus: 128,
      });

      await expect(
        runGitCommand(dummyConfig, '/invalid/path', ['status'])
      ).rejects.toThrow('fatal: not a git repository');
    });
  });

  describe('getRemoteBranches', () => {
    it('parses for-each-ref output and filters out HEAD', async () => {
      const mockOutput = [
        'main\x00refs/heads/main',
        'feature/auth\x00refs/heads/feature/auth',
        'origin/HEAD\x00refs/remotes/origin/HEAD',
        'origin/main\x00refs/remotes/origin/main',
        'origin/feature/auth\x00refs/remotes/origin/feature/auth',
      ].join('\n');

      vi.mocked(sshService.execRemoteCommand).mockResolvedValueOnce({
        stdout: mockOutput,
        stderr: '',
        exitStatus: 0,
      });

      const branches = await getRemoteBranches(dummyConfig, '/var/repo');
      expect(branches).toHaveLength(4);
      expect(branches).toEqual([
        { name: 'main', isRemote: false, isHead: false },
        { name: 'feature/auth', isRemote: false, isHead: false },
        { name: 'origin/main', isRemote: true, isHead: false },
        { name: 'origin/feature/auth', isRemote: true, isHead: false },
      ]);
    });
  });

  describe('checkDirtyStatus', () => {
    it('returns isClean: true when porcelain output is empty', async () => {
      vi.mocked(sshService.execRemoteCommand).mockResolvedValueOnce({
        stdout: '',
        stderr: '',
        exitStatus: 0,
      });

      const status = await checkDirtyStatus(dummyConfig, '/var/repo');
      expect(status.isClean).toBe(true);
      expect(status.uncommittedFiles).toEqual([]);
    });

    it('parses uncommitted files from porcelain output', async () => {
      const mockPorcelain = [
        ' M src/index.ts',
        'M  package.json',
        '?? new-file.txt',
      ].join('\n');

      vi.mocked(sshService.execRemoteCommand).mockResolvedValueOnce({
        stdout: mockPorcelain,
        stderr: '',
        exitStatus: 0,
      });

      const status = await checkDirtyStatus(dummyConfig, '/var/repo');
      expect(status.isClean).toBe(false);
      expect(status.uncommittedFiles).toHaveLength(3);
      expect(status.uncommittedFiles).toEqual([
        { path: 'src/index.ts', indexStatus: ' ', workingTreeStatus: 'M' },
        { path: 'package.json', indexStatus: 'M', workingTreeStatus: ' ' },
        { path: 'new-file.txt', indexStatus: '?', workingTreeStatus: '?' },
      ]);
    });
  });
});
