---
phase: quick
plan: 261001-hex
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/Cargo.toml
  - src-tauri/src/lib.rs
  - src-tauri/src/sqlite_persistence.rs
  - src/services/localSqlitePersistence.ts
  - src/hooks/useLocalSqlitePersistence.ts
  - src/hooks/useGitHubAutoSync.ts
  - src/components/settings/LocalSqlitePersistenceCard.tsx
  - src/components/settings/GitHubSyncCard.tsx
  - src/components/shell/AppShell.tsx
  - src/views/SettingsView.tsx
  - tests/services/localSqlitePersistence.test.ts
  - tests/hooks/useGitHubAutoSync.test.tsx
  - tests/components/settings/LocalSqlitePersistenceCard.test.tsx
  - tests/components/settings/GitHubSyncCard.test.tsx
autonomous: false
requirements:
  - HEX-SQLITE-01
  - HEX-SQLITE-02
  - HEX-SQLITE-03
  - HEX-SQLITE-04
  - HEX-GITHUB-01
  - HEX-GITHUB-02
  - HEX-GITHUB-03
  - HEX-SAFE-01
user_setup: []
must_haves:
  truths:
    - "Tauri desktop user can select a local SQLite file path from Settings and see current path/status."
    - "All exported Dexie domain rows autosave to SQLite as individual rows inside SQLite transactions, not as one whole backup blob per save."
    - "Closing the Tauri window flushes queued SQLite row changes before native window close completes."
    - "If configured SQLite path is missing, app does not recreate or overwrite silently; Settings shows recovery controls and keeps IndexedDB data intact."
    - "GitHub auto-sync can run by interval minutes or fixed local daily HH:mm schedule."
    - "GitHub auto-sync pushes only when exported domain data is dirty since last successful sync."
    - "If an interval/daily run was missed while app was closed or credentials absent, next eligible startup/session catches up once when dirty data exists."
    - "GitHub PAT and encryption passphrase remain session-only and are never written to SQLite, IndexedDB settings, localStorage, sessionStorage, source, or logs."
  artifacts:
    - path: "src-tauri/src/sqlite_persistence.rs"
      provides: "Rust SQLite file commands, row schema, transactional apply, file status, and readback"
      exports: ["select_sqlite_path", "sqlite_file_status", "sqlite_init", "sqlite_apply_changes", "sqlite_read_rows"]
    - path: "src/services/localSqlitePersistence.ts"
      provides: "Tauri invoke bridge, Dexie row serialization, queueing, flush, hydrate, missing-path handling, dirty marker"
      exports: ["flushLocalSqliteNow", "selectAndConfigureSqlitePath", "hydrateDexieFromSqlite", "SQLITE_SETTING_KEYS"]
    - path: "src/hooks/useLocalSqlitePersistence.ts"
      provides: "Global Dexie hook registration and Tauri close-request flush"
      exports: ["useLocalSqlitePersistence"]
    - path: "src/components/settings/LocalSqlitePersistenceCard.tsx"
      provides: "Settings UI for path select, flush, missing-path recovery, and SQLite restore confirmation"
    - path: "src/hooks/useGitHubAutoSync.ts"
      provides: "Dirty-only interval/daily scheduler with missed-run catch-up"
      exports: ["useGitHubAutoSync", "computeGitHubAutoSyncDue"]
    - path: "src/components/settings/GitHubSyncCard.tsx"
      provides: "Existing GitHub card extended with auto-sync schedule controls and status"
  key_links:
    - from: "src/components/shell/AppShell.tsx"
      to: "src/hooks/useLocalSqlitePersistence.ts"
      via: "global hook mount inside GitHubAuthProvider/TimerProvider tree"
      pattern: "useLocalSqlitePersistence\("
    - from: "src/hooks/useLocalSqlitePersistence.ts"
      to: "src/services/localSqlitePersistence.ts"
      via: "Dexie hook queue and flush calls"
      pattern: "flushLocalSqliteNow"
    - from: "src-tauri/src/lib.rs"
      to: "src-tauri/src/sqlite_persistence.rs"
      via: "tauri::generate_handler command registration"
      pattern: "sqlite_apply_changes"
    - from: "src/components/shell/AppShell.tsx"
      to: "src/hooks/useGitHubAutoSync.ts"
      via: "global scheduler mount with session GitHub credentials"
      pattern: "useGitHubAutoSync\("
    - from: "src/hooks/useGitHubAutoSync.ts"
      to: "src/services/github/githubSyncService.ts"
      via: "executeGitHubBackupPush call after dirty/due checks"
      pattern: "executeGitHubBackupPush"
