---
phase: 06-safe-local-backup-restore
plan: 01
subsystem: backup
tags: [backup, export, json, dexie, a11y, aria-live, antd]
dependency_graph:
  requires:
    - src/types/models.ts
    - src/db/schema.ts
    - src/db/index.ts
  provides:
    - src/types/backup.ts
    - src/services/backup/exportBackup.ts
    - src/components/common/AriaLiveRegion.tsx
    - src/components/settings/BackupExportCard.tsx
  affects:
    - src/views/SettingsView.tsx
    - src/components/shell/AppShell.tsx
tech_stack:
  added: []
  patterns:
    - Standard JSON backup envelope with app marker and schema version
    - Pure headless export service querying 6 core domain tables
    - Native Blob URL generation and download with memory cleanup
    - Global off-screen aria-live polite status region
    - Two-tab Settings view separating capacity from data operations
key_files:
  created:
    - src/types/backup.ts
    - src/services/backup/exportBackup.ts
    - src/components/common/AriaLiveRegion.tsx
    - src/components/settings/BackupExportCard.tsx
    - tests/services/backup/exportBackup.test.ts
    - tests/components/common/AriaLiveRegion.test.tsx
    - tests/components/settings/BackupExportCard.test.tsx
  modified:
    - src/components/shell/AppShell.tsx
    - src/views/SettingsView.tsx
decisions:
  - Excluded settings and backupMetadata tables from exported backup payload to preserve client preferences and prevent token leaks (D-02, T-06-01)
  - Formatted backup file name as task-planner-backup-YYYY-MM-DD-HHmmss.json for deterministic sorting and uniqueness (D-03)
  - Logged export event into backupMetadata table upon each successful export for UI history (D-04)
  - Implemented centralized AriaLiveRegion event dispatcher for accessible screen reader status feedback (D-15, UX-04)
  - Restructured SettingsView into two tabs: 'capacity' (Công suất làm việc) and 'data' (Sao lưu & Dữ liệu) (D-16)
metrics:
  duration: 10m
  completed_date: "2026-09-27"
  tasks_completed: 2
  files_created: 7
  files_modified: 2
---

# Phase 06 Plan 01: Safe Local Backup Export Summary

Delivered the complete Export Vertical Slice for local backup and restore: defined backup envelope and snapshot contracts, implemented headless export service querying the 6 core business tables with download cleanup, established global aria-live screen-reader announcement infrastructure, restructured SettingsView into a two-tab interface, and delivered BackupExportCard with live export history.

## Key Changes

1. **Backup Envelope & Snapshot Types (`src/types/backup.ts`)**:
   - Defined `BackupTableData`, `BackupTableCounts`, `BackupEnvelope`, `ValidationErrorDetail`, `BackupValidationResult`, and `SnapshotData`.
   - Strictly typed the 6 core domain tables: `projects`, `milestones`, `tasks`, `capacityRules`, `capacityOverrides`, `plannedAllocations`.

2. **Headless Export Service (`src/services/backup/exportBackup.ts`)**:
   - `exportBackupPayload`: Queries the 6 domain tables concurrently, structures envelope with `app: 'personal-task-planner'`, `schemaVersion: 1`, and ISO export timestamp. Excludes `settings` and `backupMetadata` per threat model T-06-01.
   - Logs export history record (`id`, `timestamp`, `appVersion: '0.1.0'`, `recordCount`) to `backupMetadata`.
   - `generateBackupFileName`: Generates timestamped pattern `task-planner-backup-YYYY-MM-DD-HHmmss.json`.
   - `triggerDownload`: Creates Blob with `application/json`, triggers synthetic anchor click, and revokes URL object to prevent memory leaks (T-06-02).

3. **Screen Reader Accessibility Infrastructure (`src/components/common/AriaLiveRegion.tsx`)**:
   - Created `AriaLiveRegion` component rendering visually hidden off-screen element with `role="status"`, `aria-live="polite"`, `aria-atomic="true"`.
   - Exported `announceToScreenReader` function to broadcast status messages across app workflows (UX-04).
   - Mounted `AriaLiveRegion` inside root `AppShell.tsx` layout.

4. **Settings View Organization & Export Card (`src/views/SettingsView.tsx`, `src/components/settings/BackupExportCard.tsx`)**:
   - Reorganized `SettingsView` using Ant Design `Tabs` with Tab 1 (`capacity`: "Công suất làm việc") and Tab 2 (`data`: "Sao lưu & Dữ liệu").
   - Built `BackupExportCard` displaying description, dynamic live query for "Lần sao lưu gần nhất" with timestamp and record count, and primary "Xuất bản sao lưu (JSON)" button with download trigger and aria notification.

## Verification

- Automated test suites:
  - `tests/services/backup/exportBackup.test.ts` (filename formatting, envelope structure, exclusion of settings, metadata logging, download trigger).
  - `tests/components/common/AriaLiveRegion.test.tsx` (aria attributes, event subscription, status updates).
  - `tests/components/settings/BackupExportCard.test.tsx` (card rendering, empty state, live metadata display, export trigger, SettingsView tab switching, AppShell aria mount).
  - Full suite passed: 40 test files, 261 passing tests.
  - Production build compiled cleanly with TypeScript strict checks (`npm run build`).

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- Created files exist:
  - `src/types/backup.ts`: FOUND
  - `src/services/backup/exportBackup.ts`: FOUND
  - `src/components/common/AriaLiveRegion.tsx`: FOUND
  - `src/components/settings/BackupExportCard.tsx`: FOUND
  - `tests/services/backup/exportBackup.test.ts`: FOUND
  - `tests/components/common/AriaLiveRegion.test.tsx`: FOUND
  - `tests/components/settings/BackupExportCard.test.tsx`: FOUND
- Commits exist:
  - `257c740`: FOUND
  - `7b46823`: FOUND
  - `bf503ec`: FOUND
  - `10c3cf6`: FOUND
