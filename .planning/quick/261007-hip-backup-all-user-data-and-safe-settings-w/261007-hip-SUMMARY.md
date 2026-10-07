---
phase: quick
plan: 261007-hip
subsystem: backup-persistence
status: complete
tags:
  - backup
  - github-sync
  - sqlite-persistence
  - ai-chat
  - notes
dependency_graph:
  requires: []
  provides:
    - full-user-data-backup-and-restore
    - safe-settings-backup
    - strictly-no-binary-attachments-in-backup
    - dirty-tracking-all-domain-tables
    - rust-sqlite-allowed-all-tables
  affects:
    - src/types/backup.ts
    - src/validation/backupSchemas.ts
    - src/services/backup/validateBackup.ts
    - src/services/backup/exportBackup.ts
    - src/services/backup/restoreBackup.ts
    - src/services/localSqlitePersistence.ts
    - src-tauri/src/sqlite_persistence.rs
tech-stack:
  added: []
  patterns:
    - safe settings filtering with secret and ephemeral key blacklists
    - omission of binary data payloads in backup envelopes for storage efficiency
    - reactive dirty marking for all domain tables triggering GitHub auto-sync
key-files:
  created: []
  modified:
    - src/components/agents/RunGhostDevModal.tsx
    - src/types/backup.ts
    - src/validation/backupSchemas.ts
    - src/services/backup/validateBackup.ts
    - src/services/backup/exportBackup.ts
    - src/services/backup/restoreBackup.ts
    - src/services/localSqlitePersistence.ts
    - src-tauri/src/sqlite_persistence.rs
    - tests/services/backup/exportBackup.test.ts
    - tests/services/localSqlitePersistence.test.ts
decisions:
  - Included chatThreads, chatMessages, activeTimers, and safe settings in backup envelope
  - Strictly excluded binary/base64 image data from noteAttachments to keep backup file size under 1MB
  - Added notes, noteAttachments, chatThreads, and chatMessages to SQLITE_DOMAIN_TABLES and Rust ALLOWED_TABLES so all user data changes trigger dirty state and persist to SQLite
---

# Quick Task Summary: Backup All User Data and Safe Settings Without Binary Data

Implemented complete backup coverage and fixed GitHub sync dirty state tracking:
1. **Domain Tables and Dirty Tracking:** Added `notes`, `noteAttachments`, `chatThreads`, and `chatMessages` to `SQLITE_DOMAIN_TABLES` in `localSqlitePersistence.ts` and `ALLOWED_TABLES` in `src-tauri/src/sqlite_persistence.rs`. Editing docs or chat messages immediately marks the session dirty (`github_auto_sync_dirty_since`), displaying the pending sync warning and triggering auto-sync.
2. **Backup Export/Restore:** Included `chatThreads`, `chatMessages`, `activeTimers`, and safe non-secret `settings` in backup envelope, schema validation, and restore procedures.
3. **Storage Growth Prevention:** Strictly excluded binary and base64 image data from `noteAttachments` in `exportBackupPayload`, preserving only metadata and local file paths.
4. **Build Fix:** Removed obsolete `promptLanguage` argument from `RunGhostDevModal.tsx`.
