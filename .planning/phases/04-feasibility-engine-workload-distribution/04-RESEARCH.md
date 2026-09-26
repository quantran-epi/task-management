# Phase 04: Feasibility Engine & Workload Distribution - Research

**Researched:** 2026-09-27  
**Domain:** Deterministic scheduling algorithms, workload feasibility evaluation, and interactive allocation review  
**Confidence:** HIGH  

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Default evaluation start date for tasks with a deadline (`dueDate` or milestone `targetDate`) starts from `today` (`YYYY-MM-DD`) through the deadline date inclusive. Past dates cannot receive new planning allocations.
- **D-02:** Calculation evaluates remaining unallocated task minutes (`Math.max(0, task.estimateMinutes - totalActiveAllocatedMinutes)`). If a task already has partial allocations, only unallocated minutes are distributed. If already fully planned, engine notifies that no further allocation is needed.
- **D-03:** Dual range evaluation mode:
  - `By Deadline`: Active by default if the task has a `dueDate` or milestone `targetDate` (evaluates `today` to `deadline`).
  - `Custom Range`: Ant Design `DatePicker.RangePicker` allowing arbitrary start and end dates (defaults to `today` through next 7 calendar days if no deadline exists).
- **D-04:** Eligible dates strictly require `effectiveCapacityMinutes > 0` AND `netBalanceMinutes > 0`. Zero-capacity days (weekends, holidays, 0h leave overrides), fully booked days (`netBalanceMinutes === 0`), overloaded days, and past calendar dates are classified as excluded/ineligible and never receive automated allocations.
- **D-05:** Dynamic strategy selector on UI:
  - `Balanced Spread` (Default, adheres to CALC-05): Distributes minutes iteratively to balance load percentages across eligible days, strictly prioritizing lowest current load with earlier dates breaking ties.
  - `Front-load`: Allocates up to available capacity starting from the earliest eligible days forward to complete work as soon as possible.
  - `Greedy Fill`: Completely fills lowest-load days up to their daily limit to minimize total active working days.
  - Switching strategy instantly re-computes candidate allocations reactively without saving.
- **D-06:** Daily task limit: Defaults to filling up to each date's remaining `netBalanceMinutes`, with an optional `Max hours/day` input field allowing users to cap daily task focus (e.g. max 2h or 4h per day for this specific task).
- **D-07:** Allocation step size (granularity): All candidate allocation blocks are quantized to 15-minute multiples (`15m`, `30m`, `45m`, `1h`...), matching existing `TaskDrawerPlanning` input conventions. Any remaining residual (< 15m) is consolidated into the first eligible candidate day.
- **D-08:** Existing allocation merging (D-12 compliance): If a candidate day already contains an allocation record for this same task, the engine calculates incremental minutes such that `(existing + candidate) <= dayCapacity`. Upon acceptance, allocations are merged into one unique record per `(taskId, date)` with explicit display: `Existing: Xm + Proposed: Ym = Total: Zm`.
- **D-09:** Deficit & Earliest Feasible Date: When total net available capacity in the target range is less than remaining estimate, engine displays explicit shortage (`Deficit: -Xh Ym`, CALC-03) AND automatically projects forward to determine the `Earliest Feasible Date` (first date on which sufficient cumulative working capacity would accommodate the entire task).
- **D-10:** Partial Allocation option: When infeasible, the engine allows an explicit "Allocate Available Capacity (Xh Ym)" action. Candidate allocations fill up to available capacity across eligible days with an informative warning banner that `Zh Wm remains unallocated`. The engine never forces or automatically creates overloaded days.
- **D-11:** Date Inspection Breakdown (CALC-04): Visual metrics summary row (`Available days`, `Full days`, `Overloaded days`, `Excluded non-working days`) paired with a compact table/list showing date, day of week, capacity, allocated load, remaining net balance, and status badge (`Available`, `Full`, `Overloaded`, `Excluded-Holiday/Weekend`).
- **D-12:** Action Shortcuts for infeasible recovery:
  - `Extend to Earliest Feasible Date`: One-click button to update range end date to the suggested feasible date and re-run calculation instantly.
  - `Add Capacity Override`: Shortcut opening quick capacity override modal to convert non-working days or add overtime hours.
  - `Adjust Estimate`: Shortcut to update task `estimateMinutes` to fit the current window.
