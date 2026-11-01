import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../../src/db';
import {
  createNewCr,
  listCrs,
  getActiveCr,
  completeCr,
  getStepThread,
  getMultiPackState,
  saveMultiPackState,
  type MultiPackState,
} from '../../../src/services/wizard/sdlcCrManager';
import type { SdlcWorkflowMetadata } from '../../../src/services/wizard/workflowSchemas';

describe('sdlcCrManager', () => {
  let db: TaskPlannerDatabase;
  const projectId = 'proj-test-123';

  beforeEach(() => {
    db = new TaskPlannerDatabase(`test-db-${Math.random()}`);
  });

  const sampleMetadata: SdlcWorkflowMetadata = {
    cr: 'CR-2026-001',
    featureName: 'Chuyển tiền nhanh Napas 247',
    author: 'Nguyen Van A',
    requestingUnit: 'Khối Ngân hàng số',
    date: '2026-11-01',
  };

  it('Test 1: createNewCr initializes a new CR with metadata, sets it active, and marks prior CR as read-only/archived', async () => {
    // 1. Initial CR creation
    const cr1 = await createNewCr(projectId, sampleMetadata, false, db);
    expect(cr1.id).toBeDefined();
    expect(cr1.crCode).toBe('CR-2026-001');
    expect(cr1.featureName).toBe('Chuyển tiền nhanh Napas 247');
    expect(cr1.status).toBe('active');
    expect(cr1.createdAt).toBeDefined();

    const activeCr1 = await getActiveCr(projectId, db);
    expect(activeCr1?.id).toBe(cr1.id);

    const list1 = await listCrs(projectId, db);
    expect(list1).toHaveLength(1);
    expect(list1[0]?.id).toBe(cr1.id);

    // 2. Second CR creation: prior CR should be marked archived
    const cr2Metadata: SdlcWorkflowMetadata = {
      cr: 'CR-2026-002',
      featureName: 'Nâng cấp bảo mật sinh trắc học',
      author: 'Tran Van B',
      requestingUnit: 'Khối An toàn thông tin',
      date: '2026-11-02',
    };

    const cr2 = await createNewCr(projectId, cr2Metadata, true, db);
    expect(cr2.id).toBeDefined();
    expect(cr2.status).toBe('active');

    const activeCr2 = await getActiveCr(projectId, db);
    expect(activeCr2?.id).toBe(cr2.id);

    const list2 = await listCrs(projectId, db);
    expect(list2).toHaveLength(2);
    const archivedCr = list2.find((c) => c.id === cr1.id);
    expect(archivedCr?.status).toBe('archived');
  });

  it('completeCr sets the CR status to completed', async () => {
    const cr = await createNewCr(projectId, sampleMetadata, false, db);
    expect(cr.status).toBe('active');

    await completeCr(projectId, cr.id, db);

    const activeCr = await getActiveCr(projectId, db);
    expect(activeCr).toBeNull();

    const list = await listCrs(projectId, db);
    const updated = list.find((c) => c.id === cr.id);
    expect(updated?.status).toBe('completed');
    expect(updated?.completedAt).toBeDefined();
  });

  it('Test 2: getStepThread resolves an isolated ChatThread with scopeKey sdlc:${projectId}:${crId}:${stepId} for each step', async () => {
    const cr = await createNewCr(projectId, sampleMetadata, false, db);
    const steps = ['INTAKE', 'SOLUTION', 'CODE_GUIDE', 'CHANGE_PACK', 'TECH_DOCS', 'CAB'] as const;

    for (const step of steps) {
      const thread = await getStepThread(projectId, cr.id, step, db);
      expect(thread).toBeDefined();
      expect(thread.scopeKey).toBe(`sdlc:${projectId}:${cr.id}:${step}`);
      expect(thread.entityId).toBe(projectId);

      // Verify idempotency
      const threadAgain = await getStepThread(projectId, cr.id, step, db);
      expect(threadAgain.id).toBe(thread.id);
    }

    // Verify all 6 threads are distinct
    const allThreads = await db.chatThreads.toArray();
    const crThreads = allThreads.filter((t) => t.scopeKey.startsWith(`sdlc:${projectId}:${cr.id}:`));
    expect(crThreads).toHaveLength(6);
    const uniqueKeys = new Set(crThreads.map((t) => t.scopeKey));
    expect(uniqueKeys.size).toBe(6);
  });

  it('Test 3: getMultiPackState and saveMultiPackState save and load multi-pack records under sdlc_packs:${projectId}:${crId} in settings', async () => {
    const crId = 'cr-test-abc';

    // Initial load returns empty state
    const initial = await getMultiPackState(projectId, crId, db);
    expect(initial.packs).toEqual([]);
    expect(initial.activePackHash).toBeUndefined();

    // Save multi-pack state
    const stateToSave: MultiPackState = {
      activePackHash: 'hash-pack-1',
      packs: [
        {
          hash: 'hash-pack-1',
          filename: 'change-pack-v1.zip',
          uploadedAt: '2026-11-01T10:00:00.000Z',
          fileSize: 10240,
          driftSummary: {
            outsideSolution: 0,
            missingImplementation: 1,
            divergent: 0,
          },
        },
        {
          hash: 'hash-pack-2',
          filename: 'change-pack-v2.zip',
          uploadedAt: '2026-11-01T12:00:00.000Z',
          fileSize: 15360,
        },
      ],
    };

    await saveMultiPackState(projectId, crId, stateToSave, db);

    const loaded = await getMultiPackState(projectId, crId, db);
    expect(loaded.activePackHash).toBe('hash-pack-1');
    expect(loaded.packs).toHaveLength(2);
    expect(loaded.packs[0]?.filename).toBe('change-pack-v1.zip');
    expect(loaded.packs[1]?.hash).toBe('hash-pack-2');

    // Verify it is stored in settings table
    const settingRow = await db.settings.get(`sdlc_packs:${projectId}:${crId}`);
    expect(settingRow).toBeDefined();
    expect(settingRow?.value).toBe(JSON.stringify(stateToSave));
  });
});
