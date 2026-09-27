---
phase: 05-actionable-dashboard-workload-forecasting
plan: 02
subsystem: dashboard
tags:
  - components
  - dashboard
  - kpi
  - attention-list
  - inline-controls
dependency_graph:
  requires:
    - src/types/dashboard.ts
    - src/utils/capacity.ts
    - src/utils/time.ts
    - src/components/tasks/InlineStatusTag.tsx
    - src/db/repositories/taskRepo.ts
  provides:
    - src/components/dashboard/TodaySummaryCard.tsx
    - src/components/dashboard/AttentionTodayList.tsx
  affects:
    - src/views/DashboardView.tsx
tech_stack:
  added: []
  patterns:
    - Dual-encoded load status badges with Ant Design Tag (color + icon + text) adhering to WCAG 2.1 AA
    - Bounded internal scroll containers (maxHeight 360px) preventing layout overflow
    - Direct inline state modification with optimistic UI and toast feedback
key_files:
  created:
    - src/components/dashboard/TodaySummaryCard.tsx
    - src/components/dashboard/AttentionTodayList.tsx
    - tests/components/TodaySummaryCard.test.tsx
    - tests/components/AttentionTodayList.test.tsx
  modified: []
decisions:
  - Used LOAD_STATUS_CONFIG and LOAD_STROKE_COLORS dual-encoding for TodaySummaryCard progress and tags
  - Built contextual rest day Alert (0m capacity) and empty schedule Alert (0m active allocation) with direct CTA
  - Embedded 360px maxHeight scroll boundary in AttentionTodayList to mitigate T-05-04 denial of service
metrics:
  duration: 12m
  completed_date: "2026-09-27"
---

# Phase 05 Plan 02: Today Focus Area Components Summary

Top Tier Today focus area components: TodaySummaryCard (KPI metrics, utilization progress, 4-state load badge, contextual alerts, planner CTA) and AttentionTodayList (grouped urgency items, inline status dropdown, mark-done checkbox, and drawer triggers).

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Build TodaySummaryCard component with KPI statistics, progress bar, 4-state load badge, and CTA | 66cee1f | `src/components/dashboard/TodaySummaryCard.tsx`, `tests/components/TodaySummaryCard.test.tsx` |
| 2 | Build AttentionTodayList component with urgency grouping, inline controls, and drawer trigger | 23c3d33 | `src/components/dashboard/AttentionTodayList.tsx`, `tests/components/AttentionTodayList.test.tsx` |

## Key Changes

- **`TodaySummaryCard` (`src/components/dashboard/TodaySummaryCard.tsx`)**:
  - Displays formatted calendar date, scheduled task count tag, and planned time vs effective capacity formatted via `formatMinutes`.
  - Utilization `Progress` bar with stroke colors mapped per 4-state semantic load status (green, orange, red, gray).
  - 4-state dual-encoded load status badge (`Khả dụng`, `Bận`, `Quá tải`, `Nghỉ`) combining text, color, and icons for WCAG 2.1 AA compliance.
  - Contextual alerts for rest days (0m capacity) and empty schedule days (0m allocated) with primary action buttons.
  - Primary button `Mở Hôm nay trong Lịch` with `CalendarOutlined` triggering planner navigation.
- **`AttentionTodayList` (`src/components/dashboard/AttentionTodayList.tsx`)**:
  - Bounded container with `maxHeight: 360px` and `overflowY: 'auto'` preventing page overflow (mitigating T-05-04).
  - Header badge count and `Xem tất cả tác vụ` button.
  - Urgency categorization badges: Overdue (`Quá hạn X ngày`), Due Today (`Đến hạn hôm nay` + priority badge), and Scheduled Today (`Lên lịch Xh Ym`).
  - Inline completion checkbox toggling task status between `Done` and `Open` via `updateTaskStatus`.
  - Integrated `InlineStatusTag` dropdown for instant status adjustments.
  - Clickable task title triggering `onTaskClick` for in-place drawer inspection.
- **Unit Testing**:
  - `tests/components/TodaySummaryCard.test.tsx`: 6 unit tests covering standard metrics, busy state, overload state, rest day alert, clear schedule alert with CTA, and null safety.
  - `tests/components/AttentionTodayList.test.tsx`: 7 unit tests covering empty state, category badges, scroll constraint, drawer callback, mark-done toggle, uncheck done toggle, and view-all button.

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- [x] `src/components/dashboard/TodaySummaryCard.tsx` exists on disk
- [x] `src/components/dashboard/AttentionTodayList.tsx` exists on disk
- [x] `tests/components/TodaySummaryCard.test.tsx` exists on disk
- [x] `tests/components/AttentionTodayList.test.tsx` exists on disk
- [x] Commit `66cee1f` exists
- [x] Commit `23c3d33` exists
