# Phase 5: Actionable Dashboard & Workload Forecasting - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-27
**Phase:** 5-Actionable Dashboard & Workload Forecasting
**Areas discussed:** Dashboard Layout, Forecast Visuals, Attention & Urgency, Actionable Navigation

---

## Dashboard Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Stacked 2-Tier (Recommended) | Top tier: Hero cards (Today summary + Urgent tasks banner); Bottom tier: Workload Forecast horizons. Responsive across desktop and mobile. | ✓ |
| 2-Column Split | Left: Today status + Attention task list; Right: Forecast charts/tables. | |
| Tabbed Sections | Ant Design Tabs toggling between Today/Urgent and Forecast views. | |

**User's choice:** Stacked 2-Tier (Recommended)
**Notes:** User confirmed 2-tier stacked arrangement for top-down scannability.

---

## Default Route & Navigation

| Option | Description | Selected |
|--------|-------------|----------|
| Dashboard Default (Recommended) | Set Dashboard as default landing route (`/#/` or `/#/dashboard`). First item in Sidebar Navigation. Satisfies DASH-01/DASH-02 landing view criteria. | ✓ |
| Keep Tasks Default | Keep `/#/tasks` as default, Dashboard is a separate menu item. | |

**User's choice:** Dashboard Default (Recommended)
**Notes:** Dashboard is primary landing point when opening the application.

---

## Today Summary Card

| Option | Description | Selected |
|--------|-------------|----------|
| KPI + Progress Bar (Recommended) | Ant Design Card with Statistic + Progress bar: Allocated / Capacity hours, dual-encoded load badge, and today's task count. | ✓ |
| Full Schedule List | Includes full list of every task allocated today with inline sliders. | |
| Minimal Alert Banner | Simple Alert banner with overload/available hours and link. | |

**User's choice:** KPI + Progress Bar (Recommended)
**Notes:** Compact, accessible, and informative without clutter.

---

## Empty & Rest Day State for Today

| Option | Description | Selected |
|--------|-------------|----------|
| Contextual State (Recommended) | Differentiates Rest Day (0h capacity) from working day with 0 planned tasks ("All clear — Xh available"). | ✓ |
| Generic Empty Component | Ant Design Empty component with generic illustration. | |

**User's choice:** Contextual State (Recommended)
**Notes:** Provides clear context whether 0 load is due to leave/weekend or unscheduled work time.

---

## Forecast Visuals - Horizon Switching

| Option | Description | Selected |
|--------|-------------|----------|
| Segmented Horizon Switcher (Recommended) | Ant Design Segmented control ('Next 7 Days' | 'Next 14 Days' | 'Next 30 Days') with 7-day default. | ✓ |
| Stacked All 3 Horizons | All 3 horizons displayed vertically one after another. | |
| Collapsible Accordion Panels | Ant Design Collapse with 7-day open, 14-day and 30-day collapsed. | |

**User's choice:** Segmented Horizon Switcher (Recommended)
**Notes:** Keeps the forecasting interface focused and prevents information duplication.

---

## Forecast Visuals - Daily Load Representation

| Option | Description | Selected |
|--------|-------------|----------|
| Mini Day Cards Grid (Recommended) | Responsive grid of compact day cards with date, day of week, mini progress bar, allocated vs capacity, and dual-encoded 4-state badges. | ✓ |
| Calendar Heatmap Strip | Compact colored squares with hover tooltips. | |
| Data Table List | Standard tabular listing with sorting. | |

**User's choice:** Mini Day Cards Grid (Recommended)
**Notes:** Consistent with Planner visual language while fitting dense multi-day horizons.

---

## Forecast Visuals - Overload Warnings

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated Alert Banner (Recommended) | Ant Design Alert banner at top of Horizon section highlighting overloaded dates, excess hours, and clickable date chips. | ✓ |
| Tab Badge Counter | Badge count on the Segmented tab item. | |
| In-Grid Badges Only | Only highlight red cards within grid without summary banner. | |

**User's choice:** Dedicated Alert Banner (Recommended)
**Notes:** Instantly surfaces overload risks across the forecasting horizon.

---

## Forecast Visuals - Next Month Definition

| Option | Description | Selected |
|--------|-------------|----------|
| Rolling 30 Days (Recommended) | 30 days starting from today (`today` to `today + 30 days`). | ✓ |
| Next Calendar Month (1st to end) | 1st to last day of next calendar month. | |
| Remaining + Next Month | Remaining days of current month plus next full month. | |

**User's choice:** Rolling 30 Days (Recommended)
**Notes:** Chosen after reviewing comparison; provides consistent 30-day projection without month-boundary gaps.

---

## Attention & Urgency - Inclusion Criteria

