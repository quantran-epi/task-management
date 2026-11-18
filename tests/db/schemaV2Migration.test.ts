// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import Dexie from 'dexie';
import { SCHEMA_V1 } from '../../src/db/schema';
import { TaskPlannerDatabase } from '../../src/db/index';

/**
 * V1 → current upgrade. The V2 backfill still runs, but the live schema is V16:
 * `projects`/`milestones` are gone and the legacy rows survive on the CR axis
 * (V15 copies projects into `changeRequests`, V16 re-axes tasks onto `crId`).
 */
describe('Dexie Schema v2 Migration (SHB-05, D-04, D-14, D-15)', () => {
  const dbName = 'TestMigrationDB_' + Math.random().toString(36).slice(2);

  afterEach(async () => {
    await Dexie.delete(dbName);
  });

  it('migrates v1 records non-destructively and supports multi-entry index queries', async () => {
    const v1Db = new Dexie(dbName);
    v1Db.version(1).stores(SCHEMA_V1);
    await v1Db.open();

    const sampleProjectId = '11111111-1111-4111-8111-111111111111';
    const sampleTaskId = '33333333-3333-4333-8333-333333333333';

    await v1Db.table('projects').add({
      id: sampleProjectId,
      name: 'Legacy Project',
      status: 'Open',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    });


    await v1Db.table('tasks').add({
      id: sampleTaskId,
      projectId: sampleProjectId,
      name: 'Legacy Task',
      status: 'Open',
      progress: 0,
      priority: 'Medium',
      estimateMinutes: 60,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    });

    v1Db.close();

    const upgradedDb = new TaskPlannerDatabase(dbName);
    await upgradedDb.open();

    expect(upgradedDb.verno).toBeGreaterThanOrEqual(2);

    // The legacy project survives as a Change Request with the same id.
    const cr = await upgradedDb.changeRequests.get(sampleProjectId);
    expect(cr).toBeDefined();
    expect(cr?.name).toBe('Legacy Project');
    expect(cr?.opsOwners).toEqual([]);
    expect(cr?.businessAnalysts).toEqual([]);

    // The task was re-axed onto crId and backfilled by the V2 upgrade.
    const task = await upgradedDb.tasks.get(sampleTaskId);
    expect(task).toBeDefined();
    expect(task?.crId).toBe(sampleProjectId);
    expect(task?.opsOwners).toEqual([]);
    expect(task?.businessAnalysts).toEqual([]);
    expect(task?.workType).toBe('code');

    // Multi-entry indexing still works on the live tasks store.
    await upgradedDb.tasks.update(sampleTaskId, {
      opsOwners: ['Alex', 'Brian'],
      businessAnalysts: ['Carol'],
      workType: 'investigate',
    });

    expect((await upgradedDb.tasks.where('opsOwners').equals('Alex').toArray())[0]?.id).toBe(
      sampleTaskId
    );
    expect((await upgradedDb.tasks.where('opsOwners').equals('Brian').toArray())[0]?.id).toBe(
      sampleTaskId
    );
    expect(
      (await upgradedDb.tasks.where('businessAnalysts').equals('Carol').toArray())[0]?.id
    ).toBe(sampleTaskId);
    expect((await upgradedDb.tasks.where('workType').equals('investigate').toArray())[0]?.id).toBe(
      sampleTaskId
    );

    upgradedDb.close();
  });
});
