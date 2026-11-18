// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db/index';
import {
  createChangeRequest,
  updateChangeRequest,
  getChangeRequest,
  getAllChangeRequests,
} from '../../src/db/repositories/changeRequestRepo';
import {
  createSystem,
  getSystem,
  getAllSystems,
  getParentSystems,
  getSubsystems,
} from '../../src/db/repositories/systemRepo';
import {
  createTask,
  updateTask,
  getTask,
  getTasksByCr,
  getTasksBySystem,
  getAllTasks,
  updateTaskStatus,
  updateTaskProgress,
} from '../../src/db/repositories/taskRepo';
import {
  getDistinctOpsOwners,
  getDistinctBusinessAnalysts,
} from '../../src/db/repositories/tagRepo';
import {
  ChangeRequestInputSchema,
  SystemInputSchema,
  TaskInputSchema,
} from '../../src/validation/schemas';

describe('System, ChangeRequest & Task Repositories & Schemas (ENT-NORM-01, ENT-NORM-02)', () => {
  let testDb: TaskPlannerDatabase;

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase('TestReposDB_' + Math.random().toString(36).slice(2));
    await testDb.open();
  });

  afterEach(async () => {
    await testDb.delete();
  });

  async function seedSubsystem(code = 'CORE_SVC') {
    const parent = await createSystem(
      { parentId: null, name: `${code} Parent`, code: `${code}_P`, type: 'LOGICAL_GROUP' },
      testDb
    );
    const subsystem = await createSystem(
      { name: `${code} Sub`, code, type: 'SERVICE', parentId: parent.id },
      testDb
    );
    return { parent, subsystem };
  }

  describe('System Schema & Repo', () => {
    it('validates system input schema', () => {
      expect(() => SystemInputSchema.parse({ name: '', code: 'X' })).toThrow();
      expect(() => SystemInputSchema.parse({ name: 'S', code: '' })).toThrow();
      expect(() => SystemInputSchema.parse({ name: 'S', code: 'X', type: 'INVALID' })).toThrow();
    });

    it('creates a system with generated UUID and valid defaults', async () => {
      const system = await createSystem(
        { parentId: null, name: 'Core Banking', code: 'CORE_BANKING', type: 'LOGICAL_GROUP' },
        testDb
      );

      expect(system.id).toBeDefined();
      expect(system.name).toBe('Core Banking');
      expect(system.code).toBe('CORE_BANKING');
      expect(system.type).toBe('LOGICAL_GROUP');
      expect(system.parentId).toBeNull();
      expect(system.createdAt).toBeDefined();

      const fetched = await getSystem(system.id, testDb);
      expect(fetched?.id).toBe(system.id);
    });

    it('classifies parents without the parentId heuristic (H1)', async () => {
      const { parent, subsystem } = await seedSubsystem('ACCT_SVC');
      const orphanSubsystem = await createSystem(
        { parentId: null, name: 'Orphan Sub', code: 'ORPHAN_SVC', type: 'SERVICE' },
        testDb
      );

      const parents = await getParentSystems(testDb);
      expect(parents.map((s) => s.id)).toEqual([parent.id]);

      const children = await getSubsystems(parent.id, testDb);
      expect(children.map((s) => s.id)).toEqual([subsystem.id]);
      expect(orphanSubsystem.type).toBe('SERVICE');
    });

    it('lists all systems', async () => {
      await seedSubsystem('S1');
      await seedSubsystem('S2');
      expect(await getAllSystems(testDb)).toHaveLength(4);
    });
  });

  describe('ChangeRequest Schema & Repo', () => {
    it('validates CR input schema and requires a code', () => {
      expect(() => ChangeRequestInputSchema.parse({ name: '' })).toThrow();
      expect(() => ChangeRequestInputSchema.parse({ name: 'n' })).toThrow();

      const valid = ChangeRequestInputSchema.parse({
        name: 'Add interest calculation',
        code: 'cr-001',
        deadline: '2026-10-01',
        description: 'Product launch',
        status: 'In Progress',
      });
      expect(valid.name).toBe('Add interest calculation');
      expect(valid.code).toBe('CR-001');
      expect(valid.status).toBe('In Progress');
    });

    it('creates a CR with generated UUID and valid defaults', async () => {
      const cr = await createChangeRequest(
        { status: 'Open', type: 'ENHANCEMENT', targets: [], name: 'Core Architecture', code: 'CR-ARCH', deadline: '2026-12-31' },
        testDb
      );

      expect(cr.id).toBeDefined();
      expect(cr.name).toBe('Core Architecture');
      expect(cr.status).toBe('Open');
      expect(cr.type).toBe('ENHANCEMENT');
      expect(cr.targets).toEqual([]);
      expect(cr.deadline).toBe('2026-12-31');

      const fetched = await getChangeRequest(cr.id, testDb);
      expect(fetched?.name).toBe('Core Architecture');
    });

    it('rejects an invalid deadline format when creating a CR', async () => {
      await expect(
        createChangeRequest({ status: 'Open', type: 'ENHANCEMENT', targets: [], name: 'Bad Date', code: 'CR-BAD', deadline: '2026/12/31' }, testDb)
      ).rejects.toThrow();
    });

    it('updates CR fields and refreshes updatedAt', async () => {
      const cr = await createChangeRequest({ status: 'Open', type: 'ENHANCEMENT', targets: [], name: 'Alpha', code: 'CR-A' }, testDb);
      const originalUpdatedAt = cr.updatedAt;

      await new Promise((r) => setTimeout(r, 5));

      const updated = await updateChangeRequest(
        cr.id,
        { name: 'Alpha v2', status: 'In Progress' },
        testDb
      );

      expect(updated.name).toBe('Alpha v2');
      expect(updated.status).toBe('In Progress');
      expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(originalUpdatedAt).getTime()
      );
    });

    it('gets all change requests', async () => {
      await createChangeRequest({ status: 'Open', type: 'ENHANCEMENT', targets: [], name: 'C1', code: 'CR-1' }, testDb);
      await createChangeRequest({ status: 'Open', type: 'ENHANCEMENT', targets: [], name: 'C2', code: 'CR-2' }, testDb);
      expect(await getAllChangeRequests(testDb)).toHaveLength(2);
    });

    it('creates and updates a CR with opsOwners and businessAnalysts', async () => {
      const cr = await createChangeRequest(
        { status: 'Open', type: 'ENHANCEMENT', targets: [],
          name: 'Banking CR',
          code: 'CR-BANK',
          opsOwners: ['ops-infra', 'ops-db'],
          businessAnalysts: ['ba-alice'],
        },
        testDb
      );

      expect(cr.opsOwners).toEqual(['ops-infra', 'ops-db']);
      expect(cr.businessAnalysts).toEqual(['ba-alice']);

      const updated = await updateChangeRequest(
        cr.id,
        { opsOwners: ['ops-security'], businessAnalysts: ['ba-bob', 'ba-carol'] },
        testDb
      );

      expect(updated.opsOwners).toEqual(['ops-security']);
      expect(updated.businessAnalysts).toEqual(['ba-bob', 'ba-carol']);
    });
  });

  describe('Task Schema & Repo (ENT-NORM-01, D-26)', () => {
    it('validates task input schema with defaults', async () => {
      const { subsystem } = await seedSubsystem('DEF_SVC');
      const cr = await createChangeRequest(
        { status: 'Open', type: 'ENHANCEMENT', name: 'CR', code: 'CR-DEF', targets: [{ systemId: subsystem.id }] },
        testDb
      );

      const parsed = TaskInputSchema.parse({ name: 'Quick Task', crId: cr.id });
      expect(parsed.name).toBe('Quick Task');
      expect(parsed.status).toBe('Open');
      expect(parsed.progress).toBe(0);
      expect(parsed.priority).toBe('Medium');
      expect(parsed.estimateMinutes).toBe(0);
    });

    it('rejects invalid document links', async () => {
      const { subsystem } = await seedSubsystem('LINK_SVC');
      const cr = await createChangeRequest(
        { status: 'Open', type: 'ENHANCEMENT', name: 'CR', code: 'CR-LINK', targets: [{ systemId: subsystem.id }] },
        testDb
      );

      expect(() =>
        TaskInputSchema.parse({ name: 'Task', crId: cr.id, documentLinks: ['ftp://bad-link.com'] })
      ).toThrow();

      const valid = TaskInputSchema.parse({
        name: 'Task',
        crId: cr.id,
        documentLinks: ['https://example.com/spec', 'http://localhost:3000'],
      });
      expect(valid.documentLinks).toHaveLength(2);
    });

    it('creates a CR-level task with no systemId', async () => {
      const cr = await createChangeRequest({ status: 'Open', type: 'ENHANCEMENT', targets: [], name: 'CR', code: 'CR-T1' }, testDb);
      const task = await createTask({ name: 'Standalone Task', crId: cr.id }, testDb);

      expect(task.id).toBeDefined();
      expect(task.crId).toBe(cr.id);
      expect(task.systemId).toBeUndefined();
      expect(task.status).toBe('Open');

      const fetched = await getTask(task.id, testDb);
      expect(fetched?.name).toBe('Standalone Task');
    });

    it('creates a subsystem-scoped task and queries by crId and systemId', async () => {
      const { subsystem } = await seedSubsystem('SCOPE_SVC');
      const cr = await createChangeRequest(
        { status: 'Open', type: 'ENHANCEMENT', name: 'CR', code: 'CR-SCOPE', targets: [{ systemId: subsystem.id }] },
        testDb
      );

      const task = await createTask(
        { name: 'Scoped Task', crId: cr.id, systemId: subsystem.id },
        testDb
      );

      expect(task.crId).toBe(cr.id);
      expect(task.systemId).toBe(subsystem.id);

      const byCr = await getTasksByCr(cr.id, testDb);
      expect(byCr.map((t) => t.id)).toEqual([task.id]);
      const bySystem = await getTasksBySystem(subsystem.id, testDb);
      expect(bySystem.map((t) => t.id)).toEqual([task.id]);
    });

    it('updates task status across all 6 valid statuses per TASK-03', async () => {
      const cr = await createChangeRequest({ status: 'Open', type: 'ENHANCEMENT', targets: [], name: 'CR', code: 'CR-ST' }, testDb);
      const task = await createTask({ name: 'Status Workflow', crId: cr.id }, testDb);
      const statuses = ['In Progress', 'Resolved', 'In Review', 'Done', 'Cancelled', 'Open'] as const;

      for (const st of statuses) {
        const updated = await updateTaskStatus(task.id, st, testDb);
        expect(updated.status).toBe(st);
      }
    });

    it('preserves a soft-cancelled task in the DB per D-15', async () => {
      const cr = await createChangeRequest({ status: 'Open', type: 'ENHANCEMENT', targets: [], name: 'CR', code: 'CR-CAN' }, testDb);
      const task = await createTask({ name: 'Cancelled Task', crId: cr.id }, testDb);
      await updateTaskStatus(task.id, 'Cancelled', testDb);

      const fetched = await getTask(task.id, testDb);
      expect(fetched).toBeDefined();
      expect(fetched?.status).toBe('Cancelled');
    });

    it('updates task progress as an integer clamped between 0 and 100', async () => {
      const cr = await createChangeRequest({ status: 'Open', type: 'ENHANCEMENT', targets: [], name: 'CR', code: 'CR-PROG' }, testDb);
      const task = await createTask({ name: 'Progress Task', crId: cr.id }, testDb);

      expect((await updateTaskProgress(task.id, 50, testDb)).progress).toBe(50);
      await expect(updateTaskProgress(task.id, -10, testDb)).rejects.toThrow();
      await expect(updateTaskProgress(task.id, 110, testDb)).rejects.toThrow();
    });

    it('updates general task fields and fetches all tasks', async () => {
      const cr = await createChangeRequest({ status: 'Open', type: 'ENHANCEMENT', targets: [], name: 'CR', code: 'CR-UPD' }, testDb);
      const task = await createTask({ name: 'Original', crId: cr.id }, testDb);

      const updated = await updateTask(
        task.id,
        { name: 'Renamed', description: 'Added details', priority: 'Urgent', estimateMinutes: 180 },
        testDb
      );

      expect(updated.name).toBe('Renamed');
      expect(updated.description).toBe('Added details');
      expect(updated.priority).toBe('Urgent');
      expect(updated.estimateMinutes).toBe(180);
      expect((await getAllTasks(testDb)).length).toBeGreaterThanOrEqual(1);
    });

    it('clears optional task detail fields when explicitly patched as undefined', async () => {
      const cr = await createChangeRequest({ status: 'Open', type: 'ENHANCEMENT', targets: [], name: 'CR', code: 'CR-CLR' }, testDb);
      const task = await createTask(
        {
          name: 'Clear me',
          crId: cr.id,
          deadline: '2026-10-02',
          notes: 'remove this',
          actualStartDate: '2026-10-01',
          actualEndDate: '2026-10-02',
          documentLinks: ['https://example.com/spec'],
          opsOwners: ['ops-one'],
          businessAnalysts: ['ba-one'],
        },
        testDb
      );

      const updated = await updateTask(
        task.id,
        {
          deadline: undefined,
          notes: undefined,
          actualStartDate: undefined,
          actualEndDate: undefined,
          documentLinks: undefined,
          opsOwners: undefined,
          businessAnalysts: undefined,
        },
        testDb
      );

      expect(updated.deadline).toBeUndefined();
      expect(updated.notes).toBeUndefined();
      expect(updated.actualStartDate).toBeUndefined();
      expect(updated.actualEndDate).toBeUndefined();
      expect(updated.documentLinks).toBeUndefined();
      expect(updated.opsOwners).toBeUndefined();
      expect(updated.businessAnalysts).toBeUndefined();
      expect(await getTask(task.id, testDb)).toMatchObject(updated);
    });

    it('defaults workType to "code" and updates workType, opsOwners, businessAnalysts', async () => {
      const cr = await createChangeRequest({ status: 'Open', type: 'ENHANCEMENT', targets: [], name: 'CR', code: 'CR-WT' }, testDb);
      const task = await createTask({ name: 'Banking Task', crId: cr.id }, testDb);
      expect(task.workType).toBe('code');

      const withFields = await createTask(
        {
          name: 'Explicit Fields Task',
          crId: cr.id,
          workType: 'investigate',
          opsOwners: ['ops-infra'],
          businessAnalysts: ['ba-frank'],
        },
        testDb
      );
      expect(withFields.workType).toBe('investigate');

      const updated = await updateTask(
        withFields.id,
        { workType: 'review_code', opsOwners: ['ops-core'], businessAnalysts: ['ba-grace'] },
        testDb
      );
      expect(updated.workType).toBe('review_code');
      expect(updated.opsOwners).toEqual(['ops-core']);
      expect(updated.businessAnalysts).toEqual(['ba-grace']);
    });
  });

  describe('Tag Repository (getDistinctOpsOwners, getDistinctBusinessAnalysts)', () => {
    it('returns empty array when no tags are present', async () => {
      expect(await getDistinctOpsOwners(testDb)).toEqual([]);
      expect(await getDistinctBusinessAnalysts(testDb)).toEqual([]);
    });

    it('queries distinct Ops Owners across changeRequests and tasks and sorts alphabetically', async () => {
      const cr = await createChangeRequest(
        { status: 'Open', type: 'ENHANCEMENT', targets: [], name: 'CR P', code: 'CR-TAG', opsOwners: ['Ops-Beta', 'Ops-Alpha'] },
        testDb
      );
      await createTask(
        { name: 'Task T', crId: cr.id, opsOwners: ['Ops-Delta', 'Ops-Alpha'] },
        testDb
      );

      expect(await getDistinctOpsOwners(testDb)).toEqual(['Ops-Alpha', 'Ops-Beta', 'Ops-Delta']);
    });

    it('queries distinct Business Analysts across changeRequests and tasks', async () => {
      const cr = await createChangeRequest(
        { status: 'Open', type: 'ENHANCEMENT', targets: [], name: 'CR P2', code: 'CR-TAG2', businessAnalysts: ['BA-Zoe', 'BA-Alex'] },
        testDb
      );
      await createTask({ name: 'Task T2', crId: cr.id, businessAnalysts: ['BA-Charlie'] }, testDb);

      expect(await getDistinctBusinessAnalysts(testDb)).toEqual([
        'BA-Alex',
        'BA-Charlie',
        'BA-Zoe',
      ]);
    });

  });
});
