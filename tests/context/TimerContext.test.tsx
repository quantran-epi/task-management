import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../src/db';
import { TimerProvider } from '../../src/context/TimerContext';
import { useTimer } from '../../src/hooks/useTimer';
import type { Task } from '../../src/types/models';

describe('TimerContext & useTimer', () => {
  let testDb: TaskPlannerDatabase;

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase(`TestTimerDB_${Date.now()}_${Math.random()}`);
    await testDb.open();

    const sampleTask: Task = {
      id: 'task-1',
      name: 'Task 1',
      status: 'In Progress',
      progress: 50,
      priority: 'High',
      estimateMinutes: 60,
      workType: 'code',
      opsOwners: [],
      businessAnalysts: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const sampleTask2: Task = {
      id: 'task-2',
      name: 'Task 2',
      status: 'Open',
      progress: 0,
      priority: 'Medium',
      estimateMinutes: 30,
      workType: 'document',
      opsOwners: [],
      businessAnalysts: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await testDb.tasks.bulkAdd([sampleTask, sampleTask2]);
  });

  afterEach(async () => {
    await testDb.delete();
    vi.restoreAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <TimerProvider database={testDb}>{children}</TimerProvider>
  );

  it('provides safe fallback when useTimer is used outside TimerProvider', () => {
    const { result } = renderHook(() => useTimer());
    expect(result.current.activeTimers).toEqual([]);
    expect(result.current.getElapsedSeconds('non-existent')).toBe(0);
    expect(result.current.getTimerForTask('non-existent')).toBeUndefined();
  });

  it('starts a timer and computes elapsed seconds from wall clock', async () => {
    const { result } = renderHook(() => useTimer(), { wrapper });

    await act(async () => {
      await result.current.startTimer('task-1');
    });

    await waitFor(() => {
      expect(result.current.activeTimers).toHaveLength(1);
    });

    const timer = result.current.getTimerForTask('task-1');
    expect(timer).toBeDefined();
    expect(timer?.status).toBe('running');
    expect(timer?.accumulatedMs).toBe(0);

    // Initial elapsed
    expect(result.current.getElapsedSeconds('task-1')).toBeGreaterThanOrEqual(0);
  });

  it('pauses and resumes a timer correctly', async () => {
    const now = 1700000000000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    const { result } = renderHook(() => useTimer(), { wrapper });

    await act(async () => {
      await result.current.startTimer('task-1');
    });

    // Fast-forward 5000ms
    vi.spyOn(Date, 'now').mockReturnValue(now + 5000);

    await act(async () => {
      await result.current.pauseTimer('task-1');
    });

    await waitFor(() => {
      const paused = result.current.getTimerForTask('task-1');
      expect(paused?.status).toBe('paused');
      expect(paused?.accumulatedMs).toBe(5000);
    });

    expect(result.current.getElapsedSeconds('task-1')).toBe(5);

    // Fast-forward another 10000ms while paused - elapsed should stay 5
    vi.spyOn(Date, 'now').mockReturnValue(now + 15000);
    expect(result.current.getElapsedSeconds('task-1')).toBe(5);

    // Resume timer
    await act(async () => {
      await result.current.startTimer('task-1');
    });

    await waitFor(() => {
      expect(result.current.getTimerForTask('task-1')?.status).toBe('running');
    });

    // 2 seconds later
    vi.spyOn(Date, 'now').mockReturnValue(now + 17000);
    expect(result.current.getElapsedSeconds('task-1')).toBe(7);
  });

  it('finishes a timer, creates workSession, and removes activeTimer', async () => {
    const now = 1700000000000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    const { result } = renderHook(() => useTimer(), { wrapper });

    await act(async () => {
      await result.current.startTimer('task-1');
    });

    // 120,000 ms elapsed = 2 minutes
    vi.spyOn(Date, 'now').mockReturnValue(now + 120000);

    let session: any = null;
    await act(async () => {
      session = await result.current.finishTimer('task-1', 'Completed first sprint');
    });

    expect(session).toBeDefined();
    expect(session.taskId).toBe('task-1');
    expect(session.durationMinutes).toBe(2);
    expect(session.note).toBe('Completed first sprint');

    await waitFor(() => {
      expect(result.current.activeTimers).toHaveLength(0);
    });

    const sessionsInDb = await testDb.workSessions.toArray();
    expect(sessionsInDb).toHaveLength(1);
    expect(sessionsInDb[0]?.durationMinutes).toBe(2);
  });

  it('cancels an active timer without saving a workSession', async () => {
    const { result } = renderHook(() => useTimer(), { wrapper });

    await act(async () => {
      await result.current.startTimer('task-1');
    });

    await waitFor(() => {
      expect(result.current.activeTimers).toHaveLength(1);
    });

    await act(async () => {
      await result.current.cancelTimer('task-1');
    });

    await waitFor(() => {
      expect(result.current.activeTimers).toHaveLength(0);
    });

    const sessionsInDb = await testDb.workSessions.toArray();
    expect(sessionsInDb).toHaveLength(0);
  });

  it('supports multiple concurrent timers running simultaneously (D-05)', async () => {
    const now = 1700000000000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    const { result } = renderHook(() => useTimer(), { wrapper });

    await act(async () => {
      await result.current.startTimer('task-1');
    });

    vi.spyOn(Date, 'now').mockReturnValue(now + 3000);

    await act(async () => {
      await result.current.startTimer('task-2');
    });

    await waitFor(() => {
      expect(result.current.activeTimers).toHaveLength(2);
    });

    vi.spyOn(Date, 'now').mockReturnValue(now + 6000);

    // task-1 has been running for 6000ms = 6s
    // task-2 has been running for 3000ms = 3s
    expect(result.current.getElapsedSeconds('task-1')).toBe(6);
    expect(result.current.getElapsedSeconds('task-2')).toBe(3);
  });

  it('caps concurrent timers at 20 (T-12.1-05)', async () => {
    const { result } = renderHook(() => useTimer(), { wrapper });

    // Seed 20 timers directly into DB
    for (let i = 1; i <= 20; i++) {
      await testDb.activeTimers.put({
        taskId: `seed-task-${i}`,
        status: 'running',
        startedAt: Date.now(),
        accumulatedMs: 0,
        sessionStartTime: new Date().toISOString(),
      });
    }

    await waitFor(() => {
      expect(result.current.activeTimers).toHaveLength(20);
    });

    // 21st timer start should throw
    await expect(result.current.startTimer('task-1')).rejects.toThrow(
      'Đã đạt giới hạn tối đa 20 bộ đếm hoạt động đồng thời.'
    );
  });

  it('survives page reload by computing elapsed time from persisted timestamps (D-04)', async () => {
    const startedAt = Date.now() - 30000; // 30 seconds ago
    await testDb.activeTimers.put({
      taskId: 'task-1',
      status: 'running',
      startedAt,
      accumulatedMs: 15000, // 15 seconds previously accumulated
      sessionStartTime: new Date(startedAt).toISOString(),
    });

    // Mount fresh hook/provider simulating reload
    const { result } = renderHook(() => useTimer(), { wrapper });

    await waitFor(() => {
      expect(result.current.activeTimers).toHaveLength(1);
    });

    // Total elapsed = 15s + 30s = 45s
    const elapsed = result.current.getElapsedSeconds('task-1');
    expect(elapsed).toBeGreaterThanOrEqual(45);
  });
});
