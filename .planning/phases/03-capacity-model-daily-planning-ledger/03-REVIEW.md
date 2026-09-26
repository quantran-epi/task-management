---
phase: 03-capacity-model-daily-planning-ledger
reviewed: 2026-09-26T12:00:00Z
depth: standard
files_reviewed: 26
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
  critical: 2
  warning: 5
  info: 3
  total: 10
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-09-26T12:00:00Z
**Depth:** standard
**Files Reviewed:** 26
**Status:** issues_found

## Summary

Phase 3 implementation delivers the capacity model, weekly workload planner grid, daily allocations ledger, and settings views. Core Dexie transactions, reactive queries via `useLiveQuery`, and load metrics calculation (`utils/capacity.ts`) function properly with passing test suites.

However, adversarial review revealed two **Critical** defects:
1. Keyboard listeners in `PlannerView.tsx` intercept browser-native shortcuts (`Ctrl+P`, `Cmd+P`, `Ctrl+N`, `Cmd+N`) because modifier keys are not excluded on bare letter key checks (`e.key === 'p'` and `e.key === 'n'`).
2. Allocation date collision in `updateAllocation` (`allocationRepo.ts`) silently overwrites and destroys pre-existing planned minutes on the target date.

Additionally, 5 **Warnings** and 3 **Info** items were identified regarding note persistence, unhandled DatePicker clears, non-integer input handling, ignored date context in capacity edit triggers, and Ant Design 6 deprecation warnings.

---

## Critical Issues

### CR-01: Keyboard Shortcuts Hijack Native Browser Commands (Ctrl+P, Ctrl+N, Cmd+P, Cmd+N)

**File:** `src/views/PlannerView.tsx:62-67`
**Issue:** The keyboard shortcut handler checks `(e.altKey && e.key === 'ArrowLeft') || e.key === 'p' || e.key === 'P'`. When a user presses `Ctrl+P` (standard print command) or `Ctrl+N` (new window) or Mac equivalents (`Cmd+P`, `Cmd+N`), `e.key === 'p'` / `e.key === 'n'` evaluates to `true`. The code calls `e.preventDefault()`, cancelling browser commands and unexpectedly navigating the planner week backward or forward. (Notice line 68 correctly checks `!e.ctrlKey && !e.metaKey && !e.altKey` for `t`, but `p` and `n` omit this check).

**Fix:**
```typescript
      const isBareP = (e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.metaKey && !e.altKey;
      const isBareN = (e.key === 'n' || e.key === 'N') && !e.ctrlKey && !e.metaKey && !e.altKey;

      if ((e.altKey && e.key === 'ArrowLeft') || isBareP) {
        e.preventDefault();
        setCurrentDate(curr.subtract(1, 'week').startOf('isoWeek').format('YYYY-MM-DD'));
      } else if ((e.altKey && e.key === 'ArrowRight') || isBareN) {
        e.preventDefault();
        setCurrentDate(curr.add(1, 'week').startOf('isoWeek').format('YYYY-MM-DD'));
      }
```

---

### CR-02: Silent Data Loss on Allocation Date Rescheduling Collision

**File:** `src/db/repositories/allocationRepo.ts:105-113`
**Issue:** In `updateAllocation`, when moving an allocation to another date where an allocation already exists for the same task, it deletes the source allocation and overwrites the destination record with `validated.allocatedMinutes` (`allocatedMinutes: validated.allocatedMinutes`). Any previously planned time already on that destination date is silently erased without user notification or confirmation.

**Fix:**
Either sum the minutes up to the daily max (1440m) or reject/warn on collision rather than silently discarding existing minutes:
```typescript
      if (collision) {
        await db.plannedAllocations.delete(id);
        const combinedMinutes = Math.min(1440, collision.allocatedMinutes + validated.allocatedMinutes);
        const merged: PlannedAllocation = {
          ...collision,
          allocatedMinutes: combinedMinutes,
        };
        await db.plannedAllocations.put(merged);
        return merged;
      }
```

---

## Warnings

### WR-01: Date Override Notes Cannot Be Cleared Once Set

**File:** `src/db/repositories/capacityRepo.ts:97`
**Issue:** `setCapacityOverride` uses `...(validated.note !== undefined ? { note: validated.note } : {})` when updating an existing record. If an override already has a note (e.g. "Doctor visit") and the user later edits the override and clears the note field, `validated.note` is `undefined`, so `existing.note` is preserved. It is impossible to remove a note without deleting the entire override.

**Fix:**
Explicitly update or delete the `note` property based on user input:
```typescript
      const updated: CapacityOverride = {
        ...existing,
        workMinutes: validated.workMinutes,
      };
      if (validated.note !== undefined && validated.note.trim() !== '') {
        updated.note = validated.note.trim();
      } else {
        delete updated.note;
      }
      await targetDb.capacityOverrides.put(updated);
```

