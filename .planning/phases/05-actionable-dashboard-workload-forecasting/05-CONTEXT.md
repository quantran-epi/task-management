# Phase 5: Actionable Dashboard & Workload Forecasting - Context

**Gathered:** 2026-09-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 5 delivers actionable dashboard views covering today's focus, urgent work, and workload forecasting across 7-day, 14-day, and next-month horizons. It provides high-visibility workload metrics, overload detection banners, and direct clickable links that immediately navigate to targeted tasks or planning dates in PlannerView.

Requirements covered: DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DASH-06.

</domain>

<decisions>
## Implementation Decisions

### Dashboard Layout & Shell Integration
- **D-01:** Stacked 2-Tier layout:
  - Top tier: Today focus area (Today Summary KPI card on the left/top + Attention Task List).
  - Bottom tier: Workload Forecast section containing Horizon switchers, Overload Alert banner, and Mini Day Cards grid.
  - Responsive stacking: On desktop, top tier presents side-by-side or balanced grid; on mobile/narrow screens, elements stack cleanly.
- **D-02:** Dashboard as default landing route:
  - `AppRoute` updated to include `'dashboard' | 'tasks' | 'projects' | 'planner' | 'settings'`.
  - App default route set to `dashboard` (visiting `/#/` or root URL navigates to `/#/dashboard`).
  - First menu item on the Sidebar Navigation is `Dashboard` with `<DashboardOutlined />` icon.
- **D-03:** Today Summary KPI card:
  - Ant Design `Card` with `Statistic` metrics displaying Planned Time vs Effective Capacity (`Xh Ym / Zh Wm`).
  - Mini Ant Design `Progress` bar displaying percentage of capacity utilized.
  - Dual-encoded load status badge (Available, Busy, Overloaded, No-Capacity) with icon, text label, and color conforming to WCAG 2.1 AA.
  - Count of tasks scheduled for today.
- **D-04:** Contextual empty/rest day handling for Today:
  - Zero-capacity days (weekends, approved leave overrides): Displays subtle "Rest Day / Leave" indicator with zero capacity explanation.
  - Working days with 0 planned tasks: Displays "All clear — Xh available for planning" with a primary CTA button to open Planner.

### Workload Forecasting Horizons (7-day, 14-day, next-month)
- **D-05:** Segmented Horizon Switcher:
  - Ant Design `Segmented` control toggling between `Next 7 Days` (default), `Next 14 Days`, and `Next 30 Days`.
  - Smooth client-side switching without page reload or layout thrashing.
- **D-06:** Mini Day Cards Grid:
  - Grid of compact daily cards representing each date in the selected horizon.
  - Each day card shows: formatted date (`MMM D`), day of week (`Mon`, `Tue`), mini progress bar, allocated vs capacity hours, and dual-encoded 4-state badge (Available, Busy, Overloaded, No-Capacity).
  - Cards for overloaded days feature clear warning styling and overload delta (`+Xh Ym`).
- **D-07:** Dedicated Overload Alert Banner:
  - Prominent Ant Design `Alert` (warning/error) displayed above the day grid whenever the active horizon contains overloaded dates.
  - Summary text stating total overloaded dates and total excess hours.
  - Interactive clickable chips for each overloaded date allowing direct focus or jump.
- **D-08:** Next Month Horizon definition:
  - Defined as a rolling 30-day projection starting from `today` (`today` through `today + 30 days`), ensuring uninterrupted forward visibility regardless of calendar month boundaries.

### Attention Today & Urgent Task Criteria
- **D-09:** "Attention Today" task criteria (DASH-01):
  - Strict inclusion of active tasks (excluding `Done` and `Cancelled`) matching any of:
    1. Overdue: `dueDate < today`
    2. Due Today: `dueDate === today`
    3. Scheduled Today: has an active planning allocation record on `today`
- **D-10:** Grouped Urgency Ordering:
  - Displayed in urgency groups:
    1. Overdue items at the top, sorted by days overdue descending (most overdue first).
    2. Due Today items, sorted by `priority` ('High' -> 'Medium' -> 'Low').
    3. Scheduled Today items, sorted by allocated minutes descending.
- **D-11:** Inline Quick Actions & Links (DASH-06, TASK-06):
  - Direct Mark Done checkbox/button on each attention item.
  - Compact status update dropdown for fast state changes.
  - Task title is a clickable link opening `TaskDrawer` in-place on the Dashboard.
- **D-12:** Scrollable container with max height:
  - Attention list constrained to max-height (~350px-400px) with internal scrolling to prevent pushing the forecast section below the fold.
  - Header displays total count badge and includes a quick link "View all in Tasks" navigating to `TasksView`.

### Actionable Navigation & Deep Linking
- **D-13:** Date navigation to PlannerView (DASH-06):
  - Clicking any Day Card in the forecast grid or any overloaded date chip navigates directly to `/#/planner?date=YYYY-MM-DD`.
  - `PlannerView` and `WeekNavigator` parse the target date parameter and automatically jump to the week containing that date.
