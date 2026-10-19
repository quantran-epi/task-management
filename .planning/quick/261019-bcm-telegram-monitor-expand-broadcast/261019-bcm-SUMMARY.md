---
phase: quick
plan: 261019-bcm
status: complete
date: 2026-10-19
files_modified:
  - src/services/telegram/telegramTypes.ts
  - src/services/telegram/telegramHeadlessWorker.ts
  - src/views/TelegramMonitorView.tsx
  - tests/telegram/telegramHeadlessWorker.test.ts
---

# Quick Task Summary: Telegram Monitor Expandable UI & Admin Broadcast / Direct Messaging

## Delivered
1. **Live Monitor Table Compact & Expandable**:
   - Configured `expandable` with `defaultExpandAllRows: false`.
   - Collapsed row displays single-line truncated preview for both user prompt and AI response with ellipses.
   - Expanding row reveals full dialogue with clean card formatting, timestamps, user info, and quick reply actions.
2. **Admin Broadcast & Direct Messaging**:
   - Implemented `broadcastTelegramMessage` in `telegramHeadlessWorker.ts` with error tracking and aggregate status return.
   - Added `TelegramBroadcastResult` interface in `telegramTypes.ts`.
   - Added "Gửi tin nhắn" modal in `TelegramMonitorView.tsx` supporting:
     - Direct mode: Select from whitelist or enter arbitrary Telegram `chatId`.
     - Broadcast mode: Sends to all active whitelisted users with aggregate summary.
   - Added quick send action buttons in Whitelist table and Live Monitor rows.
   - Added unit test in `tests/telegram/telegramHeadlessWorker.test.ts`.
