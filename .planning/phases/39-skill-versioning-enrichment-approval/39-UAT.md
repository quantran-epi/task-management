---
status: testing
phase: 39-skill-versioning-enrichment-approval
source: [39-VERIFICATION.md]
started: 2026-11-14T09:45:00Z
updated: 2026-11-14T09:45:00Z
---

## Current Test

number: 1
name: Thẻ duyệt đề xuất kỹ năng trong transcript
expected: |
  Diff đọc được, nút Chấp thuận / Từ chối nằm trong tầm mắt không phải cuộn quá màn hình,
  và panel bằng chứng mặc định đóng.
awaiting: user response

## Tests

### 1. Thẻ duyệt đề xuất kỹ năng trong transcript
expected: Mở chat AI Staff, tạo một đề xuất kỹ năng có diff dài. Diff đọc được; nút Chấp thuận / Từ chối không bị đẩy xuống dưới màn hình; panel bằng chứng đóng sẵn.
result: [pending]

### 2. Danh sách lịch sử phiên bản trong drawer
expected: Tạo 10+ phiên bản cho một kỹ năng, mở mục `Lịch sử phiên bản`. Danh sách cuộn được; mỗi dòng hiện số phiên bản (hoặc `Đề xuất bị từ chối`), tên, DD/MM/YYYY HH:mm và trạng thái; không có dòng trùng.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
