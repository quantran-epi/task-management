// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, realpathSync, existsSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import {
  mergeUncommittedFilesIntoTree,
  getRemoteFileContent,
  getRemoteTree,
  getRemoteWorkingFileContent,
  PathOutsideRepoError,
  searchRemoteTree,
  clearSearchTreeCache,
  SEARCH_RESULT_LIMIT,
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

  it('materializes the full folder chain for a staged-new nested file', () => {
    const merged = mergeUncommittedFilesIntoTree(
      [],
      [{ path: 'config/app/feature.ts', indexStatus: 'A', workingTreeStatus: 'M' }]
    );
    const config = merged.find((n) => n.title === 'config');
    expect(config?.isLeaf).toBe(false);
    const app = config?.children?.find((n) => n.title === 'app');
    expect(app?.isLeaf).toBe(false);
    const file = app?.children?.find((n) => n.title === 'feature.ts');
    expect(file?.isLeaf).toBe(true);
    expect(file?.gitStatus).toBe('AM');
    expect(file?.key).toBe('config/app/feature.ts');
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
      undefined,
      undefined
    );
  });
});

describe('searchRemoteTree', () => {
  const lsTreeOutput = [
    '100644 blob abc123 120\tREADME.md',
    '100644 blob def456 2048\tsrc/index.ts',
    '100644 blob fed789 512\tsrc/nested/INDEX.ts',
    '040000 tree aaa111 -\tsrc/nested',
  ].join('\0');

  beforeEach(() => {
    vi.restoreAllMocks();
    clearSearchTreeCache();
  });

  it('issues one confined ls-tree -r command and returns bounded file/folder matches', async () => {
    const cmdSpy = vi.spyOn(gitRemoteService, 'runGitCommand').mockResolvedValue(lsTreeOutput);

    const results = await searchRemoteTree(
      mockConfig,
      '/home/dev/repo',
      'main',
      'INDEX',
      'secret-123'
    );

    expect(cmdSpy).toHaveBeenCalledTimes(1);
    const args = cmdSpy.mock.calls[0]![2] as string[];
    expect(args).toEqual(['ls-tree', '-r', '-l', '-z', '--end-of-options', "'main'"]);
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'src/index.ts', name: 'index.ts', type: 'file' }),
        expect.objectContaining({ path: 'src/nested/INDEX.ts', name: 'INDEX.ts', type: 'file' }),
      ])
    );
    // Folder ancestors are represented as folder hits; data never reaches git.
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'src/nested', name: 'nested', type: 'folder' }),
      ])
    );
    for (const result of results) {
      expect(result.matchStart).toBeGreaterThanOrEqual(0);
      expect(result.matchStart + result.matchLength).toBeLessThanOrEqual(result.name.length);
    }
  });

  it('never interpolates a leading-dash or escaping query into the command', async () => {
    const cmdSpy = vi.spyOn(gitRemoteService, 'runGitCommand').mockResolvedValue(lsTreeOutput);

    await searchRemoteTree(mockConfig, '/home/dev/repo', 'main', '-rf /; rm -rf /', 'secret-123');

    const args = cmdSpy.mock.calls[0]![2] as string[];
    expect(args.join(' ')).not.toContain('rm -rf');
    expect(args).toEqual(['ls-tree', '-r', '-l', '-z', '--end-of-options', "'main'"]);
  });

  it('returns an empty result with an error flag on git failure', async () => {
    vi.spyOn(gitRemoteService, 'runGitCommand').mockRejectedValue(new Error('ssh down'));

    const results = await searchRemoteTree(mockConfig, '/home/dev/repo', 'main', 'index');

    expect(results).toEqual([]);
  });

  it('caps real file matches independently of ancestor folders', async () => {
    const lines: string[] = [];
    for (let i = 0; i < SEARCH_RESULT_LIMIT + 20; i++) {
      lines.push(`100644 blob sha${i} 10\tdir${i}/match${i}.ts`);
    }
    vi.spyOn(gitRemoteService, 'runGitCommand').mockResolvedValue(lines.join('\0'));

    const results = await searchRemoteTree(mockConfig, '/home/dev/repo', 'main', 'match');

    const files = results.filter((r) => r.type === 'file');
    const folders = results.filter((r) => r.type === 'folder');
    expect(files).toHaveLength(SEARCH_RESULT_LIMIT);
    expect(folders.length).toBeGreaterThan(0);
    // Ancestor folders are derived, confined, and never starve file results.
    expect(folders.every((f) => !f.path.includes('..'))).toBe(true);
    expect(results.every((r) => !r.path.includes('..'))).toBe(true);
    expect(gitRemoteService.runGitCommand).toHaveBeenCalledTimes(1);
  });

  it('finds staged and untracked files alongside the committed ref with one cached listing', async () => {
    vi.spyOn(gitRemoteService, 'runGitCommand').mockResolvedValue(lsTreeOutput);
    const statusSpy = vi.spyOn(gitRemoteService, 'getUncommittedFiles').mockResolvedValue([
      { path: 'newdir/deep/UNTRACKED_NEEDLE.ts', indexStatus: '?', workingTreeStatus: '?' },
      { path: 'staged/STAGED_NEEDLE.ts', indexStatus: 'A', workingTreeStatus: ' ' },
      { path: 'deleted/UNTRACKED_NEEDLE.ts', indexStatus: 'D', workingTreeStatus: ' ' },
    ]);

    const results = await searchRemoteTree(mockConfig, '/home/dev/repo', 'main', 'NEEDLE');
    const paths = results.map((r) => r.path);

    expect(paths).toContain('newdir/deep/UNTRACKED_NEEDLE.ts');
    expect(paths).toContain('newdir/deep');
    expect(paths).toContain('staged/STAGED_NEEDLE.ts');
    expect(paths).not.toContain('deleted/UNTRACKED_NEEDLE.ts');
    // The listing is cached per ref; dirty rows are re-fetched per query, not cached.
    await searchRemoteTree(mockConfig, '/home/dev/repo', 'main', 'NEEDLE2');
    expect(gitRemoteService.runGitCommand).toHaveBeenCalledTimes(1);
    expect(statusSpy).toHaveBeenCalledTimes(2);
  });

  it('reuses one whole-ref listing across queries but refetches on a new ref', async () => {
    const cmdSpy = vi.spyOn(gitRemoteService, 'runGitCommand').mockResolvedValue(lsTreeOutput);

    const indexResults = await searchRemoteTree(mockConfig, '/home/dev/repo', 'main', 'index');
    const readmeResults = await searchRemoteTree(mockConfig, '/home/dev/repo', 'main', 'readme');

    expect(cmdSpy).toHaveBeenCalledTimes(1);
    expect(indexResults.some((r) => r.name === 'index.ts')).toBe(true);
    expect(readmeResults.some((r) => r.name === 'README.md')).toBe(true);
    expect(readmeResults.some((r) => r.name === 'index.ts')).toBe(false);

    await searchRemoteTree(mockConfig, '/home/dev/repo', 'develop', 'index');
    expect(cmdSpy).toHaveBeenCalledTimes(2);
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

  async function getRemoteTreeLive(dirPath: string) {
    return await getRemoteTree(mockConfig, repo, 'HEAD', dirPath);
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

  it('materializes an untracked file inside an already-tracked folder when expanding that folder', async () => {
    mkdirSync(join(repo, 'tracked'));
    writeFileSync(join(repo, 'tracked', 'old.txt'), 'committed');
    git('add', '--', 'tracked');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'tracked');
    mkdirSync(join(repo, 'tracked', 'new'));
    writeFileSync(join(repo, 'tracked', 'new', 'untracked.ts'), 'brand new');

    const status = await gitRemoteService.checkDirtyStatus(mockConfig, repo);
    const raw = await getRemoteTreeLive('tracked');
    const merged = mergeUncommittedFilesIntoTree(raw, status.uncommittedFiles, 'tracked');

    const newFolder = merged.find((n) => n.title === 'new');
    expect(newFolder?.isLeaf).toBe(false);
    expect(newFolder?.children?.some((n) => n.title === 'untracked.ts' && n.gitStatus === '?')).toBe(true);
  });

  it('enumerates and materializes a nested untracked directory chain two levels deep', async () => {
    mkdirSync(join(repo, 'newdir', 'deep'), { recursive: true });
    writeFileSync(join(repo, 'newdir', 'deep', 'leaf.ts'), 'brand new');

    const status = await gitRemoteService.checkDirtyStatus(mockConfig, repo);
    expect(status.uncommittedFiles).toEqual([
      { path: 'newdir/deep/leaf.ts', indexStatus: '?', workingTreeStatus: '?' },
    ]);
    expect(status.uncommittedFiles.some((row) => row.path.endsWith('/'))).toBe(false);

    const merged = mergeUncommittedFilesIntoTree([], status.uncommittedFiles);
    const newdir = merged.find((n) => n.title === 'newdir');
    const deep = newdir?.children?.find((n) => n.title === 'deep');
    expect(deep?.children?.some((n) => n.title === 'leaf.ts' && n.gitStatus === '?')).toBe(true);
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
    expect(commands.some((c) => c.includes('--literal-pathspecs ls-files --error-unmatch'))).toBe(true);
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
    expect(commands.some((c) => c.includes('--literal-pathspecs ls-files --error-unmatch'))).toBe(true);
  });

  it('reads committed glob filename literally, preserves empty blob and rejects option-shaped ref', async () => {
    writeFileSync(join(repo, '*.txt'), 'literal committed');
    git('add', '--', '*.txt');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'literal');
    await expect(getRemoteFileContent(mockConfig, repo, 'HEAD', '*.txt')).resolves.toBe('literal committed');
    await expect(getRemoteFileContent(mockConfig, repo, 'HEAD', 'empty.txt')).resolves.toBe('');
    await expect(getRemoteFileContent(mockConfig, repo, '--output=PWNED', 'tracked.txt')).rejects.toThrow();
    expect(existsSync(join(sandbox, 'PWNED'))).toBe(false);
    expect(commands.some((c) => c.includes("cat-file -p --end-of-options 'HEAD:"))).toBe(true);
  });

  it('reads a staged-new literal glob from the working copy (AM case)', async () => {
    const oldRef = git('rev-parse', 'HEAD').trim();
    writeFileSync(join(repo, '*.txt'), 'new branch content');
    git('add', '--', '*.txt');
    writeFileSync(join(repo, '*.txt'), 'new branch content (edited after stage)');
    await expect(getRemoteFileContent(mockConfig, repo, oldRef, '*.txt'))
      .resolves.toBe('new branch content (edited after stage)');
  });

  it('reads the current working copy for a tracked file staged then edited again (AM)', async () => {
    writeFileSync(join(repo, 'tracked.txt'), 'committed v2');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qam', 'update');
    writeFileSync(join(repo, 'tracked.txt'), 'working-edit');
    git('add', '--', 'tracked.txt');
    writeFileSync(join(repo, 'tracked.txt'), 'working-edit-2');
    await expect(getRemoteFileContent(mockConfig, repo, 'HEAD', 'tracked.txt'))
      .resolves.toBe('working-edit-2');
  });

  it('reads the current working copy for a modified tracked file ( M) and a staged-only change (M )', async () => {
    writeFileSync(join(repo, 'modified.txt'), 'committed');
    git('add', '--', 'modified.txt');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'tracked');
    writeFileSync(join(repo, 'modified.txt'), 'working-edit');
    await expect(getRemoteFileContent(mockConfig, repo, 'HEAD', 'modified.txt'))
      .resolves.toBe('working-edit');

    git('add', '--', 'modified.txt');
    await expect(getRemoteFileContent(mockConfig, repo, 'HEAD', 'modified.txt'))
      .resolves.toBe('working-edit');
  });

  it('does not substitute working content for a path present at HEAD but absent from an old ref (WR-01)', async () => {
    const oldRef = git('rev-parse', 'HEAD').trim();
    writeFileSync(join(repo, 'other-branch.txt'), 'content from another branch');
    git('add', '--', 'other-branch.txt');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'later');
    // Working copy holds the committed bytes; oldRef genuinely lacks the path. git status sees
    // no staged ADD, so the ref-missing error must survive.
    await expect(getRemoteFileContent(mockConfig, repo, oldRef, 'other-branch.txt'))
      .rejects.toThrow('not in');
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
