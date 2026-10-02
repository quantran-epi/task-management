---
task: 261002-hmw-heatmap-timeline-and-worklog-filter
created: 2026-10-02
status: in_progress
---

# Quick Task: Fix Heatmap Timeline Order & Add Worklog Date Range Filter

## Goals
1. Fix test failure in `tests/components/TaskTable.test.tsx` (`workType: 'other'` -> `'document'`).
2. Fix heatmap chart timeline hour ordering in `src/utils/analytics.ts` and `src/components/analytics/ProductivityHeatmapChart.tsx` so hours are strictly chronological (`00:00` - `23:00`).
3. Add worklog date range filter in task list advanced filter:
   - `src/db/repositories/workSessionRepo.ts`: `getTaskIdsWithWorkSessionsInRange(start, end, db)`
   - `src/utils/filter.ts`: add `worklogDateRange` to `TaskFilterState`, `DEFAULT_TASK_FILTER_STATE`, `countActiveAdvancedFilters`, `FilterContext`, `filterTasks`
   - `src/hooks/useTaskFilters.ts`: live query `worklogTaskIds`
   - `src/components/tasks/TaskFilterBar.tsx`: RangePicker for worklog date range

## Targeted Verification
- `npx vitest run tests/components/TaskTable.test.tsx`
- `npx vitest run tests/utils/analytics.test.ts`
- `npx vitest run tests/utils/filter.test.ts`
- `npx vitest run tests/db/workSessionRepo.test.ts`
- `npm run build`
