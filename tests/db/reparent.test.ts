import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db/index';
import { createTask, getTask, reparentTask } from '../../src/db/repositories/taskRepo';
import { createChangeRequest } from '../../src/db/repositories/changeRequestRepo';
import { createSystem } from '../../src/db/repositories/systemRepo';

describe('Task Reparenting (WORK-04, D-09, D-10, T-02-02)', () => {
  let testDb: TaskPlannerDatabase;

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase('TestReparentDB_' + Math.random().toString(36).slice(2));
    await testDb.open();
  });

  afterEach(async () => {
    await testDb.delete();
  });

  async function seedCrWithTarget(name: string) {
    const parent = await createSystem(
      { name: `${name} Parent`, code: `${name.toUpperCase()}_P`, type: 'LOGICAL_GROUP' },
      testDb
    );
    const subsystem = await createSystem(
      { name: `${name} Sub`, code: `${name.toUpperCase()}_S`, type: 'SERVICE', parentId: parent.id },
      testDb
    );
    const cr = await createChangeRequest(
      {
        name,
        code: `${name.toUpperCase()}-1`,
        type: 'ENHANCEMENT',
        targets: [{ systemId: subsystem.id }],
      },
      testDb
    );
    return { cr, subsystem };
  }

  it('moves a task to CR level without changing task.id', async () => {
    const { cr } = await seedCrWithTarget('Alpha');
    const task = await createTask({ name: 'Standalone Task', crId: cr.id }, testDb);
    const originalId = task.id;

    const reparented = await reparentTask(task.id, cr.id, undefined, testDb);

    expect(reparented.id).toBe(originalId);
    expect(reparented.crId).toBe(cr.id);
    expect(reparented.systemId).toBeUndefined();

    const fetched = await getTask(originalId, testDb);
    expect(fetched?.crId).toBe(cr.id);
  });

  it('moves a task onto a target subsystem without changing task.id', async () => {
    const { cr, subsystem } = await seedCrWithTarget('Beta');
    const task = await createTask({ name: 'Task 1', crId: cr.id }, testDb);
    const originalId = task.id;

    const reparented = await reparentTask(task.id, cr.id, subsystem.id, testDb);

    expect(reparented.id).toBe(originalId);
    expect(reparented.crId).toBe(cr.id);
    expect(reparented.systemId).toBe(subsystem.id);
  });

  it('resets systemId to undefined when moving a task off its subsystem', async () => {
    const { cr, subsystem } = await seedCrWithTarget('Gamma');
    const task = await createTask(
      { name: 'Task with system', crId: cr.id, systemId: subsystem.id },
      testDb
    );

    const detached = await reparentTask(task.id, cr.id, undefined, testDb);

    expect(detached.id).toBe(task.id);
    expect(detached.crId).toBe(cr.id);
    expect(detached.systemId).toBeUndefined();
  });

  it('resets systemId when moving a task to a different CR without a target subsystem', async () => {
    const { cr: crA, subsystem: subsystemA } = await seedCrWithTarget('Delta');
    const { cr: crB } = await seedCrWithTarget('Epsilon');

    const task = await createTask(
      { name: 'Task from A', crId: crA.id, systemId: subsystemA.id },
      testDb
    );

    const reparented = await reparentTask(task.id, crB.id, undefined, testDb);

    expect(reparented.id).toBe(task.id);
    expect(reparented.crId).toBe(crB.id);
    expect(reparented.systemId).toBeUndefined();
  });

  it('rejects a target subsystem that is not one of the CR targets (T-31.2-01)', async () => {
    const { cr: crA } = await seedCrWithTarget('Zeta');
    const { subsystem: subsystemB } = await seedCrWithTarget('Eta');
    const task = await createTask({ name: 'Task', crId: crA.id }, testDb);

    await expect(reparentTask(task.id, crA.id, subsystemB.id, testDb)).rejects.toThrow();
  });

  it('throws error when reparenting non-existent task', async () => {
    const { cr } = await seedCrWithTarget('Theta');
    await expect(
      reparentTask('non-existent-uuid', cr.id, undefined, testDb)
    ).rejects.toThrow('Task not found');
  });
});
