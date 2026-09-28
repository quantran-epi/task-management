import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../src/db';
import { useNotifications } from '../../src/hooks/useNotifications';
import { getTodayDateString } from '../../src/utils/date';
import { dismissAlertToday } from '../../src/db/repositories/notificationRepo';

describe('useNotifications hook (NOTIF-02, D-01, D-05)', () => {
  let testDb: TaskPlannerDatabase;
  const today = getTodayDateString();

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase(`test-use-notifications-${Date.now()}-${Math.random()}`);
    await testDb.open();

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

  afterEach(async () => {
    await testDb.delete();
  });

  it('aggregates alerts and returns structured NotificationState', async () => {
    // Add overdue task
    await testDb.tasks.add({
      id: 't-overdue',
      name: 'Overdue Task',
      status: 'Open',
      progress: 0,
      priority: 'Urgent',
      estimateMinutes: 60,
      deadline: '2026-01-01',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    });

    const { result } = renderHook(() => useNotifications(testDb));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.activeCount).toBe(1);
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.category).toBe('overdue');
    expect(result.current.categoryCounts.overdue).toBe(1);
    expect(result.current.categoryCounts.overload).toBe(0);
  });

  it('reacts when alert is dismissed', async () => {
    // Add stale task
    await testDb.tasks.add({
      id: 't-stale',
      name: 'Stale Task',
      status: 'In Progress',
      progress: 10,
      priority: 'Medium',
      estimateMinutes: 60,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const { result } = renderHook(() => useNotifications(testDb));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.categoryCounts.stale).toBe(1);
    });

    // Dismiss the stale task for today
    await dismissAlertToday('stale:task:t-stale', today, testDb);

    await waitFor(() => {
      expect(result.current.categoryCounts.stale).toBe(0);
      expect(result.current.activeCount).toBe(0);
    });
  });
});
