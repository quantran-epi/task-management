import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ActiveTimerWidget } from '../../src/components/timer/ActiveTimerWidget';
import { TimerContext, type TimerContextValue } from '../../src/context/TimerContext';
import type { ActiveTimer } from '../../src/types/models';

describe('ActiveTimerWidget', () => {
  const mockPause = vi.fn();
  const mockStart = vi.fn();
  const mockFinish = vi.fn();
  const mockCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
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
});
