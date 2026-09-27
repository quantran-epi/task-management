---
phase: 06-safe-local-backup-restore
plan: 02
subsystem: backup
tags: [backup, restore, rollback, snapshot, zod, validation, antd, dexie]
dependency_graph:
  requires:
    - src/types/models.ts
    - src/types/backup.ts
    - src/validation/schemas.ts
    - src/services/backup/exportBackup.ts
    - src/db/schema.ts
    - src/db/index.ts
  provides:
    - src/validation/backupSchemas.ts
    - src/services/backup/validateBackup.ts
    - src/services/backup/restoreBackup.ts
    - src/services/backup/index.ts
    - src/components/settings/BackupImportCard.tsx
    - src/components/settings/ImportPreviewModal.tsx
    - src/components/settings/SnapshotRollbackCard.tsx
    - src/components/settings/PostRestoreBanner.tsx
  affects:
    - src/views/SettingsView.tsx
tech_stack:
  added: []
  patterns:
    - Two-stage pure validation engine checking envelope marker, version, structural Zod schemas, and foreign-key referential integrity
    - Atomic Dexie readwrite transaction executing snapshot creation, domain table clearance, bulk addition, and metadata logging
    - Pre-import snapshot persistence in settings table under last_pre_import_snapshot key
    - Ant Design Upload.Dragger dropzone accepting .json files up to 50MB
    - 4-column preview comparison table displaying current vs incoming record counts and delta tags
    - Keyword confirmation modal requiring exact string RESTORE before destructive restore action
    - One-click rollback to pre-import snapshot with user confirmation
    - Accessible status announcements to screen readers via AriaLiveRegion
key_files:
  created:
    - src/validation/backupSchemas.ts
    - src/services/backup/validateBackup.ts
    - src/services/backup/restoreBackup.ts
    - src/services/backup/index.ts
    - src/components/settings/BackupImportCard.tsx
    - src/components/settings/ImportPreviewModal.tsx
    - src/components/settings/SnapshotRollbackCard.tsx
    - src/components/settings/PostRestoreBanner.tsx
    - tests/services/backup/validateBackup.test.ts
    - tests/services/backup/restoreBackup.test.ts
    - tests/services/backup/restoreFailure.test.ts
    - tests/components/settings/ImportPreviewModal.test.tsx
    - tests/components/settings/SnapshotRollbackCard.test.tsx
  modified:
    - src/views/SettingsView.tsx
decisions:
  - Enforced two-stage validation separating structural envelope checks from in-memory referential integrity checks (D-06, D-07)
  - Automatically captured pre-import snapshot of 6 domain tables into settings.last_pre_import_snapshot before any destructive write (D-09, D-10)
  - Bound danger confirm button in ImportPreviewModal to exact keyword RESTORE to prevent accidental triggers (D-13)
  - Wrapped snapshot creation, table clearance, bulk addition, and metadata logging inside a single Dexie readwrite transaction (D-12)
  - Provided immediate post-restore banner with rollback and download snapshot actions (D-11)
metrics:
  duration: 12m
  completed_date: "2026-09-27"
  tasks_completed: 3
  files_created: 13
  files_modified: 1
---

# Phase 06 Plan 02: Safe Local Backup Restore & Rollback Summary

Delivered the complete Safe Import, Restore & Rollback Vertical Slice: built strict Zod schemas for all 6 core domain records, implemented two-stage validation with foreign-key referential integrity checks, built atomic Dexie restore and snapshot rollback services, created BackupImportCard with 50MB JSON limit, implemented ImportPreviewModal with a 4-column comparison table and "RESTORE" keyword gate, built SnapshotRollbackCard and PostRestoreBanner, and integrated everything seamlessly into SettingsView.

## Key Changes

1. **Validation Engine (`src/validation/backupSchemas.ts`, `src/services/backup/validateBackup.ts`)**:
   - Built full Zod record schemas for the 6 domain tables: `BackupProjectRecordSchema`, `BackupMilestoneRecordSchema`, `BackupTaskRecordSchema`, `BackupCapacityRuleRecordSchema`, `BackupCapacityOverrideRecordSchema`, `BackupPlannedAllocationRecordSchema`.
   - Built `validateBackupPayload` performing:
     - Stage 1: Envelope validation (`app === 'personal-task-planner'`, `schemaVersion <= 1`, valid ISO `exportedAt`).
     - Stage 2: Schema validation across all 6 table record arrays, collecting detailed field errors.
     - Stage 3: Referential integrity checks asserting foreign keys (`milestones.projectId` -> `projects`, `tasks.projectId` -> `projects`, `tasks.milestoneId` -> `milestones`, `plannedAllocations.taskId` -> `tasks`).

