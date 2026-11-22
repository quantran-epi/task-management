---
phase: 54-native-overlay-complex-controls
reviewed: 2026-11-22T05:56:52Z
depth: deep
files_reviewed: 8
files_reviewed_list:
  - src/components/ui/date-picker.tsx
  - src/components/ui/grid.tsx
  - src/components/ui/table.tsx
  - src/components/ui/time-picker.tsx
  - src/components/ui/slider.tsx
  - src/components/ui/__tests__/fakeRenderRegression.test.tsx
  - src/components/ui/__tests__/overlayPopups.test.tsx
  - .planning/phases/54-native-overlay-complex-controls/54-REVIEW-FIX.md
findings:
  critical: 1
  warning: 3
  info: 0
  total: 4
status: issues_found
---

# Phase 54: Code Review Report (R2 — post-fix hostile probe)

**Reviewed:** 2026-11-22T05:56:52Z
**Depth:** deep
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Re-review of the 8 fix commits (`8ff4b679`..`cf59c7d8`) against diff base `6fdc5b53`. Verified `tsc --noEmit` clean, ESLint clean on all 5 changed sources, and 4 scoped test files at 48/48 passing. Beyond the shipped tests, ran 12 hostile probes against the changed regions. Confirmed all targeted fixes work on their happy paths: `Col` bare-span/offset gridColumn, `Slider` uncontrolled handle update + `onAfterChange`, `Table` single-select filter emitted once, `TimePicker` stays closed after pick, unique ids, `YEARS` per-render, `DateRangePicker` gated caller draft.

Found 4 defects the shipped tests miss. One is a functional blocker: `TimeRangePicker` popup reopens on Escape/outside-click when focus sits on a column — the WR-02 guard was applied to `TimePicker` but not its sibling. Three are warnings: partial `DateRangePicker` month sync, stale `Table` `currentDataSource`, and `TimeRangePicker` losing the first end with a gated caller (same class as the fixed CR-02, not mirrored).

## Critical Issues

### CR-01: `TimeRangePicker` popup reopens on Escape / outside-click (WR-02 guard not mirrored)

**File:** `src/components/ui/time-picker.tsx:289`
**Issue:** The WR-02 fix set `suppressOpen.current = true` only inside `pick()` (line 257) and `close()` for the single `TimePicker` (line 173). `TimeRangePicker`'s `Popup onClose` handler at line 289 calls `setRangeOpen(false); anchorRef.current?.focus();` but never sets `suppressOpen`. When the user has focused a `TimeColumn` (keyboard arrow navigation or pointer move), the `Popup` document handlers (Escape / outside pointerdown) call `onClose('escape'|'outside')`, which focuses the anchor input. That programmatic focus fires `onFocus` on the active input; since `suppressOpen` is `false`, line 274 runs `setRangeOpen(true)` — the popup immediately reopens. Result: the range popup cannot be dismissed by Escape or outside-click once a column holds focus; it stays open indefinitely. Probe confirmed both dismissal paths fail (`expected <div role="dialog"> to be null`). `TimePicker`'s equivalent probe passes because its `close()` does set the guard. This is a direct regression of the WR-02 class in the sibling component; the production callers (`WorkSessionDetailModal`, `ManualWorkSessionModal`) both use `TimeRangePicker` inside a `FormItem`, so users hit this whenever they navigate a column and press Escape.
**Fix:**
```tsx
// time-picker.tsx — TimeRangePicker Popup onClose
<Popup
  open={rangeOpen}
  anchorRef={anchorRef as React.RefObject<HTMLElement | null>}
  onClose={() => {
    suppressOpen.current = true;
    setRangeOpen(false);
    anchorRef.current?.focus();
    queueMicrotask(() => { suppressOpen.current = false; });
  }}
  ...
>
```

## Warnings

### WR-01: `DateRangePicker` calendar month not synced to external value change (partial CR-02 fix)

