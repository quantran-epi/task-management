import { db as defaultDb, type TaskPlannerDatabase } from '../index';
import type { PlannedAllocation, Task } from '../../types/models';
import { PlannedAllocationInputSchema } from '../../validation/schemas';
import { generateId } from '../../utils/uuid';

export interface PlannedAllocationWithTask extends PlannedAllocation {
  task: Task;
  isActive: boolean;
}

export interface WeeklyAllocationData {
  allocationsByDate: Record<string, PlannedAllocationWithTask[]>;
  activeTotalsByDate: Record<string, number>;
  inactiveTotalsByDate: Record<string, number>;
  activeTaskCountsByDate: Record<string, number>;
}

/**
 * Checks if a task status is considered active for capacity and load calculations (PLAN-05, D-16).
 * 'Done' and 'Cancelled' are inactive; all other statuses ('Open', 'In Progress', 'Resolved', 'In Review') are active.
 */
export function isTaskActive(status: Task['status']): boolean {
  return status !== 'Done' && status !== 'Cancelled';
}

/**
 * Upserts a planned allocation for (taskId, date), maintaining unique constraint D-12 (PLAN-01).
 * If an allocation exists for that task and date, it updates the allocated minutes.
 * Otherwise creates a new record.
 */
export async function upsertAllocation(
  taskId: string,
  date: string,
  allocatedMinutes: number,
  db: TaskPlannerDatabase = defaultDb
): Promise<PlannedAllocation> {
  const validated = PlannedAllocationInputSchema.parse({
    taskId,
    date,
    allocatedMinutes,
  });

  return await db.transaction('rw', [db.plannedAllocations, db.tasks], async () => {
    const task = await db.tasks.get(validated.taskId);
    if (!task) {
      throw new Error(`Task not found: ${validated.taskId}`);
    }

    const existing = await db.plannedAllocations
      .where('taskId')
      .equals(validated.taskId)
      .filter((a) => a.date === validated.date)
      .first();

    if (existing) {
      const updated: PlannedAllocation = {
        ...existing,
        allocatedMinutes: validated.allocatedMinutes,
      };
      await db.plannedAllocations.put(updated);
      return updated;
    }

    const created: PlannedAllocation = {
      id: generateId(),
      taskId: validated.taskId,
      date: validated.date,
      allocatedMinutes: validated.allocatedMinutes,
    };
    await db.plannedAllocations.add(created);
    return created;
  });
}

/**
 * Updates an allocation's allocatedMinutes or date (PLAN-02).
 * If date is changed and collides with another allocation for the same task, merges into that record.
 */