---

### WR-02: Clickable Day Capacity Tag Ignores Date Context

**File:** `src/views/PlannerView.tsx:147`
**Issue:** `DayColumnHeader` renders a clickable capacity badge with `aria-label="Edit capacity for ${date}"` and passes `date` to `onEditCapacity(date)`. However, `PlannerView.tsx` defines `onEditCapacity={() => setCapacityModalOpen(true)}`, discarding the `date` argument. The generic settings modal opens showing all 7 weekdays and the overrides table, requiring the user to manually click "+ Add Override" and re-select the date they just clicked.

**Fix:**
Pass the clicked `date` to `CapacitySettingsModal` or open the date override creation directly pre-filled with the selected date.

---

### WR-03: DatePickers Missing `allowClear={false}` Cause Stale State on Clear

**File:** `src/components/planner/TaskAllocationCard.tsx:114` and `src/components/tasks/TaskDrawerPlanning.tsx:177,336`
**Issue:** In `TaskAllocationCard` and `TaskDrawerPlanning`, DatePickers use `onChange={(d) => d && setTargetDate(d)}`. When a user clicks the DatePicker's clear icon, `d` is `null`. The `setTargetDate` handler is skipped, leaving the input visually blank while internal state silently retains the previous date. When saved, it saves with the old date.

**Fix:**
Add `allowClear={false}` to all required DatePickers in `TaskAllocationCard.tsx` and `TaskDrawerPlanning.tsx` (as done in `WeekNavigator.tsx:96`).

---

### WR-04: Unbounded Float Input Causes Zod Schema Rejection

**File:** `src/components/planner/AllocationModal.tsx:150` and `src/components/tasks/TaskDrawerPlanning.tsx:82,115`
**Issue:** `InputNumber` components for hours and minutes do not specify `precision={0}`. If a user types a fractional number (e.g. 1.2h or 15.5m), `totalMins` becomes non-integer. Because `PlannedAllocationInputSchema` validates with `z.number().int()`, Zod parsing rejects the payload and displays a generic "Failed to save allocation" error without highlighting the field.

**Fix:**
Add `precision={0}` to all hours/minutes `InputNumber` fields, and use `Math.round((values.hours ?? 0) * 60 + (values.minutes ?? 0))` before schema validation.

---

### WR-05: Ant Design 6 Deprecated Props Trigger Console Warnings

**File:** Multiple components (`TaskAllocationCard.tsx:173`, `AllocationModal.tsx:191,322`, `CapacitySettingsModal.tsx:45`, `OverridesTable.tsx:213`, `TaskDrawerPlanning.tsx:302`)
**Issue:** In Ant Design 6.6.5, several props used throughout Phase 3 are deprecated and log runtime warnings in test and development runs:
- `Card bodyStyle` -> replace with `styles={{ body: ... }}`
- `Modal destroyOnClose` -> replace with `destroyOnHidden`
- `Alert message` -> replace with `title`
- `Space direction` -> replace with `orientation`
- `Drawer width` -> replace with `size`

**Fix:**
Update props to Ant Design 6 canonical equivalents to eliminate deprecation warnings.

---

## Info

### IN-01: Unused Repository Export `getWeeklyAllocationsWithTasks`

**File:** `src/db/repositories/allocationRepo.ts:200-270`
**Issue:** `getWeeklyAllocationsWithTasks` is exported and tested, but never called in application code. `useWeeklyPlanner` queries Dexie tables directly inside `useLiveQuery` to preserve reactive update tracking.
**Fix:** Keep if reserved for export/reporting utilities, or document as internal helper.

---

### IN-02: Hardcoded Context Switching Threshold

**File:** `src/utils/capacity.ts:66` and `src/views/SettingsView.tsx`
**Issue:** Context switching warning threshold defaults to 4 tasks. Decision D-13 specified this threshold should be configurable in Settings, but `SettingsView` does not expose an input or store setting for this value.
**Fix:** Add threshold setting to `settings` Dexie store and expose input in `SettingsView`.

---

### IN-03: `TaskDrawerPlanning` Preset Sets Absolute Rather Than Incremental Time

**File:** `src/components/tasks/TaskDrawerPlanning.tsx:386-395`
**Issue:** The button labeled `+30m` in `TaskDrawerPlanning` executes `setHours(0); setMinutes(30);` (replacing the input with 30m) rather than adding 30m to the current input value, unlike `TaskDrawer` which uses `addPresetMinutes(30)`.
**Fix:** Change onClick to add 30 minutes to existing form values.

---

_Reviewed: 2026-09-26T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
