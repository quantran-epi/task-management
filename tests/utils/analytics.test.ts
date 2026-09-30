import { describe, it, expect } from 'vitest';
import type { Milestone, Task, Project } from '../../src/types/models';
import {
  calculateMilestoneBurndown,
  calculateCompletionVelocity,
  calculateProjectStatusMetrics,
  calculateStakeholderWorkload,
} from '../../src/utils/analytics';

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

    const firstPoint = result.points[0]!;
    const midPoint = result.points[5]!;
    const lastPoint = result.points[10]!;

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
    expect(result.points[0]?.date).toBe('2026-09-01');
    expect(result.points[0]?.actualRemaining).toBe(10);

    // On 2026-09-03 (day 2): t-1 completed (2h) -> 8h remaining
    expect(result.points[2]?.date).toBe('2026-09-03');
    expect(result.points[2]?.actualRemaining).toBe(8);

    // On 2026-09-04 (day 3, today): t-1 completed -> 8h remaining (t-2 completes on 09-05)
    expect(result.points[3]?.date).toBe('2026-09-04');
    expect(result.points[3]?.actualRemaining).toBe(8);

    // On 2026-09-05 (day 4, future relative to todayStr 09-04): null
    expect(result.points[4]?.date).toBe('2026-09-05');
    expect(result.points[4]?.actualRemaining).toBeNull();
  });

  it('supports task count unit accurately', () => {
    const result = calculateMilestoneBurndown(baseMilestone, sampleTasks, {
      unit: 'count',
      todayStr: '2026-09-06',
    });

    expect(result.totalScope).toBe(3); // 3 tasks
    // Day 0: 3 tasks
    expect(result.points[0]?.actualRemaining).toBe(3);
    // After 09-03 (t-1 completed): 2 tasks
    expect(result.points[2]?.actualRemaining).toBe(2);
    // After 09-05 (t-2 completed): 1 task
    expect(result.points[4]?.actualRemaining).toBe(1);
  });

  it('applies 14-day fallback when milestone has no deadline', () => {
    const { deadline: _, ...msWithoutDeadline } = baseMilestone;
    const noDeadlineMs: Milestone = msWithoutDeadline;

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
    expect(emptyResult.points[0]?.idealRemaining).toBe(0);
    expect(emptyResult.points[0]?.actualRemaining).toBe(0);
  });
});

describe('calculateCompletionVelocity', () => {
  const tasks: Task[] = [
    {
      id: 't-1',
      name: 'Task 1',
      status: 'Done',
      progress: 100,
      priority: 'Medium',
      estimateMinutes: 120, // 2h
      actualEndDate: '2026-09-28', // current week (week 0) relative to 2026-09-30
      createdAt: '2026-09-01',
      updatedAt: '2026-09-28',
    },
    {
      id: 't-2',
      name: 'Task 2',
      status: 'Resolved',
      progress: 100,
      priority: 'High',
      estimateMinutes: 240, // 4h
      actualEndDate: '2026-09-20', // prior week (week 1)
      createdAt: '2026-09-01',
      updatedAt: '2026-09-20',
    },
    {
      id: 't-3',
      name: 'Task 3',
      status: 'Cancelled',
      progress: 0,
      priority: 'Low',
      estimateMinutes: 180,
      actualEndDate: '2026-09-28',
      createdAt: '2026-09-01',
      updatedAt: '2026-09-28',
    },
    {
      id: 't-4',
      name: 'Task 4 (fallback updatedAt)',
      status: 'Done',
      progress: 100,
      priority: 'Low',
      estimateMinutes: 60, // 1h
      // no actualEndDate, updatedAt on 2026-09-29
      createdAt: '2026-09-01',
      updatedAt: '2026-09-29T10:00:00Z',
    },
  ];

  it('calculates weekly buckets and averages across rolling window (2 weeks)', () => {
    const result = calculateCompletionVelocity(tasks, {
      windowWeeks: 2,
      todayStr: '2026-09-30',
    });

    expect(result.buckets.length).toBe(2);
    // Excludes Cancelled t-3. Includes t-1 (2h) and t-4 (1h) in current week, t-2 (4h) in prior week.
    // Total completed: 3 tasks, 7 hours across 2 weeks
    expect(result.averageTasksPerWeek).toBe(1.5);
    expect(result.averageHoursPerWeek).toBe(3.5);
  });
});

