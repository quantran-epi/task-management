// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import Dexie from 'dexie';
import { SCHEMA_V4 } from '../../src/db/schema';
import { TaskPlannerDatabase } from '../../src/db/index';

describe('Dexie Schema v5 Migration (D-09, TIMER-01, TIMER-02)', () => {
  const dbName = 'TestMigrationV5DB_' + Math.random().toString(36).slice(2);

  afterEach(async () => {
    await Dexie.delete(dbName);
  });

  it('migrates v4 database records non-destructively to v5 and creates workSessions and activeTimers tables', async () => {
    // Step 1: Create and populate a v4 database
    const v4Db = new Dexie(dbName);
    v4Db.version(4).stores(SCHEMA_V4);
    await v4Db.open();

    const sampleProjectId = '11111111-1111-4111-8111-111111111111';
    const sampleMilestoneId = '22222222-2222-4222-8222-222222222222';
    const sampleTaskId = '33333333-3333-4333-8333-333333333333';

    await v4Db.table('projects').add({
      id: sampleProjectId,
      name: 'Existing V4 Project',
      status: 'Open',
      reminderDate: '2026-10-01',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    });

    await v4Db.table('milestones').add({
      id: sampleMilestoneId,
      projectId: sampleProjectId,
      name: 'Existing V4 Milestone',
      status: 'Open',
      reminderDate: '2026-10-02',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    });

    await v4Db.table('tasks').add({
      id: sampleTaskId,
      projectId: sampleProjectId,
      milestoneId: sampleMilestoneId,
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

    // Step 2: Open with TaskPlannerDatabase which applies version 5
    const v5Db = new TaskPlannerDatabase(dbName);
    await v5Db.open();

    expect(v5Db.verno).toBeGreaterThanOrEqual(5);

    // Verify existing data preserved
    const project = await v5Db.projects.get(sampleProjectId);
    expect(project).toBeDefined();
    expect(project?.name).toBe('Existing V4 Project');
    expect(project?.reminderDate).toBe('2026-10-01');

    const milestone = await v5Db.milestones.get(sampleMilestoneId);
    expect(milestone).toBeDefined();
    expect(milestone?.name).toBe('Existing V4 Milestone');

    const task = await v5Db.tasks.get(sampleTaskId);
    expect(task).toBeDefined();
    expect(task?.name).toBe('Existing V4 Task');

    // Step 3: Add records to new v5 tables and test queries
    const sampleSessionId = '44444444-4444-4444-8444-444444444444';
    await v5Db.workSessions.add({
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

    const sessionsByTask = await v5Db.workSessions.where('taskId').equals(sampleTaskId).toArray();
    expect(sessionsByTask).toHaveLength(1);
    expect(sessionsByTask[0]?.durationMinutes).toBe(30);

    const sessionsByDate = await v5Db.workSessions.where('date').equals('2026-09-29').toArray();
    expect(sessionsByDate).toHaveLength(1);

    // Test activeTimers table
    await v5Db.activeTimers.put({
      taskId: sampleTaskId,
      status: 'running',
      startedAt: Date.now(),
      accumulatedMs: 5000,
      sessionStartTime: '2026-09-29T11:00:00.000Z',
    });

    const activeTimer = await v5Db.activeTimers.get(sampleTaskId);
    expect(activeTimer).toBeDefined();
    expect(activeTimer?.status).toBe('running');
    expect(activeTimer?.accumulatedMs).toBe(5000);

    v5Db.close();
  });
});
