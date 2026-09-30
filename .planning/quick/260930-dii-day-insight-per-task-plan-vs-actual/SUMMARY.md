---
phase: quick
plan: 260930-dii
status: complete
subsystem: planner-analytics
tags:
  - day-insight
  - planned-vs-actual
  - work-sessions
  - capacity
requires: []
provides:
  - Per-task planned vs actual view for a single date (read-only)
  - workSessions Dexie queries by date (join + aggregate)
  - Reactive useDayInsight hook and DayInsightPanel component
  - Planner day-header trigger button that opens the Day Insight modal
affects:
  - Weekly planner day header (new insight button)
  - PlannerView (new modal wiring)
tech-stack:
  added: []
  patterns:
    - Pure merge/sort utility separated from React for direct Vitest coverage
    - useLiveQuery reactive read across allocations + sessions + capacity + projects
    - AntD Modal + Table + Progress reuse; no new dependencies
key-files:
  created:
    - src/utils/dayInsight.ts
    - src/utils/dayInsight.test.ts
    - src/hooks/useDayInsight.ts
    - src/components/planner/DayInsightPanel.tsx
    - tests/db/workSessionRepoDayInsight.test.ts
  modified:
    - src/db/repositories/workSessionRepo.ts
    - src/components/planner/DayColumnHeader.tsx
    - src/components/planner/DayColumn.tsx
    - src/views/PlannerView.tsx
metrics:
  duration: ~35m
  completed_date: "2026-09-30"
---

# Quick Plan 260930-dii: Day Insight — Per-Task Planned vs Actual Summary

Delivered a read-only Day Insight view for a single calendar date. The user
can now open any planner day column via a new BarChartOutlined button and see:

- Per task (rows): planned minutes (from `plannedAllocations`), actual
  minutes (sum of `workSessions.durationMinutes` for that date), and the
  signed delta.
- Totals: capacity, planned, actual, delta — with percent-of-capacity for
  planned and actual, and a color-coded delta tag (green when within ±15%
  of the planned total, warning when over, error when under).
- Empty state and a "Ngày nghỉ / không có sức chứa" info banner when
  capacity is zero.

Data sources are unchanged. The `workSessions` table already indexes on
`date` (schema V5), and `plannedAllocations` already indexes on `date`, so
both lookups are cheap. Capacity resolution reuses `getEffectiveDailyCapacity`
(rules + overrides). Task join and deleted-task fallback follow the same
pattern as `getAllocationsForDate` in `allocationRepo.ts`.

Merge/sort logic lives in `src/utils/dayInsight.ts` and is covered by
`dayInsight.test.ts` (8 unit tests). Repo-level joins and aggregation are
covered by `tests/db/workSessionRepoDayInsight.test.ts` (4 tests via
fake-indexeddb).

## Verification

- `npx vitest run src/utils/dayInsight.test.ts` — 8/8 pass
- `npx vitest run tests/db/workSessionRepoDayInsight.test.ts` — 4/4 pass
- `npx vitest run tests/db/workSessionRepo.test.ts tests/components/DayColumnHeader.test.tsx`
  — 14/14 pass (existing coverage still green after DayColumnHeader button
  addition)
- `npx tsc --noEmit` — clean

Two pre-existing test failures in the full suite (`tests/utils/filter.test.ts`
`sortTasks` case and `tests/views/PlannerView.test.tsx` pwa-register virtual
import) are unrelated to this task and were present before this work.

## Deliberately skipped

- No CSV export from the modal.
- No cross-day trend chart — planner already visualizes weekly load.
- No per-work-type split at row level.
- Optional Dashboard "Chi tiết hôm nay" button not added; a single planner
  entry point covers the need without over-fanning UI surfaces.
