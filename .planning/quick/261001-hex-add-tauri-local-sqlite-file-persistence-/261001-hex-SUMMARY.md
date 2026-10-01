---
phase: quick
plan: 261001-hex
subsystem: desktop-persistence-and-sync
tags: [tauri, sqlite, rusqlite, rfd, github-sync, autosave]
requires:
  - Phase 06: Local backup & restore
  - Phase 08: Encrypted GitHub backup
  - Phase 12.1: Work session & timer persistence
provides:
  - Tauri local SQLite file persistence with user-selected path and row-level transactional autosave
  - Missing SQLite path recovery without silent recreation or IndexedDB data loss
  - Dirty-only GitHub auto-sync scheduler supporting interval and fixed local daily HH:mm modes
affects:
  - Desktop persistence durability
  - Settings data tab backup & sync controls
  - AppShell global persistence and scheduler lifecycle
tech-stack:
  added:
    - rusqlite 0.40.2 (bundled SQLite)
    - rfd 0.17.2 (native file dialogs)
  patterns:
    - Row-level Dexie hook queueing coalesced by (tableName, rowId)
    - SQLite single-transaction upsert/delete mapping
    - Native window close-request flush
    - Dirty marker gating GitHub pushes with missed-run catch-up
key-files:
  created:
    - src-tauri/src/sqlite_persistence.rs
    - src/services/localSqlitePersistence.ts
    - src/hooks/useLocalSqlitePersistence.ts
    - src/hooks/useGitHubAutoSync.ts
    - src/components/settings/LocalSqlitePersistenceCard.tsx
    - tests/services/localSqlitePersistence.test.ts
    - tests/components/settings/LocalSqlitePersistenceCard.test.tsx
    - tests/hooks/useGitHubAutoSync.test.tsx
  modified:
    - src-tauri/Cargo.toml
    - src-tauri/src/lib.rs
    - src/components/settings/GitHubSyncCard.tsx
    - src/components/shell/AppShell.tsx
    - src/views/SettingsView.tsx
    - src/services/github/githubSyncService.ts
decisions:
  - "Store planner rows in SQLite as individual rows keyed by (table_name, row_id) inside transactions rather than whole-backup JSON blobs."
  - "Keep IndexedDB as runtime source of truth; SQLite acts as local desktop recovery mirror."
  - "Missing configured SQLite path marks recovery state without recreating files or clearing IndexedDB."
  - "Gate GitHub auto-sync on github_auto_sync_dirty_since so clean sessions never trigger pushes."
  - "Flush local SQLite before executing remote GitHub push."
metrics:
  duration: 18m
  completed_date: "2026-10-01"
  tasks_completed: 2
  files_created: 8
  files_modified: 6
---

# Quick Plan 261001-hex: Tauri Local SQLite File Persistence & GitHub Auto-Sync Summary

Tauri local SQLite row-level transactional persistence with user-selected path, close flush, missing-path recovery, and dirty-only GitHub auto-sync scheduling by interval or fixed daily local time.

## Key Changes

1. **Rust Tauri SQLite Commands (`src-tauri/src/sqlite_persistence.rs`, `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`)**
   - Added `rusqlite` (bundled) and `rfd` crates after package legitimacy verification.
   - Implemented `select_sqlite_path`, `sqlite_file_status`, `sqlite_init`, `sqlite_apply_changes`, and `sqlite_read_rows`.
   - Stored records in `planner_rows` keyed by `(table_name, row_id)` with transactional batch apply and validation against table allowlist.
   - Returned `SQLITE_PATH_MISSING` when configured file is absent instead of auto-recreating it.

2. **Dexie to SQLite Bridge & UI (`src/services/localSqlitePersistence.ts`, `src/hooks/useLocalSqlitePersistence.ts`, `src/components/settings/LocalSqlitePersistenceCard.tsx`, `src/views/SettingsView.tsx`, `src/components/shell/AppShell.tsx`)**
   - Enqueued row mutations via Dexie table hooks for domain tables, settings, backup metadata, and active timers.
   - Coalesced pending writes by `(tableName, rowId)` and flushed on debounce, `pagehide`, and Tauri native `onCloseRequested`.
   - Displayed path selection, write status, missing-file recovery alert, and explicit overwrite confirmation before restoring to IndexedDB.
   - Excluded secrets (`github_token`, `github_passphrase`) from persisted SQLite rows.

3. **Dirty-Only GitHub Auto-Sync Scheduler (`src/hooks/useGitHubAutoSync.ts`, `src/components/settings/GitHubSyncCard.tsx`, `src/services/github/githubSyncService.ts`)**
   - Implemented `computeGitHubAutoSyncDue` supporting interval minutes and daily `HH:mm` local schedules.
   - Gated auto pushes on `github_auto_sync_dirty_since`, running catch-up once when credentials or app return to an active session.
   - Flushed local SQLite before remote push to keep local persistence ahead of remote encrypted backup.
   - Atomically cleared dirty markers and recorded last run/attempt metadata in `db.settings`.

## Verification Results

- `npx vitest run tests/services/localSqlitePersistence.test.ts tests/components/settings/LocalSqlitePersistenceCard.test.tsx` (5 passed)
- `npx vitest run tests/hooks/useGitHubAutoSync.test.tsx tests/components/settings/GitHubSyncCard.test.tsx tests/services/github/githubSyncService.test.ts` (17 passed)
- `npm run build` passed cleanly with Vite client build and PWA service worker generation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Internal settings writes self-queued during SQLite flush**
- **Found during:** Task 2 implementation
- **Issue:** Writing queue, missing path, or flush metadata to `db.settings` re-triggered table hooks and dirty state.
- **Fix:** Filtered internal setting keys and used a suppression set during persistence metadata writes.
- **Files modified:** `src/services/localSqlitePersistence.ts`
- **Commit:** `e2691db`

**2. [Rule 1 - Bug] Multi-table Dexie restore transaction argument signature**
- **Found during:** Task 2 build verification
- **Issue:** Passing 10 table arguments exceeded `db.transaction()` overload limits under strict TypeScript checks.
- **Fix:** Switched table hydration to sequential table puts in `hydrateDexieFromSqlite`.
- **Files modified:** `src/services/localSqlitePersistence.ts`
- **Commit:** `e2691db`

**3. [Rule 1 - Bug] Exact optional property types check in GitHubAutoSyncConfig**
- **Found during:** Task 3 build verification
- **Issue:** Strict `exactOptionalPropertyTypes` flagged optional properties assigned `undefined`.
- **Fix:** Updated config interface to explicitly allow `| undefined`.
- **Files modified:** `src/hooks/useGitHubAutoSync.ts`
- **Commit:** `b70ed80`

## Self-Check: PASSED

- FOUND: `src-tauri/src/sqlite_persistence.rs`
- FOUND: `src/services/localSqlitePersistence.ts`
- FOUND: `src/hooks/useLocalSqlitePersistence.ts`
- FOUND: `src/hooks/useGitHubAutoSync.ts`
- FOUND: `src/components/settings/LocalSqlitePersistenceCard.tsx`
- FOUND: `33d67f8`
- FOUND: `e2691db`
- FOUND: `a24206a`
- FOUND: `b70ed80`
