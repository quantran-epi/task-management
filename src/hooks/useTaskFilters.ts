import { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Task, Project, Milestone } from '../types/models';
import {
  filterTasks,
  sortTasks,
  DEFAULT_TASK_FILTER_STATE,
  DEFAULT_TASK_SORT,
  TASK_SORT_OPTIONS,
  countActiveAdvancedFilters,
  type TaskFilterState,
  type TaskSortKey,
} from '../utils/filter';
import { getTodayDateString } from '../utils/date';
import { getTaskIdsWithAllocationsInRange } from '../db/repositories/allocationRepo';
import { getTaskIdsWithWorkSessionsInRange } from '../db/repositories/workSessionRepo';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';

export const STORAGE_SORT_KEY = 'planner:task_table_sort';

function loadInitialGlobalSort(): TaskSortKey {
  try {
    if (typeof window === 'undefined') return DEFAULT_TASK_SORT;
    const raw = localStorage.getItem(STORAGE_SORT_KEY);
    if (!raw) return DEFAULT_TASK_SORT;
    const valid = TASK_SORT_OPTIONS.some((opt) => opt.value === raw);
    return valid ? (raw as TaskSortKey) : DEFAULT_TASK_SORT;
  } catch {
    return DEFAULT_TASK_SORT;
  }
}

export interface UseTaskFiltersOptions {
  tasks?: Task[];
  projects?: Project[];
  milestones?: Milestone[];
  db?: TaskPlannerDatabase;
}

export interface UseTaskFiltersReturn {
  filters: TaskFilterState;
  setFilter: <K extends keyof TaskFilterState>(key: K, value: TaskFilterState[K]) => void;
  setFilters: (patch: Partial<TaskFilterState>) => void;
  resetFilters: () => void;
  debouncedSearch: string;
  filteredTasks: Task[];
  sortField?: string | undefined;
  sortOrder?: 'ascend' | 'descend' | undefined;
  setSort: (field?: string, order?: 'ascend' | 'descend') => void;
  globalSort: TaskSortKey;
  setGlobalSort: (key: TaskSortKey) => void;
  activeFilterCount: number;
}

export function useTaskFilters(
  input: UseTaskFiltersOptions | Task[] = []
): UseTaskFiltersReturn {
  const options: UseTaskFiltersOptions = Array.isArray(input) ? { tasks: input } : input;
  const { tasks = [], projects = [], milestones = [], db = defaultDb } = options;

  const [filters, setFiltersState] = useState<TaskFilterState>(DEFAULT_TASK_FILTER_STATE);
  const [debouncedSearch, setDebouncedSearch] = useState<string>(filters.search);
  const [sortField, setSortField] = useState<string | undefined>(undefined);
  const [sortOrder, setSortOrder] = useState<'ascend' | 'descend' | undefined>(undefined);
  // Synchronous localStorage read prevents FOUC — matches STORAGE_COLUMNS_KEY pattern in TaskTable
  const [globalSort, setGlobalSortState] = useState<TaskSortKey>(() => loadInitialGlobalSort());

  // 200ms debounce on search string per D-18
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(filters.search);
    }, 200);

    return () => clearTimeout(timer);
  }, [filters.search]);

  const setFilter = <K extends keyof TaskFilterState>(key: K, value: TaskFilterState[K]) => {
    setFiltersState((prev) => ({ ...prev, [key]: value }));
  };

  const setFilters = (patch: Partial<TaskFilterState>) => {
    setFiltersState((prev) => ({ ...prev, ...patch }));
  };

  const resetFilters = () => {
    setFiltersState(DEFAULT_TASK_FILTER_STATE);
    setSortField(undefined);
    setSortOrder(undefined);
    // NOTE: globalSort is intentionally preserved across filter resets — it represents
    // a user preference, not a filter criterion.
  };

  const setSort = (field?: string, order?: 'ascend' | 'descend') => {
    setSortField(field);
    setSortOrder(order);
  };

  const setGlobalSort = (key: TaskSortKey) => {
    setGlobalSortState(key);
    try {
      localStorage.setItem(STORAGE_SORT_KEY, key);
    } catch (err) {
      console.warn('Failed to save task table sort preference:', err);
    }
  };

  const todayStr = useMemo(() => getTodayDateString(), []);

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const milestoneMap = useMemo(() => new Map(milestones.map((m) => [m.id, m])), [milestones]);

  const executionRangeStart = filters.executionDateRange?.[0];
  const executionRangeEnd = filters.executionDateRange?.[1];

  // Reactive Dexie query for execution date range (SRCH-01, D-05)
  const executionTaskIds = useLiveQuery(
    async () => {
      if (executionRangeStart && executionRangeEnd) {
        return await getTaskIdsWithAllocationsInRange(executionRangeStart, executionRangeEnd, db);
      }
      return null;
    },
    [executionRangeStart, executionRangeEnd, db]
  );

  const worklogRangeStart = filters.worklogDateRange?.[0];
  const worklogRangeEnd = filters.worklogDateRange?.[1];

  // Reactive Dexie query for worklog date range
  const worklogTaskIds = useLiveQuery(
    async () => {
      if (worklogRangeStart && worklogRangeEnd) {
        return await getTaskIdsWithWorkSessionsInRange(worklogRangeStart, worklogRangeEnd, db);
      }
      return null;
    },
    [worklogRangeStart, worklogRangeEnd, db]
  );

  const activeFilterCount = useMemo(() => countActiveAdvancedFilters(filters), [filters]);

  const filteredTasks = useMemo(() => {
    const effectiveFilterState: TaskFilterState = {
      ...filters,
      search: debouncedSearch,
    };
    const matched = filterTasks(tasks, effectiveFilterState, {
      todayStr,
      projectMap,
      milestoneMap,
      executionTaskIds: executionTaskIds ?? null,
      worklogTaskIds: worklogTaskIds ?? null,
    });
    return sortTasks(matched, sortField, sortOrder, globalSort);
  }, [
    tasks,
    filters,
    debouncedSearch,
    sortField,
    sortOrder,
    globalSort,
    todayStr,
    projectMap,
    milestoneMap,
    executionTaskIds,
    worklogTaskIds,
  ]);

  return {
    filters,
    setFilter,
    setFilters,
    resetFilters,
    debouncedSearch,
    filteredTasks,
    sortField,
    sortOrder,
    setSort,
    globalSort,
    setGlobalSort,
    activeFilterCount,
  };
}
