---
status: resolved
phase: 39-skill-versioning-enrichment-approval
source: [39-VERIFICATION.md]
started: 2026-11-14T09:45:00Z
updated: 2026-11-14T16:35:00Z
---

## Current Test

number: 2
name: Hoàn tất
expected: |
  Cả hai mục đã được chuyển thành test tự động và pass.
awaiting: none

## Tests

### 1. Thẻ duyệt đề xuất kỹ năng trong transcript
expected: Mở chat AI Staff, tạo một đề xuất kỹ năng có diff dài. Diff đọc được; nút Chấp thuận / Từ chối không bị đẩy xuống dưới màn hình; panel bằng chứng đóng sẵn.
result: resolved — tìm thấy lỗi thật: panel bằng chứng nằm TRƯỚC nút, đẩy nút xuống. Đã chuyển xuống dưới. Test `PatchDiffApprovalCard.test.tsx` → "bounds the diff and keeps the decision buttons ahead of the evidence panel (UAT)". Mutation-checked.

### 2. Danh sách lịch sử phiên bản trong drawer
expected: Tạo 10+ phiên bản cho một kỹ năng, mở mục `Lịch sử phiên bản`. Danh sách cuộn được; mỗi dòng hiện số phiên bản (hoặc `Đề xuất bị từ chối`), tên, DD/MM/YYYY HH:mm và trạng thái; không có dòng trùng.
result: resolved — tìm thấy lỗi thật: danh sách không có giới hạn chiều cao, drawer dài vô hạn. Đã thêm `maxHeight: 320, overflowY: auto`. Test `SkillEditorDrawer.test.tsx` → "scrolls the version history instead of growing the drawer (UAT)". Mutation-checked.

## Summary

total: 2
passed: 2
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
