import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Dexie from 'dexie';
import { TaskPlannerDatabase } from '../../src/db/index';
import {
  createChangeRequest,
  updateChangeRequest,
  getChangeRequest,
  getAllChangeRequests,
  getChangeRequestsBySystem,
  deleteChangeRequest,
} from '../../src/db/repositories/changeRequestRepo';

describe('ChangeRequest Repository (ENT-CR-01)', () => {
  let db: TaskPlannerDatabase;
  let dbName: string;

  beforeEach(async () => {
    dbName = 'TestChangeRequestRepoDB_' + Math.random().toString(36).slice(2);
    db = new TaskPlannerDatabase(dbName);
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('creates, retrieves, and updates change requests with targetSystemIds and types', async () => {
    const cr = await createChangeRequest(
      {
        name: 'CR-2026-001 Auto Loan Rate Calculation',
        code: 'CR-001',
        description: 'New feature to calculate floating interest rate',
        type: 'NEW_FEATURE',
        status: 'In Progress',
        targetSystemIds: ['sys-loan-calc', 'sys-core'],
      },
      db
    );

    expect(cr.id).toBeDefined();
    expect(cr.name).toBe('CR-2026-001 Auto Loan Rate Calculation');
    expect(cr.code).toBe('CR-001');
    expect(cr.type).toBe('NEW_FEATURE');
    expect(cr.status).toBe('In Progress');
    expect(cr.targetSystemIds).toEqual(['sys-loan-calc', 'sys-core']);

    const fetched = await getChangeRequest(cr.id, db);
    expect(fetched).toEqual(cr);

    const updated = await updateChangeRequest(
      cr.id,
      {
        status: 'Done',
        targetSystemIds: ['sys-loan-calc'],
      },
      db
    );

    expect(updated.status).toBe('Done');
    expect(updated.targetSystemIds).toEqual(['sys-loan-calc']);
    expect(updated.updatedAt >= cr.updatedAt).toBe(true);
  });

  it('filters change requests by targetSystemId', async () => {
    await createChangeRequest(
      {
        name: 'CR 1',
        type: 'ENHANCEMENT',
        targetSystemIds: ['sys-a', 'sys-b'],
      },
      db
    );

    await createChangeRequest(
      {
        name: 'CR 2',
        type: 'BUGFIX',
        targetSystemIds: ['sys-b', 'sys-c'],
      },
      db
    );

    await createChangeRequest(
      {
        name: 'CR 3',
        type: 'NEW_FEATURE',
        targetSystemIds: ['sys-a'],
      },
      db
    );

    const forSysA = await getChangeRequestsBySystem('sys-a', db);
    expect(forSysA).toHaveLength(2);
    expect(forSysA.map((c) => c.name).sort()).toEqual(['CR 1', 'CR 3'].sort());

    const forSysB = await getChangeRequestsBySystem('sys-b', db);
    expect(forSysB).toHaveLength(2);
    expect(forSysB.map((c) => c.name).sort()).toEqual(['CR 1', 'CR 2'].sort());

    const forSysC = await getChangeRequestsBySystem('sys-c', db);
    expect(forSysC).toHaveLength(1);
    expect(forSysC[0]!.name).toBe('CR 2');
  });

  it('deletes change request and cascade cleans up related items', async () => {
    const cr = await createChangeRequest(
      {
        name: 'Temporary CR',
        type: 'ENHANCEMENT',
      },
      db
    );

    await deleteChangeRequest(cr.id, db);
    const fetched = await getChangeRequest(cr.id, db);
    expect(fetched).toBeUndefined();
  });

  it('exports and restores changeRequests correctly via backup services', async () => {
    const { exportBackupPayload } = await import('../../src/services/backup/exportBackup');
    const { restoreBackupPayload } = await import('../../src/services/backup/restoreBackup');

    const cr = await createChangeRequest(
      {
        name: 'Feature X',
        type: 'NEW_FEATURE',
        status: 'In Progress',
        targetSystemIds: ['sys-1', 'sys-2'],
      },
      db
    );

    const backup = await exportBackupPayload(db);
    expect(backup.tables.changeRequests).toBeDefined();
    expect(backup.tables.changeRequests).toHaveLength(1);
    expect(backup.tables.changeRequests?.[0]?.name).toBe('Feature X');
    expect(backup.counts.changeRequests).toBe(1);

    // Create fresh db and restore
    const restoreDbName = 'TestRestoreCrDB_' + Math.random().toString(36).slice(2);
    const restoreDb = new TaskPlannerDatabase(restoreDbName);
    await restoreDb.open();

    await restoreBackupPayload(backup, restoreDb);

    const restoredCr = await restoreDb.changeRequests.get(cr.id);
    expect(restoredCr).toBeDefined();
    expect(restoredCr?.name).toBe('Feature X');
    expect(restoredCr?.type).toBe('NEW_FEATURE');
    expect(restoredCr?.targetSystemIds).toEqual(['sys-1', 'sys-2']);

    await restoreDb.delete();
  });
});
