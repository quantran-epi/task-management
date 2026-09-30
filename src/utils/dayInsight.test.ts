// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { buildDayInsight } from './dayInsight';
import type { PlannedAllocationWithTask } from '../db/repositories/allocationRepo';
import type { Task, WorkSession } from '../types/models';

const NOW = '2026-09-30T00:00:00.000Z';

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    name: `Task ${id}`,
    status: 'In Progress',
    progress: 0,
    priority: 'Medium',
    estimateMinutes: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function alloc(
  taskId: string,
  allocatedMinutes: number,
  taskOverrides: Partial<Task> = {}
): PlannedAllocationWithTask {
  const t = task(taskId, taskOverrides);
  return {
    id: `a-${taskId}`,
    taskId,
    date: '2026-09-30',
    allocatedMinutes,
    task: t,
    isActive: t.status !== 'Done' && t.status !== 'Cancelled',
  };
}

function session(taskId: string, durationMinutes: number, seq = 1): WorkSession {
  return {
    id: `s-${taskId}-${seq}`,
    taskId,
    startTime: `2026-09-30T0${seq}:00:00.000Z`,
    endTime: `2026-09-30T0${seq}:${String(durationMinutes).padStart(2, '0')}:00.000Z`,
    date: '2026-09-30',
    durationMinutes,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe('buildDayInsight', () => {
  it('planned-only row: actual = 0, delta = -planned', () => {
    const result = buildDayInsight({
      date: '2026-09-30',
      capacityMinutes: 480,
      allocations: [alloc('t1', 120)],
      sessions: [],
      taskMap: new Map(),
      projectNameById: new Map(),
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      taskId: 't1',
      plannedMinutes: 120,
      actualMinutes: 0,
      deltaMinutes: -120,
    });
    expect(result.totalPlannedMinutes).toBe(120);
    expect(result.totalActualMinutes).toBe(0);
  });

  it('actual-only row (no plan): plan = 0, delta = actual', () => {
    const t = task('t2');
    const result = buildDayInsight({
      date: '2026-09-30',
      capacityMinutes: 480,
      allocations: [],
      sessions: [session('t2', 45)],
      taskMap: new Map([[t.id, t]]),
      projectNameById: new Map(),
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      plannedMinutes: 0,
      actualMinutes: 45,
      deltaMinutes: 45,
    });
  });

  it('both planned and actual: delta = actual - planned; sums multiple sessions', () => {
    const t = task('t3');
    const result = buildDayInsight({
      date: '2026-09-30',
      capacityMinutes: 480,
      allocations: [alloc('t3', 90)],
      sessions: [session('t3', 30, 1), session('t3', 20, 2)],
      taskMap: new Map([[t.id, t]]),
      projectNameById: new Map(),
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      plannedMinutes: 90,
      actualMinutes: 50,
      deltaMinutes: -40,
    });
    expect(result.totalPlannedMinutes).toBe(90);
    expect(result.totalActualMinutes).toBe(50);
  });

  it('unknown / deleted task via session with no taskMap entry falls back', () => {
    const result = buildDayInsight({
      date: '2026-09-30',
      capacityMinutes: 480,
      allocations: [],
      sessions: [session('gone', 15)],
      taskMap: new Map(),
      projectNameById: new Map(),
    });
    expect(result.rows[0]?.taskName).toBe('Deleted / Unknown Task');
    expect(result.rows[0]?.isActive).toBe(false);
  });

  it('sort: actual desc, then planned desc, then name asc', () => {
    const tA = task('a', { name: 'Alpha' });
    const tB = task('b', { name: 'Bravo' });
    const tC = task('c', { name: 'Charlie' });
    const tD = task('d', { name: 'Delta' });

    const result = buildDayInsight({
      date: '2026-09-30',
      capacityMinutes: 480,
      allocations: [
        alloc('a', 60, { name: 'Alpha' }),
        alloc('b', 30, { name: 'Bravo' }),
        alloc('c', 0, { name: 'Charlie' }),
        alloc('d', 60, { name: 'Delta' }),
      ],
      sessions: [
        session('b', 90),
        session('c', 90),
      ],
      taskMap: new Map([tA, tB, tC, tD].map((t) => [t.id, t])),
      projectNameById: new Map(),
    });

    // b: actual 90, planned 30
    // c: actual 90, planned 0  -> tie on actual with b, planned desc → b before c
    // a: actual 0, planned 60
    // d: actual 0, planned 60  -> tie → name asc → a before d
    expect(result.rows.map((r) => r.taskId)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('resolves projectName via projectNameById map', () => {
    const t = task('t4', { projectId: 'p1', name: 'Ship it' });
    const result = buildDayInsight({
      date: '2026-09-30',
      capacityMinutes: 480,
      allocations: [
        {
          id: 'a-t4',
          taskId: 't4',
          date: '2026-09-30',
          allocatedMinutes: 30,
          task: t,
          isActive: true,
        },
      ],
      sessions: [],
      taskMap: new Map([[t.id, t]]),
      projectNameById: new Map([['p1', 'Growth']]),
    });
    expect(result.rows[0]?.projectName).toBe('Growth');
  });

  it('inactive task from allocation preserves isActive=false', () => {
    const result = buildDayInsight({
      date: '2026-09-30',
      capacityMinutes: 480,
      allocations: [alloc('done', 60, { status: 'Done' })],
      sessions: [],
      taskMap: new Map(),
      projectNameById: new Map(),
    });
    expect(result.rows[0]?.isActive).toBe(false);
  });

  it('empty everything: rows [], totals 0', () => {
    const result = buildDayInsight({
      date: '2026-09-30',
      capacityMinutes: 0,
      allocations: [],
      sessions: [],
      taskMap: new Map(),
      projectNameById: new Map(),
    });
    expect(result.rows).toEqual([]);
    expect(result.totalPlannedMinutes).toBe(0);
    expect(result.totalActualMinutes).toBe(0);
    expect(result.capacityMinutes).toBe(0);
  });

  it('runningMinutesByTask overlays active timer minutes and sets isRunning', () => {
    const t = task('running-task');
    const result = buildDayInsight({
      date: '2026-09-30',
      capacityMinutes: 480,
      allocations: [alloc('running-task', 60)],
      sessions: [session('running-task', 30)],
      taskMap: new Map([[t.id, t]]),
      projectNameById: new Map(),
      runningMinutesByTask: new Map([['running-task', 15]]),
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      plannedMinutes: 60,
      actualMinutes: 45, // 30 persisted + 15 live
      deltaMinutes: -15, // 45 - 60
      isRunning: true,
    });
    expect(result.totalActualMinutes).toBe(45);
  });

  it('running timer for task with no prior session creates new row with isRunning', () => {
    const t = task('fresh-running');
    const result = buildDayInsight({
      date: '2026-09-30',
      capacityMinutes: 480,
      allocations: [],
      sessions: [],
      taskMap: new Map([[t.id, t]]),
      projectNameById: new Map(),
      runningMinutesByTask: new Map([['fresh-running', 10]]),
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      taskId: 'fresh-running',
      actualMinutes: 10,
      plannedMinutes: 0,
      deltaMinutes: 10,
      isRunning: true,
    });
  });
});
