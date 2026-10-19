# Quick Plan 261019-sb0: Upgrade Telegram AI Gateway with Grounded Retrieval, Multi-turn History, and HTML Formatting Summary

## Executive Summary

Upgraded the TaskMate Telegram AI Gateway from single-turn ungrounded prompt dumps to a conversational, grounded assistant with session-aware history management, slash command interception, BM25 semantic note grounding, and Telegram-safe HTML parsing.

## Key Changes

1. **Dexie Schema V13 & Settings Services**:
   - Extended `TelegramSettingsRecord` with `maxHistoryTurns` (default 5).
   - Extended `TelegramWhitelistUser` with `maxHistoryTurns` and `sessionResetAt`.
   - Registered `SCHEMA_V13` in `src/db/schema.ts` and automated migration in `src/db/index.ts`.
   - Added `resetTelegramUserSession` and `getTelegramChatHistory` helpers to query bounded previous turns filtered by session reset timestamps.

2. **Telegram HTML Formatter & Rust Gateway**:
   - Created `src/services/telegram/telegramHtml.ts` with XML entity escaping and markdown translation into Telegram-compliant HTML tags (`<b>`, `<i>`, `<s>`, `<code>`, `<pre>`, `<a href>`).
   - Updated `src-tauri/src/telegram_gateway.rs` to send messages using `parse_mode: "HTML"` with automatic plain text fallback stripping tags if parsing fails.

3. **Grounded Retrieval & Slash Command Pipeline**:
   - Intercepted `/reset` and `/clear` slash commands to reset session boundary without consuming AI daily quota.
   - Intercepted `/help` and `/start` commands to present interactive usage instructions, dataScope, remaining daily quota, and command guide without invoking LLM.
   - Upgraded `resolveScopedContext` with `buildGlobalContextPrompt` and token-filtered open tasks for task scopes, and Okapi BM25 scoring across notes/docs for knowledge scopes.
   - Stripped citation artifact tags (`[S1]`, `[Doc 1]`) from model output while appending clean source summaries (`📚 Nguồn: ...`).

4. **Monitor UI & Approval Notification**:
   - Added `maxHistoryTurns` configuration in Telegram Settings tab (default turns).
   - Added per-user `maxHistoryTurns` field in Whitelist user modal and column in table.
   - Updated approval notification message sent to user via Telegram upon activation to include quota, dataScope, history turns, and slash command hints.

## Verification

- `tests/telegram/telegramSettingsService.test.ts`: Passed (6/6 tests).
- `tests/telegram/telegramHtml.test.ts`: Passed (8/8 tests).
- `tests/telegram/telegramHeadlessWorker.test.ts`: Passed (7/7 tests).
- Total Telegram test suite: 21 passing tests.
- `npx tsc --noEmit`: Clean, 0 errors.
- `cargo check --manifest-path src-tauri/Cargo.toml`: Clean.

## Commits

- `4ecfd96`: `feat(telegram): extend data model and schema v13 for chat history`
- `05bf021`: `feat(telegram): upgrade worker with HTML parsing, slash commands, and grounded BM25 retrieval`
- `bc19f66`: `feat(telegram): add maxHistoryTurns controls and updated approval notice to monitor view`

## Self-Check: PASSED
