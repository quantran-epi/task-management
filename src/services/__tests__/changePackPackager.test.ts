// @vitest-environment node
import JSZip from 'jszip';
import { execFileSync } from 'node:child_process';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BranchSnapshot, RemoteFileStat } from '../../types/gitRemote';
import type { SshConfig } from '../../types/ssh';
import { createChangePackFromSnapshot } from '../changePackPackager';
import { checkDirtyStatus, checkHeadDrift, runGitCommand, escapeShellArg } from '../gitRemoteService';
import { getSshSecret } from '../sshService';
import {
  ChangePackLimits,
  ChangePackManifestSchema,
  ChangePackMetaSchema,
  DesktopChangePackLimits,
  getEffectiveChangePackLimits,
  validateChangePack,
} from '../wizard/changePack';

vi.mock('../gitRemoteService', async (importOriginal) => {
  const original = await importOriginal<typeof import('../gitRemoteService')>();
  return { ...original, runGitCommand: vi.fn(), checkHeadDrift: vi.fn(), checkDirtyStatus: vi.fn() };
});
vi.mock('../sshService', () => ({ getSshSecret: vi.fn() }));

const base = '1'.repeat(40);
const head = '2'.repeat(40);
const patch = 'diff --git a/src/new.ts b/src/new.ts\nnew file mode 100644\n--- /dev/null\n+++ b/src/new.ts\n@@ -0,0 +1 @@\n+export const value = 1;\n';
const config: SshConfig = {
  id: 'ssh-1', name: 'Repo', host: 'host', port: 22, username: 'dev', authType: 'agent',
  createdAt: '2026-11-06T00:00:00Z', updatedAt: '2026-11-06T00:00:00Z',
};
function stat(path: string, status: RemoteFileStat['status'] = 'added'): RemoteFileStat {
  return { path, status, additions: 1, deletions: 0 };
}
function snapshot(files: RemoteFileStat[] = [stat('sql/update.sql', 'modified'), stat('src/new.ts')]): BranchSnapshot {
  return { baseCommit: 'origin/main', headSha: head, targetBranch: 'feature/cr-1', commitShas: [head], fileStats: files, approvedAt: '2026-11-06T00:00:00Z' };
}
async function unpack(blob: Blob): Promise<JSZip> {
  return JSZip.loadAsync(await blob.arrayBuffer());
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSshSecret).mockResolvedValue('session-secret');
  vi.mocked(checkHeadDrift).mockResolvedValue({ drifted: false, currentHeadSha: head });
  vi.mocked(checkDirtyStatus).mockResolvedValue({ isClean: true, uncommittedFiles: [] });
  vi.mocked(runGitCommand).mockImplementation(async (_config, _repo, args) => {
    if (args[0] === 'rev-parse') return `${base}\n`;
    if (args[0] === 'diff') return args.includes('wc') ? String(new TextEncoder().encode(patch).byteLength) : patch;
    const content = args.some((arg) => arg.includes('sql/')) ? 'select 1;\n' : 'export const value = 1;\n';
    if (args[0] === 'cat-file') return String(new TextEncoder().encode(content).byteLength);
    if (args[0] === 'show') return btoa(content);
    throw new Error(`Unexpected command: ${args.join(' ')}`);
  });
});

describe('native Git transport contract', () => {
  it('runs generated commands against Git and validates the resulting pack', async () => {
    const actualHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const actualBase = execFileSync('git', ['rev-parse', 'HEAD^'], { encoding: 'utf8' }).trim();
    vi.mocked(runGitCommand).mockImplementation(async (_config, repo, args) => execFileSync('bash', ['-c', `git -C ${escapeShellArg(repo)} --no-pager ${args.join(' ')}`], { encoding: 'utf8' }));
    const { blob } = await createChangePackFromSnapshot(config, process.cwd(), {
      baseCommit: actualBase, headSha: actualHead, fileStats: [stat('src/types/ssh.ts')], approvedAt: '2026-11-06T00:00:00Z',
    }, 'CR-1');
    const zip = await unpack(blob);
    expect(await zip.file('new-files/src/types/ssh.ts')!.async('string')).toContain('export interface SshConfig');
    expect((await validateChangePack(blob)).identity).toMatchObject({ base: actualBase, head: actualHead });
    const diffArgs = vi.mocked(runGitCommand).mock.calls.find(([, , args]) => args[0] === 'diff')![2];
    const separator = diffArgs.indexOf('--');
    const paths = execFileSync('bash', ['-c', `git ls-files -- ${diffArgs.slice(separator + 1, diffArgs.indexOf('|')).join(' ')}`], { encoding: 'utf8' });
    expect(paths.split('\n')).not.toContain('package-lock.json');
  });
});

