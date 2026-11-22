---
phase: 54-native-overlay-complex-controls
reviewed: 2026-11-22T06:19:55Z
depth: deep
files_reviewed: 6
files_reviewed_list:
  - src/components/ui/date-picker.tsx
  - src/components/ui/table.tsx
  - src/components/ui/time-picker.tsx
  - src/components/ui/__tests__/overlayPopups.test.tsx
  - src/components/ui/__tests__/overlayComposite.test.tsx
  - src/components/ui/__tests__/timePicker.test.tsx
findings:
  critical: 0
  warning: 2
  info: 0
  total: 2
status: issues_found
---

# Phase 54: Code Review Report (R3 — final re-review)

**Reviewed:** 2026-11-22T06:19:55Z
**Depth:** deep
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Final re-review of the four R2 fixes (commits `7b22b59c`..`5ad060af`) against diff base `277d53a6`. Verified `tsc --noEmit` clean, ESLint clean on all three changed sources, and the three scoped test files at 40/40 passing. Beyond shipped tests, ran hostile probes for every requested path: Escape/outside-click with a focused column, prop-change month sync, `onChange` with new filter/sort state, gated caller retaining first end, and draft-clobber on prop sync.

All four targeted fixes work on their intended paths:
- CR-01 guard is correct: `suppressOpen` is set before both focus calls (Popup internal handler + owner `onClose`) and reset in a microtask; Escape and outside-click with a focused `TimeColumn` both dismiss.
- WR-02 `currentDataSource` is now computed from next sort/filter state via the pure `computeData` helper; filter and sort payloads are correct.
- WR-03 `commitIndex` builds from parsed drafts; the gated caller retains the first end, including across a parent re-render that recreates `[null, null]`.
- WR-01 month sync works for a genuine value change.

Found 2 warnings: one regression introduced by the WR-01 month-sync helper (month snaps back on unrelated parent re-renders for callers that recreate `dayjs` objects), and one pre-existing sort bug preserved verbatim by the `computeData` extraction (order-aware sorters are double-reversed, now also in `currentDataSource`). No critical/security issues.

## Warnings

### WR-01: WR-01 month-sync snaps calendar back on unrelated parent re-render (new regression)

**File:** `src/components/ui/date-picker.tsx:309-315`
**Issue:** The new line `if (pair[0] || pair[1]) setMonth(pair[0] ?? pair[1]!)` sits in an effect keyed on `[pair[0], pair[1], format]` — object identities. Production callers `TaskFilterBar` (3 instances) and `OverridesTable` build `value` inline as `[dayjs(str), dayjs(str)]`, producing fresh `Dayjs` objects on every parent render. Any unrelated state change in the parent (typing in a sibling filter, toggling a checkbox, another field update) re-runs the effect and forces `month` back to the value's month, discarding the user's calendar navigation while the picker is open. Probe: open range picker on a `[2026-01-05, 2026-01-07]` value, navigate to March (`calendar-month` = `2`), rerender with equivalent-but-fresh `dayjs` objects → `calendar-month` snaps back to `0` (January). The shipped WR-01 test (`overlayPopups.test.tsx:501-515`) only covers a genuine different-month value change, so it passes and misses this. Degrades navigation: users cannot reliably browse to a distant month when the parent re-renders. Not a data-loss/crash risk → warning.
**Fix:** Track the last applied value by stable string key, and move `month` only when the dates actually change, not when object identity churns:
```ts
const lastValueKey = useRef('');
useEffect(() => {
  setDraft(pair);
  setTexts([formatValue(pair[0], format), formatValue(pair[1], format)]);
  const key = `${pair[0]?.format('YYYY-MM-DD') ?? ''}|${pair[1]?.format('YYYY-MM-DD') ?? ''}`;
  if (key !== lastValueKey.current) {
    lastValueKey.current = key;
    if (pair[0] || pair[1]) setMonth(pair[0] ?? pair[1]!);
  }
}, [pair[0], pair[1], format]);
```
Add a regression test: navigate to a different month, then rerender with fresh `dayjs` objects of the same dates, assert the calendar month is unchanged.

### WR-02: `computeData` double-reverses order-aware sorters (pre-existing, now in `currentDataSource`)

**File:** `src/components/ui/table.tsx:78-79`
**Issue:** `computeData` calls `compare(a, b, sortState.order)` and then unconditionally applies `if (sortState.order === 'descend') result.reverse()`. For a sorter that already handles `sortOrder` internally — production `TaskTable.tsx:648-653` (`deadline`) returns `-1/1` based on `sortOrder === 'descend'` to place null deadlines first in descending order — the extra `reverse()` inverts that intent, pushing null deadlines to the bottom instead. Probe with rows `[null, 2026-01-01, 2026-02-01]`: descend yields `[C, B, A]`, i.e. the null is last, contradicting the sorter's `descend ? -1` branch. This logic is verbatim from the pre-refactor `sorted` memo, so the helper extraction did not introduce it, but it is now also what `emitChange` reports as `currentDataSource` (line 167), cementing the wrong order in the onChange contract. No test covers an order-aware sorter. Moderate sort-correctness issue in a live feature → warning.
**Fix:** Skip the extra reverse for sorters that declare a third `sortOrder` parameter:
```ts
if (compare) {
  if (compare.length >= 3) {
    result.sort((a, b) => compare(a, b, sortState.order));
  } else {
    result.sort((a, b) => compare(a, b, 'ascend'));
    if (sortState.order === 'descend') result.reverse();
  }
}
```
Add a regression test asserting the deadline-style order-aware sorter's descending `currentDataSource` and rendered order match its `sortOrder` branches.

---

_Reviewed: 2026-11-22T06:19:55Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
