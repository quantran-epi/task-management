import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db';
import { persistConfirmedPack, saveSolutionVersion } from '../../src/services/wizard/artifactRepo';
import type { Project } from '../../src/types/models';
import { buildWizardIdempotencyKey } from '../../src/services/ai/wizardSchemas';
import {
  ChangePackLimits,
  ChangePackValidationError,
  canonicalizePackPath,
  validateChangePack,
} from '../../src/services/wizard/changePack';

const manifest = JSON.parse(
  fs.readFileSync(path.resolve('tests/fixtures/ai/change-packs/manifest.json'), 'utf8'),
) as {
  schemaVersion: number;
  profile: Record<string, unknown>;
  archives: Array<{
    name: string;
    variant: string;
    expectedCode: string;
    writesBeforeConfirmation: number;
    writesAfterRollback?: number;
  }>;
};

const fixturePath = (name: string) => path.resolve('tests/fixtures/ai/change-packs', name);

async function readFixture(name: string): Promise<File> {
  const bytes = await fsp.readFile(fixturePath(name));
  return new File([bytes], name, { type: 'application/zip' });
}

const identity = {
  cr: 'CR-25001',
  base: 'base-commit-001',
  head: 'head-commit-002',
  branch: 'feature/CR-25001',
};

function expectCode(error: unknown, code: string): void {
  expect(error).toBeInstanceOf(ChangePackValidationError);
  expect((error as ChangePackValidationError).code).toBe(code);
  expect((error as Error).message).toBe(code);
}

describe('change-pack fixture manifest', () => {
  it('pins resolved profile-B limits and metadata shapes', () => {
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.profile).toEqual({
      maxCompressedBytes: 5_242_880,
      maxExpandedBytes: 26_214_400,
      maxEntryBytes: 2_097_152,
      maxEntries: 256,
      requiredMetadata: {
        commits: '{sha:string,subject:string}[]',
        files: '{path:string,status:string}[]',
      },
    });
  });

  it('catalogs archive, path, collision, prohibited, binary, corrupt, and rollback threats', () => {
    const variants = new Set(manifest.archives.map(({ variant }) => variant));
    for (const variant of [
      'valid',
      'compressed-overflow',
      'expanded-overflow',
      'entry-overflow',
      'count-overflow',
      'corrupt',
      'missing-meta',
      'invalid-meta',
      'traversal',
      'absolute-path',
      'canonical-collision',
      'prohibited',
      'unsupported',
      'binary',
      'transaction-failure',
    ]) {
      expect(variants.has(variant)).toBe(true);
    }
    expect(new Set(manifest.archives.map(({ name }) => name)).size).toBe(manifest.archives.length);
    manifest.archives.forEach((archive) => {
      expect(archive.expectedCode).toMatch(/^[A-Z][A-Z0-9_]+$/);
      expect(archive.writesBeforeConfirmation).toBe(0);
    });
    expect(manifest.archives.find(({ variant }) => variant === 'transaction-failure')?.writesAfterRollback).toBe(0);
  });
});

describe('canonicalizePackPath', () => {
  it.each([
    ['diff.patch', 'diff.patch'],
    ['new-files/src/feature.ts', 'new-files/src/feature.ts'],
    ['new-files\\src\\feature.ts', 'new-files/src/feature.ts'],
  ])('canonicalizes %s', (raw, expected) => {
    expect(canonicalizePackPath(raw)).toBe(expected);
  });

  it.each([
    '../diff.patch',
    'new-files/../diff.patch',
    '/diff.patch',
    'C:\\diff.patch',
    'new-files//x.ts',
    'new-files/./x.ts',
    'new-files/x\0.ts',
    '',
  ])('rejects unsafe %s', (raw) => {
    expect(() => canonicalizePackPath(raw)).toThrow(ChangePackValidationError);
  });
});

