# Phase 03: Capacity Model & Daily Planning Ledger - Research

**Researched:** 2026-09-26
**Domain:** Work capacity modeling, calendar date overrides, daily task allocation ledger, and accessible load indicators
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Primary view on `/#/planner` is a **Weekly Grid** (Mon-Sun 7-day column board) displaying daily capacity, total allocations, net balance, and task cards.
- **D-02:** Date navigation includes Previous Week / Next Week buttons, a `Today` button, and an Ant Design `DatePicker` to jump directly to any calendar week.
- **D-03:** Each Day column consists of:
  - Header: Day of week + Date, Capacity tag, Net balance indicator, Load status badge/tag.
  - Body: List of task allocation cards scheduled for that date.
  - Footer: Compact `+ Allocate` quick-action button.
- **D-04:** Responsive behavior: Desktop displays 7 horizontal columns (Mon-Sun); Mobile (< 768px) stacks days vertically into an accessible daily scroll feed.
- **D-05:** Centralized capacity management lives in `/#/settings` under a dedicated "Work Capacity & Overrides" section, with a quick-access "Capacity Settings" button on the `/#/planner` header opening an editing Modal without leaving the planner.
- **D-06:** Base Weekly Capacity (Monday through Sunday) is configured using paired `InputNumber` fields for Hours (0-24) and Minutes (0-59), accompanied by quick preset buttons (`0h`, `4h`, `8h`). Persists as integer minutes in IndexedDB `capacityRules`.
- **D-07:** Specific Date Overrides are managed through an interactive Table in Settings/Modal (`+ Add Override` with date picker, hours/minutes, and optional note such as "Holiday", "Leave", "OT") and also editable by clicking the Capacity tag on any day column in `/#/planner`.
- **D-08:** Overrides delete/revert with a Popconfirm on the table and a "Reset to Default" action in the quick-edit popover. Removing an override immediately restores that date's effective capacity to its weekly template default (CAP-04).
- **D-09:** Dual allocation creation points: users can allocate time to dates from the Task Drawer on `/#/tasks` (Planning section with multi-date allocation table) AND via the `+ Allocate` button on any day column in `/#/planner` (select active task + enter hours/minutes).
- **D-10:** Estimate vs. Allocation comparison: UI clearly displays `Allocated Xh / Est Yh (Remaining Zh)`. If total allocated time exceeds task estimate, a soft orange warning is shown without hard-blocking the user.
- **D-11:** Day column task cards provide inline edit (Popover to adjust minutes or move date) and delete actions (with confirmation / undo notification).
- **D-12:** Unique constraint per task/day: each task has at most one allocation record per calendar date; allocating additional time to the same date merges/updates the existing allocation record.
- **D-13:** Excessive daily task warning: if the number of distinct tasks allocated to a single day exceeds a configurable threshold (default: 4 tasks/day, configurable in Settings), an orange warning tag `High context switching (N tasks)` is displayed on the day header to prevent cognitive overload.
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
- Component breakdown and exact Ant Design subcomponents (Card, Popover, Select, Progress, Tag, Modal).
- IndexedDB query optimizations and Dexie repositories (`capacityRepo.ts`, `allocationRepo.ts`).
- Keyboard shortcuts for navigating days in the weekly grid (`Alt+Left`/`Alt+Right` for previous/next week).

