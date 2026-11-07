// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import Dexie from 'dexie';
import { SCHEMA_V4 } from '../../src/db/schema';
import { TaskPlannerDatabase } from '../../src/db/index';

/**
 * V4 → current upgrade. V5 created `workSessions`/`activeTimers`; the live schema is V16,
 * so the assertions target those two surviving stores plus the CR axis.
 */
describe('Dexie Schema v5 Migration (D-09, TIMER-01, TIMER-02)', () => {
  const dbName = 'TestMigrationV5DB_' + Math.random().toString(36).slice(2);

  afterEach(async () => {
    await Dexie.delete(dbName);
  });

  it('migrates v4 records non-destructively and creates workSessions and activeTimers', async () => {
    const v4Db = new Dexie(dbName);
    v4Db.version(4).stores(SCHEMA_V4);
    await v4Db.open();

    const sampleProjectId = '11111111-1111-4111-8111-111111111111';
    const sampleTaskId = '33333333-3333-4333-8333-333333333333';

    await v4Db.table('projects').add({
      id: sampleProjectId,
      name: 'Existing V4 Project',
      status: 'Open',
      reminderDate: '2026-10-01',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    });


    await v4Db.table('tasks').add({
      id: sampleTaskId,
      projectId: sampleProjectId,
      name: 'Existing V4 Task',
      status: 'Open',
      progress: 0,
      priority: 'Medium',
      estimateMinutes: 60,
      workType: 'code',
      jiraKey: 'SHB-100',
      reminderDate: '2026-10-03',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    });

    v4Db.close();

    const upgradedDb = new TaskPlannerDatabase(dbName);
    await upgradedDb.open();

    expect(upgradedDb.verno).toBeGreaterThanOrEqual(5);

    const cr = await upgradedDb.changeRequests.get(sampleProjectId);
    expect(cr).toBeDefined();
    expect(cr?.name).toBe('Existing V4 Project');

    const task = await upgradedDb.tasks.get(sampleTaskId);
    expect(task).toBeDefined();
    expect(task?.name).toBe('Existing V4 Task');
    expect(task?.crId).toBe(sampleProjectId);

    // The V5 tables exist and are queryable by their indexes.
    const sampleSessionId = '44444444-4444-4444-8444-444444444444';
    await upgradedDb.workSessions.add({
      id: sampleSessionId,
      taskId: sampleTaskId,
      startTime: '2026-09-29T10:00:00.000Z',
      endTime: '2026-09-29T10:30:00.000Z',
      date: '2026-09-29',
      durationMinutes: 30,
      note: 'Investigate timer specs',
      createdAt: '2026-09-29T10:30:00.000Z',
      updatedAt: '2026-09-29T10:30:00.000Z',
    });

    const sessionsByTask = await upgradedDb.workSessions
      .where('taskId')
      .equals(sampleTaskId)
      .toArray();
    expect(sessionsByTask).toHaveLength(1);
    expect(sessionsByTask[0]?.durationMinutes).toBe(30);

    const sessionsByDate = await upgradedDb.workSessions
      .where('date')
      .equals('2026-09-29')
      .toArray();
    expect(sessionsByDate).toHaveLength(1);

    await upgradedDb.activeTimers.put({
      taskId: sampleTaskId,
      status: 'running',
      startedAt: Date.now(),
      accumulatedMs: 5000,
      sessionStartTime: '2026-09-29T11:00:00.000Z',
    });

    const activeTimer = await upgradedDb.activeTimers.get(sampleTaskId);
    expect(activeTimer).toBeDefined();
    expect(activeTimer?.status).toBe('running');
    expect(activeTimer?.accumulatedMs).toBe(5000);

    upgradedDb.close();
  });
});
