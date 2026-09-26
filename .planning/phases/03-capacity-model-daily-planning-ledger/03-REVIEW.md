---
phase: 03-capacity-model-daily-planning-ledger
reviewed: 2026-09-27T00:15:00Z
depth: standard
files_reviewed: 27
files_reviewed_list:
  - src/App.tsx
  - src/components/planner/AllocationModal.tsx
  - src/components/planner/CapacitySettingsModal.tsx
  - src/components/planner/DayColumn.tsx
  - src/components/planner/DayColumnHeader.tsx
  - src/components/planner/TaskAllocationCard.tsx
  - src/components/planner/WeekNavigator.tsx
  - src/components/settings/OverridesTable.tsx
  - src/components/settings/WeeklyCapacityForm.tsx
  - src/components/tasks/TaskDrawer.tsx
  - src/components/tasks/TaskDrawerPlanning.tsx
  - src/db/repositories/allocationRepo.ts
  - src/db/repositories/capacityRepo.ts
  - src/hooks/useWeeklyPlanner.ts
  - src/utils/capacity.ts
  - src/validation/schemas.ts
  - src/views/PlannerView.tsx
  - src/views/SettingsView.tsx
  - tests/components/AllocationModal.test.tsx
  - tests/components/CapacitySettings.test.tsx
  - tests/components/DayColumnHeader.test.tsx
  - tests/components/TaskDrawerPlanning.test.tsx
  - tests/db/allocationRepo.test.ts
  - tests/db/capacityRepo.test.ts
  - tests/shell.test.tsx
  - tests/utils/capacity.test.ts
  - tests/views/PlannerView.test.tsx
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-09-27T00:15:00Z  
**Depth:** standard  
**Files Reviewed:** 27  
**Status:** issues_found

## Summary

Reviewed all Phase 03 source files, repositories, schemas, hooks, views, and test suites, with emphasis on recent gap closure (Plan 03-04) changes in `src/views/PlannerView.tsx`, `src/components/planner/DayColumn.tsx`, `src/components/planner/DayColumnHeader.tsx`, and `src/components/planner/TaskAllocationCard.tsx`.

The responsive layout fixes in `DayColumnHeader` (flex-wrapping date/tag elements, `gap: '4px 6px'`), `DayColumn` (column padding adjusted to 6px, minimum width 180px), and `TaskAllocationCard` (full-width task name with 2-line WebkitLineClamp, wrap-enabled bottom meta/actions row) resolve UI clipping in narrow desktop column views. All unit and integration test suites pass.

Zero critical blockers were detected. Three warnings regarding edge cases in keyboard shortcut filtering, stale estimate comparison in modals, and unauthenticated error boundary handling in live queries were identified.

## Warnings

### WR-01: Incomplete Form Element Exclusion in Keyboard Shortcut Listener

**File:** `src/views/PlannerView.tsx:46-56`  
**Issue:** The shortcut listener checks for `<input>`, `<textarea>`, `isContentEditable`, and `role="textbox"`. However, native HTML `<select>` elements and Ant Design dropdowns (which may render without `role="textbox"` while interacting) are not excluded. Pressing `P`, `N`, or `T` while focusing a `<select>` or custom widget outside text inputs can inadvertently navigate weeks while typing.  
**Fix:** Add `target.tagName === 'SELECT'` and check for common ARIA roles (`combobox`, `listbox`, `menuitem`):

```tsx
const isInput =
  target &&
  (target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    Boolean(target.isContentEditable) ||
    target.getAttribute?.('contenteditable') === 'true' ||
    target.getAttribute?.('contenteditable') === '' ||
    Boolean(target.closest?.('[contenteditable="true"], [contenteditable=""]')) ||
    target.getAttribute?.('role') === 'textbox' ||
    target.getAttribute?.('role') === 'combobox');
```

### WR-02: Race Condition in `AllocationModal` Task Allocation Loading

**File:** `src/components/planner/AllocationModal.tsx:94-122`  
**Issue:** In `useEffect`, `loadTaskAllocations()` fetches previous allocations asynchronously when `selectedTaskId` or `selectedDate` changes. If the user rapidly switches tasks in the `Select` dropdown, requests can resolve out of order. While `isMounted` guards unmounting, it does not guard against an older request finishing after a newer one, causing `existingTotalMinutes` and `existingDateMinutes` to display stale values for the currently selected task.  
**Fix:** Track current active query or check against the active `selectedTaskId`:

```tsx
let activeTaskId = selectedTaskId;
let isMounted = true;
async function loadTaskAllocations() {
  try {
    const allocations = await getAllocationsForTask(selectedTaskId, db);
    if (!isMounted || activeTaskId !== selectedTaskId) return;

    const total = allocations.reduce((sum, a) => sum + a.allocatedMinutes, 0);
    setExistingTotalMinutes(total);

    const dateStr = selectedDate ? selectedDate.format('YYYY-MM-DD') : '';
    const onDate = allocations.find((a) => a.date === dateStr);
    setExistingDateMinutes(onDate ? onDate.allocatedMinutes : 0);
  } catch {
    // Silently handle if db unready
  }
}
```

### WR-03: Missing Fallback Cleanup on Allocation Deletion in Repository

**File:** `src/db/repositories/allocationRepo.ts:129-134`  
**Issue:** `deleteAllocation` executes `await db.plannedAllocations.delete(id)` without validating if `id` exists or wrapping in transaction if cascaded operations are ever required. While Dexie's `delete` is idempotent, silently returning on non-existent IDs can mask UI synchronization drift when optimistic updates occur.  
**Fix:** Verify existence or return boolean indicating whether deletion removed an existing record.

```typescript
export async function deleteAllocation(
  id: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<boolean> {
  const existing = await db.plannedAllocations.get(id);
  if (!existing) return false;
  await db.plannedAllocations.delete(id);
  return true;
}
```

## Info

### IN-01: Hardcoded Context Switch Threshold Magic Number

**File:** `src/utils/capacity.ts:66`  
**Issue:** `calculateDayMetrics` defines a default `contextSwitchThreshold = 4`. It would be cleaner to extract this constant as `DEFAULT_CONTEXT_SWITCH_THRESHOLD` so it can be re-used across documentation and settings.  
**Fix:** Declare `export const DEFAULT_CONTEXT_SWITCH_THRESHOLD = 4;` in `capacity.ts`.

### IN-02: Card Padding Override Deprecated Property in Ant Design 6

**File:** `src/components/planner/TaskAllocationCard.tsx:173`  
**Issue:** `<Card bodyStyle={{ padding: '8px 10px' }} ...>` uses `bodyStyle`, which is deprecated in modern Ant Design versions in favor of `styles={{ body: { padding: '8px 10px' } }}`.  
**Fix:** Replace `bodyStyle={{ padding: '8px 10px' }}` with `styles={{ body: { padding: '8px 10px' } }}`.

### IN-03: Redundant Nullish Coalescing in `WeekNavigator`

**File:** `src/components/planner/WeekNavigator.tsx:26-28`  
**Issue:** `dayjs(currentDate, 'YYYY-MM-DD').isValid()` returns boolean. Parsing twice in succession can be simplified:

```typescript
const parsed = dayjs(currentDate, 'YYYY-MM-DD');
const current = parsed.isValid() ? parsed : dayjs();
```

---

_Reviewed: 2026-09-27T00:15:00Z_  
_Reviewer: Claude (gsd-code-reviewer)_  
_Depth: standard_
