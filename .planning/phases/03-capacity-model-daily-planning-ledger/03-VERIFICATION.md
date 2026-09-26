---
phase: 03-capacity-model-daily-planning-ledger
verified: 2026-09-26T23:15:00Z
status: human_needed
score: 12/12 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Interactive weekly grid & responsive layout"
    expected: "Navigating to /#/planner displays 7 equal day columns (Monday to Sunday) on desktop viewports; resizing viewport below 768px switches cleanly to a vertically stacked daily scroll feed without text overlap or broken cards"
    why_human: "Dynamic breakpoint layout, horizontal scrolling, and touch responsiveness require interactive browser validation"
  - test: "Inline task allocation popover & focus restoration"
    expected: "Clicking the duration tag on a scheduled task card opens an inline Popover allowing quick date and minute adjustments; clicking outside or saving closes popover; opening and closing CapacitySettingsModal or AllocationModal restores keyboard focus to the triggering button"
    why_human: "Popover positioning, animation smoothness, and browser focus management require interactive user inspection"
  - test: "Accessible load status dual-encoding in light and dark modes"
    expected: "All 4 load states (Available: green check, Busy: orange clock, Overloaded: red alert, No Capacity: grey minus) display distinct icons, text tags, and progress bar colors with readable contrast across both light and dark themes"
    why_human: "Color contrast compliance and icon visibility across theme transitions require visual inspection"
---

# Phase 03: Capacity Model & Daily Planning Ledger Verification Report

**Phase Goal:** Configure recurring and date-specific work capacity, plan tasks into specific calendar days, and visually audit daily overload through an interactive 7-day planning board.
**Verified:** 2026-09-26T23:15:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can configure weekly base capacity in minutes (seeded at 8h M-F, 0h Sa-Su) with 0h/4h/8h presets (CAP-01, CAP-02) | ✓ VERIFIED | `WeeklyCapacityForm.tsx` renders all 7 weekdays in Monday-Sunday order with paired Hours/Minutes inputs and quick preset buttons; `src/db/seeds.ts` seeds 480m M-F / 0m Sa-Su; validated by `tests/components/CapacitySettings.test.tsx` |
| 2 | User can add, edit, and delete specific calendar date capacity overrides (CAP-03) | ✓ VERIFIED | `OverridesTable.tsx` and `setCapacityOverride`/`removeCapacityOverride` in `capacityRepo.ts` support date-specific overrides with notes and Popconfirm deletion; validated by `tests/db/capacityRepo.test.ts` |
| 3 | Effective daily capacity resolves overrides first and falls back immediately to weekly template when removed (CAP-04) | ✓ VERIFIED | Pure resolver `getEffectiveDailyCapacity` in `src/utils/capacity.ts` and `getEffectiveCapacityForDate` in `capacityRepo.ts` implement override precedence; verified in `tests/utils/capacity.test.ts` |
| 4 | User can assign planned hours and minutes from active tasks to calendar dates with 1 record per (taskId, date) unique constraint (PLAN-01, D-12) | ✓ VERIFIED | `AllocationModal.tsx` and `upsertAllocation` in `allocationRepo.ts` enforce single record per (taskId, date) via transactional check-and-update; verified in `tests/db/allocationRepo.test.ts` |
| 5 | User can edit or remove daily allocations and inspect total allocated time against task estimate (PLAN-02) | ✓ VERIFIED | `updateAllocation`, `deleteAllocation`, and `getTotalAllocatedMinutesForTask` in `allocationRepo.ts`; inline edit Popover and delete Popconfirm on `TaskAllocationCard.tsx`; verified in `tests/components/AllocationModal.test.tsx` |
| 6 | Exceeding task estimate displays soft orange warning alert without blocking saving (PLAN-06, D-10) | ✓ VERIFIED | `AllocationModal.tsx` and `TaskDrawerPlanning.tsx` render `<Alert type="warning" />` when cumulative allocated minutes exceed estimate; validated by `tests/components/AllocationModal.test.tsx` |
| 7 | Allocations on Done and Cancelled tasks remain stored historically but are excluded from active daily capacity totals (PLAN-05, D-16) | ✓ VERIFIED | `isTaskActive` in `allocationRepo.ts` excludes Done/Cancelled tasks from `activeTotalsByDate`; `useWeeklyPlanner.ts` partitions active vs inactive minutes; verified in `tests/db/allocationRepo.test.ts` |
| 8 | Primary view on `/#/planner` displays 7-day Monday through Sunday grid with navigation controls (D-01, D-02, D-04) | ✓ VERIFIED | `PlannerView.tsx` renders 7 equal day columns on desktop (grid-template-columns: repeat(7, minmax(135px, 1fr))) and stacked on mobile; `WeekNavigator.tsx` provides Prev/Today/Next and week DatePicker; verified in `tests/views/PlannerView.test.tsx` |
| 9 | Each day column header displays Capacity, Allocated, Net Balance, and 4-state load status via text, icon, and color (PLAN-03, PLAN-04, D-15, D-17) | ✓ VERIFIED | `DayColumnHeader.tsx` renders dual-encoded tags (`Available`, `Busy`, `Overloaded`, `No Capacity`), Progress bar, and color-coded net balance (+green, -red); verified in `tests/components/DayColumnHeader.test.tsx` |
| 10 | High context switching warning tag appears when more than 4 tasks are scheduled on a single day (D-13) | ✓ VERIFIED | `calculateDayMetrics` flags `isHighContextSwitching` when `activeTaskCount > 4`; `DayColumnHeader.tsx` renders `<Tag color="warning">High context switching (N tasks)</Tag>`; verified in `tests/components/DayColumnHeader.test.tsx` |
| 11 | Show Completed toggle controls display of Done/Cancelled tasks rendered as muted cards with exclusion tags (PLAN-05, D-16) | ✓ VERIFIED | `PlannerView.tsx` includes Switch `Show Completed`; `DayColumn.tsx` filters visible allocations; `TaskAllocationCard.tsx` applies 50% opacity, strikethrough, and exclusion badge; verified in `tests/views/PlannerView.test.tsx` |
| 12 | Application shell routes `/#/planner` and `/#/settings` mount PlannerView and SettingsView without empty states (UX-01, UX-02) | ✓ VERIFIED | `src/App.tsx` routes `planner` to `<PlannerView />` and `settings` to `<SettingsView />`; verified in `tests/views/PlannerView.test.tsx` and `tests/shell.test.tsx` |

