import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db/index';
import { createTask, getTask } from '../../src/db/repositories/taskRepo';
import { createChangeRequest } from '../../src/db/repositories/changeRequestRepo';
import {
  deleteTaskWithAllocations,
  deleteChangeRequestWithCascade,
  deleteCrMilestoneWithCascade,
} from '../../src/db/repositories/cascadeRepo';
import { createCrMilestone } from '../../src/db/repositories/crMilestoneRepo';
import { generateId } from '../../src/utils/uuid';
import type { Note, NoteEntityType } from '../../src/types/models';

/** Plan 03 widens NoteEntityType with 'crMilestone'; cast keeps this plan's tests compiling. */
function milestoneNote(id: string, milestoneId: string): Note {
  return {
    id,
    body: 'note on milestone',
    entityType: 'crMilestone' as NoteEntityType,
    entityId: milestoneId,
    isPinned: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('Atomic Cascade Deletion Transactions (D-13, D-14, D-16, WORK-05, T-02-03)', () => {
  let testDb: TaskPlannerDatabase;

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase('TestCascadeDB_' + Math.random().toString(36).slice(2));
    await testDb.open();
  });

  afterEach(async () => {
    await testDb.delete();
  });

  async function seedCr() {
    return createChangeRequest({ status: 'Open', targets: [], name: 'CR', code: 'CR-1', type: 'ENHANCEMENT' }, testDb);
  }

  describe('deleteTaskWithAllocations', () => {
    it('removes task and all associated allocations atomically', async () => {
      const cr = await seedCr();
      const task = await createTask({ name: 'Task With Allocs', crId: cr.id }, testDb);
      await testDb.plannedAllocations.bulkAdd([
        { id: generateId(), taskId: task.id, date: '2026-10-01', allocatedMinutes: 60 },
        { id: generateId(), taskId: task.id, date: '2026-10-02', allocatedMinutes: 60 },
      ]);

      await deleteTaskWithAllocations(task.id, testDb);

      expect(await getTask(task.id, testDb)).toBeUndefined();
      const allocs = await testDb.plannedAllocations.where('taskId').equals(task.id).toArray();
      expect(allocs).toHaveLength(0);
    });
  });

  describe('deleteChangeRequestWithCascade', () => {
    it('removes the CR, its child tasks and their allocations atomically', async () => {
      const cr = await seedCr();
      const survivorCr = await createChangeRequest(
        { status: 'Open', targets: [], name: 'Survivor', code: 'CR-KEEP', type: 'BUGFIX' },
        testDb
      );
      const doomed = await createTask({ name: 'Doomed', crId: cr.id }, testDb);
      const survivor = await createTask({ name: 'Survivor task', crId: survivorCr.id }, testDb);

      await testDb.plannedAllocations.bulkAdd([
        { id: generateId(), taskId: doomed.id, date: '2026-10-01', allocatedMinutes: 60 },
        { id: generateId(), taskId: survivor.id, date: '2026-10-01', allocatedMinutes: 30 },
      ]);

      await deleteChangeRequestWithCascade(cr.id, testDb);

      expect(await testDb.changeRequests.get(cr.id)).toBeUndefined();
      expect(await getTask(doomed.id, testDb)).toBeUndefined();
      expect(await testDb.plannedAllocations.where('taskId').equals(doomed.id).count()).toBe(0);

      expect(await testDb.changeRequests.get(survivorCr.id)).toBeDefined();
      expect(await getTask(survivor.id, testDb)).toBeDefined();
      expect(await testDb.plannedAllocations.where('taskId').equals(survivor.id).count()).toBe(1);
    });
  });

  describe('deleteCrMilestoneWithCascade', () => {
    it('clears task and note references but keeps the rows and the other milestone', async () => {
      const cr = await seedCr();
      const first = await createCrMilestone({ crId: cr.id, name: 'Go live 1' }, testDb);
      const second = await createCrMilestone({ crId: cr.id, name: 'Go live 2' }, testDb);
      const firstTask = await createTask(
        { name: 'Task 1', crId: cr.id, milestoneId: first.id },
        testDb
      );
      const secondTask = await createTask(
        { name: 'Task 2', crId: cr.id, milestoneId: second.id },
        testDb
      );
      const note = milestoneNote(generateId(), first.id);
      await testDb.notes.add(note);

      await deleteCrMilestoneWithCascade(first.id, testDb);

      expect(await testDb.crMilestones.get(first.id)).toBeUndefined();
      expect(await testDb.crMilestones.get(second.id)).toBeDefined();
      const survivedTask = await getTask(firstTask.id, testDb);
      expect(survivedTask).toBeDefined();
      expect(survivedTask).not.toHaveProperty('milestoneId');
      expect((await getTask(secondTask.id, testDb))?.milestoneId).toBe(second.id);
      const survivedNote = await testDb.notes.get(note.id);
      expect(survivedNote).toBeDefined();
      expect(survivedNote).not.toHaveProperty('entityType');
      expect(survivedNote).not.toHaveProperty('entityId');
    });
  });

  describe('deleteChangeRequestWithCascade (milestones)', () => {
    it('deletes CR milestones and detaches their notes', async () => {
      const cr = await seedCr();
      const milestone = await createCrMilestone({ crId: cr.id, name: 'Go live' }, testDb);
      const note = milestoneNote(generateId(), milestone.id);
      await testDb.notes.add(note);

      await deleteChangeRequestWithCascade(cr.id, testDb);

      expect(await testDb.crMilestones.where('crId').equals(cr.id).count()).toBe(0);
      const survivedNote = await testDb.notes.get(note.id);
      expect(survivedNote).toBeDefined();
      expect(survivedNote).not.toHaveProperty('entityType');
      expect(survivedNote).not.toHaveProperty('entityId');
    });
  });

  describe('Transaction rollback integrity', () => {
    it('rolls back completely if error occurs during deletion', async () => {
      const cr = await seedCr();
      const task = await createTask({ name: 'Safe Task', crId: cr.id }, testDb);

      await expect(
        testDb.transaction('rw', [testDb.changeRequests, testDb.tasks], async () => {
          await testDb.changeRequests.delete(cr.id);
          throw new Error('Simulated failure');
        })
      ).rejects.toThrow('Simulated failure');

      expect(await testDb.changeRequests.get(cr.id)).toBeDefined();
      expect(await getTask(task.id, testDb)).toBeDefined();
    });
  });
});