**File:** `src/components/ui/date-picker.tsx:306`, `src/components/ui/date-picker.tsx:309-312`
**Issue:** CR-02 added a `draft` state synced from `value` on prop change, and `setTexts` updates the displayed strings. But the `month` state (line 306) is initialized once and never updated in the sync effect (lines 309-312). When a caller changes `value` to a different month (e.g. a "today"/preset reset, or `OverridesTable`/`TaskFilterBar` re-deriving the range), the input text shows the new month while the calendar still opens on the old month. Probe: set value from `[2026-01-05, 2026-01-07]` to `[2026-03-10, 2026-03-20]`, rerender, open picker — `calendar-month` value is `0` (January) while input text reads `2026-03-10`. The displayed value and the calendar disagree; picking a cell there commits a date the user did not intend.
**Fix:**
```ts
useEffect(() => {
  setDraft(pair);
  setTexts([formatValue(pair[0], format), formatValue(pair[1], format)]);
  if (pair[0] || pair[1]) setMonth(pair[0] ?? pair[1]!);
}, [pair[0], pair[1], format]);
```

### WR-02: `Table` `onChange` `currentDataSource` reports pre-change data on filter/sort

**File:** `src/components/ui/table.tsx:154`, `src/components/ui/table.tsx:175-182`
**Issue:** The WR-01 fix made `emitChange` accept `nextFilters` so the emitted `filters` payload is correct, but the fourth argument still uses `{ currentDataSource: [...filtered], action }`. `filtered` is the `useMemo` snapshot from the current render, i.e. computed from the *old* `sortState`/`filterState`. On filter change, `onChange` fires synchronously from `setFilterValue` before React re-renders, so `currentDataSource` contains unfiltered rows. Probe: filter to `done` on a 2-row set, `extra.currentDataSource` still has both rows. Same staleness affects sort (`toggleSort` line 165) — payload reports pre-sort ordering. This violates the AntD `onChange` contract (`extra.currentDataSource` must reflect the just-applied data). No in-repo caller reads it today, so no user-visible data loss, but any consumer of that field gets wrong data.
**Fix:** Compute the next data source from the next state before emitting. Extract a pure helper and pass it into `emitChange`:
```ts
function computeFiltered(nextFilters: typeof filterState, nextSort: typeof sortState) {
  // same sort+filter logic as the sorted/filtered memos, parameterised
}
// in emitChange:
{ currentDataSource: computeFiltered(nextFilters, nextSort), action }
```

### WR-03: `TimeRangePicker` loses the first end with a gated controlled caller (CR-02 fix not mirrored)

**File:** `src/components/ui/time-picker.tsx:247-250`, `src/components/ui/time-picker.tsx:234-238`
**Issue:** `commitIndex` builds the emitted pair from `range` (the raw `value`/`defaultValue` prop), with no internal draft. A controlled caller that gates on both ends and ignores a half-built range (exactly the `FeasibilityModal` pattern the CR-02 fix addressed for `DateRangePicker`) never stores the first pick, so the second pick emits `[null, second]` instead of `[first, second]`. Probe with a gated caller: first pick → `[08:00, null]`, second pick → `[null, 14:00]`. Both current production callers wrap `TimeRangePicker` in `FormItem`, which stores the half-range in form state, so this is not user-visible today — but the component's controlled contract is broken and inconsistent with the now-correct `DateRangePicker`. The `drafts` state holds strings but is never consulted in `commitIndex`.
**Fix:** Derive the pair from parsed drafts (as `DateRangePicker` does from `draft`) rather than raw props:
```ts
function commitIndex(index: 0 | 1, next: Dayjs | null) {
  const parsed = (s: string) => (s ? dayjs(s, format, true) : null) as Dayjs | null;
  const start = index === 0 ? next : parsed(drafts[0]);
  const end = index === 1 ? next : parsed(drafts[1]);
  (onChange as ((v: [Dayjs | null, Dayjs | null] | null) => void) | undefined)?.([start, end]);
}
```
plus a `useEffect` syncing `drafts` when `value` changes (the component currently has none — see also the stale-display behavior on external `value` change).

---

_Reviewed: 2026-11-22T05:56:52Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