describe('validateChangePack', () => {
  it('exports the exact profile-B ceilings', () => {
    expect(ChangePackLimits).toEqual({
      maxCompressedBytes: 5_242_880,
      maxExpandedBytes: 26_214_400,
      maxEntryBytes: 2_097_152,
      maxEntries: 256,
    });
  });

  it('validates the complete pack before returning an immutable manifest', async () => {
    const result = await validateChangePack(await readFixture('valid.zip'), identity);

    expect(result.identity).toEqual(identity);
    expect(result.packHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.entries.map((entry) => entry.path)).toEqual([
      'diff.patch',
      'meta.json',
      'new-files/src/feature.ts',
      'sql/alter.sql',
    ]);
    expect(result.entries.every((entry) => entry.status === 'included')).toBe(true);
    expect(result.commitCount).toBe(2);
    expect(result.fileCount).toBe(3);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.entries)).toBe(true);
  });

  it.each([
    ['wrong-cr.zip', 'PACK_IDENTITY_MISMATCH'],
    ['corrupt.zip', 'PACK_CORRUPT'],
    ['traversal.zip', 'PACK_PATH_UNSAFE'],
    ['collision.zip', 'PACK_PATH_COLLISION'],
    ['prohibited.zip', 'PACK_ENTRY_PROHIBITED'],
  ])('rejects %s with stable code and no write opportunity', async (name, code) => {
    let writes = 0;
    try {
      await validateChangePack(await readFixture(name), identity, undefined, () => {
        writes += 1;
      });
      throw new Error('expected validation failure');
    } catch (error) {
      expectCode(error, code);
      expect(writes).toBe(0);
    }
  });

  it('keeps binary content deferred instead of treating it as text', async () => {
    const result = await validateChangePack(await readFixture('binary.zip'), identity);
    expect(result.entries.find((entry) => entry.path === 'new-files/assets/logo.bin')).toMatchObject({
      status: 'binary',
      coverage: 'binary',
    });
    expect(result.coverageStatus).toBe('partial');
  });

  it('keeps partial content visible and never claims complete coverage', async () => {
    const result = await validateChangePack(await readFixture('partial.zip'), identity);
    expect(result.coverageStatus).toBe('partial');
    expect(result.entries.some((entry) => entry.coverage === 'deferred')).toBe(true);
  });

  it('rejects compressed, expanded, per-entry, and count ceilings before persistence', async () => {
    const valid = await readFixture('valid.zip');
    for (const [limits, code] of [
      [{ maxCompressedBytes: valid.size - 1 }, 'PACK_COMPRESSED_TOO_LARGE'],
      [{ maxExpandedBytes: 1 }, 'PACK_EXPANDED_TOO_LARGE'],
      [{ maxEntryBytes: 1 }, 'PACK_ENTRY_TOO_LARGE'],
      [{ maxEntries: 1 }, 'PACK_TOO_MANY_ENTRIES'],
    ] as const) {
      await expect(validateChangePack(valid, identity, { ...ChangePackLimits, ...limits })).rejects.toSatisfy(
        (error: unknown) => {
          expectCode(error, code);
          return true;
        },
      );
    }
  });

  it('rejects a compressed boundary plus one before JSZip parsing', async () => {
    const valid = await readFixture('valid.zip');
    await expect(
      validateChangePack(valid, identity, { ...ChangePackLimits, maxCompressedBytes: valid.size - 1 }),
    ).rejects.toMatchObject({ code: 'PACK_COMPRESSED_TOO_LARGE' });
  });
});

