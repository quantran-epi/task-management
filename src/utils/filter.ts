import dayjs from 'dayjs';
import type { Milestone, Project, Task, TaskPriority, TaskStatus, WorkType } from '../types/models';
import { resolveInheritedTags } from '../domain/inheritance';

export interface TaskFilterState {
  search: string;
  hierarchyScope: 'all' | 'projects' | 'standalone';
  projectId: string | null;
  statuses: TaskStatus[];
  priorities: TaskPriority[];
  horizon: 'all' | 'overdue' | 'today' | 'this_week';
  includeClosed: boolean;
  milestoneId: string | null;
  workTypes: WorkType[];
  opsOwners: string[];
  businessAnalysts: string[];
  executionDateRange: [string, string] | null;
  deadlineRange: [string, string] | null;
  jiraFilter: 'all' | 'linked' | 'unlinked';
}

export const DEFAULT_TASK_FILTER_STATE: TaskFilterState = {
  search: '',
  hierarchyScope: 'all',
  projectId: null,
  statuses: ['Open', 'Pending', 'In Progress', 'Resolved', 'In Review'],
  priorities: [],
  horizon: 'all',
  includeClosed: false,
  milestoneId: null,
  workTypes: [],
  opsOwners: [],
  businessAnalysts: [],
  executionDateRange: null,
  deadlineRange: null,
  jiraFilter: 'all',
};

export interface FilterContext {
  todayStr: string;
  projectMap?: Map<string, Project>;
  milestoneMap?: Map<string, Milestone>;
  executionTaskIds?: Set<string> | null;
}

/**
 * Counts active advanced filter criteria (SRCH-03, D-04).
 * Returns count of active non-default advanced filters.
 */
export function countActiveAdvancedFilters(filters: TaskFilterState): number {
  let count = 0;
  if (filters.milestoneId) count++;
  if (filters.workTypes && filters.workTypes.length > 0) count++;
  if (filters.opsOwners && filters.opsOwners.length > 0) count++;
  if (filters.businessAnalysts && filters.businessAnalysts.length > 0) count++;
  if (filters.executionDateRange && filters.executionDateRange[0] && filters.executionDateRange[1]) count++;
  if (filters.deadlineRange && filters.deadlineRange[0] && filters.deadlineRange[1]) count++;
  if (filters.jiraFilter && filters.jiraFilter !== 'all') count++;
  return count;
}

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
 * Filters task array in-memory across search text, hierarchy scope, status, priority, date horizon,
 * and advanced multi-criteria (milestone, workTypes, opsOwners, businessAnalysts, deadlineRange, executionDateRange).
 */
