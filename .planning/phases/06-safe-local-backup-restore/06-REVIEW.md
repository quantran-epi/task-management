---
phase: 06-safe-local-backup-restore
reviewed: 2026-09-27T16:25:00Z
depth: standard
files_reviewed: 22
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
  critical: 0
  warning: 5
  info: 4
  total: 9
status: issues_found
---

# Phase 06: Code Review Report

**Reviewed:** 2026-09-27T16:25:00Z
**Depth:** standard
**Files Reviewed:** 22
**Status:** issues_found

## Summary

Code review completed for Phase 06 Safe Local Backup & Restore following the 06-03 gap closure plan.

CR-01 (downloaded snapshot failing re-import) and prior IN-01 (invalid `orientation` prop on `Space`) have been resolved. Downloaded snapshots are now wrapped in a valid `BackupEnvelope` and verified via automated test coverage. All 278 project tests pass and TypeScript emits zero type errors.

Zero Critical/Blocker issues remain. Five WARNINGs and four INFO items are noted regarding post-restore UI synchronization, transaction boundaries, metadata log pollution affecting "last backup" display, screen reader announcement idempotency, and duplicate-key validation gaps.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: Post-Restore Banner Disconnected From Snapshot Lifecycle

**File:** `src/views/SettingsView.tsx:37-67, 119-125`
**Issue:** `showPostRestoreBanner` is managed via local boolean state (`useState(false)`). When a restore completes, the banner displays "Hoàn tác về bản trước đó" and "Tải snapshot về máy". If the user scrolls down and performs a rollback via `SnapshotRollbackCard`, the snapshot is deleted from `settings`. However, `showPostRestoreBanner` remains `true`. Clicking the banner's rollback or download buttons then triggers unhandled error notifications ("Không tìm thấy bản snapshot an toàn để hoàn tác"). Furthermore, reloading or navigating away dismisses the banner prematurely even if a snapshot is still available.
**Fix:**
Derive banner visibility from snapshot presence in Dexie via `useLiveQuery` on `settings.last_pre_import_snapshot`, or dismiss the banner when rollback occurs:

```typescript
const snapshotSetting = useLiveQuery(
  () => db.settings.get('last_pre_import_snapshot'),
  [db]
);
const hasSnapshot = Boolean(snapshotSetting?.value);

// In render:
{showPostRestoreBanner && hasSnapshot && (
  <PostRestoreBanner
    onRollback={handleBannerRollback}
    onDownloadSnapshot={handleBannerDownload}
    onClose={() => setShowPostRestoreBanner(false)}
  />
)}
```

### WR-02: Non-Atomic Snapshot Read Outside Transaction in `rollbackToSnapshot`

**File:** `src/services/backup/restoreBackup.ts:118-125`
**Issue:** `targetDb.settings.get('last_pre_import_snapshot')` is executed before starting the Dexie readwrite transaction. If concurrent actions (e.g. multi-tab events or rapid user interaction) modify `settings`, rollback may operate on stale data or throw an unhandled error outside the transaction boundary.
**Fix:**
Move the snapshot read inside the readwrite transaction block:

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
      const rollbackTime = new Date().toISOString();

      await Promise.all([
        targetDb.projects.clear(),
        targetDb.milestones.clear(),
        targetDb.tasks.clear(),
        targetDb.capacityRules.clear(),
        targetDb.capacityOverrides.clear(),
        targetDb.plannedAllocations.clear(),
      ]);

      if (snapshot.tables.projects.length) await targetDb.projects.bulkAdd(snapshot.tables.projects);
      if (snapshot.tables.milestones.length) await targetDb.milestones.bulkAdd(snapshot.tables.milestones);
      if (snapshot.tables.tasks.length) await targetDb.tasks.bulkAdd(snapshot.tables.tasks);
      if (snapshot.tables.capacityRules.length) await targetDb.capacityRules.bulkAdd(snapshot.tables.capacityRules);
      if (snapshot.tables.capacityOverrides.length) await targetDb.capacityOverrides.bulkAdd(snapshot.tables.capacityOverrides);
      if (snapshot.tables.plannedAllocations.length) await targetDb.plannedAllocations.bulkAdd(snapshot.tables.plannedAllocations);

      await targetDb.settings.delete('last_pre_import_snapshot');

      const totalCount = Object.values(snapshot.counts).reduce((sum, n) => sum + n, 0);
      await targetDb.backupMetadata.add({
        id: generateId(),
        timestamp: rollbackTime,
        appVersion: '0.1.0',
        recordCount: totalCount,
      });

      return { success: true, totalRestored: totalCount };
    }
  );
}
```

### WR-03: Restore and Rollback Operations Corrupt "Last Backup" Time Display

**File:** `src/services/backup/restoreBackup.ts:98-104, 173-179` and `src/components/settings/BackupExportCard.tsx:23-25`
**Issue:** `restoreBackupPayload` and `rollbackToSnapshot` log entries into `backupMetadata`. In `BackupExportCard`, `lastBackup` queries the most recent record from `backupMetadata`. Consequently, restoring or rolling back overwrites "Lần sao lưu gần nhất" (Last backup time) with the restore time, misleading the user into thinking an export backup was taken when only an import/rollback occurred.
**Fix:**
Either add an `operationType: 'export' | 'restore' | 'rollback'` discriminator to `BackupMetadata` and filter `BackupExportCard` by `'export'`, or reserve `backupMetadata` strictly for user export operations.

### WR-04: Consecutive Identical Announcements Silently Ignored by Screen Readers

**File:** `src/components/common/AriaLiveRegion.tsx:18-50`
**Issue:** `setAnnouncement(msg)` skips DOM re-rendering when `msg === prevMsg` due to React state equality bail-out (`Object.is`). Screen readers only announce changes when DOM child nodes inside `[aria-live="polite"]` mutate. When the same action is triggered consecutively (such as repeated exports or identical validation warnings), assistive technologies remain completely silent.
**Fix:**
Clear announcement briefly before setting new message, or append a zero-width space / toggle token to guarantee DOM mutation:

```typescript
export const AriaLiveRegion: React.FC = () => {
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    let timer: NodeJS.Timeout;
    const handler: Listener = (msg) => {
      setAnnouncement('');
      timer = setTimeout(() => setAnnouncement(msg), 50);
    };
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
      clearTimeout(timer);
    };
  }, []);