### Deferred Ideas (OUT OF SCOPE)
- Automated feasibility calculation and deterministic lowest-load candidate distribution engine (Phase 4: CALC-01 to CALC-06).
- Long-range dashboard views (7-day, 14-day, next-month forecast) and overload warning summaries (Phase 5: DASH-01 to DASH-06).
- Drag-and-drop task cards between calendar days (v2 candidate: PROD-05).
- Recurring capacity override templates (e.g. alternating bi-weekly schedules) (out of scope for v1).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CAP-01 | User can configure available work minutes for each weekday using a weekly template. | `capacityRules` table with 7 weekday records (0-6), `capacityRepo.ts` with `updateCapacityRule(dayOfWeek, workMinutes)`. [VERIFIED: codebase] |
| CAP-02 | New local data starts with 8 hours for Monday through Friday and 0 hours for Saturday and Sunday, and every value remains editable. | Already seeded via `src/db/seeds.ts` (480 mins M-F, 0 mins Sa-Su); UI forms in `SettingsView` and `CapacitySettingsModal` allow editing each weekday. [VERIFIED: codebase] |
| CAP-03 | User can override capacity for a specific date, including zero-capacity leave and increased-capacity overtime. | `capacityOverrides` table indexed by `date`, `capacityRepo.ts` with `setCapacityOverride(date, workMinutes, note)` and `removeCapacityOverride(date)`. [VERIFIED: codebase] |
| CAP-04 | Effective daily capacity uses a date override when one exists and otherwise uses the matching weekly-template value. | Pure resolver `getEffectiveDailyCapacity(date, rules, overrides)`: checks `overrides.get(date)` first; falls back to `rules.get(dayOfWeek)`. Reverting override immediately restores weekly default. [VERIFIED: codebase] |
| PLAN-01 | User can assign planned hours and minutes from a task to individual calendar dates. | `plannedAllocations` table, `allocationRepo.ts` with `upsertAllocation(taskId, date, minutes)`, UI via `AllocationModal` and `TaskDrawer` Planning section. [VERIFIED: codebase] |
| PLAN-02 | User can edit or remove a daily task allocation and see the task's total allocated time. | `updateAllocation(id, minutes, date)`, `deleteAllocation(id)`, and `getTotalAllocatedMinutesForTask(taskId)` in `allocationRepo.ts`. Shown in task card inline popover and `TaskDrawer`. [VERIFIED: codebase] |
| PLAN-03 | User can see each date's capacity, allocated time, and remaining or excess time. | Day column header computes `netBalance = effectiveCapacity - activeAllocated`. Green `+{rem}` when `>= 0`, red `-{over}` when `< 0`. [VERIFIED: codebase / UI-SPEC] |
| PLAN-04 | User can distinguish available, busy, overloaded, and no-capacity days using text or icons in addition to color. | Four states with unique semantic tags + distinct Ant Design icons (`CheckCircleOutlined`, `ClockCircleOutlined`, `ExclamationCircleOutlined`, `MinusCircleOutlined`) plus accessible ARIA labels. [VERIFIED: UI-SPEC] |
| PLAN-05 | Done and Cancelled task allocations remain stored for history but are excluded from active workload totals. | `allocationRepo.ts` joins allocations with task status; excludes `Done` and `Cancelled` tasks from active daily totals. `Show Completed` switch toggles muted visual display. [VERIFIED: codebase] |
| PLAN-06 | User can manually adjust suggested or existing allocations before saving them. | Allocation form allows entering hours/minutes with instant remaining estimate calculation before persisting record to IndexedDB. [VERIFIED: codebase] |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Audience:** Single personal user, offline-first, local-only behavior.
- **Persistence:** IndexedDB via Dexie 4.4.6; reactive reads via `dexie-react-hooks` (`useLiveQuery`).
- **Dates & Times:** Dates stored as canonical `YYYY-MM-DD` strings; times stored as non-negative integer minutes.
- **UI:** Ant Design 6.6.5 component suite, bundled types (no `@types/antd`), strict color tokens.
- **TypeScript:** Strict mode enabled, `exactOptionalPropertyTypes` respected (do not assign `undefined` to optional fields).
- **Testing:** Vitest with jsdom and `fake-indexeddb`.

## Summary

Phase 03 establishes the planning engine foundation: the weekly work capacity model, per-date calendar overrides, and daily task allocation ledger. All data structures (`capacityRules`, `capacityOverrides`, `plannedAllocations`) already exist in Dexie schema v1 (`src/db/schema.ts`). Initial default capacity rules (8h M-F, 0h Sa-Su) are already seeded in `src/db/seeds.ts`.

The implementation consists of four cohesive layers:
1. **Domain & Repositories:** Zod validation schemas (`src/validation/schemas.ts`), `capacityRepo.ts` for managing weekly templates and date overrides, and `allocationRepo.ts` for managing allocations, computing effective daily capacity, aggregating daily workloads, and excluding inactive tasks.
2. **Settings & Capacity Management:** `SettingsView.tsx` with a dedicated "Work Capacity & Overrides" section, plus `CapacitySettingsModal.tsx` for quick modal editing directly from the planner header.
3. **Weekly Grid Planner:** `PlannerView.tsx` with week navigation (Previous, Today, Next, Week picker), 7-day columns (Mon-Sun), day headers displaying capacity/allocated/balance metrics with four accessible load states (`available`, `busy`, `overloaded`, `no-capacity`), excessive context switching warnings (>4 tasks), task cards with inline popover edit/delete, and `AllocationModal.tsx`.
4. **TaskDrawer Planning Integration:** Embedded section in `TaskDrawer.tsx` allowing viewing existing allocations for the task, comparing allocated time to estimate, and adding/editing allocations without leaving the tasks view.

