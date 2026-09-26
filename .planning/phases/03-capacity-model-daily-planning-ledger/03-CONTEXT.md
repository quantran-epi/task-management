# Phase 3: Capacity Model & Daily Planning Ledger - Context

**Gathered:** 2026-09-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 3 delivers the daily planning workbench, weekly work capacity modeling, per-date capacity overrides, and daily task minute allocation ledger with accessible load state indicators. It enables the user to configure available working time per weekday, account for holidays/leave/overtime on specific calendar dates, allocate planned hours and minutes from tasks across dates, track allocated time against estimates, monitor daily net capacity balance, and detect overloading or excessive daily context switching.

Requirements covered: CAP-01, CAP-02, CAP-03, CAP-04, PLAN-01, PLAN-02, PLAN-03, PLAN-04, PLAN-05, PLAN-06, UX-02, UX-03, UX-04, UX-05.

</domain>

<decisions>
## Implementation Decisions

### Planner Layout & Navigation
- **D-01:** Primary view on `/#/planner` is a **Weekly Grid** (Mon-Sun 7-day column board) displaying daily capacity, total allocations, net balance, and task cards.
- **D-02:** Date navigation includes Previous Week / Next Week buttons, a `Today` button, and an Ant Design `DatePicker` to jump directly to any calendar week.
- **D-03:** Each Day column consists of:
  - Header: Day of week + Date, Capacity tag, Net balance indicator, Load status badge/tag.
  - Body: List of task allocation cards scheduled for that date.
  - Footer: Compact `+ Allocate` quick-action button.
- **D-04:** Responsive behavior: Desktop displays 7 horizontal columns (Mon-Sun); Mobile (< 768px) stacks days vertically into an accessible daily scroll feed.

### Capacity Settings & Overrides
- **D-05:** Centralized capacity management lives in `/#/settings` under a dedicated "Work Capacity & Overrides" section, with a quick-access "Capacity Settings" button on the `/#/planner` header opening an editing Modal without leaving the planner.
- **D-06:** Base Weekly Capacity (Monday through Sunday) is configured using paired `InputNumber` fields for Hours (0-24) and Minutes (0-59), accompanied by quick preset buttons (`0h`, `4h`, `8h`). Persists as integer minutes in IndexedDB `capacityRules`.
- **D-07:** Specific Date Overrides are managed through an interactive Table in Settings/Modal (`+ Add Override` with date picker, hours/minutes, and optional note such as "Holiday", "Leave", "OT") and also editable by clicking the Capacity tag on any day column in `/#/planner`.
- **D-08:** Overrides delete/revert with a Popconfirm on the table and a "Reset to Default" action in the quick-edit popover. Removing an override immediately restores that date's effective capacity to its weekly template default (CAP-04).

### Allocation Flow & Context Switching
- **D-09:** Dual allocation creation points: users can allocate time to dates from the Task Drawer on `/#/tasks` (Planning section with multi-date allocation table) AND via the `+ Allocate` button on any day column in `/#/planner` (select active task + enter hours/minutes).
- **D-10:** Estimate vs. Allocation comparison: UI clearly displays `Allocated Xh / Est Yh (Remaining Zh)`. If total allocated time exceeds task estimate, a soft orange warning is shown without hard-blocking the user.
- **D-11:** Day column task cards provide inline edit (Popover to adjust minutes or move date) and delete actions (with confirmation / undo notification).
- **D-12:** Unique constraint per task/day: each task has at most one allocation record per calendar date; allocating additional time to the same date merges/updates the existing allocation record.
- **D-13:** Excessive daily task warning: if the number of distinct tasks allocated to a single day exceeds a configurable threshold (default: 4 tasks/day, configurable in Settings), an orange warning tag `High context switching (N tasks)` is displayed on the day header to prevent cognitive overload.

### Load Status Rules & Inactive Handling
- **D-14:** Four distinct load states calculated per day:
  - `no-capacity`: Effective capacity is 0 minutes (non-working day or 0h leave override) with 0 active allocations.
  - `available`: Active allocated minutes < 80% of effective capacity.
  - `busy`: Active allocated minutes between 80% and 100% of effective capacity (inclusive).
  - `overloaded`: Active allocated minutes > 100% of effective capacity (or > 0 minutes allocated on a 0-capacity day).
- **D-15:** Accessible visual presentation (PLAN-04, UX-02, UX-04): Day headers display both a colored Progress bar AND a status Tag with distinct icon and text:
  - Available: Green tag + Check icon (`Available`).
  - Busy: Orange tag + Clock icon (`Busy`).
  - Overloaded: Red tag + Alert icon (`Overloaded`).
  - No-Capacity: Grey tag + Minus icon (`No Capacity`).
