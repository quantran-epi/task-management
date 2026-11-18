// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, realpathSync, existsSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import {
  mergeUncommittedFilesIntoTree,
  getRemoteFileContent,
  getRemoteWorkingFileContent,
  PathOutsideRepoError,
} from '../gitRemoteTreeService';
import * as gitRemoteService from '../gitRemoteService';
import * as sshService from '../sshService';
import type { SshConfig } from '../../types/ssh';

const mockConfig: SshConfig = {
  id: 'ssh-1',
  name: 'Dev',
  host: '10.0.0.1',
  port: 22,
  username: 'dev',
  authType: 'password',
  createdAt: '',
  updatedAt: '',
};

describe('gitRemoteTreeService uncommitted files & working copy fallback', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('mergeUncommittedFilesIntoTree correctly merges untracked and modified files', () => {
    const initialNodes = [
      { key: 'src', title: 'src', isLeaf: false, sha: 'tree-sha' },
      { key: 'package.json', title: 'package.json', isLeaf: true, sha: 'blob-sha' },
    ];

    const uncommitted = [
      { path: 'package.json', indexStatus: ' ', workingTreeStatus: 'M' },
      { path: 'src/new-feature.ts', indexStatus: '?', workingTreeStatus: '?' },
      { path: 'notes.txt', indexStatus: '?', workingTreeStatus: '?' },
    ];

    const merged = mergeUncommittedFilesIntoTree(initialNodes, uncommitted);

    const pkg = merged.find((n) => n.title === 'package.json');
    expect(pkg?.gitStatus).toBe('M');

    const src = merged.find((n) => n.title === 'src');
    expect(src?.gitStatus).toBe('M');

    const notes = merged.find((n) => n.title === 'notes.txt');
    expect(notes).toBeDefined();
    expect(notes?.isLeaf).toBe(true);
    expect(notes?.gitStatus).toBe('?');
  });

  it('getRemoteFileContent falls back only when the literal probe exits 1', async () => {
    vi.spyOn(gitRemoteService, 'runGitCommand')
      .mockRejectedValueOnce(new Error("fatal: path 'untracked.ts' does not exist in 'main'"));

    vi.spyOn(sshService, 'execRemoteCommand')
      .mockResolvedValueOnce({ exitStatus: 1, stdout: '', stderr: 'untracked' })
      .mockResolvedValueOnce({
      exitStatus: 0,
      stdout: 'console.log("untracked fallback content");',
      stderr: '',
    });

    const content = await getRemoteFileContent(mockConfig, '/home/dev/repo', 'main', 'untracked.ts');
    expect(content).toBe('console.log("untracked fallback content");');
    expect(sshService.execRemoteCommand).toHaveBeenCalledWith(
      mockConfig,
      expect.stringContaining('cat -- "$target"'),
      undefined
    );
  });
});

