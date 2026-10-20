# Quick Plan: Admin unblock Telegram user & Backup Telegram data excluding session logs

## Problem
1. Admin currently has `/block_user`, `/approve_user`, `/adjust_quota`, but lacks `/unblock_user` to reactivate blocked users via Telegram wizard and UI.
2. Telegram configuration and whitelist data were not included in standard backup exports (JSON and GitHub Sync), risking data loss on restore. Meanwhile, `telegramSessionLogs` can grow rapidly and must remain local-only, excluded from backup.

## Solution
1. Add `unblockUser` service function, `unblock_user` wizard action + `/unblock_user` command for Telegram bot admin, and unlock button in `TelegramMonitorView` whitelist table.
2. Update backup pipeline:
   - Add `telegramSettings` (with `botToken` stripped for security) and `telegramWhitelist` to `BackupTableData`, `BackupEnvelope`, `BackupTableCounts`.
   - Update `exportBackupPayload`, `restoreBackupPayload`, `validateBackupPayload`, `rollbackToSnapshot`, and `ImportPreviewModal`.
   - Exclude `telegramSessionLogs` completely from backup and snapshot.
3. Add unit tests for admin unblock and telegram backup/restore.
