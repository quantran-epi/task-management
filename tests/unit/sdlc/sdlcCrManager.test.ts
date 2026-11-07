import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../../src/db';
import {
  LEGACY_SYSTEM_ID,
  getStepThread,
  getMultiPackState,
  groupPacksBySystem,
  saveMultiPackState,
  type ChangePackHistoryItem,
  type MultiPackState,
} from '../../../src/services/wizard/sdlcCrManager';

const SYSTEM_A = '44444444-4444-4444-8444-444444444444';
const SYSTEM_B = '55555555-5555-4555-8555-555555555555';

describe('sdlcCrManager', () => {
  let db: TaskPlannerDatabase;
  const projectId = 'proj-test-123';

  beforeEach(() => {
    db = new TaskPlannerDatabase(`test-db-${Math.random()}`);
  });

  it('getStepThread resolves an isolated ChatThread with scopeKey sdlc:${projectId}:${crId}:${stepId} for each step', async () => {
    const crId = '11111111-1111-4111-8111-111111111111';
    const steps = ['INTAKE', 'SOLUTION', 'CODE_GUIDE', 'CHANGE_PACK', 'TECH_DOCS', 'CAB'] as const;

    for (const step of steps) {
      const thread = await getStepThread(projectId, crId, step, db);
      expect(thread).toBeDefined();
      expect(thread.scopeKey).toBe(`sdlc:${projectId}:${crId}:${step}`);
      expect(thread.entityId).toBe(crId);
      expect(thread.scopeType).toBe('cr');

      // Verify idempotency
      const threadAgain = await getStepThread(projectId, crId, step, db);
      expect(threadAgain.id).toBe(thread.id);
    }

    // Verify all 6 threads are distinct
    const allThreads = await db.chatThreads.toArray();
    const crThreads = allThreads.filter((t) => t.scopeKey.startsWith(`sdlc:${projectId}:${crId}:`));
    expect(crThreads).toHaveLength(6);
    const uniqueKeys = new Set(crThreads.map((t) => t.scopeKey));
    expect(uniqueKeys.size).toBe(6);
  });

  it('saveMultiPackState and getMultiPackState round-trip two packs with different systemIds under one CR', async () => {
    const crId = 'cr-test-abc';

    const initial = await getMultiPackState(projectId, crId, db);
    expect(initial.packs).toEqual([]);
    expect(initial.activePackHash).toBeUndefined();

    const stateToSave: MultiPackState = {
      activePackHash: 'hash-pack-1',
      packs: [
        {
          hash: 'hash-pack-1',
          filename: 'change-pack-a.zip',
          uploadedAt: '2026-11-01T10:00:00.000Z',
          fileSize: 10240,
          systemId: SYSTEM_A,
          driftSummary: { outsideSolution: 0, missingImplementation: 1, divergent: 0 },
        },
        {
          hash: 'hash-pack-2',
          filename: 'change-pack-b.zip',
          uploadedAt: '2026-11-01T12:00:00.000Z',
          fileSize: 15360,
          systemId: SYSTEM_B,
        },
      ],
    };

    await saveMultiPackState(projectId, crId, stateToSave, db);

    const loaded = await getMultiPackState(projectId, crId, db);
    expect(loaded.activePackHash).toBe('hash-pack-1');
    expect(loaded.packs).toHaveLength(2);
    expect(loaded.packs[0]?.systemId).toBe(SYSTEM_A);
    expect(loaded.packs[1]?.systemId).toBe(SYSTEM_B);

    // Persisted key format stays byte-identical (Pitfall 1).
    const settingRow = await db.settings.get(`sdlc_packs:${projectId}:${crId}`);
    expect(settingRow).toBeDefined();
    expect(settingRow?.value).toBe(JSON.stringify(stateToSave));
  });

  it('groupPacksBySystem buckets pack history per subsystem', () => {
    const packs: ChangePackHistoryItem[] = [
      { hash: 'h1', filename: 'a.zip', uploadedAt: '2026-11-01T10:00:00.000Z', fileSize: 1, systemId: SYSTEM_A },
      { hash: 'h2', filename: 'b.zip', uploadedAt: '2026-11-01T11:00:00.000Z', fileSize: 1, systemId: SYSTEM_B },
      { hash: 'h3', filename: 'c.zip', uploadedAt: '2026-11-01T12:00:00.000Z', fileSize: 1, systemId: SYSTEM_A },
    ];

    const grouped = groupPacksBySystem({ packs });
    expect(grouped[SYSTEM_A]?.map((p) => p.hash)).toEqual(['h1', 'h3']);
    expect(grouped[SYSTEM_B]?.map((p) => p.hash)).toEqual(['h2']);
  });

  it('keeps a pre-subsystem pack row visible instead of dropping it', async () => {
    const crId = 'cr-legacy';
    await db.settings.put({
      key: `sdlc_packs:${projectId}:${crId}`,
      value: JSON.stringify({
        packs: [{ hash: 'legacy', filename: 'legacy.zip', uploadedAt: '2026-01-01T00:00:00.000Z', fileSize: 128 }],
      }),
    });

    const loaded = await getMultiPackState(projectId, crId, db);
    expect(loaded.packs).toHaveLength(1);
    expect(loaded.packs[0]?.systemId).toBe(LEGACY_SYSTEM_ID);
  });
});
