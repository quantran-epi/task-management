# Phase 6: Safe Local Backup & Restore - Context

**Gathered:** 2026-09-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 6 delivers safe, offline-first local backup export and restore capabilities. It allows the user to download a complete, versioned JSON backup of all domain data, inspect and validate incoming backup files before applying changes, protect existing data with an automatic pre-import safety snapshot, and atomically restore data with explicit confirmation and screen-reader accessibility announcements.

Requirements covered: BACK-01, BACK-02, BACK-03, BACK-04, BACK-05, UX-04.

</domain>

<decisions>
## Implementation Decisions

### Backup Envelope & Format
- **D-01:** Standard Envelope schema:
  - JSON payload structured with standard envelope:
    ```ts
    {
      app: 'personal-task-planner',
      schemaVersion: 1,
      exportedAt: string, // ISO 8601 timestamp
      tables: {
        projects: Project[],
        milestones: Milestone[],
        tasks: Task[],
        capacityRules: CapacityRule[],
        capacityOverrides: CapacityOverride[],
        plannedAllocations: PlannedAllocation[]
      },
      counts: {
        projects: number,
        milestones: number,
        tasks: number,
        capacityRules: number,
        capacityOverrides: number,
        plannedAllocations: number
      }
    }
    ```
  - Allows fast inspection of app identity, schema version, and record counts prior to deep parsing.
- **D-02:** Domain Data Only:
  - Backup exports only the 6 core business domain tables: `projects`, `milestones`, `tasks`, `capacityRules`, `capacityOverrides`, `plannedAllocations`.
  - Excludes ephemeral browser UI preferences (e.g. `themeMode` in `settings`) and `backupMetadata` to prevent overwriting device-specific client settings.
- **D-03:** Timestamped Download Naming Convention:
  - Exported backup file is named `task-planner-backup-YYYY-MM-DD-HHmmss.json` (e.g., `task-planner-backup-2026-09-27-143000.json`).
  - Ensures unique file names when downloading multiple backups on the same day.
- **D-04:** Export History Logging:
  - Successful exports write an entry to the `backupMetadata` table (`id: UUID, timestamp: ISO, appVersion: string, recordCount: number`) to show "Lần sao lưu gần nhất" in the Settings view.

### Import Preview & Validation
- **D-05:** Modal with Comparison Table:
  - Selecting a backup file opens an Ant Design `Modal` displaying:
    - Envelope metadata: App marker, schema version, export timestamp.
    - Comparison table: Columns `[Bảng dữ liệu]` | `[Hiện tại trong máy]` | `[Tệp nhập vào]` | `[Chênh lệch (+/-)]`.
  - Core architecture note: Backup generation, schema validation, and restore execution logic must be written as pure, headless service/utility functions (`exportBackupPayload`, `validateBackupPayload`, `restoreBackupPayload`) without tight UI coupling. This ensures they can be reused directly for background/automated sync in Phase 8. Manual file import is treated as the reliable fallback when automatic sync is unavailable.
- **D-06:** Strict All-or-Nothing Validation:
  - Strict validation using Zod schemas for all table records (IDs, calendar dates, status/priority enums, minute ranges, string length constraints).
  - Referential integrity validation:
    - `milestone.projectId` must exist in `projects`.
    - `task.projectId` (if defined) must exist in `projects`.
    - `task.milestoneId` (if defined) must exist in `milestones`.
    - `plannedAllocation.taskId` must exist in `tasks`.
  - Any single structural or referential error completely aborts the restore process before touching IndexedDB.
  - Modal displays a detailed error list (Table name, Record ID, invalid field name, failure description) so user can diagnose issues.
- **D-07:** Strict App Marker & Version Migration:
  - If `app !== 'personal-task-planner'`, immediately reject with error "Tệp không phải bản sao lưu của ứng dụng này".
  - If `schemaVersion > CURRENT_VERSION`, reject with error instructing user to update the app.
  - If `schemaVersion < CURRENT_VERSION`, route through schema migration functions.
- **D-08:** Dragger + File Picker with 50MB Cap:
  - Uses Ant Design `Upload.Dragger` combined with a standard file picker button accepting `.json` files up to 50MB.
  - Automatically parses JSON and triggers validation immediately upon file selection.

### Snapshot & Rollback Flow
- **D-09:** Local Snapshot in IndexedDB + Optional Download:
  - Before applying destructive replacement, an exact snapshot of current local data across all 6 domain tables is taken.
  - Snapshot is saved in IndexedDB (under `settings` key `last_pre_import_snapshot`) so it persists offline without requiring file downloads.
  - The UI also offers an "Tải bản snapshot về máy" action for users who want a physical fallback file.
- **D-10:** Single Latest Snapshot Retention:
  - Retains the single most recent pre-import snapshot (`lastPreImportSnapshot`).
  - Subsequent restores overwrite the previous snapshot, preventing storage bloat while providing instant one-click undo.
- **D-11:** Post-Restore Banner & Settings Card for Rollback:
  - Following a successful restore, displays a prominent Alert banner with actions: "Hoàn tác về bản trước đó" (revert to snapshot) and "Tải tệp snapshot".
  - `SettingsView` features a persistent "Bản sao lưu dự phòng (Snapshot)" card displaying snapshot timestamp and a "Khôi phục từ bản này" button.