**Primary recommendation:** Build `capacityRepo` and `allocationRepo` first with 100% unit test coverage using `fake-indexeddb`, then implement the UI components starting from shared calculation utilities up to the weekly board view.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Capacity rules & overrides persistence | IndexedDB (Dexie) | Domain Repository | Stored locally in `capacityRules` and `capacityOverrides` tables |
| Effective daily capacity computation | Domain Repository (`capacityRepo.ts`) | UI Component | Deterministic pure logic: date override if present, else day-of-week rule |
| Task allocation ledger CRUD | IndexedDB (Dexie) | Domain Repository (`allocationRepo.ts`) | Stored locally in `plannedAllocations` table with unique task/date constraint |
| Active load & net balance calculation | Domain Repository (`allocationRepo.ts`) | Reactive Hook (`useWeeklyPlan`) | Joins allocations with task statuses; filters out `Done` and `Cancelled` tasks |
| Weekly grid visualization | UI View (`PlannerView.tsx`) | Day Column Component | 7-column desktop grid, responsive vertical stack on mobile |
| Day load badge & progress presentation | UI Component (`DayColumnHeader.tsx`) | Ant Design Progress/Tag | Visual + text + icon dual encoding (WCAG 2.1 AA accessible) |
| TaskDrawer planning section | UI Component (`TaskDrawer.tsx`) | Allocation Mini Table | Direct allocation management within existing task workflow |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.3.0 | UI rendering | App core framework [VERIFIED: package.json] |
| Ant Design | 6.6.5 | UI components (Grid, Form, Select, DatePicker, Progress, Tag, Modal, Popover) | Project standard component system [VERIFIED: package.json] |
| @ant-design/icons | 6.3.4 | Status and action icons | Bundled icon library [VERIFIED: package.json] |
| Dexie | 4.4.6 | IndexedDB abstraction | Project persistence engine [VERIFIED: package.json] |
| dexie-react-hooks | 4.4.0 | `useLiveQuery` hook | Real-time reactive updates from database mutations [VERIFIED: package.json] |
| Dayjs | 1.11.23 | Date math and calendar week ranges | Immutable date library, ISO week calculations [VERIFIED: package.json] |
| Zod | 4.6.5 | Schema validation | Runtime validation for allocation and capacity inputs [VERIFIED: package.json] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| dayjs/plugin/isoWeek | 1.11.23 | ISO week calculation (Monday start) | Computing Monday-Sunday week bounds [VERIFIED: node_modules/dayjs] |
| dayjs/plugin/customParseFormat | 1.11.23 | Strict date parsing | Already loaded in `src/utils/date.ts` [VERIFIED: codebase] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Dayjs `isoWeek` | Manual modulo math on `day()` | `isoWeek` is bundled with Dayjs; zero dependency overhead and handles leap years and month transitions cleanly |
| Single Dexie query | Multiple sequential queries | `useLiveQuery` combining rules, overrides, tasks, and allocations in a single reactive block guarantees transactional UI consistency |

## Package Legitimacy Audit

No new external packages are introduced in Phase 03. All required packages (`antd`, `@ant-design/icons`, `dayjs`, `dexie`, `dexie-react-hooks`, `zod`) are already installed and verified in `package.json`.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| *(none - zero new packages)* | — | — | — | — | [OK] | Approved |

## Architecture Patterns

### System Architecture Diagram

