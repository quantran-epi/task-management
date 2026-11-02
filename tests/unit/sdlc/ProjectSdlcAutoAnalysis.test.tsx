import { forwardRef, useImperativeHandle } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../../src/db';
import { ProjectSdlcView } from '../../../src/views/ProjectSdlcView';
import { createNewCr } from '../../../src/services/wizard/sdlcCrManager';
import type { StepChatPanelHandle, StepChatPanelProps } from '../../../src/components/sdlc/chat/StepChatPanel';

const { requestArtifactAnalysis } = vi.hoisted(() => ({ requestArtifactAnalysis: vi.fn() }));
vi.mock('../../../src/components/sdlc/chat/StepChatPanel', () => ({
  StepChatPanel: forwardRef<StepChatPanelHandle, StepChatPanelProps>(({ stepId, crId }, ref) => {
    useImperativeHandle(ref, () => ({ sendMessage: vi.fn(), requestArtifactAnalysis }));
    return <div data-testid="analysis-panel" data-step={stepId} data-cr={crId} />;
  }),
}));

// Freeze only the analysis delay while real IndexedDB and form promises settle.
// Then fake timers can advance the actual scheduled callback without racing DB setup.
function holdAnalysisTimer() {
  const nativeSetTimeout = globalThis.setTimeout;
  const timers: Array<{ run: () => void; handle: number | ReturnType<typeof setTimeout> }> = [];
  const spy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: () => void, delay?: number, ...args: unknown[]) => {
    const handle = nativeSetTimeout(callback, delay === 150 ? 60_000 : delay, ...args);
    if (delay === 150) timers.push({ run: callback, handle });
    return handle;
  }) as typeof setTimeout);
  return {
    timers,
    release() {
      spy.mockRestore();
      for (const timer of timers) clearTimeout(timer.handle);
    },
  };
}

