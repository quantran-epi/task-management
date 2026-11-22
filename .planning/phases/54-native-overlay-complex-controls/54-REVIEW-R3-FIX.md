---
phase: 54-native-overlay-complex-controls
fixed_at: 2026-11-22T06:25:03Z
review_path: .planning/phases/54-native-overlay-complex-controls/54-REVIEW-R3.md
iteration: 3
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 54: Code Review Fix Report (R3)

**Fixed at:** 2026-11-22T06:25:03Z
**Source review:** .planning/phases/54-native-overlay-complex-controls/54-REVIEW-R3.md
**Iteration:** 3

**Summary:**
- Findings in scope: 2
- Fixed: 2
- Skipped: 0

## Fixed Issues

### WR-01: WR-01 month-sync snaps calendar back on unrelated parent re-render (new regression)

**Files modified:** `src/components/ui/date-picker.tsx`, `src/components/ui/__tests__/overlayPopups.test.tsx`
**Commit:** `a2e41a8e`
**Applied fix:** Track last applied range by stable `YYYY-MM-DD|YYYY-MM-DD` string key in a ref; only move the calendar month when the key actually changes, so fresh `Dayjs` object identities from parent rerenders no longer discard user month navigation. Added regression test that navigates to March then rerenders with equivalent fresh objects and asserts the month stays.

### WR-02: `computeData` double-reverses order-aware sorters (pre-existing, now in `currentDataSource`)

**Files modified:** `src/components/ui/table.tsx`, `src/components/ui/__tests__/overlayComposite.test.tsx`
**Commit:** `dfce88db`
**Applied fix:** In `computeData`, when sorter declares a third `sortOrder` parameter (`compare.length >= 3`), call it with the real order and skip the extra `reverse()`; legacy 2-arg sorters keep the original ascend-then-reverse behavior. Added regression test with a deadline-style order-aware sorter asserting both `currentDataSource` and rendered order honor the `sortOrder` branches.

---

_Fixed: 2026-11-22T06:25:03Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 3_