- **D-16:** Inactive task exclusion (PLAN-05): Allocations for tasks in `Done` or `Cancelled` status are strictly excluded from active workload totals and net capacity calculations. They are hidden by default on the planner view, with a toolbar toggle `Show Completed` that renders them as muted cards (50% opacity, strikethrough, tagged `Done - excluded from load`).
- **D-17:** Net balance display (PLAN-03): Day column headers explicitly show all three metrics: `Capacity: Xh Ym`, `Allocated: Xh Ym`, and `Balance: +Xh Ym remaining` (green) or `-Xh Ym overload` (red).

### Claude's Discretion
- Component breakdown and exact Ant Design subcomponents (e.g. Card, Popover, Select, Progress, Tag).
- IndexedDB query optimizations, compound indexing, or Dexie helper repositories (`capacityRepo.ts`, `allocationRepo.ts`).
- Keyboard shortcuts for navigating days in the weekly grid (`Alt+Left`/`Alt+Right` for previous/next week).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture & Requirements
- `.planning/ROADMAP.md` § Phase 3 — Deliverables, goals, and success criteria for Phase 3.
- `.planning/REQUIREMENTS.md` § Capacity & Workload Planning — CAP-01 to CAP-04, PLAN-01 to PLAN-06, UX-02, UX-03, UX-04, UX-05.
- `CLAUDE.md` — Core technical stack (Ant Design 6, Dexie 4, React 19, Dayjs, TypeScript strict).
- `.planning/phases/01-foundation-deployment-shell/01-CONTEXT.md` — Application shell, dark mode tokens, base route handling, and database seeds.
- `.planning/phases/02-work-hierarchy-fast-task-management/02-CONTEXT.md` — Task data model, TaskDrawer, cascade deletion, and time formatting conventions.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/types/models.ts` — Pre-existing definitions for `CapacityRule`, `CapacityOverride`, `PlannedAllocation`, and `Task`.
- `src/db/schema.ts` — Pre-configured tables: `capacityRules: 'id, &dayOfWeek'`, `capacityOverrides: 'id, date'`, `plannedAllocations: 'id, taskId, date'`.
- `src/db/seeds.ts` — `initializeDatabaseDefaults` already seeds standard 8h M-F (480 mins) and 0h Sa-Su.
- `src/utils/time.ts` — `formatMinutes` (human-readable `Xh Ym`), `validateMinutes` (0-6000 range check).
- `src/utils/date.ts` — Date formatting and comparison utilities (`YYYY-MM-DD`).
- `src/components/tasks/TaskDrawer.tsx` — Slide-out drawer for task details; can be extended with an Allocation/Planning section.
- `src/components/shell/AppShell.tsx` and `src/hooks/useHashRoute.ts` — Route dispatcher supporting `/#/planner` and `/#/settings`.

### Established Patterns
- All dates stored as canonical `YYYY-MM-DD` strings; all durations stored as non-negative integer minutes.
- Dexie `useLiveQuery` for reactive UI updates from IndexedDB changes.
- Atomic Dexie transactions for multi-record operations and cascade cleanup.
- WCAG 2.1 AA accessible focus management, visible outlines, and screen reader announcements.

### Integration Points
- `src/App.tsx` — Replace placeholder `EmptyState` for routes `planner` and `settings` with `PlannerView` and `SettingsView`.
- `src/db/repositories/capacityRepo.ts` — New repository for managing weekly rules, overrides, and calculating effective daily capacity.
- `src/db/repositories/allocationRepo.ts` — New repository for creating, updating, querying, and deleting daily task allocations with active task status filtering.
- `src/components/tasks/TaskDrawer.tsx` — Add planning/allocation management section for the selected task.

</code_context>

<specifics>
## Specific Ideas
- Weekly planner board giving an instant visual answer to "Am I overloaded today or this week?"
- High context switching warning when more than 4 tasks are scheduled on a single day.
- Effortless quick adjustments: click a capacity badge to declare a holiday or OT day; click a task card to adjust planned minutes without opening full forms.

</specifics>

<deferred>
## Deferred Ideas
- Automated feasibility calculation and deterministic lowest-load candidate distribution engine (Phase 4: CALC-01 to CALC-06).
- Long-range dashboard views (7-day, 14-day, next-month forecast) and overload warning summaries (Phase 5: DASH-01 to DASH-06).
- Drag-and-drop task cards between calendar days (v2 candidate: PROD-05).
- Recurring capacity override templates (e.g. alternating bi-weekly schedules) (out of scope for v1).

</deferred>

---

*Phase: 03-Capacity Model & Daily Planning Ledger*
*Context gathered: 2026-09-26*
