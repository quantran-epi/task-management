import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskTable } from '../../src/components/tasks/TaskTable';
import { TimerContext, type TimerContextValue } from '../../src/context/TimerContext';
import type { Task, ChangeRequest, System, ActiveTimer } from '../../src/types/models';

describe('TaskTableTimer', () => {
  const mockStart = vi.fn();
  const mockPause = vi.fn();
  const mockFinish = vi.fn();
  const mockOpenDrawer = vi.fn();
  const mockSelectRows = vi.fn();

  const mockTasks: Task[] = [
    {
      id: 'task-1',
      crId: 'cr-1',
      name: 'Nhiệm vụ kiểm thử 1',
      status: 'In Progress',
      progress: 50,
      priority: 'High',
      estimateMinutes: 60,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'task-2',
      crId: 'cr-1',
      name: 'Nhiệm vụ kiểm thử 2',
      status: 'Open',
      progress: 0,
      priority: 'Medium',
      estimateMinutes: 120,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const mockChangeRequests: ChangeRequest[] = [];
  const mockSystems: System[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderWithTimerContext = (
    contextOverride: Partial<TimerContextValue> = {},
    tasks: Task[] = mockTasks
  ) => {
    const defaultValue: TimerContextValue = {
      activeTimers: [],
      getTimerForTask: vi.fn().mockReturnValue(undefined),
      getElapsedSeconds: vi.fn().mockReturnValue(0),
      startTimer: mockStart,
      pauseTimer: mockPause,
      finishTimer: mockFinish,
      cancelTimer: vi.fn(),
      ...contextOverride,
    };

    return render(
      <TimerContext.Provider value={defaultValue}>
        <TaskTable
          tasks={tasks}
          changeRequests={mockChangeRequests}
          systems={mockSystems}
          selectedRowKeys={[]}
          onSelectRows={mockSelectRows}
          onOpenDrawer={mockOpenDrawer}
        />
      </TimerContext.Provider>
    );
  };

  it('renders Start button for idle tasks and triggers startTimer on click without opening drawer', () => {
    renderWithTimerContext();

    const startButtons = screen.getAllByRole('button', { name: 'Bắt đầu tính giờ' });
    expect(startButtons.length).toBeGreaterThan(0);

    fireEvent.click(startButtons[0]!);
    expect(mockStart).toHaveBeenCalledWith('task-1');
    expect(mockOpenDrawer).not.toHaveBeenCalled();
  });

  it('renders pause and finish buttons when a task has an active running timer', () => {
    const runningTimer: ActiveTimer = {
      taskId: 'task-1',
      status: 'running',
      startedAt: Date.now() - 300 * 1000,
      accumulatedMs: 0,
      sessionStartTime: new Date().toISOString(),
    };

    renderWithTimerContext({
      activeTimers: [runningTimer],
      getTimerForTask: (taskId) => (taskId === 'task-1' ? runningTimer : undefined),
      getElapsedSeconds: (taskId) => (taskId === 'task-1' ? 300 : 0),
    });

    expect(screen.getByText('00:05:00')).toBeInTheDocument();

    const pauseBtn = screen.getByRole('button', { name: 'Tạm dừng' });
    expect(pauseBtn).toBeInTheDocument();
    fireEvent.click(pauseBtn);
    expect(mockPause).toHaveBeenCalledWith('task-1');
    expect(mockOpenDrawer).not.toHaveBeenCalled();

    const finishBtn = screen.getByRole('button', { name: 'Kết thúc phiên' });
    expect(finishBtn).toBeInTheDocument();
    fireEvent.click(finishBtn);
    expect(mockFinish).toHaveBeenCalledWith('task-1');
    expect(mockOpenDrawer).not.toHaveBeenCalled();
  });

  it('renders resume and finish buttons when a task timer is paused', () => {
    const pausedTimer: ActiveTimer = {
      taskId: 'task-1',
      status: 'paused',
      startedAt: Date.now(),
      accumulatedMs: 60000,
      sessionStartTime: new Date().toISOString(),
    };

    renderWithTimerContext({
      activeTimers: [pausedTimer],
      getTimerForTask: (taskId) => (taskId === 'task-1' ? pausedTimer : undefined),
      getElapsedSeconds: (taskId) => (taskId === 'task-1' ? 60 : 0),
    });

    expect(screen.getByText('00:01:00')).toBeInTheDocument();

    const resumeBtn = screen.getByRole('button', { name: 'Tiếp tục' });
    expect(resumeBtn).toBeInTheDocument();
    fireEvent.click(resumeBtn);
    expect(mockStart).toHaveBeenCalledWith('task-1');
  });

  it('displays estimate and spent time ratio properly', () => {
    renderWithTimerContext();

    // Estimate formatting displays / 1h and / 2h
    expect(screen.getByText('/ 1h')).toBeInTheDocument();
    expect(screen.getByText('/ 2h')).toBeInTheDocument();
  });

  it('labels the timer column "Đồng hồ" and keeps elapsed time ahead of the estimate', () => {
    renderWithTimerContext();

    expect(screen.getByRole('columnheader', { name: 'Đồng hồ' })).toBeInTheDocument();
    // Elapsed ticker renders before the estimate in the same row.
    const row = screen.getByText('Nhiệm vụ kiểm thử 1').closest('tr');
    expect(row).not.toBeNull();
    expect(row).toHaveTextContent('/ 1h');
  });
});
