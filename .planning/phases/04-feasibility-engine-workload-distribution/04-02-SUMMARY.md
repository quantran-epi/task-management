---
phase: 04-feasibility-engine-workload-distribution
plan: 02
subsystem: feasibility-engine-ui
tags: [feasibility, capacity, workload-distribution, review-ui, modal, vitest]
requires:
  - phase: 04-feasibility-engine-workload-distribution
    plan: "01"
    provides: evaluateTaskFeasibility, candidate allocations, date inspection
provides:
  - CandidateAllocationsTable
  - DateInspectionBreakdown
  - FeasibilityModal
affects:
  - src/components/tasks/TaskDrawerPlanning.tsx
  - src/views/PlannerView.tsx
  - src/views/TasksView.tsx
tech-stack:
  added: []
  patterns:
    - Pure in-memory draft state with zero IndexedDB side-effects until apply (CALC-06, T-04-03)
    - Accessible focus management with createFocusRestorer on open/close
    - Atomic multi-day allocation upsert using Dexie read-write transaction
    - Reactive queries using Dexie useLiveQuery hook
key-files:
  created:
    - src/components/planner/CandidateAllocationsTable.tsx
    - src/components/planner/DateInspectionBreakdown.tsx
    - src/components/planner/FeasibilityModal.tsx
    - tests/components/FeasibilityModal.test.tsx
  modified:
    - src/types/feasibility.ts
decisions:
  - "Preserved candidates in local component state overrides without mutating IndexedDB during inline minute adjustments or checkbox toggling (T-04-03, CALC-06)"
  - "Integrated action shortcuts Extend to Earliest Feasible Date and Allocate Available Capacity directly into warning alert banner (D-10, D-12)"
  - "Implemented atomic multi-record commit inside Dexie transaction calling upsertAllocation for each selected candidate with merged existing minutes (D-08, D-16)"
metrics:
  duration: 18m
  completed_date: "2026-09-27"
  tasks: 2
  files: 5
---

# Phase 4 Plan 2: Interactive Feasibility & Workload Distribution Modal Summary

Interactive review modal dialog and supporting subcomponents for evaluating task estimates against available capacity, adjusting proposed allocations in memory, and committing merged allocations atomically into IndexedDB.

## Implementation Details

### 1. Interactive Review Subcomponents (`src/components/planner/CandidateAllocationsTable.tsx`, `src/components/planner/DateInspectionBreakdown.tsx`)
- `CandidateAllocationsTable`:
  - Columns: Include Checkbox, Date string (`YYYY-MM-DD (ddd)`), Existing Allocation (`formatMinutes` or `-`), Proposed Allocation (`InputNumber` with 15m step, min 0, max available, suffix `m`), and Resulting Total.
  - Live summary footer displaying `Total Proposed` vs `Task Remaining Estimate` with warning highlight when under-allocated.
  - Ant Design `Empty` state with exact copywriting: `No Eligible Dates Found` when all days in range are non-working, full, or in the past.
- `DateInspectionBreakdown`:
  - Ant Design `Collapse` panel titled `Inspect Date Details ({N} days evaluated)`.
  - Summary metric pills: `{N} Available` (success), `{N} Full` (default), `{N} Overloaded` (error), `{N} Excluded` (warning).
  - Compact table displaying Date, Capacity, Active Load, Net Balance, and status `Tag` badges.

### 2. Main Feasibility Modal Dialog (`src/components/planner/FeasibilityModal.tsx`)
- Container: 720px responsive modal, `destroyOnClose`, focus restoration on open/close with `createFocusRestorer`.
- Scope & Parameters bar:
  - Mode toggle: `By Deadline` (using task deadline) vs `Custom Range` (defaults to 7-day window).
  - Strategy selector: `Segmented` control (`Balanced Spread`, `Front-load`, `Greedy Fill`).
  - Max hours/day: Optional `InputNumber` cap.
- Feasibility Result Banner (CALC-03):
  - Green `Alert` on feasible with surplus capacity in hours and minutes.
  - Warning `Alert` on infeasible with deficit metric, earliest feasible completion date, and shortcut action buttons: `Extend to {date}` and `Allocate Available ({hours}h {minutes}m)`.
- Preview-Only Safety (CALC-06, T-04-03):
  - In-memory candidate overrides manage checkboxes and minute edits without writing to IndexedDB.
  - `Discard Allocations` closes modal cleanly without persistence.
  - `Apply Allocations` executes atomic Dexie transaction merging allocations and displays Ant Design success feedback.

## Test Coverage

5 tests passing in `tests/components/FeasibilityModal.test.tsx`:
- Rendering modal with parameters, result alert, and candidate table.
- CALC-03: Green alert on feasible range with surplus capacity.
- CALC-03 / D-12: Warning alert on infeasible range with deficit, earliest feasible date, and extending shortcut.
- CALC-06 / T-04-03: Modifying candidate minutes and toggles does not mutate database before apply.
- CALC-06 / D-08 / D-16: Applying commits merged allocations to IndexedDB atomically.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript exactOptionalPropertyTypes compatibility in FeasibilityEvaluationInput**
- **Found during:** Task 2 verification
- **Issue:** `maxMinutesPerDay?: number | undefined` and `today?: string | undefined` caused TS2379 compilation errors under `exactOptionalPropertyTypes: true` when passing `undefined`.
- **Fix:** Explicitly added `| undefined` union to optional properties in `src/types/feasibility.ts`.
- **Files modified:** `src/types/feasibility.ts`
- **Commit:** `4700544`

**2. [Rule 1 - Bug] Task model property name alignment**
- **Found during:** Task 2 test suite execution
- **Issue:** Test used `dueDate` property on task fixture, but domain model uses `deadline`.
- **Fix:** Updated modal parameter initialization to check `task?.deadline` and updated test fixtures.
- **Files modified:** `src/components/planner/FeasibilityModal.tsx`, `tests/components/FeasibilityModal.test.tsx`
- **Commit:** `4700544`

## Threat Flags

None. All persistence crosses through explicit atomic Dexie transaction upon user confirmation, input minutes are clamped and validated.

## Self-Check: PASSED

- FOUND: `src/components/planner/CandidateAllocationsTable.tsx`
- FOUND: `src/components/planner/DateInspectionBreakdown.tsx`
- FOUND: `src/components/planner/FeasibilityModal.tsx`
- FOUND: `tests/components/FeasibilityModal.test.tsx`
- FOUND: `0c16c20` (feat(04-02): build CandidateAllocationsTable and DateInspectionBreakdown components)
- FOUND: `f568d07` (test(04-02): add failing test for FeasibilityModal component)
- FOUND: `4700544` (feat(04-02): implement FeasibilityModal with parameter controls and atomic commit)