---

<objective>
Add Tauri local SQLite file persistence with a user-selected path, row-level transactional autosave, close flush, missing-path recovery, and GitHub auto-sync by interval or fixed daily local time with dirty-only sync and missed-run catch-up.

Purpose: Give desktop users durable local file persistence outside browser-origin IndexedDB while preserving current offline-first IndexedDB runtime and existing encrypted GitHub backup flow.
Output: Rust SQLite command layer, TypeScript Dexie autosave bridge, Settings data-tab controls, global close-flush hook, GitHub auto-sync scheduler, and focused tests.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@package.json
@src-tauri/Cargo.toml
@src-tauri/src/lib.rs
@src/db/index.ts
@src/db/schema.ts
@src/types/models.ts
@src/services/backup/exportBackup.ts
@src/services/github/githubSyncService.ts
@src/context/GitHubAuthContext.tsx
@src/components/settings/GitHubSyncCard.tsx
@src/views/SettingsView.tsx
@src/components/shell/AppShell.tsx
@src/utils/timerPopout.ts
@tests/services/github/githubSyncService.test.ts
@tests/components/settings/GitHubSyncCard.test.tsx
</context>

<source_audit>
| SOURCE | ID | Feature/Requirement | Plan | Status | Notes |
|---|---|---|---|---|---|
| GOAL | quick-description | Add Tauri local SQLite file persistence and GitHub auto-sync scheduling | 261001-hex | COVERED | Objective and Tasks 2-3 cover full quick scope |
| REQ | HEX-SQLITE-01 | User-selected local SQLite path | 261001-hex Task 2 | COVERED | LocalSqlitePersistenceCard + Rust rfd file dialog command |
| REQ | HEX-SQLITE-02 | Row-level transactional autosave | 261001-hex Task 2 | COVERED | Dexie row hooks queue table/id payloads; Rust applies in one SQLite transaction |
| REQ | HEX-SQLITE-03 | Close flush | 261001-hex Task 2 | COVERED | Tauri close-request listener awaits flush before closing |
| REQ | HEX-SQLITE-04 | Missing-path recovery | 261001-hex Task 2 | COVERED | Missing path sets recovery state; no silent create or overwrite |
| REQ | HEX-GITHUB-01 | GitHub auto-sync by interval or fixed daily local time | 261001-hex Task 3 | COVERED | Scheduler supports interval minutes and daily HH:mm local time |
| REQ | HEX-GITHUB-02 | Dirty-only GitHub sync | 261001-hex Task 3 | COVERED | Dirty marker gates push; manual/auto success clears dirty state |
| REQ | HEX-GITHUB-03 | Missed-run catch-up | 261001-hex Task 3 | COVERED | Due calculator runs one catch-up when app/credentials return and dirty data exists |
| REQ | HEX-SAFE-01 | Preserve secret handling and IndexedDB source of truth | 261001-hex Tasks 2-3 | COVERED | PAT/passphrase remain GitHubAuthContext memory-only; IndexedDB remains runtime store |
| CONTEXT | locked-scope | User confirmed all listed scenarios; no deferral | 261001-hex | COVERED | Plan covers all listed scenarios without reducing scope |
| RESEARCH | none | No research artifact in quick task | 261001-hex | N/A | Package checkpoint covers new Cargo crates |
</source_audit>

<package_legitimacy_gate>
New direct Cargo crates are required because Rust stdlib and current dependencies do not provide SQLite access or native save/open file dialogs.

| Package | Ecosystem | Purpose | Status | Gate |
|---|---|---|---|---|
| rusqlite | cargo | SQLite file access with bundled SQLite for Windows/macOS builds | ASSUMED | Task 1 blocking-human verification before Cargo.toml edit |
| rfd | cargo | Native file dialog for user-selected SQLite path without adding npm dialog plugin | ASSUMED | Task 1 blocking-human verification before Cargo.toml edit |
</package_legitimacy_gate>

<tasks>

