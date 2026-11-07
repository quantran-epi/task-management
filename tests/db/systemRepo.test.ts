import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Dexie from 'dexie';
import { TaskPlannerDatabase } from '../../src/db/index';
import {
  createSystem,
  updateSystem,
  getSystem,
  getAllSystems,
  getParentSystems,
  getSubsystems,
  deleteSystem,
} from '../../src/db/repositories/systemRepo';

describe('System Repository (ENT-SYS-01)', () => {
  let db: TaskPlannerDatabase;
  let dbName: string;

  beforeEach(async () => {
    dbName = 'TestSystemRepoDB_' + Math.random().toString(36).slice(2);
    db = new TaskPlannerDatabase(dbName);
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('creates, retrieves, and updates systems with code, type, and ssh properties', async () => {
    const created = await createSystem(
      {
        name: 'Payment Processing Group',
        code: 'PAYMENT_GRP',
        type: 'LOGICAL_GROUP',
        description: 'Logical grouping of payment services',
      },
      db
    );

    expect(created.id).toBeDefined();
    expect(created.name).toBe('Payment Processing Group');
    expect(created.code).toBe('PAYMENT_GRP');
    expect(created.type).toBe('LOGICAL_GROUP');
    expect(created.parentId).toBeNull();

    const fetched = await getSystem(created.id, db);
    expect(fetched).toEqual(created);

    const updated = await updateSystem(
      created.id,
      {
        description: 'Updated description',
        code: 'PAYMENT_CORE_GRP',
      },
      db
    );

    expect(updated.description).toBe('Updated description');
    expect(updated.code).toBe('PAYMENT_CORE_GRP');
    expect(updated.updatedAt >= created.updatedAt).toBe(true);
  });

  it('retrieves parent systems and subsystems accurately', async () => {
    // 1 parent group
    const parent = await createSystem(
      {
        name: 'Core Banking',
        code: 'CORE',
        type: 'LOGICAL_GROUP',
      },
      db
    );

    // 2 child subsystems
    const child1 = await createSystem(
      {
        name: 'Account Service',
        code: 'ACCT_SVC',
        parentId: parent.id,
        type: 'SERVICE',
        remoteRepoPath: '/repos/acct',
        defaultBaseBranch: 'main',
      },
      db
    );

    const child2 = await createSystem(
      {
        name: 'Customer Web UI',
        code: 'CUST_UI',
        parentId: parent.id,
        type: 'UI',
      },
      db
    );

    // 1 standalone top-level service (parentId null)
    const standalone = await createSystem(
      {
        name: 'Audit Worker',
        code: 'AUDIT_WRK',
        parentId: null,
        type: 'WORKER',
      },
      db
    );

    const all = await getAllSystems(db);
    expect(all).toHaveLength(4);

    const parentSystems = await getParentSystems(db);
    // parentSystems returns root/parent systems (parentId is null or type === LOGICAL_GROUP)
    const parentIds = parentSystems.map((s) => s.id);
    expect(parentIds).toContain(parent.id);
    expect(parentIds).toContain(standalone.id);
    expect(parentIds).not.toContain(child1.id);
    expect(parentIds).not.toContain(child2.id);

    const children = await getSubsystems(parent.id, db);
    expect(children).toHaveLength(2);
    expect(children.map((c) => c.id).sort()).toEqual([child1.id, child2.id].sort());
  });

  it('prevents deleting a system if child subsystems exist without cascade/force', async () => {
    const parent = await createSystem(
      {
        name: 'Loan Management',
        code: 'LOAN',
        type: 'LOGICAL_GROUP',
      },
      db
    );

    await createSystem(
      {
        name: 'Loan Calc Engine',
        code: 'LOAN_CALC',
        parentId: parent.id,
        type: 'SERVICE',
      },
      db
    );

    await expect(deleteSystem(parent.id, db)).rejects.toThrow(/child subsystems/i);

    // Delete child first, then parent succeeds
    const children = await getSubsystems(parent.id, db);
    await deleteSystem(children[0]!.id, db);
    await expect(deleteSystem(parent.id, db)).resolves.not.toThrow();

    const parentAfter = await getSystem(parent.id, db);
    expect(parentAfter).toBeUndefined();
  });

  it('exports and restores systems correctly via backup services', async () => {
    const { exportBackupPayload } = await import('../../src/services/backup/exportBackup');
    const { restoreBackupPayload } = await import('../../src/services/backup/restoreBackup');

    const sys = await createSystem(
      {
        name: 'Core System',
        code: 'CORE_SYS',
        type: 'SERVICE',
        defaultBaseBranch: 'main',
      },
      db
    );

    const backup = await exportBackupPayload(db);
    expect(backup.tables.systems).toBeDefined();
    expect(backup.tables.systems).toHaveLength(1);
    expect(backup.tables.systems?.[0]?.code).toBe('CORE_SYS');
    expect(backup.counts.systems).toBe(1);

    // Create fresh db and restore
    const restoreDbName = 'TestRestoreSysDB_' + Math.random().toString(36).slice(2);
    const restoreDb = new TaskPlannerDatabase(restoreDbName);
    await restoreDb.open();

    await restoreBackupPayload(backup, restoreDb);

    const restoredSys = await restoreDb.systems.get(sys.id);
    expect(restoredSys).toBeDefined();
    expect(restoredSys?.name).toBe('Core System');
    expect(restoredSys?.code).toBe('CORE_SYS');

    await restoreDb.delete();
  });
});
