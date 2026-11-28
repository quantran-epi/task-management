---
phase: quick
plan: 261128-cpo
subsystem: ui-cr-detail
tags: [changerequest, reminder, search-input, antd]
dependency_graph:
  requires: []
  provides: [cr-detail-quick-reminder, cr-detail-standard-search]
  affects: [src/views/ChangeRequestDetailView.tsx]
tech_stack:
  added: []
  patterns: [QuickReminderModal target=cr reuse, SearchInput prefix search]
key_files:
  created:
    - src/views/__tests__/ChangeRequestDetailView.reminderAndSearch.test.tsx
  modified:
    - src/views/ChangeRequestDetailView.tsx
    - .planning/STATE.md
decisions:
  - "QuickReminderModal target CR mount trực tiếp từ CR detail; không sửa modal, repository hay logic append reminders"
  - "Ô lọc task đổi InputSearch -> SearchInput, giữ nguyên data-testid và logic filteredTasks/status filter"
metrics:
  duration: ~7min
  completed_date: 2026-11-28
---

# Quick 261128-cpo: CR detail — nút reminder nhanh và ô search chuẩn

Section 'Nhắc nhở' trên tab chi tiết CR giờ có nút 'Thêm nhắc nhở' mở QuickReminderModal với target CR; ô lọc task dùng SearchInput chuẩn TaskMate, icon kính lúp nằm trong input.

## Thay đổi

- `src/views/ChangeRequestDetailView.tsx`: đổi import `InputSearch` -> `SearchInput`; thêm state `crReminderModalOpen`; bọc body block reminders bằng flex column với nút `cr-detail-reminder-add` (icon `PlusOutlined`); mount `QuickReminderModal` với `target={{ type: 'cr', entity: cr }}`; ô search đổi sang `SearchInput`, giữ placeholder/testid/value/onChange/style. Ba nhánh render reminder cũ và mọi block khác giữ nguyên.
- `src/views/__tests__/ChangeRequestDetailView.reminderAndSearch.test.tsx`: 2 test scoped — cấu trúc search input (không `.ant-input-search-button`, có prefix `.ant-input-prefix .anticon-search`) và luồng thêm reminder (click nút -> modal -> 'Lưu nhắc nhở' -> DB CR có 1 reminder với date `YYYY-MM-DD`, modal tự đóng).
- `.planning/STATE.md`: 1 dòng activity + 1 dòng decision mới; không sửa entry khác.

## Verification

- `npx tsc --noEmit -p tsconfig.json` — sạch.
- `npx vitest run src/views/__tests__/ChangeRequestDetailView.reminderAndSearch.test.tsx src/views/__tests__/ChangeRequestDetailView.subsystemOptions.test.tsx --bail=1` — 2 files / 4 tests đậu.
- `git diff --check` — sạch.
- Không chạy full vitest suite (quy tắc dự án).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Assertion prefix search lệch DOM AntD**
- **Found during:** Task 2
- **Issue:** `data-testid` của `SearchInput` nằm trên `<input>` bên trong; prefix `.ant-input-prefix .anticon-search` là sibling trong `.ant-input-affix-wrapper`, không phải con của input. Assertion ban đầu fail `expected null not to be null`.
- **Fix:** Test lấy `search.closest('.ant-input-affix-wrapper')` rồi query prefix trên wrapper; vẫn giữ nguyên ý định kiểm tra icon nằm trong input, không có nút search tách rời.
- **Files modified:** `src/views/__tests__/ChangeRequestDetailView.reminderAndSearch.test.tsx`
- **Commit:** `bf737582`

## Known Stubs

None.

## Threat Flags

None — chỉ dùng lại `QuickReminderModal` và `SearchInput` có sẵn; không thêm network endpoint, auth path hay schema mới.

## Self-Check: PASSED

- Files exist: `src/views/ChangeRequestDetailView.tsx`, `src/views/__tests__/ChangeRequestDetailView.reminderAndSearch.test.tsx`
- Commits exist: `9a84ca54`, `bf737582`
