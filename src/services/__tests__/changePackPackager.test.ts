// @vitest-environment node
import JSZip from 'jszip';
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
    if (args[0] === 'diff') return patch;
    if (args[0] === 'show') return args[1]?.includes('sql/') ? 'select 1;\n' : 'export const value = 1;\n';
    throw new Error(`Unexpected command: ${args.join(' ')}`);
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