```
User Action (Planner / Settings / TaskDrawer)
  │
  ▼
Validation Layer (Zod Schemas: capacity, override, allocation)
  │
  ▼
Repository Layer
  ├── capacityRepo: getRules(), setRule(), getOverrides(), setOverride(), deleteOverride()
  └── allocationRepo: upsertAllocation(), deleteAllocation(), getWeeklyPlan(weekStartDate)
        │
        ├── Query: capacityRules (all 7 weekdays)
        ├── Query: capacityOverrides (in date range)
        ├── Query: plannedAllocations (in date range)
        └── Query: tasks (joined to check TaskStatus for active load filtering)
  │
  ▼
IndexedDB (Dexie Tables)
  ├── capacityRules
  ├── capacityOverrides
  ├── plannedAllocations
  └── tasks
  │
  ▼ (Reactive updates via useLiveQuery)
UI Presentation
  ├── PlannerView (Week navigation, 7-day columns)
  │     ├── DayColumnHeader (Capacity, Allocated, Balance, Load Tag + Progress)
  │     ├── TaskAllocationCard (Title, Project tag, Duration, Quick edit/delete)
  │     └── AllocationModal (+ Allocate task to date)
  ├── SettingsView / CapacitySettingsModal (Base week inputs, overrides table)
  └── TaskDrawer (Planning tab: estimate vs allocated, multi-date allocations)
```

### Recommended Project Structure
```
src/
├── db/
│   └── repositories/
│       ├── capacityRepo.ts       # Weekly rules and date override persistence
│       └── allocationRepo.ts     # Task allocations, calculations, and active load filtering
├── hooks/
│   └── useWeeklyPlanner.ts       # Reactive hook querying weekly state for PlannerView
├── validation/
│   └── schemas.ts                # Expanded with capacity and allocation schemas
├── utils/
│   └── capacity.ts               # Pure calculation functions (load state, net balance)
├── views/
│   ├── PlannerView.tsx           # Weekly planner grid view (/#/planner)
│   └── SettingsView.tsx          # Settings view (/#/settings) with capacity configuration
└── components/
    ├── planner/
    │   ├── WeekNavigator.tsx     # Prev/Today/Next week and week DatePicker
    │   ├── DayColumn.tsx         # Individual day column (header, cards, footer)
    │   ├── DayColumnHeader.tsx   # Metrics, load status tag, progress bar, context warning
    │   ├── TaskAllocationCard.tsx# Scheduled task card with duration and inline actions
    │   ├── AllocationModal.tsx   # Add/edit allocation form modal
    │   └── CapacitySettingsModal.tsx # Quick modal access to capacity configuration
    ├── settings/
    │   ├── WeeklyCapacityForm.tsx# Mon-Sun hours/minutes inputs with presets
    │   └── OverridesTable.tsx    # Interactive date overrides table (+ Add Override)
    └── tasks/
        └── TaskDrawerPlanning.tsx# Embedded planning section in TaskDrawer
```

### Pattern 1: Pure Effective Capacity & Load Calculation
**What:** Calculation logic must be decoupled from React and database layers for testability and reuse across Planner, Feasibility Engine (Phase 4), and Dashboard (Phase 5).
**When to use:** In `src/utils/capacity.ts`.
**Example:**
```typescript
export type DailyLoadState = 'no-capacity' | 'available' | 'busy' | 'overloaded';

export interface DayCapacityMetrics {
  date: string; // YYYY-MM-DD
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, ...
  effectiveCapacityMinutes: number;
  activeAllocatedMinutes: number;
  inactiveAllocatedMinutes: number;
  netBalanceMinutes: number; // capacity - activeAllocated
  loadState: DailyLoadState;
  percent: number;
  isOverloaded: boolean;
  activeTaskCount: number;
  isHighContextSwitching: boolean; // activeTaskCount > threshold
}

export function calculateDayMetrics(
  date: string,
  capacityMinutes: number,
  activeAllocatedMinutes: number,
  inactiveAllocatedMinutes: number,
  activeTaskCount: number,
  contextSwitchThreshold = 4
): DayCapacityMetrics {
  const netBalance = capacityMinutes - activeAllocatedMinutes;
  let loadState: DailyLoadState;

  if (capacityMinutes === 0) {
    loadState = activeAllocatedMinutes > 0 ? 'overloaded' : 'no-capacity';
  } else {
    const ratio = activeAllocatedMinutes / capacityMinutes;
    if (ratio > 1) {
      loadState = 'overloaded';
    } else if (ratio >= 0.8) {
      loadState = 'busy';
    } else {
      loadState = 'available';
    }
  }

  const percent = capacityMinutes > 0
    ? Math.min(100, Math.round((activeAllocatedMinutes / capacityMinutes) * 100))
    : (activeAllocatedMinutes > 0 ? 100 : 0);

  return {
    date,
    dayOfWeek: dayjs(date).day(),
    effectiveCapacityMinutes: capacityMinutes,
    activeAllocatedMinutes,
    inactiveAllocatedMinutes,
    netBalanceMinutes: netBalance,
    loadState,
    percent,
    isOverloaded: loadState === 'overloaded',
    activeTaskCount,
    isHighContextSwitching: activeTaskCount > contextSwitchThreshold,
  };
}
```