<task type="checkpoint:human-verify" gate="blocking-human">
  <name>Task 1: Verify Cargo package legitimacy before adding SQLite/dialog crates</name>
  <files>src-tauri/Cargo.toml</files>
  <what-built>No code built yet. This gate approves direct Cargo crates needed for SQLite file persistence.</what-built>
  <action>Open crates.io pages for `rusqlite` and `rfd`. Confirm each package name, repository link, download history, maintenance signal, and absence of typosquatting indicators. Approve only those two direct crates. Do not approve any npm package for this task because path selection is handled by Rust `rfd` through existing Tauri `invoke`.</action>
  <how-to-verify>
    1. Visit `https://crates.io/crates/rusqlite` and confirm package is the known SQLite binding crate.
    2. Visit `https://crates.io/crates/rfd` and confirm package is the known Rust native file dialog crate.
    3. If either page looks suspicious or unavailable, stop execution and report package legitimacy failure.
  </how-to-verify>
  <verify>
    <automated>MISSING — blocking-human package legitimacy gate must be approved before modifying src-tauri/Cargo.toml</automated>
  </verify>
  <resume-signal>Type "approved" after both crates pass legitimacy check, or describe the suspicious package.</resume-signal>
  <done>Human approved direct Cargo crates `rusqlite` and `rfd` before any package manifest change.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add Tauri SQLite file persistence, row autosave, close flush, and missing-path recovery</name>
  <files>src-tauri/Cargo.toml, src-tauri/src/lib.rs, src-tauri/src/sqlite_persistence.rs, src/services/localSqlitePersistence.ts, src/hooks/useLocalSqlitePersistence.ts, src/components/settings/LocalSqlitePersistenceCard.tsx, src/components/shell/AppShell.tsx, src/views/SettingsView.tsx, tests/services/localSqlitePersistence.test.ts, tests/components/settings/LocalSqlitePersistenceCard.test.tsx</files>
  <behavior>
    - Test 1: configuring a selected SQLite path initializes a SQLite file and stores `tauri_sqlite_path`, `tauri_sqlite_enabled`, and `tauri_sqlite_last_flush_at` settings without storing GitHub token/passphrase.
    - Test 2: creating/updating/deleting exported Dexie domain rows queues row-level changes keyed by `tableName` and `rowId`; flush sends only queued row changes to Tauri and clears queue after success.
    - Test 3: `sqlite_apply_changes` on the Rust side upserts/deletes rows in one transaction and persists payload JSON by table/id, not a whole backup file blob.
    - Test 4: Tauri close-request waits for `flushLocalSqliteNow()` before native close proceeds.
    - Test 5: missing configured path sets `tauri_sqlite_missing_path` and visible recovery state; it does not create a new file, clear IndexedDB, or overwrite local data.
  </behavior>
  <action>After Task 1 approval, add `rusqlite` with bundled SQLite support and `rfd` to `src-tauri/Cargo.toml`. Create `src-tauri/src/sqlite_persistence.rs` with serde structs for SQLite records/changes/errors and Tauri commands `select_sqlite_path`, `sqlite_file_status`, `sqlite_init`, `sqlite_apply_changes`, and `sqlite_read_rows`. Use one SQLite table for row persistence keyed by `(table_name, row_id)` plus metadata table; apply queued changes inside one rusqlite transaction; represent deletes as tombstones or physical deletes consistently, with `sqlite_read_rows` excluding deleted rows. Return typed error code `SQLITE_PATH_MISSING` when a previously configured path is gone, and never recreate missing files unless `sqlite_init` is called after an explicit user path selection.

Update `src-tauri/src/lib.rs` to register these commands with `tauri::generate_handler` while preserving `tauri_plugin_notification::init()`. In `src/services/localSqlitePersistence.ts`, implement Tauri `invoke` wrappers, exported domain table list matching `exportBackupPayload` (`projects`, `milestones`, `tasks`, `capacityRules`, `capacityOverrides`, `plannedAllocations`, `workSessions`), local SQLite table list including runtime tables needed for desktop persistence (`settings`, `backupMetadata`, `activeTimers`), queue/debounce logic, `flushLocalSqliteNow`, `selectAndConfigureSqlitePath`, and `hydrateDexieFromSqlite`. Exclude GitHub PAT and passphrase because they only live in `GitHubAuthContext`; do not add any localStorage/sessionStorage secret persistence. Mark `github_auto_sync_dirty_since` only for exported domain tables, not for settings-only changes.

