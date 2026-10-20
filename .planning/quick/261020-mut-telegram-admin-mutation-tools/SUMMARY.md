---
task: 261020-mut
title: Support full mutation tools for admin on Telegram with preview and confirmation loop
date: 2026-10-20
status: complete
commit: 288ec3b
---

# Summary: Telegram Admin Mutation Tools with Preview and Confirmation Loop

## What was built:
1. **Full Mutation Tools Support (`src/services/telegram/telegramMutationSession.ts`):**
   - Connected `AI_DATABASE_TOOLS` (tasks, projects, milestones, notes, work sessions, timers, allocations, capacity) to Telegram Admin flow.
   - Built `executeAdminMutationTurn` which runs tool calling loop, intercepts any mutation tool call, generates formatted preview (`describeToolMutationWithContext`), and registers a 10-minute expiring `PendingMutation` session.
2. **Interactive Confirmation & Adjustment Loop:**
   - Detects affirmative confirmation ("OK", "xác nhận", "đồng ý", "tiến hành", "làm đi"): executes `executeAiTool`, writes directly to IndexedDB, clears pending state, returns execution outcome report.
   - Detects cancellation ("hủy", "cancel", "bỏ qua", "thôi"): cancels proposal, clears pending state without touching DB.
   - Detects adjustments: re-evaluates tool call with new parameters, updates pending state, and presents updated preview.
3. **Role & Quota Protection:**
   - Non-admin users attempting mutations receive scope refusal: *"Chỉ quản trị viên (Admin) mới có quyền yêu cầu tạo, cập nhật, hoặc xóa dữ liệu TaskMate qua Telegram."*
   - Admin mutation operations, previews, adjustments, confirmations, and cancellations are exempt from quota (`refundQuota`).
   - Admins are not blocked by `quota_exceeded` during TaskMate management.

## Verification:
- Added 6 dedicated unit tests in `tests/telegram/telegramAdminMutation.test.ts`.
- Ran full Telegram test suite: 52 tests across 6 files all passed.
