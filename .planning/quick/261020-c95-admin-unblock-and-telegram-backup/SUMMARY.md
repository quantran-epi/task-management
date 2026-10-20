---
status: complete
date: 2026-10-20
---

# Quick Task Summary: Admin unblock Telegram user & Backup Telegram data excluding session logs

## Work Completed
1. **Admin unblock Telegram user**:
   - Added `unblockUser` in `src/services/telegram/telegramSettingsService.ts` to reactivate users with `status: 'active'` and reset over-quota spam counters.
   - Added `/unblock_user` slash command and interactive wizard flow in `src/services/telegram/telegramAdminWizard.ts`.
   - Added `unblockUser` function to `useTelegramPendingUsers` hook.
   - Added interactive unlock button with confirm dialog in `TelegramMonitorView.tsx` whitelist table.
2. **Backup Telegram Data (Excluding logs)**:
   - Added `telegramSettings` and `telegramWhitelist` to `BackupTableData`, `BackupTableCounts`, `BackupEnvelope` in `src/types/backup.ts`.
   - Added `BackupTelegramSettingsRecordSchema` and `BackupTelegramWhitelistUserSchema` in `src/validation/backupSchemas.ts`.
   - Updated `exportBackupPayload` in `src/services/backup/exportBackup.ts` to export settings (stripping `botToken`) and whitelist, strictly excluding `telegramSessionLogs`.
   - Updated `validateBackupPayload` in `src/services/backup/validateBackup.ts` to validate telegram tables.
   - Updated `restoreBackupPayload` and `rollbackToSnapshot` in `src/services/backup/restoreBackup.ts` to clear and restore telegram settings and whitelist while leaving local `telegramSessionLogs` intact.
   - Updated `ImportPreviewModal.tsx` to display telegram tables and record counts in the import preview modal.
3. **Tests**:
   - Added unit tests in `tests/telegram/telegramAdminWizard.test.ts` for unblock wizard.
   - Added unit test in `tests/telegram/telegramPendingUsers.test.ts` for `unblockUser`.
   - Added unit tests in `tests/services/backup/exportBackup.test.ts` verifying telegram data inclusion, token stripping, and session logs exclusion.
   - Added unit test in `tests/services/backup/restoreBackup.test.ts` verifying restoration of settings and whitelist without clearing local session logs.
   - All tests pass (81/81 passed).