- **D-13:** Dual entry points:
  - Prominent `✨ Check Feasibility & Auto-Distribute` button inside `TaskDrawer` Planning section for the currently viewed task.
  - Quick action button on `PlannerView` and `TasksView` toolbars opening task selection modal.
- **D-14:** Dedicated `FeasibilityModal` (`width: ~720px`) housing the full evaluation lifecycle:
  1. Parameters & Strategy selector (Range, Strategy radio/segmented, optional Max Cap).
  2. Feasibility Banner & Summary Metrics (Feasible / Infeasible badge, Surplus / Deficit, Earliest Feasible Date).
  3. Interactive Candidate Allocations Review Table.
  4. Date Inspection Breakdown collapse/drawer.
  5. Action buttons (`Cancel`, `Apply Allocations`).
- **D-15:** Interactive Candidate Review Table:
  - Checkbox per candidate row to include/exclude specific dates.
  - `InputNumber` hours/minutes fields to manually tweak allocated time per date before committing.
  - Reactive recalculation of total planned vs remaining minutes as user edits.
- **D-16:** Post-Apply feedback: Displays Ant Design success message (`Successfully allocated Xh Ym across N days`), closes `FeasibilityModal`, triggers reactive live queries, and offers quick link to jump to the relevant week on `PlannerView`.

### Claude's Discretion
- Exact layout spacing, subcomponent breakdown (`FeasibilityModal`, `CandidateAllocationsTable`, `DateBreakdownList`).
- Pure algorithmic utility module architecture (`src/utils/feasibility.ts` separating math from React UI).
- Empty state and loading indicators during live calculation.

### Deferred Ideas (OUT OF SCOPE)
- Long-range dashboard views (7-day, 14-day, next-month forecast) and overload warnings summary (Phase 5: DASH-01 to DASH-06).
- Multi-task batch auto-scheduling across an entire milestone (v2 backlog).
- Auto-rebalancing existing allocations when high-priority urgent work arrives (v2 backlog).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CALC-01 | User can evaluate a task estimate against an inclusive date range or a deadline. | Dual evaluation window model (`By Deadline` and `Custom Range`), date normalization (`YYYY-MM-DD`), non-negative unallocated remaining minutes check in `evaluateTaskFeasibility()`. |
| CALC-02 | Feasibility calculation accounts for weekly capacity, date overrides, zero-capacity days, and existing active allocations. | Daily capacity resolution reusing `getEffectiveDailyCapacity()`, querying active allocations (`getAllocationsForDate` / `getWeeklyAllocationsWithTasks`), subtracting existing load to derive `netBalanceMinutes > 0`. |
| CALC-03 | User receives a clear feasible or infeasible result with remaining capacity or shortage in hours and minutes. | Result banner contract in `FeasibilityModal` computing surplus (`+Xh Ym`) or deficit (`-Xh Ym`), projecting `earliestFeasibleDate` when infeasible, and offering one-click extend shortcut. |
| CALC-04 | User can inspect which dates were available, full, overloaded, or excluded from the calculation. | Date inspection breakdown drawer/table categorizing all evaluated dates into four distinct status groups (`Available`, `Full`, `Overloaded`, `Excluded`) with clear metrics summary pills. |
| CALC-05 | When capacity permits, user receives a deterministic candidate distribution that favors eligible dates with the lowest current load and uses earlier dates to break ties. | Pure calculation engine implementing `Balanced Spread` (load-balancing min-heap/priority queue simulation), `Front-load`, and `Greedy Fill` strategies with strict deterministic tie-breaking (earlier date wins). 15-minute quantization with remainder consolidation. |
| CALC-06 | Suggested allocations do not modify saved data until the user reviews and accepts them. | In-memory candidate review table in `FeasibilityModal` allowing inclusion toggling and manual minute tweaks. Persistence strictly deferred until user clicks `Apply Allocations`, writing via atomic Dexie transaction `upsertAllocation`. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Local runtime only**: 100% client-side logic; no backend or server APIs.
- **Persistence**: IndexedDB via Dexie 4.4.6; wrap multi-table or batch operations in atomic transactions.
- **Identifiers & Dates**: Client-generated `crypto.randomUUID()`. Calendar dates stored strictly as timezone-agnostic `YYYY-MM-DD` strings.
- **UI System**: Ant Design 6.6.5 + `@ant-design/icons` 6.3.4 with WCAG 2.1 AA accessibility (color + icon/text dual encoding).
- **Date manipulation**: Dayjs 1.11.23.
- **Testing**: Vitest 5.0.2 with `@testing-library/react` and `fake-indexeddb`. All non-trivial logic must leave runnable unit tests.

