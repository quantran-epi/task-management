---
status: testing
phase: 27-studio-artifact-tools-diff-approval
source: [27-VERIFICATION.md]
started: 2026-11-05T15:00:00Z
updated: 2026-11-05T15:00:00Z
---

## Current Test

number: 1
name: Card diff patch SOLUTION trong Tauri
expected: |
  Card hiện tiêu đề mục, SOLUTION · phiên bản · mục, +1 dòng thêm / −0 dòng xóa, diff nguyên văn có ---/+++/@@, vùng diff cao 240px cuộn được hai chiều, không chữ nào dưới 12px, màu xanh/đỏ đúng ở cả light và dark
awaiting: user response

## Tests

### 1. Card diff patch SOLUTION trong Tauri
expected: Mở CR đang hoạt động ở bước SOLUTION, gửi "Thêm quy tắc kiểm tra đầu vào vào SOLUTION". Card hiện tiêu đề mục, SOLUTION · phiên bản · mục, +1/−0, diff nguyên văn có ---/+++/@@, vùng diff 240px cuộn hai chiều, không chữ nào dưới 12px, marker/ nền dòng xanh-đỏ đúng ở light và dark.
result: [pending]

### 2. Tiêu điểm bàn phím sau khi duyệt/từ chối
expected: Sau khi bấm Chấp thuận hoặc Từ chối bằng bàn phím, tiêu điểm chuyển tới action của card kế tiếp, hoặc về composer đã bật lại; không mất ngữ cảnh.
result: [pending]

### 3. Banner stale sau khi chấp thuận patch SOLUTION
expected: Banner "Bản nháp SOLUTION khác với phiên bản đã lưu", chỉ bước sở hữu bị đánh dấu, không có phiên bản mới/approvedAt mới nào được tạo.
result: [pending]

### 4. Refusal + nút điều hướng prerequisite
expected: Ở màn hình xem trước/lịch sử hoặc khi thiếu PL01, yêu cầu AI đọc tài liệu → Hiện Alert đúng copy, có nút "Chuyển đến Bước {N}: {Tên bước}" điều hướng được, không có card duyệt rỗng.
result: [pending]

### 5. Một lượt chat thật với model 9router yêu cầu chỉnh sửa nhỏ
expected: Model gọi get_artifact rồi patch_artifact_section, không tái tạo toàn bộ tài liệu, editor chỉ đổi sau khi bấm Chấp thuận.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
