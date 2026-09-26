# Phase 4: Feasibility Engine & Workload Distribution - Context

**Gathered:** 2026-09-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 4 delivers the feasibility calculation engine and workload distribution recommender for task estimates. It evaluates whether an unallocated task estimate fits within a chosen date range or deadline against base weekly capacity, date overrides, non-working days, and existing active allocations. It produces a deterministic feasible/infeasible determination with explicit surplus or deficit in hours and minutes, offers date-by-date capacity breakdown inspection, generates deterministic candidate allocation distributions favoring lowest-load days, and provides an interactive review and confirmation workflow before persisting allocations into IndexedDB.

Requirements covered: CALC-01, CALC-02, CALC-03, CALC-04, CALC-05, CALC-06.

</domain>

<decisions>
## Implementation Decisions

### Evaluation Scope & Inputs
- **D-01:** Default evaluation start date for tasks with a deadline (`dueDate` or milestone `targetDate`) starts from `today` (`YYYY-MM-DD`) through the deadline date inclusive. Past dates cannot receive new planning allocations.
- **D-02:** Calculation evaluates remaining unallocated task minutes (`Math.max(0, task.estimateMinutes - totalActiveAllocatedMinutes)`). If a task already has partial allocations, only unallocated minutes are distributed. If already fully planned, engine notifies that no further allocation is needed.
- **D-03:** Dual range evaluation mode:
  - `By Deadline`: Active by default if the task has a `dueDate` or milestone `targetDate` (evaluates `today` to `deadline`).
  - `Custom Range`: Ant Design `DatePicker.RangePicker` allowing arbitrary start and end dates (defaults to `today` through next 7 calendar days if no deadline exists).
- **D-04:** Eligible dates strictly require `effectiveCapacityMinutes > 0` AND `netBalanceMinutes > 0`. Zero-capacity days (weekends, holidays, 0h leave overrides), fully booked days (`netBalanceMinutes === 0`), overloaded days, and past calendar dates are classified as excluded/ineligible and never receive automated allocations.

### Distribution Algorithm Rules
- **D-05:** Dynamic strategy selector on UI:
  - `Balanced Spread` (Default, adheres to CALC-05): Distributes minutes iteratively to balance load percentages across eligible days, strictly prioritizing lowest current load with earlier dates breaking ties.
  - `Front-load`: Allocates up to available capacity starting from the earliest eligible days forward to complete work as soon as possible.
  - `Greedy Fill`: Completely fills lowest-load days up to their daily limit to minimize total active working days.
  - Switching strategy instantly re-computes candidate allocations reactively without saving.
- **D-06:** Daily task limit: Defaults to filling up to each date's remaining `netBalanceMinutes`, with an optional `Max hours/day` input field allowing users to cap daily task focus (e.g. max 2h or 4h per day for this specific task).
- **D-07:** Allocation step size (granularity): All candidate allocation blocks are quantized to 15-minute multiples (`15m`, `30m`, `45m`, `1h`...), matching existing `TaskDrawerPlanning` input conventions. Any remaining residual (< 15m) is consolidated into the first eligible candidate day.
- **D-08:** Existing allocation merging (D-12 compliance): If a candidate day already contains an allocation record for this same task, the engine calculates incremental minutes such that `(existing + candidate) <= dayCapacity`. Upon acceptance, allocations are merged into one unique record per `(taskId, date)` with explicit display: `Existing: Xm + Proposed: Ym = Total: Zm`.

### Infeasible Handling & Guidance
- **D-09:** Deficit & Earliest Feasible Date: When total net available capacity in the target range is less than remaining estimate, engine displays explicit shortage (`Deficit: -Xh Ym`, CALC-03) AND automatically projects forward to determine the `Earliest Feasible Date` (first date on which sufficient cumulative working capacity would accommodate the entire task).
- **D-10:** Partial Allocation option: When infeasible, the engine allows an explicit "Allocate Available Capacity (Xh Ym)" action. Candidate allocations fill up to available capacity across eligible days with an informative warning banner that `Zh Wm remains unallocated`. The engine never forces or automatically creates overloaded days.
- **D-11:** Date Inspection Breakdown (CALC-04): Visual metrics summary row (`Available days`, `Full days`, `Overloaded days`, `Excluded non-working days`) paired with a compact table/list showing date, day of week, capacity, allocated load, remaining net balance, and status badge (`Available`, `Full`, `Overloaded`, `Excluded-Holiday/Weekend`).
- **D-12:** Action Shortcuts for infeasible recovery:
  - `Extend to Earliest Feasible Date`: One-click button to update range end date to the suggested feasible date and re-run calculation instantly.
  - `Add Capacity Override`: Shortcut opening quick capacity override modal to convert non-working days or add overtime hours.
  - `Adjust Estimate`: Shortcut to update task `estimateMinutes` to fit the current window.

