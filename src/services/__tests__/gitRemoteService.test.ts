import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { SshConfig } from '../../types/ssh';
import {
  escapeShellArg,
  runGitCommand,
  getRemoteBranches,
  checkDirtyStatus,
  getCommitLog,
  getDiffSummary,
  getFileDiff,
  checkHeadDrift,
  getProjectRepoSshBinding,
  saveProjectRepoSshBinding,
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

  describe('getCommitLog', () => {
    it('parses null-delimited log output into RemoteGitCommit array', async () => {
      const mockLogOutput = [
        '\x1ea1b2c3d4e5f60000000000000000000000000000\x00a1b2c3d\x00Alice\x002026-11-06 10:00:00 +0700\x00feat: add payment gateway',
        '\x1ef9e8d7c6b5a40000000000000000000000000000\x00f9e8d7c\x00Bob\x002026-11-06 11:30:00 +0700\x00fix: handle empty transaction\nwith multiple lines',
      ].join('\n');

      vi.mocked(sshService.execRemoteCommand).mockResolvedValueOnce({
        stdout: mockLogOutput,
        stderr: '',
        exitStatus: 0,
      });

      const commits = await getCommitLog(dummyConfig, '/var/repo', 'main', 'feature/pay');
      expect(commits).toHaveLength(2);
      expect(commits[0]).toEqual({
        sha: 'a1b2c3d4e5f60000000000000000000000000000',
        shortSha: 'a1b2c3d',
        author: 'Alice',
        date: '2026-11-06 10:00:00 +0700',
        message: 'feat: add payment gateway',
      });
      expect(commits[1]?.message).toBe('fix: handle empty transaction\nwith multiple lines');
    });
  });

  describe('getDiffSummary', () => {
    it('aggregates file stats and totals from diff numstat and name-status', async () => {
      // 1. rev-parse target
      vi.mocked(sshService.execRemoteCommand).mockResolvedValueOnce({
        stdout: 'a1b2c3d4e5f60000000000000000000000000000\n',
        stderr: '',
        exitStatus: 0,
      });

      // 2. getCommitLog
      vi.mocked(sshService.execRemoteCommand).mockResolvedValueOnce({
        stdout: 'a1b2c3d4e5f60000000000000000000000000000\x00a1b2c3d\x00Alice\x002026-11-06 10:00:00 +0700\x00feat: initial',
        stderr: '',
        exitStatus: 0,
      });

      // 3. diff --numstat
      const mockNumstat = [
        '10\t2\tsrc/payment.ts',
        '25\t0\tsrc/config.ts',
        '-\t-\tassets/logo.png',
      ].join('\n');
      vi.mocked(sshService.execRemoteCommand).mockResolvedValueOnce({
        stdout: mockNumstat,
        stderr: '',
        exitStatus: 0,
      });

      // 4. diff --name-status
      const mockNameStatus = [
        'M\tsrc/payment.ts',
        'A\tsrc/config.ts',
        'A\tassets/logo.png',
      ].join('\n');
      vi.mocked(sshService.execRemoteCommand).mockResolvedValueOnce({
        stdout: mockNameStatus,
        stderr: '',
        exitStatus: 0,
      });

      const summary = await getDiffSummary(dummyConfig, '/var/repo', 'main', 'feature/pay');
      expect(summary.baseBranch).toBe('main');
      expect(summary.targetBranch).toBe('feature/pay');
      expect(summary.headSha).toBe('a1b2c3d4e5f60000000000000000000000000000');
      expect(summary.commits).toHaveLength(1);
      expect(summary.files).toHaveLength(3);
      expect(summary.totalAdditions).toBe(35);
      expect(summary.totalDeletions).toBe(2);

      expect(summary.files).toEqual([
        { path: 'src/payment.ts', status: 'modified', additions: 10, deletions: 2 },
        { path: 'src/config.ts', status: 'added', additions: 25, deletions: 0 },
        { path: 'assets/logo.png', status: 'added', additions: 0, deletions: 0 },
      ]);
    });
  });

  describe('getFileDiff', () => {
    it('executes git diff for a single file', async () => {
      const mockDiff = 'diff --git a/src/a.ts b/src/a.ts\n+const a = 1;\n';
      vi.mocked(sshService.execRemoteCommand).mockResolvedValueOnce({
        stdout: mockDiff,
        stderr: '',
        exitStatus: 0,
      });

      const diff = await getFileDiff(dummyConfig, '/var/repo', 'main', 'feature/pay', 'src/a.ts');
      expect(sshService.execRemoteCommand).toHaveBeenCalledWith(
        dummyConfig,
        "git -C '/var/repo' --no-pager diff \"'main'..'feature/pay'\" -- 'src/a.ts'",
        undefined
      );
      expect(diff).toBe(mockDiff);
    });
  });

  describe('checkHeadDrift', () => {
    it('returns drifted: false when remote target rev matches expectedHeadSha', async () => {
      vi.mocked(sshService.execRemoteCommand).mockResolvedValueOnce({
        stdout: 'a1b2c3d4e5f60000000000000000000000000000\n',
        stderr: '',
        exitStatus: 0,
      });

      const res = await checkHeadDrift(
        dummyConfig,
        '/var/repo',
        'feature/pay',
        'a1b2c3d4e5f60000000000000000000000000000'
      );
      expect(res.drifted).toBe(false);
      expect(res.currentHeadSha).toBe('a1b2c3d4e5f60000000000000000000000000000');
    });

    it('returns drifted: true when remote target rev differs from expectedHeadSha', async () => {
      vi.mocked(sshService.execRemoteCommand).mockResolvedValueOnce({
        stdout: 'b2c3d4e5f6a10000000000000000000000000000\n',
        stderr: '',
        exitStatus: 0,
      });

      const res = await checkHeadDrift(
        dummyConfig,
        '/var/repo',
        'feature/pay',
        'a1b2c3d4e5f60000000000000000000000000000'
      );
      expect(res.drifted).toBe(true);
      expect(res.currentHeadSha).toBe('b2c3d4e5f6a10000000000000000000000000000');
    });
  });

  describe('project repo ssh binding persistence', () => {
    it('returns null when binding is not stored', async () => {
      const mockDb: any = {
        settings: {
          get: vi.fn().mockResolvedValueOnce(undefined),
        },
      };

      const binding = await getProjectRepoSshBinding('proj-123', mockDb);
      expect(binding).toBeNull();
      expect(mockDb.settings.get).toHaveBeenCalledWith('project_ssh_repo:proj-123');
    });

    it('saves and retrieves binding accurately', async () => {
      const storedData: Record<string, any> = {};
      const mockDb: any = {
        settings: {
          get: vi.fn().mockImplementation(async (key: string) => {
            return storedData[key] ? { key, value: storedData[key] } : undefined;
          }),
          put: vi.fn().mockImplementation(async ({ key, value }: { key: string; value: any }) => {
            storedData[key] = value;
          }),
        },
      };

      const testBinding = {
        sshConfigId: 'ssh-cfg-1',
        remoteRepoPath: '/var/www/repo',
        defaultBaseBranch: 'origin/develop',
        updatedAt: '2026-11-06T12:00:00.000Z',
      };

      await saveProjectRepoSshBinding('proj-123', testBinding, mockDb);
      expect(mockDb.settings.put).toHaveBeenCalledWith({
        key: 'project_ssh_repo:proj-123',
        value: testBinding,
      });

      const retrieved = await getProjectRepoSshBinding('proj-123', mockDb);
      expect(retrieved).toEqual(testBinding);
    });
  });
});
