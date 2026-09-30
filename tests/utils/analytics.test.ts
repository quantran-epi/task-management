import { describe, it, expect } from 'vitest';
import type { Milestone, Task } from '../../src/types/models';
import { calculateMilestoneBurndown } from '../../src/utils/analytics';

describe('calculateMilestoneBurndown', () => {
  const baseMilestone: Milestone = {
    id: 'ms-1',
    projectId: 'p-1',
    name: 'Milestone 1',
    status: 'In Progress',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    deadline: '2026-09-11', // 10 days
  };

  const sampleTasks: Task[] = [
    {
      id: 't-1',
      name: 'Task 1',
      status: 'Done',
      progress: 100,
      priority: 'Medium',
      estimateMinutes: 120, // 2h
      milestoneId: 'ms-1',
      actualStartDate: '2026-09-01',
      actualEndDate: '2026-09-03',
      createdAt: '2026-09-01',
      updatedAt: '2026-09-03',
    },
    {
      id: 't-2',
      name: 'Task 2',
      status: 'Done',
      progress: 100,
      priority: 'High',
      estimateMinutes: 180, // 3h
      milestoneId: 'ms-1',
      actualStartDate: '2026-09-02',
      actualEndDate: '2026-09-05',
      createdAt: '2026-09-01',
      updatedAt: '2026-09-05',
    },
    {
      id: 't-3',
      name: 'Task 3',
      status: 'In Progress',
      progress: 50,
      priority: 'Low',
      estimateMinutes: 300, // 5h
      milestoneId: 'ms-1',
      actualStartDate: '2026-09-04',
      createdAt: '2026-09-01',
      updatedAt: '2026-09-06',
    },
  ];

  it('calculates milestone burndown timeline from startDate to deadline', () => {
    const result = calculateMilestoneBurndown(baseMilestone, sampleTasks, {
      unit: 'hours',
      todayStr: '2026-09-06',
    });

    expect(result.milestoneId).toBe('ms-1');
    expect(result.startDate).toBe('2026-09-01');
    expect(result.endDate).toBe('2026-09-11');
    expect(result.totalScope).toBe(10); // 2h + 3h + 5h = 10h
    expect(result.points.length).toBe(11); // 2026-09-01 to 2026-09-11 inclusive = 11 days
  });

  it('computes ideal pace linear slope from totalScope down to 0 at deadline', () => {
    const result = calculateMilestoneBurndown(baseMilestone, sampleTasks, {
      unit: 'hours',
      todayStr: '2026-09-06',
    });

    const firstPoint = result.points[0];
    const midPoint = result.points[5];
    const lastPoint = result.points[10];

    expect(firstPoint.idealRemaining).toBe(10);
    expect(midPoint.idealRemaining).toBe(5);
    expect(lastPoint.idealRemaining).toBe(0);
  });

  it('calculates actual remaining work up to todayStr, leaving future days as null', () => {
    const result = calculateMilestoneBurndown(baseMilestone, sampleTasks, {
      unit: 'hours',
      todayStr: '2026-09-04',
    });

    // On 2026-09-01 (day 0): 0 tasks completed -> 10h remaining
    expect(result.points[0].date).toBe('2026-09-01');
    expect(result.points[0].actualRemaining).toBe(10);

    // On 2026-09-03 (day 2): t-1 completed (2h) -> 8h remaining
    expect(result.points[2].date).toBe('2026-09-03');
    expect(result.points[2].actualRemaining).toBe(8);

    // On 2026-09-04 (day 3, today): t-1 completed -> 8h remaining (t-2 completes on 09-05)
    expect(result.points[3].date).toBe('2026-09-04');
    expect(result.points[3].actualRemaining).toBe(8);

    // On 2026-09-05 (day 4, future relative to todayStr 09-04): null
    expect(result.points[4].date).toBe('2026-09-05');
    expect(result.points[4].actualRemaining).toBeNull();
  });

  it('supports task count unit accurately', () => {
    const result = calculateMilestoneBurndown(baseMilestone, sampleTasks, {
      unit: 'count',
      todayStr: '2026-09-06',
    });

    expect(result.totalScope).toBe(3); // 3 tasks
    // Day 0: 3 tasks
    expect(result.points[0].actualRemaining).toBe(3);
    // After 09-03 (t-1 completed): 2 tasks
    expect(result.points[2].actualRemaining).toBe(2);
    // After 09-05 (t-2 completed): 1 task
    expect(result.points[4].actualRemaining).toBe(1);
  });

  it('applies 14-day fallback when milestone has no deadline', () => {
    const noDeadlineMs: Milestone = {
      ...baseMilestone,
      deadline: undefined,
    };

    const result = calculateMilestoneBurndown(noDeadlineMs, sampleTasks, {
      unit: 'hours',
      todayStr: '2026-09-06',
    });

    expect(result.startDate).toBe('2026-09-01');
    expect(result.endDate).toBe('2026-09-15'); // 2026-09-01 + 14 days
    expect(result.points.length).toBe(15);
  });

  it('handles empty tasks list and zero estimates gracefully', () => {
    const emptyResult = calculateMilestoneBurndown(baseMilestone, [], {
      unit: 'hours',
      todayStr: '2026-09-06',
    });

    expect(emptyResult.totalScope).toBe(0);
    expect(emptyResult.points.length).toBeGreaterThan(0);
    expect(emptyResult.points[0].idealRemaining).toBe(0);
    expect(emptyResult.points[0].actualRemaining).toBe(0);
  });
});
