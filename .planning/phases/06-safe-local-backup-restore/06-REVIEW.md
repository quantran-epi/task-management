---
phase: 06-safe-local-backup-restore
reviewed: 2026-09-27T16:00:00Z
depth: standard
files_reviewed: 21
files_reviewed_list:
  - src/components/common/AriaLiveRegion.tsx
  - src/components/settings/BackupExportCard.tsx
  - src/components/settings/BackupImportCard.tsx
  - src/components/settings/ImportPreviewModal.tsx
  - src/components/settings/PostRestoreBanner.tsx
  - src/components/settings/SnapshotRollbackCard.tsx
  - src/components/shell/AppShell.tsx
  - src/services/backup/exportBackup.ts
  - src/services/backup/index.ts
  - src/services/backup/restoreBackup.ts
  - src/services/backup/validateBackup.ts
  - src/types/backup.ts
  - src/validation/backupSchemas.ts
  - src/views/SettingsView.tsx
  - tests/components/common/AriaLiveRegion.test.tsx
  - tests/components/settings/BackupExportCard.test.tsx
  - tests/components/settings/ImportPreviewModal.test.tsx
  - tests/components/settings/SnapshotRollbackCard.test.tsx
  - tests/services/backup/exportBackup.test.ts
  - tests/services/backup/restoreBackup.test.ts
  - tests/services/backup/restoreFailure.test.ts
  - tests/services/backup/validateBackup.test.ts
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
status: issues_found
---

# Phase 06: Code Review Report

**Reviewed:** 2026-09-27T16:00:00Z  
**Depth:** standard  
**Files Reviewed:** 21  
**Status:** issues_found  

## Summary

Code review completed for Phase 06 Safe Local Backup & Restore. Implementation delivers atomic Dexie transactions, strict Zod schemas, two-stage validation with referential integrity checks, accessible live region announcements, and preview modals.

One BLOCKER defect discovered: `downloadSnapshotFile` exports raw `SnapshotData` lacking envelope headers (`app`, `schemaVersion`, `exportedAt`), rendering downloaded snapshots un-importable via `BackupImportCard`. Several WARNINGs and quality items identified regarding metadata collisions, uncoordinated post-restore banner state, and transaction boundaries.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Downloaded Snapshot File Fails Backup Validation on Re-Import

**File:** `src/services/backup/restoreBackup.ts:190-194`  
**Issue:** `downloadSnapshotFile` serializes `SnapshotData` directly. `SnapshotData` contains only `timestamp`, `tables`, and `counts`. It lacks `app: 'personal-task-planner'` and `schemaVersion: 1`, and uses `timestamp` instead of `exportedAt`. When a user downloads this snapshot for disaster recovery and later attempts to restore it via `BackupImportCard`, `validateBackupPayload` rejects it with envelope validation errors (`app`, `schemaVersion`, `exportedAt`). The downloaded recovery file cannot be restored.  
**Fix:**
Wrap snapshot into a valid `BackupEnvelope` before serialization:

```typescript
export function downloadSnapshotFile(snapshot: SnapshotData): void {
  const fileName = `task-planner-snapshot-${snapshot.timestamp.replace(/[:.]/g, '-')}.json`;
  const envelope: BackupEnvelope = {
    app: APP_MARKER,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: snapshot.timestamp,
    tables: snapshot.tables,
    counts: snapshot.counts,
  };
  const content = JSON.stringify(envelope, null, 2);
  triggerDownload(content, fileName);
}
```

## Warnings

### WR-01: Post-Restore Banner Disconnect From Snapshot Lifecycle

**File:** `src/views/SettingsView.tsx:37-67`  
**Issue:** `showPostRestoreBanner` is stored as an uncoordinated component state boolean (`useState(false)`). If a user restores data and then rolls back via `SnapshotRollbackCard`, the banner remains visible. Clicking "Hoàn tác về bản trước đó" on the banner then throws an error because the snapshot was already deleted. Additionally, navigating between tabs or views drops the banner even when a snapshot is still available.  
**Fix:**
Derive banner visibility from snapshot presence or pass a callback from `SnapshotRollbackCard` to hide the banner when rolled back, or track snapshot existence reactively.

