# Quick Task 261019-v0s: Sửa Thông Báo Và Hàng Chờ User Mới Telegram Bot Summary

**Status:** Complete  
**Executed on:** 2026-10-19  

## Key Accomplishments

1. **Pending User Persistence & Authorization:**
   - Extended `TelegramUserStatus` to include `'pending'`.
   - Implemented `recordPendingTelegramUser(chatId, name, db)`: persists unknown inbound users to `db.telegramWhitelist` with status `'pending'`.
   - Updated `checkAndConsumeQuota` and `checkAndConsumeCommandQuota` to ensure `'pending'` users are treated as unauthorized (`allowed: false, reason: 'not_whitelisted'`).

2. **Desktop Notification on First Inbound Event:**
   - In `telegramHeadlessWorker.ts`, first contact from any unwhitelisted user triggers `sendDesktopNotification` with title `'Telegram Bot: Người dùng mới yêu cầu cấp quyền'` and tag `'telegram-pending-{chat_id}'`.
   - Deduplicated: subsequent messages while still pending do not refire desktop alert spam.
   - Initial slash commands (`/start`, `/help`) from unauthorized/pending users are also logged to `db.telegramSessionLogs` so interaction history is never dropped.

3. **Reactive Pending Users Hook:**
   - Created `src/hooks/useTelegramPendingUsers.ts` querying Dexie `telegramWhitelist` where `status === 'pending'`.
   - Provides `pendingUsers`, `pendingCount`, `quickApprove` (activates user and optionally sends Telegram approval confirmation message), `blockUser`, and `dismissUser`.

4. **Navigation Badge & Approval Queue UI:**
   - In `Navigation.tsx`, Telegram Bot menu item now renders a badge with `pendingCount` in red when access requests are pending.
   - In `TelegramMonitorView.tsx`:
     - Whitelist tab displays pending count badge and active user count.
     - Displays dedicated pending approval queue card with 1-click **Phê duyệt nhanh** (activates and dispatches Telegram welcome notification), **Tuỳ chỉnh & Duyệt** (modal prefilled), **Chặn** (marks blocked), and **Xoá** (deletes request).

## Verification Results

- `npx tsc --noEmit`: Passed with zero TypeScript errors under strict mode and `exactOptionalPropertyTypes`.
- `npm test -- tests/telegram/`: 4 test suites passed (31 tests total).

## Commits

- `28c590b`: feat(telegram): track pending users and notify admin on first message
- `1b262fd`: feat(telegram): add pending users hook, nav badge, and approval queue UI
