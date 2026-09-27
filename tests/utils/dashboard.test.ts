import { describe, it, expect } from 'vitest';
import type { Task, PlannedAllocation, CapacityRule, CapacityOverride } from '../../src/types/models';
import {
  categorizeAttentionTasks,
  getHorizonDates,
  calculateHorizonMetrics,
} from '../../src/utils/dashboard';

describe('dashboard utils', () => {
  const baseTask: Task = {
    id: 't-1',
    name: 'Base Task',
    status: 'Open',
    progress: 0,
    priority: 'Medium',
    estimateMinutes: 60,
    createdAt: '2026-09-20',
    updatedAt: '2026-09-20',
  };

  describe('categorizeAttentionTasks', () => {
    const today = '2026-09-27';

    it('filters out inactive tasks (Done and Cancelled)', () => {
      const tasks: Task[] = [
        { ...baseTask, id: 't-1', deadline: '2026-09-25', status: 'Done' },
        { ...baseTask, id: 't-2', deadline: '2026-09-25', status: 'Cancelled' },
        { ...baseTask, id: 't-3', deadline: '2026-09-25', status: 'Open' },
      ];

      const result = categorizeAttentionTasks(tasks, [], today);
      expect(result).toHaveLength(1);
      expect(result[0]?.task.id).toBe('t-3');
      expect(result[0]?.category).toBe('overdue');
    });

    it('categorizes into overdue, due-today, and scheduled-today', () => {
      const tasks: Task[] = [
        { ...baseTask, id: 't-overdue', deadline: '2026-09-25' },
        { ...baseTask, id: 't-due-today', deadline: '2026-09-27', priority: 'High' },
        { ...baseTask, id: 't-scheduled', deadline: '2026-10-01' },
        { ...baseTask, id: 't-future', deadline: '2026-10-05' }, // not scheduled today, future deadline
      ];

      const todayAllocations: PlannedAllocation[] = [
        { id: 'a-1', taskId: 't-scheduled', date: today, allocatedMinutes: 120 },
      ];

      const result = categorizeAttentionTasks(tasks, todayAllocations, today);
      expect(result).toHaveLength(3);

      expect(result[0]?.task.id).toBe('t-overdue');
      expect(result[0]?.category).toBe('overdue');
      expect(result[0]?.daysOverdue).toBe(2);

      expect(result[1]?.task.id).toBe('t-due-today');
      expect(result[1]?.category).toBe('due-today');

      expect(result[2]?.task.id).toBe('t-scheduled');
      expect(result[2]?.category).toBe('scheduled-today');
      expect(result[2]?.scheduledMinutes).toBe(120);
    });

    it('sorts overdue tasks descending by days overdue', () => {
      const tasks: Task[] = [
        { ...baseTask, id: 't-1-day', deadline: '2026-09-26' },
        { ...baseTask, id: 't-5-day', deadline: '2026-09-22' },
        { ...baseTask, id: 't-3-day', deadline: '2026-09-24' },
      ];

      const result = categorizeAttentionTasks(tasks, [], today);
      expect(result.map((r) => r.task.id)).toEqual(['t-5-day', 't-3-day', 't-1-day']);
      expect(result.map((r) => r.daysOverdue)).toEqual([5, 3, 1]);
    });

    it('sorts due-today tasks by priority weight (Urgent > High > Medium > Low)', () => {
      const tasks: Task[] = [
        { ...baseTask, id: 't-low', deadline: today, priority: 'Low' },
        { ...baseTask, id: 't-urgent', deadline: today, priority: 'Urgent' },
        { ...baseTask, id: 't-medium', deadline: today, priority: 'Medium' },
        { ...baseTask, id: 't-high', deadline: today, priority: 'High' },
      ];

      const result = categorizeAttentionTasks(tasks, [], today);
      expect(result.map((r) => r.task.id)).toEqual(['t-urgent', 't-high', 't-medium', 't-low']);
    });

    it('sorts scheduled-today tasks descending by scheduled minutes', () => {
      const tasks: Task[] = [
        { ...baseTask, id: 't-60', deadline: '2026-10-01' },
        { ...baseTask, id: 't-180', deadline: '2026-10-02' },
        { ...baseTask, id: 't-30', deadline: '2026-10-03' },
      ];

      const todayAllocations: PlannedAllocation[] = [
        { id: 'a-1', taskId: 't-60', date: today, allocatedMinutes: 60 },
        { id: 'a-2', taskId: 't-180', date: today, allocatedMinutes: 180 },
        { id: 'a-3', taskId: 't-30', date: today, allocatedMinutes: 30 },
      ];

      const result = categorizeAttentionTasks(tasks, todayAllocations, today);
      expect(result.map((r) => r.task.id)).toEqual(['t-180', 't-60', 't-30']);
      expect(result.map((r) => r.scheduledMinutes)).toEqual([180, 60, 30]);
    });

    it('returns empty array when no tasks match attention criteria', () => {
      const tasks: Task[] = [
        { ...baseTask, id: 't-future', deadline: '2026-10-10' },
      ];
      const result = categorizeAttentionTasks(tasks, [], today);
      expect(result).toHaveLength(0);
    });
  });

  describe('getHorizonDates', () => {
    it('generates 7, 14, and 30 day spans accurately', () => {
      const dates7 = getHorizonDates('2026-09-27', 7);
      expect(dates7).toHaveLength(7);
      expect(dates7[0]).toBe('2026-09-27');
      expect(dates7[6]).toBe('2026-10-03');

      const dates14 = getHorizonDates('2026-09-27', 14);
      expect(dates14).toHaveLength(14);
      expect(dates14[0]).toBe('2026-09-27');
      expect(dates14[13]).toBe('2026-10-10');

      const dates30 = getHorizonDates('2026-09-27', 30);
      expect(dates30).toHaveLength(30);
      expect(dates30[0]).toBe('2026-09-27');
      expect(dates30[29]).toBe('2026-10-26');
    });

    it('crosses month and year boundaries correctly', () => {
      const dates = getHorizonDates('2026-12-30', 5);
      expect(dates).toEqual([
        '2026-12-30',
        '2026-12-31',
        '2027-01-01',
        '2027-01-02',
        '2027-01-03',
      ]);
    });
  });

  describe('calculateHorizonMetrics', () => {
    const rules: CapacityRule[] = [
      { id: 'r-0', dayOfWeek: 0, workMinutes: 0 }, // Sun
      { id: 'r-1', dayOfWeek: 1, workMinutes: 480 }, // Mon
    ];
    const overridesMap = new Map<string, CapacityOverride>();
    const allocationsByDate = new Map<string, PlannedAllocation[]>();

    it('calculates metrics and excess minutes for each date', () => {
      // 2026-09-27 is Sunday (rule: 0m)
      // 2026-09-28 is Monday (rule: 480m)
      const dates = ['2026-09-27', '2026-09-28'];

      // Sunday has 60m allocation -> overloaded by 60m
      allocationsByDate.set('2026-09-27', [
        { id: 'a-1', taskId: 't-1', date: '2026-09-27', allocatedMinutes: 60 },
      ]);
      // Monday has 300m allocation -> available
      allocationsByDate.set('2026-09-28', [
        { id: 'a-2', taskId: 't-2', date: '2026-09-28', allocatedMinutes: 300 },
      ]);

      const result = calculateHorizonMetrics(
        dates,
        rules,
        overridesMap,
        allocationsByDate,
        '2026-09-27'
      );

      expect(result).toHaveLength(2);

      expect(result[0]?.date).toBe('2026-09-27');
      expect(result[0]?.isToday).toBe(true);
      expect(result[0]?.metrics.isOverloaded).toBe(true);
      expect(result[0]?.excessMinutes).toBe(60);

      expect(result[1]?.date).toBe('2026-09-28');
      expect(result[1]?.isToday).toBe(false);
      expect(result[1]?.metrics.isOverloaded).toBe(false);
      expect(result[1]?.excessMinutes).toBe(0);
    });
  });
});
