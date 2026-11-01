import { describe, expect, it } from 'vitest';
import { createSdlcWorkflowCoordinator } from '../workflowCoordinator';
import type { SdlcWorkflowState } from '../workflowSchemas';

describe('createSdlcWorkflowCoordinator', () => {
  const dummyUuid1 = '11111111-1111-4111-8111-111111111111';
  const dummyUuid2 = '22222222-2222-4222-8222-222222222222';

  const deps = {
    projectId: dummyUuid1,
    threadId: dummyUuid2,
  };

  it('từ chối khi PL01 hoặc PL02 rỗng', async () => {
    const coordinator = createSdlcWorkflowCoordinator(deps);
    const metadata = {
      cr: 'CR-001',
      featureName: 'Feature A',
      author: 'Author',
      requestingUnit: 'Unit',
      date: '2026-10-30',
    };

    await expect(coordinator.startOrUpdateIntake(metadata, '', 'PL02 text')).rejects.toThrow('INTAKE_PL01_REQUIRED');
    await expect(coordinator.startOrUpdateIntake(metadata, 'PL01 text', '')).rejects.toThrow('INTAKE_PL02_REQUIRED');
  });

  it('hoàn thành Intake và chuyển sang bước SOLUTION', async () => {
    const coordinator = createSdlcWorkflowCoordinator(deps);
    const metadata = {
      cr: 'CR-001',
      featureName: 'Feature A',
      author: 'Author',
      requestingUnit: 'Unit',
      date: '2026-10-30',
    };

    const state = await coordinator.startOrUpdateIntake(metadata, 'Yêu cầu PL01', 'Đặc tả PL02');
    expect(state.currentStep).toBe('SOLUTION');
    expect(state.artifacts.pl01?.hash).toBeDefined();
    expect(state.artifacts.pl02?.hash).toBeDefined();
    expect(state.artifacts.pl02?.sourceHashes).toContain(state.artifacts.pl01?.hash);
  });

  it('lưu SOLUTION v1 và v2 cập nhật hash chuẩn xác', async () => {
    const coordinator = createSdlcWorkflowCoordinator(deps);
    const metadata = {
      cr: 'CR-001',
      featureName: 'Feature A',
      author: 'Author',
      requestingUnit: 'Unit',
      date: '2026-10-30',
    };

    await coordinator.startOrUpdateIntake(metadata, 'Yêu cầu PL01', 'Đặc tả PL02');
    const stateV1 = await coordinator.commitSolution('# Solution v1 Markdown');
    expect(stateV1.artifacts.solution?.version).toBe(1);
    expect(stateV1.currentStep).toBe('CODE_GUIDE');

    const stateV2 = await coordinator.commitSolution('# Solution v2 Markdown');
    expect(stateV2.artifacts.solution?.version).toBe(2);
  });

  it('restores interrupted checkpoint without running AI and keeps selected step separate', async () => {
    let savedState;
    const coordinator = createSdlcWorkflowCoordinator({
      ...deps,
      loadState: async () => ({
        schemaVersion: 1,
        sessionId: dummyUuid1,
        projectId: dummyUuid1,
        threadId: dummyUuid2,
        currentStep: 'SOLUTION',
        selectedStep: 'INTAKE',
        metadata: { cr: 'CR-001', featureName: 'Feature A', author: 'Author', requestingUnit: 'Unit', date: '2026-10-30' },
        artifacts: {},
        staleSteps: [],
        checkpoint: { requestId: dummyUuid1, step: 'SOLUTION', status: 'running', startedAt: '2026-10-30T00:00:00.000Z' },
        createdAt: '2026-10-30T00:00:00.000Z',
        updatedAt: '2026-10-30T00:00:00.000Z',
      }),
      saveState: async (state) => { savedState = state; },
    });

    const restored = await coordinator.restore();
    expect(restored?.checkpoint?.status).toBe('interrupted');
    expect(restored?.currentStep).toBe('SOLUTION');
    expect(coordinator.selectStep('INTAKE')).toBe('INTAKE');
    expect(coordinator.getState()?.currentStep).toBe('SOLUTION');
    expect((savedState as { checkpoint?: { status?: string } } | undefined)?.checkpoint?.status).toBe('interrupted');

    const resumed = await coordinator.resumeCheckpoint();
    expect(resumed.checkpoint?.status).toBe('running');
    expect(resumed.checkpoint?.requestId).not.toBe(dummyUuid1);
  });

  it('requires explicit revision confirmation and preserves old version in history', async () => {
    const coordinator = createSdlcWorkflowCoordinator({ ...deps, hashText: async (text) => text === 'old' ? 'a'.repeat(64) : 'b'.repeat(64) });
    await coordinator.startOrUpdateIntake({ cr: 'CR-001', featureName: 'Feature A', author: 'Author', requestingUnit: 'Unit', date: '2026-10-30' }, 'PL01', 'PL02');
    await coordinator.commitSolution('old');
    const preview = await coordinator.previewRevision('SOLUTION', 'new');
    expect(preview.impactSteps).toEqual(['CODE_GUIDE', 'CHANGE_PACK', 'TECH_DOCS', 'CAB']);
    expect(preview.requiresConfirmation).toBe(true);
    const cancelled = coordinator.getState();
    expect(cancelled?.versions?.SOLUTION).toHaveLength(1);
    const committed = await coordinator.commitRevision(preview, true);
    expect(committed.versions?.SOLUTION).toHaveLength(2);
    expect(committed.activeVersions?.SOLUTION).toBe(2);
  });

  it('closes CAB cycle and opens new cycle for later revision', async () => {
    const coordinator = createSdlcWorkflowCoordinator(deps);
    await coordinator.startOrUpdateIntake({ cr: 'CR-001', featureName: 'Feature A', author: 'Author', requestingUnit: 'Unit', date: '2026-10-30' }, 'PL01', 'PL02');
    const closed = await coordinator.closeCycle();
    expect(closed.cycles?.at(-1)?.status).toBe('completed');
    const opened = await coordinator.openCycle();
    expect(opened.cycles?.at(-1)?.status).toBe('active');
  });
});

