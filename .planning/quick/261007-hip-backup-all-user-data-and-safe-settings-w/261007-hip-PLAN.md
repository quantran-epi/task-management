---
phase: quick
plan: 261007-hip
type: execute
wave: 1
depends_on: []
files_modified:
  - src/types/backup.ts
  - src/validation/backupSchemas.ts
  - src/services/backup/validateBackup.ts
  - src/services/backup/exportBackup.ts
  - src/services/backup/restoreBackup.ts
  - src/services/localSqlitePersistence.ts
  - src-tauri/src/sqlite_persistence.rs
  - tests/services/exportBackup.test.ts
  - tests/services/validateBackup.test.ts
  - tests/services/restoreBackup.test.ts
  - tests/services/localSqlitePersistence.test.ts
autonomous: true
requirements:
  - QUICK-261007-HIP-BACKUP-ALL-TABLES
  - QUICK-261007-HIP-SAFE-SETTINGS-ONLY
  - QUICK-261007-HIP-NO-BINARY-ATTACHMENT
  - QUICK-261007-HIP-DIRTY-TRACKING-ALL-DOMAIN-TABLES
must_haves:
  truths:
    - "Backup export and restore include notes, noteAttachments, chatThreads, chatMessages, activeTimers, and safe settings."
    - "Backup export strictly excludes binary and base64 image data from noteAttachments to keep backup size small."
    - "Settings export strips credentials and secret keys (jira_api_token, github_pat, github_passphrase, ninerouter_api_key, etc.) and ephemeral sync keys."
    - "Local SQLite persistence and dirty tracking include notes, noteAttachments, chatThreads, and chatMessages so edits trigger GitHub sync."
    - "Rust SQLite allowed tables include notes, noteAttachments, chatThreads, and chatMessages."
---

# Quick Task Plan: Backup All User Data and Safe Settings Without Binary Data

## Problem
Currently, documents (`notes`, `noteAttachments`) and AI chats (`chatThreads`, `chatMessages`) are not in `SQLITE_DOMAIN_TABLES` or Rust `ALLOWED_TABLES`, so editing a doc or chatting never sets `github_auto_sync_dirty_since`, desktop SQLite doesn't persist them, and chat/timers/settings are not backed up. Furthermore, backup of attachments must strictly avoid binary/image data to prevent storage growth.

## Tasks
1. Update `src/types/backup.ts`, `src/validation/backupSchemas.ts`, and `src/services/backup/validateBackup.ts` to support `chatThreads`, `chatMessages`, `activeTimers`, `settings`, and modern `Note` fields (`type`, `parentId`, `tags`, etc.).
2. Update `src/services/backup/exportBackup.ts` to export all user data tables + safe settings, and strictly exclude binary/image data from note attachments.
3. Update `src/services/backup/restoreBackup.ts` to restore all user data tables and safe settings.
4. Update `src/services/localSqlitePersistence.ts` and `src-tauri/src/sqlite_persistence.rs` to include `notes`, `noteAttachments`, `chatThreads`, and `chatMessages` in domain tables and allowed tables for desktop SQLite persistence and dirty tracking.
5. Update tests to verify backup, restore, validation, and dirty tracking with the new tables.