| Option | Description | Selected |
|--------|-------------|----------|
| Overdue + Due Today + Allocated (Recommended) | 3 groups: Overdue (`dueDate < today`), Due Today (`dueDate === today`), and Allocated Today (`allocation on today`). Excludes Done/Cancelled. | ✓ |
| Include High Priority Unplanned | Adds 4th group: High priority tasks without planning allocations. | |
| Overdue & Due Only | Only Overdue and Due Today, excluding scheduled tasks. | |

**User's choice:** Overdue + Due Today + Allocated (Recommended)
**Notes:** Captures all tasks that require attention or execution on the current day.

---

## Attention & Urgency - Ordering

| Option | Description | Selected |
|--------|-------------|----------|
| Grouped Urgency Order (Recommended) | Overdue at top (descending by days late), then Due Today, then Scheduled Today. Sorter within groups by priority. | ✓ |
| Flat Due Date Sort | Single flat list sorted purely by due date. | |
| Sub-Tabs Filter | Separate sub-tabs for each urgency group. | |

**User's choice:** Grouped Urgency Order (Recommended)
**Notes:** Ensures highest risk items are noticed first.

---

## Attention & Urgency - Quick Actions

| Option | Description | Selected |
|--------|-------------|----------|
| Inline Quick Status + Link (Recommended) | Mark Done checkbox, compact status dropdown, and clickable title to open TaskDrawer. | ✓ |
| Full Inline Toolset | Full row with reschedule date, minute inputs, and modal openers. | |
| View-Only Link | Title link only without interactive inline controls. | |

**User's choice:** Inline Quick Status + Link (Recommended)
**Notes:** Supports rapid triage directly on Dashboard per TASK-06 / DASH-06.

---

## Attention & Urgency - Height & Overflow

| Option | Description | Selected |
|--------|-------------|----------|
| Scrollable with Max-Height (Recommended) | Max-height container (~350px-400px) with internal scroll, count badge, and link to view all in TasksView. | ✓ |
| Pagination (5 per page) | Ant Design Pagination control. | |
| Full Unbounded List | Uncapped list pushing lower sections down. | |

**User's choice:** Scrollable with Max-Height (Recommended)
**Notes:** Prevents list expansion from hiding the Forecast section below.

---

## Actionable Navigation - Date Navigation

| Option | Description | Selected |
|--------|-------------|----------|
| Jump to Planner Week (Recommended) | Clicking a day card or overloaded chip navigates to `/#/planner?date=YYYY-MM-DD`, WeekNavigator synchronizes to target week. | ✓ |
| Quick Date Drawer in Dashboard | Opens modal/drawer on Dashboard with date's tasks. | |
| Launch FeasibilityModal | Opens FeasibilityModal for that date. | |

**User's choice:** Jump to Planner Week (Recommended)
**Notes:** Directly connects forecast inspection to planning ledger for immediate adjustments.

---

## Actionable Navigation - Task Title Click

| Option | Description | Selected |
|--------|-------------|----------|
| Open TaskDrawer in-place (Recommended) | Opens TaskDrawer on Dashboard without page navigation. | ✓ |
| Navigate to Tasks View | Navigates to `/#/tasks` with task filtered/opened. | |
| Navigate to Planner for Task | Navigates to Planner focused on task's allocation. | |

**User's choice:** Open TaskDrawer in-place (Recommended)
**Notes:** Preserves dashboard state and orientation while inspecting task details and planning tabs.

---

## Actionable Navigation - Today CTA

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated CTA Button (Recommended) | Explicit button on Today Card: "Open Today in Planner" navigating to `/#/planner`. | ✓ |
| Clickable Entire Card | Clicking anywhere on card navigates. | |
| Sidebar Menu Only | No button on card. | |

**User's choice:** Dedicated CTA Button (Recommended)
**Notes:** Obvious, unambiguous primary call to action.

---

## Actionable Navigation - Deep Linking Mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Hash Query Params (Recommended) | Extend `useHashRoute` to parse and sync query params on hash (e.g. `/#/planner?date=YYYY-MM-DD`). | ✓ |
| In-Memory State | Pass temporary in-memory state object on navigate. | |

**User's choice:** Hash Query Params (Recommended)
**Notes:** Survives page refresh and enables shareable/bookmarkable deep links.

---

## Claude's Discretion

- Responsive breakpoint adjustments and Ant Design grid sizing (`xs`, `sm`, `md`, `lg`, `xl`).
- Helper utility structure for date projections (`getProjectionDates`, `getHorizonMetrics`).
- Loading states and skeletons during live query resolution.

## Deferred Ideas

- Multi-task batch auto-scheduling across an entire milestone (v2 backlog).
- Auto-rebalancing existing allocations when high-priority urgent work arrives (v2 backlog).
- Saved filter presets and task templates (v2 PROD-01, PROD-02).