### WR-02: Non-Atomic Snapshot Read in `rollbackToSnapshot`

**File:** `src/services/backup/restoreBackup.ts:118-124`  
**Issue:** `rollbackToSnapshot` reads `targetDb.settings.get('last_pre_import_snapshot')` outside of the Dexie transaction. If a race condition or concurrent tab action mutates settings before the transaction starts, rollback may fail or operate on stale state.  
**Fix:**
Move the snapshot read inside the transaction block:

```typescript
export async function rollbackToSnapshot(
  targetDb: TaskPlannerDatabase = defaultDb
): Promise<{ success: boolean; totalRestored: number }> {
  return await targetDb.transaction(
    'rw',
    [
      targetDb.projects,
      targetDb.milestones,
      targetDb.tasks,
      targetDb.capacityRules,
      targetDb.capacityOverrides,
      targetDb.plannedAllocations,
      targetDb.settings,
      targetDb.backupMetadata,
    ],
    async () => {
      const snapshotSetting = await targetDb.settings.get('last_pre_import_snapshot');
      if (!snapshotSetting || !snapshotSetting.value) {
        throw new Error('Không tìm thấy bản snapshot an toàn để hoàn tác');
      }
      const snapshot = snapshotSetting.value as SnapshotData;
      // ... clear domain tables and bulk add
    }
  );
}
```

### WR-03: Restore and Rollback Operations Corrupt "Last Backup" Time Display

**File:** `src/services/backup/restoreBackup.ts:99-104, 174-179` and `src/components/settings/BackupExportCard.tsx:23-25`  
**Issue:** Both `restoreBackupPayload` and `rollbackToSnapshot` write records to `backupMetadata`. In `BackupExportCard`, `lastBackup` queries the most recent record from `backupMetadata`. Consequently, restoring or rolling back sets "Lần sao lưu gần nhất" to the restore time, misleading the user into thinking an export was taken when none was created.  
**Fix:**
Omit restore/rollback entries from `backupMetadata`, or add an `operationType: 'export' | 'restore' | 'rollback'` discriminator and filter `BackupExportCard` queries to `'export'`.

### WR-04: Consecutive Identical Announcements Silently Ignored by Screen Readers

**File:** `src/components/common/AriaLiveRegion.tsx:18-50`  
**Issue:** React state setter `setAnnouncement(msg)` bails out if `msg === prevMsg`. Screen readers monitor DOM mutations within `[aria-live="polite"]`. When the same action is triggered twice (e.g. repeated exports or consecutive notifications with identical copy), no DOM mutation occurs and assistive tech remains silent.  
**Fix:**
Clear announcement briefly via `setTimeout` or toggle counter suffix so consecutive messages always trigger a DOM text update.

## Info

### IN-01: Invalid `orientation` Prop on Ant Design `Space`

**File:** `src/components/settings/SnapshotRollbackCard.tsx:108`  
**Issue:** `<Space direction="vertical" orientation="horizontal">` passes `orientation`. `orientation` belongs to Ant Design `Divider`, not `Space`.  
**Fix:** Remove `orientation="horizontal"`.

### IN-02: Empty Error Table on Null/Falsy Payload in `ImportPreviewModal`

**File:** `src/components/settings/ImportPreviewModal.tsx:59-64`  
**Issue:** Short-circuiting `if (!payload) return { valid: false, errors: [] }` bypasses `validateBackupPayload(payload)`, displaying an empty error table (0 items) with no diagnostic message. `validateBackupPayload` already provides a descriptive error for invalid/falsy payloads.  
**Fix:** Pass `payload` directly to `validateBackupPayload(payload)`.

### IN-03: Missing `reader.onerror` Handler in `BackupImportCard`

**File:** `src/components/settings/BackupImportCard.tsx:40-57`  
**Issue:** If `FileReader` fails due to browser/OS I/O error or permission failure, no error handler exists and the UI hangs silently without notifying the user.  
**Fix:** Attach `reader.onerror` with a notification explaining the file read failed.

---

_Reviewed: 2026-09-27T16:00:00Z_  
_Reviewer: Claude (gsd-code-reviewer)_  
_Depth: standard_