const restoreProjectId = '11111111-1111-4111-8111-111111111111';
const restoreThreadId = '22222222-2222-4222-8222-222222222222';
const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);

const restoreMetadata = { cr: 'CR-001', featureName: 'Feature A', author: 'Author', requestingUnit: 'Unit', date: '2026-10-30' };

function persistedState(overrides: Partial<SdlcWorkflowState> = {}): SdlcWorkflowState {
  return {
    schemaVersion: 1,
    sessionId: restoreProjectId,
    projectId: restoreProjectId,
    threadId: restoreThreadId,
    currentStep: 'SOLUTION',
    metadata: restoreMetadata,
    artifacts: {
      pl01: { kind: 'PL01', version: 1, hash: hashA, title: 'PL01', sourceHashes: [], updatedAt: '2026-10-30T00:00:00.000Z' },
      pl02: { kind: 'PL02', version: 1, hash: hashB, title: 'PL02', sourceHashes: [], updatedAt: '2026-10-30T00:00:00.000Z' },
      solution: { kind: 'SOLUTION', version: 1, hash: hashA, title: 'SOLUTION', sourceHashes: [], updatedAt: '2026-10-30T00:00:00.000Z' },
    },
    staleSteps: [],
    createdAt: '2026-10-30T00:00:00.000Z',
    updatedAt: '2026-10-30T00:00:00.000Z',
    ...overrides,
  };
}

describe('createSdlcWorkflowCoordinator restore-before-action', () => {
  it('restores persisted state before an action inspects artifacts', async () => {
    const coordinator = createSdlcWorkflowCoordinator({
      projectId: restoreProjectId,
      threadId: restoreThreadId,
      hashText: async (text) => (text === 'new body' ? hashB : hashA),
      loadState: async () => persistedState(),
    });

    const state = await coordinator.commitSolution('new body');
    expect(state.artifacts.solution?.version).toBe(2);
    expect(coordinator.getState()?.artifacts.solution?.version).toBe(2);
  });

  it('fails with WORKFLOW_NOT_INITIALIZED when nothing is persisted', async () => {
    const coordinator = createSdlcWorkflowCoordinator({ projectId: restoreProjectId, threadId: restoreThreadId, loadState: async () => undefined });
    await expect(coordinator.navigateToStep('CAB')).rejects.toThrow('WORKFLOW_NOT_INITIALIZED');
  });

  it('de-duplicates concurrent restores into one loadState call', async () => {
    let loadCalls = 0;
    const coordinator = createSdlcWorkflowCoordinator({
      projectId: restoreProjectId,
      threadId: restoreThreadId,
      loadState: async () => {
        loadCalls += 1;
        await Promise.resolve();
        return undefined;
      },
    });

    const results = await Promise.allSettled([
      coordinator.navigateToStep('SOLUTION'),
      coordinator.navigateToStep('CAB'),
    ]);

    expect(results.every((result) => result.status === 'rejected')).toBe(true);
    expect(loadCalls).toBe(1);
  });

  it('rejects malformed persisted state instead of adopting it', async () => {
    const coordinator = createSdlcWorkflowCoordinator({
      projectId: restoreProjectId,
      threadId: restoreThreadId,
      loadState: async () => ({ sessionId: restoreProjectId }) as unknown as SdlcWorkflowState,
    });

    await expect(coordinator.restore()).rejects.toThrow();
    expect(coordinator.getState()).toBeUndefined();
  });

  it('does not let an in-flight load overwrite a newer in-memory state', async () => {
    const pending: Array<(state: SdlcWorkflowState) => void> = [];
    const coordinator = createSdlcWorkflowCoordinator({
      projectId: restoreProjectId,
      threadId: restoreThreadId,
      loadState: () => new Promise<SdlcWorkflowState>((resolve) => { pending.push(resolve); }),
    });

    const first = coordinator.restore();
    const second = coordinator.restore();
    expect(pending).toHaveLength(2);

    pending[0]?.(persistedState({ currentStep: 'CAB' }));
    await first;
    pending[1]?.(persistedState({ currentStep: 'TECH_DOCS' }));
    const restored = await second;

    expect(restored?.currentStep).toBe('CAB');
    expect(coordinator.getState()?.currentStep).toBe('CAB');
  });

  it('adopts persisted state in startOrUpdateIntake instead of starting a new session', async () => {
    const coordinator = createSdlcWorkflowCoordinator({
      projectId: restoreProjectId,
      threadId: restoreThreadId,
      hashText: async () => hashA,
      createSessionId: () => restoreThreadId,
      loadState: async () => persistedState(),
    });

    const state = await coordinator.startOrUpdateIntake(restoreMetadata, 'PL01', 'PL02');
    expect(state.sessionId).toBe(restoreProjectId);
    expect(state.artifacts.pl01?.version).toBe(2);
  });
});
