// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import Dexie from 'dexie';
import { SCHEMA_V1 } from '../../src/db/schema';
import { TaskPlannerDatabase } from '../../src/db/index';

describe('Dexie Schema v2 Migration (SHB-05, D-04, D-14, D-15)', () => {
  const dbName = 'TestMigrationDB_' + Math.random().toString(36).slice(2);

  afterEach(async () => {
    await Dexie.delete(dbName);
  });

  it('migrates v1 database records non-destructively to v2 and supports multi-entry index queries', async () => {
    // Step 1: Create and populate a v1-only database
    const v1Db = new Dexie(dbName);
    v1Db.version(1).stores(SCHEMA_V1);
    await v1Db.open();

    const sampleProjectId = '11111111-1111-4111-8111-111111111111';
    const sampleMilestoneId = '22222222-2222-4222-8222-222222222222';
    const sampleTaskId = '33333333-3333-4333-8333-333333333333';

    await v1Db.table('projects').add({
      id: sampleProjectId,
      name: 'Legacy Project',
      status: 'Open',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    });

    await v1Db.table('milestones').add({
      id: sampleMilestoneId,
      projectId: sampleProjectId,
      name: 'Legacy Milestone',
      status: 'Open',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    });

    await v1Db.table('tasks').add({
      id: sampleTaskId,
      projectId: sampleProjectId,
      milestoneId: sampleMilestoneId,
      name: 'Legacy Task',
      status: 'Open',
      progress: 0,
      priority: 'Medium',
      estimateMinutes: 60,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    });

    v1Db.close();

    // Step 2: Open using TaskPlannerDatabase which defines version(2) upgrade
    const v2Db = new TaskPlannerDatabase(dbName);
    await v2Db.open();

    expect(v2Db.verno).toBe(2);

    // Verify Project backfill
    const project = await v2Db.projects.get(sampleProjectId);
    expect(project).toBeDefined();
    expect(project?.opsOwners).toEqual([]);
    expect(project?.businessAnalysts).toEqual([]);

    // Verify Milestone backfill
    const milestone = await v2Db.milestones.get(sampleMilestoneId);
    expect(milestone).toBeDefined();
    expect(milestone?.opsOwners).toEqual([]);
    expect(milestone?.businessAnalysts).toEqual([]);

    // Verify Task backfill
    const task = await v2Db.tasks.get(sampleTaskId);
    expect(task).toBeDefined();
    expect(task?.opsOwners).toEqual([]);
    expect(task?.businessAnalysts).toEqual([]);
    expect(task?.workType).toBe('code');

    // Step 3: Test multi-entry indexing and updates
    await v2Db.tasks.update(sampleTaskId, {
      opsOwners: ['Alex', 'Brian'],
      businessAnalysts: ['Carol'],
      workType: 'investigate',
    });

    // Query multi-entry index *opsOwners
    const alexTasks = await v2Db.tasks.where('opsOwners').equals('Alex').toArray();
    expect(alexTasks).toHaveLength(1);
    expect(alexTasks[0]?.id).toBe(sampleTaskId);

    const brianTasks = await v2Db.tasks.where('opsOwners').equals('Brian').toArray();
    expect(brianTasks).toHaveLength(1);
    expect(brianTasks[0]?.id).toBe(sampleTaskId);

    // Query multi-entry index *businessAnalysts
    const carolTasks = await v2Db.tasks.where('businessAnalysts').equals('Carol').toArray();
    expect(carolTasks).toHaveLength(1);
    expect(carolTasks[0]?.id).toBe(sampleTaskId);

    // Query workType index
    const investigateTasks = await v2Db.tasks.where('workType').equals('investigate').toArray();
    expect(investigateTasks).toHaveLength(1);
    expect(investigateTasks[0]?.id).toBe(sampleTaskId);

    v2Db.close();
  });
});
