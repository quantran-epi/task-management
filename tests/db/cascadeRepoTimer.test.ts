// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Dexie from 'dexie';
import { TaskPlannerDatabase } from '../../src/db/index';
import {
  deleteTaskWithAllocations,
  deleteChangeRequestWithCascade,
} from '../../src/db/repositories/cascadeRepo';
import { createWorkSession, putActiveTimer } from '../../src/db/repositories/workSessionRepo';
import type { Task, ChangeRequest } from '../../src/types/models';

describe('cascadeRepo Timer cleanup (D-16, TIMER-01, TIMER-02)', () => {
  let db: TaskPlannerDatabase;
  let dbName: string;

  const sampleCrId = '11111111-1111-4111-8111-111111111111';
  const otherCrId = '22222222-2222-4222-8222-222222222222';
  const sampleTaskId1 = '33333333-3333-4333-8333-333333333331';
  const sampleTaskId2 = '33333333-3333-4333-8333-333333333332';
  const otherCrTaskId = '33333333-3333-4333-8333-333333333333';

  beforeEach(async () => {
    dbName = 'TestCascadeTimerDB_' + Math.random().toString(36).slice(2);
    db = new TaskPlannerDatabase(dbName);
    await db.open();

    const now = new Date().toISOString();
    const makeCr = (id: string, name: string): ChangeRequest => ({
      id,
      name,
      code: `CR-${id.slice(-4)}`,
      status: 'In Progress',
      type: 'ENHANCEMENT',
      targets: [],
      createdAt: now,
      updatedAt: now,
    });
    await db.changeRequests.bulkAdd([
      makeCr(sampleCrId, 'Cascade Test CR'),
      makeCr(otherCrId, 'Untouched CR'),
    ]);

    const makeTask = (id: string, crId: string, name: string): Task => ({
      id,
      crId,
      name,
      status: 'Open',
      progress: 0,
      priority: 'Medium',
      estimateMinutes: 60,
      createdAt: now,
      updatedAt: now,
    });
    await db.tasks.bulkAdd([
      makeTask(sampleTaskId1, sampleCrId, 'Task 1'),
      makeTask(sampleTaskId2, sampleCrId, 'Task 2'),
      makeTask(otherCrTaskId, otherCrId, 'Other CR Task'),
    ]);

    await createWorkSession(
      {
        taskId: sampleTaskId1,
        startTime: '2026-09-29T08:00:00.000Z',
        endTime: '2026-09-29T08:30:00.000Z',
        durationMinutes: 30,
      },
      db
    );
    await createWorkSession(
      {
        taskId: sampleTaskId2,
        startTime: '2026-09-29T09:00:00.000Z',
        endTime: '2026-09-29T09:40:00.000Z',
        durationMinutes: 40,
      },
      db
    );
    await createWorkSession(
      {
        taskId: otherCrTaskId,
        startTime: '2026-09-29T10:00:00.000Z',
        endTime: '2026-09-29T10:20:00.000Z',
        durationMinutes: 20,
      },
      db
    );

    await putActiveTimer(
      {
        taskId: sampleTaskId1,
        status: 'running',
        startedAt: Date.now(),
        accumulatedMs: 1000,
        sessionStartTime: '2026-09-29T08:30:00.000Z',
      },
      db
    );
    await putActiveTimer(
      {
        taskId: sampleTaskId2,
        status: 'paused',
        startedAt: Date.now(),
        accumulatedMs: 2000,
        sessionStartTime: '2026-09-29T09:40:00.000Z',
      },
      db
    );
    await putActiveTimer(
      {
        taskId: otherCrTaskId,
        status: 'running',
        startedAt: Date.now(),
        accumulatedMs: 3000,
        sessionStartTime: '2026-09-29T10:20:00.000Z',
      },
      db
    );
  });

  afterEach(async () => {
    db.close();
    await Dexie.delete(dbName);
  });

  it('deleteTaskWithAllocations removes workSessions and activeTimers for that task', async () => {
    await deleteTaskWithAllocations(sampleTaskId1, db);

    expect(await db.tasks.get(sampleTaskId1)).toBeUndefined();

    const sessions = await db.workSessions.where('taskId').equals(sampleTaskId1).toArray();
    expect(sessions).toHaveLength(0);
    expect(await db.activeTimers.get(sampleTaskId1)).toBeUndefined();

    // Verify other tasks still have their data
    const task2Sessions = await db.workSessions.where('taskId').equals(sampleTaskId2).toArray();
    expect(task2Sessions).toHaveLength(1);
    expect(await db.activeTimers.get(sampleTaskId2)).toBeDefined();
  });

  it('deleteChangeRequestWithCascade deletes the CR, its tasks, sessions and timers', async () => {
    await deleteChangeRequestWithCascade(sampleCrId, db);

    expect(await db.changeRequests.get(sampleCrId)).toBeUndefined();
    expect(await db.tasks.get(sampleTaskId1)).toBeUndefined();
    expect(await db.tasks.get(sampleTaskId2)).toBeUndefined();

    const sessions1 = await db.workSessions.where('taskId').equals(sampleTaskId1).toArray();
    const sessions2 = await db.workSessions.where('taskId').equals(sampleTaskId2).toArray();
    expect(sessions1).toHaveLength(0);
    expect(sessions2).toHaveLength(0);
    expect(await db.activeTimers.get(sampleTaskId1)).toBeUndefined();
    expect(await db.activeTimers.get(sampleTaskId2)).toBeUndefined();

    // The other CR and its child task survive untouched
    expect(await db.changeRequests.get(otherCrId)).toBeDefined();
    expect(await db.tasks.get(otherCrTaskId)).toBeDefined();
    const otherSessions = await db.workSessions.where('taskId').equals(otherCrTaskId).toArray();
    expect(otherSessions).toHaveLength(1);
    expect(await db.activeTimers.get(otherCrTaskId)).toBeDefined();
  });

  it('deleteChangeRequestWithCascade also purges the CR chat threads and note links', async () => {
    const now = new Date().toISOString();
    await db.chatThreads.add({
      id: '44444444-4444-4444-8444-444444444444',
      scopeKey: `cr:${sampleCrId}`,
      scopeType: 'cr',
      entityId: sampleCrId,
      createdAt: now,
      updatedAt: now,
    });
    await db.notes.add({
      id: '55555555-5555-4555-8555-555555555555',
      type: 'quick_note',
      title: 'Linked note',
      body: 'body',
      isPinned: false,
      entityType: 'cr',
      entityId: sampleCrId,
      createdAt: now,
      updatedAt: now,
    });

    await deleteChangeRequestWithCascade(sampleCrId, db);

    expect(await db.chatThreads.where('scopeKey').equals(`cr:${sampleCrId}`).count()).toBe(0);
    const note = await db.notes.get('55555555-5555-4555-8555-555555555555');
    expect(note).toBeDefined();
    expect(note?.entityId).toBeUndefined();
  });
});
