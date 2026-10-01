import { db as defaultDb, type TaskPlannerDatabase } from '../index';
import type { WorkSession, ActiveTimer, Task } from '../../types/models';
import { WorkSessionInputSchema, type WorkSessionInput } from '../../validation/schemas';
import { generateId } from '../../utils/uuid';

export interface WorkSessionWithTask extends WorkSession {
  task: Task;
}

/**
 * Helper to format a date/ISO string into YYYY-MM-DD calendar date string.
 */
function toCalendarDateString(dateInput: string | Date): string {
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    return dateInput;
  }
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Creates a work session log entry atomically within a Dexie transaction.
 * Updates task.updatedAt timestamp per D-06, D-09.
 */
export async function createWorkSession(
  input: WorkSessionInput,
  db: TaskPlannerDatabase = defaultDb
): Promise<WorkSession> {
  const validated = WorkSessionInputSchema.parse(input);

  return await db.transaction('rw', [db.workSessions, db.tasks], async () => {
    const task = await db.tasks.get(validated.taskId);
    if (!task) {
      throw new Error(`Task not found: ${validated.taskId}`);
    }

    const now = new Date().toISOString();
    task.updatedAt = now;
    await db.tasks.put(task);

    const date = toCalendarDateString(validated.startTime);
    const session: WorkSession = {
      id: generateId(),
      taskId: validated.taskId,
      startTime: validated.startTime,
      date,
      durationMinutes: validated.durationMinutes,
      createdAt: now,
      updatedAt: now,
    };

    if (validated.endTime !== undefined) {
      session.endTime = validated.endTime;
    }
    if (validated.segments !== undefined) {
      session.segments = validated.segments;
    }
    if (validated.note !== undefined && validated.note.trim() !== '') {
      session.note = validated.note.trim();
    }

    await db.workSessions.add(session);
    return session;
  });
}

/**
 * Retrieves all work sessions for a task, sorted by startTime descending.
 */