describe('persistConfirmedPack', () => {
  let db: TaskPlannerDatabase;
  const projectId = '11111111-1111-4111-8111-111111111111';
  const threadId = '22222222-2222-4222-8222-222222222222';
  const sessionId = '33333333-3333-4333-8333-333333333333';
  const now = '2026-10-28T12:00:00.000Z';
  const solutionHash = 'a'.repeat(64);

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`confirmed-pack-${Date.now()}-${Math.random()}`);
    await db.open();
    const project: Project = { id: projectId, name: 'Pack project', status: 'Open', createdAt: now, updatedAt: now };
    await db.projects.add(project);
    await db.chatThreads.add({
      id: threadId,
      scopeKey: `project:${projectId}`,
      scopeType: 'project',
      entityId: projectId,
      createdAt: now,
      updatedAt: now,
    });
    await db.chatMessages.add({
      id: '44444444-4444-4444-8444-444444444444',
      threadId,
      role: 'assistant',
      content: 'Approved solution preview',
      createdAt: now,
      wizard: {
        schemaVersion: 1,
        sessionId,
        projectId,
        threadId,
        skill: 'SOLUTION',
        status: 'approved',
        inputRevision: 1,
        draftRevision: 1,
        approvedAt: now,
        artifactId: null,
        artifactHash: solutionHash,
        renderPayload: { title: 'SOLUTION', featureMode: 'new', markdown: '# Solution' },
        createdAt: now,
        updatedAt: now,
      },
    });
  });

  async function preparePack() {
    const solution = await saveSolutionVersion({
      projectId,
      threadId,
      sessionId,
      inputRevision: 1,
      draftRevision: 1,
      inputHash: solutionHash,
      markdown: '# Solution',
      exportPayload: { schemaVersion: 1 },
      approvedAt: now,
    }, db);
    const manifest = await validateChangePack(await readFixture('valid.zip'), identity);
    await db.chatMessages.add({
      id: '55555555-5555-4555-8555-555555555555',
      threadId,
      role: 'assistant',
      content: 'Confirm pack',
      createdAt: '2026-10-28T12:01:00.000Z',
      wizard: {
        schemaVersion: 1,
        sessionId,
        projectId,
        threadId,
        skill: 'PL03',
        status: 'approved',
        inputRevision: 2,
        draftRevision: 1,
        approvedAt: '2026-10-28T12:01:00.000Z',
        artifactId: null,
        artifactHash: manifest.packHash,
        renderPayload: { title: 'Confirmed change pack' },
        createdAt: now,
        updatedAt: '2026-10-28T12:01:00.000Z',
      },
    });
    return { solution, manifest };
  }

  it('persists every validated entry, ordered membership, and one pinned event', async () => {
    const { solution, manifest } = await preparePack();
    const result = await persistConfirmedPack({
      projectId,
      threadId,
      sessionId,
      inputRevision: 2,
      draftRevision: 1,
      idempotencyKey: buildWizardIdempotencyKey({ sessionId, draftRevision: 1, artifactKind: 'CHANGE_PACK_ENTRY' }),
      manifest,
      confirmation: identity,
      solution: { noteId: solution.note.id, version: 1, hash: solutionHash },
      confirmedAt: '2026-10-28T12:01:00.000Z',
    }, db);

    expect(result.created).toBe(true);
    expect(result.notes).toHaveLength(manifest.entries.length);
    expect(result.notes.map((note) => note.sdlcArtifact?.kind === 'CHANGE_PACK_ENTRY' ? note.sdlcArtifact.path : undefined)).toEqual(manifest.entries.map((entry) => entry.path));
    const set = await db.documentSets.filter((candidate) => candidate.sdlc?.projectId === projectId).first();
    expect(set?.documentIds.slice(-manifest.entries.length)).toEqual(result.notes.map((note) => note.id));
    expect((await db.chatMessages.where('threadId').equals(threadId).toArray()).filter((message) => message.content.includes(manifest.packHash))).toHaveLength(1);
  });

  it('deduplicates replay and rolls injected mid-transaction failure back fully', async () => {
    const { solution, manifest } = await preparePack();
    const input = {
      projectId,
      threadId,
      sessionId,
      inputRevision: 2,
      draftRevision: 1,
      idempotencyKey: `${sessionId}:1:PACK:${manifest.packHash}`,
      manifest,
      confirmation: identity,
      solution: { noteId: solution.note.id, version: 1, hash: solutionHash },
      confirmedAt: '2026-10-28T12:01:00.000Z',
    };
    const beforeFailure = {
      notes: await db.notes.count(),
      sets: JSON.stringify(await db.documentSets.toArray()),
      messages: await db.chatMessages.count(),
    };
    await expect(persistConfirmedPack({ ...input, failAfterWrites: 2 }, db)).rejects.toThrow('INJECTED_PACK_WRITE_FAILURE');
    expect({
      notes: await db.notes.count(),
      sets: JSON.stringify(await db.documentSets.toArray()),
      messages: await db.chatMessages.count(),
    }).toEqual(beforeFailure);

    const first = await persistConfirmedPack(input, db);
    const counts = { notes: await db.notes.count(), sets: await db.documentSets.count(), messages: await db.chatMessages.count() };
    const replay = await persistConfirmedPack(input, db);
    expect(replay.created).toBe(false);
    expect(replay.notes.map((note) => note.id)).toEqual(first.notes.map((note) => note.id));
    expect({ notes: await db.notes.count(), sets: await db.documentSets.count(), messages: await db.chatMessages.count() }).toEqual(counts);
  });

  it('rejects wrong confirmation and stale solution identity without mutation', async () => {
    const { solution, manifest } = await preparePack();
    const before = { notes: await db.notes.count(), sets: await db.documentSets.count(), messages: await db.chatMessages.count() };
    const base = {
      projectId,
      threadId,
      sessionId,
      inputRevision: 2,
      draftRevision: 1,
      idempotencyKey: `${sessionId}:1:PACK:${manifest.packHash}`,
      manifest,
      confirmation: identity,
      solution: { noteId: solution.note.id, version: 1, hash: solutionHash },
      confirmedAt: '2026-10-28T12:01:00.000Z',
    };
    await expect(persistConfirmedPack({ ...base, confirmation: { ...identity, cr: 'WRONG' } }, db)).rejects.toMatchObject({ code: 'PACK_IDENTITY_MISMATCH' });
    await expect(persistConfirmedPack({ ...base, solution: { ...base.solution, hash: 'b'.repeat(64) } }, db)).rejects.toMatchObject({ code: 'PACK_SOLUTION_MISMATCH' });
    expect({ notes: await db.notes.count(), sets: await db.documentSets.count(), messages: await db.chatMessages.count() }).toEqual(before);
  });
});