**Score:** 12/12 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/utils/capacity.ts` | Pure capacity calculation functions, net balance, load states | ✓ VERIFIED | Exports `getEffectiveDailyCapacity`, `calculateDayMetrics`, `DailyLoadState`, `DayCapacityMetrics` |
| `src/db/repositories/capacityRepo.ts` | Weekly rules & date overrides Dexie repository | ✓ VERIFIED | Exports `getCapacityRules`, `updateCapacityRule`, `getCapacityOverrides`, `setCapacityOverride`, `removeCapacityOverride`, `getEffectiveCapacityForDate` |
| `src/components/settings/WeeklyCapacityForm.tsx` | 7 weekday capacity rules editor with 0h/4h/8h presets | ✓ VERIFIED | Substantive Ant Design form with live query and paired inputs |
| `src/components/settings/OverridesTable.tsx` | Specific date overrides table with add modal & delete popconfirm | ✓ VERIFIED | Substantive table with date picker modal, tags, and popconfirm deletion |
| `src/components/planner/CapacitySettingsModal.tsx` | Quick capacity configuration modal dialog | ✓ VERIFIED | Embeds WeeklyCapacityForm and OverridesTable with focus restoration |
| `src/views/SettingsView.tsx` | Settings view housing capacity configuration | ✓ VERIFIED | Mounted on `/#/settings` route with navigation controls |
| `src/db/repositories/allocationRepo.ts` | Daily task allocation repository with unique constraint & inactive filtering | ✓ VERIFIED | Exports `upsertAllocation`, `updateAllocation`, `deleteAllocation`, `getAllocationsForDate`, `getAllocationsForTask`, `getTotalAllocatedMinutesForTask`, `getWeeklyAllocationsWithTasks`, `isTaskActive` |
| `src/components/planner/AllocationModal.tsx` | Task allocation modal with estimate comparison and soft warnings | ✓ VERIFIED | Substantive modal with active task search, date picker, presets, and live estimate alerts |
| `src/components/planner/TaskAllocationCard.tsx` | Day column card with inline edit popover and delete popconfirm | ✓ VERIFIED | Substantive card with duration tag, edit popover, delete popconfirm, and muted styling for inactive tasks |
| `src/components/tasks/TaskDrawerPlanning.tsx` | Embedded multi-date planning manager in TaskDrawer | ✓ VERIFIED | Substantive progress bar, allocation table, and inline add form |
| `src/components/tasks/TaskDrawer.tsx` | Task details drawer embedding TaskDrawerPlanning | ✓ VERIFIED | Renders `<TaskDrawerPlanning task={currentTask} liveEstimateMinutes={liveEstimateMinutes} db={db} />` |
| `src/hooks/useWeeklyPlanner.ts` | Reactive hook joining weekly rules, overrides, allocations, and tasks | ✓ VERIFIED | Substantive `useLiveQuery` hook computing 7-day Monday-to-Sunday metrics and joined task entities |
| `src/components/planner/DayColumnHeader.tsx` | Accessible day header with metrics, dual-encoded load status, progress | ✓ VERIFIED | Dual-encoded tag (icon+text+color), progress bar, net balance, and high context switching warning |
| `src/components/planner/DayColumn.tsx` | 7-day column container with task list and quick + Allocate footer | ✓ VERIFIED | Substantive column with header, task cards, empty state, and + Allocate button |
| `src/components/planner/WeekNavigator.tsx` | Week navigation toolbar (Prev/Today/Next, week DatePicker) | ✓ VERIFIED | Substantive navigation with button group, DatePicker week picker, and capacity settings trigger |
| `src/views/PlannerView.tsx` | Main weekly grid planning workbench view | ✓ VERIFIED | Mounted on `/#/planner`, 7-column desktop grid / stacked mobile layout, keyboard shortcuts |
| `src/App.tsx` | Shell route wiring for planner and settings | ✓ VERIFIED | Wires `planner` to `PlannerView` and `settings` to `SettingsView` |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `src/db/repositories/capacityRepo.ts` | `src/db/schema.ts` | Dexie tables `capacityRules` and `capacityOverrides` | ✓ WIRED | Reads/writes `targetDb.capacityRules` and `targetDb.capacityOverrides` |
| `src/components/settings/WeeklyCapacityForm.tsx` | `src/db/repositories/capacityRepo.ts` | `updateCapacityRule` calls | ✓ WIRED | Calls `updateCapacityRule(dayOfWeek, totalMinutes, db)` on input and preset changes |
| `src/components/settings/OverridesTable.tsx` | `src/db/repositories/capacityRepo.ts` | `setCapacityOverride` and `removeCapacityOverride` | ✓ WIRED | Upserts overrides in save modal; removes in Popconfirm |
| `src/db/repositories/allocationRepo.ts` | `src/db/schema.ts` | Dexie tables `plannedAllocations` and `tasks` | ✓ WIRED | Reads/writes `db.plannedAllocations` and joins `db.tasks` in transactions |
| `src/components/planner/AllocationModal.tsx` | `src/db/repositories/allocationRepo.ts` | `upsertAllocation` calls | ✓ WIRED | Calls `upsertAllocation(values.taskId, dateStr, totalMins, db)` |
| `src/components/tasks/TaskDrawer.tsx` | `src/components/tasks/TaskDrawerPlanning.tsx` | `<TaskDrawerPlanning` component | ✓ WIRED | Embedded below estimates and dates in `TaskDrawer.tsx:410` |
| `src/views/PlannerView.tsx` | `src/hooks/useWeeklyPlanner.ts` | `useWeeklyPlanner` hook | ✓ WIRED | Invoked at top of `PlannerView.tsx:40` to drive reactive 7-day state |
| `src/views/PlannerView.tsx` | `src/components/planner/DayColumn.tsx` | `<DayColumn` mapping | ✓ WIRED | Maps over `weeklyState.days` rendering 7 `DayColumn` elements |
| `src/App.tsx` | `src/views/PlannerView.tsx` | Route mapping for `'planner'` | ✓ WIRED | `case 'planner': return <PlannerView />;` |
| `src/App.tsx` | `src/views/SettingsView.tsx` | Route mapping for `'settings'` | ✓ WIRED | `case 'settings': return <SettingsView onNavigate={navigate} />;` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `WeeklyCapacityForm.tsx` | `rules` | `useLiveQuery(() => db.capacityRules.toArray())` | Yes — returns 7 weekday rules from IndexedDB | ✓ FLOWING |
| `OverridesTable.tsx` | `overrides` | `useLiveQuery(() => db.capacityOverrides.toArray())` | Yes — returns real date overrides from IndexedDB | ✓ FLOWING |
| `AllocationModal.tsx` | `activeTasks`, `existingTotalMinutes` | `useLiveQuery(() => db.tasks.toArray())`, `getAllocationsForTask` | Yes — fetches live task records and calculates cumulative allocation minutes | ✓ FLOWING |
| `TaskDrawerPlanning.tsx` | `allocations` | `useLiveQuery(() => db.plannedAllocations.where('taskId').equals(task.id))` | Yes — returns real task allocations from IndexedDB | ✓ FLOWING |
| `PlannerView.tsx` | `weeklyState` | `useWeeklyPlanner(currentDate, db)` joining rules, overrides, allocations, tasks | Yes — computes real effective daily capacities, active loads, net balances | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Full automated test suite | `npm test` | 27 test files, 177 tests passed (0 failures) | ✓ PASS |
| Phase 3 specific test suite | `npx vitest run tests/utils/capacity.test.ts tests/db/capacityRepo.test.ts tests/components/CapacitySettings.test.tsx tests/db/allocationRepo.test.ts tests/components/AllocationModal.test.tsx tests/components/TaskDrawerPlanning.test.tsx tests/components/DayColumnHeader.test.tsx tests/views/PlannerView.test.tsx` | 8 test files, 62 tests passed (0 failures) | ✓ PASS |
| Production bundle build | `npm run build` | `tsc && vite build` completed in 1.92s with static dist bundle | ✓ PASS |

