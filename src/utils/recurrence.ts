import dayjs from 'dayjs';
import type { Task, RecurrenceFrequency } from '../types/models';
import type { TaskPlannerDatabase } from '../db';
import { db as defaultDb } from '../db';

/**
 * Calculates the next occurrence date (YYYY-MM-DD).
 * @param currentDate Reference date string (YYYY-MM-DD)
 * @param frequency 'daily' | 'weekly' | 'monthly'
 * @param interval Step size (default 1)
 * @param daysOfWeek 1 = Monday ... 7 = Sunday
 */
export function computeNextOccurrence(
  currentDate: string,
  frequency: RecurrenceFrequency,
  interval: number = 1,
  daysOfWeek?: number[]
): string {
  const current = dayjs(currentDate);
  const safeInterval = Math.max(1, interval || 1);

  if (frequency === 'daily') {
    return current.add(safeInterval, 'day').format('YYYY-MM-DD');
  }

  if (frequency === 'monthly') {
    return current.add(safeInterval, 'month').format('YYYY-MM-DD');
  }

  if (frequency === 'weekly') {
    if (daysOfWeek && daysOfWeek.length > 0) {
      // 1 (Monday) .. 7 (Sunday)
      const currentDow = current.day() === 0 ? 7 : current.day();
      const sortedDows = [...new Set(daysOfWeek)].sort((a, b) => a - b);

      // Find first day in the same week after currentDow
      const nextSameWeek = sortedDows.find((d) => d > currentDow);
      if (nextSameWeek) {
        return current.add(nextSameWeek - currentDow, 'day').format('YYYY-MM-DD');
      }

      // Jump to the first target day in the next interval week
      const firstDow = sortedDows[0] ?? 1;
      const daysToNextWeekCycle = 7 * safeInterval - currentDow + firstDow;
      return current.add(daysToNextWeekCycle, 'day').format('YYYY-MM-DD');
    }

    return current.add(safeInterval, 'week').format('YYYY-MM-DD');
  }

  return current.add(1, 'day').format('YYYY-MM-DD');
}

/**
 * Spawns the next recurring task instance when a task is completed or due.
 */
export async function spawnNextRecurringTask(
  task: Task,
  db: TaskPlannerDatabase = defaultDb
): Promise<Task | null> {
  if (!task.isRecurring || !task.recurrenceFrequency) {
    return null;
  }

  const baseDate = task.deadline || dayjs().format('YYYY-MM-DD');
  const nextDeadline = computeNextOccurrence(
    baseDate,
    task.recurrenceFrequency,
    task.recurrenceInterval,
    task.recurrenceDaysOfWeek
  );

  // Check end date constraint
  if (task.recurrenceEndDate && nextDeadline > task.recurrenceEndDate) {
    return null;
  }

  const rootTaskId = task.parentRecurringTaskId || task.id;

  // Check if an instance for this deadline already exists
  const existing = await db.tasks
    .filter(
      (t) =>
        (t.id === rootTaskId || t.parentRecurringTaskId === rootTaskId) &&
        t.deadline === nextDeadline
    )
    .first();

  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();
  const nextTask: Task = {
    id: crypto.randomUUID(),
    name: task.name,
    status: 'Open',
    priority: task.priority,
    progress: 0,
    estimateMinutes: task.estimateMinutes,
    isRecurring: true,
    recurrenceFrequency: task.recurrenceFrequency,
    parentRecurringTaskId: rootTaskId,
    createdAt: now,
    updatedAt: now,
  };

  if (task.description !== undefined) nextTask.description = task.description;
  if (task.projectId !== undefined) nextTask.projectId = task.projectId;
  if (task.milestoneId !== undefined) nextTask.milestoneId = task.milestoneId;
  if (task.workType !== undefined) nextTask.workType = task.workType;
  if (task.opsOwners !== undefined) nextTask.opsOwners = task.opsOwners;
  if (task.businessAnalysts !== undefined) nextTask.businessAnalysts = task.businessAnalysts;
  if (task.documentLinks !== undefined) nextTask.documentLinks = task.documentLinks;
  if (nextDeadline !== undefined) nextTask.deadline = nextDeadline;
  if (task.recurrenceInterval !== undefined) nextTask.recurrenceInterval = task.recurrenceInterval;
  if (task.recurrenceDaysOfWeek !== undefined) nextTask.recurrenceDaysOfWeek = task.recurrenceDaysOfWeek;
  if (task.recurrenceEndDate !== undefined) nextTask.recurrenceEndDate = task.recurrenceEndDate;

  await db.tasks.put(nextTask);
  return nextTask;
}