export function filterTasks(
  tasks: Task[],
  filterState: TaskFilterState,
  context: string | FilterContext
): Task[] {
  const normalizedContext: FilterContext =
    typeof context === 'string' ? { todayStr: context } : context;
  const { todayStr, projectMap, milestoneMap, executionTaskIds } = normalizedContext;

  const searchTerm = filterState.search.trim().toLowerCase();

  return tasks.filter((task) => {
    // 1. Text search across name, description, notes, and jiraKey (D-18, JIRA-04)
    if (searchTerm) {
      const matchName = task.name.toLowerCase().includes(searchTerm);
      const matchDesc = (task.description ?? '').toLowerCase().includes(searchTerm);
      const matchNotes = (task.notes ?? '').toLowerCase().includes(searchTerm);
      const matchJira = (task.jiraKey ?? '').toLowerCase().includes(searchTerm);
      if (!matchName && !matchDesc && !matchNotes && !matchJira) {
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

    // 6. Milestone filter (SRCH-03)
    if (filterState.milestoneId) {
      if (task.milestoneId !== filterState.milestoneId) {
        return false;
      }
    }

    // 7. Work types filter (SRCH-03)
    if (filterState.workTypes && filterState.workTypes.length > 0) {
      if (!task.workType || !filterState.workTypes.includes(task.workType)) {
        return false;
      }
    }

    // 8. Deadline range filter [start, end] inclusive (SRCH-02, D-02)
    if (
      filterState.deadlineRange &&
      filterState.deadlineRange[0] &&
      filterState.deadlineRange[1]
    ) {
      const [start, end] = filterState.deadlineRange;
      if (!task.deadline || task.deadline < start || task.deadline > end) {
        return false;
      }
    }

    // 9. Execution date range filter via executionTaskIds Set (SRCH-01, D-06)
    if (
      filterState.executionDateRange &&
      filterState.executionDateRange[0] &&
      filterState.executionDateRange[1] &&
      executionTaskIds !== null &&
      executionTaskIds !== undefined
    ) {
      if (!executionTaskIds.has(task.id)) {
        return false;
      }
    }

    // Resolve ancestors for tag inheritance if needed
    const ancestors =
      projectMap || milestoneMap
        ? {
            project: task.projectId ? projectMap?.get(task.projectId) : undefined,
            milestone: task.milestoneId ? milestoneMap?.get(task.milestoneId) : undefined,
          }
        : {};

    // 10. Ops Owners filter with inheritance (SRCH-03, D-03)
    if (filterState.opsOwners && filterState.opsOwners.length > 0) {
      const effectiveOps = resolveInheritedTags('opsOwners', task, ancestors).tags;
      const lowerEffective = effectiveOps.map((t) => t.trim().toLowerCase());
      const hasMatch = filterState.opsOwners.some((target) =>
        lowerEffective.includes(target.trim().toLowerCase())
      );
      if (!hasMatch) {
        return false;
      }
    }

    // 11. Business Analysts filter with inheritance (SRCH-03, D-03)
    if (filterState.businessAnalysts && filterState.businessAnalysts.length > 0) {
      const effectiveBa = resolveInheritedTags('businessAnalysts', task, ancestors).tags;
      const lowerEffective = effectiveBa.map((t) => t.trim().toLowerCase());
      const hasMatch = filterState.businessAnalysts.some((target) =>
        lowerEffective.includes(target.trim().toLowerCase())
      );
      if (!hasMatch) {
        return false;
      }
    }

    // 12. Jira link status filter (JIRA-04, D-13)
    if (filterState.jiraFilter === 'linked' && !task.jiraKey) {
      return false;
    }
    if (filterState.jiraFilter === 'unlinked' && Boolean(task.jiraKey)) {
      return false;
    }

    return true;
  });
}

export type TaskSortKey =
  | 'createdAt_desc'
  | 'createdAt_asc'
  | 'updatedAt_desc'
  | 'updatedAt_asc'
  | 'deadline_asc'
  | 'deadline_desc'
  | 'priority_desc'
  | 'priority_asc'
  | 'name_asc'
  | 'name_desc';

export const TASK_SORT_OPTIONS: ReadonlyArray<{ value: TaskSortKey; label: string }> = [
  { value: 'createdAt_desc', label: 'Mới tạo' },
  { value: 'createdAt_asc', label: 'Tạo cũ nhất' },
  { value: 'updatedAt_desc', label: 'Vừa cập nhật' },
  { value: 'updatedAt_asc', label: 'Ít cập nhật gần đây' },
  { value: 'deadline_asc', label: 'Hạn gần nhất' },
  { value: 'deadline_desc', label: 'Hạn xa nhất' },
  { value: 'priority_desc', label: 'Ưu tiên cao → thấp' },
  { value: 'priority_asc', label: 'Ưu tiên thấp → cao' },
  { value: 'name_asc', label: 'Tên A → Z' },
  { value: 'name_desc', label: 'Tên Z → A' },
];

export const DEFAULT_TASK_SORT: TaskSortKey = 'deadline_asc';

function compareByGlobalSort(a: Task, b: Task, key: TaskSortKey): number {
  switch (key) {
    case 'createdAt_desc':
      return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
    case 'createdAt_asc':
      return (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
    case 'updatedAt_desc':
      return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '');
    case 'updatedAt_asc':
      return (a.updatedAt ?? '').localeCompare(b.updatedAt ?? '');
    case 'deadline_asc': {
      if (!a.deadline && !b.deadline) {
        const pDiff = (PRIORITY_WEIGHTS[b.priority] ?? 0) - (PRIORITY_WEIGHTS[a.priority] ?? 0);
        if (pDiff !== 0) return pDiff;
        return 0;
      }
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      const dDiff = a.deadline.localeCompare(b.deadline);
      if (dDiff !== 0) return dDiff;
      return (PRIORITY_WEIGHTS[b.priority] ?? 0) - (PRIORITY_WEIGHTS[a.priority] ?? 0);
    }
    case 'deadline_desc': {
      if (!a.deadline && !b.deadline) {
        const pDiff = (PRIORITY_WEIGHTS[b.priority] ?? 0) - (PRIORITY_WEIGHTS[a.priority] ?? 0);
        if (pDiff !== 0) return pDiff;
        return 0;
      }
      if (!a.deadline) return 1; // nulls last both directions
      if (!b.deadline) return -1;
      const dDiff = b.deadline.localeCompare(a.deadline);
      if (dDiff !== 0) return dDiff;
      return (PRIORITY_WEIGHTS[b.priority] ?? 0) - (PRIORITY_WEIGHTS[a.priority] ?? 0);
    }
    case 'priority_desc':
      return (PRIORITY_WEIGHTS[b.priority] ?? 0) - (PRIORITY_WEIGHTS[a.priority] ?? 0);
    case 'priority_asc':
      return (PRIORITY_WEIGHTS[a.priority] ?? 0) - (PRIORITY_WEIGHTS[b.priority] ?? 0);
    case 'name_asc':
      return a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' });
    case 'name_desc':
      return b.name.localeCompare(a.name, 'vi', { sensitivity: 'base' });
    default:
      return 0;
  }
}

/**
 * Orders tasks. If `sortField` is provided, per-column branch runs (backwards compatible).
 * Otherwise applies `globalSort` (default: DEFAULT_TASK_SORT).
 * Tiebreaker: task name ascending.
 */
export function sortTasks(
  tasks: Task[],
  sortField?: string,
  sortOrder?: 'ascend' | 'descend',
  globalSort?: TaskSortKey
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

    const key = globalSort ?? DEFAULT_TASK_SORT;
    const primary = compareByGlobalSort(a, b, key);
    if (primary !== 0) return primary;
    return a.name.localeCompare(b.name);
  });
}