Create `src/hooks/useLocalSqlitePersistence.ts` to attach Dexie table hooks once under React StrictMode, enqueue row changes after transactions settle, flush on debounce, flush on `pagehide`, and in Tauri use close-request interception to await `flushLocalSqliteNow()` before closing. Add missing-path handling: when a flush/read returns `SQLITE_PATH_MISSING`, set settings `tauri_sqlite_missing_path=true`, keep queued dirty state, stop autosave attempts until user reselects/creates a path, and show recovery UI. Create `LocalSqlitePersistenceCard` in Settings data tab with path/status, select/create path button, flush-now button, and restore-from-file button that requires explicit confirmation when local Dexie already has domain rows. Mount `useLocalSqlitePersistence()` in `AppShellInner` so it runs globally after providers are available.</action>
  <verify>
    <automated>npx vitest run tests/services/localSqlitePersistence.test.ts tests/components/settings/LocalSqlitePersistenceCard.test.tsx && cargo test --manifest-path src-tauri/Cargo.toml && npm run build</automated>
  </verify>
  <done>User can select a SQLite path in Settings, row-level Dexie changes autosave transactionally to SQLite, Tauri close flushes queued writes, missing paths show recovery without data loss, and tests/build pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Add dirty-only GitHub auto-sync scheduler with interval/daily modes and catch-up</name>
  <files>src/hooks/useGitHubAutoSync.ts, src/components/settings/GitHubSyncCard.tsx, src/components/shell/AppShell.tsx, src/services/github/githubSyncService.ts, tests/hooks/useGitHubAutoSync.test.tsx, tests/components/settings/GitHubSyncCard.test.tsx, tests/services/github/githubSyncService.test.ts</files>
  <behavior>
    - Test 1: interval mode is due when `github_auto_sync_last_run_at + intervalMinutes <= now`, and not due before then.
    - Test 2: daily mode is due when local HH:mm scheduled time has passed and no successful run exists for that scheduled occurrence.
    - Test 3: missed-run catch-up returns due on app startup when dirty data exists and last scheduled interval/daily run was missed while app was closed or credentials were absent.
    - Test 4: scheduler does not call `executeGitHubBackupPush` when `github_auto_sync_dirty_since` is absent, even if schedule is due.
    - Test 5: successful manual or automatic GitHub push writes `last_synced_sha`, `last_synced_at`, `github_auto_sync_last_run_at`, clears `github_auto_sync_dirty_since`, and keeps token/passphrase out of persisted settings.
  </behavior>
  <action>Create `src/hooks/useGitHubAutoSync.ts` with pure `computeGitHubAutoSyncDue(settings, now)` and hook `useGitHubAutoSync({ db })`. Settings keys: `github_auto_sync_enabled`, `github_auto_sync_mode` (`interval` or `daily`), `github_auto_sync_interval_minutes`, `github_auto_sync_daily_time` (`HH:mm` local time), `github_auto_sync_last_run_at`, `github_auto_sync_last_attempt_at`, `github_auto_sync_missed_due_at`, `github_auto_sync_last_error`, and `github_auto_sync_dirty_since`. Use local Date math and persisted ISO strings. Scheduler runs on mount, credentials/config/settings changes, and a 60-second interval. It exits early unless auto-sync enabled, owner/repo configured, token/passphrase present in `GitHubAuthContext`, schedule due, and `github_auto_sync_dirty_since` exists. Before push, call `flushLocalSqliteNow()` so local file persistence is not behind the remote encrypted backup. Then call `executeGitHubBackupPush(db, config, token, passphrase, lastSyncedSha, false)`. Serialize runs with an in-flight ref to prevent overlapping pushes.

Extend `executeGitHubBackupPush` success metadata transaction to clear `github_auto_sync_dirty_since`, write `github_auto_sync_last_run_at`, clear `github_auto_sync_missed_due_at`, and record `github_auto_sync_last_error` only on failure paths handled by scheduler. Preserve existing conflict behavior: conflicts still open GitHub conflict modal for manual pushes; auto-sync records the error and does not force overwrite. Update `GitHubSyncCard.tsx` to add auto-sync controls inside the existing card: enable switch, mode selector, interval minutes input, daily local time input, status line showing dirty/missed/last auto-sync state, and save action writing only schedule settings. Keep existing manual push/pull/test buttons working. Mount `useGitHubAutoSync()` in `AppShellInner` next to existing notification/timer hooks so scheduling runs while app shell is active.</action>
  <verify>
    <automated>npx vitest run tests/hooks/useGitHubAutoSync.test.tsx tests/components/settings/GitHubSyncCard.test.tsx tests/services/github/githubSyncService.test.ts && npm run build</automated>
  </verify>
  <done>GitHub auto-sync supports interval and local daily HH:mm schedules, runs catch-up after missed due times, pushes only dirty exported domain data, clears dirty state after success, and never persists PAT/passphrase.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|---|---|
