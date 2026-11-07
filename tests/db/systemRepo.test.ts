import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db/index';
import {
  createSystem,
  updateSystem,
  getSystem,
  getAllSystems,
  getParentSystems,
  getSubsystems,
  deleteSystem,
  isLogicalParent,
  isSubsystem,
} from '../../src/db/repositories/systemRepo';
import type { ChangeRequest, Task } from '../../src/types/models';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

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
      { parentId: null,
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
      { parentId: null,
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
    // A parent is a LOGICAL_GROUP only — an unparented SERVICE is still a subsystem (D-24)
    const parentIds = parentSystems.map((s) => s.id);
    expect(parentIds).toContain(parent.id);
    expect(parentIds).not.toContain(standalone.id);
    expect(parentIds).not.toContain(child1.id);
    expect(parentIds).not.toContain(child2.id);

    const children = await getSubsystems(parent.id, db);
    expect(children).toHaveLength(2);
    expect(children.map((c) => c.id).sort()).toEqual([child1.id, child2.id].sort());
  });

  it('prevents deleting a system if child subsystems exist without cascade/force', async () => {
    const parent = await createSystem(
      { parentId: null,
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

    await expect(deleteSystem(parent.id, db)).rejects.toThrow(/Hệ thống còn 1 subsystem con/);

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
      { parentId: null,
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

  describe('D-24 invariants (ENT-NORM-02)', () => {
    it('classifies parent and subsystem through a single predicate', () => {
      expect(isLogicalParent({ type: 'LOGICAL_GROUP' })).toBe(true);
      expect(isLogicalParent({ type: 'SERVICE' })).toBe(false);
      expect(isSubsystem({ type: 'SERVICE' })).toBe(true);
      expect(isSubsystem({ type: 'LOGICAL_GROUP' })).toBe(false);
    });

    it(
      'getParentSystems returns only LOGICAL_GROUP rows',
      async () => {
        const parent = await createSystem(
          { parentId: null, name: 'Group', code: 'GRP', type: 'LOGICAL_GROUP' },
          db
        );
        const unparentedService = await createSystem(
          { parentId: null, name: 'Lonely service', code: 'LONE', type: 'SERVICE' },
          db
        );

        const parents = await getParentSystems(db);
        expect(parents.map((s) => s.id)).toEqual([parent.id]);
        expect(parents.map((s) => s.id)).not.toContain(unparentedService.id);
      },
      30000
    );

    it(
      'rejects a subsystem whose parent is not a LOGICAL_GROUP',
      async () => {
        const service = await createSystem(
          { parentId: null, name: 'Service', code: 'SVC', type: 'SERVICE' },
          db
        );

        await expect(
          createSystem(
            { name: 'Child', code: 'CHILD', type: 'SERVICE', parentId: service.id },
            db
          )
        ).rejects.toThrow('Subsystem phải trỏ tới một Logical Parent');
      },
      30000
    );

    it(
      'rejects a LOGICAL_GROUP carrying SSH/Repo fields',
      async () => {
        await expect(
          createSystem(
            { parentId: null,
              name: 'Bad parent',
              code: 'BAD_PARENT',
              type: 'LOGICAL_GROUP',
              sshConfigId: UUID_A,
            },
            db
          )
        ).rejects.toThrow('Hệ thống cha không được có SSH/Repo');
      },
      30000
    );

    it(
      'rejects a parentId cycle',
      async () => {
        const group = await createSystem(
          { parentId: null, name: 'Group', code: 'CYCLE_GRP', type: 'LOGICAL_GROUP' },
          db
        );

        await expect(
          updateSystem(group.id, { parentId: group.id }, db)
        ).rejects.toThrow('Không thể tạo vòng lặp phân cấp');
      },
      30000
    );

    it(
      'clears repo fields when a subsystem is promoted to a LOGICAL_GROUP',
      async () => {
        const group = await createSystem(
          { parentId: null, name: 'Group', code: 'PROMO_GRP', type: 'LOGICAL_GROUP' },
          db
        );
        const service = await createSystem(
          {
            name: 'Service',
            code: 'PROMO_SVC',
            type: 'SERVICE',
            parentId: group.id,
            sshConfigId: UUID_B,
            remoteRepoPath: '/repos/promo',
            defaultBaseBranch: 'main',
          },
          db
        );

        const promoted = await updateSystem(service.id, { type: 'LOGICAL_GROUP' }, db);

        expect(promoted.type).toBe('LOGICAL_GROUP');
        expect(promoted.parentId).toBeNull();
        expect(promoted).not.toHaveProperty('sshConfigId');
        expect(promoted).not.toHaveProperty('remoteRepoPath');
        expect(promoted).not.toHaveProperty('defaultBaseBranch');
      },
      30000
    );

    it(
      'deleteSystem on a subsystem removes it from CR targets and clears task systemId',
      async () => {
        const group = await createSystem(
          { parentId: null, name: 'Group', code: 'DEL_GRP', type: 'LOGICAL_GROUP' },
          db
        );
        const subsystem = await createSystem(
          { name: 'Subsystem', code: 'DEL_SVC', type: 'SERVICE', parentId: group.id },
          db
        );

        const cr: ChangeRequest = {
          id: UUID_A,
          name: 'CR',
          code: 'CR-1',
          status: 'Open',
          type: 'ENHANCEMENT',
          targets: [{ systemId: subsystem.id, featureBranch: 'feature/CR-1' }],
          createdAt: '2026-11-07T00:00:00.000Z',
          updatedAt: '2026-11-07T00:00:00.000Z',
        };
        await db.changeRequests.add(cr);

        const task: Task = {
          id: UUID_B,
          name: 'Task',
          crId: cr.id,
          systemId: subsystem.id,
          status: 'Open',
          progress: 0,
          priority: 'Medium',
          estimateMinutes: 0,
          workType: 'code',
          createdAt: '2026-11-07T00:00:00.000Z',
          updatedAt: '2026-11-07T00:00:00.000Z',
        };
        await db.tasks.add(task);

        await deleteSystem(subsystem.id, db);

        const crAfter = await db.changeRequests.get(cr.id);
        expect(crAfter?.targets).toEqual([]);

        const taskAfter = await db.tasks.get(task.id);
        expect(taskAfter).toBeDefined();
        expect(taskAfter).not.toHaveProperty('systemId');
      },
      30000
    );
  });
});
