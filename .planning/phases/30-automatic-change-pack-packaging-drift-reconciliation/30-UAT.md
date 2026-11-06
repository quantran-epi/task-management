---
status: testing
phase: 30-automatic-change-pack-packaging-drift-reconciliation
source: [30-VERIFICATION.md]
started: 2026-11-06T09:30:00Z
updated: 2026-11-06T09:30:00Z
---

## Current Test

number: 1
name: SSH auto-packaging end-to-end trong Tauri
expected: |
  Stepper chạy 4 bước; pack mới xuất hiện trong lịch sử MultiPack ở trạng thái active;
  Drift Matrix hiển thị kết quả đối soát với SOLUTION.md; không có tệp zip tạm trên máy.
awaiting: user response

## Tests

### 1. SSH auto-packaging end-to-end trong Tauri
expected: Stepper chạy 4 bước; pack mới xuất hiện trong lịch sử MultiPack ở trạng thái active; Drift Matrix hiển thị kết quả đối soát với SOLUTION.md; không có tệp zip tạm nào trên máy.
result: [pending]

### 2. Drift prompt và SSH failure retry trên kết nối thật
expected: Lần đầu hiện banner drift với 2 lựa chọn và chỉ đóng gói sau khi xác nhận; khi SSH lỗi hiện banner lỗi + nút "Thử lại kết nối" + accordion thủ công tự mở, và nút thử lại chạy lại đóng gói.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
