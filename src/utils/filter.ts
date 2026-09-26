import dayjs from 'dayjs';
import type { Task, TaskPriority, TaskStatus } from '../types/models';

export interface TaskFilterState {
  search: string;
  hierarchyScope: 'all' | 'projects' | 'standalone';
  projectId: string | null;
  statuses: TaskStatus[];
  priorities: TaskPriority[];
  horizon: 'all' | 'overdue' | 'today' | 'this_week';
  includeClosed: boolean;
}

export const DEFAULT_TASK_FILTER_STATE: TaskFilterState = {
  search: '',
  hierarchyScope: 'all',
  projectId: null,
  statuses: ['Open', 'In Progress', 'Resolved', 'In Review'],
  priorities: [],
  horizon: 'all',
  includeClosed: false,
};

const PRIORITY_WEIGHTS: Record<TaskPriority, number> = {
  Urgent: 4,
  High: 3,
  Medium: 2,
  Low: 1,
};

/**
 * Calculates whether a task's deadline falls within the specified horizon.
 * Uses strict YYYY-MM-DD calendar string comparisons to avoid timezone drift (D-17, T-02-06).
 */
export function matchesHorizon(
  deadline: string | undefined,
  horizon: 'all' | 'overdue' | 'today' | 'this_week' | string,
  todayStr: string
): boolean {
  if (horizon === 'all') {
    return true;
  }
  if (!deadline) {
    return false;
  }

  if (horizon === 'overdue') {
    return deadline < todayStr;
  }

  if (horizon === 'today') {
    return deadline === todayStr;
  }

  if (horizon === 'this_week') {
    if (deadline < todayStr) {
      return false;
    }
    const dayOfWeek = dayjs(todayStr).day(); // 0 is Sunday, 1 is Monday, ..., 6 is Saturday
    const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
    const endOfWeekStr = dayjs(todayStr).add(daysUntilSunday, 'day').format('YYYY-MM-DD');
    return deadline <= endOfWeekStr;
  }

  return true;
}

/**
 * Filters task array in-memory across search text, hierarchy scope, status, priority, and date horizon.
 */
export function filterTasks(
  tasks: Task[],
  filterState: TaskFilterState,
  todayStr: string
): Task[] {
  const searchTerm = filterState.search.trim().toLowerCase();

  return tasks.filter((task) => {
    // 1. Text search across name, description, and notes (D-18)
    if (searchTerm) {
      const matchName = task.name.toLowerCase().includes(searchTerm);
      const matchDesc = (task.description ?? '').toLowerCase().includes(searchTerm);
      const matchNotes = (task.notes ?? '').toLowerCase().includes(searchTerm);
      if (!matchName && !matchDesc && !matchNotes) {
        return false;
      }
    }

    // 2. Hierarchy scope filter (D-04)
    if (filterState.hierarchyScope === 'standalone') {
      if (task.projectId !== undefined) {
        return false;
      }
    } else if (filterState.hierarchyScope === 'projects') {
      if (task.projectId === undefined) {
        return false;
      }
      if (filterState.projectId !== null && task.projectId !== filterState.projectId) {
        return false;
      }
    } else if (filterState.hierarchyScope === 'all') {
      if (filterState.projectId !== null && task.projectId !== filterState.projectId) {
        return false;
      }
    }

    // 3. Status filter and closed exclusion (D-20)
    const isClosed = task.status === 'Done' || task.status === 'Cancelled';
    if (isClosed) {
      if (!filterState.includeClosed) {
        // Exclude unless statuses explicitly contains this closed status
        if (!filterState.statuses || !filterState.statuses.includes(task.status)) {
          return false;
        }
      }
    } else {
      if (filterState.statuses && filterState.statuses.length > 0) {
        if (!filterState.statuses.includes(task.status)) {
          return false;
        }
      }
    }

    // 4. Priority filter
    if (filterState.priorities && filterState.priorities.length > 0) {
      if (!filterState.priorities.includes(task.priority)) {
        return false;
      }
    }

    // 5. Date horizon filter (D-17)
    if (filterState.horizon && filterState.horizon !== 'all') {
      if (!matchesHorizon(task.deadline, filterState.horizon, todayStr)) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Orders tasks defaulting to Deadline ascending (nulls last) then Priority descending (D-19).
 */
export function sortTasks(
  tasks: Task[],
  sortField?: string,
  sortOrder?: 'ascend' | 'descend'
): Task[] {
  return [...tasks].sort((a, b) => {
    if (sortField) {
      const orderMultiplier = sortOrder === 'descend' ? -1 : 1;
      if (sortField === 'deadline') {
        if (!a.deadline && !b.deadline) return 0;
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return a.deadline.localeCompare(b.deadline) * orderMultiplier;
      }
      if (sortField === 'priority') {
        const diff = (PRIORITY_WEIGHTS[a.priority] ?? 0) - (PRIORITY_WEIGHTS[b.priority] ?? 0);
        return diff * orderMultiplier;
      }
      if (sortField === 'name') {
        return a.name.localeCompare(b.name) * orderMultiplier;
      }
      if (sortField === 'status') {
        return a.status.localeCompare(b.status) * orderMultiplier;
      }
    }

    // Default sort: Deadline ascending (nulls last) then Priority descending
    if (a.deadline && !b.deadline) return -1;
    if (!a.deadline && b.deadline) return 1;
    if (a.deadline && b.deadline && a.deadline !== b.deadline) {
      return a.deadline.localeCompare(b.deadline);
    }

    // Priority descending
    const pA = PRIORITY_WEIGHTS[a.priority] ?? 0;
    const pB = PRIORITY_WEIGHTS[b.priority] ?? 0;
    if (pA !== pB) {
      return pB - pA;
    }

    return a.name.localeCompare(b.name);
  });
}