describe('packaging safety', () => {
  it('filters out forbidden entries like node_modules and package-lock.json before fetching', async () => {
    const forbidden = ['node_modules/pkg/index.js', 'package-lock.json', 'web/package-lock.json', 'js/app.min.js', '.env', 'config/.env.prod', 'sql/node_modules/secret.sql'];
    const { blob } = await createChangePackFromSnapshot(config, '/repo', snapshot(forbidden.map((path) => stat(path))), 'CR-1');
    expect(Object.keys((await unpack(blob)).files).sort()).toEqual(['diff.patch', 'meta.json']);
    expect(vi.mocked(runGitCommand).mock.calls.some(([, , args]) => ['show', 'cat-file'].includes(args[0]!))).toBe(false);
    const diff = vi.mocked(runGitCommand).mock.calls.find(([, , args]) => args[0] === 'diff')![2];
    for (const glob of ['**/node_modules/**', '**/package-lock.json', '**/*.min.js', '**/.env', '**/.env.*']) {
      expect(diff).toContain(escapeShellArg(`:(glob,exclude,icase)${glob}`));
    }
  });

  it('surfaces warning when remote HEAD has drifted from snapshot headSha', async () => {
    const currentHeadSha = '3'.repeat(40);
    vi.mocked(checkHeadDrift).mockResolvedValue({ drifted: true, currentHeadSha });
    const { blob, warnings, meta } = await createChangePackFromSnapshot(config, '/repo', snapshot(), 'CR-1');
    expect(warnings).toEqual([expect.stringContaining(`${head} sang ${currentHeadSha}`)]);
    expect(meta.head).toBe(head);
    expect((await validateChangePack(blob)).meta.head).toBe(head);
  });

  it('surfaces warning when working tree is dirty but still completes pack', async () => {
    vi.mocked(checkDirtyStatus).mockResolvedValue({ isClean: false, uncommittedFiles: [{ path: 'secret.txt', indexStatus: 'M', workingTreeStatus: ' ' }] });
    const { blob, warnings } = await createChangePackFromSnapshot(config, '/repo', snapshot(), 'CR-1');
    expect(warnings).toEqual([expect.stringContaining('1 tệp chưa commit')]);
    expect((await validateChangePack(blob)).meta.head).toBe(head);
  });

  it('generated Blob passes validateChangePack with DesktopChangePackLimits', async () => {
    const { blob } = await createChangePackFromSnapshot(config, '/repo', snapshot(), 'CR-1');
    const manifest = await validateChangePack(blob, undefined, DesktopChangePackLimits);
    expect(manifest.entries).toHaveLength(4);
    expect(manifest.identity.cr).toBe('CR-1');
  });

  it('skips oversized entries before fetching content and reports partial coverage', async () => {
    const original = vi.mocked(runGitCommand).getMockImplementation()!;
    vi.mocked(runGitCommand).mockImplementation(async (...args) => args[2][0] === 'cat-file' ? String(DesktopChangePackLimits.maxEntryBytes + 1) : original(...args));
    const { blob, warnings } = await createChangePackFromSnapshot(config, '/repo', snapshot([stat('src/huge.ts')]), 'CR-1');
    expect(warnings).toEqual([expect.stringContaining('src/huge.ts')]);
    expect(vi.mocked(runGitCommand).mock.calls.some(([, , args]) => args[0] === 'show')).toBe(false);
    expect((await validateChangePack(blob)).coverageStatus).toBe('partial');
  });

  it.each([
    ['asset.png', new Uint8Array([1, 2, 3])],
    ['unknown.dat', new Uint8Array([1, 0, 3])],
    ['invalid.txt', new Uint8Array([0xff, 0xfe])],
  ])('skips unsupported binary content: %s', async (path, bytes) => {
    const original = vi.mocked(runGitCommand).getMockImplementation()!;
    vi.mocked(runGitCommand).mockImplementation(async (...args) => {
      if (args[2][0] === 'cat-file') return String(bytes.length);
      if (args[2][0] === 'show') return btoa(String.fromCharCode(...bytes));
      return original(...args);
    });
    const { blob, warnings } = await createChangePackFromSnapshot(config, '/repo', snapshot([stat(path)]), 'CR-1');
    expect(warnings).toHaveLength(1);
    expect((await unpack(blob)).file(`new-files/${path}`)).toBeNull();
    expect((await validateChangePack(blob)).coverageStatus).toBe('partial');
  });

  it('escapes shell metacharacters in refs and paths as single arguments', async () => {
    const path = "src/it's $(touch PWNED).ts";
    const input = { ...snapshot([stat(path)]), baseCommit: "origin/it's-main" };
    await createChangePackFromSnapshot(config, '/repo', input, 'CR-1');
    expect(runGitCommand).toHaveBeenCalledWith(config, '/repo', ['rev-parse', '--verify', '--end-of-options', escapeShellArg(`${input.baseCommit}^{commit}`)], 'session-secret');
    expect(runGitCommand).toHaveBeenCalledWith(config, '/repo', ['show', '--no-ext-diff', '--no-textconv', escapeShellArg(`${head}:${path}`), '|', 'base64'], 'session-secret');
  });

  it.each(['../secret', '/absolute', 'a/../secret', 'a\\secret', 'a\nsecret'])('rejects unsafe path before SSH: %s', async (path) => {
    await expect(createChangePackFromSnapshot(config, '/repo', snapshot([stat(path)]), 'CR-1')).rejects.toThrow();
    expect(getSshSecret).not.toHaveBeenCalled();
    expect(runGitCommand).not.toHaveBeenCalled();
  });

  it('rejects a moving head ref or invalid CR before SSH', async () => {
    await expect(createChangePackFromSnapshot(config, '/repo', { ...snapshot(), headSha: 'feature/main' }, 'CR-1')).rejects.toThrow();
    await expect(createChangePackFromSnapshot(config, '/repo', snapshot(), '')).rejects.toThrow();
    expect(getSshSecret).not.toHaveBeenCalled();
  });

  it('rejects case-insensitive entry collisions', async () => {
    await expect(createChangePackFromSnapshot(config, '/repo', snapshot([stat('src/A.ts'), stat('src/a.ts')]), 'CR-1')).rejects.toThrow('PACK_PATH_COLLISION');
  });

  it('rejects more than 1000 entries before fetching contents', async () => {
    await expect(createChangePackFromSnapshot(config, '/repo', snapshot(Array.from({ length: 999 }, (_, i) => stat(`src/${i}.ts`))), 'CR-1')).rejects.toThrow('PACK_TOO_MANY_ENTRIES');
    expect(vi.mocked(runGitCommand).mock.calls.some(([, , args]) => args[0] === 'show')).toBe(false);
  });

  it('rejects oversized diff.patch', async () => {
    const original = vi.mocked(runGitCommand).getMockImplementation()!;
    vi.mocked(runGitCommand).mockImplementation(async (...args) => args[2][0] === 'diff' ? String(DesktopChangePackLimits.maxEntryBytes + 1) : original(...args));
    await expect(createChangePackFromSnapshot(config, '/repo', snapshot(), 'CR-1')).rejects.toThrow('PACK_ENTRY_TOO_LARGE');
  });

  it('propagates SSH failure without returning a partial zip', async () => {
    vi.mocked(runGitCommand).mockRejectedValue(new Error('SSH timeout'));
    await expect(createChangePackFromSnapshot(config, '/repo', snapshot(), 'CR-1')).rejects.toThrow('SSH timeout');
  });

  it('rejects malformed size or truncated file transport', async () => {
    const original = vi.mocked(runGitCommand).getMockImplementation()!;
    vi.mocked(runGitCommand).mockImplementation(async (...args) => args[2][0] === 'cat-file' ? 'invalid' : original(...args));
    await expect(createChangePackFromSnapshot(config, '/repo', snapshot(), 'CR-1')).rejects.toThrow('Kích thước tệp không hợp lệ');
    vi.mocked(runGitCommand).mockImplementation(async (...args) => args[2][0] === 'cat-file' ? '999' : original(...args));
    await expect(createChangePackFromSnapshot(config, '/repo', snapshot(), 'CR-1')).rejects.toThrow('Nội dung tệp không đầy đủ');
  });
});

