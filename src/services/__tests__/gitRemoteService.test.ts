import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { SshConfig } from '../../types/ssh';
import {
  escapeShellArg,
  runGitCommand,
  getRemoteBranches,
  checkDirtyStatus,
  getCommitLog,
  getRecentCommits,
  getDiffSummary,
  getFileDiff,
  checkHeadDrift,
  parseNumstatZ,
  parseNameStatusZ,
  grepRemoteRef,
  GREP_MATCH_LIMIT_CEILING,
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
        "git -C '/var/repo' -c core.fsmonitor=false --no-pager --version",
        undefined,
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

    it('parses uncommitted files from porcelain -z output', async () => {
      // WR-03: `-z` is NUL-separated and never quotes, so a path with spaces arrives intact.
      const mockPorcelain = [' M src/index.ts', 'M  package.json', '?? new-file.txt'].join('\0');

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
      expect(sshService.execRemoteCommand).toHaveBeenCalledWith(
        dummyConfig,
        "git -C '/var/repo' -c core.fsmonitor=false --no-pager status --porcelain=v1 -z --untracked-files=all",
        undefined,
        undefined
      );
    });

    it('enumerates every untracked file instead of a collapsed ?? directory token', async () => {
      const mockPorcelain = ['?? newdir/deep.ts', '?? newdir/nested/leaf.ts'].join('\0');
      vi.mocked(sshService.execRemoteCommand).mockResolvedValueOnce({
        stdout: mockPorcelain,
        stderr: '',
        exitStatus: 0,
      });

      const status = await checkDirtyStatus(dummyConfig, '/var/repo');

      expect(status.uncommittedFiles).toEqual([
        { path: 'newdir/deep.ts', indexStatus: '?', workingTreeStatus: '?' },
        { path: 'newdir/nested/leaf.ts', indexStatus: '?', workingTreeStatus: '?' },
      ]);
      expect(sshService.execRemoteCommand).toHaveBeenCalledWith(
        dummyConfig,
        "git -C '/var/repo' -c core.fsmonitor=false --no-pager status --porcelain=v1 -z --untracked-files=all",
        undefined,
        undefined
      );
    });

    it('keeps a path with spaces intact and reads the target of a rename (WR-03)', async () => {
      // `R  new\0old\0` — the source token must not be reported as its own file.
      const mockPorcelain = ['R  renamed space.txt', 'plain space.txt'].join('\0');

      vi.mocked(sshService.execRemoteCommand).mockResolvedValueOnce({
        stdout: mockPorcelain,
        stderr: '',
        exitStatus: 0,
      });

      const status = await checkDirtyStatus(dummyConfig, '/var/repo');
      expect(status.uncommittedFiles).toEqual([
        { path: 'renamed space.txt', indexStatus: 'R', workingTreeStatus: ' ' },
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

      // 3. diff --numstat — `-z` shape, NUL-separated.
      const mockNumstat = ['10\t2\tsrc/payment.ts', '25\t0\tsrc/config.ts', '-\t-\tassets/logo.png'].join(
        '\0'
      );
      vi.mocked(sshService.execRemoteCommand).mockResolvedValueOnce({
        stdout: mockNumstat,
        stderr: '',
        exitStatus: 0,
      });

      // 4. diff --name-status — `-z` shape: `<status>\0<path>\0`.
      const mockNameStatus = ['M', 'src/payment.ts', 'A', 'src/config.ts', 'A', 'assets/logo.png'].join(
        '\0'
      );
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

    // WR-02: `--numstat` and `--name-status` disagree on rename shape unless both are `-z`.
    // A rename must be reported as `renamed` with the TARGET path, not `modified` with `a => b`.
    it('reports a rename as renamed with the target path (WR-02)', async () => {
      vi.mocked(sshService.execRemoteCommand).mockResolvedValueOnce({
        stdout: 'a1b2c3d4e5f60000000000000000000000000000\n',
        stderr: '',
        exitStatus: 0,
      });
      vi.mocked(sshService.execRemoteCommand).mockResolvedValueOnce({
        stdout: '',
        stderr: '',
        exitStatus: 0,
      });
      // `--numstat -z` for a rename: `0\t0\t\0old\0new\0`.
      vi.mocked(sshService.execRemoteCommand).mockResolvedValueOnce({
        stdout: '0\t0\t\0big.txt\0big2.txt\0',
        stderr: '',
        exitStatus: 0,
      });
      // `--name-status -z` for the same rename: `R100\0old\0new\0`.
      vi.mocked(sshService.execRemoteCommand).mockResolvedValueOnce({
        stdout: 'R100\0big.txt\0big2.txt\0',
        stderr: '',
        exitStatus: 0,
      });

      const summary = await getDiffSummary(dummyConfig, '/var/repo', 'main', 'feat2');
      expect(summary.files).toEqual([
        { path: 'big2.txt', status: 'renamed', additions: 0, deletions: 0 },
      ]);
    });

    // CR-01: the revision must follow `--end-of-options`, or a `-`-leading range is an option.
    it('puts --end-of-options before every revision argument (CR-01)', async () => {
      vi.mocked(sshService.execRemoteCommand).mockResolvedValue({
        stdout: '',
        stderr: '',
        exitStatus: 0,
      });

      await getDiffSummary(dummyConfig, '/var/repo', 'main', 'feature/pay');

      const commands = vi.mocked(sshService.execRemoteCommand).mock.calls.map((call) => call[1]);
      expect(commands[0]).toBe(
        "git -C '/var/repo' -c core.fsmonitor=false --no-pager rev-parse --verify --end-of-options 'feature/pay'"
      );
      expect(commands[2]).toBe(
        "git -C '/var/repo' -c core.fsmonitor=false --no-pager diff --numstat -z -M --no-ext-diff --no-textconv " +
          "--end-of-options 'main..feature/pay'"
      );
      expect(commands[3]).toBe(
        "git -C '/var/repo' -c core.fsmonitor=false --no-pager diff --name-status -z -M --no-ext-diff --no-textconv " +
          "--end-of-options 'main..feature/pay'"
      );
    });
  });

  describe('parseNumstatZ', () => {
    // WR-04: `-z` leaves the path verbatim, so a tab inside a filename is not a field separator.
    it('keeps a path containing a tab intact', () => {
      expect(parseNumstatZ('1\t0\ttab\tname.txt\0')).toEqual([
        { path: 'tab\tname.txt', additions: 1, deletions: 0 },
      ]);
    });

    it('still parses a rename and a binary file', () => {
      expect(parseNumstatZ('0\t0\t\0old.txt\0new.txt\0')).toEqual([
        { path: 'new.txt', additions: 0, deletions: 0 },
      ]);
      expect(parseNumstatZ('-\t-\tassets/logo.png\0')).toEqual([
        { path: 'assets/logo.png', additions: 0, deletions: 0 },
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
        "git -C '/var/repo' -c core.fsmonitor=false --no-pager --literal-pathspecs diff --no-ext-diff --no-textconv " +
          "--end-of-options 'main..feature/pay' -- 'src/a.ts'",
        undefined,
        undefined
      );
      expect(diff).toBe(mockDiff);
    });
  });

  describe('parseNameStatusZ — IN-03 copy mapping', () => {
    it('maps a copy (C) record to added, not modified', () => {
      // `<C100>\0<old>\0<new>\0` — target path is the third token.
      const output = 'C100\0src/old.ts\0src/copy.ts\0A\0src/new.ts\0M\0src/mod.ts\0';
      expect(parseNameStatusZ(output)).toEqual([
        { path: 'src/copy.ts', status: 'added' },
        { path: 'src/new.ts', status: 'added' },
        { path: 'src/mod.ts', status: 'modified' },
      ]);
    });
  });

  describe('getRecentCommits — WR-05 limit normalization', () => {
    it('normalizes a numeric-string limit and clamps to 1..100 before shell interpolation', async () => {
      vi.mocked(sshService.execRemoteCommand).mockResolvedValueOnce({
        stdout: '',
        stderr: '',
        exitStatus: 0,
      });

      await getRecentCommits(dummyConfig, '/var/repo', 'main', 500 as unknown as number);
      expect(sshService.execRemoteCommand).toHaveBeenCalledWith(
        dummyConfig,
        "git -C '/var/repo' -c core.fsmonitor=false --no-pager log -n '100' --format='%x1e%H%x00%h%x00%an%x00%ad%x00%s' --date=iso --end-of-options 'main'",
        undefined,
        undefined
      );
    });

    it('cannot inject shell syntax through a non-numeric limit', async () => {
      vi.mocked(sshService.execRemoteCommand).mockResolvedValueOnce({
        stdout: '',
        stderr: '',
        exitStatus: 0,
      });

      await getRecentCommits(dummyConfig, '/var/repo', 'main', '1; touch /tmp/pwned #' as unknown as number);
      const cmd = vi.mocked(sshService.execRemoteCommand).mock.calls[0]![1];
      expect(cmd).not.toContain('touch /tmp/pwned');
      expect(cmd).toContain("-n '20'"); // NaN -> default 20
    });
  });

  describe('grepRemoteRef — D-09/D-10 tracer slice', () => {
    const grepMock = () =>
      vi.mocked(sshService.execRemoteCommand).mockResolvedValue({
        stdout: '',
        stderr: '###EXIT 1\n',
        exitStatus: 0,
      });

    const records = (n: number): string =>
      Array.from({ length: n }, (_, i) => `HEAD:src/f${i}.ts\0${i + 1}\0needle\n`).join('');

    it('exports a 2000 ceiling and accepts a 2000 limit with escaping flags intact', async () => {
      expect(GREP_MATCH_LIMIT_CEILING).toBe(2000);
      grepMock();

      const result = await grepRemoteRef(
        dummyConfig,
        '/var/repo',
        'main',
        { pattern: 'needle', limit: 2000, literal: true, caseSensitive: true, path: 'src' },
        undefined,
        'call-find-1'
      );

      expect(result).toEqual({ hits: [], truncated: false });
      // Whole-command `toBe` proof (Phase 42 D-08) — containment checks are vacuous because
      // escaping preserves the payload text inside the quotes.
      expect(sshService.execRemoteCommand).toHaveBeenCalledWith(
        dummyConfig,
        "{ git -C '/var/repo' -c core.fsmonitor=false --no-pager grep -z -n -I --no-color -F --no-ignore-case -e 'needle' --end-of-options 'main' -- 'src'; printf '###EXIT %s\\n' \"$?\" >&2; } | head -c 262145",
        undefined,
        'call-find-1'
      );
    });

    it('uses extended regex (-E) in regex mode so ERE constructs match', async () => {
      grepMock();

      await grepRemoteRef(dummyConfig, '/var/repo', 'main', {
        pattern: 'foo|bar',
        limit: 2000,
        // literal omitted => regex mode
      });

      // -E (not bare BRE) aligns remote matching with the client JS regex highlighter.
      expect(sshService.execRemoteCommand).toHaveBeenCalledWith(
        dummyConfig,
        "{ git -C '/var/repo' -c core.fsmonitor=false --no-pager grep -z -n -I --no-color -E --no-ignore-case -e 'foo|bar' --end-of-options 'main'; printf '###EXIT %s\\n' \"$?\" >&2; } | head -c 262145",
        undefined,
        undefined
      );
    });

    it('adds -w for whole-word matching in both literal and regex modes', async () => {
      grepMock();

      await grepRemoteRef(dummyConfig, '/var/repo', 'main', {
        pattern: 'cat',
        limit: 2000,
        literal: true,
        words: true,
      });
      expect(sshService.execRemoteCommand).toHaveBeenCalledWith(
        dummyConfig,
        "{ git -C '/var/repo' -c core.fsmonitor=false --no-pager grep -z -n -I --no-color -F -w --no-ignore-case -e 'cat' --end-of-options 'main'; printf '###EXIT %s\\n' \"$?\" >&2; } | head -c 262145",
        undefined,
        undefined
      );

      grepMock();
      await grepRemoteRef(dummyConfig, '/var/repo', 'main', {
        pattern: 'cat',
        limit: 2000,
        words: true,
      });
      expect(sshService.execRemoteCommand).toHaveBeenCalledWith(
        dummyConfig,
        "{ git -C '/var/repo' -c core.fsmonitor=false --no-pager grep -z -n -I --no-color -E -w --no-ignore-case -e 'cat' --end-of-options 'main'; printf '###EXIT %s\\n' \"$?\" >&2; } | head -c 262145",
        undefined,
        undefined
      );
    });

    it('clamps a limit above 2000 to 2000 and flags truncation', async () => {
      vi.mocked(sshService.execRemoteCommand).mockResolvedValueOnce({
        stdout: records(2002),
        stderr: '###EXIT 1\n',
        exitStatus: 0,
      });

      const result = await grepRemoteRef(dummyConfig, '/var/repo', 'HEAD', {
        pattern: 'needle',
        limit: 5000,
      });

      expect(result.hits).toHaveLength(2000);
      expect(result.truncated).toBe(true);
    });

    it('keeps a leading-dash pattern, ref and path as escaped DATA, never git options', async () => {
      grepMock();

      await grepRemoteRef(dummyConfig, '/var/repo', '--output=/tmp/pwn', {
        pattern: "'; rm -rf /; '",
        limit: 2000,
        literal: true,
        caseSensitive: true,
        path: '--foo',
      });

      expect(sshService.execRemoteCommand).toHaveBeenCalledWith(
        dummyConfig,
        "{ git -C '/var/repo' -c core.fsmonitor=false --no-pager grep -z -n -I --no-color -F --no-ignore-case -e ''\\''; rm -rf /; '\\''' --end-of-options '--output=/tmp/pwn' -- '--foo'; printf '###EXIT %s\\n' \"$?\" >&2; } | head -c 262145",
        undefined,
        undefined
      );
    });

    it('reports oversized grep output as truncated truthfully', async () => {
      const hugeText = 'x'.repeat(262200);
      vi.mocked(sshService.execRemoteCommand).mockResolvedValueOnce({
        stdout: `HEAD:src/big.ts\0${1}\0${hugeText}\n`,
        stderr: '###EXIT 1\n',
        exitStatus: 0,
      });

      const result = await grepRemoteRef(dummyConfig, '/var/repo', 'HEAD', {
        pattern: 'x',
        limit: 2000,
      });
      expect(result.hits).toHaveLength(1);
      expect(result.truncated).toBe(true);
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
});