describe('round 3: real shell commands through execRemoteCommand', () => {
  let sandbox: string;
  let repo: string;
  let outside: string;
  const commands: string[] = [];
  let shellPrefix: string;
  let failProbe: 'exit' | 'ssh' | undefined;
  let failRead: boolean;

  function shell(command: string) {
    const result = spawnSync('/bin/sh', ['-c', command], {
      cwd: sandbox, encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' },
    });
    if (result.error) throw result.error;
    return { stdout: result.stdout, stderr: result.stderr, exitStatus: result.status ?? 255 };
  }

  function git(...args: string[]) {
    const result = spawnSync('git', ['-C', repo, ...args], {
      cwd: sandbox, encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' },
    });
    if (result.error) throw result.error;
    expect(result.status, result.stderr).toBe(0);
    return result.stdout;
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    sandbox = mkdtempSync(join(tmpdir(), 'git-read-round3-'));
    // Shell pattern metacharacters, quotes, substitution syntax and trailing newline in root.
    repo = join(sandbox, "repo '[x] $(touch PWNED);\n");
    outside = `${repo}-sibling`;
    mkdirSync(repo);
    mkdirSync(outside);
    writeFileSync(join(outside, 'secret.txt'), 'SECRET-OUTSIDE');
    writeFileSync(join(repo, 'tracked.txt'), 'committed');
    writeFileSync(join(repo, 'empty.txt'), '');
    git('init', '-q');
    git('add', '--', 'tracked.txt', 'empty.txt');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'seed');
    commands.length = 0;
    shellPrefix = '';
    failProbe = undefined;
    failRead = false;
    vi.spyOn(sshService, 'execRemoteCommand').mockImplementation(async (_config, command) => {
      commands.push(command);
      if (command.includes(' ls-files ') && failProbe) {
        if (failProbe === 'ssh') throw new Error('SSH disconnected');
        return { stdout: '', stderr: 'fatal: probe unavailable', exitStatus: 128 };
      }
      if (command.startsWith('root=') && failRead) throw new Error('SSH read disconnected');
      return shell(shellPrefix + command);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(sandbox, { recursive: true, force: true });
  });

  it.each([true, false])('refuses parent symlink escape (tracked=%s); old leaf guard leaks', async (tracked) => {
    symlinkSync(outside, join(repo, 'linkdir'));
    if (tracked) {
      git('add', '--', 'linkdir');
      git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'link');
    }
    const target = gitRemoteService.escapeShellArg(join(repo, 'linkdir/secret.txt'));
    // Reproduce the actual old vulnerability, not a mocked marker.
    expect(shell(`test -L ${target} && printf refused || cat -- ${target}`).stdout).toBe('SECRET-OUTSIDE');
    await expect(getRemoteFileContent(mockConfig, repo, 'HEAD', 'linkdir/secret.txt'))
      .rejects.toBeInstanceOf(PathOutsideRepoError);
    expect(commands).toHaveLength(3);
    expect(commands[1]).toContain('--literal-pathspecs ls-files --error-unmatch');
  });

  it('refuses leaf symlink escape in both working-file and fallback entry points', async () => {
    symlinkSync(join(outside, 'secret.txt'), join(repo, 'leak'));
    await expect(getRemoteWorkingFileContent(mockConfig, repo, 'leak'))
      .rejects.toBeInstanceOf(PathOutsideRepoError);
    await expect(getRemoteFileContent(mockConfig, repo, 'HEAD', 'leak'))
      .rejects.toBeInstanceOf(PathOutsideRepoError);
  });

  it('allows normal file with malicious filename and preserves former marker content', async () => {
    const name = "file ' $(touch PWNED); [x]\n";
    writeFileSync(join(repo, name), '__GIT_READ_SYMLINK_REFUSED__\n');
    await expect(getRemoteFileContent(mockConfig, repo, 'HEAD', name))
      .resolves.toBe('__GIT_READ_SYMLINK_REFUSED__\n');
    expect(existsSync(join(sandbox, 'PWNED'))).toBe(false);
  });

  it('canonicalizes symlinked repository root and accepts in-repo symlink targets', async () => {
    symlinkSync(repo, join(sandbox, 'repo-alias'));
    symlinkSync('tracked.txt', join(repo, 'inside'));
    await expect(getRemoteFileContent(mockConfig, join(sandbox, 'repo-alias'), 'HEAD', 'inside'))
      .resolves.toBe('committed');
  });

  it('handles relative repository root', async () => {
    writeFileSync(join(repo, 'normal.txt'), 'working');
    await expect(getRemoteFileContent(mockConfig, relative(sandbox, repo), 'HEAD', 'normal.txt'))
      .resolves.toBe('working');
  });

  it('handles filesystem root without a double-slash boundary', async () => {
    const file = join(repo, 'tracked.txt');
    await expect(getRemoteWorkingFileContent(mockConfig, '/', realpathSync(file).slice(1)))
      .resolves.toBe('committed');
  });

  it('fails closed when realpath is unavailable; cat never runs', async () => {
    writeFileSync(join(repo, 'normal.txt'), 'working');
    shellPrefix = 'realpath() { return 127; }; cat() { printf LEAK; }; ';
    await expect(getRemoteWorkingFileContent(mockConfig, repo, 'normal.txt'))
      .rejects.toThrow('Failed to read');
    await expect(getRemoteFileContent(mockConfig, repo, 'HEAD', 'normal.txt'))
      .rejects.toThrow('Failed to read');
  });

  it('fails closed when target realpath cannot resolve a dangling symlink', async () => {
    symlinkSync(join(outside, 'missing'), join(repo, 'dangling'));
    await expect(getRemoteWorkingFileContent(mockConfig, repo, 'dangling')).rejects.toThrow();
  });

  it.each(['*.txt', 'onl?.txt', '[missing].txt'])('missing literal glob %s never becomes empty success', async (name) => {
    // Demonstrate git show's false success in the same real repository.
    const old = shell(`git -C ${gitRemoteService.escapeShellArg(repo)} show --end-of-options ${gitRemoteService.escapeShellArg(`HEAD:${name}`)}`);
    expect(old.exitStatus).toBe(0);
    expect(old.stdout).toBe('');
    await expect(getRemoteFileContent(mockConfig, repo, 'HEAD', name)).rejects.toThrow();
  });

  it.each(['*.txt', 'onl?.txt', '[id].txt', ':(bad)x'])('reads untracked literal filename %s', async (name) => {
    writeFileSync(join(repo, name), `literal ${name}`);
    await expect(getRemoteFileContent(mockConfig, repo, 'HEAD', name)).resolves.toBe(`literal ${name}`);
    expect(commands[1]).toContain('--literal-pathspecs ls-files --error-unmatch');
  });

  it('reads committed glob filename literally, preserves empty blob and rejects option-shaped ref', async () => {
    writeFileSync(join(repo, '*.txt'), 'literal committed');
    git('add', '--', '*.txt');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'literal');
    await expect(getRemoteFileContent(mockConfig, repo, 'HEAD', '*.txt')).resolves.toBe('literal committed');
    await expect(getRemoteFileContent(mockConfig, repo, 'HEAD', 'empty.txt')).resolves.toBe('');
    await expect(getRemoteFileContent(mockConfig, repo, '--output=PWNED', 'tracked.txt')).rejects.toThrow();
    expect(existsSync(join(sandbox, 'PWNED'))).toBe(false);
    expect(commands).toHaveLength(3);
  });

  it('does not substitute working content for tracked-but-absent literal glob', async () => {
    const oldRef = git('rev-parse', 'HEAD').trim();
    writeFileSync(join(repo, '*.txt'), 'new branch content');
    git('add', '--', '*.txt');
    await expect(getRemoteFileContent(mockConfig, repo, oldRef, '*.txt')).rejects.toThrow('not in');
    expect(commands).toHaveLength(2);
  });

  it.each(['exit', 'ssh'] as const)('propagates probe infrastructure failure (%s), never reads working file', async (failure) => {
    writeFileSync(join(repo, 'normal.txt'), 'working');
    failProbe = failure;
    await expect(getRemoteFileContent(mockConfig, repo, 'HEAD', 'normal.txt'))
      .rejects.toThrow(failure === 'ssh' ? 'SSH disconnected' : 'probe unavailable');
    expect(commands).toHaveLength(2);
  });

  it('propagates actual git exit 128 when repository disappears before probe', async () => {
    vi.spyOn(sshService, 'execRemoteCommand').mockImplementation(async (_config, command) => {
      commands.push(command);
      const result = shell(command);
      if (command.includes(' cat-file ')) renameSync(join(repo, '.git'), join(sandbox, 'hidden-git'));
      return result;
    });
    writeFileSync(join(repo, 'normal.txt'), 'working');
    await expect(getRemoteFileContent(mockConfig, repo, 'HEAD', 'normal.txt'))
      .rejects.toThrow('not a git repository');
    expect(commands).toHaveLength(2);
  });

  it('never executes repository fsmonitor hooks during status or untracked-file probes', async () => {
    const marker = join(sandbox, 'FS_MONITOR_RAN');
    const hook = join(sandbox, 'monitor.sh');
    writeFileSync(hook, `#!/bin/sh\nprintf ran > ${gitRemoteService.escapeShellArg(marker)}\nprintf '\\0'\n`, { mode: 0o700 });
    git('config', 'core.fsmonitor', hook);
    // Prove this environment executes the configured hook without our guard.
    git('status', '--porcelain=v1', '-z');
    expect(existsSync(marker)).toBe(true);
    rmSync(marker);
    await gitRemoteService.checkDirtyStatus(mockConfig, repo);
    expect(existsSync(marker)).toBe(false);
    writeFileSync(join(repo, 'untracked.txt'), 'working');
    await expect(getRemoteFileContent(mockConfig, repo, 'HEAD', 'untracked.txt')).resolves.toBe('working');
    expect(existsSync(marker)).toBe(false);
  });

  it('diffs only the requested literal bracket filename, never a matching sibling', async () => {
    mkdirSync(join(repo, 'app'));
    for (const name of ['[id].tsx', 'i.tsx']) writeFileSync(join(repo, 'app', name), 'old\n');
    git('add', '--', 'app');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'base');
    const base = git('rev-parse', 'HEAD').trim();
    writeFileSync(join(repo, 'app', '[id].tsx'), 'literal-change\n');
    writeFileSync(join(repo, 'app', 'i.tsx'), 'sibling-change\n');
    git('add', '--', 'app');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'target');
    const diff = await gitRemoteService.getFileDiff(mockConfig, repo, base, 'HEAD', 'app/[id].tsx');
    expect(diff).toContain('+literal-change');
    expect(diff).not.toContain('sibling-change');
    expect(diff.match(/^diff --git /gm)).toHaveLength(1);
    await expect(gitRemoteService.getFileDiff(mockConfig, repo, base, 'HEAD', ':(top)*')).resolves.toBe('');
  });

  it('propagates SSH failure during working-file read', async () => {
    writeFileSync(join(repo, 'normal.txt'), 'working');
    failRead = true;
    await expect(getRemoteFileContent(mockConfig, repo, 'HEAD', 'normal.txt'))
      .rejects.toThrow('SSH read disconnected');
  });
});