### Pattern 2: Single-Hook Reactive Planner Query with Inactive Task Filtering
**What:** Planner requires aggregating capacity rules, overrides, allocations, and tasks for 7 days. Using one `useLiveQuery` block prevents UI tearing and guarantees transaction isolation.
**When to use:** In `useWeeklyPlanner.ts`.
**Example:**
```typescript
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { getWeeklyPlanData } from '../db/repositories/allocationRepo';

export function useWeeklyPlan(weekStartDate: string, contextThreshold = 4) {
  return useLiveQuery(
    () => getWeeklyPlanData(weekStartDate, contextThreshold, db),
    [weekStartDate, contextThreshold]
  );
}
```

### Anti-Patterns to Avoid
- **Storing calculated load in IndexedDB:** Load state is derived from `(capacity, allocations, task status)`. Never persist `loadState` or `netBalance` into IndexedDB tables; calculate on the fly.
- **Including Done/Cancelled tasks in capacity metrics:** Violates PLAN-05 and D-16. Always inspect the parent task's `status` before adding to `activeAllocatedMinutes`.
- **Duplicate task allocation records per date:** Violates D-12. When allocating to a date where the task already has a record, merge by updating the existing record's `allocatedMinutes`.
- **Timezone conversion on calendar dates:** Never use `new Date()` methods directly or `.toISOString().split('T')[0]` which shifts dates based on UTC offset. Use strict string manipulation or `dayjs(str, 'YYYY-MM-DD').format('YYYY-MM-DD')`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ISO week start / end calculations | Custom calendar modulo arithmetic | `dayjs(date).startOf('isoWeek')` with `dayjs/plugin/isoWeek` | Handles boundary conditions, month crossings, and leap years reliably |
| Multi-field numeric steppers | Custom inputs | Ant Design `InputNumber` with `min={0}` and `max={...}` | Accessible, keyboard-friendly, handles validation and arrow increments |
| Confirmation dialogues | Custom modal overlay | Ant Design `Popconfirm` | Built-in focus trap, keyboard dismiss, and compact positioning |
| Visual status presentation | Pure CSS color bars | Ant Design `Progress` + `Tag` with distinct icons | Ensures dual-encoding (color + icon + text) for accessibility (WCAG 2.1 AA) |

## Common Pitfalls

### Pitfall 1: Sunday Weekday Numbering Misalignment
**What goes wrong:** Monday is treated as day 0 or day 1 inconsistently, causing Monday's capacity to be applied to Sunday.
**Why it happens:** JavaScript's `Date.prototype.getDay()` and Dayjs `.day()` return `0` for Sunday and `1` for Monday. `CapacityRule.dayOfWeek` in `src/types/models.ts` is explicitly typed `0 = Sunday, 1 = Monday, ..., 6 = Saturday`. However, ISO weeks start on Monday (day 1) and end on Sunday (day 0).
**How to avoid:** Explicitly map array indexes to `dayOfWeek`: `[1, 2, 3, 4, 5, 6, 0]`. When querying rule for a date, use `ruleMap.get(dayjs(date).day())`.
**Warning signs:** Sunday capacity showing 8 hours instead of 0 hours in fresh seeds.

### Pitfall 2: Task Deletion Leaving Orphaned Allocations
**What goes wrong:** Allocations remain in `plannedAllocations` table after a task is deleted, polluting date metrics.
**Why it happens:** Direct deletion via `db.tasks.delete(taskId)` without cascade cleanup.
**How to avoid:** `cascadeRepo.ts` already has `deleteTaskWithAllocations(taskId)` and `deleteProjectWithCascade`. Always use `deleteTaskWithAllocations` when deleting tasks.
**Warning signs:** Non-existent task titles appearing on planner day columns.