## Summary

Phase 4 introduces the scheduling engine and review interface for the Personal Task & Workload Planner. The core objective is turning static estimates and capacity rules into actionable, deterministic daily distributions without surprising the user or mutating data without explicit approval.

The system is architected into two decoupled tiers:
1. **Algorithmic Engine (`src/utils/feasibility.ts`)**: A pure TypeScript functional pipeline that takes task details, existing allocations, weekly rules, and overrides, evaluates date eligibility, computes feasibility surplus/deficit, projects forward to find earliest feasible completion dates, and distributes minutes across eligible days using three selectable strategies (`Balanced Spread`, `Front-load`, `Greedy Fill`).
2. **Review & Application Layer (`src/components/planner/FeasibilityModal.tsx`)**: An interactive Ant Design modal providing parameter tuning, feasibility status alerts, candidate allocation adjustments with 15-minute quantization, date-by-date capacity breakdown inspection, and an atomic batch commit that merges proposed minutes with existing allocations.

**Primary recommendation:** Build `src/utils/feasibility.ts` as a pure, dependency-injected module verified with comprehensive Vitest tests first, then layer `FeasibilityModal.tsx` and entry-point integrations (`TaskDrawerPlanning.tsx`, `PlannerView.tsx`, `TasksView.tsx`) on top.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Feasibility Math & Distribution | Client Domain Logic (`src/utils/feasibility.ts`) | — | Pure function logic operating on memory objects; zero DOM or storage coupling ensures high speed and 100% test coverage. |
| Capacity & Override Resolution | Client Repo / Utils (`src/utils/capacity.ts`, `src/db/repositories/capacityRepo.ts`) | — | Established Phase 3 logic determining daily effective capacity and active task load. |
| Allocation Persistence & Merging | Client Database (`src/db/repositories/allocationRepo.ts`) | Dexie IndexedDB | Enforces D-12 unique constraint per `(taskId, date)` via atomic transactions. |
| Interactive Review & Tuning UI | Client UI Component (`src/components/planner/FeasibilityModal.tsx`) | Ant Design 6 | In-memory draft state allows user editing without premature persistence. |
| Entry Point Triggers | Client Views & Drawers (`TaskDrawerPlanning.tsx`, `PlannerView.tsx`, `TasksView.tsx`) | — | Surfaces feasibility tools seamlessly in single-task and aggregate planning workflows. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.3.0 | UI rendering | Project foundation [VERIFIED: package.json] |
| Ant Design | 6.6.5 | Modal, Table, Alert, DatePicker, Segmented, InputNumber | Project standard UI system [VERIFIED: package.json] |
| Dayjs | 1.11.23 | Date range traversal, weekday extraction, string formatting | Project standard date library [VERIFIED: package.json] |
| Dexie | 4.4.6 | Local database storage & transactions | Project standard IndexedDB wrapper [VERIFIED: package.json] |
| zod | 4.6.5 | Data validation | Validates candidate allocation inputs before persistence [VERIFIED: package.json] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @ant-design/icons | 6.3.4 | Icons (`ThunderboltOutlined`, `CheckCircleOutlined`, `ExclamationCircleOutlined`, `ClockCircleOutlined`, etc.) | Visual indicators for modal headers, alerts, and buttons [VERIFIED: package.json] |
| dexie-react-hooks | 4.4.0 | `useLiveQuery` | Reactively populates task and capacity state in modal dialogs [VERIFIED: package.json] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom min-heap queue | Plain array sorting per round | Array sorting is trivial and fast for <= 90 planning days; no complex heap library needed. |
| External scheduling solver (e.g. simplex/LP) | Deterministic greedy round-robin | Linear solvers are heavyweight and non-deterministic across engines; greedy round-robin is 100% predictable, explainable to the user, and lightweight. |

