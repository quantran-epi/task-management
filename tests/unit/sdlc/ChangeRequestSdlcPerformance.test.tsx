import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { message } from 'antd';
import { TaskPlannerDatabase } from '../../../src/db';
import { ChangeRequestSdlcView } from '../../../src/views/ChangeRequestSdlcView';
import { Step1IntakeView } from '../../../src/components/sdlc/steps/Step1IntakeView';
import { createSdlcWorkflowCoordinator, workflowStorageKey } from '../../../src/services/wizard/workflowCoordinator';
import type { WizardEvidenceInput } from '../../../src/services/ai/wizardService';
import type { SdlcStepId } from '../../../src/services/wizard/workflowSchemas';

const mocks = vi.hoisted(() => ({
  collectEvidence: vi.fn(),
  resolveSetIds: vi.fn(),
  holdSolution: false,
  releaseThread: undefined as (() => void) | undefined,
}));
vi.mock('../../../src/services/wizard/sdlcWizardRuntime', () => ({
  createSdlcWizardRuntime: async () => ({ model: {}, collectEvidence: mocks.collectEvidence, resolveSetIds: mocks.resolveSetIds }),
}));
vi.mock('../../../src/services/wizard/sdlcCrManager', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/services/wizard/sdlcCrManager')>();
  return {
    ...actual,
    getStepThread: async (...args: Parameters<typeof actual.getStepThread>) => {
      if (mocks.holdSolution && args[2] === 'SOLUTION') {
        await new Promise<void>((resolve) => { mocks.releaseThread = resolve; });
      }
      return actual.getStepThread(...args);
    },
  };
});
vi.mock('../../../src/components/sdlc/SdlcSidebar', () => ({
  SdlcSidebar: ({ onSelectStep }: { onSelectStep: (step: SdlcStepId) => void }) => (
    <button onClick={() => onSelectStep('SOLUTION')}>Select SOLUTION</button>
  ),
}));
vi.mock('../../../src/components/sdlc/SdlcWorkspace', () => ({
  SdlcWorkspace: ({ selectedStep, stepGroundingContext }: { selectedStep: string; stepGroundingContext: { text: string } }) => (
    <div data-testid="workspace" data-step={selectedStep}>{stepGroundingContext.text}</div>
  ),
}));

const metadata = { cr: 'CR-PERF', featureName: 'Navigation', author: 'Tester', requestingUnit: 'CNTT', date: '2026-11-04' };

describe('SDLC navigation work budgets', () => {
  let db: TaskPlannerDatabase;
  let projectId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(message, 'success').mockImplementation(() => undefined as never);
    mocks.holdSolution = false;
    mocks.releaseThread = undefined;
    mocks.resolveSetIds.mockResolvedValue(['base-set']);
    mocks.collectEvidence.mockResolvedValue({ items: [], coverage: 'EMPTY_SCOPE', degraded: [] });
    db = new TaskPlannerDatabase(`sdlc-perf-${crypto.randomUUID()}`);
    projectId = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    await db.changeRequests.add({
      id: projectId,
      name: 'Performance',
      code: 'CR-PERF',
      status: 'In Progress',
      type: 'ENHANCEMENT',
      targets: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  });

  afterEach(async () => {
    await act(async () => {
      mocks.releaseThread?.();
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    cleanup();
    vi.restoreAllMocks();
    await db.delete();
  });

  it.each([0, 1])('reads picker corpus only when opened (%i notes), preserving selection', async (noteCount) => {
    const timestamp = new Date().toISOString();
    if (noteCount) await db.notes.add({ id: 'note-1', entityId: projectId, entityType: 'cr', title: 'PL01 source', body: 'Requirement body', isPinned: false, createdAt: timestamp, updatedAt: timestamp });
    const notesRead = vi.spyOn(db.notes, 'toArray');
    const crsRead = vi.spyOn(db.changeRequests, 'toArray');
    render(<Step1IntakeView projectId={projectId} onStartIntake={vi.fn()} db={db} />);
    // Flush async liveQuery subscription, including its initial scheduling task.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
    expect(notesRead).not.toHaveBeenCalled();
    expect(crsRead).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole('button', { name: /Chọn từ Notes/ })[0]!);
    await waitFor(() => expect(notesRead).toHaveBeenCalledTimes(1));
    expect(crsRead).toHaveBeenCalled();
    if (noteCount) {
      await screen.findByText('PL01 source');
      fireEvent.click(screen.getByRole('button', { name: 'Chọn' }));
      expect(screen.getByPlaceholderText('Nội dung Yêu cầu nghiệp vụ (PL01)...')).toHaveValue('Requirement body');
    } else {
      await screen.findByText('Không tìm thấy ghi chú nào phù hợp bộ lọc');
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    }
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
    // Closed picker unsubscribes; later writes must not restart its corpus scan.
    await act(async () => { await db.notes.update('note-1', { body: 'Updated source' }); });
    expect(notesRead).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])('collects once per step with matching thread (deferred thread %s)', async (deferredThread) => {
    const cr = { id: projectId };
    const coordinator = createSdlcWorkflowCoordinator({ changeRequestId: projectId, threadId: crypto.randomUUID() });
    const state = await coordinator.startOrUpdateIntake(metadata, 'PL01', 'PL02');
    await db.settings.put({ key: workflowStorageKey(projectId, cr.id), value: JSON.stringify(state) });
    render(<ChangeRequestSdlcView changeRequestId={projectId} onBack={vi.fn()} db={db} />);
    await screen.findByRole('button', { name: /Đặt lại quy trình/ });
    const intakeThread = await db.chatThreads.where('scopeKey').equals(`sdlc:${projectId}:${cr.id}:INTAKE`).first();
    await waitFor(() => expect(mocks.collectEvidence).toHaveBeenCalledWith(expect.objectContaining({ threadId: intakeThread?.id })));
    const beforeNavigation = mocks.collectEvidence.mock.calls.length;
    mocks.holdSolution = deferredThread;
    fireEvent.click(screen.getByRole('button', { name: 'Select SOLUTION' }));
    if (deferredThread) await waitFor(() => expect(mocks.releaseThread).toBeDefined());
    await waitFor(async () => {
      const row = await db.settings.get(workflowStorageKey(projectId, cr.id));
      expect(JSON.parse(String(row?.value)).currentStep).toBe('SOLUTION');
    });
    if (deferredThread) {
      expect(mocks.collectEvidence).toHaveBeenCalledTimes(beforeNavigation);
      await act(async () => { mocks.releaseThread!(); });
    }
    await waitFor(() => expect(mocks.collectEvidence).toHaveBeenCalledTimes(beforeNavigation + 1));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
    expect(mocks.collectEvidence).toHaveBeenCalledTimes(beforeNavigation + 1);
    const request = mocks.collectEvidence.mock.calls.at(-1)![0] as WizardEvidenceInput;
    const thread = await db.chatThreads.get(request.threadId);
    expect(thread?.scopeKey).toBe(`sdlc:${projectId}:${cr.id}:SOLUTION`);
    expect(request.query).toContain('SOLUTION');
    expect(screen.getByTestId('workspace')).toHaveAttribute('data-step', 'SOLUTION');
  });
});
