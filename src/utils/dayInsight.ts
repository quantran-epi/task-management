import type { PlannedAllocationWithTask } from '../db/repositories/allocationRepo';
import type { Task, WorkSession } from '../types/models';
import { isTaskActive } from '../db/repositories/allocationRepo';

export interface DayInsightRow {
  taskId: string;
  taskName: string;
  projectName?: string;
  isActive: boolean;
  plannedMinutes: number;
  actualMinutes: number;
  deltaMinutes: number; // actual - planned
}

export interface DayInsightData {
  date: string;
  capacityMinutes: number;
  totalPlannedMinutes: number;
  totalActualMinutes: number;
  rows: DayInsightRow[];
  loading: boolean;
}

export interface BuildDayInsightInput {
  date: string;
  capacityMinutes: number;
  allocations: PlannedAllocationWithTask[];
  sessions: WorkSession[];
  taskMap: Map<string, Task>; // resolves task info for session-only rows
  projectNameById: Map<string, string>;
}

const FALLBACK_TASK_NAME = 'Deleted / Unknown Task';

/**
 * Merges planned allocations and work sessions for a single calendar date
 * into per-task rows with planned/actual/delta. Pure — no IO, no React.
 */
export function buildDayInsight(input: BuildDayInsightInput): DayInsightData {
  const rowsByTask = new Map<string, DayInsightRow>();

  for (const alloc of input.allocations) {
    const task = alloc.task;
    const row: DayInsightRow = {
      taskId: alloc.taskId,
      taskName: task.name,
      isActive: alloc.isActive,
      plannedMinutes: alloc.allocatedMinutes,
      actualMinutes: 0,
      deltaMinutes: -alloc.allocatedMinutes,
    };
    const projectName = task.projectId
      ? input.projectNameById.get(task.projectId)
      : undefined;
    if (projectName !== undefined) row.projectName = projectName;
    rowsByTask.set(alloc.taskId, row);
  }

  for (const session of input.sessions) {
    const existing = rowsByTask.get(session.taskId);
    if (existing) {
      existing.actualMinutes += session.durationMinutes;
      existing.deltaMinutes = existing.actualMinutes - existing.plannedMinutes;
      continue;
    }
    const task = input.taskMap.get(session.taskId);
    const row: DayInsightRow = {
      taskId: session.taskId,
      taskName: task?.name ?? FALLBACK_TASK_NAME,
      isActive: task ? isTaskActive(task.status) : false,
      plannedMinutes: 0,
      actualMinutes: session.durationMinutes,
      deltaMinutes: session.durationMinutes,
    };
    const projectName = task?.projectId
      ? input.projectNameById.get(task.projectId)
      : undefined;
    if (projectName !== undefined) row.projectName = projectName;
    rowsByTask.set(session.taskId, row);
  }

  const rows = Array.from(rowsByTask.values()).sort((a, b) => {
    if (b.actualMinutes !== a.actualMinutes) return b.actualMinutes - a.actualMinutes;
    if (b.plannedMinutes !== a.plannedMinutes) return b.plannedMinutes - a.plannedMinutes;
    return a.taskName.localeCompare(b.taskName);
  });

  const totalPlannedMinutes = rows.reduce((sum, r) => sum + r.plannedMinutes, 0);
  const totalActualMinutes = rows.reduce((sum, r) => sum + r.actualMinutes, 0);

  return {
    date: input.date,
    capacityMinutes: input.capacityMinutes,
    totalPlannedMinutes,
    totalActualMinutes,
    rows,
    loading: false,
  };
}
