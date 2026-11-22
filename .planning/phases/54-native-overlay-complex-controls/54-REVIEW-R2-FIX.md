---
phase: 54-native-overlay-complex-controls
fixed_at: 2026-11-22T06:06:54Z
review_path: .planning/phases/54-native-overlay-complex-controls/54-REVIEW-R2.md
iteration: 2
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 54: Code Review Fix Report (R2)

**Fixed at:** 2026-11-22T06:06:54Z
**Source review:** .planning/phases/54-native-overlay-complex-controls/54-REVIEW-R2.md
**Iteration:** 2

**Summary:**
- Findings in scope: 4
- Fixed: 4
- Skipped: 0

## Verification

- `tsc --noEmit`: clean
- Scoped tests: 4 files, 53/53 passing
  - `timePicker.test.tsx`, `overlayPopups.test.tsx`, `overlayComposite.test.tsx`, `fakeRenderRegression.test.tsx`
- Each regression test confirmed FAIL against pre-fix source, PASS after fix.

## Fixed Issues

### CR-01: `TimeRangePicker` popup reopens on Escape / outside-click (WR-02 guard not mirrored)

**Files modified:** `src/components/ui/time-picker.tsx`, `src/components/ui/__tests__/timePicker.test.tsx`
**Commit:** `7b22b59c`
**Applied fix:** Set `suppressOpen.current = true` before focus restore in `TimeRangePicker`'s `Popup onClose`, with a `queueMicrotask` reset — same guard as `TimePicker.close()`. Added regression tests for Escape and outside-pointerdown dismissal while a `TimeColumn` holds focus.

### WR-01: `DateRangePicker` calendar month not synced to external value change

**Files modified:** `src/components/ui/date-picker.tsx`, `src/components/ui/__tests__/overlayPopups.test.tsx`
**Commit:** `ad5fc3e4`
**Applied fix:** In the value-sync effect, move `month` to `pair[0] ?? pair[1]` when either end is present, so the opened calendar agrees with the input text. Added regression test that rerenders with a different-month range and asserts the calendar month select.

### WR-02: `Table` `onChange` `currentDataSource` reports pre-change data

**Files modified:** `src/components/ui/table.tsx`, `src/components/ui/__tests__/overlayComposite.test.tsx`
**Commit:** `6af29183`
**Applied fix:** Extracted pure `computeData(rows, columns, sort, filters)` helper shared by the render `useMemo` and `emitChange`. `emitChange` now computes `currentDataSource` from the next sort/filter state instead of the stale render snapshot. Added regression test covering filter and sort (ascend/descend) payloads.

### WR-03: `TimeRangePicker` loses the first end with a gated controlled caller

**Files modified:** `src/components/ui/time-picker.tsx`, `src/components/ui/__tests__/timePicker.test.tsx`
**Commit:** `f2e389f0`
**Applied fix:** `commitIndex` now builds the emitted pair from parsed `drafts` (not raw props), so a caller that ignores a half-built range keeps the first pick. Added a `useEffect` syncing `drafts` on external `value` change, matching `DateRangePicker`. Added regression test with a `FeasibilityModal`-style gated caller.

---

_Fixed: 2026-11-22T06:06:54Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
