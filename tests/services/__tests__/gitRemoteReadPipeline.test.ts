// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { grepRemoteRef, InvalidGrepPatternError } from '../../../src/services/gitRemoteService';
import {
  readRemoteFilePage,
  PathOutsideRepoError,
} from '../../../src/services/gitRemoteTreeService';
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

  it('reports truncation for a multibyte stream cut at the byte cap', async () => {
    // The cap is BYTES; `String.length` is UTF-16 units, so a Vietnamese page measures ~152k
    // chars for 262144 bytes and the old `>= cap` test never fired.
    const line = 'đường_dẫn_tiếng_việt_'.repeat(20);
    for (let n = 0; n < 4000; n++) writeFileSync(join(repo, `u${n}.txt`), `${line}\n`);
    git('add', '-A');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'multi');

    const { hits, truncated } = await grepRemoteRef(mockConfig, repo, 'HEAD', {
      pattern: 'đường',
      limit: 200,
    });

    expect(truncated).toBe(true);
    expect(hits.length).toBeGreaterThan(0);
  });

  it('reports truncation when the byte cap lands exactly on a record boundary', async () => {
    // 133 records of exactly 2048 bytes: `head -c` cuts cleanly after 128, nothing is dropped
    // mid-record, so only an explicit signal can say the result is incomplete.
    for (let n = 0; n < 133; n++) {
      writeFileSync(join(repo, `r${String(n).padStart(3, '0')}.txt`), `${'x'.repeat(2040)}NEEDLE\n`);
    }
    git('add', '-A');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'boundary');

    const { hits, truncated } = await grepRemoteRef(mockConfig, repo, 'HEAD', {
      pattern: 'NEEDLE',
      limit: 200,
    });

    expect(hits.length).toBeLessThan(133);
    expect(truncated).toBe(true);
  });

  it('fails closed when the remote never reports an exit status', async () => {
    // A dropped SSH channel leaves a partial stream. Defaulting to exit 0 would present it as
    // a complete result.
    vi.mocked(sshService.execRemoteCommand).mockResolvedValueOnce({
      stdout: 'HEAD:a.txt\u00001\u0000hi\n',
      stderr: '',
      exitStatus: 0,
    });

    await expect(
      grepRemoteRef(mockConfig, repo, 'HEAD', { pattern: 'hi' })
    ).rejects.toThrow(/mã thoát/);
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

  it('bounds a page by bytes, not just by line count', async () => {
    // A minified bundle is one line of megabytes: 200 "lines" would still be the whole file.
    writeFileSync(join(repo, 'min.js'), 'x'.repeat(500_000) + '\n');
    git('add', '-A');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'min');

    const page = await readRemoteFilePage(mockConfig, repo, 'HEAD', 'min.js', 1, 200);

    expect(page.linesRead).toBe(1);
    expect(page.lines[0]!.length).toBeLessThan(5000);
    expect(page.hasMore).toBe(false);
  });

  it('stops the page at the byte cap instead of skipping a line', async () => {
    // A skipped line is unreachable forever: nextOffset counts emitted lines, so the page must
    // stay a contiguous prefix.
    const lines: string[] = [];
    // Every line is large enough that 250 of them exceed the 256 KB page budget.
    for (let n = 1; n <= 250; n++) lines.push(`${n}:`.padEnd(2000, 'Z'));
    writeFileSync(join(repo, 'mixed.txt'), lines.join('\n') + '\n');
    git('add', '-A');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'mixed');

    const page = await readRemoteFilePage(mockConfig, repo, 'HEAD', 'mixed.txt', 1, 250);

    const lastNumber = Number(page.lines[page.lines.length - 1]!.split(':')[0]);
    // A hole would show up as a jump in the numbering.
    expect(page.lines.map((l) => Number(l.split(':')[0]))).toEqual(
      Array.from({ length: lastNumber }, (_, i) => i + 1)
    );
    expect(page.hasMore).toBe(true);
    // The page stopped early, but the file's real size must still be reported: `exit` in awk
    // reported the cut line as the total, so the model was told a 250-line file had 130.
    expect(page.totalLines).toBe(250);
  });

  it('fails closed when the pager never reports an exit status', async () => {
    // Without the marker `###TOTAL` never ran either, so totalLines would be 0 and hasMore
    // false — a short page labelled as the whole file.
    vi.mocked(sshService.execRemoteCommand).mockResolvedValueOnce({
      stdout: '',
      stderr: '',
      exitStatus: 1,
    });
    vi.mocked(sshService.execRemoteCommand).mockResolvedValueOnce({
      stdout: '1: alpha\n###TOTAL 3\n',
      stderr: '',
      exitStatus: 0,
    });

    await expect(
      readRemoteFilePage(mockConfig, repo, 'HEAD', 'src/a.ts', 1, 2)
    ).rejects.toThrow(/mã thoát/);
  });

  it('does not hand the model a character cut in half', async () => {
    // awk's `length`/`substr` are byte-based, so a Vietnamese line is cut mid-character.
    writeFileSync(join(repo, 'vi.txt'), `${'ế'.repeat(2000)}\n`);
    git('add', '-A');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'vi');

    const page = await readRemoteFilePage(mockConfig, repo, 'HEAD', 'vi.txt', 1, 10);

    expect(page.lines[0]).not.toContain('�');
    expect(page.lines[0]!.endsWith(' ...')).toBe(true);
  });

  it('reports the confined path, not the raw one', async () => {
    const page = await readRemoteFilePage(
      mockConfig,
      repo,
      'HEAD',
      './src/../src/a.ts',
      1,
      2
    );

    // The content comes from the confined path, so the result must name that path.
    expect(page.filePath).toBe('src/a.ts');
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

  // Regression seed for git-read-all-files-in-repo: read_file must return current working-tree
  // bytes for ANY in-repo path, including a tracked file with uncommitted edits. The old code
  // read the committed blob first and only used the working copy for untracked paths, so a
  // modified tracked file silently returned stale content. Oracle: specified (owner contract).
  it('reads current working-tree content for a tracked file with uncommitted edits', async () => {
    // src/a.ts was committed with 300 lines; overwrite it with different working-copy content.
    writeFileSync(join(repo, 'src/a.ts'), 'WORKTREE line one\nWORKTREE line two\n');

    const page = await readRemoteFilePage(mockConfig, repo, 'HEAD', 'src/a.ts', 1, 10);

    // Must reflect the working copy, NOT the committed blob ("const line1 = 1;").
    expect(page.lines).toEqual(['1: WORKTREE line one', '2: WORKTREE line two']);
    expect(page.totalLines).toBe(2);
    expect(page.hasMore).toBe(false);
  });

  // Boundary neighbor: an UNMODIFIED tracked file must still read correctly (same working-tree
  // source). Guards against a fix that only works when the file differs from the ref.
  it('reads an unmodified tracked file from the working tree', async () => {
    const page = await readRemoteFilePage(mockConfig, repo, 'HEAD', 'src/b.ts', 1, 10);

    expect(page.lines).toEqual(['1: one', '2: two', '3: three', '4: four', '5: five']);
    expect(page.totalLines).toBe(5);
  });

  // Boundary neighbor: an in-repo file that is tracked but STAGED (index differs from HEAD) must
  // also return its current on-disk content, not the committed blob.
  it('reads current content for a tracked file with staged changes', async () => {
    writeFileSync(join(repo, 'docs/notes.md'), 'STAGED note A\nSTAGED note B\n');
    git('add', 'docs/notes.md');

    const page = await readRemoteFilePage(mockConfig, repo, 'HEAD', 'docs/notes.md', 1, 10);

    expect(page.lines).toEqual(['1: STAGED note A', '2: STAGED note B']);
    expect(page.totalLines).toBe(2);
  });

  // Confinement invariant must survive the source switch: a symlink pointing outside the repo
  // is still refused rather than followed.
  it('still refuses a symlink that escapes the repo after the source switch', async () => {
    const outside = join(sandbox, 'outside-secret.txt');
    writeFileSync(outside, 'SECRET\n');
    symlinkSync(outside, join(repo, 'link.txt'));

    await expect(
      readRemoteFilePage(mockConfig, repo, 'HEAD', 'link.txt', 1, 10)
    ).rejects.toBeInstanceOf(PathOutsideRepoError);
  });
});