### Pitfall 3: Inactive Task Allocations Artificially Overloading Days
**What goes wrong:** User completes tasks, but the planner continues showing the day as "Overloaded".
**Why it happens:** Calculating total daily allocated minutes by summing `plannedAllocations.allocatedMinutes` without checking `task.status`.
**How to avoid:** Fetch matching tasks for all allocations and filter where `status !== 'Done' && status !== 'Cancelled'` before computing active load.
**Warning signs:** Completing a task does not reduce the allocated hours on that date.

### Pitfall 4: Day Column Width Collapse on Dense Week
**What goes wrong:** On smaller laptop screens (1024px-1200px), 7 columns squeeze together causing text clipping and broken layout.
**Why it happens:** Using flexbox without `min-width` or horizontal scroll container.
**How to avoid:** Set `min-width: 140px` on day columns with `overflow-x: auto` on the desktop grid container per UI-SPEC. On screens < 768px, switch to a vertical flex column stack.
**Warning signs:** Text overlap in DayColumnHeader metrics on 1100px viewport.

## Code Examples

### Effective Daily Capacity Resolution
```typescript
// Source: Project domain rules (CAP-04, D-08)
export function getEffectiveCapacity(
  date: string,
  rulesByDay: Map<number, number>,
  overridesByDate: Map<string, number>
): number {
  if (overridesByDate.has(date)) {
    return overridesByDate.get(date)!;
  }
  const dayOfWeek = dayjs(date, 'YYYY-MM-DD').day();
  return rulesByDay.get(dayOfWeek) ?? 0;
}
```

