import { useState, useEffect, useMemo } from 'react';
import type { Task } from '../types/models';
import {
  filterTasks,
  sortTasks,
  DEFAULT_TASK_FILTER_STATE,
  type TaskFilterState,
} from '../utils/filter';
import { getTodayDateString } from '../utils/date';

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
}

export function useTaskFilters(tasks: Task[] = []): UseTaskFiltersReturn {
  const [filters, setFiltersState] = useState<TaskFilterState>(DEFAULT_TASK_FILTER_STATE);
  const [debouncedSearch, setDebouncedSearch] = useState<string>(filters.search);
  const [sortField, setSortField] = useState<string | undefined>(undefined);
  const [sortOrder, setSortOrder] = useState<'ascend' | 'descend' | undefined>(undefined);

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
  };

  const setSort = (field?: string, order?: 'ascend' | 'descend') => {
    setSortField(field);
    setSortOrder(order);
  };

  const todayStr = useMemo(() => getTodayDateString(), []);

  const filteredTasks = useMemo(() => {
    const effectiveFilterState: TaskFilterState = {
      ...filters,
      search: debouncedSearch,
    };
    const matched = filterTasks(tasks, effectiveFilterState, todayStr);
    return sortTasks(matched, sortField, sortOrder);
  }, [tasks, filters, debouncedSearch, sortField, sortOrder, todayStr]);

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
  };
}
