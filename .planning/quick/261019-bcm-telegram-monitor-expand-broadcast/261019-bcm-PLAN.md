---
phase: quick
plan: 261019-bcm
type: execute
wave: 1
depends_on: []
files_modified:
  - src/services/telegram/telegramTypes.ts
  - src/services/telegram/telegramHeadlessWorker.ts
  - src/views/TelegramMonitorView.tsx
  - tests/telegram/telegramHeadlessWorker.test.ts
autonomous: true
requirements: [TELEGRAM-MONITOR-EXPANDABLE-BROADCAST]

must_haves:
  truths:
    - "Live Monitor table rows are compact by default with truncated message previews"
    - "Live Monitor table rows are expandable with expandedRowRender showing full conversation text"
    - "Admin can send direct messages to a specific Telegram user with Markdown formatting"
    - "Admin can broadcast messages to all active whitelisted Telegram users"
---

<task_description>
1. Update Live Monitor table:
   - Add expandable with defaultExpandAllRows: false.
   - Show 1-line truncated previews for User & AI message in main collapsed table row.
   - expandedRowRender displays the complete, formatted user inquiry and AI reply with copy/action buttons.
2. Add Admin Send Message capability:
   - Add broadcastTelegramMessage service in telegramHeadlessWorker.ts.
   - Add Modal in TelegramMonitorView with Direct vs Broadcast modes.
   - Add quick-action send buttons in Whitelist table and Live Monitor rows.
</task_description>
