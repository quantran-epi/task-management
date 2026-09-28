// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import Dexie from 'dexie';
import { SCHEMA_V3 } from '../../src/db/schema';
import { TaskPlannerDatabase } from '../../src/db/index';

describe('Dexie Schema v4 Migration (D-06, D-07, NOTIF-01)', () => {
  const dbName = 'TestMigrationV4DB_' + Math.random().toString(36).slice(2);

  afterEach(async () => {
    await Dexie.delete(dbName);
  });

  it('migrates v3 database records non-destructively to v4 and supports reminderDate indexing', async () => {
    // Step 1: Create and populate a v3 database
    const v3Db = new Dexie(dbName);
    v3Db.version(3).stores(SCHEMA_V3);
    await v3Db.open();

    const sampleProjectId = '11111111-1111-4111-8111-111111111111';
    const sampleMilestoneId = '22222222-2222-4222-8222-222222222222';
    const sampleTaskId = '33333333-3333-4333-8333-333333333333';

    await v3Db.table('projects').add({
      id: sampleProjectId,
      name: 'Existing V3 Project',
      status: 'Open',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    });

    await v3Db.table('milestones').add({
      id: sampleMilestoneId,
      projectId: sampleProjectId,
      name: 'Existing V3 Milestone',
      status: 'Open',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    });

    await v3Db.table('tasks').add({
      id: sampleTaskId,
      projectId: sampleProjectId,
      milestoneId: sampleMilestoneId,
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

    // Step 2: Open with TaskPlannerDatabase which applies version 4
    const v4Db = new TaskPlannerDatabase(dbName);
    await v4Db.open();

    expect(v4Db.verno).toBe(4);

    // Verify existing data preserved
    const project = await v4Db.projects.get(sampleProjectId);
    expect(project).toBeDefined();
    expect(project?.name).toBe('Existing V3 Project');
    expect(project?.reminderDate).toBeUndefined();

    const milestone = await v4Db.milestones.get(sampleMilestoneId);
    expect(milestone).toBeDefined();
    expect(milestone?.name).toBe('Existing V3 Milestone');
    expect(milestone?.reminderDate).toBeUndefined();

    const task = await v4Db.tasks.get(sampleTaskId);
    expect(task).toBeDefined();
    expect(task?.name).toBe('Existing V3 Task');
    expect(task?.jiraKey).toBe('SHB-100');
    expect(task?.reminderDate).toBeUndefined();

    // Step 3: Update reminderDate and query via index
    const reminderDate = '2026-09-29';
    await v4Db.projects.update(sampleProjectId, { reminderDate, reminderNote: 'Project note' });
    await v4Db.milestones.update(sampleMilestoneId, { reminderDate, reminderNote: 'Milestone note' });
    await v4Db.tasks.update(sampleTaskId, { reminderDate, reminderNote: 'Task note' });

    const indexedProjects = await v4Db.projects.where('reminderDate').equals(reminderDate).toArray();
    expect(indexedProjects).toHaveLength(1);
    expect(indexedProjects[0]?.id).toBe(sampleProjectId);
    expect(indexedProjects[0]?.reminderNote).toBe('Project note');

    const indexedMilestones = await v4Db.milestones.where('reminderDate').equals(reminderDate).toArray();
    expect(indexedMilestones).toHaveLength(1);
    expect(indexedMilestones[0]?.id).toBe(sampleMilestoneId);
    expect(indexedMilestones[0]?.reminderNote).toBe('Milestone note');

    const indexedTasks = await v4Db.tasks.where('reminderDate').equals(reminderDate).toArray();
    expect(indexedTasks).toHaveLength(1);
    expect(indexedTasks[0]?.id).toBe(sampleTaskId);
    expect(indexedTasks[0]?.reminderNote).toBe('Task note');

    v4Db.close();
  });
});
