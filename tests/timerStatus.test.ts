import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../src/db';
import { TimerProvider } from '../src/context/TimerContext';
import { useTimer } from '../src/hooks/useTimer';
import type { Task, TaskStatus } from '../src/types/models';
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';

describe('Timer Status Automation & Segment Timestamps (Task 2)', () => {
  let testDb: TaskPlannerDatabase;

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase(`TestTimerStatusDB_${Date.now()}_${Math.random()}`);
    await testDb.open();
  });

  afterEach(async () => {
    await testDb.delete();
    vi.restoreAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    React.createElement(TimerProvider, { database: testDb }, children)
  );

  const createTaskWithStatus = async (id: string, status: TaskStatus) => {
    const task: Task = {
      id,
      name: `Task ${id}`,
      status,
      progress: 0,
      priority: 'Medium',
      estimateMinutes: 60,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await testDb.tasks.add(task);
    return task;
  };

  it('transitions task status from Open to In Progress when starting or resuming timer (D-02)', async () => {
    await createTaskWithStatus('task-open', 'Open');

    const { result } = renderHook(() => useTimer(), { wrapper });

    await act(async () => {
      await result.current.startTimer('task-open');
    });

    const updatedTask = await testDb.tasks.get('task-open');
    expect(updatedTask?.status).toBe('In Progress');
  });

  it('keeps terminal or review statuses unchanged when starting timer (D-02)', async () => {
    const statusesToTest: TaskStatus[] = ['In Progress', 'In Review', 'Resolved', 'Done', 'Cancelled'];

    for (const status of statusesToTest) {
      const taskId = `task-${status.toLowerCase().replace(/\s+/g, '-')}`;
      await createTaskWithStatus(taskId, status);

      const { result } = renderHook(() => useTimer(), { wrapper });

      await act(async () => {
        await result.current.startTimer(taskId);
      });

      const task = await testDb.tasks.get(taskId);
      expect(task?.status).toBe(status);

      // Clean up timer for next iteration
      await act(async () => {
        await result.current.cancelTimer(taskId);
      });
    }
  });

  it('manages discrete running segments on start, pause, and resume (D-01)', async () => {
    await createTaskWithStatus('task-seg', 'Open');

    const t0 = 1790845200000; // 09:00:00.000Z
    vi.spyOn(Date, 'now').mockReturnValue(t0);

    const { result } = renderHook(() => useTimer(), { wrapper });

    // Start timer -> segment 1 opened
    await act(async () => {
      await result.current.startTimer('task-seg');
    });

    let timer = await testDb.activeTimers.get('task-seg');
    expect(timer?.segments).toHaveLength(1);
    expect(timer?.segments[0]?.startTime).toBe(new Date(t0).toISOString());
    expect(timer?.segments[0]?.endTime).toBeUndefined();

    // Fast-forward 10 minutes (600,000 ms) and pause
    const t1 = t0 + 600000; // 09:10:00.000Z
    vi.spyOn(Date, 'now').mockReturnValue(t1);

    await act(async () => {
      await result.current.pauseTimer('task-seg');
    });

    timer = await testDb.activeTimers.get('task-seg');
    expect(timer?.status).toBe('paused');
    expect(timer?.segments).toHaveLength(1);
    expect(timer?.segments[0]?.endTime).toBe(new Date(t1).toISOString());

    // Fast-forward 5 minutes idle time, then resume
    const t2 = t1 + 300000; // 09:15:00.000Z
    vi.spyOn(Date, 'now').mockReturnValue(t2);

    await act(async () => {
      await result.current.startTimer('task-seg');
    });

    timer = await testDb.activeTimers.get('task-seg');
    expect(timer?.status).toBe('running');
    expect(timer?.segments).toHaveLength(2);
    expect(timer?.segments[1]?.startTime).toBe(new Date(t2).toISOString());
    expect(timer?.segments[1]?.endTime).toBeUndefined();
  });

  it('uses last pause timestamp as WorkSession.endTime when finishing a paused timer (D-03)', async () => {
    await createTaskWithStatus('task-paused-finish', 'Open');

    const t0 = 1790845200000; // 09:00:00.000Z
    vi.spyOn(Date, 'now').mockReturnValue(t0);

    const { result } = renderHook(() => useTimer(), { wrapper });

    await act(async () => {
      await result.current.startTimer('task-paused-finish');
    });

    // Run for 30 minutes, then pause
    const tPause = t0 + 1800000; // 09:30:00.000Z
    vi.spyOn(Date, 'now').mockReturnValue(tPause);

    await act(async () => {
      await result.current.pauseTimer('task-paused-finish');
    });

    // User leaves timer paused for 2 hours, then clicks Finish at 11:30
    const tClickFinish = tPause + 7200000; // 11:30:00.000Z
    vi.spyOn(Date, 'now').mockReturnValue(tClickFinish);

    let session: any = null;
    await act(async () => {
      session = await result.current.finishTimer('task-paused-finish', 'Finished after pause');
    });

    expect(session).toBeDefined();
    // End time must be tPause (09:30), NOT tClickFinish (11:30) (D-03)
    expect(session.endTime).toBe(new Date(tPause).toISOString());
    expect(session.durationMinutes).toBe(30);
    expect(session.segments).toHaveLength(1);
    expect(session.segments[0].endTime).toBe(new Date(tPause).toISOString());
  });
});
