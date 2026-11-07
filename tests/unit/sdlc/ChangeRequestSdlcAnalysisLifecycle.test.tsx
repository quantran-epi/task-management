import { forwardRef, useImperativeHandle } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../../src/db';
import { ChangeRequestSdlcView } from '../../../src/views/ChangeRequestSdlcView';
import { createSdlcWorkflowCoordinator, workflowStorageKey } from '../../../src/services/wizard/workflowCoordinator';
import type { StepChatPanelHandle, StepChatPanelProps } from '../../../src/components/sdlc/chat/StepChatPanel';

const { requestArtifactAnalysis } = vi.hoisted(() => ({ requestArtifactAnalysis: vi.fn() }));

vi.mock('../../../src/components/sdlc/chat/StepChatPanel', () => ({
  StepChatPanel: forwardRef<StepChatPanelHandle, StepChatPanelProps>(({ stepId }, ref) => {
    useImperativeHandle(ref, () => ({ sendMessage: vi.fn(), requestArtifactAnalysis, requestArtifact: vi.fn() }));
    return <div data-testid="analysis-panel" data-step={stepId} />;
  }),
}));

describe('ChangeRequestSdlcView solution-analysis timer lifecycle', () => {
  let db: TaskPlannerDatabase;
  let projectId: string;

  beforeEach(async () => {
    requestArtifactAnalysis.mockClear();
    projectId = crypto.randomUUID();
    db = new TaskPlannerDatabase(`test-analysis-lifecycle-${crypto.randomUUID()}`);
    const timestamp = new Date().toISOString();
    await db.changeRequests.add({
      id: projectId,
      name: 'Analysis lifecycle',
      code: 'CR-TIMER',
      status: 'In Progress',
      type: 'ENHANCEMENT',
      targets: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const metadata = { cr: 'CR-TIMER', featureName: 'Timer lifecycle', author: 'Tester', requestingUnit: 'CNTT', date: '2026-11-02' };
    const coordinator = createSdlcWorkflowCoordinator({ changeRequestId: projectId, threadId: crypto.randomUUID() });
    const state = await coordinator.startOrUpdateIntake(metadata, 'PL01 baseline', 'PL02 baseline');
    await db.settings.put({ key: workflowStorageKey(projectId, projectId), value: JSON.stringify(state) });
  });

  afterEach(async () => {
    cleanup();
    vi.useRealTimers();
    await db.delete();
  });

  async function openSolution() {
    const view = render(<ChangeRequestSdlcView changeRequestId={projectId} onBack={vi.fn()} db={db} />);
    await screen.findByRole('button', { name: /Đặt lại quy trình/i }, { timeout: 5000 });
    fireEvent.click(screen.getByText(/Bước 2: Thiết kế giải pháp/i));
    const trigger = await screen.findByRole('button', { name: /Phân tích lại bằng AI/i });
    await waitFor(() => expect(screen.queryByText(/Chưa đủ điều kiện/i)).not.toBeInTheDocument());
    expect(requestArtifactAnalysis).not.toHaveBeenCalled();
    vi.useFakeTimers();
    return { ...view, trigger };
  }

  it('dispatches once after 150ms with Step 2 selected', async () => {
    const { trigger } = await openSolution();
    fireEvent.click(trigger);
    expect(screen.getByTestId('analysis-panel')).toHaveAttribute('data-step', 'SOLUTION');
    act(() => { vi.advanceTimersByTime(149); });
    expect(requestArtifactAnalysis).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(requestArtifactAnalysis).toHaveBeenCalledTimes(1);
  });

  it('replaces a pending request instead of dispatching twice', async () => {
    const { trigger } = await openSolution();
    fireEvent.click(trigger);
    act(() => { vi.advanceTimersByTime(100); });
    fireEvent.click(trigger);
    act(() => { vi.advanceTimersByTime(149); });
    expect(requestArtifactAnalysis).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(requestArtifactAnalysis).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(150); });
    expect(requestArtifactAnalysis).toHaveBeenCalledTimes(1);
  });

  it('clears the pending timer on unmount without dispatching', async () => {
    const { trigger, unmount } = await openSolution();
    const scheduleTimer = vi.spyOn(globalThis, 'setTimeout');
    const clearTimer = vi.spyOn(globalThis, 'clearTimeout');
    fireEvent.click(trigger);
    const scheduled = scheduleTimer.mock.calls.findIndex(([, delay]) => delay === 150);
    expect(scheduled).toBeGreaterThanOrEqual(0);
    const handle = scheduleTimer.mock.results[scheduled]!.value;
    unmount();
    expect(clearTimer).toHaveBeenCalledWith(handle);
    act(() => { vi.advanceTimersByTime(150); });
    expect(requestArtifactAnalysis).not.toHaveBeenCalled();
    clearTimer.mockRestore();
    scheduleTimer.mockRestore();
  });
});
