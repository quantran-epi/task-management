import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { message } from 'antd';
import { useTimerAlertMonitor } from '../../src/hooks/useTimerAlertMonitor';
import { TimerContext, type TimerContextValue } from '../../src/context/TimerContext';
import { TaskPlannerDatabase } from '../../src/db';
import 'fake-indexeddb/auto';
import { getTodayDateString } from '../../src/utils/date';

describe('useTimerAlertMonitor', () => {
  let testDb: TaskPlannerDatabase;
  const today = getTodayDateString();

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase(`test-db-${Date.now()}-${Math.random()}`);
    await testDb.open();
    vi.restoreAllMocks();
  });

  it('triggers warning message and desktop notification when running timer exceeds daily planned allocation', async () => {
    const warningSpy = vi.spyOn(message, 'warning').mockImplementation((() => {}) as any);

    // Mock window.Notification
    const notificationInstances: any[] = [];
    class MockNotification {
      static permission = 'granted';
      title: string;
      options: any;
      constructor(title: string, options: any) {
        this.title = title;
        this.options = options;
        notificationInstances.push(this);
      }
      close() {}
    }
    vi.stubGlobal('Notification', MockNotification);

    // Enable desktop notification in DB
    await testDb.settings.put({
      key: 'browserNotificationsEnabled',
      value: true,
    });

    // Create task
    await testDb.tasks.put({
      id: 'task-alloc-5',
      name: 'Task 5 minutes planned',
      status: 'Open',
      progress: 0,
      priority: 'High',
      estimateMinutes: 60,
      workType: 'code',
      opsOwners: [],
      businessAnalysts: [],
      documentLinks: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Create 5m allocation for today
    await testDb.plannedAllocations.put({
      id: 'alloc-1',
      taskId: 'task-alloc-5',
      date: today,
      allocatedMinutes: 5,
    });

    const runningTimer = {
      taskId: 'task-alloc-5',
      status: 'running' as const,
      startedAt: Date.now() - 300000,
      accumulatedMs: 0,
      sessionStartTime: new Date().toISOString(),
    };

    const timerValue: TimerContextValue = {
      activeTimers: [runningTimer],
      getTimerForTask: (id) => (id === 'task-alloc-5' ? runningTimer : undefined),
      getElapsedSeconds: (id) => (id === 'task-alloc-5' ? 300 : 0), // 300s = 5m
      startTimer: vi.fn(),
      pauseTimer: vi.fn(),
      finishTimer: vi.fn(),
      cancelTimer: vi.fn(),
      tick: 0,
    };

    const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
      <TimerContext.Provider value={timerValue}>{children}</TimerContext.Provider>
    );

    const { rerender } = renderHook(() => useTimerAlertMonitor({ database: testDb }), {
      wrapper,
    });

    // Wait for live query async resolution
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(warningSpy).toHaveBeenCalledTimes(1);
    expect(warningSpy).toHaveBeenCalledWith(
      expect.stringContaining('vượt quá thời gian phân bổ (5m)')
    );

    // Verify desktop notification dispatched
    expect(notificationInstances.length).toBe(1);
    expect(notificationInstances[0].title).toBe('Vượt thời gian phân bổ');
    expect(notificationInstances[0].options.body).toContain('Task 5 minutes planned');

    // On next tick (e.g. 301 seconds), alert should NOT repeat
    timerValue.getElapsedSeconds = (id) => (id === 'task-alloc-5' ? 301 : 0);
    rerender();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(warningSpy).toHaveBeenCalledTimes(1);
    expect(notificationInstances.length).toBe(1);
  });

  it('triggers warning message when live running timer exceeds estimateMinutes when no daily allocation exists', async () => {
    const warningSpy = vi.spyOn(message, 'warning').mockImplementation((() => {}) as any);

    // Create task with 1 minute estimate (60s) and NO daily allocation
    await testDb.tasks.put({
      id: 'task-short-1m',
      name: 'Viết unit test',
      status: 'Open',
      progress: 0,
      priority: 'Medium',
      estimateMinutes: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const runningTimer = {
      taskId: 'task-short-1m',
      status: 'running' as const,
      startedAt: Date.now() - 60000,
      accumulatedMs: 0,
      sessionStartTime: new Date().toISOString(),
    };

    const timerValue: TimerContextValue = {
      activeTimers: [runningTimer],
      getTimerForTask: (id) => (id === 'task-short-1m' ? runningTimer : undefined),
      getElapsedSeconds: (id) => (id === 'task-short-1m' ? 60 : 0), // 60s = 1m >= 1m
      startTimer: vi.fn(),
      pauseTimer: vi.fn(),
      finishTimer: vi.fn(),
      cancelTimer: vi.fn(),
      tick: 0,
    };

    const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
      <TimerContext.Provider value={timerValue}>{children}</TimerContext.Provider>
    );

    const { rerender } = renderHook(() => useTimerAlertMonitor({ database: testDb }), {
      wrapper,
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(warningSpy).toHaveBeenCalledTimes(1);
    expect(warningSpy).toHaveBeenCalledWith(
      expect.stringContaining('Viết unit test')
    );

    // Subsequent tick should not repeat
    timerValue.getElapsedSeconds = (id) => (id === 'task-short-1m' ? 61 : 0);
    rerender();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(warningSpy).toHaveBeenCalledTimes(1);
  });
});
