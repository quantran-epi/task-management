import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db/index';
import {
  createChangeRequest,
  updateChangeRequest,
  getChangeRequest,
  getAllChangeRequests,
  getChangeRequestsBySystem,
  deleteChangeRequest,
  removeSubsystemFromChangeRequest,
} from '../../src/db/repositories/changeRequestRepo';
import { createSystem } from '../../src/db/repositories/systemRepo';
import type { Task } from '../../src/types/models';

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

  async function seedGroupAndSubsystems() {
    const group = await createSystem(
      { parentId: null, name: 'Core Banking', code: 'CORE', type: 'LOGICAL_GROUP' },
      db
    );
    const subA = await createSystem(
      { name: 'Account Service', code: 'ACCT_SVC', type: 'SERVICE', parentId: group.id },
      db
    );
    const subB = await createSystem(
      { name: 'Credit Service', code: 'CREDIT_SVC', type: 'SERVICE', parentId: group.id },
      db
    );
    return { group, subA, subB };
  }

  it('creates, retrieves, and updates change requests with targets and types', async () => {
    const { subA, subB } = await seedGroupAndSubsystems();

    const cr = await createChangeRequest(
      {
        name: 'CR-2026-001 Auto Loan Rate Calculation',
        code: 'CR-001',
        description: 'New feature to calculate floating interest rate',
        type: 'NEW_FEATURE',
        status: 'In Progress',
        targets: [{ systemId: subA.id }, { systemId: subB.id }],
      },
      db
    );

    expect(cr.id).toBeDefined();
    expect(cr.name).toBe('CR-2026-001 Auto Loan Rate Calculation');
    expect(cr.code).toBe('CR-001');
    expect(cr.type).toBe('NEW_FEATURE');
    expect(cr.status).toBe('In Progress');
    expect(cr.targets).toEqual([
      { systemId: subA.id, featureBranch: 'feature/CR-001' },
      { systemId: subB.id, featureBranch: 'feature/CR-001' },
    ]);

    const fetched = await getChangeRequest(cr.id, db);
    expect(fetched).toEqual(cr);

    const updated = await updateChangeRequest(
      cr.id,
      { status: 'Done', targets: [{ systemId: subA.id }] },
      db
    );

    expect(updated.status).toBe('Done');
    expect(updated.targets).toEqual([{ systemId: subA.id, featureBranch: 'feature/CR-001' }]);
    expect(updated.updatedAt >= cr.updatedAt).toBe(true);
  }, 30000);

  it('filters change requests by target system', async () => {
    const { subA, subB } = await seedGroupAndSubsystems();
    const subC = await createSystem(
      { parentId: null, name: 'Audit Worker', code: 'AUDIT_WRK', type: 'WORKER' },
      db
    );

    await createChangeRequest(
      { status: 'Open',
        name: 'CR 1',
        code: 'CR-1',
        type: 'ENHANCEMENT',
        targets: [{ systemId: subA.id }, { systemId: subB.id }],
      },
      db
    );

    await createChangeRequest(
      { status: 'Open',
        name: 'CR 2',
        code: 'CR-2',
        type: 'BUGFIX',
        targets: [{ systemId: subB.id }, { systemId: subC.id }],
      },
      db
    );

    await createChangeRequest(
      { status: 'Open',
        name: 'CR 3',
        code: 'CR-3',
        type: 'NEW_FEATURE',
        targets: [{ systemId: subA.id }],
      },
      db
    );

    const forSysA = await getChangeRequestsBySystem(subA.id, db);
    expect(forSysA).toHaveLength(2);
    expect(forSysA.map((c) => c.name).sort()).toEqual(['CR 1', 'CR 3'].sort());

    const forSysB = await getChangeRequestsBySystem(subB.id, db);
    expect(forSysB).toHaveLength(2);
    expect(forSysB.map((c) => c.name).sort()).toEqual(['CR 1', 'CR 2'].sort());

    const forSysC = await getChangeRequestsBySystem(subC.id, db);
    expect(forSysC).toHaveLength(1);
    expect(forSysC[0]!.name).toBe('CR 2');
  }, 30000);

  it('deletes change request and cascade cleans up related items', async () => {
    const cr = await createChangeRequest(
      { status: 'Open', targets: [], name: 'Temporary CR', code: 'CR-TMP', type: 'ENHANCEMENT' },
      db
    );

    await deleteChangeRequest(cr.id, db);
    const fetched = await getChangeRequest(cr.id, db);
    expect(fetched).toBeUndefined();
  }, 30000);

  it('exports and restores changeRequests correctly via backup services', async () => {
    const { exportBackupPayload } = await import('../../src/services/backup/exportBackup');
    const { restoreBackupPayload } = await import('../../src/services/backup/restoreBackup');

    const { subA, subB } = await seedGroupAndSubsystems();

    const cr = await createChangeRequest(
      {
        name: 'Feature X',
        code: 'CR-X',
        type: 'NEW_FEATURE',
        status: 'In Progress',
        targets: [{ systemId: subA.id }, { systemId: subB.id }],
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
    expect(restoredCr?.targets).toEqual([
      { systemId: subA.id, featureBranch: 'feature/CR-X' },
      { systemId: subB.id, featureBranch: 'feature/CR-X' },
    ]);

    await restoreDb.delete();
  }, 30000);

  describe('target validation and featureBranch defaulting (ENT-NORM-02, D-25)', () => {
    it('rejects a LOGICAL_GROUP as a target', async () => {
      const { group } = await seedGroupAndSubsystems();

      await expect(
        createChangeRequest(
          {
            name: 'n',
            code: 'CR-1',
            type: 'BUGFIX',
            status: 'Open',
            targets: [{ systemId: group.id }],
          },
          db
        )
      ).rejects.toThrow('Chỉ được gắn subsystem vào CR');
    }, 30000);

    it('rejects a target that does not exist', async () => {
      await expect(
        createChangeRequest(
          {
            name: 'n',
            code: 'CR-1',
            type: 'BUGFIX',
            status: 'Open',
            targets: [{ systemId: '99999999-9999-4999-8999-999999999999' }],
          },
          db
        )
      ).rejects.toThrow('Subsystem không tồn tại.');
    }, 30000);

    it('defaults featureBranch to feature/{code}', async () => {
      const { subA } = await seedGroupAndSubsystems();

      const cr = await createChangeRequest(
        { name: 'n', code: 'CR-7', type: 'BUGFIX', status: 'Open', targets: [{ systemId: subA.id }] },
        db
      );

      expect(cr.targets[0]?.featureBranch).toBe('feature/CR-7');
    }, 30000);

    it('keeps an explicit featureBranch', async () => {
      const { subA } = await seedGroupAndSubsystems();

      const cr = await createChangeRequest(
        {
          name: 'n',
          code: 'CR-8',
          type: 'BUGFIX',
          status: 'Open',
          targets: [{ systemId: subA.id, featureBranch: 'hotfix/x' }],
        },
        db
      );

      expect(cr.targets[0]?.featureBranch).toBe('hotfix/x');
    }, 30000);

    it('does not rewrite stored featureBranch when only code changes', async () => {
      const { subA } = await seedGroupAndSubsystems();

      const cr = await createChangeRequest(
        { name: 'n', code: 'CR-9', type: 'BUGFIX', status: 'Open', targets: [{ systemId: subA.id }] },
        db
      );
      expect(cr.targets[0]?.featureBranch).toBe('feature/CR-9');

      const renamed = await updateChangeRequest(cr.id, { code: 'CR-10' }, db);
      expect(renamed.code).toBe('CR-10');
      expect(renamed.targets[0]?.featureBranch).toBe('feature/CR-9');
    }, 30000);

    it('removeSubsystemFromChangeRequest drops the target and clears task systemId', async () => {
      const { subA, subB } = await seedGroupAndSubsystems();

      const cr = await createChangeRequest(
        { status: 'Open',
          name: 'n',
          code: 'CR-11',
          type: 'ENHANCEMENT',
          targets: [{ systemId: subA.id }, { systemId: subB.id }],
        },
        db
      );

      const task: Task = {
        id: '33333333-3333-4333-8333-333333333333',
        name: 'Do the thing',
        crId: cr.id,
        systemId: subA.id,
        status: 'Open',
        progress: 0,
        priority: 'Medium',
        estimateMinutes: 0,
        workType: 'code',
        createdAt: '2026-11-07T00:00:00.000Z',
        updatedAt: '2026-11-07T00:00:00.000Z',
      };
      await db.tasks.add(task);

      await removeSubsystemFromChangeRequest(cr.id, subA.id, db);

      const crAfter = await db.changeRequests.get(cr.id);
      expect(crAfter?.targets.map((t) => t.systemId)).toEqual([subB.id]);

      const taskAfter = await db.tasks.get(task.id);
      expect(taskAfter).toBeDefined();
      expect(taskAfter).not.toHaveProperty('systemId');
    }, 30000);
  });

  it('lists all change requests', async () => {
    await createChangeRequest({ status: 'Open', targets: [], name: 'One', code: 'CR-ONE', type: 'ENHANCEMENT' }, db);
    await createChangeRequest({ status: 'Open', targets: [], name: 'Two', code: 'CR-TWO', type: 'BUGFIX' }, db);

    const all = await getAllChangeRequests(db);
    expect(all.map((c) => c.name).sort()).toEqual(['One', 'Two']);
  }, 30000);
});
