import { db as defaultDb, type TaskPlannerDatabase } from '../index';
import type { Task } from '../../types/models';

/**
 * Atomically deletes a project and handles child milestones, tasks, and allocations per D-13, D-16, WORK-05.
 * - 'cascade' mode: deletes project, all child milestones, all child tasks, associated planned allocations,
 *   work sessions, and active timers.
 * - 'orphan' mode: deletes project and child milestones, but unhooks child tasks (clearing projectId and milestoneId)
 *   preserving tasks, their planned allocations, and work sessions.
 */
export async function deleteProjectWithCascade(
  projectId: string,
  mode: 'cascade' | 'orphan',
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await db.transaction(
    'rw',
    [db.projects, db.milestones, db.tasks, db.plannedAllocations, db.workSessions, db.activeTimers, db.notes],
    async () => {
      const milestones = await db.milestones.where('projectId').equals(projectId).toArray();
      const milestoneIds = milestones.map((m) => m.id);

      const projectTasks = await db.tasks.where('projectId').equals(projectId).toArray();
      const milestoneTasks = milestoneIds.length > 0
        ? await db.tasks.where('milestoneId').anyOf(milestoneIds).toArray()
        : [];

      const taskMap = new Map<string, Task>();
      for (const t of [...projectTasks, ...milestoneTasks]) {
        taskMap.set(t.id, t);
      }
      const allChildTasks = Array.from(taskMap.values());
      const childTaskIds = allChildTasks.map((t) => t.id);

      // Detach notes associated with the project, milestones, and deleted tasks (D-25)
      const now = new Date().toISOString();
      const entityIdsToDetach = [projectId, ...milestoneIds, ...(mode === 'cascade' ? childTaskIds : [])];
      if (entityIdsToDetach.length > 0) {
        await db.notes
          .where('entityId')
          .anyOf(entityIdsToDetach)
          .modify((note: any) => {
            delete note.entityType;
            delete note.entityId;
            note.updatedAt = now;
          });
      }

      if (mode === 'cascade') {
        if (childTaskIds.length > 0) {
          const allocations = await db.plannedAllocations.where('taskId').anyOf(childTaskIds).toArray();
          if (allocations.length > 0) {
            await db.plannedAllocations.bulkDelete(allocations.map((a) => a.id));
          }

          const sessions = await db.workSessions.where('taskId').anyOf(childTaskIds).toArray();
          if (sessions.length > 0) {
            await db.workSessions.bulkDelete(sessions.map((s) => s.id));
          }

          await db.activeTimers.bulkDelete(childTaskIds);
          await db.tasks.bulkDelete(childTaskIds);
        }

        if (milestoneIds.length > 0) {
          await db.milestones.bulkDelete(milestoneIds);
        }

        await db.projects.delete(projectId);
      } else {
        // Orphan mode: unhook child tasks (clear projectId and milestoneId) preserving original IDs
        const now = new Date().toISOString();
        const updatedTasks = allChildTasks.map((task) => {
          const updated: Task = {
            ...task,
            updatedAt: now,
          };
          delete updated.projectId;
          delete updated.milestoneId;
          return updated;
        });

        if (updatedTasks.length > 0) {
          await db.tasks.bulkPut(updatedTasks);
        }

        if (milestoneIds.length > 0) {
          await db.milestones.bulkDelete(milestoneIds);
        }

        await db.projects.delete(projectId);
      }
    }
  );
}

/**
 * Atomically deletes a milestone and handles child tasks and allocations per D-14, D-16, WORK-05.
 * - 'cascade' mode: deletes milestone, all child tasks, their planned allocations, work sessions, and active timers.
 * - 'orphan' mode: deletes milestone and promotes child tasks to project root (clearing milestoneId, keeping projectId).
 */
export async function deleteMilestoneWithCascade(
  milestoneId: string,
  mode: 'cascade' | 'orphan',
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await db.transaction(
    'rw',
    [db.milestones, db.tasks, db.plannedAllocations, db.workSessions, db.activeTimers, db.notes],
    async () => {
      const childTasks = await db.tasks.where('milestoneId').equals(milestoneId).toArray();
      const childTaskIds = childTasks.map((t) => t.id);

      // Detach notes associated with the milestone and deleted tasks (D-25)
      const now = new Date().toISOString();
      const entityIdsToDetach = [milestoneId, ...(mode === 'cascade' ? childTaskIds : [])];
      if (entityIdsToDetach.length > 0) {
        await db.notes
          .where('entityId')
          .anyOf(entityIdsToDetach)
          .modify((note: any) => {
            delete note.entityType;
            delete note.entityId;
            note.updatedAt = now;
          });
      }

      if (mode === 'cascade') {
        if (childTaskIds.length > 0) {
          const allocations = await db.plannedAllocations.where('taskId').anyOf(childTaskIds).toArray();
          if (allocations.length > 0) {
            await db.plannedAllocations.bulkDelete(allocations.map((a) => a.id));
          }

          const sessions = await db.workSessions.where('taskId').anyOf(childTaskIds).toArray();
          if (sessions.length > 0) {
            await db.workSessions.bulkDelete(sessions.map((s) => s.id));
          }

          await db.activeTimers.bulkDelete(childTaskIds);
          await db.tasks.bulkDelete(childTaskIds);
        }
        await db.milestones.delete(milestoneId);
      } else {
        // Orphan mode: promote child tasks to project root (retain task.projectId, remove milestoneId)
        const now = new Date().toISOString();
        const updatedTasks = childTasks.map((task) => {
          const updated: Task = {
            ...task,
            updatedAt: now,
          };
          delete updated.milestoneId;
          return updated;
        });

        if (updatedTasks.length > 0) {
          await db.tasks.bulkPut(updatedTasks);
        }
        await db.milestones.delete(milestoneId);
      }
    }
  );
}

/**
 * Atomically deletes a task and all its associated planned allocations, work sessions, and active timer per D-16.
 */
export async function deleteTaskWithAllocations(
  taskId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await db.transaction(
    'rw',
    [db.tasks, db.plannedAllocations, db.workSessions, db.activeTimers, db.notes],
    async () => {
      // Detach notes associated with the task (D-25: notes become standalone)
      const now = new Date().toISOString();
      await db.notes
        .where('entityId')
        .equals(taskId)
        .modify((note: any) => {
          delete note.entityType;
          delete note.entityId;
          note.updatedAt = now;
        });

      const allocations = await db.plannedAllocations.where('taskId').equals(taskId).toArray();
      if (allocations.length > 0) {
        await db.plannedAllocations.bulkDelete(allocations.map((a) => a.id));
      }

      const sessions = await db.workSessions.where('taskId').equals(taskId).toArray();
      if (sessions.length > 0) {
        await db.workSessions.bulkDelete(sessions.map((s) => s.id));
      }

      await db.activeTimers.delete(taskId);
      await db.tasks.delete(taskId);
    }
  );
}

