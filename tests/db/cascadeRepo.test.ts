import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db/index';
import { createTask, getTask } from '../../src/db/repositories/taskRepo';
import { createChangeRequest } from '../../src/db/repositories/changeRequestRepo';
import { deleteTaskWithAllocations } from '../../src/db/repositories/cascadeRepo';
import { generateId } from '../../src/utils/uuid';

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
    return createChangeRequest({ name: 'CR', code: 'CR-1', type: 'ENHANCEMENT' }, testDb);
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
