import { describe, expect, it } from 'vitest';
import { createSdlcWorkflowCoordinator } from '../workflowCoordinator';

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