describe('calculateProjectStatusMetrics', () => {
  const projects: Project[] = [
    {
      id: 'p-1',
      name: 'Project 1',
      status: 'In Progress',
      createdAt: '2026-09-01',
      updatedAt: '2026-09-01',
    },
    {
      id: 'p-2',
      name: 'Project 2',
      status: 'Open',
      createdAt: '2026-09-01',
      updatedAt: '2026-09-01',
    },
  ];

  const tasks: Task[] = [
    {
      id: 't-1',
      projectId: 'p-1',
      name: 'Task 1',
      status: 'Done',
      progress: 100,
      priority: 'Medium',
      estimateMinutes: 120,
      actualEndDate: '2026-09-25',
      createdAt: '2026-09-01',
      updatedAt: '2026-09-25',
    },
    {
      id: 't-2',
      projectId: 'p-1',
      name: 'Task 2',
      status: 'In Progress',
      progress: 50,
      priority: 'High',
      estimateMinutes: 300,
      createdAt: '2026-09-01',
      updatedAt: '2026-09-01',
    },
    {
      id: 't-3',
      projectId: 'p-1',
      name: 'Task 3',
      status: 'Open',
      progress: 0,
      priority: 'Low',
      estimateMinutes: 180,
      createdAt: '2026-09-01',
      updatedAt: '2026-09-01',
    },
  ];

  it('aggregates status counts, remaining hours, and velocity per project', () => {
    const metrics = calculateProjectStatusMetrics(projects, tasks, 4, '2026-09-30');
    expect(metrics.length).toBe(2);

    const p1Metrics = metrics.find((m) => m.projectId === 'p-1')!;
    expect(p1Metrics.totalTasks).toBe(3);
    expect(p1Metrics.counts.Done).toBe(1);
    expect(p1Metrics.counts['In Progress']).toBe(1);
    expect(p1Metrics.counts.Open).toBe(1);
    expect(p1Metrics.openTasksCount).toBe(2); // In Progress + Open
    expect(p1Metrics.remainingHours).toBe(8); // (300 + 180) / 60 = 8h (Done excluded)

    const p2Metrics = metrics.find((m) => m.projectId === 'p-2')!;
    expect(p2Metrics.totalTasks).toBe(0);
    expect(p2Metrics.openTasksCount).toBe(0);
    expect(p2Metrics.remainingHours).toBe(0);
  });
});

describe('calculateStakeholderWorkload', () => {
  const projects: Project[] = [
    {
      id: 'p-1',
      name: 'Core Banking',
      status: 'In Progress',
      opsOwners: ['Nguyễn Văn A'],
      businessAnalysts: ['Trần Thị B'],
      createdAt: '2026-09-01',
      updatedAt: '2026-09-01',
    },
  ];

  const milestones: Milestone[] = [
    {
      id: 'ms-1',
      projectId: 'p-1',
      name: 'Sprint 1',
      status: 'In Progress',
      opsOwners: ['Lê Văn C'], // overrides project ops owner for milestone tasks
      createdAt: '2026-09-01',
      updatedAt: '2026-09-01',
    },
  ];

  const tasks: Task[] = [
    {
      id: 't-1',
      projectId: 'p-1',
      milestoneId: 'ms-1',
      name: 'Task 1 (Inherits from Milestone: Lê Văn C, Project BA: Trần Thị B)',
      status: 'In Progress',
      progress: 30,
      priority: 'High',
      workType: 'code',
      estimateMinutes: 120, // 2h
      createdAt: '2026-09-01',
      updatedAt: '2026-09-01',
    },
    {
      id: 't-2',
      projectId: 'p-1',
      name: 'Task 2 (Direct ops owner, inherits Project BA)',
      status: 'Open',
      progress: 0,
      priority: 'Medium',
      opsOwners: ['Phạm Văn D', 'Nguyễn Văn A'], // multiple direct owners
      workType: 'document',
      estimateMinutes: 180, // 3h
      createdAt: '2026-09-01',
      updatedAt: '2026-09-01',
    },
    {
      id: 't-3',
      name: 'Standalone Unassigned Task',
      status: 'Open',
      progress: 0,
      priority: 'Low',
      workType: 'meeting',
      estimateMinutes: 60, // 1h
      createdAt: '2026-09-01',
      updatedAt: '2026-09-01',
    },
    {
      id: 't-4',
      name: 'Completed Task',
      status: 'Done',
      progress: 100,
      priority: 'Low',
      workType: 'code',
      estimateMinutes: 300, // 5h
      createdAt: '2026-09-01',
      updatedAt: '2026-09-01',
    },
  ];

  it('aggregates workload by opsOwners honoring tag inheritance and unassigned', () => {
    const items = calculateStakeholderWorkload(tasks, milestones, projects, {
      dimension: 'opsOwners',
      includeDone: false,
    });

    // Active tasks: t-1 (2h), t-2 (3h), t-3 (1h)
    // t-1 -> Lê Văn C (2h)
    // t-2 -> Phạm Văn D (3h), Nguyễn Văn A (3h)
    // t-3 -> Chưa phân công (1h)
    const unassigned = items.find((i) => i.key === 'unassigned');
    expect(unassigned).toBeDefined();
    expect(unassigned?.label).toBe('Chưa phân công');
    expect(unassigned?.hours).toBe(1);

    const leVanC = items.find((i) => i.key === 'Lê Văn C');
    expect(leVanC?.hours).toBe(2);

    const phamVanD = items.find((i) => i.key === 'Phạm Văn D');
    expect(phamVanD?.hours).toBe(3);

    const nguyenVanA = items.find((i) => i.key === 'Nguyễn Văn A');
    expect(nguyenVanA?.hours).toBe(3);
  });

  it('aggregates workload by workType', () => {
    const items = calculateStakeholderWorkload(tasks, milestones, projects, {
      dimension: 'workType',
      includeDone: false,
    });

    const code = items.find((i) => i.key === 'code');
    expect(code?.hours).toBe(2); // t-1 (t-4 Done excluded)

    const doc = items.find((i) => i.key === 'document');
    expect(doc?.hours).toBe(3); // t-2

    const meeting = items.find((i) => i.key === 'meeting');
    expect(meeting?.hours).toBe(1); // t-3
  });

  it('includes Done tasks when includeDone is true', () => {
    const items = calculateStakeholderWorkload(tasks, milestones, projects, {
      dimension: 'workType',
      includeDone: true,
    });

    const code = items.find((i) => i.key === 'code');
    expect(code?.hours).toBe(7); // 2h (t-1) + 5h (t-4) = 7h
  });
});
