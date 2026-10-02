# Quick Task Summary: 261002-t9m-filter-charts-to-only-show-items-with-da

## Objective
Filter all 3 charts to only show items that have data (> 0 hours / minutes) and hide zero/empty items.

## Changes
1. `src/utils/analytics.ts`:
   - `aggregateEstimateVsActual`: only emits `{ task, type, hours }` when `hours > 0`. Tasks with 0 actual or 0 estimate do not produce zero-height bars.
   - `aggregateWorkTypeBreakdown`: filters out entries where `minutes <= 0` or `hours <= 0`.
   - `aggregateProductivityHeatmap`: skips all 0-minute day/hour combinations so only active work slots are returned.
2. `src/components/analytics/ProductivityHeatmapChart.tsx`:
   - Checks `data.length === 0` to display empty state when no active slots exist.
3. `tests/utils/analytics.test.ts`:
   - Updated heatmap test to assert all returned cells have `minutes > 0`.
   - Added test ensuring 0-hour items are excluded from estimate vs actual chart data.
