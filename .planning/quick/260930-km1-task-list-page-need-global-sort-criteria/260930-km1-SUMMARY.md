---
phase: quick
plan: 260930-km1
subsystem: tasks-view
tags: [ui, sort, persistence, ant-design]
dependency_graph:
  requires: [useTaskFilters, sortTasks, TaskTable]
  provides: [TASK_SORT_OPTIONS, TaskSortKey, DEFAULT_TASK_SORT, STORAGE_SORT_KEY]
  affects: [TasksView, TaskTable]
tech_stack:
  added: []
  patterns: [localStorage-persistence, FOUC-safe-hydration, exactOptionalPropertyTypes]
key_files:
  created: []
  modified:
    - src/utils/filter.ts
    - src/hooks/useTaskFilters.ts
    - src/views/TasksView.tsx
    - src/components/tasks/TaskTable.tsx
decisions:
  - Global sort acts as default ordering; Ant Table per-column sorter still overrides for that render
  - `resetFilters` preserves globalSort — it is a user preference, not a filter criterion
  - Deadline sorts keep nulls last in both ascending and descending directions to avoid dumping unset deadlines at the top when descending
metrics:
  duration_min: 10
  tasks: 1
  files: 4
  completed_at: 2026-09-30T08:10:00Z
requirements:
  - TASK-TABLE-GLOBAL-SORT
  - PRESERVE-COLUMN-SORTER-BEHAVIOR
  - PERSIST-SORT-PREFERENCE
---

# Quick 260930-km1: Task List Page — Global Sort Criteria Summary

Added a global sort Select to the TaskTable toolbar with 10 Vietnamese-labelled criteria (Created / Updated / Deadline / Priority / Name — asc & desc), persisted under `planner:task_table_sort`, applied as the pre-sort order feeding Ant Table while leaving existing per-column sorters untouched.

## What Changed

### `src/utils/filter.ts`

- Exported `TaskSortKey` union (10 keys), `TASK_SORT_OPTIONS` (Vietnamese labels in the order specified by the plan), and `DEFAULT_TASK_SORT = 'deadline_asc'`.
- Extracted `compareByGlobalSort(a, b, key)` helper covering all 10 keys. `createdAt` / `updatedAt` use ISO string `localeCompare`; `deadline` keeps nulls-last for both directions; `priority` uses existing `PRIORITY_WEIGHTS`; `name` uses `localeCompare(a.name, b.name, 'vi', { sensitivity: 'base' })`.
- Widened `sortTasks` signature to `sortTasks(tasks, sortField?, sortOrder?, globalSort?)`. Existing per-column branch untouched (backwards compatible). When `sortField` absent, uses `globalSort ?? DEFAULT_TASK_SORT`. Tiebreaker: task name ascending.

### `src/hooks/useTaskFilters.ts`

- Added `STORAGE_SORT_KEY = 'planner:task_table_sort'` module constant (exported for tests/reuse).
- `loadInitialGlobalSort()` reads localStorage synchronously with try/catch, validates against `TASK_SORT_OPTIONS`, falls back to `DEFAULT_TASK_SORT`. Matches FOUC-safe pattern used for `planner:task_table_columns` in `TaskTable`.
- Added `globalSort` state and `setGlobalSort(key)` that writes to state and mirrors to localStorage (try/catch with `console.warn` on failure).
- Extended `UseTaskFiltersReturn` with `globalSort` and `setGlobalSort`.
- Passed `globalSort` as the fourth argument to `sortTasks` inside the `filteredTasks` `useMemo` and added it to the dependency array.
- `resetFilters` intentionally does NOT touch `globalSort` — inline comment explains persistence intent.

### `src/views/TasksView.tsx`

- Destructured `globalSort` and `setGlobalSort` from `useTaskFilters` and forwarded them to `<TaskTable>` as `globalSort` and `onGlobalSortChange`.

### `src/components/tasks/TaskTable.tsx`

- Added `Select` to the `antd` import list; imported `TASK_SORT_OPTIONS`, `DEFAULT_TASK_SORT`, and `TaskSortKey` from `../../utils/filter`.
- Extended `TaskTableProps` with optional `globalSort?: TaskSortKey` and `onGlobalSortChange?: (key: TaskSortKey) => void` (preserves `exactOptionalPropertyTypes`).
- Inserted a labelled `<Select>` inside the existing toolbar `<Space size="middle">`, before the "Tùy biến cột" `Popover`:
  - Prefix span "Sắp xếp theo" with `token.colorTextSecondary`, `fontSize: 13`.
  - `Select` size middle, width 200, `value={globalSort ?? DEFAULT_TASK_SORT}`, options spread from `TASK_SORT_OPTIONS`, `aria-label="Sắp xếp danh sách tác vụ"`.
  - JSDoc comment above states: "Global sort applies to the pre-sorted dataSource; per-column sorter clicks override for that render."

## Verification

- `npm run build` — `tsc && vite build` completed with no TypeScript errors. Vite bundled `dist/assets/index-CGYq_g4t.js` at 1867.80 kB (unchanged bundle profile aside from tiny sort helper delta).
- Ant Table per-column `sorter` handlers left in place; when a column header is active, Ant Table's internal `sortOrder` re-sorts the passed `dataSource` — global sort acts as default ordering only.

## Deviations from Plan

None — plan executed as written. One minor structural tidy: moved `STORAGE_SORT_KEY` + `loadInitialGlobalSort` below the import group in `useTaskFilters.ts` after they were initially placed mid-imports, keeping module ordering clean.

## Commits

- `2111c95` feat(quick-260930-km1): add global sort Select to TaskTable toolbar

## Manual Smoke (recommended)

1. Open `/#/tasks`, cycle through all 10 options in the "Sắp xếp theo" Select — task list re-orders each time.
2. Reload page — chosen option persists.
3. Click the Deadline column header — its per-column sorter overrides visually.
4. Click "Đặt lại bộ lọc" in the filter bar — global sort choice remains.

## Self-Check: PASSED

- FOUND: `src/utils/filter.ts` (exports `TaskSortKey`, `TASK_SORT_OPTIONS`, `DEFAULT_TASK_SORT`, extended `sortTasks`)
- FOUND: `src/hooks/useTaskFilters.ts` (`STORAGE_SORT_KEY`, `globalSort`, `setGlobalSort`)
- FOUND: `src/views/TasksView.tsx` (globalSort + setGlobalSort wired into `<TaskTable>`)
- FOUND: `src/components/tasks/TaskTable.tsx` ("Sắp xếp theo" Select in toolbar)
- FOUND: commit `2111c95`
