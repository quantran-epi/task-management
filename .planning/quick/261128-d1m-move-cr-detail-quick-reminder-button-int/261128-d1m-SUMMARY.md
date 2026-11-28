---
phase: quick
plan: 261128-d1m
subsystem: ui-cr-detail
tags: [changerequest, reminder, links, inline-actions]
dependency_graph:
  requires: []
  provides: [cr-detail-balanced-block-actions, cr-detail-link-reminder-inline-crud]
  affects: [src/views/ChangeRequestDetailView.tsx]
tech_stack:
  added: []
  patterns: [native inline-flex actions, confirm before delete, reuse ChangeRequestModal for edit]
key_files:
  modified:
    - src/views/ChangeRequestDetailView.tsx
decisions:
  - "Nút 'Thêm nhắc nhở' đặt trong header block, ngay sau badge count; không dùng space-between để tránh đẩy nút ra mép phải"
  - "Sửa link/reminder mở ChangeRequestModal có sẵn (không dựng inline form riêng)"
  - "Xoá link/reminder dùng modal.confirm rồi patch mảng qua updateChangeRequest (Zod validate), giữ reminder/link còn lại"
  - "Dùng inline-flex div thay vì Space.Compact vì UI wrapper của dự án không export Compact"
metrics:
  duration: ~10min
  completed_date: 2026-11-28
---

# Quick 261128-d1m: CR detail — bố trí nút và sửa/xoá link, reminder

Sếp yêu cầu bố trí nút "Thêm nhắc nhở" đẹp hơn và hỏi tại sao section Links/Nhắc nhở chỉ có tạo mới. Kết quả: nút nằm gọn cạnh tiêu đề block, mỗi link và reminder có nút sửa (mở modal Sửa CR) và xoá (confirm rồi patch qua repository).

## Thay đổi

- `src/views/ChangeRequestDetailView.tsx`:
  - Header các secondary block dùng flex + gap, render action ngay sau badge thay vì `space-between` (tránh nút bị đẩy ra mép phải).
  - Nút "Thêm nhắc nhở" (testid `cr-detail-reminder-add`) nằm trong header block "Nhắc nhở".
  - Mỗi reminder có nút "Sửa nhắc nhở" (mở `ChangeRequestModal`) và "Xóa nhắc nhở" (confirm → `updateChangeRequest({ reminders: filtered })`).
  - Mỗi link có nút "Sửa liên kết" (mở `ChangeRequestModal`) và "Xóa liên kết" (confirm → `updateChangeRequest({ links: filtered })`).
  - Dùng `div` inline-flex thay vì `Space.Compact` (UI wrapper dự án không có Compact).
  - Theo chuẩn TaskMate (đối chiểu code): header action = default small `Button` + `PlusOutlined` như nút "Thêm tác vụ" cùng trang; row action = `Button type="text" size="small"`, xoá thêm `danger`, bọc `Tooltip`.
  - Nút "Thêm link" lên header, bấm mở Modal nhỏ (tên + URL), save xong tự đóng; validate fail giữ modal mở.
  - Hai nút thêm căn sát phải section qua `justify-content: space-between`; link hiển thị dạng chữ link (`Button type="link"` không viền).
- Không sửa repository, modal, schema hay dependency.

## Verification

- Bổ sung design chuẩn (`f8780806`, `18720c19`): tsc/test sạch; Chrome verify — nút Thêm link/Thêm nhắc nhở căn phải, click Thêm link mở modal, nhập URL → lưu → modal tự đóng + link mới vào DB; link hiển thị dạng chữ link.
- `npx tsc --noEmit -p tsconfig.json` — sạch.
- `npx vitest run src/views/__tests__/ChangeRequestDetailView.reminderAndSearch.test.tsx --bail=1` — 2/2 đậu.
- `git diff --check` — sạch.
- Chrome (isolated, remote debugging): seed CR có 1 link + 1 reminder, mở detail, chụp screenshot — header cân đối, nút sát badge, icon sửa/xoá cạnh nội dung; click "Sửa liên kết" mở đúng modal "Sửa Change Request"; click "Xóa nhắc nhở" → confirm → DB reminders 1→0; empty state "Chưa có" vẫn cân đối.

## Deviations from Plan

Không có plan riêng cho quick này (chỉnh trực tiếp theo lựa chọn thiết kế của sếp trong hội thoại). Không có deviation.

## Known Stubs

None.

## Threat Flags

Xoá link/reminder có `modal.confirm` trước khi ghi; patch đi qua `updateChangeRequest` và Zod schema, không xoá dữ liệu khác.

## Self-Check: PASSED

- File tồn tại: `src/views/ChangeRequestDetailView.tsx`
- Commit tồn tại: `8ae5eb85`
