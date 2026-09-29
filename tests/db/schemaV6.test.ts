// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import Dexie from 'dexie';
import { SCHEMA_V5 } from '../../src/db/schema';
import { TaskPlannerDatabase } from '../../src/db/index';

describe('Dexie Schema v6 Migration (D-01, D-02, NOTIF-06)', () => {
  const dbName = 'TestMigrationV6DB_' + Math.random().toString(36).slice(2);

  afterEach(async () => {
    await Dexie.delete(dbName);
  });

  it('migrates v5 database records non-destructively to v6 by converting legacy reminderDate/Note to reminders array', async () => {
    // Step 1: Create and populate a v5 database
    const v5Db = new Dexie(dbName);
    v5Db.version(5).stores(SCHEMA_V5);
    await v5Db.open();

    const sampleProjectId = '11111111-1111-4111-8111-111111111111';
    const sampleMilestoneId = '22222222-2222-4222-8222-222222222222';
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

    await v5Db.table('milestones').add({
      id: sampleMilestoneId,
      projectId: sampleProjectId,
      name: 'Existing V5 Milestone',
      status: 'Open',
      reminderDate: '2026-10-02',
      reminderNote: 'Milestone checkpoint',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    });

    await v5Db.table('tasks').add({
      id: sampleTaskId,
      projectId: sampleProjectId,
      milestoneId: sampleMilestoneId,
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
      milestoneId: sampleMilestoneId,
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

    // Step 2: Open with TaskPlannerDatabase which applies version 6 upgrade
    const v6Db = new TaskPlannerDatabase(dbName);
    await v6Db.open();

    expect(v6Db.verno).toBe(6);

    // Verify existing project data preserved & migrated
    const project = await v6Db.projects.get(sampleProjectId);
    expect(project).toBeDefined();
    expect(project?.name).toBe('Existing V5 Project');
    expect(project?.reminderDate).toBe('2026-10-01');
    expect(project?.reminderNote).toBe('Project review reminder');
    expect(project?.reminders).toHaveLength(1);
    expect(project?.reminders?.[0]?.date).toBe('2026-10-01');
    expect(project?.reminders?.[0]?.note).toBe('Project review reminder');
    expect(project?.reminders?.[0]?.id).toBeDefined();

    // Verify milestone data migrated
    const milestone = await v6Db.milestones.get(sampleMilestoneId);
    expect(milestone).toBeDefined();
    expect(milestone?.reminders).toHaveLength(1);
    expect(milestone?.reminders?.[0]?.date).toBe('2026-10-02');
    expect(milestone?.reminders?.[0]?.note).toBe('Milestone checkpoint');

    // Verify task with reminder migrated
    const task = await v6Db.tasks.get(sampleTaskId);
    expect(task).toBeDefined();
    expect(task?.reminders).toHaveLength(1);
    expect(task?.reminders?.[0]?.date).toBe('2026-10-03');
    expect(task?.reminders?.[0]?.note).toBe('Task deadline warning');

    // Verify task without reminder initialized to empty array
    const taskNoReminder = await v6Db.tasks.get(sampleNoReminderTaskId);
    expect(taskNoReminder).toBeDefined();
    expect(taskNoReminder?.reminders).toEqual([]);

    // Step 3: Add multiple reminders (up to 5) to a task and verify persistence
    const multiReminderTaskId = '55555555-5555-4555-8555-555555555555';
    await v6Db.tasks.add({
      id: multiReminderTaskId,
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

    const savedTask = await v6Db.tasks.get(multiReminderTaskId);
    expect(savedTask).toBeDefined();
    expect(savedTask?.reminders).toHaveLength(3);
    expect(savedTask?.reminders?.[0]?.time).toBe('09:00');
    expect(savedTask?.reminders?.[1]?.time).toBe('14:30');
    expect(savedTask?.reminders?.[2]?.time).toBeUndefined();

    v6Db.close();
  });
});