### Probe Execution

No probes configured for Phase 3 (not a migration phase; no probe scripts present).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| CAP-01 | 03-01-PLAN.md | Configure available work minutes for each weekday using a weekly template | ✓ SATISFIED | `WeeklyCapacityForm.tsx`, `updateCapacityRule` in `capacityRepo.ts`, `CapacityRuleInputSchema` |
| CAP-02 | 03-01-PLAN.md | Starts with 8h M-F and 0h Sa-Su, all values editable | ✓ SATISFIED | Seeded in `src/db/seeds.ts`; editable in `WeeklyCapacityForm.tsx` with presets |
| CAP-03 | 03-01-PLAN.md | Override capacity for specific date (leave, overtime) | ✓ SATISFIED | `OverridesTable.tsx`, `setCapacityOverride` in `capacityRepo.ts`, `CapacityOverrideInputSchema` |
| CAP-04 | 03-01-PLAN.md | Effective daily capacity falls back to weekly template | ✓ SATISFIED | `getEffectiveDailyCapacity` in `src/utils/capacity.ts`, `removeCapacityOverride` |
| PLAN-01 | 03-02-PLAN.md | Assign planned hours/minutes from task to calendar dates | ✓ SATISFIED | `AllocationModal.tsx`, `TaskDrawerPlanning.tsx`, `upsertAllocation` in `allocationRepo.ts` |
| PLAN-02 | 03-02-PLAN.md | Edit/remove daily task allocation and see total allocated time | ✓ SATISFIED | `updateAllocation`, `deleteAllocation`, `getTotalAllocatedMinutesForTask` in `allocationRepo.ts`; inline actions in `TaskAllocationCard.tsx` and `TaskDrawerPlanning.tsx` |
| PLAN-03 | 03-03-PLAN.md | See date capacity, allocated time, and net balance | ✓ SATISFIED | `DayColumnHeader.tsx` renders Capacity, Allocated, and Net Balance with color indicators |
| PLAN-04 | 03-03-PLAN.md | Distinguish load states using text or icons in addition to color | ✓ SATISFIED | `DayColumnHeader.tsx` dual-encodes Available, Busy, Overloaded, and No Capacity with distinct icons and text |
| PLAN-05 | 03-02-PLAN.md | Inactive task allocations stored historically but excluded from active workload | ✓ SATISFIED | `isTaskActive` in `allocationRepo.ts` excludes Done/Cancelled tasks; `Show Completed` switch allows viewing muted cards |
| PLAN-06 | 03-02-PLAN.md | Manually adjust allocations before saving | ✓ SATISFIED | `AllocationModal.tsx` and `TaskDrawerPlanning.tsx` allow adjusting hours/minutes with soft overflow warnings before save |
| UX-02 | 03-03-PLAN.md | Keyboard accessible actions with visible focus | ✓ SATISFIED | Keyboard shortcuts (`Alt+ArrowLeft`/`Alt+ArrowRight`, `p`/`n`, `Alt+T`/`t`), accessible modal buttons |
| UX-03 | 03-03-PLAN.md | Inline validation, safe defaults, focus restoration | ✓ SATISFIED | Zod schemas, form item rules, `createFocusRestorer` on modals |
| UX-04 | 03-03-PLAN.md | Actions announced in visible text and status regions | ✓ SATISFIED | `message.success` feedback on all mutations; descriptive `aria-label` attributes on day headers |
| UX-05 | 03-03-PLAN.md | Minimal navigation and fast controls | ✓ SATISFIED | Direct inline popover edits on task cards; quick presets for capacity and allocations |

