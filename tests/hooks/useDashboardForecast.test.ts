import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../src/db';
import { useDashboardForecast } from '../../src/hooks/useDashboardForecast';
import { getTodayDateString } from '../../src/utils/date';
import dayjs from 'dayjs';

describe('useDashboardForecast hook', () => {
  let testDb: TaskPlannerDatabase;
  const today = getTodayDateString();

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase(`test-dashboard-forecast-${Date.now()}-${Math.random()}`);
    await testDb.open();

    // Default capacity rule: Mon-Fri 480m, Sat-Sun 0m
    await testDb.capacityRules.bulkAdd([
      { id: 'r-0', dayOfWeek: 0, workMinutes: 0 },
      { id: 'r-1', dayOfWeek: 1, workMinutes: 480 },
      { id: 'r-2', dayOfWeek: 2, workMinutes: 480 },
      { id: 'r-3', dayOfWeek: 3, workMinutes: 480 },
      { id: 'r-4', dayOfWeek: 4, workMinutes: 480 },
      { id: 'r-5', dayOfWeek: 5, workMinutes: 480 },
      { id: 'r-6', dayOfWeek: 6, workMinutes: 0 },
    ]);
  });

  it('initializes with 7 days and computes horizon dates correctly', async () => {
    const { result } = renderHook(() => useDashboardForecast(testDb, 7));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.horizon).toBe(7);
    expect(result.current.horizonDays).toHaveLength(7);
    expect(result.current.todayDate).toBe(today);
    expect(result.current.todayMetrics).not.toBeNull();
    expect(result.current.todayMetrics?.date).toBe(today);
  });

  it('updates date span when switching horizon to 14 and 30 days', async () => {
    const { result } = renderHook(() => useDashboardForecast(testDb, 7));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.setHorizon(14);
    });

    await waitFor(() => {
      expect(result.current.horizon).toBe(14);
      expect(result.current.horizonDays).toHaveLength(14);
    });

    act(() => {
      result.current.setHorizon(30);
    });

    await waitFor(() => {
      expect(result.current.horizon).toBe(30);
      expect(result.current.horizonDays).toHaveLength(30);
    });
  });

  it('excludes inactive (Done/Cancelled) tasks from active allocated load', async () => {
    // Add override to ensure today has 480m capacity
    await testDb.capacityOverrides.put({
      id: 'o-today',
      date: today,
      workMinutes: 480,
    });

    // Add 1 active task (120m) and 1 done task (200m)
    await testDb.tasks.bulkAdd([
      {
        id: 't-active',
        name: 'Active Task',
        status: 'In Progress',
        progress: 20,
        priority: 'Medium',
        estimateMinutes: 120,
        createdAt: today,
        updatedAt: today,
      },
      {
        id: 't-done',
        name: 'Done Task',
        status: 'Done',
        progress: 100,
        priority: 'High',
        estimateMinutes: 200,
        createdAt: today,
        updatedAt: today,
      },
    ]);

    await testDb.plannedAllocations.bulkAdd([
      { id: 'a-active', taskId: 't-active', date: today, allocatedMinutes: 120 },
      { id: 'a-done', taskId: 't-done', date: today, allocatedMinutes: 200 },
    ]);

    const { result } = renderHook(() => useDashboardForecast(testDb, 7));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.todayMetrics?.activeAllocatedMinutes).toBe(120);
      expect(result.current.todayMetrics?.inactiveAllocatedMinutes).toBe(200);
    });
  });

  it('detects overloaded days and computes totalExcessMinutes', async () => {
    const tomorrow = dayjs(today, 'YYYY-MM-DD').add(1, 'day').format('YYYY-MM-DD');

    // Set tomorrow capacity to 120m
    await testDb.capacityOverrides.put({
      id: 'o-tomorrow',
      date: tomorrow,
      workMinutes: 120,
    });

    // Add active task allocated 300m for tomorrow -> excess 180m
    await testDb.tasks.add({
      id: 't-heavy',
      name: 'Heavy Task',
      status: 'Open',
      progress: 0,
      priority: 'Urgent',
      estimateMinutes: 300,
      createdAt: today,
      updatedAt: today,
    });

    await testDb.plannedAllocations.add({
      id: 'a-heavy',
      taskId: 't-heavy',
      date: tomorrow,
      allocatedMinutes: 300,
    });

    const { result } = renderHook(() => useDashboardForecast(testDb, 7));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.overloadedDays).toHaveLength(1);
      expect(result.current.overloadedDays[0]?.date).toBe(tomorrow);
      expect(result.current.overloadedDays[0]?.excessMinutes).toBe(180);
      expect(result.current.totalExcessMinutes).toBe(180);
    });
  });
});
