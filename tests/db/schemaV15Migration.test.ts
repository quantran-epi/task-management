import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Dexie from 'dexie';
import { TaskPlannerDatabase } from '../../src/db/index';
import { SCHEMA_V14, LATEST_SCHEMA_VERSION } from '../../src/db/schema';
import type { System } from '../../src/types/models';

describe('Dexie SCHEMA_V15 Migration & Data Transformation (ENT-SYS-01, ENT-CR-01)', () => {
  let dbName: string;

  beforeEach(() => {
    dbName = 'TestMigrationDB_' + Math.random().toString(36).slice(2);
  });

  afterEach(async () => {
    await Dexie.delete(dbName);
  });

  it('successfully upgrades from V14 to V15 and populates changeRequests from projects', async () => {
    // 1. Create a simulated V14 database and insert projects
    const v14Db = new Dexie(dbName);
    v14Db.version(14).stores(SCHEMA_V14);
    await v14Db.open();

    const sampleProjects = [
      {
        id: 'proj-1',
        name: 'Project One',
        description: 'First project',
        status: 'In Progress',
        createdAt: '2026-11-01T00:00:00.000Z',
        updatedAt: '2026-11-02T00:00:00.000Z',
      },
      {
        id: 'proj-2',
        name: 'Project Two',
        description: 'Second project',
        status: 'Done',
        createdAt: '2026-11-03T00:00:00.000Z',
        updatedAt: '2026-11-04T00:00:00.000Z',
      },
    ];

    await v14Db.table('projects').bulkAdd(sampleProjects);
    await v14Db.close();

    // 2. Open with TaskPlannerDatabase which registers V15
    const upgradedDb = new TaskPlannerDatabase(dbName);
    await upgradedDb.open();

    // Opening at the current version runs every later upgrade, so verno is the live schema.
    expect(upgradedDb.verno).toBe(LATEST_SCHEMA_VERSION);
    expect(upgradedDb.tables.map((t) => t.name)).toContain('systems');
    expect(upgradedDb.tables.map((t) => t.name)).toContain('changeRequests');

    // 3. Verify projects were migrated to changeRequests
    const crs = await upgradedDb.changeRequests.toArray();
    expect(crs).toHaveLength(2);

    const cr1 = await upgradedDb.changeRequests.get('proj-1');
    expect(cr1).toBeDefined();
    expect(cr1?.id).toBe('proj-1');
    expect(cr1?.name).toBe('Project One');
    expect(cr1?.description).toBe('First project');
    expect(cr1?.status).toBe('In Progress');
    expect(cr1?.type).toBe('ENHANCEMENT');
    expect(cr1?.targets).toEqual([]);
    expect(cr1?.createdAt).toBe('2026-11-01T00:00:00.000Z');
    expect(cr1?.updatedAt).toBe('2026-11-02T00:00:00.000Z');

    // 4. Verify systems table can store parent systems and child subsystems
    const parentSystem: System = {
      id: 'sys-parent',
      name: 'Core Banking',
      code: 'CORE_BANKING',
      parentId: null,
      type: 'LOGICAL_GROUP',
      description: 'Parent logical group for core banking',
      createdAt: '2026-11-07T00:00:00.000Z',
      updatedAt: '2026-11-07T00:00:00.000Z',
    };

    const childSystem: System = {
      id: 'sys-child',
      name: 'Credit Service',
      code: 'CREDIT_SVC',
      parentId: 'sys-parent',
      type: 'SERVICE',
      sshConfigId: 'ssh-cfg-1',
      remoteRepoPath: '/opt/repos/credit-service',
      defaultBaseBranch: 'develop',
      createdAt: '2026-11-07T00:00:00.000Z',
      updatedAt: '2026-11-07T00:00:00.000Z',
    };

    await upgradedDb.systems.bulkAdd([parentSystem, childSystem]);

    const retrievedParent = await upgradedDb.systems.get('sys-parent');
    expect(retrievedParent?.name).toBe('Core Banking');
    expect(retrievedParent?.type).toBe('LOGICAL_GROUP');

    const retrievedChild = await upgradedDb.systems.get('sys-child');
    expect(retrievedChild?.parentId).toBe('sys-parent');
    expect(retrievedChild?.type).toBe('SERVICE');
    expect(retrievedChild?.sshConfigId).toBe('ssh-cfg-1');

    await upgradedDb.close();
  });

  it('validates System and ChangeRequest input schemas correctly', async () => {
    const {
      SystemInputSchema,
      ChangeRequestInputSchema,
    } = await import('../../src/validation/schemas');

    // SystemInputSchema valid
    const validSys = SystemInputSchema.parse({
      name: 'Credit Core',
      code: 'CREDIT_CORE',
      type: 'SERVICE',
      parentId: null,
    });
    expect(validSys.name).toBe('Credit Core');
    expect(validSys.type).toBe('SERVICE');

    // SystemInputSchema invalid type
    expect(() =>
      SystemInputSchema.parse({
        name: 'Credit Core',
        code: 'CREDIT_CORE',
        type: 'INVALID_TYPE',
      })
    ).toThrow();

    // ChangeRequestInputSchema valid
    const validCr = ChangeRequestInputSchema.parse({
      name: 'CR-001 Add Interest Calculation',
      code: 'CR-001',
      type: 'NEW_FEATURE',
      targets: [
        { systemId: '11111111-1111-4111-8111-111111111111' },
        { systemId: '22222222-2222-4222-8222-222222222222' },
      ],
    });
    expect(validCr.name).toBe('CR-001 Add Interest Calculation');
    expect(validCr.type).toBe('NEW_FEATURE');
    expect(validCr.status).toBe('Open');
    expect(validCr.targets).toEqual([
      { systemId: '11111111-1111-4111-8111-111111111111' },
      { systemId: '22222222-2222-4222-8222-222222222222' },
    ]);

    // ChangeRequestInputSchema default type ENHANCEMENT
    const defaultCr = ChangeRequestInputSchema.parse({
      name: 'CR-002 Routine Update',
      code: 'CR-002',
    });
    expect(defaultCr.type).toBe('ENHANCEMENT');
    expect(defaultCr.targets).toEqual([]);
  });
});