No orphaned requirements. All 10 core requirements (CAP-01 to CAP-04, PLAN-01 to PLAN-06) and 4 UX requirements are fully implemented and verified.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| None | — | No debt markers (`TBD`, `FIXME`, `XXX`), stub returns, or hardcoded mock data found | None | Codebase is clean |

### Human Verification Required

The following 3 items require manual verification in a live browser session:

### 1. Interactive Weekly Grid & Responsive Layout

**Test:** Navigate to `/#/planner` on a desktop screen (>=1024px) and inspect the 7-day columns (Monday to Sunday). Then resize the browser window to mobile width (<768px).
**Expected:** On desktop, 7 equal columns render horizontally with clear date headers and task cards. On mobile, the grid switches cleanly to a vertically stacked scroll feed with no overlapping text.
**Why human:** Responsive breakpoints, CSS grid stretching, and layout feel across varying viewports cannot be verified in headless jsdom.

### 2. Inline Task Allocation Popover & Focus Restoration

**Test:** In `/#/planner`, click the duration tag on any scheduled task allocation card. Modify the target date or hours/minutes and click Save. Then open the "Capacity Settings" modal from the toolbar, click "Done", and observe where keyboard focus lands.
**Expected:** The inline Popover opens smoothly, persists changes reactively, and closes. Closing the modal returns focus to the "Capacity Settings" button.
**Why human:** Popover animations, overlay click-away behaviors, and real DOM focus restoration require interactive confirmation.

### 3. Accessible Load Status Dual-Encoding in Light and Dark Modes

**Test:** Schedule varying amounts of work across the week to trigger all 4 load states: 0m on Saturday (No Capacity), 4h on Monday (Available), 8h on Tuesday (Busy), and 10h on Wednesday (Overloaded). Toggle system appearance between Light and Dark mode.
**Expected:** Each day column header shows its distinctive icon and text label (Available: green check, Busy: orange clock, Overloaded: red alert, No Capacity: grey minus) and net balance (+green, -red) with readable contrast in both color schemes.
**Why human:** Visual color contrast, theme token transitions, and aesthetic legibility require human visual inspection.

### Gaps Summary

No functional or code gaps found. All 12 must-haves, 17 required artifacts, and 10 key links pass verification. All 177 unit/component/integration tests pass with zero regressions, and production build succeeds. Awaiting user interactive review of the 3 human verification checks listed above.

---

_Verified: 2026-09-26T23:15:00Z_
_Verifier: Claude (gsd-verifier)_
