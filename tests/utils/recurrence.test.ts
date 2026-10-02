import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../src/db';
import { createTask, updateTask } from '../../src/db/repositories/taskRepo';
import { computeNextOccurrence, spawnNextRecurringTask } from '../../src/utils/recurrence';

describe('Recurrence utilities & task repo integration', () => {
  describe('computeNextOccurrence', () => {
    it('computes next daily occurrence correctly', () => {
      expect(computeNextOccurrence('2026-10-02', 'daily', 1)).toBe('2026-10-03');
      expect(computeNextOccurrence('2026-10-02', 'daily', 3)).toBe('2026-10-05');
    });

    it('computes next weekly occurrence without specific days', () => {
      expect(computeNextOccurrence('2026-10-02', 'weekly', 1)).toBe('2026-10-09');
      expect(computeNextOccurrence('2026-10-02', 'weekly', 2)).toBe('2026-10-16');
    });

    it('computes next weekly occurrence with specific days of week', () => {
      // 2026-10-02 is Friday (dow = 5)
      // Days: [1, 3, 5] (Mon, Wed, Fri) -> Next day after Fri in cycle is Monday (2026-10-05)
      expect(computeNextOccurrence('2026-10-02', 'weekly', 1, [1, 3, 5])).toBe('2026-10-05');

      // 2026-10-05 is Monday (dow = 1) -> Next day in same week is Wednesday (2026-10-07)
      expect(computeNextOccurrence('2026-10-05', 'weekly', 1, [1, 3, 5])).toBe('2026-10-07');
    });

    it('computes next monthly occurrence correctly', () => {
      expect(computeNextOccurrence('2026-10-02', 'monthly', 1)).toBe('2026-11-02');
      expect(computeNextOccurrence('2026-10-02', 'monthly', 3)).toBe('2027-01-02');
    });
  });

  describe('spawnNextRecurringTask & updateTask integration', () => {
    let testDb: TaskPlannerDatabase;

    beforeEach(async () => {
      testDb = new TaskPlannerDatabase('TestRecurrence_' + Math.random().toString(36).slice(2));
      await testDb.open();
    });

    afterEach(async () => {
      await testDb.delete();
    });

    it('spawns next instance when recurring task is marked Done', async () => {
      const task = await createTask(
        {
          name: 'Họp giao ban hàng ngày',
          status: 'In Progress',
          priority: 'High',
          deadline: '2026-10-02',
          estimateMinutes: 30,
          workType: 'meeting',
          isRecurring: true,
          recurrenceFrequency: 'daily',
          recurrenceInterval: 1,
        },
        testDb
      );

      // Mark task as Done
      await updateTask(task.id, { status: 'Done' }, testDb);

      // Verify all tasks in DB
      const allTasks = await testDb.tasks.toArray();
      expect(allTasks.length).toBe(2);

      const nextTask = allTasks.find((t) => t.id !== task.id);
      expect(nextTask).toBeDefined();
      expect(nextTask?.name).toBe('Họp giao ban hàng ngày');
      expect(nextTask?.status).toBe('Open');
      expect(nextTask?.deadline).toBe('2026-10-03');
      expect(nextTask?.parentRecurringTaskId).toBe(task.id);
      expect(nextTask?.isRecurring).toBe(true);
      expect(nextTask?.recurrenceFrequency).toBe('daily');
    });

    it('respects recurrenceEndDate and stops spawning when exceeded', async () => {
      const task = await createTask(
        {
          name: 'Báo cáo dự án',
          status: 'Open',
          priority: 'Medium',
          deadline: '2026-10-02',
          estimateMinutes: 60,
          isRecurring: true,
          recurrenceFrequency: 'weekly',
          recurrenceEndDate: '2026-10-05', // Next weekly is 2026-10-09, which exceeds 2026-10-05
        },
        testDb
      );

      const next = await spawnNextRecurringTask(task, testDb);
      expect(next).toBeNull();

      const allTasks = await testDb.tasks.toArray();
      expect(allTasks.length).toBe(1);
    });

    it('prevents duplicate generation if task for next deadline already exists', async () => {
      const task = await createTask(
        {
          name: 'Backup dữ liệu hàng ngày',
          status: 'Done',
          priority: 'Urgent',
          deadline: '2026-10-02',
          estimateMinutes: 15,
          isRecurring: true,
          recurrenceFrequency: 'daily',
        },
        testDb
      );

      const firstSpawn = await spawnNextRecurringTask(task, testDb);
      expect(firstSpawn).not.toBeNull();

      const secondSpawn = await spawnNextRecurringTask(task, testDb);
      expect(secondSpawn?.id).toBe(firstSpawn?.id);

      const allTasks = await testDb.tasks.toArray();
      expect(allTasks.length).toBe(2);
    });
  });
});
