---
task: remove-analytics
created: 2026-10-02
status: complete
---

# Quick Task Summary: Remove Analytics Page and Items

## Accomplishments
- Removed `src/views/AnalyticsView.tsx`
- Removed all analytics components in `src/components/analytics/`:
  - `BurndownSvgChart.tsx`
  - `StackedStatusBar.tsx`
  - `VelocityTrendChart.tsx`
  - `WorkloadProportionBar.tsx`
- Removed `src/utils/analytics.ts` and `src/types/analytics.ts`
- Removed all analytics tests:
  - `tests/views/AnalyticsView.test.tsx`
  - `tests/utils/analytics.test.ts`
  - `tests/components/analytics/BurndownSvgChart.test.tsx`
  - `tests/components/analytics/StackedStatusBar.test.tsx`
  - `tests/components/analytics/WorkloadProportionBar.test.tsx`
- Cleaned integration references:
  - `src/types/navigation.ts`: removed `'analytics'` route
  - `src/hooks/useHashRoute.ts`: removed `'analytics'` route whitelist
  - `src/components/shell/Navigation.tsx`: removed analytics menu entry
  - `src/components/projects/ProjectTable.tsx`: removed Burndown action button
  - `src/views/ProjectsView.tsx`: cleaned unused navigation prop
  - `src/App.tsx`: removed analytics route handler and import
  - `tests/shell.test.tsx` & `tests/hooks/useHashRoute.test.ts`: removed analytics assertions
- Targeted tests (17/17 passed) and production build verified cleanly.
