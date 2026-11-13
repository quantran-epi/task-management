---
status: testing
phase: 38-hard-token-budget-accurate-measurement
source: [38-VERIFICATION.md]
started: 2026-11-14T00:20:00Z
updated: 2026-11-14T00:20:00Z
---

## Current Test

number: 1
name: OS notification một lần mỗi mức khi vượt ngưỡng
expected: |
  Trong app Tauri: mở một nhóm, để một thành viên vượt phần chia của nó.
  Đúng MỘT notification hệ điều hành cho mức thành viên và MỘT cho mức nhóm.
  Vòng tool thứ hai KHÔNG báo lại. Lượt chạy tiếp tục, không dừng, không từ chối.
awaiting: user response

## Tests

### 1. OS notification một lần mỗi mức khi vượt ngưỡng
Mục đích: AIO-BUDGET-01/06, D-01/D-02 — cảnh báo thấy được, không bao giờ chặn.
steps:
  1. Mở app Tauri, vào một nhóm có ít nhất 2 thành viên.
  2. Gửi một việc đủ dài để một thành viên vượt ngưỡng cảnh báo (mặc định 80%).
  3. Để lượt chạy tiếp tục qua nhiều vòng tool.
  4. Kiểm tra: đúng 1 notification mức thành viên + 1 notification mức nhóm.
  5. Kiểm tra: vòng tool thứ hai không báo lại; lượt chạy vẫn tiếp tục.
expected: |
  Một notification mỗi mức mỗi lượt chạy; lượt chạy tiếp tục; không pause, không từ chối.
result: pending

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
