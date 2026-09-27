---
phase: 04-feasibility-engine-workload-distribution
plan: 01
subsystem: feasibility-engine
tags: [feasibility, capacity, workload-distribution, pure-algorithm, vitest]
requires:
  - phase: 03-capacity-model-daily-planning-ledger
    provides: getEffectiveDailyCapacity, weekly rules, date overrides
provides:
  - inspectDateCapacity
  - findEarliestFeasibleDate
  - distributeBalancedSpread
  - distributeFrontLoad
  - distributeGreedyFill
  - evaluateTaskFeasibility
affects:
  - src/components/planner/FeasibilityModal.tsx
  - src/components/tasks/TaskDrawerPlanning.tsx
tech-stack:
  added: []
  patterns:
    - Pure functional calculation without side effects
    - Bounded forward date projection with 365-day cap (T-04-01)
    - 15-minute quantum load-balancing with residual consolidation (D-07)
    - Deterministic tie-breaking using earlier calendar date (CALC-05)
key-files:
  created:
    - src/types/feasibility.ts
    - src/utils/feasibility.ts
    - tests/utils/feasibility.test.ts
  modified: []
decisions:
  - "Hard-capped forward projection search in findEarliestFeasibleDate at 365 days max to prevent DoS loops (T-04-01)"
  - "Clamped remaining unallocated minutes and validated non-negative numbers to guard against numeric tampering (T-04-02)"
  - "Consolidated non-quantum residual (< 15m) into first eligible day with available room per D-07"
  - "Broken load ratio ties in distributeBalancedSpread and distributeGreedyFill deterministically using earlier calendar date string comparison"
metrics:
  duration: 12m
  completed_date: "2026-09-27"
  tasks: 3
  files: 3
---

# Phase 4 Plan 1: Feasibility Engine & Workload Distribution Core Summary

Pure TypeScript algorithmic engine for task estimate feasibility inspection, deficit projection, and 15-minute quantized workload distribution across available capacity windows.

## Implementation Details

### 1. Feasibility Types & Date Inspection (`src/types/feasibility.ts`, `src/utils/feasibility.ts`)
- Defined TypeScript contracts: `DistributionStrategy`, `DateInspectionStatus`, `CandidateAllocation`, `DateInspectionItem`, `FeasibilityEvaluationInput`, `FeasibilityResult`.
- Implemented `inspectDateCapacity`: classifies date into 5 discrete states (`available`, `full`, `overloaded`, `excluded-past`, `excluded-non-working`).
- Accounts for base weekly capacity rules, date overrides, and active load from other tasks without double-counting evaluated task allocations.

### 2. Deficit Metrics & Earliest Feasible Date Projection (`src/utils/feasibility.ts`)
- Implemented `findEarliestFeasibleDate`: bounds forward search loop to 365 calendar days max (mitigating T-04-01 DoS threat).
- Computes exact surplus and deficit minutes against net available working capacity in evaluated range.

### 3. Workload Distribution Strategies (`src/utils/feasibility.ts`)
- Implemented `distributeBalancedSpread`: iterative 15-minute quanta allocation favoring days with lowest load ratio `(activeLoad + proposed) / capacity`, breaking ties deterministically with earlier calendar dates.
- Implemented `distributeFrontLoad`: fills available capacity sequentially from earliest eligible date forward.
- Implemented `distributeGreedyFill`: fills lowest-load days completely to minimize active working days.
- Implemented master `evaluateTaskFeasibility`: orchestrates date breakdown, feasibility check, forward projection, and candidate allocation assembly with existing allocation merging.

## Test Coverage

19 unit tests passing across all three tasks in `tests/utils/feasibility.test.ts`:
- Date inspection classifications (past, non-working, available, full, overloaded)
- Earliest feasible date forward projection and 365-day cutoff
- Balanced spread load balancing and tie-breaking
- Remainder (< 15m) consolidation into first eligible candidate day
- Front-load and greedy fill distribution patterns
- Master feasibility evaluation, surplus/deficit calculation, maxMinutesPerDay daily cap, and 100% planned task handling

## Deviations from Plan

None - plan executed exactly as written.

## Threat Flags

None. Pure calculation utility module operating in memory without network or persistence calls.

## Self-Check: PASSED

- FOUND: `src/types/feasibility.ts`
- FOUND: `src/utils/feasibility.ts`
- FOUND: `tests/utils/feasibility.test.ts`
- FOUND: `d9ed04b` (test: add failing test for inspectDateCapacity)
- FOUND: `869f64d` (feat: implement inspectDateCapacity and feasibility types)
- FOUND: `627bbb8` (test: add failing test for findEarliestFeasibleDate)
- FOUND: `d0f65d6` (feat: implement findEarliestFeasibleDate forward projection)
- FOUND: `e9f04d5` (test: add failing test for distribution strategies and evaluateTaskFeasibility)
- FOUND: `f104662` (feat: implement distribution strategies and evaluateTaskFeasibility)
