---
status: testing
phase: 46-configuration-profiles
source: [46-VERIFICATION.md]
started: 2026-11-19
updated: 2026-11-19
---

## Current Test

number: 1
name: Walkthrough Tauri 6 bước (46-04 Task 2) — quan sát luồng profile thật trên desktop
expected: |
  (1) Mở màn hình config-profiles từ workbench (không phải tab thứ 7 trong Settings); form hiện default values, có capacity rules + Ghost Dev fields.
  (2) Secret fields để trống + hint "export will be blank"; machine-specific (kể cả ghostDevConfig.claudePath) có cảnh báo; KHÔNG có Telegram/team fields.
  (3) Đặt tên profile → save → export 1-click qua native save dialog. File JSON: mọi secret = '', không có key/token/password thật, host/path vẫn còn, không có telegramSettings, có capacityRules/capacityOverrides/ghostDevConfig.
  (4) Settings > Data tab: import JSON → preview flag machine values + blank secrets, không có Telegram item, OK disabled đến khi gõ đúng IMPORT.
  (5) Apply → checklist 2 nhóm hiện; secret có sẵn trên máy KHÔNG bị ghi đè bởi field blank; capacity + Ghost Dev applied; Telegram settings (owner token) unchanged.
  (6) Settings vẫn đúng 6 tab; các settings không liên quan intact.
awaiting: user response

## Tests

### 1. Walkthrough Tauri 6 bước (46-04 Task 2)
expected: Tất cả 6 bước đạt như mô tả ở trên; không lộ secret, không mất dữ liệu người nhận, Telegram nguyên vẹn, 6 tab Settings giữ nguyên.
result: [pending]

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps

Không có code gap. Đây là UAT quan sát (C-15) cho các invariant đã được test hành vi chứng minh tại `46-VERIFICATION.md` (9/9 must-haves verified). Chạy `/gsd-verify-work 46` sau khi hoàn tất walkthrough để ghi kết quả và đóng phase.
