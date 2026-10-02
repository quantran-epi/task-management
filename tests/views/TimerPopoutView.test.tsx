import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { TimerPopoutView } from '../../src/views/TimerPopoutView';
import { TimerContext, type TimerContextValue } from '../../src/context/TimerContext';
import { TaskPlannerDatabase } from '../../src/db';
import * as timerPopoutUtils from '../../src/utils/timerPopout';

const mockPause = vi.fn();
const mockStart = vi.fn();
const mockFinish = vi.fn();
const mockCancel = vi.fn();

function renderWithContext(
  contextOverrides: Partial<TimerContextValue> = {},
  database?: TaskPlannerDatabase
) {
  const defaultContext: TimerContextValue = {
    activeTimers: [],
    getTimerForTask: () => undefined,
    getElapsedSeconds: () => 125, // 02:05
    startTimer: mockStart,
    pauseTimer: mockPause,
    finishTimer: mockFinish,
    cancelTimer: mockCancel,
    ...contextOverrides,
  };

  return render(
    <TimerContext.Provider value={defaultContext}>
      <TimerPopoutView database={database} />
    </TimerContext.Provider>
  );
}

describe('TimerPopoutView', () => {
  let testDb: TaskPlannerDatabase;

  beforeEach(async () => {
    vi.clearAllMocks();
    testDb = new TaskPlannerDatabase(`TestPopoutDB_${Date.now()}_${Math.random()}`);
    await testDb.open();
  });

  afterEach(async () => {
    await testDb.delete();
  });

  it('renders empty state when no timers are active', () => {
    renderWithContext({ activeTimers: [] });

    expect(screen.getByTestId('timer-popout-header')).toBeInTheDocument();
    expect(screen.getByText('Bộ đếm thời gian')).toBeInTheDocument();
    expect(screen.getByTestId('timer-popout-empty')).toBeInTheDocument();
    expect(screen.getByText('Không có bộ đếm nào đang chạy')).toBeInTheDocument();
  });

  it('renders single timer with controls and handles actions', () => {
    renderWithContext({
      activeTimers: [
        {
          taskId: 'task-1',
          status: 'running',
          startedAt: Date.now() - 125000,
          accumulatedMs: 0,
          sessionStartTime: new Date().toISOString(),
        },
      ],
      getElapsedSeconds: () => 125,
    });

    expect(screen.getByTestId('popout-timer-row-task-1')).toBeInTheDocument();
    expect(screen.getByTestId('popout-elapsed-ticker')).toHaveTextContent('02:05');

    // Pause action
    const pauseBtn = screen.getByRole('button', { name: 'Tạm dừng' });
    fireEvent.click(pauseBtn);
    expect(mockPause).toHaveBeenCalledWith('task-1');

    // Finish action
    const finishBtn = screen.getByRole('button', { name: 'Kết thúc phiên' });
    fireEvent.click(finishBtn);
    expect(mockFinish).toHaveBeenCalledWith('task-1');
  });

  it('renders paused state with play button in single timer mode', () => {
    renderWithContext({
      activeTimers: [
        {
          taskId: 'task-1',
          status: 'paused',
          startedAt: Date.now(),
          accumulatedMs: 60000,
          sessionStartTime: new Date().toISOString(),
        },
      ],
      getElapsedSeconds: () => 60,
    });

    const playBtn = screen.getByRole('button', { name: 'Tiếp tục' });
    expect(playBtn).toBeInTheDocument();
    fireEvent.click(playBtn);
    expect(mockStart).toHaveBeenCalledWith('task-1');
  });

  it('renders multiple concurrent active timers in stacked list layout', () => {
    renderWithContext({
      activeTimers: [
        {
          taskId: 'task-1',
          status: 'running',
          startedAt: Date.now() - 60000,
          accumulatedMs: 0,
          sessionStartTime: new Date().toISOString(),
        },
        {
          taskId: 'task-2',
          status: 'paused',
          startedAt: Date.now(),
          accumulatedMs: 120000,
          sessionStartTime: new Date().toISOString(),
        },
      ],
      getElapsedSeconds: (id) => (id === 'task-1' ? 60 : 120),
    });

    expect(screen.getByTestId('popout-multi-timer-list')).toBeInTheDocument();
    expect(screen.getByTestId('popout-timer-row-task-1')).toBeInTheDocument();
    expect(screen.getByTestId('popout-timer-row-task-2')).toBeInTheDocument();

    const pauseBtns = screen.getAllByRole('button', { name: 'Tạm dừng' });
    expect(pauseBtns.length).toBe(1);
    const firstPause = pauseBtns[0];
    expect(firstPause).toBeDefined();
    if (firstPause) fireEvent.click(firstPause);
    expect(mockPause).toHaveBeenCalledWith('task-1');

    const playBtns = screen.getAllByRole('button', { name: 'Tiếp tục' });
    expect(playBtns.length).toBe(1);
    const firstPlay = playBtns[0];
    expect(firstPlay).toBeDefined();
    if (firstPlay) fireEvent.click(firstPlay);
    expect(mockStart).toHaveBeenCalledWith('task-2');
  });

  it('closes current popout from header close button', async () => {
    const closeSpy = vi.spyOn(timerPopoutUtils, 'closeCurrentPopoutWindow').mockResolvedValue(undefined);

    renderWithContext({ activeTimers: [] });

    fireEvent.click(screen.getByRole('button', { name: 'Đóng cửa sổ' }));

    await waitFor(() => {
      expect(closeSpy).toHaveBeenCalled();
    });
  });

  it('toggles pin alwaysOnTop state', async () => {
    vi.spyOn(timerPopoutUtils, 'isTauriApp').mockReturnValue(true);
    const setOnTopSpy = vi.spyOn(timerPopoutUtils, 'setWindowAlwaysOnTop').mockResolvedValue(true);
    vi.spyOn(timerPopoutUtils, 'isWindowAlwaysOnTop').mockResolvedValue(true);

    renderWithContext({ activeTimers: [] });

    const pinBtn = screen.getByRole('button', { name: 'Bỏ ghim' });
    expect(pinBtn).toBeInTheDocument();

    fireEvent.click(pinBtn);

    await waitFor(() => {
      expect(setOnTopSpy).toHaveBeenCalledWith(false);
    });
  });

  it('renders Project › Milestone hierarchy subtitle under task name (D-04)', async () => {
    await testDb.projects.add({
      id: 'proj-popout-1',
      name: 'Project Delta',
      status: 'In Progress',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await testDb.milestones.add({
      id: 'ms-popout-1',
      projectId: 'proj-popout-1',
      name: 'Milestone Beta',
      status: 'In Progress',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await testDb.tasks.add({
      id: 'task-popout-sub',
      projectId: 'proj-popout-1',
      milestoneId: 'ms-popout-1',
      name: 'Viết tài liệu tích hợp',
      status: 'In Progress',
      progress: 0,
      priority: 'Medium',
      estimateMinutes: 45,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    renderWithContext(
      {
        activeTimers: [
          {
            taskId: 'task-popout-sub',
            status: 'running',
            startedAt: Date.now() - 45000,
            accumulatedMs: 0,
            sessionStartTime: new Date().toISOString(),
            segments: [{ startTime: new Date().toISOString() }],
          },
        ],
        getElapsedSeconds: () => 45,
      },
      testDb
    );

    await waitFor(() => {
      expect(screen.getByText('Viết tài liệu tích hợp')).toBeInTheDocument();
      expect(screen.getByTestId('popout-hierarchy-subtitle')).toHaveTextContent('Project Delta › Milestone Beta');
    });
  });
});
