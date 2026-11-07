---
phase: quick
plan: 261107-tna
status: complete
date: 2026-11-07
files_modified:
  - src/services/telegram/telegramHeadlessWorker.ts
  - tests/telegram/telegramHeadlessWorker.test.ts
---

# Quick Task Summary: 261107-tna - Telegram Notify Admin on User Chat

## Implemented
- Added `notifyAdminsOnInboundMessage` in `src/services/telegram/telegramHeadlessWorker.ts` to notify all active Telegram administrators whenever a non-admin user sends a message to the bot.
- Alert format includes:
  - Header: distinguishes regular user chat (`Tin nhắn mới từ người dùng`) vs first-time pending user (`Người dùng mới gửi tin nhắn lần đầu`)
  - Sender name (`from_name`) and Chat ID (`chat_id`)
  - Timestamp (`dayjs` formatted as `YYYY-MM-DD HH:mm:ss`)
  - Status badge: `🆕 Người dùng mới - Chờ duyệt (Pending)`, `✅ Đang hoạt động (Active)`, `⏳ Đang chờ duyệt (Pending)`, or `⛔ Đã bị khóa (Blocked)`
  - Message content (`text`)
- Prevents self-notification when an active admin chats with the bot.
- Isolated in `try/catch` so notification delivery errors never block user interaction.
- Extended unit tests in `tests/telegram/telegramHeadlessWorker.test.ts` with 4 new test cases covering all behaviors.
