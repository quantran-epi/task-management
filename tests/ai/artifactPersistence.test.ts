import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db';
import {
  loadCanonicalArtifactChain,
  persistConfirmedPack,
  saveSolutionVersion,
} from '../../src/services/wizard/artifactRepo';
import type { ChangePackManifest } from '../../src/services/wizard/changePack';
import type { Project } from '../../src/types/models';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_PROJECT_ID = '99999999-9999-4999-8999-999999999999';
const THREAD_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const NOW = '2026-10-28T12:00:00.000Z';
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const PACK_HASH = 'c'.repeat(64);

const project: Project = {
  id: PROJECT_ID,
  name: 'Artifact project',
  status: 'Open',
  createdAt: NOW,
  updatedAt: NOW,
};

function solutionInput(overrides: Record<string, unknown> = {}) {
  return {
    projectId: PROJECT_ID,
    threadId: THREAD_ID,
    sessionId: SESSION_ID,
    inputRevision: 1,
    draftRevision: 1,
    inputHash: HASH_A,
    markdown: '# Solution v1',
    exportPayload: { schemaVersion: 1, title: 'SOLUTION v1' },
    approvedAt: NOW,
    ...overrides,
  };
}

function manifest(entries: number): ChangePackManifest {
  return {
    schemaVersion: 1,
    packHash: PACK_HASH,
    identity: { cr: 'CR-25001', base: 'base-sha', head: 'head-sha', branch: 'feature/CR-25001' },
    meta: {
      cr: 'CR-25001',
      base: 'base-sha',
      head: 'head-sha',
      branch: 'feature/CR-25001',
      author: 'tester',
      generatedAt: NOW,
      commits: [],
      files: [],
    },
    entries: Array.from({ length: entries }, (_, index) => ({
      path: `src/file-${index + 1}.ts`,
      sizeBytes: 10,
      status: 'included' as const,
      coverage: 'included' as const,
      content: `export const value${index + 1} = ${index + 1};`,
    })),
    compressedBytes: 100,
    expandedBytes: 200,
    commitCount: 0,
    fileCount: entries,
    coverageStatus: 'complete',
  };
}

describe('wizard-free artifact persistence', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`wizard-free-artifacts-${Date.now()}-${Math.random()}`);
    await db.open();
    await db.projects.add(project);
    await db.projects.add({ ...project, id: OTHER_PROJECT_ID, name: 'Other project' });
    await db.chatThreads.add({
      id: THREAD_ID,
      scopeKey: `project:${PROJECT_ID}`,
      scopeType: 'project',
      entityId: PROJECT_ID,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.chatThreads.add({
      id: '88888888-8888-4888-8888-888888888888',
      scopeKey: `project:${OTHER_PROJECT_ID}`,
      scopeType: 'project',
      entityId: OTHER_PROJECT_ID,
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  afterEach(async () => {
    await db.delete();
  });

  it('saves a SOLUTION Note in a thread that holds zero chat messages', async () => {
    expect(await db.chatMessages.count()).toBe(0);

    const result = await saveSolutionVersion(solutionInput(), db);

    expect(result.created).toBe(true);
    expect(result.note.sdlcArtifact).toMatchObject({ kind: 'SOLUTION', version: 1 });
    expect(await db.notes.count()).toBe(1);
    expect(await db.chatMessages.count()).toBe(1);
  });

  it('rejects a thread that does not exist', async () => {
    await expect(
      saveSolutionVersion(solutionInput({ threadId: '77777777-7777-4777-8777-777777777777' }), db),
    ).rejects.toMatchObject({ code: 'WIZARD_THREAD_MISMATCH' });
  });

  it('rejects a thread owned by another project', async () => {
    await expect(
      saveSolutionVersion(
        solutionInput({ threadId: '88888888-8888-4888-8888-888888888888' }),
        db,
      ),
    ).rejects.toMatchObject({ code: 'WIZARD_PROJECT_MISMATCH' });
  });

  it('replays identical markdown to the same Note', async () => {
    const first = await saveSolutionVersion(solutionInput(), db);
    const replay = await saveSolutionVersion(solutionInput(), db);

    expect(replay.created).toBe(false);
    expect(replay.note.id).toBe(first.note.id);
    expect(await db.notes.count()).toBe(1);
  });

  it('replays with a bumped draftRevision when the markdown is unchanged', async () => {
    const first = await saveSolutionVersion(solutionInput(), db);
    const replay = await saveSolutionVersion(solutionInput({ draftRevision: 2 }), db);

    expect(replay.created).toBe(false);
    expect(replay.note.id).toBe(first.note.id);
    expect(await db.notes.count()).toBe(1);
  });

  it('creates version 2 when the markdown changes under the same session and kind', async () => {
    const first = await saveSolutionVersion(solutionInput(), db);
    const regenerated = await saveSolutionVersion(
      solutionInput({
        inputHash: HASH_B,
        draftRevision: 2,
        markdown: '# Solution v2',
        exportPayload: { schemaVersion: 1, title: 'SOLUTION v2' },
      }),
      db,
    );

    expect(regenerated.created).toBe(true);
    expect(regenerated.note.id).not.toBe(first.note.id);
    expect(regenerated.note.sdlcArtifact).toMatchObject({ kind: 'SOLUTION', version: 2 });

    const chain = await loadCanonicalArtifactChain(PROJECT_ID, THREAD_ID, db);
    expect(chain.map((note) => [note.sdlcArtifact?.kind, note.sdlcArtifact?.version])).toEqual([
      ['SOLUTION', 1],
      ['SOLUTION', 2],
    ]);
  });

  it('persists one Note per confirmed pack entry plus one plain assistant event, replay-safe', async () => {
    const solution = await saveSolutionVersion(solutionInput(), db);
    const pack = manifest(3);
    const input = {
      projectId: PROJECT_ID,
      threadId: THREAD_ID,
      sessionId: SESSION_ID,
      inputRevision: 2,
      draftRevision: 1,
      idempotencyKey: `${SESSION_ID}:1:CHANGE_PACK_ENTRY`,
      manifest: pack,
      confirmation: pack.identity,
      solution: { noteId: solution.note.id, version: 1, hash: HASH_A },
      confirmedAt: NOW,
    };

    const first = await persistConfirmedPack(input, db);

    expect(first.created).toBe(true);
    expect(first.notes).toHaveLength(pack.entries.length);
    expect(await db.notes.count()).toBe(1 + pack.entries.length);
    const packEvents = (await db.chatMessages.where('threadId').equals(THREAD_ID).toArray()).filter(
      (message) => message.content.includes(PACK_HASH),
    );
    expect(packEvents).toHaveLength(1);
    expect(packEvents[0]?.wizard).toBeUndefined();

    const replay = await persistConfirmedPack(input, db);
    expect(replay.created).toBe(false);
    expect(replay.notes.map((note) => note.id)).toEqual(first.notes.map((note) => note.id));
    expect(await db.notes.count()).toBe(1 + pack.entries.length);
  });
});