**Installation:**
No new npm packages required. Existing dependencies completely satisfy all Phase 4 requirements.

## Package Legitimacy Audit

No new external packages are introduced in Phase 4. All dependencies (`antd`, `dayjs`, `dexie`, `react`, `zod`) were verified during Phase 1.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| *(none)* | npm | — | — | — | [OK] | No new packages needed |

## Architecture Patterns

### System Architecture Diagram

```
User Action (Click "✨ Check Feasibility & Auto-Distribute")
     │
     ▼
[FeasibilityModal Open] ──── Query Active Task, Weekly Rules, Overrides, Existing Allocations
     │
     ▼
[Parameter Setup] (Mode: By Deadline / Custom Range; Strategy: Balanced / Front-load / Greedy; Max Cap)
     │
     ▼
[src/utils/feasibility.ts :: evaluateTaskFeasibility()]
     ├── 1. Generate date sequence [startDate .. endDate]
     ├── 2. Map Day Metrics (Capacity, Active Load, Net Balance)
     ├── 3. Partition Dates: Eligible (cap > 0, net > 0) vs Ineligible (no-capacity, full, overloaded, past)
     ├── 4. Evaluate Surplus / Deficit: Net Balance Sum vs Remaining Task Estimate
     ├── 5. Infeasible? ──► Forward-scan to project Earliest Feasible Date
     └── 6. Feasible or Partial? ──► Run Distribution Strategy (15m step quantization + tie-breaking)
     │
     ▼
[Feasibility Result & Candidate Review Table]
     ├── Feasibility Alert (Green Feasible / Amber Infeasible + Deficit + Earliest Date)
     ├── Action Buttons (Extend to Date / Allocate Available)
     ├── Interactive Candidate Rows (Include Checkbox, Proposed Minutes InputNumber)
     └── Collapsible Date Inspection Breakdown (Summary Tags + All Days Table)
     │
     ▼
User Clicks "Apply Allocations"
     │
     ▼
[Dexie Transaction] ──► upsertAllocation() for each included candidate day (merge with existing)
     │
     ▼
Success Message + Modal Closes + UI Auto-updates (via useLiveQuery)
```

### Recommended Project Structure
```
src/
├── utils/
│   ├── capacity.ts            # (Existing) Daily capacity & load state metrics
│   ├── date.ts                # (Existing) Date helpers
│   └── feasibility.ts         # (NEW) Pure feasibility engine & distribution algorithms
├── types/
│   └── feasibility.ts         # (NEW) Feasibility interfaces, options, and candidate types
├── components/
│   ├── planner/
│   │   ├── FeasibilityModal.tsx           # (NEW) Main orchestration modal
│   │   ├── CandidateAllocationsTable.tsx  # (NEW) Interactive review & edit table
│   │   └── DateInspectionBreakdown.tsx    # (NEW) Collapsible date breakdown drawer/table
│   └── tasks/
│       └── TaskDrawerPlanning.tsx         # (UPDATE) Add feasibility trigger button
└── views/
    ├── PlannerView.tsx                    # (UPDATE) Add toolbar feasibility trigger
    └── TasksView.tsx                      # (UPDATE) Add quick feasibility trigger
tests/
└── utils/
    └── feasibility.test.ts                # (NEW) Exhaustive unit tests for calculation engine
```

