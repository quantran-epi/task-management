---
task: remove-analytics
created: 2026-10-02
status: in_progress
---

# Quick Task: Remove Analytics Page and Items

## Goal
Completely remove analytics page, components, calculations, tests, and navigation references.

## Actions
1. Remove `src/views/AnalyticsView.tsx`
2. Remove `src/components/analytics/` directory (`BurndownSvgChart.tsx`, `StackedStatusBar.tsx`, `VelocityTrendChart.tsx`, `WorkloadProportionBar.tsx`)
3. Remove `src/utils/analytics.ts`
4. Remove `src/types/analytics.ts`
5. Remove all related tests:
   - `tests/utils/analytics.test.ts`
   - `tests/components/analytics/` directory
6. Update application integration:
   - `src/types/navigation.ts`: remove `'analytics'` from `AppRoute`
   - `src/hooks/useHashRoute.ts`: remove `'analytics'` from `VALID_ROUTES` and milestoneId sanitization if only used for analytics
   - `src/components/shell/Navigation.tsx`: remove analytics menu item
   - `src/components/projects/ProjectTable.tsx`: remove Burndown button navigating to analytics
   - `src/App.tsx`: remove `AnalyticsView` import and route branch
   - Update tests referencing analytics routes (`tests/shell.test.tsx`, `tests/hooks/useHashRoute.test.ts`)
7. Verify clean build and test suite pass.