| React/Dexie -> Tauri invoke | Untrusted renderer data crosses into Rust command handlers for SQLite path and row writes |
| Tauri Rust -> Local filesystem | Rust opens user-selected SQLite path and writes planner data to disk |
| App session -> GitHub Contents API | Existing encrypted backup upload sends encrypted payload over network when credentials are session-present |
| Package manifest -> Cargo registry | New direct Cargo dependencies enter native build supply chain |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|---|---|---|---|---|
| T-HEX-01 | Tampering | sqlite_apply_changes | mitigate | Validate table names against allowlist, validate row_id non-empty, parse payload JSON before SQLite write, and apply all queued changes inside one SQLite transaction |
| T-HEX-02 | Information Disclosure | Local SQLite file | mitigate | Never serialize GitHub PAT or passphrase; show Settings copy that SQLite file is local plaintext planner data controlled by user-selected path |
| T-HEX-03 | Denial of Service | Autosave queue | mitigate | Debounce flushes, coalesce by table/id, serialize in-flight flushes, and keep pending queue bounded by replacing older same-row changes |
| T-HEX-04 | Tampering | Missing-path recovery | mitigate | Return `SQLITE_PATH_MISSING`; do not silently recreate missing configured file or overwrite local IndexedDB; require explicit user path reselect/create action |
| T-HEX-05 | Repudiation | GitHub auto-sync | mitigate | Persist last attempt/run/error timestamps and keep existing backupMetadata audit log from `executeGitHubBackupPush` |
| T-HEX-06 | Elevation of Privilege | Tauri filesystem access | mitigate | Do not add shell/fs plugins; only Rust command writes the exact user-selected SQLite path and validates parent/path status |
| T-HEX-07 | Information Disclosure | GitHub auto-sync | mitigate | Reuse existing AES-GCM encrypted backup path and session-only credentials; auto-sync never stores token/passphrase in settings, SQLite, localStorage, sessionStorage, or logs |
| T-HEX-SC | Tampering | Cargo dependency install | mitigate | Task 1 blocking-human checkpoint verifies `rusqlite` and `rfd` legitimacy before Cargo.toml changes |
</threat_model>

<verification>
Automated verification commands:
- `npx vitest run tests/services/localSqlitePersistence.test.ts tests/components/settings/LocalSqlitePersistenceCard.test.tsx`
- `npx vitest run tests/hooks/useGitHubAutoSync.test.tsx tests/components/settings/GitHubSyncCard.test.tsx tests/services/github/githubSyncService.test.ts`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `npm run build`

Manual verification after implementation:
1. Run `npm run tauri:dev`.
2. Open Settings -> Sao lưu & Dữ liệu.
3. Select/create a SQLite file path and confirm status shows connected.
4. Edit one task, close desktop window, reopen, and confirm no queued SQLite error appears.
5. Rename or move the SQLite file, reopen app, and confirm missing-path recovery appears without clearing local IndexedDB data.
6. Enable GitHub auto-sync interval or daily local time with session token/passphrase present, change a task, and confirm next due run pushes only after dirty marker exists.
</verification>

<success_criteria>
- Tauri Settings data tab can select and display a local SQLite file path.
- SQLite file stores one row per persisted Dexie row with table/id keys and transactional apply behavior.
- Close-request flush completes before Tauri window closes.
- Missing SQLite path recovery is explicit and non-destructive.
- GitHub auto-sync supports interval minutes and daily local HH:mm schedule.
- Auto-sync is dirty-only and missed due times catch up once when app/credentials return.
- GitHub token and passphrase remain memory-only.
- Listed Vitest, Cargo, and build checks pass.
</success_criteria>

<output>
Create `.planning/quick/261001-hex-add-tauri-local-sqlite-file-persistence-/261001-hex-SUMMARY.md` when done.
</output>
