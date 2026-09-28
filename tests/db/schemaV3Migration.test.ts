// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import Dexie from 'dexie';
import { SCHEMA_V2 } from '../../src/db/schema';
import { TaskPlannerDatabase } from '../../src/db/index';

describe('Dexie Schema v3 Migration (JIRA-01, JIRA-04)', () => {
  const dbName = 'TestMigrationV3DB_' + Math.random().toString(36).slice(2);

  afterEach(async () => {
    await Dexie.delete(dbName);
  });

  it('migrates v2 database records non-destructively to v3 and supports jiraKey indexing', async () => {
    // Step 1: Create and populate a v2 database
    const v2Db = new Dexie(dbName);
    v2Db.version(2).stores(SCHEMA_V2);
    await v2Db.open();

    const sampleTaskId = '44444444-4444-4444-8444-444444444444';
    await v2Db.table('tasks').add({
      id: sampleTaskId,
      name: 'Existing V2 Task',
      status: 'Open',
      progress: 0,
      priority: 'Medium',
      estimateMinutes: 30,
      workType: 'code',
      opsOwners: ['Alex'],
      businessAnalysts: ['Carol'],
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    });

    v2Db.close();

    // Step 2: Open with TaskPlannerDatabase which applies version 3
    const v3Db = new TaskPlannerDatabase(dbName);
    await v3Db.open();

    expect(v3Db.verno).toBe(3);

    const task = await v3Db.tasks.get(sampleTaskId);
    expect(task).toBeDefined();
    expect(task?.name).toBe('Existing V2 Task');
    expect(task?.jiraKey).toBeUndefined();

    // Step 3: Update with jiraKey and query via index
    await v3Db.tasks.update(sampleTaskId, { jiraKey: 'SHB-1234' });

    const indexedTasks = await v3Db.tasks.where('jiraKey').equals('SHB-1234').toArray();
    expect(indexedTasks).toHaveLength(1);
    expect(indexedTasks[0]?.id).toBe(sampleTaskId);
    expect(indexedTasks[0]?.jiraKey).toBe('SHB-1234');

    v3Db.close();
  });
});
