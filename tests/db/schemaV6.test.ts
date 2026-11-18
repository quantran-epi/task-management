// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import Dexie from 'dexie';
import { SCHEMA_V5 } from '../../src/db/schema';
import { TaskPlannerDatabase } from '../../src/db/index';

/**
 * V5 → current upgrade. V6 converted `reminderDate`/`reminderNote` into the `reminders`
 * array; the live schema is V16, so the assertions read the CR axis and the live tasks
 * store, where `reminders` is the surviving contract.
 */
describe('Dexie Schema v6 Migration (D-01, D-02, NOTIF-06)', () => {
  const dbName = 'TestMigrationV6DB_' + Math.random().toString(36).slice(2);

  afterEach(async () => {
    await Dexie.delete(dbName);
  });

  it('converts legacy reminderDate/Note into a reminders array on the CR axis', async () => {
    const v5Db = new Dexie(dbName);
    v5Db.version(5).stores(SCHEMA_V5);
    await v5Db.open();

    const sampleProjectId = '11111111-1111-4111-8111-111111111111';
    const sampleTaskId = '33333333-3333-4333-8333-333333333333';
    const sampleNoReminderTaskId = '44444444-4444-4444-8444-444444444444';

    await v5Db.table('projects').add({
      id: sampleProjectId,
      name: 'Existing V5 Project',
      status: 'Open',
      reminderDate: '2026-10-01',
      reminderNote: 'Project review reminder',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    });


    await v5Db.table('tasks').add({
      id: sampleTaskId,
      projectId: sampleProjectId,
      name: 'Existing V5 Task with Reminder',
      status: 'Open',
      progress: 0,
      priority: 'Medium',
      estimateMinutes: 60,
      workType: 'code',
      jiraKey: 'SHB-100',
      reminderDate: '2026-10-03',
      reminderNote: 'Task deadline warning',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    });

    await v5Db.table('tasks').add({
      id: sampleNoReminderTaskId,
      projectId: sampleProjectId,
      name: 'Existing V5 Task without Reminder',
      status: 'Open',
      progress: 0,
      priority: 'Low',
      estimateMinutes: 30,
      workType: 'document',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    });

    v5Db.close();

    const upgradedDb = new TaskPlannerDatabase(dbName);
    await upgradedDb.open();

    expect(upgradedDb.verno).toBeGreaterThanOrEqual(6);

    // The legacy project survives as a CR with its reminder converted.
    const cr = await upgradedDb.changeRequests.get(sampleProjectId);
    expect(cr).toBeDefined();
    expect(cr?.name).toBe('Existing V5 Project');
    expect(cr?.reminders).toHaveLength(1);
    expect(cr?.reminders?.[0]?.date).toBe('2026-10-01');
    expect(cr?.reminders?.[0]?.note).toBe('Project review reminder');

    const task = await upgradedDb.tasks.get(sampleTaskId);
    expect(task).toBeDefined();
    expect(task?.crId).toBe(sampleProjectId);
    expect(task?.reminders).toHaveLength(1);
    expect(task?.reminders?.[0]?.date).toBe('2026-10-03');
    expect(task?.reminders?.[0]?.note).toBe('Task deadline warning');

    const taskNoReminder = await upgradedDb.tasks.get(sampleNoReminderTaskId);
    expect(taskNoReminder).toBeDefined();
    expect(taskNoReminder?.reminders).toEqual([]);

    // Multiple reminders (up to 5) persist on the live tasks store.
    const multiReminderTaskId = '55555555-5555-4555-8555-555555555555';
    await upgradedDb.tasks.add({
      id: multiReminderTaskId,
      crId: sampleProjectId,
      name: 'Task with 3 Reminders',
      status: 'Open',
      progress: 0,
      priority: 'High',
      estimateMinutes: 120,
      reminders: [
        { id: 'rem-1', date: '2026-10-01', time: '09:00', note: 'Morning sync' },
        { id: 'rem-2', date: '2026-10-02', time: '14:30', note: 'Afternoon check' },
        { id: 'rem-3', date: '2026-10-03', note: 'All-day reminder' },
      ],
      createdAt: '2026-09-29T12:00:00.000Z',
      updatedAt: '2026-09-29T12:00:00.000Z',
    });

    const savedTask = await upgradedDb.tasks.get(multiReminderTaskId);
    expect(savedTask?.reminders).toHaveLength(3);
    expect(savedTask?.reminders?.[0]?.time).toBe('09:00');
    expect(savedTask?.reminders?.[1]?.time).toBe('14:30');
    expect(savedTask?.reminders?.[2]?.time).toBeUndefined();

    upgradedDb.close();
  });
});