describe('createChangePackFromSnapshot', () => {
  it('creates an in-memory zip with diff.patch, valid meta.json, SQL and new files', async () => {
    const progress = vi.fn();
    const { blob, meta, warnings } = await createChangePackFromSnapshot(config, '/repo with spaces', snapshot(), 'CR-1', progress);
    const zip = await unpack(blob);
    expect(Object.keys(zip.files).sort()).toEqual(['diff.patch', 'meta.json', 'new-files/src/new.ts', 'sql/update.sql']);
    expect(await zip.file('diff.patch')!.async('string')).toBe(patch);
    expect(await zip.file('sql/update.sql')!.async('string')).toBe('select 1;\n');
    expect(await zip.file('new-files/src/new.ts')!.async('string')).toBe('export const value = 1;\n');
    expect(ChangePackMetaSchema.parse(JSON.parse(await zip.file('meta.json')!.async('string')))).toEqual(meta);
    expect(meta).toMatchObject({ cr: 'CR-1', base, head, branch: 'feature/cr-1' });
    expect(warnings).toEqual([]);
    expect(getSshSecret).toHaveBeenCalledWith(config.id);
    expect(checkHeadDrift).toHaveBeenCalledWith(config, '/repo with spaces', 'feature/cr-1', head, 'session-secret');
    expect(runGitCommand).toHaveBeenCalledWith(config, '/repo with spaces', expect.arrayContaining(['diff', '--binary', escapeShellArg(`${base}..${head}`)]), 'session-secret');
    expect(progress.mock.calls.map(([step]) => step)).toEqual(['checking', 'diff', 'files', 'compressing', 'validating']);
    expect((await validateChangePack(blob)).coverageStatus).toBe('complete');
  });

  it('uses desktop defaults with validated custom overrides', () => {
    expect(ChangePackLimits).toBe(DesktopChangePackLimits);
    expect(Object.isFrozen(DesktopChangePackLimits)).toBe(true);
    expect(getEffectiveChangePackLimits()).toEqual({ maxCompressedBytes: 26_214_400, maxExpandedBytes: 104_857_600, maxEntryBytes: 10_485_760, maxEntries: 1000 });
    expect(getEffectiveChangePackLimits({ maxEntries: 2000 })).toEqual({ ...DesktopChangePackLimits, maxEntries: 2000 });
    for (const maxEntries of [0, -1, Infinity, NaN, 1.5]) expect(() => getEffectiveChangePackLimits({ maxEntries })).toThrow();
  });

  it('accepts 1000 manifest entries and metadata beyond the old 256 ceiling', async () => {
    const { blob } = await createChangePackFromSnapshot(config, '/repo', snapshot(), 'CR-1');
    const manifest = await validateChangePack(blob);
    expect(ChangePackManifestSchema.safeParse({
      ...manifest,
      entries: Array.from({ length: 1000 }, (_, i) => ({ ...manifest.entries[0], path: `new-files/${i}.ts` })),
      meta: { ...manifest.meta, files: Array.from({ length: 1000 }, (_, i) => ({ path: `${i}.ts`, status: 'added' })) },
    }).success).toBe(true);
  });

  it('does not fetch deleted SQL files or modified non-SQL files', async () => {
    const { blob } = await createChangePackFromSnapshot(config, '/repo', snapshot([stat('sql/deleted.sql', 'deleted'), stat('src/old.ts', 'modified')]), 'CR-1');
    expect(Object.keys((await unpack(blob)).files).sort()).toEqual(['diff.patch', 'meta.json']);
    expect(vi.mocked(runGitCommand).mock.calls.some(([, , args]) => args[0] === 'show')).toBe(false);
  });
});
