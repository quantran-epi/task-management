import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db';
import { saveHubSolution } from '../../src/services/wizard/hubSolution';
import { persistConfirmedPack } from '../../src/services/wizard/artifactRepo';
import type { ChangePackManifest } from '../../src/services/wizard/changePack';
import type { Project } from '../../src/types/models';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_PROJECT_ID = '99999999-9999-4999-8999-999999999999';
const THREAD_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_THREAD_ID = '88888888-8888-4888-8888-888888888888';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const NOW = '2026-11-01T12:00:00.000Z';

const project: Project = { id: PROJECT_ID, name: 'Hub solution project', status: 'Open', createdAt: NOW, updatedAt: NOW };

function input(overrides: Record<string, unknown> = {}) {
  return {
    db,
    projectId: PROJECT_ID,
    threadId: THREAD_ID,
    sessionId: SESSION_ID,
    markdown: '# SOLUTION v1',
    draftRevision: 1,
    approvedAt: NOW,
    ...overrides,
  };
}

let db: TaskPlannerDatabase;

beforeEach(async () => {
  db = new TaskPlannerDatabase(`hub-solution-${Date.now()}-${Math.random()}`);
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
    id: OTHER_THREAD_ID,
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

describe('saveHubSolution', () => {
  it('returns noteId/version 1/hash matching the committed Note', async () => {
    const result = await saveHubSolution(input());

    expect(result.created).toBe(true);
    expect(result.version).toBe(1);
    expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.hash).toBe(result.hash.toLowerCase());

    const note = await db.notes.get(result.noteId);
    expect(note?.sdlcArtifact?.inputHash).toBe(result.hash);
  });

  it('writes a project-linked SOLUTION Note with matching identity', async () => {
    const result = await saveHubSolution(input());
    const note = await db.notes.get(result.noteId);

    expect(note?.sdlcArtifact).toMatchObject({
      kind: 'SOLUTION',
      projectId: PROJECT_ID,
      threadId: THREAD_ID,
      version: 1,
    });
    expect(note?.entityType).toBe('project');
    expect(note?.entityId).toBe(PROJECT_ID);
    expect(await db.chatMessages.count()).toBe(1);
  });

  it('replays identical markdown with a larger draftRevision to the same Note and version', async () => {
    const first = await saveHubSolution(input());
    const replay = await saveHubSolution(input({ draftRevision: 2 }));

    expect(replay.created).toBe(false);
    expect(replay.noteId).toBe(first.noteId);
    expect(replay.hash).toBe(first.hash);
    expect(replay.version).toBe(1);
    expect(await db.notes.count()).toBe(1);
  });

  it('regenerates at version 2 when the markdown changes', async () => {
    const first = await saveHubSolution(input());
    const regenerated = await saveHubSolution(input({ markdown: '# SOLUTION v2', draftRevision: 3 }));

    expect(regenerated.created).toBe(true);
    expect(regenerated.noteId).not.toBe(first.noteId);
    expect(regenerated.version).toBe(2);
    expect(regenerated.hash).not.toBe(first.hash);
  });

  it('rejects an empty or whitespace-only draft and writes no Note', async () => {
    await expect(saveHubSolution(input({ markdown: '   ' }))).rejects.toThrow('SOLUTION_CONTENT_EMPTY');
    await expect(saveHubSolution(input({ markdown: '' }))).rejects.toThrow('SOLUTION_CONTENT_EMPTY');
    expect(await db.notes.count()).toBe(0);
  });

  it('rejects a thread owned by another project', async () => {
    await expect(
      saveHubSolution(input({ threadId: OTHER_THREAD_ID })),
    ).rejects.toMatchObject({ code: 'WIZARD_PROJECT_MISMATCH' });
    expect(await db.notes.count()).toBe(0);
  });

  it('keeps workflow version parity so persistConfirmedPack accepts the pinned triple', async () => {
    const saveA = await saveHubSolution(input());
    // Replay with a bumped draftRevision — the hub skips commitSolution here, so the
    // workflow version stays at the Note's version.
    const replayA = await saveHubSolution(input({ draftRevision: 2 }));
    expect(replayA).toMatchObject({ noteId: saveA.noteId, version: 1, created: false });

    const saveB = await saveHubSolution(input({ markdown: '# SOLUTION v2', draftRevision: 3 }));
    expect(saveB.version).toBe(2);

    const manifest: ChangePackManifest = {
      schemaVersion: 1,
      packHash: 'c'.repeat(64),
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
      entries: [{ path: 'src/file-1.ts', sizeBytes: 10, status: 'included', coverage: 'included', content: 'export const a = 1;' }],
      compressedBytes: 100,
      expandedBytes: 200,
      commitCount: 0,
      fileCount: 1,
      coverageStatus: 'complete',
    };

    const packed = await persistConfirmedPack({
      projectId: PROJECT_ID,
      threadId: THREAD_ID,
      sessionId: SESSION_ID,
      inputRevision: 1,
      draftRevision: 4,
      idempotencyKey: `${SESSION_ID}:PACK:${manifest.packHash}`,
      manifest,
      confirmation: manifest.identity,
      solution: { noteId: saveB.noteId, version: saveB.version, hash: saveB.hash },
      confirmedAt: NOW,
    }, db);

    expect(packed.created).toBe(true);
    expect(packed.notes).toHaveLength(1);
  });
});
