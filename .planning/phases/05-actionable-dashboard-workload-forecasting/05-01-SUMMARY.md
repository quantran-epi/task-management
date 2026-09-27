---
phase: 05-actionable-dashboard-workload-forecasting
plan: 01
subsystem: dashboard
tags:
  - types
  - utils
  - routing
  - hash-route
  - sanitization
dependency_graph:
  requires:
    - src/types/models.ts
    - src/utils/capacity.ts
    - src/utils/date.ts
    - src/db/repositories/allocationRepo.ts
  provides:
    - src/types/dashboard.ts
    - src/utils/dashboard.ts
    - src/types/navigation.ts
    - src/hooks/useHashRoute.ts
  affects:
    - src/hooks/useDashboardForecast.ts
    - src/components/dashboard/*
    - src/views/DashboardView.tsx
tech_stack:
  added: []
  patterns:
    - Pure urgency categorization and sorting (overdue by days, due-today by priority, scheduled-today by minutes)
    - Drift-free date sequence generation using dayjs YYYY-MM-DD
    - URL hash query string parsing with route whitelist and calendar date sanitization
key_files:
  created:
    - src/types/dashboard.ts
    - src/utils/dashboard.ts
    - tests/utils/dashboard.test.ts
    - tests/hooks/useHashRoute.test.ts
  modified:
    - src/types/navigation.ts
    - src/hooks/useHashRoute.ts
decisions:
  - Add 'dashboard' to AppRoute union
  - Validate and sanitize 'date' query parameter using isValidCalendarDate to mitigate T-05-01 tampering
  - Whitelist hash route against AppRoute union defaulting to 'dashboard' to mitigate T-05-02
metrics:
  duration: 10m
  completed_date: "2026-09-27"
---

# Phase 05 Plan 01: Dashboard Types, Calculation Utilities & Hash Routing Summary

TypeScript contracts, pure domain calculation utilities, and sanitized hash routing query-parameter infrastructure for Phase 5 dashboard components.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Define dashboard types and implement pure categorization and horizon calculation utilities | b594a70 | `src/types/dashboard.ts`, `src/utils/dashboard.ts`, `tests/utils/dashboard.test.ts` |
| 2 | Extend useHashRoute with query parameter parsing, serialization, and input sanitization | f952436 | `src/types/navigation.ts`, `src/hooks/useHashRoute.ts`, `tests/hooks/useHashRoute.test.ts` |

## Key Changes

- **Contracts (`src/types/dashboard.ts`)**: Exported `ForecastHorizon` (7 | 14 | 30), `AttentionCategory`, `AttentionTaskItem`, `HorizonDayData`, and `DashboardForecastState`.
- **Domain Utilities (`src/utils/dashboard.ts`)**:
  - `categorizeAttentionTasks`: Filters inactive tasks via `isTaskActive` and groups tasks into Overdue (sorted by days overdue desc), Due Today (sorted by priority weight Urgent -> High -> Medium -> Low), and Scheduled Today (sorted by scheduled minutes desc).
  - `getHorizonDates`: Employs explicit Dayjs date arithmetic to produce YYYY-MM-DD calendar date sequences without timezone drift.
  - `calculateHorizonMetrics`: Computes effective capacity, allocated minutes, and excess overload minutes across horizon dates.
- **Navigation (`src/types/navigation.ts`, `src/hooks/useHashRoute.ts`)**:
  - Added `'dashboard'` to `AppRoute` union.
  - Added `parseHash` with route whitelisting and strict calendar date validation via `isValidCalendarDate` (mitigating T-05-01 and T-05-02).
  - Added `buildHash` supporting optional query parameters (e.g. `#/planner?date=2026-10-05`).
  - Updated `useHashRoute` hook to expose `route`, `params`, and parameterized `navigate`.
- **Test Coverage**:
  - `tests/utils/dashboard.test.ts`: 9 unit tests verifying categorization, status filtering, tie-breaking, empty allocations, and multi-horizon date spans.
  - `tests/hooks/useHashRoute.test.ts`: 7 unit tests verifying default route fallback, query parameter extraction, route whitelisting, and date parameter sanitization.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Used isValidCalendarDate for date parameter sanitization**
- **Found during:** Task 2 verification
- **Issue:** Using `dayjs(val, 'YYYY-MM-DD', true).isValid()` allowed datetime strings containing timestamps (e.g. `2026-10-05T12:00:00Z`).
- **Fix:** Switched to existing `isValidCalendarDate` validator from `src/utils/date.ts` which strictly requires regex `^\d{4}-\d{2}-\d{2}$` and Dayjs validation.
- **Files modified:** `src/hooks/useHashRoute.ts`
- **Commit:** `f952436`

## Self-Check: PASSED

- [x] `src/types/dashboard.ts` exists on disk
- [x] `src/utils/dashboard.ts` exists on disk
- [x] `tests/utils/dashboard.test.ts` exists on disk
- [x] `src/types/navigation.ts` updated
- [x] `src/hooks/useHashRoute.ts` updated
- [x] `tests/hooks/useHashRoute.test.ts` exists on disk
- [x] Commit `b594a70` exists
- [x] Commit `f952436` exists