- **D-14:** In-place TaskDrawer inspection:
  - Clicking a task title in the Attention list opens `TaskDrawer` directly within `DashboardView`.
  - Full details, notes, links, and the Planning tab are accessible without losing Dashboard scroll or filters.
- **D-15:** Today Card CTA:
  - Prominent "Open Today in Planner" action button on the Today Summary card immediately jumps to `PlannerView` focused on current week.
- **D-16:** Deep Linking URL query support:
  - `useHashRoute` hook extended to support query parameters attached to the hash (e.g. `/#/planner?date=2026-09-27`).
  - Survives page reload (F5) and enables direct bookmarking of specific planning weeks.

### Claude's Discretion
- Visual styling tokens, card padding, and breakpoint thresholds for Ant Design responsive layout.
- Implementation details of pure date projection helper functions (`getProjectionDates`, `getHorizonMetrics`).
- Loading skeletons while live queries resolve IndexedDB records.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/ROADMAP.md` § Phase 5 — Goals, requirements, and success criteria for Actionable Dashboard & Workload Forecasting.
- `.planning/REQUIREMENTS.md` § Dashboard — Requirements DASH-01 through DASH-06.
- `CLAUDE.md` — Core technical stack (React 19, Ant Design 6, Dexie 4, Dayjs, strict TypeScript).

### Prior Context & Established Logic
- `.planning/phases/03-capacity-model-daily-planning-ledger/03-CONTEXT.md` — Weekly capacity rules, date overrides, 4-state load metrics (PLAN-04), and active load filtering excluding Done/Cancelled (PLAN-05).
- `.planning/phases/04-feasibility-engine-workload-distribution/04-CONTEXT.md` — Feasibility calculations and candidate distributions.
- `src/utils/capacity.ts` — `getEffectiveDailyCapacity`, `calculateDayMetrics`, and `DailyLoadState` definitions.
- `src/utils/date.ts` — Date formatting and comparison utilities (`YYYY-MM-DD`).
- `src/utils/time.ts` — `formatMinutes` (`Xh Ym`).
- `src/db/repositories/allocationRepo.ts` — `getAllocationsForDateRange`, daily load calculations.
- `src/db/repositories/taskRepo.ts` — Task querying, status updating.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/utils/capacity.ts` — `getEffectiveDailyCapacity` and `calculateDayMetrics` provide immediate calculation of available, busy, overloaded, and no-capacity states.
- `src/components/shell/StatusBadge.tsx` — Status badge visual representation.
- `src/components/tasks/InlineStatusTag.tsx` & `src/components/tasks/InlineProgress.tsx` — Fast inline task status and progress controls.
- `src/components/tasks/TaskDrawer.tsx` — Full task inspection and editing drawer, including `TaskDrawerPlanning`.
- `src/hooks/useWeeklyPlanner.ts` — Weekly load calculation patterns; can be adapted or complemented with horizon projection calculations.
- `src/hooks/useHashRoute.ts` — Client-side hash routing hook; target for query param extension.

### Established Patterns
- All dates are canonical `YYYY-MM-DD` strings; durations are non-negative integer minutes.
- Dexie `useLiveQuery` reactive subscriptions for instantaneous UI updates when tasks or allocations change.
- Ant Design 6 design system with dual-encoded accessibility badges (color + text + icon).
- Hash-based navigation (`/#/...`) compatible with GitHub Pages static hosting.

### Integration Points
- `src/types/navigation.ts` — Add `'dashboard'` to `AppRoute`.
- `src/components/shell/Navigation.tsx` — Add `Dashboard` menu item at the top.
- `src/hooks/useHashRoute.ts` — Support query params e.g. `?date=YYYY-MM-DD`.
- `src/views/DashboardView.tsx` — New view housing Today focus, Attention list, and Forecast horizons.
- `src/views/PlannerView.tsx` — Accept `targetDate` from query params to synchronize `WeekNavigator`.
- `src/App.tsx` — Default route to `'dashboard'`, render `DashboardView`.

</code_context>

<specifics>
## Specific Ideas
- Segmented control (`Next 7 Days` | `Next 14 Days` | `Next 30 Days`) keeps projection horizon clean and actionable without overwhelming scrolling.
- Overload Alert banner with date chips turns raw forecasting numbers into instant, clickable triage actions.
- In-place TaskDrawer opening on the Dashboard allows quick edits to urgent tasks without losing dashboard orientation.

</specifics>

<deferred>
## Deferred Ideas
- Multi-task batch auto-scheduling across an entire milestone (v2 backlog).
- Auto-rebalancing existing allocations when high-priority urgent work arrives (v2 backlog).
- Personal task templates and saved filter presets (v2 PROD-01, PROD-02).

</deferred>

---

*Phase: 05-Actionable Dashboard & Workload Forecasting*
*Context gathered: 2026-09-27*