### Review & Confirmation UI (CALC-06)
- **D-13:** Dual entry points:
  - Prominent `✨ Check Feasibility & Auto-Distribute` button inside `TaskDrawer` Planning section for the currently viewed task.
  - Quick action button on `PlannerView` and `TasksView` toolbars opening task selection modal.
- **D-14:** Container: Dedicated `FeasibilityModal` (`width: ~720px`) housing the full evaluation lifecycle:
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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/ROADMAP.md` § Phase 4 — Goals, requirements, and success criteria for Feasibility Engine & Workload Distribution.
- `.planning/REQUIREMENTS.md` § Feasibility & Workload Distribution — Requirements CALC-01 through CALC-06.
- `CLAUDE.md` — Core technical stack (React 19, Ant Design 6, Dexie 4, Dayjs, strict TypeScript).

### Prior Context & Established Logic
- `.planning/phases/03-capacity-model-daily-planning-ledger/03-CONTEXT.md` — Weekly capacity rules, date overrides, 4-state load metrics, and D-12 unique `(taskId, date)` constraint.
- `src/utils/capacity.ts` — `getEffectiveDailyCapacity`, `calculateDayMetrics`, and `DailyLoadState` definitions.
- `src/db/repositories/allocationRepo.ts` — `upsertAllocation`, `updateAllocation`, and daily load queries excluding inactive tasks.
- `src/components/tasks/TaskDrawerPlanning.tsx` — Pre-existing single-task planning UI and live estimate comparison patterns.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/utils/capacity.ts` — Foundation for resolving effective capacity and calculating net balance per date.
- `src/utils/date.ts` — Date formatting and comparison utilities (`YYYY-MM-DD`).
- `src/utils/time.ts` — `formatMinutes` (`Xh Ym`) and input validation.
- `src/db/repositories/allocationRepo.ts` — `upsertAllocation` handles transactional check-and-update per `(taskId, date)`.
- `src/db/repositories/capacityRepo.ts` — Querying weekly rules and date overrides.
- `src/components/tasks/TaskDrawerPlanning.tsx` — Existing task allocation drawer section; will host the primary trigger button.

### Established Patterns
- All dates are canonical `YYYY-MM-DD` strings; all durations are non-negative integer minutes.
- Dexie `useLiveQuery` for reactive UI binding to IndexedDB.
- Atomic transactions for multi-record writes to avoid race conditions.
- WCAG 2.1 AA accessible color combinations, icons, and keyboard focus states.

### Integration Points
- `src/utils/feasibility.ts` — New core calculation and distribution engine module (pure functions, thoroughly unit-tested).
- `src/components/planner/FeasibilityModal.tsx` — Modal component for checking feasibility, inspecting dates, and confirming distributions.
- `src/components/tasks/TaskDrawerPlanning.tsx` — Add `✨ Feasibility & Auto-Distribute` trigger button.
- `src/views/PlannerView.tsx` & `src/views/TasksView.tsx` — Toolbar action to launch feasibility tool.

</code_context>

<specifics>
## Specific Ideas
- Dynamic strategy switcher (Balanced Spread vs Front-load vs Greedy Fill) allows user to experiment with distribution patterns before applying.
- Immediate clarity when infeasible: shows deficit in hours and suggests the exact earliest date when the task can actually be completed.
- Full user control: candidate review table allows checking/unchecking days and adjusting minutes before any database write occurs.

</specifics>

<deferred>
## Deferred Ideas
- Long-range dashboard views (7-day, 14-day, next-month forecast) and overload warnings summary (Phase 5: DASH-01 to DASH-06).
- Multi-task batch auto-scheduling across an entire milestone (v2 backlog).
- Auto-rebalancing existing allocations when high-priority urgent work arrives (v2 backlog).

</deferred>

---

*Phase: 04-Feasibility Engine & Workload Distribution*
*Context gathered: 2026-09-27*