2. **Atomic Restore & Rollback Services (`src/services/backup/restoreBackup.ts`, `src/services/backup/index.ts`)**:
   - `restoreBackupPayload`: Executes inside a single Dexie `rw` transaction over 8 tables. Captures current records into `settings.last_pre_import_snapshot`, clears the 6 domain tables, bulk adds incoming records, and logs an event in `backupMetadata`. If any error occurs, all changes roll back cleanly.
   - `rollbackToSnapshot`: Restores data from `settings.last_pre_import_snapshot` atomically and deletes the snapshot key.
   - `downloadSnapshotFile`: Downloads the snapshot JSON directly to the user's filesystem as an extra disaster recovery backup.

3. **Import & Comparison Modal (`src/components/settings/BackupImportCard.tsx`, `src/components/settings/ImportPreviewModal.tsx`)**:
   - `BackupImportCard`: Ant Design `Upload.Dragger` dropzone accepting JSON files up to 50MB. Rejects oversized files immediately.
   - `ImportPreviewModal`:
     - Displays envelope metadata (filename, schema version, export date, app marker).
     - Renders 4-column comparison table comparing current count, incoming count, and color-coded delta chips (+ green, - red, 0 grey).
     - Renders structured error table if payload is invalid and blocks confirmation.
     - Enforces typing keyword `RESTORE` to enable danger confirm button.
     - Restores data, displays success notification, and announces status to screen reader via `announceToScreenReader`.

4. **Snapshot Management & Settings Integration (`src/components/settings/SnapshotRollbackCard.tsx`, `src/components/settings/PostRestoreBanner.tsx`, `src/views/SettingsView.tsx`)**:
   - `SnapshotRollbackCard`: Reactive live query reading `last_pre_import_snapshot`. Shows timestamp, record breakdown tags, one-click rollback dialog, and file download action. Shows clean Empty state when no snapshot exists.
   - `PostRestoreBanner`: Alert displayed at the top of SettingsView after successful restore with immediate rollback or download buttons.
   - `SettingsView`: Tab 2 ("Sao lưu & Dữ liệu") mounts `PostRestoreBanner`, `BackupExportCard`, `BackupImportCard`, `SnapshotRollbackCard`, and Danger Zone with `ResetDbModal`.

## Verification

- Automated test suites:
  - `tests/services/backup/validateBackup.test.ts` (envelope checks, Zod schema validation, referential integrity check for projects, milestones, tasks, allocations).
  - `tests/services/backup/restoreBackup.test.ts` (atomic replacement, snapshot creation in settings, bulkAdd into 6 tables, rollback to snapshot).
  - `tests/services/backup/restoreFailure.test.ts` (transaction failure rollback proving original data is untouched).
  - `tests/components/settings/ImportPreviewModal.test.tsx` (comparison table, error list, keyword "RESTORE" gate).
  - `tests/components/settings/SnapshotRollbackCard.test.tsx` (empty state, active snapshot display, rollback and download actions).
  - Full suite passed: 45 test files, 277 passing tests (`npm test`).
  - Strict TypeScript and production bundle passed cleanly (`npm run build`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript strict types for exactOptionalPropertyTypes and unused variables**
- **Found during:** Production build verification (`npm run build`)
- **Issue:** `validateBackupPayload` returned types with optional fields that triggered `exactOptionalPropertyTypes` mismatch with `BackupEnvelope['tables']`; `onClose` in `PostRestoreBanner` could be `undefined`; unused variable warnings in imported AntD types.
- **Fix:** Explicitly cast validated table records to `BackupEnvelope['tables'][...]`; spread `onClose` only when present; removed unused imports.
- **Files modified:** `src/components/settings/BackupImportCard.tsx`, `src/components/settings/ImportPreviewModal.tsx`, `src/components/settings/PostRestoreBanner.tsx`, `src/components/settings/SnapshotRollbackCard.tsx`, `src/services/backup/validateBackup.ts`, `src/views/SettingsView.tsx`, `tests/components/settings/SnapshotRollbackCard.test.tsx`.
- **Commit:** `d06616b`

## Self-Check: PASSED

- Created files exist:
  - `src/validation/backupSchemas.ts`: FOUND
  - `src/services/backup/validateBackup.ts`: FOUND
  - `src/services/backup/restoreBackup.ts`: FOUND
  - `src/services/backup/index.ts`: FOUND
  - `src/components/settings/BackupImportCard.tsx`: FOUND
  - `src/components/settings/ImportPreviewModal.tsx`: FOUND
  - `src/components/settings/SnapshotRollbackCard.tsx`: FOUND
  - `src/components/settings/PostRestoreBanner.tsx`: FOUND
  - `tests/services/backup/validateBackup.test.ts`: FOUND
  - `tests/services/backup/restoreBackup.test.ts`: FOUND
  - `tests/services/backup/restoreFailure.test.ts`: FOUND
  - `tests/components/settings/ImportPreviewModal.test.tsx`: FOUND
  - `tests/components/settings/SnapshotRollbackCard.test.tsx`: FOUND
- Commits exist:
  - `b210cb0`: FOUND
  - `e0db166`: FOUND
  - `182a50a`: FOUND
  - `4f7350e`: FOUND
  - `60458d3`: FOUND
  - `d30c584`: FOUND
  - `d06616b`: FOUND
