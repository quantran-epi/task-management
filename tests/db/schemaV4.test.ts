// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import Dexie from 'dexie';
import { SCHEMA_V3 } from '../../src/db/schema';
import { TaskPlannerDatabase } from '../../src/db/index';

/**
 * V3 → current upgrade. The V4 store shape is history; the live schema is V16, so the
 * assertions target the CR axis: the legacy project becomes a Change Request and the
 * task survives with `crId`, with `reminderDate` still indexed on the live store.
 */
describe('Dexie Schema v4 Migration (D-06, D-07, NOTIF-01)', () => {
  const dbName = 'TestMigrationV4DB_' + Math.random().toString(36).slice(2);

  afterEach(async () => {
    await Dexie.delete(dbName);
  });

  it('migrates v3 records non-destructively and supports reminderDate indexing', async () => {
    const v3Db = new Dexie(dbName);
    v3Db.version(3).stores(SCHEMA_V3);
    await v3Db.open();

    const sampleProjectId = '11111111-1111-4111-8111-111111111111';
    const sampleTaskId = '33333333-3333-4333-8333-333333333333';

    await v3Db.table('projects').add({
      id: sampleProjectId,
      name: 'Existing V3 Project',
      status: 'Open',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    });


    await v3Db.table('tasks').add({
      id: sampleTaskId,
      projectId: sampleProjectId,
      name: 'Existing V3 Task',
      status: 'Open',
      progress: 0,
      priority: 'Medium',
      estimateMinutes: 60,
      workType: 'code',
      jiraKey: 'SHB-100',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    });

    v3Db.close();

    const upgradedDb = new TaskPlannerDatabase(dbName);
    await upgradedDb.open();

    expect(upgradedDb.verno).toBeGreaterThanOrEqual(4);

    const cr = await upgradedDb.changeRequests.get(sampleProjectId);
    expect(cr).toBeDefined();
    expect(cr?.name).toBe('Existing V3 Project');
    expect(cr?.reminderDate).toBeUndefined();

    const task = await upgradedDb.tasks.get(sampleTaskId);
    expect(task).toBeDefined();
    expect(task?.name).toBe('Existing V3 Task');
    expect(task?.jiraKey).toBe('SHB-100');
    expect(task?.crId).toBe(sampleProjectId);
    expect(task?.reminderDate).toBeUndefined();

    // reminderDate is still an index on the live tasks store.
    const reminderDate = '2026-09-29';
    await upgradedDb.changeRequests.update(sampleProjectId, {
      reminderDate,
      reminderNote: 'CR note',
    });
    await upgradedDb.tasks.update(sampleTaskId, { reminderDate, reminderNote: 'Task note' });

    const crAfter = await upgradedDb.changeRequests.get(sampleProjectId);
    expect(crAfter?.reminderNote).toBe('CR note');

    const indexedTasks = await upgradedDb.tasks
      .where('reminderDate')
      .equals(reminderDate)
      .toArray();
    expect(indexedTasks).toHaveLength(1);
    expect(indexedTasks[0]?.reminderNote).toBe('Task note');

    upgradedDb.close();
  });
});