```

### WR-05: Unchecked Duplicate IDs and Unique Constraints in `validateBackupPayload`

**File:** `src/services/backup/validateBackup.ts:87-185`
**Issue:** `validateBackupPayload` does not check for duplicate primary keys (`id`) within any table array, nor does it check for duplicate `dayOfWeek` in `capacityRules` (which has a unique constraint `&dayOfWeek` in Dexie `SCHEMA_V1`). If a file with duplicate keys is imported, `validateBackupPayload` reports `valid: true`. The user enters `RESTORE` in `ImportPreviewModal`, and only then does the operation fail with an unexpected Dexie `ConstraintError` bulk add exception.
**Fix:**
Add primary key and unique key validation in Stage 2/3 of `validateBackupPayload`:

```typescript
const seenProjectIds = new Set<string>();
for (const p of projects) {
  if (seenProjectIds.has(p.id)) {
    errors.push({ table: 'projects', recordId: p.id, field: 'id', message: `Duplicate primary key: ${p.id}` });
  }
  seenProjectIds.add(p.id);
}

const seenDays = new Set<number>();
for (const rule of capacityRules) {
  if (seenDays.has(rule.dayOfWeek)) {
    errors.push({ table: 'capacityRules', recordId: rule.id, field: 'dayOfWeek', message: `Duplicate capacity rule dayOfWeek: ${rule.dayOfWeek}` });
  }
  seenDays.add(rule.dayOfWeek);
}
```

## Info

### IN-01: Empty Error Table on Null/Falsy Payload in `ImportPreviewModal`

**File:** `src/components/settings/ImportPreviewModal.tsx:59-64`
**Issue:** Early return `if (!payload) return { valid: false, errors: [] };` results in an empty error table with "No data". `validateBackupPayload(payload)` already handles falsy input with a descriptive envelope error.
**Fix:** Pass `payload` directly to `validateBackupPayload(payload)` without early return.

### IN-02: Missing `reader.onerror` Handler in `BackupImportCard`

**File:** `src/components/settings/BackupImportCard.tsx:40-57`
**Issue:** `reader.readAsText(file)` registers `reader.onload` but lacks `reader.onerror`. Transient I/O or file permission errors cause silent failures without user notification.
**Fix:** Add `reader.onerror` callback displaying `notification.error`.

### IN-03: Non-Integer `schemaVersion` Edge Case in `validateBackupPayload`

**File:** `src/services/backup/validateBackup.ts:50-60`
**Issue:** Comparison `candidate.schemaVersion > CURRENT_SCHEMA_VERSION || candidate.schemaVersion < 1` evaluates to `false` if `schemaVersion` is `NaN`.
**Fix:** Use `!Number.isInteger(candidate.schemaVersion)` before boundary check.

### IN-04: Non-Transactional Reads in `exportBackupPayload`

**File:** `src/services/backup/exportBackup.ts:30-44`
**Issue:** Six table reads execute via parallel `targetDb.<table_name>.toArray()` calls outside an explicit read transaction. In concurrent multi-tab scenarios, reads may reflect differing points in time.
**Fix:** Wrap the 6 queries inside `targetDb.transaction('r', [...], async () => { ... })`.

---

_Reviewed: 2026-09-27T16:25:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
