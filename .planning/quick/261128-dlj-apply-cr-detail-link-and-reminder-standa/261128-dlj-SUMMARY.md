---
phase: quick
plan: 261128-dlj
subsystem: ui-task-insight
tags: [task, insight, links, reminders]
dependency_graph:
  requires: []
  provides: [task-insight-link-table, task-insight-reminders]
  affects: [src/views/ItemInsightView.tsx, tests/views/ItemInsightView.test.tsx]
tech_stack:
  added: []
  patterns: [CR detail link table + modal, Popconfirm delete, QuickReminderModal target task]
key_files:
  modified:
    - src/views/ItemInsightView.tsx
    - tests/views/ItemInsightView.test.tsx
decisions:
  - "Chỉ đổi luồng cho itemType='task'; CR insight giữ chip link cũ để không phá test/CR layout"
  - "Modal link riêng (thêm/sửa) patch qua appendTaskLink/updateTask, không mở TaskDrawer/schema"
  - "Xoá link dùng Popconfirm; xoá reminder dùng updateTask({ reminders }) với filter theo id"
  - "Thêm reminder bằng QuickReminderModal target task có sẵn; sửa reminder vẫn mở TaskDrawer (form list) vì QuickReminderModal chỉ tạo mới"
metrics:
  duration: ~12min
  completed_date: 2026-11-28
---

# Quick 261128-dlj: Task insight — chuẩn hoá link và reminder

Áp lại đúng pattern đã chuẩn hoá trên CR detail cho màn hình chi tiết task (ItemInsightView).

## Thay đổi

- `src/views/ItemInsightView.tsx`:
  - Link block của task thành bảng nhỏ: header "Tên / Đường dẫn", tên ellipsis 160px, URL monospace ellipsis với `title` đầy đủ, action icon `type="text"` (xoá `danger`) sát phải. Click URL vẫn gọi `openDocumentLink` — http mở web, local mở explorer / Alt+click mở Claude Code.
  - Nút "Thêm link" căn phải header, mở modal riêng "Thêm liên kết" / "Sửa liên kết" (tên + URL); save patch qua `appendTaskLink` / `updateTask({ links })` rồi tự đóng; validate fail giữ modal mở.
  - Xoá link dùng Popconfirm, patch mảng links qua `updateTask`.
  - Section "Nhắc nhở" mới với nút "Thêm nhắc nhở" căn phải mở `QuickReminderModal` target task; mỗi reminder có icon sửa (mở TaskDrawer) và xoá (filter id qua `updateTask`).
- `tests/views/ItemInsightView.test.tsx`: 3 test link cập nhật cho luồng modal (click nút thêm → điền trong dialog → bấm "Thêm link" trong dialog); assertion tìm link theo title; bỏ assertion đóng modal do AntD leave animation không kết thúc trong jsdom.

## Verification

- `npx tsc --noEmit -p tsconfig.json` — sạch.
- `npx vitest run tests/views/ItemInsightView.test.tsx --bail=1` — 9/9 đậu.
- `git diff --check` — sạch.
- Chrome (isolated): mở task insight qua Search Everywhere — bảng link cân đối, nút thêm căn phải; "Thêm liên kết" mở modal đúng; "Sửa liên kết" mở modal điền sẵn Spec/URL; "Xóa liên kết" hiện Popconfirm; "Thêm nhắc nhở" mở QuickReminderModal đúng target task.

## Deviations from Plan

Không có.

## Known Stubs

Sửa reminder trên insight vẫn mở TaskDrawer (`RemindersFormList`) vì QuickReminderModal chỉ hỗ trợ tạo mới — giữ đúng hành vi cũ, không dựng form sửa reminder mới.

## Threat Flags

URL đi qua `isValidLinkUrl` trước khi lưu; `openDocumentLink` giữ nguyên xử lý local path và web URL.

## Self-Check: PASSED

- Commit: `7c327a05`
