// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { grepRemoteRef, InvalidGrepPatternError } from '../../../src/services/gitRemoteService';
import { readRemoteFilePage } from '../../../src/services/gitRemoteTreeService';
import * as sshService from '../../../src/services/sshService';
import type { SshConfig } from '../../../src/types/ssh';

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

// No `realpath` shim: the production snippet uses plain POSIX `realpath --`, so the harness
// runs the real binary. A shim here would hide exactly the portability defect this suite is
// meant to catch (commit 49a0dbd4).

describe('remote read pipelines against a real git repository', () => {
  let sandbox: string;
  let repo: string;

  function shell(command: string) {
    const result = spawnSync('/bin/sh', ['-c', command], {
      cwd: sandbox,
      encoding: 'utf8',
      env: { ...process.env, LC_ALL: 'C' },
    });
    if (result.error) throw result.error;
    return { stdout: result.stdout, stderr: result.stderr, exitStatus: result.status ?? 255 };
  }

  function git(...args: string[]) {
    const result = spawnSync('git', ['-C', repo, ...args], {
      cwd: sandbox,
      encoding: 'utf8',
      env: { ...process.env, LC_ALL: 'C' },
    });
    if (result.error) throw result.error;
    expect(result.status, result.stderr).toBe(0);
    return result.stdout;
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    sandbox = mkdtempSync(join(tmpdir(), 'git-read-pipeline-'));
    repo = join(sandbox, 'repo');
    mkdirSync(repo);
    mkdirSync(join(repo, 'src'));
    mkdirSync(join(repo, 'docs'));
    mkdirSync(join(repo, 'bin'));

    const aLines: string[] = [];
    for (let n = 1; n <= 300; n++) {
      aLines.push(n === 42 ? "const NEEDLE = 'alpha';" : `const line${n} = ${n};`);
    }
    writeFileSync(join(repo, 'src/a.ts'), aLines.join('\n') + '\n');
    writeFileSync(join(repo, 'src/b.ts'), 'one\ntwo\nthree\nfour\nfive\n');
    writeFileSync(join(repo, 'docs/notes.md'), 'NEEDLE first\nfiller\nNEEDLE second\n');
    writeFileSync(join(repo, 'bin/blob.bin'), Buffer.from([0x00, ...Array(511).fill(0x41)]));

    git('init', '-q');
    git('add', '-A');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'seed');
    // A second commit so HEAD~1 exists and HEAD stays stable for the assertions below.
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-q', '--allow-empty', '-m', 'noop');

    vi.spyOn(sshService, 'execRemoteCommand').mockImplementation(async (_config, command) =>
      shell(command)
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('finds a symbol across the ref with 1-based line numbers', async () => {
    const { hits, truncated } = await grepRemoteRef(mockConfig, repo, 'HEAD', { pattern: 'NEEDLE' });

    expect(truncated).toBe(false);
    // git grep orders by path, not by creation order.
    expect(hits.map((h) => h.path)).toEqual(['docs/notes.md', 'docs/notes.md', 'src/a.ts']);
    expect(hits.map((h) => h.line)).toEqual([1, 3, 42]);
    expect(hits[2]!.text).toBe("const NEEDLE = 'alpha';");
  });

  it('treats zero matches as an empty result, not a failure', async () => {
    const result = await grepRemoteRef(mockConfig, repo, 'HEAD', { pattern: 'ZZZ_NO_SUCH_SYMBOL' });

    expect(result.hits).toEqual([]);
    expect(result.truncated).toBe(false);
  });

  it('caps hits at limit and reports truncation', async () => {
    const { hits, truncated } = await grepRemoteRef(mockConfig, repo, 'HEAD', {
      pattern: 'NEEDLE',
      limit: 1,
    });

    expect(hits).toHaveLength(1);
    expect(truncated).toBe(true);
  });

  it('keeps a hit whose path contains a newline in one record', async () => {
    writeFileSync(join(repo, 'we\nird.txt'), 'alpha NEEDLE\n');
    git('add', '-A');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'weird');

    const { hits } = await grepRemoteRef(mockConfig, repo, 'HEAD', { pattern: 'NEEDLE' });

    // A newline ends a record only when the line field is numeric; the newline inside this
    // path must not split it into a bogus hit.
    expect(hits.map((h) => h.path)).toContain('we\nird.txt');
    expect(hits.every((h) => h.text.includes('NEEDLE'))).toBe(true);
  });

  it('reports a malformed regex as the caller\'s argument mistake', async () => {
    // git: "fatal: -e option, 'a[': brackets ([ ]) not balanced", exit 128.
    await expect(
      grepRemoteRef(mockConfig, repo, 'HEAD', { pattern: 'a[' })
    ).rejects.toBeInstanceOf(InvalidGrepPatternError);
  });

  it('restricts the search to a path', async () => {
    const { hits } = await grepRemoteRef(mockConfig, repo, 'HEAD', {
      pattern: 'NEEDLE',
      path: 'docs',
    });

    expect(hits.map((h) => h.path)).toEqual(['docs/notes.md', 'docs/notes.md']);
  });

  it('matches case-insensitively when asked', async () => {
    const { hits } = await grepRemoteRef(mockConfig, repo, 'HEAD', {
      pattern: 'needle',
      caseSensitive: false,
    });

    expect(hits).toHaveLength(3);
  });

  it('returns one page plus the total line count', async () => {
    const page = await readRemoteFilePage(mockConfig, repo, 'HEAD', 'src/a.ts', 41, 3);

    expect(page.linesRead).toBe(3);
    expect(page.lines[0]).toBe('41: const line41 = 41;');
    expect(page.totalLines).toBe(300);
    expect(page.hasMore).toBe(true);
    expect(page.isBinary).toBe(false);
  });

  it('keeps blank lines so a page of blank lines still advances', async () => {
    writeFileSync(join(repo, 'blank.txt'), '\n\n\n\n\n');
    git('add', '-A');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'blank');

    const page = await readRemoteFilePage(mockConfig, repo, 'HEAD', 'blank.txt', 1, 2);

    // Dropping empty lines reported linesRead 0 with hasMore true, so nextOffset never moved.
    expect(page.linesRead).toBe(2);
    expect(page.hasMore).toBe(true);
  });

  it('reports hasMore false on the last page', async () => {
    const page = await readRemoteFilePage(mockConfig, repo, 'HEAD', 'src/a.ts', 299, 10);

    expect(page.linesRead).toBe(2);
    expect(page.hasMore).toBe(false);
    expect(page.lines[1]).toBe('300: const line300 = 300;');
  });

  it('reports a binary blob instead of dumping its bytes', async () => {
    const page = await readRemoteFilePage(mockConfig, repo, 'HEAD', 'bin/blob.bin', 1, 10);

    expect(page.isBinary).toBe(true);
    expect(page.lines).toEqual([]);
    expect(page.linesRead).toBe(0);
  });

  it('falls back to the working copy for a file not in the ref', async () => {
    writeFileSync(join(repo, 'untracked.txt'), 'alpha\nbeta\ngamma\n');

    const page = await readRemoteFilePage(mockConfig, repo, 'HEAD', 'untracked.txt', 1, 2);

    expect(page.totalLines).toBe(3);
    expect(page.lines).toEqual(['1: alpha', '2: beta']);
    expect(page.hasMore).toBe(true);
  });
});
