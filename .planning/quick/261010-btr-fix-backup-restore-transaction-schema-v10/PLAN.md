---
task: 261010-btr
slug: fix-backup-restore-transaction-schema-v10
status: complete
created: 2026-10-10
---

# Quick Plan: Fix Backup Restore Transaction Lifetime and Align Schema Version to V10

Resolve "Transaction has already completed or failed" error during backup restore caused by async non-IDB operations (`blobToBase64`) inside Dexie transaction, and bump `CURRENT_SCHEMA_VERSION` from 4 to 10 to match Dexie Schema V10.

## Tasks

- [x] Task 1: Refactor `restoreBackupPayload` in `src/services/backup/restoreBackup.ts` to capture and serialize snapshot attachments before opening the Dexie write transaction.
- [x] Task 2: Bump `CURRENT_SCHEMA_VERSION` to 10 in `src/services/backup/exportBackup.ts`.
- [x] Task 3: Update schemaVersion test expectations in `tests/services/backup/v2Compatibility.test.ts`, `tests/validation/backupSchemasTimer.test.ts`, and `tests/noteAttachments.test.ts`.
- [x] Task 4: Add test in `tests/services/backup/restoreBackup.test.ts` verifying restore with pre-existing note attachment binary blobs.
- [x] Task 5: Run backup-related tests to verify fix.