### Pattern 1: Pure Algorithmic Engine Pipeline
**What:** Separate the mathematical simulation of capacity and distribution from React component lifecycle and IndexedDB queries.
**When to use:** All feasibility calculations and strategy allocations.
**Example:**
```typescript
// src/utils/feasibility.ts
export type DistributionStrategy = 'balanced-spread' | 'front-load' | 'greedy-fill';

export interface FeasibilityEvaluationInput {
  task: Task;
  existingTaskAllocations: PlannedAllocation[];
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  rules: Map<number, number> | CapacityRule[];
  overrides: Map<string, number> | CapacityOverride[];
  activeAllocationsByDate: Record<string, number>; // total active minutes from other tasks
  strategy?: DistributionStrategy;
  maxMinutesPerDay?: number; // optional focus cap
}

export interface CandidateAllocation {
  date: string;
  dayOfWeek: number;
  existingAllocatedMinutes: number;
  proposedAllocatedMinutes: number;
  totalResultingMinutes: number;
  maxAvailableMinutes: number;
  included: boolean;
}

export interface DateInspectionItem {
  date: string;
  dayOfWeek: number;
  capacityMinutes: number;
  activeLoadMinutes: number;
  netBalanceMinutes: number;
  status: 'available' | 'full' | 'overloaded' | 'excluded-past' | 'excluded-non-working';
}

export interface FeasibilityResult {
  isFeasible: boolean;
  remainingTaskEstimateMinutes: number;
  totalAvailableNetMinutes: number;
  surplusMinutes: number;
  deficitMinutes: number;
  earliestFeasibleDate?: string;
  candidateAllocations: CandidateAllocation[];
  dateBreakdown: DateInspectionItem[];
}
```

### Pattern 2: Deterministic Balanced Spread (CALC-05)
**What:** Balanced load distribution allocates 15-minute quanta iteratively to the day with the lowest resulting load percentage (`activeAllocatedMinutes / effectiveCapacityMinutes`), with ties broken strictly by earlier calendar date.
**Algorithm details:**
1. Filter dates to eligible candidates: `effectiveCapacityMinutes > 0` AND `netBalanceMinutes > 0` AND `date >= today`.
2. Compute `maxCandidateMinutes = Math.min(netBalanceMinutes, maxMinutesPerDay ?? Infinity)`.
3. In each iteration (step = 15 minutes):
   - Find candidate day where `proposedAllocatedMinutes + 15 <= maxCandidateMinutes` and resulting load ratio is minimal.
   - If load ratios tie, pick candidate with earliest `date.localeCompare(otherDate) < 0`.
   - Allocate 15 minutes. Deduct from remaining minutes to allocate.
4. Any residual minutes (< 15m) are added to the first candidate day with remaining capacity.

### Anti-Patterns to Avoid
- **Mutating DB before confirmation:** Never call `upsertAllocation` during range change or strategy switching; calculate purely in React state.
- **Allocating to past dates:** Never distribute work to calendar dates prior to today (`YYYY-MM-DD`), even if the user selects a custom range covering the past.
- **Ignoring existing task allocations on candidate dates:** If the task already has 60m planned on a candidate date and the day's net balance is 120m, the candidate proposed minutes can at most be 120m, resulting in a merged total of 180m (provided day capacity allows). Always display `Existing + Proposed = Total`.
- **Forcing overloaded days when infeasible:** When infeasible, do not over-allocate available days to fit the estimate. Cap candidates strictly at net available capacity and flag unallocated deficit.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Date math & weekday indexes | Custom Date object math | Dayjs (`dayjs(date).day()`, `dayjs(date).add(1, 'day')`) | Native Date objects have notorious timezone offset drift across midnight. |
| Date range UI picker | Custom two-input date form | Ant Design `DatePicker.RangePicker` | AntD handles popup calendar, keyboard navigation, range highlighting, and disabled dates out-of-the-box. |
| Modals & focus traps | Custom overlay and tab index traps | Ant Design `Modal` with `createFocusRestorer()` | Fully accessible dialog with escape key, focus trapping, and focus restoration to the trigger element. |
| In-memory sorting & queueing | Heavy external priority queue library | Standard JavaScript array `.sort()` | Number of planning days is small (typically 7 to 90 days); simple iterative sort/find is sub-millisecond and zero-dependency. |

