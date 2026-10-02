---
task: 261002-hmw-heatmap-timeline-and-worklog-filter
status: complete
completed: 2026-10-02
---

# Summary: Fix Heatmap Timeline Order & Add Worklog Date Range Filter

## Completed Changes
1. **Build Fix (`tests/components/TaskTable.test.tsx`)**:
   - Replaced invalid `workType: 'other'` with `'document'`.

2. **Heatmap Timeline Hour Ordering**:
   - `src/utils/analytics.ts`: In `aggregateProductivityHeatmap`, outer loop by hour (0..23) and inner loop by day (0..6) so output items are produced in chronological hour order.
   - `src/components/analytics/ProductivityHeatmapChart.tsx`: Added explicit `scale.x.domain` with sorted hours and `scale.y.domain` for Monday-Sunday.

3. **Task List Worklog Date Range Filter**:
   - `src/db/repositories/workSessionRepo.ts`: Added `getTaskIdsWithWorkSessionsInRange(startDate, endDate, db)`.
   - `src/utils/filter.ts`: Added `worklogDateRange` to `TaskFilterState`, `DEFAULT_TASK_FILTER_STATE`, `countActiveAdvancedFilters`, `FilterContext`, and filtering logic in `filterTasks`.
   - `src/hooks/useTaskFilters.ts`: Integrated reactive `useLiveQuery` to query matching tasks by `worklogDateRange`.
   - `src/components/tasks/TaskFilterBar.tsx`: Added DatePicker.RangePicker "Ngày có worklog" in the Advanced Filter panel.

## Verification
- `tests/components/TaskTable.test.tsx`: 8/8 passed
- `tests/utils/analytics.test.ts`: 8/8 passed
- `tests/utils/filter.test.ts`: 15/15 passed
- `tests/db/workSessionRepo.test.ts`: 11/11 passed
- Total targeted tests: 42 passed
- `npm run build`: Success
