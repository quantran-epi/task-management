---
phase: quick
plan: 261107-tna
type: execute
wave: 1
depends_on: []
files_modified:
  - src/services/telegram/telegramHeadlessWorker.ts
  - tests/telegram/telegramHeadlessWorker.test.ts
autonomous: true
must_haves:
  truths:
    - "When a non-admin user (active, pending, blocked, or first-time) sends a message to the Telegram bot, an alert message is sent to all active admin users via Telegram"
    - "The notification contains sender name, sender chat ID, timestamp (YYYY-MM-DD HH:mm:ss), user status, and message content"
    - "If the sender is an admin, the bot does not notify the sender admin"
    - "Admin notification failures are isolated in try/catch and do not block or disrupt the user's message flow"
  artifacts:
    - path: "src/services/telegram/telegramHeadlessWorker.ts"
      provides: "notifyAdminsOnInboundMessage helper and invocation in processTelegramInboundMessage"
    - path: "tests/telegram/telegramHeadlessWorker.test.ts"
      provides: "Unit tests verifying admin notifications for both first-time pending users and active users"
  key_links:
    - from: "src/services/telegram/telegramHeadlessWorker.ts"
      to: "src/services/telegram/telegramSettingsService.ts"
      via: "getWhitelist"
      pattern: "getWhitelist"
    - from: "src/services/telegram/telegramHeadlessWorker.ts"
      to: "sendTelegramDirectMessage"
      pattern: "sendTelegramDirectMessage"
---

# Quick Task: 261107-tna - Notify Admin via Telegram on User Chat

## Problem
Currently, when a user chats with TaskMate's Telegram bot, the bot interacts with that user and saves logs to IndexedDB, but does not notify the administrator on Telegram. For first-time/pending users, only a local desktop notification is triggered. When the admin is away from the desktop, they have no visibility into bot interactions.

## Solution
1. In `src/services/telegram/telegramHeadlessWorker.ts`:
   - Add a lightweight notification function `notifyAdminsOnInboundMessage(...)` that queries active admins via `getWhitelist(db)` where `u.isAdmin && u.status === 'active' && u.chatId !== chat_id`.
   - Distinguish whether the sender is a first-time pending user, regular pending user, active user, or blocked user.
   - Format a Markdown alert message with Sender Name, Chat ID, Timestamp (`dayjs`), Status, and Message Content.
   - Send direct Telegram messages to all active admins via `sendTelegramDirectMessage` (or injectable `sendDirectFn`).
   - Call this inside `processTelegramInboundMessage` right after deduplication and before/during user processing, wrapped in `try/catch`.
2. In `tests/telegram/telegramHeadlessWorker.test.ts`:
   - Add unit tests verifying that active admins receive the formatted alert when an active user chats.
   - Add unit tests verifying that active admins receive the formatted alert when a first-time pending user chats.
   - Verify that admins chatting with the bot do NOT receive self-notifications.
   - Run scoped vitest to ensure all tests pass.
