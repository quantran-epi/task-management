---
task: 261010-btr
slug: fix-backup-restore-transaction-schema-v10
status: complete
completed: 2026-10-10
---

# Quick Summary: Fix Backup Restore Transaction Lifetime and Schema V10 Alignment

## Outcome
- Resolved `Transaction has already completed or failed` error by extracting async snapshot capture and attachment Base64 conversions outside of Dexie's readwrite transaction in `src/services/backup/restoreBackup.ts`.
- Aligned `CURRENT_SCHEMA_VERSION` to 10 in `src/services/backup/exportBackup.ts` matching Dexie Schema V10.
- Updated schema version test assertions across backup test suite.
- Added regression test in `tests/services/backup/restoreBackup.test.ts` for pre-existing attachment binary blobs during restore.

## Verification
- All 9 backup and restore test suites passed with 47 tests passing (vitest).
