import { db as defaultDb, type TaskPlannerDatabase } from '../index';
import type { Note } from '../../types/models';
import { deleteLinksForTaskMateEntity } from './knowledgeLinkRepo';

/**
 * Atomically deletes a Change Request and everything scoped to it (D-27, D-52):
 * its tasks, their allocations/sessions/timers, note links, chat threads/tabs/messages
 * and knowledge links. Replaces the project-coupled cascade.
 */
export async function deleteChangeRequestWithCascade(
  crId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.changeRequests,
      db.tasks,
      db.plannedAllocations,
      db.workSessions,
      db.activeTimers,
      db.notes,
      db.chatThreads,
      db.chatTabs,
      db.chatMessages,
      db.knowledgeLinks,
    ],
    async () => {
      const childTasks = await db.tasks.where('crId').equals(crId).toArray();
      const childTaskIds = childTasks.map((t) => t.id);
      const now = new Date().toISOString();

      // Detach notes linked to the CR or to its deleted tasks (D-25: notes become standalone)
      await db.notes
        .where('entityId')
        .anyOf([crId, ...childTaskIds])
        .modify((note: Note) => {
          delete note.entityType;
          delete note.entityId;
          note.updatedAt = now;
        });

      // Purge chat threads, tabs and messages for the CR and its tasks (D-07)
      const scopeKeys = [`cr:${crId}`, ...childTaskIds.map((tId) => `task:${tId}`)];
      const threadsByScope = await db.chatThreads.where('scopeKey').anyOf(scopeKeys).toArray();
      const threadsByEntity = await db.chatThreads.where('entityId').equals(crId).toArray();
      const threadMap = new Map<string, (typeof threadsByScope)[number]>();
      for (const t of [...threadsByScope, ...threadsByEntity]) threadMap.set(t.id, t);
      const threadIds = Array.from(threadMap.keys());

      if (threadIds.length > 0) {
        await db.chatMessages.where('threadId').anyOf(threadIds).delete();
        await db.chatTabs.where('threadId').anyOf(threadIds).delete();
        await db.chatThreads.bulkDelete(threadIds);
      }

      // Clean up knowledge links (D-22, LINK-02)
      await deleteLinksForTaskMateEntity('cr', crId, db);
      for (const tId of childTaskIds) {
        await deleteLinksForTaskMateEntity('task', tId, db);
      }

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

      await db.changeRequests.delete(crId);
    }
  );
}

/**
 * Atomically deletes a task and all its associated planned allocations, work sessions, active timer, and knowledge links per D-16, D-22.
 */
export async function deleteTaskWithAllocations(
  taskId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.tasks,
      db.plannedAllocations,
      db.workSessions,
      db.activeTimers,
      db.notes,
      db.chatThreads,
      db.chatMessages,
      db.knowledgeLinks,
    ],
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

      // Purge chat threads and messages for task (D-07)
      const threadsToPurge = await db.chatThreads.where('scopeKey').equals(`task:${taskId}`).toArray();
      if (threadsToPurge.length > 0) {
        const threadIds = threadsToPurge.map((t) => t.id);
        await db.chatMessages.where('threadId').anyOf(threadIds).delete();
        await db.chatThreads.bulkDelete(threadIds);
      }

      // Purge knowledge links (D-22, LINK-02)
      await deleteLinksForTaskMateEntity('task', taskId, db);

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
