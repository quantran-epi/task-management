import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../../db';
import { getOrCreateSdlcThread } from '../../../db/repositories/chatRepo';
import {
  loadAllResearchArtifacts,
  loadLatestResearchArtifact,
  saveResearchArtifact,
  type ArtifactCommitInput,
} from '../artifactRepo';

const CR_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CR_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

describe('artifactRepo RESEARCH artifacts', () => {
  let db: TaskPlannerDatabase;
  let threadId: string;

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`TestDB_${Math.random()}`);
    await db.open();
    const thread = await getOrCreateSdlcThread(CR_ID, 'SDLC', db);
    threadId = thread.id;
  });

  afterEach(async () => {
    await db.delete();
  });

  function input(overrides: Partial<ArtifactCommitInput> = {}): ArtifactCommitInput {
    return {
      changeRequestId: CR_ID,
      threadId,
      sessionId: SESSION_ID,
      inputRevision: 1,
      draftRevision: 1,
      inputHash: HASH_A,
      markdown: '# Research',
      exportPayload: { summary: 's', findings: [] },
      approvedAt: '2026-11-08T00:00:00.000Z',
      ...overrides,
    };
  }

  it('commits a RESEARCH note with version 1', async () => {
    const result = await saveResearchArtifact(input(), db);
    expect(result.created).toBe(true);
    expect(result.note.sdlcArtifact?.kind).toBe('RESEARCH');
    expect(result.note.title).toBe('RESEARCH v1');
  });

  it('increments the version and loads the latest payload', async () => {
    await saveResearchArtifact(input(), db);
    const second = await saveResearchArtifact(
      input({ inputHash: HASH_B, exportPayload: { summary: 'v2', findings: [{ id: 'f1' }] } }),
      db,
    );
    expect(second.note.sdlcArtifact?.version).toBe(2);

    const latest = await loadLatestResearchArtifact(CR_ID, db);
    expect(latest?.version).toBe(2);
    expect(latest?.payload).toEqual({ summary: 'v2', findings: [{ id: 'f1' }] });
  });

  it('loads all versions ascending', async () => {
    await saveResearchArtifact(input(), db);
    await saveResearchArtifact(input({ inputHash: HASH_B }), db);

    const all = await loadAllResearchArtifacts(CR_ID, db);
    expect(all.map((version) => version.version)).toEqual([1, 2]);
  });

  it('returns null when the CR has no research', async () => {
    expect(await loadLatestResearchArtifact(OTHER_CR_ID, db)).toBeNull();
    expect(await loadAllResearchArtifacts(OTHER_CR_ID, db)).toEqual([]);
  });
});
