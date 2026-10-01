import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { ActiveTimerWidget } from '../../src/components/timer/ActiveTimerWidget';
import { TimerContext, type TimerContextValue } from '../../src/context/TimerContext';
import { TaskPlannerDatabase } from '../../src/db';
import type { ActiveTimer, Task } from '../../src/types/models';

describe('ActiveTimerWidget', () => {
  const mockPause = vi.fn();
  const mockStart = vi.fn();
  const mockFinish = vi.fn();
  const mockCancel = vi.fn();
  let testDb: TaskPlannerDatabase;

  beforeEach(async () => {
    vi.clearAllMocks();
    testDb = new TaskPlannerDatabase(`TestWidgetDB_${Date.now()}_${Math.random()}`);
    await testDb.open();
  });

  afterEach(async () => {
    await testDb.delete();
  });

  const renderWithTimerContext = (
    ui: React.ReactElement,
    contextOverride: Partial<TimerContextValue> = {}
  ) => {
    const defaultValue: TimerContextValue = {
      activeTimers: [],
      getTimerForTask: vi.fn(),
      getElapsedSeconds: vi.fn().mockReturnValue(0),
      startTimer: mockStart,
      pauseTimer: mockPause,
      finishTimer: mockFinish,
      cancelTimer: mockCancel,
      ...contextOverride,
    };

    return render(
      <TimerContext.Provider value={defaultValue}>
        {ui}
      </TimerContext.Provider>
    );
  };

  it('renders null when 0 active timers exist', () => {
    const { container } = renderWithTimerContext(<ActiveTimerWidget />, {
      activeTimers: [],
    });

    expect(container.firstChild).toBeNull();
  });

  it('renders single timer capsule with ticker and action buttons', () => {
    const singleTimer: ActiveTimer = {
      taskId: 'task-1',
      status: 'running',
      startedAt: Date.now() - 3665 * 1000,
      accumulatedMs: 0,
      sessionStartTime: new Date().toISOString(),
    };

    const tasksMap = new Map([['task-1', 'Thiết kế hệ thống']]);

    renderWithTimerContext(<ActiveTimerWidget tasksMap={tasksMap} />, {
      activeTimers: [singleTimer],
      getElapsedSeconds: vi.fn().mockReturnValue(3665),
    });

    expect(screen.getByTestId('active-timer-capsule')).toBeInTheDocument();
    expect(screen.getByText('Thiết kế hệ thống')).toBeInTheDocument();
    expect(screen.getByText('01:01:05')).toBeInTheDocument();

    const pauseBtn = screen.getByRole('button', { name: 'Tạm dừng' });
    expect(pauseBtn).toBeInTheDocument();
    fireEvent.click(pauseBtn);
    expect(mockPause).toHaveBeenCalledWith('task-1');

    const finishBtn = screen.getByRole('button', { name: 'Kết thúc phiên' });
    expect(finishBtn).toBeInTheDocument();
    fireEvent.click(finishBtn);
    expect(mockFinish).toHaveBeenCalledWith('task-1');
  });

  it('renders resume button when single timer is paused', () => {
    const pausedTimer: ActiveTimer = {
      taskId: 'task-2',
      status: 'paused',
      startedAt: Date.now(),
      accumulatedMs: 120000,
      sessionStartTime: new Date().toISOString(),
    };

    const tasksMap = new Map([['task-2', 'Viết báo cáo']]);

    renderWithTimerContext(<ActiveTimerWidget tasksMap={tasksMap} />, {
      activeTimers: [pausedTimer],
      getElapsedSeconds: vi.fn().mockReturnValue(120),
    });

    expect(screen.getByText('00:02:00')).toBeInTheDocument();
    const resumeBtn = screen.getByRole('button', { name: 'Tiếp tục' });
    expect(resumeBtn).toBeInTheDocument();

    fireEvent.click(resumeBtn);
    expect(mockStart).toHaveBeenCalledWith('task-2');
  });

  it('renders badge dropdown when 2 or more timers are active', () => {
    const timers: ActiveTimer[] = [
      {
        taskId: 'task-1',
        status: 'running',
        startedAt: Date.now(),
        accumulatedMs: 60000,
        sessionStartTime: new Date().toISOString(),
      },
      {
        taskId: 'task-2',
        status: 'paused',
        startedAt: Date.now(),
        accumulatedMs: 180000,
        sessionStartTime: new Date().toISOString(),
      },
    ];

    const tasksMap = new Map([
      ['task-1', 'Nhiệm vụ 1'],
      ['task-2', 'Nhiệm vụ 2'],
    ]);

    renderWithTimerContext(<ActiveTimerWidget tasksMap={tasksMap} />, {
      activeTimers: timers,
      getElapsedSeconds: (id) => (id === 'task-1' ? 60 : 180),
    });

    // Badge button with label "2 timer đang chạy"
    const triggerBtn = screen.getByRole('button', { name: '2 timer đang chạy' });
    expect(triggerBtn).toBeInTheDocument();

    // Click trigger to open dropdown
    fireEvent.click(triggerBtn);

    expect(screen.getByText('Nhiệm vụ 1')).toBeInTheDocument();
    expect(screen.getByText('Nhiệm vụ 2')).toBeInTheDocument();
    expect(screen.getByText('00:01:00')).toBeInTheDocument();
    expect(screen.getByText('00:03:00')).toBeInTheDocument();
  });

  it('resolves and displays task name from database via bulkGet when tasksMap is omitted', async () => {
    const task: Task = {
      id: 'task-100',
      name: 'Nâng cấp bảo mật OAuth2',
      status: 'In Progress',
      progress: 40,
      priority: 'High',
      estimateMinutes: 120,
      workType: 'code',
      opsOwners: [],
      businessAnalysts: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await testDb.tasks.add(task);

    const timer: ActiveTimer = {
      taskId: 'task-100',
      status: 'running',
      startedAt: Date.now() - 60000,
      accumulatedMs: 0,
      sessionStartTime: new Date().toISOString(),
    };

    renderWithTimerContext(<ActiveTimerWidget database={testDb} />, {
      activeTimers: [timer],
      getElapsedSeconds: vi.fn().mockReturnValue(60),
    });

    await waitFor(() => {
      expect(screen.getByText('Nâng cấp bảo mật OAuth2')).toBeInTheDocument();
    });
    expect(screen.queryByText('Tác vụ')).not.toBeInTheDocument();
  });

  it('prefers tasksMap over database lookup if both are present', async () => {
    const task: Task = {
      id: 'task-101',
      name: 'Tên trong CSDL',
      status: 'Open',
      progress: 0,
      priority: 'Low',
      estimateMinutes: 30,
      workType: 'configuration',
      opsOwners: [],
      businessAnalysts: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await testDb.tasks.add(task);

    const timer: ActiveTimer = {
      taskId: 'task-101',
      status: 'running',
      startedAt: Date.now() - 30000,
      accumulatedMs: 0,
      sessionStartTime: new Date().toISOString(),
    };

    const tasksMap = new Map([['task-101', 'Tên override từ Map']]);

    renderWithTimerContext(<ActiveTimerWidget tasksMap={tasksMap} database={testDb} />, {
      activeTimers: [timer],
      getElapsedSeconds: vi.fn().mockReturnValue(30),
    });

    expect(screen.getByText('Tên override từ Map')).toBeInTheDocument();
    expect(screen.queryByText('Tên trong CSDL')).not.toBeInTheDocument();
  });

  it('renders Project › Milestone hierarchy subtitle under task name (D-04)', async () => {
    await testDb.projects.add({
      id: 'proj-1',
      name: 'Dự án Alpha',
      status: 'In Progress',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await testDb.milestones.add({
      id: 'ms-1',
      projectId: 'proj-1',
      name: 'Giai đoạn 1',
      status: 'In Progress',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await testDb.tasks.add({
      id: 'task-sub',
      projectId: 'proj-1',
      milestoneId: 'ms-1',
      name: 'Xây dựng API',
      status: 'In Progress',
      progress: 0,
      priority: 'High',
      estimateMinutes: 60,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const timer: ActiveTimer = {
      taskId: 'task-sub',
      status: 'running',
      startedAt: Date.now() - 30000,
      accumulatedMs: 0,
      sessionStartTime: new Date().toISOString(),
      segments: [{ startTime: new Date().toISOString() }],
    };

    renderWithTimerContext(<ActiveTimerWidget database={testDb} />, {
      activeTimers: [timer],
      getElapsedSeconds: vi.fn().mockReturnValue(30),
    });

    await waitFor(() => {
      expect(screen.getByText('Xây dựng API')).toBeInTheDocument();
      expect(screen.getByTestId('capsule-hierarchy-subtitle')).toHaveTextContent('Dự án Alpha › Giai đoạn 1');
    });
  });
});