export async function getWorkSessionsForTask(
  taskId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<WorkSession[]> {
  const sessions = await db.workSessions.where('taskId').equals(taskId).toArray();
  return sessions.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
}

/**
 * Updates an existing work session.
 */
export async function updateWorkSession(
  id: string,
  updates: Partial<Omit<WorkSession, 'id' | 'taskId' | 'createdAt'>>,
  db: TaskPlannerDatabase = defaultDb
): Promise<WorkSession> {
  return await db.transaction('rw', [db.workSessions, db.tasks], async () => {
    const existing = await db.workSessions.get(id);
    if (!existing) {
      throw new Error(`Work session not found: ${id}`);
    }

    const now = new Date().toISOString();
    const updated: WorkSession = {
      ...existing,
      ...updates,
      updatedAt: now,
    };

    if (updates.startTime) {
      updated.date = toCalendarDateString(updates.startTime);
    }

    // Validate updated model via WorkSessionInputSchema
    WorkSessionInputSchema.parse({
      taskId: updated.taskId,
      startTime: updated.startTime,
      endTime: updated.endTime,
      durationMinutes: updated.durationMinutes,
      note: updated.note,
    });

    const task = await db.tasks.get(updated.taskId);
    if (task) {
      task.updatedAt = now;
      await db.tasks.put(task);
    }

    await db.workSessions.put(updated);
    return updated;
  });
}


/**
 * Deletes a work session by ID.
 */
export async function deleteWorkSession(
  id: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await db.transaction('rw', [db.workSessions, db.tasks], async () => {
    const session = await db.workSessions.get(id);
    if (!session) return;

    const task = await db.tasks.get(session.taskId);
    if (task) {
      task.updatedAt = new Date().toISOString();
      await db.tasks.put(task);
    }

    await db.workSessions.delete(id);
  });
}

/**
 * Computes total spent minutes for a single task.
 */
export async function getTaskSpentMinutes(
  taskId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<number> {
  const sessions = await db.workSessions.where('taskId').equals(taskId).toArray();
  return sessions.reduce((sum, s) => sum + s.durationMinutes, 0);
}

/**
 * Computes total spent minutes for a milestone by summing spent time across all its tasks.
 */
export async function getMilestoneSpentMinutes(
  milestoneId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<number> {
  const tasks = await db.tasks.where('milestoneId').equals(milestoneId).toArray();
  if (tasks.length === 0) return 0;

  const taskIds = tasks.map((t) => t.id);
  const sessions = await db.workSessions.where('taskId').anyOf(taskIds).toArray();
  return sessions.reduce((sum, s) => sum + s.durationMinutes, 0);
}

/**
 * Computes total spent minutes for a project across:
 * 1. Tasks belonging directly to the project
 * 2. Tasks belonging to milestones of the project
 */
export async function getProjectSpentMinutes(
  projectId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<number> {
  const [projectTasks, milestones] = await Promise.all([
    db.tasks.where('projectId').equals(projectId).toArray(),
    db.milestones.where('projectId').equals(projectId).toArray(),
  ]);

  const milestoneIds = milestones.map((m) => m.id);
  const milestoneTasks = milestoneIds.length > 0
    ? await db.tasks.where('milestoneId').anyOf(milestoneIds).toArray()
    : [];

  const taskMap = new Map<string, boolean>();
  for (const t of [...projectTasks, ...milestoneTasks]) {
    taskMap.set(t.id, true);
  }

  const allTaskIds = Array.from(taskMap.keys());
  if (allTaskIds.length === 0) return 0;

  const sessions = await db.workSessions.where('taskId').anyOf(allTaskIds).toArray();
  return sessions.reduce((sum, s) => sum + s.durationMinutes, 0);
}

/**
 * Retrieves all work sessions on a specific calendar date, joined with Task.
 * Missing tasks get a fallback record matching getAllocationsForDate semantics.
 */
export async function getWorkSessionsForDate(
  date: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<WorkSessionWithTask[]> {
  const sessions = await db.workSessions.where('date').equals(date).toArray();
  if (sessions.length === 0) return [];

  const taskIds = Array.from(new Set(sessions.map((s) => s.taskId)));
  const tasks = await db.tasks.where('id').anyOf(taskIds).toArray();
  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  return sessions.map((session) => {
    const task = taskMap.get(session.taskId);
    const fallbackTask: Task = {
      id: session.taskId,
      name: 'Deleted / Unknown Task',
      status: 'Cancelled',
      progress: 0,
      priority: 'Medium',
      estimateMinutes: 0,
      createdAt: '',
      updatedAt: '',
    };
    return { ...session, task: task ?? fallbackTask };
  });
}

/**
 * Aggregates total logged minutes per taskId for a specific calendar date.
 */
export async function getActualMinutesByTaskForDate(
  date: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<Map<string, number>> {
  const sessions = await db.workSessions.where('date').equals(date).toArray();
  const result = new Map<string, number>();
  for (const s of sessions) {
    result.set(s.taskId, (result.get(s.taskId) ?? 0) + s.durationMinutes);
  }
  return result;
}

/**
 * Retrieves all work sessions intersecting a 7-day period.
 * Dates are inclusive between weekStartIso and weekEndIso.
 */
export async function getWorkSessionsForWeek(
  weekStartIso: string,
  weekEndIso: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<WorkSession[]> {
  const startDateStr = toCalendarDateString(weekStartIso);
  const endDateStr = toCalendarDateString(weekEndIso);
  return await db.workSessions
    .where('date')
    .between(startDateStr, endDateStr, true, true)
    .toArray();
}

/**
 * Active timer repository functions (survive reload per D-04, TIMER-02).
 */
export async function getActiveTimers(
  db: TaskPlannerDatabase = defaultDb
): Promise<ActiveTimer[]> {
  return await db.activeTimers.toArray();
}

export async function getActiveTimer(
  taskId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<ActiveTimer | undefined> {
  return await db.activeTimers.get(taskId);
}

export async function putActiveTimer(
  timer: ActiveTimer,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await db.activeTimers.put(timer);
}

export async function deleteActiveTimer(
  taskId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await db.activeTimers.delete(taskId);
}
