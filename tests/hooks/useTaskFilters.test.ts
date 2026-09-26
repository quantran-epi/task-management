import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTaskFilters } from '../../src/hooks/useTaskFilters';
import type { Task } from '../../src/types/models';

const sampleTasks: Task[] = [
  {
    id: 't1',
    name: 'Write docs',
    status: 'Open',
    progress: 0,
    priority: 'Medium',
    estimateMinutes: 60,
    createdAt: '2026-09-20T10:00:00Z',
    updatedAt: '2026-09-20T10:00:00Z',
  },
  {
    id: 't2',
    name: 'Fix bug',
    status: 'In Progress',
    progress: 50,
    priority: 'Urgent',
    estimateMinutes: 30,
    createdAt: '2026-09-21T10:00:00Z',
    updatedAt: '2026-09-21T10:00:00Z',
  },
];

describe('useTaskFilters', () => {
  it('initializes with default filters and exposes filter updaters', () => {
    const { result } = renderHook(() => useTaskFilters(sampleTasks));

    expect(result.current.filters.search).toBe('');
    expect(result.current.filters.hierarchyScope).toBe('all');
    expect(result.current.filteredTasks).toHaveLength(2);

    act(() => {
      result.current.setFilter('search', 'Fix');
    });

    expect(result.current.filters.search).toBe('Fix');
  });

  it('debounces search by 200ms before filtering', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTaskFilters(sampleTasks));

    act(() => {
      result.current.setFilter('search', 'Fix');
    });

    // Before timer advances, debouncedSearch remains ''
    expect(result.current.debouncedSearch).toBe('');

    // Advance 200ms
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current.debouncedSearch).toBe('Fix');
    expect(result.current.filteredTasks.map((t) => t.id)).toEqual(['t2']);

    vi.useRealTimers();
  });
});