- **D-12:** Atomic Dexie Transaction:
  - The entire restore sequence (saving snapshot, clearing 6 domain tables, bulk-adding new records) runs in a single Dexie readwrite (`rw`) transaction across all domain tables + settings.
  - Any write failure or constraint error triggers an automatic IndexedDB transaction abort/rollback, leaving original data completely untouched.

### Confirmation & Status Feedback
- **D-13:** Keyword "RESTORE" Confirmation:
  - To prevent accidental overwrites, the confirm button is disabled until the user types `RESTORE` into a confirmation input (mirroring `ResetDbModal` pattern).
  - Clear danger Alert explains that local data will be replaced and a safety snapshot will be created.
- **D-14:** Reactive Live Update via `useLiveQuery`:
  - No hard page reload (`window.location.reload()`) required.
  - Dexie's `useLiveQuery` automatically detects table updates and reactively updates active views (Dashboard, Tasks, Projects, Planner).
  - An Ant Design `notification.success` displays total records imported and confirms live update.
- **D-15:** Assistive Technology & Status Regions (`aria-live`):
  - In addition to visual Ant Design notifications, maintains an off-screen `aria-live="polite"` status region (`role="status"`, `aria-atomic="true"`) announcing import/export/rollback start, progress, and completion to screen readers (UX-04).
- **D-16:** Two-Tab Layout for `SettingsView`:
  - `SettingsView` is reorganized into two Ant Design `Tabs`:
    - Tab 1: "Công suất làm việc" (`WeeklyCapacityForm`, `OverridesTable`).
    - Tab 2: "Sao lưu & Dữ liệu" (Export Backup button, Import Dragger, Snapshot/Rollback Card, `ResetDbModal` trigger).
  - Prevents excessive page scrolling and cleanly separates daily capacity settings from data management operations.

### Claude's Discretion
- Visual styling of comparison table badges (added, removed, unchanged counts).
- Loading spinners and progress bars during file reading and large bulk writes.
- Exact text formatting for validation error tables and screen reader announcements.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/ROADMAP.md` § Phase 6 — Goals, requirements, and success criteria for Safe Local Backup & Restore.
- `.planning/REQUIREMENTS.md` § Backup and Restore — Requirements BACK-01 through BACK-05, and UX-04.
- `CLAUDE.md` — Core technical stack (React 19, Ant Design 6, Dexie 4, Dayjs, Zod, strict TypeScript).

### Existing Schemas & Repositories
- `src/db/schema.ts` — IndexedDB table names and index definitions.
- `src/db/index.ts` — Dexie database instance and multi-tab concurrency handlers.
- `src/types/models.ts` — TypeScript domain models (`Project`, `Milestone`, `Task`, `CapacityRule`, `CapacityOverride`, `PlannedAllocation`, `Setting`, `BackupMetadata`).
- `src/validation/schemas.ts` — Existing Zod schemas (`ProjectInputSchema`, `TaskInputSchema`, `isValidUuid`, `isValidCalendarDate`, etc.).
- `src/views/SettingsView.tsx` — Current Settings view layout to be updated with two-tab organization.
- `src/components/common/ResetDbModal.tsx` — Keyword confirmation pattern (`confirmText === 'RESET'`).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/validation/schemas.ts`: Existing validation rules for UUIDs, calendar dates, status enums, priority enums, and minute ranges can be composed into full-table backup record validators.
- `src/components/common/ResetDbModal.tsx`: Keyword confirmation input pattern with danger button can be replicated for `RestoreConfirmModal`.
- `src/db/index.ts`: `db.transaction('rw', ...)` can be used directly for atomic multi-table clear and bulkAdd operations.
- `src/utils/date.ts`: `getTodayString`, `isValidCalendarDate` for date formatting and validation.

### Established Patterns
- `useLiveQuery` from `dexie-react-hooks`: UI reacts automatically to database modifications without page reloads.
- Ant Design 6 components: `Modal`, `Table`, `Upload.Dragger`, `Tabs`, `Alert`, `Button`, `notification`.
- Repository pattern in `src/db/repositories/`: Pure async functions wrapping Dexie queries.

### Integration Points
- `src/views/SettingsView.tsx`: Integrate Tab 2 "Sao lưu & Dữ liệu" containing export, import preview, snapshot rollback, and reset DB controls.
- `src/components/shell/AppShell.tsx`: Container for global `aria-live` announcement region or status notifications.
- New backup service: `src/services/backupService.ts` or `src/utils/backup.ts` containing headless `exportBackup`, `validateBackup`, and `restoreBackup` logic.

</code_context>

<specifics>
## Specific Ideas

- The user emphasized: Manual import is a safety fallback when automatic sync is not working. The application should prefer automatic backup and automatic sync (similar to an app with a backend). Core backup logic must be modular and reusable for Phase 8's background/encrypted sync.
- Comparison table during import should clearly show incoming vs current counts with delta chips (`+X`, `-Y`, `=`).

</specifics>

<deferred>
## Deferred Ideas

- **PROD-04 (v2):** Selective merge import — user can choose specific projects/tasks to merge instead of full database overwrite.
- **Phase 8:** Encrypted backup upload and restore via GitHub Contents API.

</deferred>

---

*Phase: 6-Safe Local Backup & Restore*
*Context gathered: 2026-09-27*