## Runtime State Inventory

*Step 2.5: SKIPPED (Greenfield feature addition; no renames, migrations, or persistent schema alterations).*

## Common Pitfalls

### Pitfall 1: Timezone Drift in Date Traversal
**What goes wrong:** Iterating through dates using `new Date()` or UTC increments causes days to repeat or skip around daylight saving shifts or UTC boundaries.
**Why it happens:** Converting between ISO timestamps and local midnight.
**How to avoid:** Use canonical `YYYY-MM-DD` strings with Dayjs: `dayjs(currentDateStr, 'YYYY-MM-DD').add(1, 'day').format('YYYY-MM-DD')`.

### Pitfall 2: Double-Counting Existing Task Allocations in Net Balance
**What goes wrong:** When evaluating a task that already has 60 minutes allocated on a date, the engine sees 60 minutes as "active load" and subtracts it from net balance, reducing the room for that same task.
**Why it happens:** `activeAllocatedMinutes` from the database includes allocations for *all* active tasks, including the current task being re-evaluated.
**How to avoid:** For the task being evaluated, exclude its existing allocation from the day's active load when calculating `maxAvailableMinutesForTask = capacity - otherTasksActiveLoad`.

### Pitfall 3: Infeasible Infinite Loop in Earliest Feasible Date Projection
**What goes wrong:** If the user has 0 hours configured on all weekdays and no overrides, projecting forward to find `Earliest Feasible Date` could loop infinitely.
**Why it happens:** While loop scanning forward until `cumulativeCapacity >= remainingEstimate`.
**How to avoid:** Bound forward projection to a maximum horizon (e.g. 365 calendar days). If no capacity is found within 365 days, return `undefined` and message: "No working capacity configured in the next 365 days."

### Pitfall 4: Violating the D-12 Unique `(taskId, date)` Constraint
**What goes wrong:** Applying auto-distributed allocations adds duplicate records for the same task on the same date.
**Why it happens:** Using Dexie `add()` instead of `upsertAllocation()` or not merging proposed minutes with existing minutes.
**How to avoid:** Use `upsertAllocation(taskId, date, existingMinutes + proposedMinutes, db)` wrapped in an atomic Dexie transaction.

## Code Examples

### 1. Date Eligibility & Day Categorization (CALC-02, CALC-04)
```typescript
// Verified pattern based on src/utils/capacity.ts
export function inspectDateCapacity(
  date: string,
  today: string,
  task: Task,
  rules: Map<number, number> | CapacityRule[],
  overrides: Map<string, number> | CapacityOverride[],
  allAllocationsOnDate: PlannedAllocationWithTask[]
): DateInspectionItem {
  const isPast = date < today;
  const capacity = getEffectiveDailyCapacity(date, rules, overrides);
  
  // Exclude current task from other tasks load
  const otherActiveLoad = allAllocationsOnDate
    .filter((a) => a.isActive && a.taskId !== task.id)
    .reduce((sum, a) => sum + a.allocatedMinutes, 0);

  const netBalance = Math.max(0, capacity - otherActiveLoad);
  const dayOfWeek = dayjs(date, 'YYYY-MM-DD').day();

  let status: DateInspectionItem['status'];
  if (isPast) {
    status = 'excluded-past';
  } else if (capacity === 0) {
    status = 'excluded-non-working';
  } else if (otherActiveLoad > capacity) {
    status = 'overloaded';
  } else if (netBalance === 0) {
    status = 'full';
  } else {
    status = 'available';
  }

  return {
    date,
    dayOfWeek,
    capacityMinutes: capacity,
    activeLoadMinutes: otherActiveLoad,
    netBalanceMinutes: netBalance,
    status,
  };
}
```