describe('ProjectSdlcView intake auto-analysis', () => {
  let db: TaskPlannerDatabase;
  let projectId: string;

  beforeEach(async () => {
    requestArtifactAnalysis.mockClear();
    projectId = crypto.randomUUID();
    db = new TaskPlannerDatabase(`test-auto-analysis-${crypto.randomUUID()}`);
    const timestamp = new Date().toISOString();
    await db.projects.add({ id: projectId, name: 'Intake activation', status: 'In Progress', createdAt: timestamp, updatedAt: timestamp });
  });

  afterEach(async () => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    await db.delete();
  });

  async function submitIntake() {
    const view = render(<ProjectSdlcView projectId={projectId} onBack={vi.fn()} db={db} />);
    await screen.findByText('SDLC Studio — Intake activation');
    expect(await db.settings.get(`sdlc_crs:${projectId}`)).toBeUndefined();
    fireEvent.change(screen.getByPlaceholderText(/Mã CR \(ví dụ/i), { target: { value: 'CR-AUTO' } });
    fireEvent.change(screen.getByPlaceholderText(/Tên tính năng \(ví dụ/i), { target: { value: 'Phân tích đúng một lần' } });
    fireEvent.change(screen.getByPlaceholderText(/Nội dung Yêu cầu nghiệp vụ/i), { target: { value: 'PL01 yêu cầu nghiệp vụ' } });
    fireEvent.change(screen.getByPlaceholderText(/Nội dung Đặc tả chức năng/i), { target: { value: 'PL02 đặc tả chức năng' } });
    const held = holdAnalysisTimer();
    fireEvent.click(screen.getByRole('button', { name: /Bắt đầu phân tích Solution/i }));
    await waitFor(() => {
      expect(screen.getByTestId('analysis-panel')).toHaveAttribute('data-step', 'SOLUTION');
      expect(held.timers).toHaveLength(1);
    });
    expect(requestArtifactAnalysis).not.toHaveBeenCalled();
    return { ...view, held };
  }

  it('successful intake schedules exactly one analysis; remount and step visits add none', async () => {
    const { held, unmount } = await submitIntake();
    held.release();
    act(() => { held.timers[0]!.run(); });
    expect(requestArtifactAnalysis).toHaveBeenCalledTimes(1);
    vi.useFakeTimers();
    act(() => { vi.advanceTimersByTime(500); });
    expect(requestArtifactAnalysis).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
    unmount();
    render(<ProjectSdlcView projectId={projectId} onBack={vi.fn()} db={db} />);
    await screen.findByRole('button', { name: /Đặt lại quy trình/i }, { timeout: 5000 });
    fireEvent.click(screen.getByTestId('sidebar-step-SOLUTION'));
    await screen.findByRole('button', { name: /Phân tích lại bằng AI/i });
    vi.useFakeTimers();
    act(() => { vi.advanceTimersByTime(500); });
    expect(requestArtifactAnalysis).toHaveBeenCalledTimes(1);
  });

  it('navigation cancels activation, including callback already ready in same batched tick', async () => {
    const { held } = await submitIntake();
    const clearTimer = vi.spyOn(globalThis, 'clearTimeout');
    act(() => {
      fireEvent.click(screen.getByTestId('sidebar-step-INTAKE'));
      // Model a callback already dequeued before clearTimeout: synchronous ref must guard it.
      held.timers[0]!.run();
    });
    expect(clearTimer).toHaveBeenCalledWith(held.timers[0]!.handle);
    expect(screen.getByTestId('analysis-panel')).toHaveAttribute('data-step', 'INTAKE');
    held.release();
    vi.useFakeTimers();
    act(() => { vi.advanceTimersByTime(500); });
    expect(requestArtifactAnalysis).not.toHaveBeenCalled();
  });

  it('switching CR cancels pending activation and rejects stale callback', async () => {
    const { held } = await submitIntake();
    const cr = await createNewCr(projectId, {
      cr: 'CR-OTHER', featureName: 'Other scope', author: 'Tester', requestingUnit: 'CNTT', date: '2026-11-02',
    }, false, db);
    const select = await screen.findByTestId('sidebar-cr-select');
    fireEvent.mouseDown(within(select).getByRole('combobox'));
    fireEvent.click(await screen.findByText('CR-OTHER'));
    await waitFor(() => expect(screen.getByTestId('analysis-panel')).toHaveAttribute('data-cr', cr.id));
    act(() => { held.timers[0]!.run(); });
    held.release();
    vi.useFakeTimers();
    act(() => { vi.advanceTimersByTime(500); });
    expect(requestArtifactAnalysis).not.toHaveBeenCalled();
  });

  it('unmount cancels pending activation and remount cannot restart it', async () => {
    const { held, unmount } = await submitIntake();
    const clearTimer = vi.spyOn(globalThis, 'clearTimeout');
    unmount();
    expect(clearTimer).toHaveBeenCalledWith(held.timers[0]!.handle);
    held.release();
    render(<ProjectSdlcView projectId={projectId} onBack={vi.fn()} db={db} />);
    await screen.findByRole('button', { name: /Đặt lại quy trình/i }, { timeout: 5000 });
    vi.useFakeTimers();
    act(() => { vi.advanceTimersByTime(500); });
    expect(requestArtifactAnalysis).not.toHaveBeenCalled();
  });

  it('explicit analysis still starts one request per completed click', async () => {
    const { held } = await submitIntake();
    held.release();
    act(() => { held.timers[0]!.run(); });
    const button = await screen.findByRole('button', { name: /Phân tích lại bằng AI/i });
    vi.useFakeTimers();
    fireEvent.click(button);
    act(() => { vi.advanceTimersByTime(149); });
    expect(requestArtifactAnalysis).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(1); });
    expect(requestArtifactAnalysis).toHaveBeenCalledTimes(2);
    fireEvent.click(button);
    act(() => { vi.advanceTimersByTime(150); });
    expect(requestArtifactAnalysis).toHaveBeenCalledTimes(3);
  });
});
