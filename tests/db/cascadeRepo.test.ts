import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db/index';
import { createProject, getProject } from '../../src/db/repositories/projectRepo';
import { createMilestone, getMilestone } from '../../src/db/repositories/milestoneRepo';
import { createTask, getTask } from '../../src/db/repositories/taskRepo';
import {
  deleteProjectWithCascade,
  deleteMilestoneWithCascade,
  deleteTaskWithAllocations,
} from '../../src/db/repositories/cascadeRepo';
import { generateId } from '../../src/utils/uuid';
import type { PlannedAllocation } from '../../src/types/models';

describe('Atomic Cascade Deletion Transactions (D-13, D-14, D-16, WORK-05, T-02-03)', () => {
  let testDb: TaskPlannerDatabase;

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase('TestCascadeDB_' + Math.random().toString(36).slice(2));
    await testDb.open();
  });

  afterEach(async () => {
    await testDb.delete();
  });

  describe('deleteProjectWithCascade', () => {
    it('cascade mode removes project, child milestones, child tasks, and allocations atomically', async () => {
      const project = await createProject({ name: 'Project Alpha' }, testDb);
      const milestone = await createMilestone({ projectId: project.id, name: 'Milestone 1' }, testDb);
      const task1 = await createTask({ name: 'Task In Milestone', projectId: project.id, milestoneId: milestone.id }, testDb);
      const task2 = await createTask({ name: 'Task In Project', projectId: project.id }, testDb);

      const allocation1: PlannedAllocation = {
        id: generateId(),
        taskId: task1.id,
        date: '2026-10-01',
        allocatedMinutes: 120,
      };
      const allocation2: PlannedAllocation = {
        id: generateId(),
        taskId: task2.id,
        date: '2026-10-02',
        allocatedMinutes: 60,
      };
      await testDb.plannedAllocations.bulkAdd([allocation1, allocation2]);

      // Execute cascade deletion
      await deleteProjectWithCascade(project.id, 'cascade', testDb);

      // Verify all related records deleted
      expect(await getProject(project.id, testDb)).toBeUndefined();
      expect(await getMilestone(milestone.id, testDb)).toBeUndefined();
      expect(await getTask(task1.id, testDb)).toBeUndefined();
      expect(await getTask(task2.id, testDb)).toBeUndefined();

      const allocations = await testDb.plannedAllocations.where('taskId').anyOf([task1.id, task2.id]).toArray();
      expect(allocations).toHaveLength(0);
    });

    it('orphan mode deletes project and milestones, but unhooks child tasks preserving them', async () => {
      const project = await createProject({ name: 'Project Beta' }, testDb);
      const milestone = await createMilestone({ projectId: project.id, name: 'Milestone 1' }, testDb);
      const task = await createTask({ name: 'Orphan Task', projectId: project.id, milestoneId: milestone.id }, testDb);

      const allocation: PlannedAllocation = {
        id: generateId(),
        taskId: task.id,
        date: '2026-10-01',
        allocatedMinutes: 90,
      };
      await testDb.plannedAllocations.add(allocation);

      await deleteProjectWithCascade(project.id, 'orphan', testDb);

      expect(await getProject(project.id, testDb)).toBeUndefined();
      expect(await getMilestone(milestone.id, testDb)).toBeUndefined();

      // Task is preserved as standalone task (projectId & milestoneId cleared)
      const orphanedTask = await getTask(task.id, testDb);
      expect(orphanedTask).toBeDefined();
      expect(orphanedTask?.id).toBe(task.id);
      expect(orphanedTask?.projectId).toBeUndefined();
      expect(orphanedTask?.milestoneId).toBeUndefined();

      // Allocation remains intact for orphaned task
      const allocs = await testDb.plannedAllocations.where('taskId').equals(task.id).toArray();
      expect(allocs).toHaveLength(1);
    });
  });

  describe('deleteMilestoneWithCascade', () => {
    it('cascade mode removes milestone, child tasks, and allocations', async () => {
      const project = await createProject({ name: 'Project Gamma' }, testDb);
      const milestone = await createMilestone({ projectId: project.id, name: 'Milestone MS' }, testDb);
      const task = await createTask({ name: 'Milestone Task', projectId: project.id, milestoneId: milestone.id }, testDb);

      const allocation: PlannedAllocation = {
        id: generateId(),
        taskId: task.id,
        date: '2026-10-01',
        allocatedMinutes: 45,
      };
      await testDb.plannedAllocations.add(allocation);

      await deleteMilestoneWithCascade(milestone.id, 'cascade', testDb);

      expect(await getMilestone(milestone.id, testDb)).toBeUndefined();
      expect(await getTask(task.id, testDb)).toBeUndefined();

      // Project itself must not be deleted
      expect(await getProject(project.id, testDb)).toBeDefined();

      const allocs = await testDb.plannedAllocations.where('taskId').equals(task.id).toArray();
      expect(allocs).toHaveLength(0);
    });

    it('orphan mode removes milestone and moves child tasks to project root', async () => {
      const project = await createProject({ name: 'Project Delta' }, testDb);
      const milestone = await createMilestone({ projectId: project.id, name: 'Milestone MS2' }, testDb);
      const task = await createTask({ name: 'Promoted Task', projectId: project.id, milestoneId: milestone.id }, testDb);

      await deleteMilestoneWithCascade(milestone.id, 'orphan', testDb);

      expect(await getMilestone(milestone.id, testDb)).toBeUndefined();

      // Task retains projectId, milestoneId reset to undefined
      const movedTask = await getTask(task.id, testDb);
      expect(movedTask).toBeDefined();
      expect(movedTask?.projectId).toBe(project.id);
      expect(movedTask?.milestoneId).toBeUndefined();
    });
  });

  describe('deleteTaskWithAllocations', () => {
    it('removes task and all associated allocations atomically', async () => {
      const task = await createTask({ name: 'Task With Allocs' }, testDb);
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
      const project = await createProject({ name: 'Safe Project' }, testDb);
      const task = await createTask({ name: 'Safe Task', projectId: project.id }, testDb);

      // Force error during transaction by using invalid table or operation
      await expect(
        testDb.transaction('rw', [testDb.projects, testDb.tasks], async () => {
          await testDb.projects.delete(project.id);
          throw new Error('Simulated failure');
        })
      ).rejects.toThrow('Simulated failure');

      // Project must still exist due to rollback
      const projectAfter = await getProject(project.id, testDb);
      expect(projectAfter).toBeDefined();
      expect(projectAfter?.id).toBe(project.id);

      const taskAfter = await getTask(task.id, testDb);
      expect(taskAfter).toBeDefined();
    });
  });
});
