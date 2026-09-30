// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Dexie from 'dexie';
import { TaskPlannerDatabase } from '../../src/db/index';
import {
  createWorkSession,
  getWorkSessionsForDate,
  getActualMinutesByTaskForDate,
} from '../../src/db/repositories/workSessionRepo';
import type { Task } from '../../src/types/models';

describe('workSessionRepo — Day Insight queries', () => {
  let db: TaskPlannerDatabase;
  const dbName = 'TestWorkSessionDayInsightDB_' + Math.random().toString(36).slice(2);
  const taskAId = '33333333-3333-4333-8333-3333333333aa';
  const taskBId = '33333333-3333-4333-8333-3333333333bb';

  beforeEach(async () => {
    db = new TaskPlannerDatabase(dbName);
    await db.open();
    const now = new Date().toISOString();
    const taskA: Task = {
      id: taskAId,
      name: 'Task A',
      status: 'In Progress',
      progress: 0,
      priority: 'Medium',
      estimateMinutes: 0,
      createdAt: now,
      updatedAt: now,
    };
    const taskB: Task = {
      id: taskBId,
      name: 'Task B',
      status: 'Open',
      progress: 0,
      priority: 'Low',
      estimateMinutes: 0,
      createdAt: now,
      updatedAt: now,
    };
    await db.tasks.bulkAdd([taskA, taskB]);
  });

  afterEach(async () => {
    if (db.isOpen()) db.close();
    await Dexie.delete(dbName);
  });

  it('getWorkSessionsForDate returns joined rows for the target date only', async () => {
    // Two sessions on 2026-09-30 for taskA, one on 2026-09-29 for taskB.
    await createWorkSession(
      {
        taskId: taskAId,
        startTime: '2026-09-30T09:00:00.000Z',
        endTime: '2026-09-30T09:30:00.000Z',
        durationMinutes: 30,
      },
      db
    );
    await createWorkSession(
      {
        taskId: taskAId,
        startTime: '2026-09-30T14:00:00.000Z',
        endTime: '2026-09-30T14:20:00.000Z',
        durationMinutes: 20,
      },
      db
    );
    await createWorkSession(
      {
        taskId: taskBId,
        startTime: '2026-09-29T10:00:00.000Z',
        endTime: '2026-09-29T10:45:00.000Z',
        durationMinutes: 45,
      },
      db
    );

    // Session dates are derived from local wall clock in the repo. Compute expected date the same way.
    const targetDate = new Date('2026-09-30T09:00:00.000Z');
    const y = targetDate.getFullYear();
    const m = String(targetDate.getMonth() + 1).padStart(2, '0');
    const d = String(targetDate.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;

    const rows = await getWorkSessionsForDate(dateStr, db);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const r of rows) {
      expect(r.date).toBe(dateStr);
      expect(r.task.id).toBe(r.taskId);
    }
  });

  it('getWorkSessionsForDate returns empty array when no sessions match', async () => {
    const rows = await getWorkSessionsForDate('2025-01-01', db);
    expect(rows).toEqual([]);
  });

  it('getActualMinutesByTaskForDate sums durationMinutes per taskId', async () => {
    await createWorkSession(
      {
        taskId: taskAId,
        startTime: '2026-09-30T09:00:00.000Z',
        endTime: '2026-09-30T09:30:00.000Z',
        durationMinutes: 30,
      },
      db
    );
    await createWorkSession(
      {
        taskId: taskAId,
        startTime: '2026-09-30T15:00:00.000Z',
        endTime: '2026-09-30T15:15:00.000Z',
        durationMinutes: 15,
      },
      db
    );
    await createWorkSession(
      {
        taskId: taskBId,
        startTime: '2026-09-30T11:00:00.000Z',
        endTime: '2026-09-30T11:45:00.000Z',
        durationMinutes: 45,
      },
      db
    );

    const targetDate = new Date('2026-09-30T09:00:00.000Z');
    const y = targetDate.getFullYear();
    const m = String(targetDate.getMonth() + 1).padStart(2, '0');
    const d = String(targetDate.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;

    const map = await getActualMinutesByTaskForDate(dateStr, db);
    expect(map.get(taskAId)).toBe(45);
    expect(map.get(taskBId)).toBe(45);
  });

  it('missing task falls back to placeholder record', async () => {
    const ghostId = '99999999-9999-4999-8999-999999999999';
    await createWorkSession(
      {
        taskId: taskAId,
        startTime: '2026-09-30T09:00:00.000Z',
        endTime: '2026-09-30T09:10:00.000Z',
        durationMinutes: 10,
      },
      db
    );
    // Force insert a raw session for a non-existent task (bypass validation via direct table put).
    await db.workSessions.put({
      id: 'raw-orphan',
      taskId: ghostId,
      startTime: '2026-09-30T10:00:00.000Z',
      endTime: '2026-09-30T10:05:00.000Z',
      date: '2026-09-30',
      durationMinutes: 5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const rows = await getWorkSessionsForDate('2026-09-30', db);
    const orphan = rows.find((r) => r.taskId === ghostId);
    expect(orphan).toBeDefined();
    expect(orphan!.task.name).toBe('Deleted / Unknown Task');
  });
});
