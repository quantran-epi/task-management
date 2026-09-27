---
phase: "04"
status: issues_found
depth: standard
files_reviewed:
  - src/types/feasibility.ts
  - src/utils/feasibility.ts
  - tests/utils/feasibility.test.ts
  - src/components/planner/CandidateAllocationsTable.tsx
  - src/components/planner/DateInspectionBreakdown.tsx
  - src/components/planner/FeasibilityModal.tsx
  - tests/components/FeasibilityModal.test.tsx
  - src/components/tasks/TaskDrawerPlanning.tsx
  - src/views/PlannerView.tsx
  - src/views/TasksView.tsx
  - tests/views/FeasibilityIntegration.test.tsx
findings:
  critical: 2
  warning: 4
  info: 3
---

# Code Review Report — Phase 04

## Findings Summary

- **CRITICAL (BLOCKER):** 2
- **WARNING:** 4
- **INFO:** 3
- **Status:** issues_found

---

### Critical Issues (BLOCKER)

#### CR-01: Past date capacity leakage in `findEarliestFeasibleDate`
- **File:** `src/utils/feasibility.ts:63-84, 280-290`
- **Issue:** `evaluateTaskFeasibility` calls `findEarliestFeasibleDate(input.startDate, ...)`. When `startDate < today`, `findEarliestFeasibleDate` starts cursor at past date. Loop accumulates capacity on dates before `today` and returns past completion date. Future work cannot use past capacity.
- **Fix:** Start projection cursor at `dayjs.max(cursor, today)` or pass `today` to clamp start date.
```typescript
const projectionStart = dayjs(input.startDate).isBefore(dayjs(today))
  ? today
  : input.startDate;
earliestFeasibleDate = findEarliestFeasibleDate(
  projectionStart,
  remainingTaskEstimateMinutes,
  input.rules,
  input.overrides,
  getOtherLoad
);
```

#### CR-02: Feasibility check ignores `maxMinutesPerDay`, falsely reporting infeasible tasks as feasible
- **File:** `src/utils/feasibility.ts:251-278`
- **Issue:** `totalAvailableNetMinutes` accumulates `netAvailableForTask` uncapped, while each day allocation is capped at `maxAllowedForTask`. When `maxMinutesPerDay` set, `isFeasible` checks `remainingTaskEstimateMinutes <= totalAvailableNetMinutes`. If user sets 2h/day cap over 3 days (max 6h) for 10h task, `totalAvailableNetMinutes` equals 24h. Engine reports `isFeasible: true`, surplus `+14h`, but distribution only allocates 6h and leaves 4h unallocated without calculating `earliestFeasibleDate`.
- **Fix:** Base feasibility check and surplus/deficit on deliverable minutes (`maxAllowedForTask`), not raw window capacity.
```typescript
let totalAvailableNetMinutes = 0;
let totalDeliverableMinutes = 0;

while (!cursor.isAfter(end)) {
  if (dateStr >= today && inspection.capacityMinutes > 0 && inspection.netBalanceMinutes > 0) {
    const netAvailableForTask = Math.max(0, inspection.netBalanceMinutes - existingTask);
    totalAvailableNetMinutes += netAvailableForTask;

    let maxAllowedForTask = netAvailableForTask;
    if (input.maxMinutesPerDay !== undefined && input.maxMinutesPerDay > 0) {
      maxAllowedForTask = Math.min(
        netAvailableForTask,
        Math.max(0, input.maxMinutesPerDay - existingTask)
      );
    }
    totalDeliverableMinutes += maxAllowedForTask;
  }
}

const isFeasible = remainingTaskEstimateMinutes <= totalDeliverableMinutes;
const surplusMinutes = Math.max(0, totalDeliverableMinutes - remainingTaskEstimateMinutes);
const deficitMinutes = Math.max(0, remainingTaskEstimateMinutes - totalDeliverableMinutes);
```

---

### Warnings

#### WR-01: Hardcoded calendar dates in integration tests expire within days
- **File:** `tests/views/FeasibilityIntegration.test.tsx:30, 73, 79`
- **Issue:** Tests hardcode `deadline: '2026-10-05'` and `deadline: '2026-10-02'`. Once calendar reaches October 2026, deadline is in past. `FeasibilityModal` clamps range to past date, causing test assertions to fail permanently.
- **Fix:** Use dynamic offsets like `dayjs().add(5, 'day').format('YYYY-MM-DD')`.

#### WR-02: Missing `capacityOverrides` guard in `FeasibilityModal` query check
- **File:** `src/components/planner/FeasibilityModal.tsx:129`
- **Issue:** Loading guard checks `capacityRules === undefined || allAllocations === undefined`, but omits `capacityOverrides === undefined`. On initial modal open, `capacityOverrides` defaults to `[]` via fallback, risking calculation flash before overrides load from IndexedDB.
- **Fix:** Include `capacityOverrides === undefined` in early return guard.
```typescript
if (!task || capacityRules === undefined || capacityOverrides === undefined || allAllocations === undefined) return null;
```

#### WR-03: Manual minutes input allows values exceeding daily capacity, breaking DB schema validation
- **File:** `src/components/planner/CandidateAllocationsTable.tsx:71`
- **File:** `src/components/planner/FeasibilityModal.tsx:194-202`
- **Issue:** `InputNumber` typing bypasses UI `max` constraint. `onChange` saves raw value without clamping to `record.maxAvailableMinutes` or 1440m. Clicking `Apply Allocations` fails with uncaught Zod validation error (`PlannedAllocationInputSchema`), showing generic error toast.
- **Fix:** Clamp `onChange` value between 0 and `record.maxAvailableMinutes`.
```typescript
onChange={(v) => {
  const val = Math.max(0, Math.round(v ?? 0));
  onChangeMinutes(record.date, Math.min(record.maxAvailableMinutes, val));
}}
```

#### WR-04: Closed tasks selectable in `TasksView` auto-distribution modal, silent fail on empty active tasks
- **File:** `src/views/TasksView.tsx:55-69, 198-208`
- **File:** `src/views/PlannerView.tsx:66-81`
- **Issue:** In `TasksView.tsx`, task selection dropdown maps over all `tasks` including Done/Cancelled tasks. When no active tasks exist, clicking `Auto-Distribute` in both views does nothing without user feedback.
- **Fix:** Filter selection options to active tasks only. Show `message.info('No active tasks available to distribute')` when active list is empty.

---

### Info

#### IN-01: `isMobile` prop not passed to `CandidateAllocationsTable`
- **File:** `src/components/planner/FeasibilityModal.tsx:437-442`
- **Issue:** `CandidateAllocationsTable` accepts `isMobile` for 44px minimum touch targets, but `FeasibilityModal` does not detect mobile breakpoint or pass prop.
- **Fix:** Use `Grid.useBreakpoint()` in `FeasibilityModal` and pass `isMobile={!screens.md}`.

#### IN-02: Missing `aria-label` on Max Hours input
- **File:** `src/components/planner/FeasibilityModal.tsx:357-370`
- **Issue:** `InputNumber` for Max Hours lacks accessible name attribute.
- **Fix:** Add `aria-label="Max hours per day"`.

#### IN-03: `handleApply` invokes both `onSuccess` and `onCancel`
- **File:** `src/components/planner/FeasibilityModal.tsx:249-250`
- **Issue:** Successful commit calls `onSuccess?.()` then `handleClose()` which calls `onCancel()`. Callers with separate cancel cleanup trigger unwanted rollback logic.
- **Fix:** Separate close logic from cancel callback.