### 2. Forward Projection for Earliest Feasible Date (CALC-03, D-09)
```typescript
export function findEarliestFeasibleDate(
  startDate: string,
  requiredMinutes: number,
  task: Task,
  rules: Map<number, number> | CapacityRule[],
  overrides: Map<string, number> | CapacityOverride[],
  getAllocationsForDateFn: (date: string) => number, // other tasks active load
  maxHorizonDays = 365
): string | undefined {
  if (requiredMinutes <= 0) return startDate;

  let accumulatedMinutes = 0;
  let cursor = dayjs(startDate, 'YYYY-MM-DD');

  for (let i = 0; i < maxHorizonDays; i++) {
    const dateStr = cursor.format('YYYY-MM-DD');
    const cap = getEffectiveDailyCapacity(dateStr, rules, overrides);
    if (cap > 0) {
      const otherLoad = getAllocationsForDateFn(dateStr);
      const available = Math.max(0, cap - otherLoad);
      accumulatedMinutes += available;
      if (accumulatedMinutes >= requiredMinutes) {
        return dateStr;
      }
    }
    cursor = cursor.add(1, 'day');
  }

  return undefined; // Exceeded 365-day search window
}
```

### 3. Balanced Spread Strategy Implementation (CALC-05, D-05, D-07)
```typescript
export function distributeBalancedSpread(
  eligibleDates: { date: string; capacityMinutes: number; existingOtherLoad: number; maxMinutes: number }[],
  minutesToDistribute: number,
  quantum = 15
): Map<string, number> {
  const proposed = new Map<string, number>();
  for (const d of eligibleDates) proposed.set(d.date, 0);

  let remaining = minutesToDistribute;

  while (remaining >= quantum) {
    // 1. Filter candidates that still have room for at least 1 quantum
    const availableCandidates = eligibleDates.filter((d) => {
      const current = proposed.get(d.date) ?? 0;
      return current + quantum <= d.maxMinutes;
    });

    if (availableCandidates.length === 0) break;

    // 2. Sort by current load ratio ascending, ties broken by earlier date
    availableCandidates.sort((a, b) => {
      const loadA = (a.existingOtherLoad + (proposed.get(a.date) ?? 0)) / a.capacityMinutes;
      const loadB = (b.existingOtherLoad + (proposed.get(b.date) ?? 0)) / b.capacityMinutes;
      if (Math.abs(loadA - loadB) > 0.0001) {
        return loadA - loadB;
      }
      return a.date.localeCompare(b.date);
    });

    // 3. Allocate quantum to best candidate
    const chosen = availableCandidates[0]!;
    proposed.set(chosen.date, (proposed.get(chosen.date) ?? 0) + quantum);
    remaining -= quantum;
  }

  // 4. Consolidate residual (< 15m) into first eligible date with room
  if (remaining > 0) {
    for (const d of eligibleDates) {
      const cur = proposed.get(d.date) ?? 0;
      if (cur + remaining <= d.maxMinutes) {
        proposed.set(d.date, cur + remaining);
        remaining = 0;
        break;
      }
    }
  }

  return proposed;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Automatic background rescheduling | Preview modal with explicit confirmation | UI-SPEC & CALC-06 | User retains 100% control; no unexpected calendar edits. |
| Heuristic day-filling | 3 user-selectable strategies (Balanced, Front-load, Greedy) | D-05 | Adapts to user work style (steady pacing vs finishing ASAP). |
| Static error message on infeasible tasks | Deficit hours + projected Earliest Feasible Date + one-click extend | D-09, D-12 | Turns failure into immediate actionable path forward. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Evaluation window defaults to next 7 days if task has no deadline | Architecture Patterns | Low; user can adjust range via `RangePicker` instantly. |
| A2 | Forward projection limit capped at 365 calendar days | Common Pitfalls | Low; personal tasks rarely have horizons exceeding 1 year without working capacity. |

## Open Questions

1. **How should milestone target dates influence task evaluation window if task has no direct `dueDate`?**
   - What we know: D-01 and D-03 specify: "Active by default if the task has a `dueDate` or milestone `targetDate`."
   - Recommendation: Check `task.deadline` first; if absent and `task.milestoneId` is present, look up the milestone's `targetDate` as the fallback deadline.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Dev / Build runtime | ✓ | 20.19.5 | — |
| npm | Package manager | ✓ | 10.8.2 | — |
| Vitest | Test suite | ✓ | 5.0.2 | — |
| Browser IndexedDB | Local persistence | ✓ | fake-indexeddb 6.2.5 in tests | — |

**Missing dependencies with no fallback:** None.  
**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.2 [VERIFIED: package.json] |
| Config file | `vite.config.ts` [VERIFIED: codebase] |
| Quick run command | `npx vitest run tests/utils/feasibility.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CALC-01 | Evaluates estimate against range or deadline (inclusive, handles partial allocations) | unit | `npx vitest run tests/utils/feasibility.test.ts -t "CALC-01"` | ❌ Wave 0 |
| CALC-02 | Evaluates weekly capacity, overrides, 0-capacity days, and existing active load | unit | `npx vitest run tests/utils/feasibility.test.ts -t "CALC-02"` | ❌ Wave 0 |
| CALC-03 | Reports feasible/infeasible with surplus/deficit and earliest feasible date | unit | `npx vitest run tests/utils/feasibility.test.ts -t "CALC-03"` | ❌ Wave 0 |
| CALC-04 | Date inspection groups available, full, overloaded, and excluded days | unit | `npx vitest run tests/utils/feasibility.test.ts -t "CALC-04"` | ❌ Wave 0 |
| CALC-05 | Generates deterministic candidate distribution prioritizing lowest load (tie: earlier date) | unit | `npx vitest run tests/utils/feasibility.test.ts -t "CALC-05"` | ❌ Wave 0 |
| CALC-06 | Preview changes in UI; no mutations until explicit confirmation | unit / component | `npx vitest run tests/components/FeasibilityModal.test.tsx -t "CALC-06"` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/utils/feasibility.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full test suite green (27+ test files) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `tests/utils/feasibility.test.ts` — covers CALC-01, CALC-02, CALC-03, CALC-04, CALC-05
- [ ] `tests/components/FeasibilityModal.test.tsx` — covers CALC-06, D-14, D-15 interaction workflows

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Single personal user local app; no authentication |
| V3 Session Management | no | Local app; no session tokens |
| V4 Access Control | no | Local single user |
| V5 Input Validation | yes | Runtime schema validation (`zod`) on dates, minutes, and candidate overrides |
| V6 Cryptography | no | No cryptographic changes in this phase (deferred to Phase 8) |

