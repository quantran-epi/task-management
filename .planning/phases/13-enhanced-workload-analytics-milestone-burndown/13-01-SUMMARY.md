---
phase: 13-enhanced-workload-analytics-milestone-burndown
plan: "01"
subsystem: analytics
tags:
  - analytics
  - burndown
  - velocity
  - routing
  - inheritance
dependency_graph:
  requires:
    - src/types/models.ts
    - src/domain/inheritance.ts
  provides:
    - src/types/analytics.ts
    - src/utils/analytics.ts
  affects:
    - src/types/navigation.ts
    - src/hooks/useHashRoute.ts
    - src/components/shell/Navigation.tsx
    - src/App.tsx
    - src/views/ProjectsView.tsx
tech_stack:
  added: []
  patterns:
    - Linear burndown with ideal pace and actual progress clamping
    - Rolling window weekly velocity aggregation
    - Tag inheritance resolution for stakeholder workload allocation
key_files:
  created:
    - src/types/analytics.ts
    - src/utils/analytics.ts
    - tests/utils/analytics.test.ts
  modified:
    - src/types/navigation.ts
    - src/hooks/useHashRoute.ts
    - src/components/shell/Navigation.tsx
    - src/App.tsx
    - src/views/ProjectsView.tsx
    - src/components/projects/ProjectTable.tsx
    - tests/hooks/useHashRoute.test.ts
decisions:
  - "Added 'analytics' route to AppRoute and useHashRoute with milestoneId parameter sanitization"
  - "Milestone burndown ideal line slopes from totalScope to 0; actualRemaining clamps at todayStr"
  - "Completion velocity calculates completed tasks and hours across 2, 4, 8, 12 week rolling windows"
  - "Stakeholder workload aggregates active tasks by Ops Owner, BA, and Work Type honoring tag inheritance"
metrics:
  duration: 6m
  completed_date: "2026-09-30"
status: complete
actuals:
  tokens: 41200
  tasks: 3
  commits: 3
plan_head_before: a86987156912c2636899859c02d87af415bf11c0
plan_head_after: 59bb364966e499c5d00616252a0ee616f2035a80
---

# Phase 13 Plan 01: Foundational Analytics Data Contracts & Routing Summary

Foundational analytics routing, data contracts, and pure mathematical calculation engine for milestone burndown, delivery velocity, and stakeholder workload allocation.

## Key Changes

1. **End-to-End Navigation & Routing (Tracer Slice)**:
   - Added `'analytics'` to `AppRoute` union and `VALID_ROUTES` in `src/hooks/useHashRoute.ts`.
   - Implemented parameter sanitization for `milestoneId` to protect against parameter tampering (T-13-01).
   - Added sidebar menu item 'Phân tích' with `BarChartOutlined` before 'Cài đặt' in `Navigation.tsx`.
   - Wired placeholder view container in `App.tsx` and 'Burndown' action button in `ProjectTable.tsx` / `ProjectsView.tsx` navigating to `#/analytics?milestoneId=...`.

2. **Data Contracts & Burndown Calculation Engine**:
   - Defined `BurndownUnit`, `BurndownDayPoint`, `MilestoneBurndownSeries`, `VelocityWindowWeeks`, `WeeklyVelocityBucket`, `ProjectStatusMetrics`, `WorkloadDimension`, and `WorkloadDistributionItem` in `src/types/analytics.ts`.
   - Implemented `calculateMilestoneBurndown` in `src/utils/analytics.ts` supporting both 'hours' and 'count' units, linear ideal pace line, 14-day deadline fallback (D-02), and clamping actual line points at `todayStr` (D-03).
   - Added DoS protection by clamping milestone duration to a maximum of 365 days (T-13-02).

3. **Completion Velocity & Stakeholder Workload Aggregators**:
   - Implemented `calculateCompletionVelocity` calculating rolling weekly buckets and averages across 2, 4, 8, and 12 week windows (D-05, D-06, D-08).
   - Implemented `calculateProjectStatusMetrics` aggregating status counts, open task counts, and remaining hours per project (D-07).
   - Implemented `calculateStakeholderWorkload` grouping tasks by Ops Owner, BA, or Work Type, utilizing `resolveInheritedTags` from `src/domain/inheritance.ts` to attribute tasks with inherited tags and unassigned fallbacks (D-09, D-10, D-11).

## Verification Results

- `npx vitest run tests/hooks/useHashRoute.test.ts`: Passed (21/21 tests).
- `npx vitest run tests/utils/analytics.test.ts`: Passed (11/11 tests).

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- All created files exist (`src/types/analytics.ts`, `src/utils/analytics.ts`, `tests/utils/analytics.test.ts`).
- All 3 task commits exist in git history (`1199042`, `532173f`, `59bb364`).
