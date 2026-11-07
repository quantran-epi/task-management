import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db/index';
import {
  createTask,
  updateTask,
  getTask,
  getTasksByCr,
  getTasksBySystem,
} from '../../src/db/repositories/taskRepo';
import { createSystem } from '../../src/db/repositories/systemRepo';
import { createChangeRequest } from '../../src/db/repositories/changeRequestRepo';
import { deleteChangeRequestWithCascade } from '../../src/db/repositories/cascadeRepo';
import type { ChatThread, Note } from '../../src/types/models';

/**
 * Wave 0 suite for the CR-scoped task model (ENT-NORM-01, D-26).
 * RED until plan 31.2-03 lands `assertSystemInCrTargets` and the CR cascade.
 */

const NOW = '2026-11-07T00:00:00.000Z';

describe('Task Repository — CR axis (ENT-NORM-01)', () => {
  let db: TaskPlannerDatabase;
  let dbName: string;

  beforeEach(async () => {
    dbName = 'TestTaskRepoDB_' + Math.random().toString(36).slice(2);
    db = new TaskPlannerDatabase(dbName);
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  async function seedCrWithTargets() {
    const group = await createSystem(
      { name: 'Core Banking', code: 'CORE', type: 'LOGICAL_GROUP' },
      db
    );
    const targetSub = await createSystem(
      { name: 'Account Service', code: 'ACCT_SVC', type: 'SERVICE', parentId: group.id },
      db
    );
    const otherSub = await createSystem(
      { name: 'Credit Service', code: 'CREDIT_SVC', type: 'SERVICE', parentId: group.id },
      db
    );

    const cr = await createChangeRequest(
      {
        name: 'CR',
        code: 'CR-1',
        type: 'ENHANCEMENT',
        targets: [{ systemId: targetSub.id }],
      },
      db
    );

    return { group, targetSub, otherSub, cr };
  }

  it('requires crId', async () => {
    await expect(createTask({ name: 't' }, db)).rejects.toThrow();
  }, 30000);

  it('rejects a systemId outside the CR targets', async () => {
    const { cr, otherSub } = await seedCrWithTargets();

    await expect(
      createTask({ name: 't', crId: cr.id, systemId: otherSub.id }, db)
    ).rejects.toThrow('Subsystem của tác vụ phải thuộc CR đã chọn.');
  }, 30000);

  it('accepts a systemId that is a CR target', async () => {
    const { cr, targetSub } = await seedCrWithTargets();

    const task = await createTask({ name: 't', crId: cr.id, systemId: targetSub.id }, db);

    expect(task.crId).toBe(cr.id);
    expect(task.systemId).toBe(targetSub.id);
    expect(task).not.toHaveProperty('projectId');
    expect(task).not.toHaveProperty('milestoneId');
  }, 30000);

  it('rejects updateTask moving systemId outside the CR targets', async () => {
    const { cr, targetSub, otherSub } = await seedCrWithTargets();
    const task = await createTask({ name: 't', crId: cr.id, systemId: targetSub.id }, db);

    await expect(updateTask(task.id, { systemId: otherSub.id }, db)).rejects.toThrow(
      'Subsystem của tác vụ phải thuộc CR đã chọn.'
    );
  }, 30000);

  it('scopes task queries by crId and systemId', async () => {
    const { cr, targetSub } = await seedCrWithTargets();
    const secondCr = await createChangeRequest(
      { name: 'CR 2', code: 'CR-2', type: 'BUGFIX', targets: [{ systemId: targetSub.id }] },
      db
    );

    const first = await createTask({ name: 'first', crId: cr.id, systemId: targetSub.id }, db);
    const second = await createTask({ name: 'second', crId: secondCr.id }, db);

    const byCr = await getTasksByCr(cr.id, db);
    expect(byCr.map((t) => t.id)).toEqual([first.id]);

    const bySystem = await getTasksBySystem(targetSub.id, db);
    expect(bySystem.map((t) => t.id)).toEqual([first.id]);

    const fetched = await getTask(second.id, db);
    expect(fetched?.crId).toBe(secondCr.id);
  }, 30000);

  it('deleteChangeRequestWithCascade removes the CR, its tasks, note links and chat threads', async () => {
    const { cr, targetSub } = await seedCrWithTargets();
    const survivorCr = await createChangeRequest(
      { name: 'Survivor', code: 'CR-KEEP', type: 'BUGFIX', targets: [{ systemId: targetSub.id }] },
      db
    );

    const doomedTask = await createTask({ name: 'doomed', crId: cr.id, systemId: targetSub.id }, db);
    const survivingTask = await createTask({ name: 'survivor', crId: survivorCr.id }, db);

    const note: Note = {
      id: '44444444-4444-4444-8444-444444444444',
      entityType: 'cr',
      entityId: cr.id,
      body: 'linked note',
      isPinned: false,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await db.notes.add(note);

    const thread: ChatThread = {
      id: '55555555-5555-4555-8555-555555555555',
      scopeKey: `cr:${cr.id}`,
      scopeType: 'cr',
      entityId: cr.id,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await db.chatThreads.add(thread);

    await deleteChangeRequestWithCascade(cr.id, db);

    expect(await db.changeRequests.get(cr.id)).toBeUndefined();
    expect(await db.tasks.get(doomedTask.id)).toBeUndefined();
    expect(await db.tasks.get(survivingTask.id)).toBeDefined();
    expect(await db.changeRequests.get(survivorCr.id)).toBeDefined();

    const noteAfter = await db.notes.get(note.id);
    expect(noteAfter).toBeDefined();
    expect(noteAfter).not.toHaveProperty('entityType');
    expect(noteAfter).not.toHaveProperty('entityId');

    expect(await db.chatThreads.get(thread.id)).toBeUndefined();
  }, 30000);
});