### Known Threat Patterns for Local Scheduling App

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Infinite loop DoS via invalid date projection | Denial of Service | Impose hard 365-day cap on forward date search |
| Corrupt allocation minutes via invalid number inputs | Tampering | Enforce non-negative integer validation via `zod` and `Math.round` / quantization |
| Data loss via unconfirmed auto-schedule overwrite | Tampering | In-memory candidate draft only; commit solely upon explicit button click |

## Sources

### Primary (HIGH confidence)
- Codebase files: `src/utils/capacity.ts`, `src/db/repositories/allocationRepo.ts`, `src/components/tasks/TaskDrawerPlanning.tsx`
- Phase contracts: `.planning/phases/04-feasibility-engine-workload-distribution/04-CONTEXT.md`, `04-UI-SPEC.md`
- Project specification: `CLAUDE.md`, `.planning/REQUIREMENTS.md`

### Secondary (MEDIUM confidence)
- Vitest & Dexie documentation verified through existing working test suite.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Directly verified from package.json and running codebase
- Architecture: HIGH - Clear separation between pure utility module and AntD review modal
- Pitfalls: HIGH - Edge cases mapped directly to capacity logic and timezone safety

**Research date:** 2026-09-27  
**Valid until:** Stable indefinitely (pure offline local algorithms)  