### Upsert Allocation with Merge Semantics
```typescript
// Source: D-12 unique constraint per task/day
export async function upsertAllocation(
  taskId: string,
  date: string,
  allocatedMinutes: number,
  db: TaskPlannerDatabase = defaultDb
): Promise<PlannedAllocation> {
  return await db.transaction('rw', db.plannedAllocations, async () => {
    const existing = await db.plannedAllocations
      .where('taskId')
      .equals(taskId)
      .and((a) => a.date === date)
      .first();

    if (existing) {
      const updated: PlannedAllocation = {
        ...existing,
        allocatedMinutes,
      };
      await db.plannedAllocations.put(updated);
      return updated;
    }

    const newRecord: PlannedAllocation = {
      id: generateId(),
      taskId,
      date,
      allocatedMinutes,
    };
    await db.plannedAllocations.add(newRecord);
    return newRecord;
  });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Color-only status tags | Tag + Icon + Text dual-encoding | Ant Design 6 / WCAG 2.1 | Colorblind users can distinguish Available, Busy, Overloaded, and No Capacity |
| Dialog wizards for allocations | Fast inline Popovers & compact modals | Phase 02 / Phase 03 UI spec | Minimal navigation, instant adjustments without losing weekly context |
| Hard-blocking allocation overflow | Soft warning banner | Phase 03 D-10 | Users retain autonomy to schedule contingency time without system lockouts |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Context switching threshold of 4 tasks/day is a safe default for cognitive load. | User Constraints / D-13 | Minimal; value is configurable in Settings and defaults gracefully. |

## Open Questions

1. **Should setting an override to 0h automatically tag it as 'Leave'?**
   - What we know: Overrides have an optional `note?: string` field.
   - What's unclear: Whether the quick-click popover on the planner column should offer preset note choices ("Holiday", "Leave", "Sick").
   - Recommendation: Default note to empty string, offer a quick text input or preset dropdown ("Holiday", "Personal Leave", "Overtime") in the form.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build and tests | ✓ | 20.19.5 / 24 LTS | — |
| Vite | Dev and build | ✓ | 8.3.1 | — |
| Vitest | Test execution | ✓ | 5.0.2 | — |
| Ant Design | UI Components | ✓ | 6.6.5 | — |
| Dexie | Local persistence | ✓ | 4.4.6 | — |
| Dayjs | Date calculations | ✓ | 1.11.23 | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.2 + jsdom 29.1.1 + fake-indexeddb 6.2.5 |
| Config file | `vite.config.ts` |
| Quick run command | `npm test -- tests/db/capacityRepo.test.ts tests/db/allocationRepo.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CAP-01 | Configure available work minutes per weekday | unit | `npm test -- tests/db/capacityRepo.test.ts` | ❌ Wave 0 |
| CAP-02 | Starts with 8h M-F and 0h Sa-Su, all values editable | unit | `npm test -- tests/db/capacityRepo.test.ts` | ❌ Wave 0 |
| CAP-03 | Override capacity for specific date (leave/OT) | unit | `npm test -- tests/db/capacityRepo.test.ts` | ❌ Wave 0 |
| CAP-04 | Effective daily capacity falls back to weekly template | unit | `npm test -- tests/utils/capacity.test.ts` | ❌ Wave 0 |
| PLAN-01 | Assign planned hours/minutes to calendar dates | unit | `npm test -- tests/db/allocationRepo.test.ts` | ❌ Wave 0 |
| PLAN-02 | Edit/remove daily task allocation & total allocated time | unit | `npm test -- tests/db/allocationRepo.test.ts` | ❌ Wave 0 |
| PLAN-03 | See capacity, allocated time, and net balance | unit | `npm test -- tests/utils/capacity.test.ts` | ❌ Wave 0 |
| PLAN-04 | Distinguish 4 load states using text + icon + color | component | `npm test -- tests/components/DayColumnHeader.test.tsx` | ❌ Wave 0 |
| PLAN-05 | Inactive tasks excluded from active workload totals | unit | `npm test -- tests/db/allocationRepo.test.ts` | ❌ Wave 0 |
| PLAN-06 | Adjust allocations before saving | component | `npm test -- tests/components/AllocationModal.test.tsx` | ❌ Wave 0 |
| UX-02 | Keyboard accessibility and visible focus | component | `npm test -- tests/components/PlannerView.test.tsx` | ❌ Wave 0 |
| UX-05 | Fast inline controls with minimal navigation | component | `npm test -- tests/components/TaskAllocationCard.test.tsx` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** Quick unit test targeting altered domain repository or utility (`npm test -- tests/db/capacityRepo.test.ts`).
- **Per wave merge:** Full test suite (`npm test`).
- **Phase gate:** Full suite green (115 existing + new phase tests) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `tests/db/capacityRepo.test.ts` — covers CAP-01, CAP-02, CAP-03
- [ ] `tests/utils/capacity.test.ts` — covers CAP-04, PLAN-03, PLAN-04 (load state and net balance calculations)
- [ ] `tests/db/allocationRepo.test.ts` — covers PLAN-01, PLAN-02, PLAN-05 (allocations CRUD, merge semantics, inactive exclusion)
- [ ] `tests/components/DayColumnHeader.test.tsx` — covers PLAN-04, UX-02 (accessible load presentation)
- [ ] `tests/components/PlannerView.test.tsx` — covers weekly grid rendering, week navigation, route integration

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Personal single-user local application; no authentication required |
| V3 Session Management | no | Local application state stored in IndexedDB |
| V4 Access Control | no | Local single-user origin; no multi-tenant access control |
| V5 Input Validation | yes | Zod schemas for all capacity and allocation inputs (ranges: 0-1440 mins/day, date regex) |
| V6 Cryptography | no | Cryptography applies to Phase 8 (backup encryption); not Phase 3 |

### Known Threat Patterns for Local Planner Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed allocation minutes / negative numbers | Tampering | Strict Zod validation: integer, non-negative, clamped to 0-6000 minutes |
| Invalid calendar date strings breaking queries | Denial of Service | Strict `isValidCalendarDate` check rejecting non-canonical `YYYY-MM-DD` strings |
| XSS via task notes or override notes | Tampering / Information Disclosure | React JSX default text escaping and Ant Design component sanitization |

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `src/db/schema.ts`, `src/db/seeds.ts`, `src/types/models.ts`, `src/utils/date.ts`, `src/utils/time.ts`
- Phase Context: `.planning/phases/03-capacity-model-daily-planning-ledger/03-CONTEXT.md`
- UI Design Contract: `.planning/phases/03-capacity-model-daily-planning-ledger/03-UI-SPEC.md`
- Project Instructions: `CLAUDE.md`

### Secondary (MEDIUM confidence)
- Dayjs documentation for ISO week plugin (`dayjs/plugin/isoWeek`)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all dependencies already installed and active in codebase
- Architecture: HIGH - schemas and seed structures already aligned with Phase 3 design
- Pitfalls: HIGH - verified timezone, cascade, and weekday numbering edge cases

**Research date:** 2026-09-26
**Valid until:** 2026-10-26 (stable local architecture)
