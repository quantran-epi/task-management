---
phase: 54-native-overlay-complex-controls
fixed_at: 2026-11-22T12:46:30Z
review_path: .planning/phases/54-native-overlay-complex-controls/54-REVIEW.md
iteration: 1
findings_in_scope: 8
fixed: 8
skipped: 0
status: all_fixed
---

# Phase 54: Code Review Fix Report

**Fixed at:** 2026-11-22T12:46:30Z
**Source review:** .planning/phases/54-native-overlay-complex-controls/54-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 8 (6 critical/warning + 2 info, user requested IN-01/IN-02)
- Fixed: 8
- Skipped: 0

## Fixed Issues

### CR-01: `Col` sinh `gridColumn: "0 / span N"` — CSS không hợp lệ

**Files modified:** `src/components/ui/grid.tsx`, `src/components/ui/__tests__/fakeRenderRegression.test.tsx`
**Commit:** `8ff4b679`, `ca4dd915`
**Applied fix:** Dùng CSS grid line 1-based: `offset N` → line `N+1`, không có offset → `span N`. Cast `Number(activeOffset)` vì AntD `offset` là `number | string` (tsc). Test cập nhật kỳ vọng `3 / span 12` cho `offset={2}` và thêm assert `<Col span={8}>` → `span 8`.
**Verification:** `tsc --noEmit` exit 0; `fakeRenderRegression.test.tsx` 13 passed.
**Status:** fixed: requires human verification (logic offset 1-based)

### CR-02: `DateRangePicker` mất ngày đầu ở caller controlled

**Files modified:** `src/components/ui/date-picker.tsx`
**Commit:** `543c665d`
**Applied fix:** Giữ draft pair nội bộ sync từ prop theo `[pair[0], pair[1], format]`; `commit`, `clear`,文本 và Calendar dùng draft thay vì prop thuần. Range 2 bước hình thành dù caller gate trên cả 2 đầu.
**Verification:** `overlayPopups.test.tsx` 21 passed (kể cả test CR-02/WR-04).
**Status:** fixed: requires human verification (state handling controlled/draft)

### WR-01: Bộ lọc `Table` cộng dồn giá trị khi đổi `<select>`

**Files modified:** `src/components/ui/table.tsx`, `src/components/ui/__tests__/overlayComposite.test.tsx`
**Commit:** `8719be34`
**Applied fix:** Thay 2 lần `toggleFilter` stale-closure bằng `setFilterValue` thiết lập đúng 1 giá trị/cột; `emitChange` nhận `nextFilters` override để emit payload đúng một lần.
**Verification:** `overlayComposite.test.tsx` 12 passed.
**Status:** fixed: requires human verification (state handling single-select)

### WR-02: `TimePicker` mở lại popup sau khi pick

**Files modified:** `src/components/ui/time-picker.tsx`, `src/components/ui/__tests__/timePicker.test.tsx`
**Commit:** `5b6742fd`
**Applied fix:** `suppressOpen` ref chặn `onFocus` trong lần focus restore sau `close()`/`pick()`, xóa bằng `queueMicrotask`. Áp dụng cả `TimePicker` và `TimeRangePicker`.
**Verification:** `timePicker.test.tsx` pass.
**Status:** fixed: requires human verification (focus state handling)

### WR-03: `Slider` uncontrolled không cập nhật handle sau commit

**Files modified:** `src/components/ui/slider.tsx`, `src/components/ui/__tests__/fakeRenderRegression.test.tsx`
**Commit:** `0c82d618`
**Applied fix:** `useReducer` force re-render khi `controlled === undefined`; `commit` gọi `forceRender()` sau khi ghi `uncontrolledRef`. Thêm `forceRender` vào deps.
**Verification:** `fakeRenderRegression.test.tsx` 13 passed (assert `aria-valuenow = 11`, `left` chứa `11%`).
**Status:** fixed: requires human verification (uncontrolled state contract)

### WR-04: Test range DatePicker chỉ certificate shape

**Files modified:** `src/components/ui/__tests__/overlayPopups.test.tsx`
**Commit:** `2ef513c6`
**Applied fix:** Thêm test caller gate giống `FeasibilityModal`: render `value=null`, pick ngày đầu rồi ngày cuối, assert `onChange` cuối nhận 2 Dayjs đủ đầu + strings tương ứng. Test đỏ trước CR-02.
**Verification:** `overlayPopups.test.tsx` 21 passed.
**Status:** fixed

### IN-01: `TimeColumn` dùng id cố định toàn cục

**Files modified:** `src/components/ui/time-picker.tsx`, `src/components/ui/__tests__/timePicker.test.tsx`
**Commit:** `0772944b`
**Applied fix:** `useId()` sanitize (bỏ `:` để querySelector `#id` hợp lệ) làm prefix cho `tp-*`/`tr-*`, mỗi instance id riêng. Test 2 picker cùng trang: 288 option id, `Set.size === 288`.
**Verification:** `timePicker.test.tsx` 2 passed.
**Status:** fixed

### IN-02: `WEEKDAYS`/`YEARS` đóng băng theo import time

**Files modified:** `src/components/ui/date-picker.tsx`
**Commit:** `9a3dc62c`
**Applied fix:** Bỏ `CURRENT_YEAR`/`YEARS` module-level; tính `YEARS` trong `Calendar` qua `useMemo` từ `today.year()` của render hiện tại.
**Verification:** `tsc --noEmit` exit 0; `overlayPopups.test.tsx` 21 passed.
**Status:** fixed

## Verification Summary

- `npx tsc --noEmit`: exit 0 (clean)
- Scoped Vitest (không chạy full suite theo yêu cầu): 4 files, 48 tests passed
  - `fakeRenderRegression.test.tsx` — 13
  - `overlayPopups.test.tsx` — 21
  - `overlayComposite.test.tsx` — 12
  - `timePicker.test.tsx` — 2
- Working tree sạch sau khi commit; không file nào rollback.

---

_Fixed: 2026-11-22T12:46:30Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