export async function updateAllocation(
  id: string,
  allocatedMinutes: number,
  date?: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<PlannedAllocation> {
  return await db.transaction('rw', db.plannedAllocations, async () => {
    const existing = await db.plannedAllocations.get(id);
    if (!existing) {
      throw new Error(`Allocation not found: ${id}`);
    }

    const targetDate = date ?? existing.date;
    const validated = PlannedAllocationInputSchema.parse({
      taskId: existing.taskId,
      date: targetDate,
      allocatedMinutes,
    });

    if (date !== undefined && date !== existing.date) {
      const collision = await db.plannedAllocations
        .where('taskId')
        .equals(existing.taskId)
        .filter((a) => a.date === targetDate && a.id !== id)
        .first();

      if (collision) {
        await db.plannedAllocations.delete(id);
        const merged: PlannedAllocation = {
          ...collision,
          allocatedMinutes: validated.allocatedMinutes,
        };
        await db.plannedAllocations.put(merged);
        return merged;
      }
    }

    const updated: PlannedAllocation = {
      ...existing,
      allocatedMinutes: validated.allocatedMinutes,
      date: targetDate,
    };
    await db.plannedAllocations.put(updated);
    return updated;
  });
}

/**
 * Deletes an allocation record cleanly by ID (PLAN-02).
 */
export async function deleteAllocation(
  id: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await db.plannedAllocations.delete(id);
}

/**
 * Fetches all allocations for a given task, sorted by date ascending (PLAN-02).
 */
export async function getAllocationsForTask(
  taskId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<PlannedAllocation[]> {
  const list = await db.plannedAllocations.where('taskId').equals(taskId).toArray();
  return list.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Calculates the total allocated minutes across all dates for a task (PLAN-02).
 */
export async function getTotalAllocatedMinutesForTask(
  taskId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<number> {
  const list = await db.plannedAllocations.where('taskId').equals(taskId).toArray();
  return list.reduce((sum, a) => sum + a.allocatedMinutes, 0);
}

/**
 * Fetches all allocations for a specific calendar date with joined Task entities
 * and active/inactive status flag per PLAN-05 and D-16.
 */
export async function getAllocationsForDate(
  date: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<PlannedAllocationWithTask[]> {
  const allocations = await db.plannedAllocations.where('date').equals(date).toArray();
  if (allocations.length === 0) {
    return [];
  }

  const taskIds = Array.from(new Set(allocations.map((a) => a.taskId)));
  const tasks = await db.tasks.where('id').anyOf(taskIds).toArray();
  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  return allocations.map((alloc) => {
    const task = taskMap.get(alloc.taskId);
    const fallbackTask: Task = {
      id: alloc.taskId,
      name: 'Deleted / Unknown Task',
      status: 'Cancelled',
      progress: 0,
      priority: 'Medium',
      estimateMinutes: 0,
      createdAt: '',
      updatedAt: '',
    };
    const resolvedTask = task ?? fallbackTask;
    return {
      ...alloc,
      task: resolvedTask,
      isActive: isTaskActive(resolvedTask.status),
    };
  });
}

/**
 * Fetches all allocations within a date range with joined tasks,
 * computing active/inactive minute totals and distinct active task counts per date (PLAN-05, D-13, D-16).
 */
export async function getWeeklyAllocationsWithTasks(
  startDate: string,
  endDate: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<WeeklyAllocationData> {
  const allocations = await db.plannedAllocations
    .where('date')
    .between(startDate, endDate, true, true)
    .toArray();

  const taskIds = Array.from(new Set(allocations.map((a) => a.taskId)));
  const tasks = taskIds.length > 0 ? await db.tasks.where('id').anyOf(taskIds).toArray() : [];
  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  const allocationsByDate: Record<string, PlannedAllocationWithTask[]> = {};
  const activeTotalsByDate: Record<string, number> = {};
  const inactiveTotalsByDate: Record<string, number> = {};
  const activeTaskCountsByDate: Record<string, number> = {};

  for (const alloc of allocations) {
    const date = alloc.date;
    if (!allocationsByDate[date]) {
      allocationsByDate[date] = [];
      activeTotalsByDate[date] = 0;
      inactiveTotalsByDate[date] = 0;
      activeTaskCountsByDate[date] = 0;
    }

    const task = taskMap.get(alloc.taskId);
    const fallbackTask: Task = {
      id: alloc.taskId,
      name: 'Deleted / Unknown Task',
      status: 'Cancelled',
      progress: 0,
      priority: 'Medium',
      estimateMinutes: 0,
      createdAt: '',
      updatedAt: '',
    };
    const resolvedTask = task ?? fallbackTask;
    const isActive = isTaskActive(resolvedTask.status);

    allocationsByDate[date].push({
      ...alloc,
      task: resolvedTask,
      isActive,
    });

    if (isActive) {
      activeTotalsByDate[date] = (activeTotalsByDate[date] ?? 0) + alloc.allocatedMinutes;
    } else {
      inactiveTotalsByDate[date] = (inactiveTotalsByDate[date] ?? 0) + alloc.allocatedMinutes;
    }
  }

  // Count distinct active tasks per date
  for (const date of Object.keys(allocationsByDate)) {
    const list = allocationsByDate[date] ?? [];
    const activeDistinctTasks = new Set(
      list.filter((item) => item.isActive).map((item) => item.taskId)
    );
    activeTaskCountsByDate[date] = activeDistinctTasks.size;
  }

  return {
    allocationsByDate,
    activeTotalsByDate,
    inactiveTotalsByDate,
    activeTaskCountsByDate,
  };
}
