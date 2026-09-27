# Phase 06: Safe Local Backup & Restore - Research

**Researched:** 2026-09-27  
**Domain:** Offline-first Data Backup, Strict Zod Schema & Referential Validation, Atomic IndexedDB Restore, Safety Snapshots, Accessibility Announcements  
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Standard Envelope schema:
  JSON payload structured with standard envelope:
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
  Allows fast inspection of app identity, schema version, and record counts prior to deep parsing.
- **D-02:** Domain Data Only:
  Backup exports only the 6 core business domain tables: `projects`, `milestones`, `tasks`, `capacityRules`, `capacityOverrides`, `plannedAllocations`.
  Excludes ephemeral browser UI preferences (e.g. `themeMode` in `settings`) and `backupMetadata` to prevent overwriting device-specific client settings.
- **D-03:** Timestamped Download Naming Convention:
  Exported backup file is named `task-planner-backup-YYYY-MM-DD-HHmmss.json` (e.g., `task-planner-backup-2026-09-27-143000.json`).
  Ensures unique file names when downloading multiple backups on the same day.
- **D-04:** Export History Logging:
  Successful exports write an entry to the `backupMetadata` table (`id: UUID, timestamp: ISO, appVersion: string, recordCount: number`) to show "Lần sao lưu gần nhất" in the Settings view.
- **D-05:** Modal with Comparison Table:
  Selecting a backup file opens an Ant Design `Modal` displaying:
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
  Uses Ant Design `Upload.Dragger` combined with a standard file picker button accepting `.json` files up to 50MB. Automatically parses JSON and triggers validation immediately upon file selection.
- **D-09:** Local Snapshot in IndexedDB + Optional Download:
  - Before applying destructive replacement, an exact snapshot of current local data across all 6 domain tables is taken.
  - Snapshot is saved in IndexedDB (under `settings` key `last_pre_import_snapshot`) so it persists offline without requiring file downloads.
  - The UI also offers an "Tải bản snapshot về máy" action for users who want a physical fallback file.
- **D-10:** Single Latest Snapshot Retention:
  Retains the single most recent pre-import snapshot (`lastPreImportSnapshot`). Subsequent restores overwrite the previous snapshot, preventing storage bloat while providing instant one-click undo.
- **D-11:** Post-Restore Banner & Settings Card for Rollback:
  - Following a successful restore, displays a prominent Alert banner with actions: "Hoàn tác về bản trước đó" (revert to snapshot) and "Tải tệp snapshot".
  - `SettingsView` features a persistent "Bản sao lưu dự phòng (Snapshot)" card displaying snapshot timestamp and a "Khôi phục từ bản này" button.
- **D-12:** Atomic Dexie Transaction:
  The entire restore sequence (saving snapshot, clearing 6 domain tables, bulk-adding new records) runs in a single Dexie readwrite (`rw`) transaction across all domain tables + settings.
  Any write failure or constraint error triggers an automatic IndexedDB transaction abort/rollback, leaving original data completely untouched.
- **D-13:** Keyword "RESTORE" Confirmation:
  To prevent accidental overwrites, the confirm button is disabled until the user types `RESTORE` into a confirmation input (mirroring `ResetDbModal` pattern).
  Clear danger Alert explains that local data will be replaced and a safety snapshot will be created.
- **D-14:** Reactive Live Update via `useLiveQuery`:
  No hard page reload (`window.location.reload()`) required. Dexie's `useLiveQuery` automatically detects table updates and reactively updates active views (Dashboard, Tasks, Projects, Planner).
  An Ant Design `notification.success` displays total records imported and confirms live update.
- **D-15:** Assistive Technology & Status Regions (`aria-live`):
  In addition to visual Ant Design notifications, maintains an off-screen `aria-live="polite"` status region (`role="status"`, `aria-atomic="true"`) announcing import/export/rollback start, progress, and completion to screen readers (UX-04).
- **D-16:** Two-Tab Layout for `SettingsView`:
  `SettingsView` is reorganized into two Ant Design `Tabs`:
  - Tab 1: "Công suất làm việc" (`WeeklyCapacityForm`, `OverridesTable`).
  - Tab 2: "Sao lưu & Dữ liệu" (Export Backup button, Import Dragger, Snapshot/Rollback Card, `ResetDbModal` trigger).
  Prevents excessive page scrolling and cleanly separates daily capacity settings from data management operations.

### Claude's Discretion
- Visual styling of comparison table badges (added, removed, unchanged counts).
- Loading spinners and progress bars during file reading and large bulk writes.
- Exact text formatting for validation error tables and screen reader announcements.

### Deferred Ideas (OUT OF SCOPE)
- **PROD-04 (v2):** Selective merge import — user can choose specific projects/tasks to merge instead of full database overwrite.
- **Phase 8:** Encrypted backup upload and restore via GitHub Contents API.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BACK-01 | User can export a complete versioned JSON backup of all local application data. | Headless `exportBackupPayload` service queries all 6 domain tables (`projects`, `milestones`, `tasks`, `capacityRules`, `capacityOverrides`, `plannedAllocations`), builds envelope per D-01/D-02, logs metadata to `backupMetadata` per D-04, and triggers timestamped download per D-03. |
| BACK-02 | User can select a backup for import and review its application marker, version, timestamp, and record counts before any local data changes. | `Upload.Dragger` (50MB cap per D-08) reads file text, validates top-level envelope per D-07, and displays `ImportPreviewModal` showing metadata tags and 4-column comparison table per D-05. |
| BACK-03 | Application validates backup structure, IDs, dates, enums, minute values, and hierarchy references before restore. | Two-stage headless validation in `validateBackupPayload`: (1) Zod schema parse for all 6 tables, (2) In-memory referential integrity checks (milestones->projects, tasks->projects/milestones, allocations->tasks). Errors collected into structured list without modifying DB per D-06. |
| BACK-04 | Application creates a recoverable pre-import snapshot and requires explicit confirmation before replacing local data. | Exact snapshot across 6 domain tables stored in `settings.last_pre_import_snapshot` per D-09/D-10. UI requires keyword `RESTORE` before unlocking primary danger action per D-13. Post-restore banner & settings card offer one-click rollback per D-11. |
| BACK-05 | Failed validation, migration, or restore leaves existing local data unchanged and reports the failure. | Validation runs strictly in-memory before any DB write. Restore runs inside a single atomic Dexie `transaction('rw', ...)` spanning all domain tables + settings. Any error aborts transaction cleanly leaving original data untouched per D-12. |
| UX-04 | Save, import, encryption, synchronization, and update results are announced in visible text and appropriate assistive-technology status regions. | Global `AriaLiveRegion` component with `role="status"`, `aria-live="polite"`, `aria-atomic="true"` hooked to announcement dispatcher emitting localized status messages for export, import, validation, restore, and rollback per D-15. |
</phase_requirements>

---

## Project Constraints (from CLAUDE.md)

1. **Audience & Runtime:** One personal user; 100% local browser execution; no backend or server API.
2. **Hosting:** GitHub Pages with repository subpath support (`base: '/task-management/'`).
3. **Persistence:** IndexedDB via Dexie 4.4.6 is the single source of truth. All multi-table updates must use atomic Dexie transactions.
4. **Data Safety:** Backup import must validate format with Zod and avoid replacing good local data without explicit confirmation.
5. **Identifiers & Dates:** Stable client-generated UUIDs (`crypto.randomUUID()`); dates persisted as `YYYY-MM-DD` strings; time estimates/capacities/allocations persisted as integer minutes.
6. **UI:** Ant Design 6.6.5 with system font stack and 4-spaced sizing.
7. **No Extra Packages:** Native Web APIs (`Blob`, `URL.createObjectURL`, `FileReader`) and existing dependencies (`antd`, `dexie`, `zod`, `dayjs`) satisfy all requirements. Do NOT install file saver or crypto packages for local backup.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Backup Payload Generation | Client Service (`src/services/backup/`) | IndexedDB (`src/db/`) | Pure TypeScript function reads Dexie tables and packages JSON envelope; zero UI coupling for Phase 8 reuse |
| Schema & Referential Validation | Client Service (`src/services/backup/`) | Zod Schemas (`src/validation/`) | Strict in-memory parsing and foreign-key graph verification before database touch |
| Pre-Import Snapshot Storage | IndexedDB (`settings` table) | Memory | Preserves previous data offline in local database under `last_pre_import_snapshot` key |
| Atomic Restore Execution | Client Service (`src/services/backup/`) | Dexie Transaction Engine | Single `rw` transaction across all 6 domain tables + `settings` guarantees zero partial overwrite |
| Import Preview & Diff Calculation | UI Modal (`src/components/settings/`) | Dexie Live Queries | Computes current vs incoming count deltas and renders preview table |
| Assistive Announcements | Client Shell (`src/components/common/AriaLiveRegion`) | Browser Accessibility Tree | Centralized off-screen `aria-live="polite"` node announces async lifecycle events to screen readers |

---

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| dexie | 4.4.6 | Local database & transactions | Native support for multi-table atomic `transaction('rw', ...)`, `bulkAdd`, `clear`, and `table.toArray()` [VERIFIED: npm registry] |
| zod | 4.6.5 | Schema validation | Declarative, type-safe structural validation with exact error reporting [VERIFIED: npm registry] |
| antd | 6.6.5 | UI components | Provides `Tabs`, `Card`, `Table`, `Modal`, `Upload.Dragger`, `Button`, `Alert`, `Input`, `Tag`, `notification` [VERIFIED: npm registry] |
| @ant-design/icons | 6.3.4 | UI iconography | Official Ant Design icon set [VERIFIED: npm registry] |
| dayjs | 1.11.23 | Timestamp & filename formatting | Formatting ISO timestamps and download filenames [VERIFIED: npm registry] |

### Browser Native APIs Used (No Dependencies Added)
| API | Purpose | Rationale |
|-----|---------|-----------|
| `Blob` & `URL.createObjectURL` | File download triggering | Native standard for creating temporary file download links without external packages [VERIFIED: MDN] |
| `FileReader` or `File.text()` | Reading selected JSON file | Standard browser async file reading API [VERIFIED: MDN] |
| `crypto.randomUUID()` | Generating backup log UUIDs | Standard browser UUID v4 generator [VERIFIED: MDN] |

---

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| antd | npm | 9+ yrs | ~4.2M/wk | github.com/ant-design/ant-design | [OK] (flagged SUS due to recent 6.6.5 release date) | Approved (Existing core dependency) |
| @ant-design/icons | npm | 8+ yrs | ~5.0M/wk | github.com/ant-design/ant-design-icons | [OK] (flagged SUS due to recent release date) | Approved (Existing core dependency) |
| dayjs | npm | 6+ yrs | ~79.7M/wk | github.com/iamkun/dayjs | [OK] | Approved (Existing core dependency) |
| dexie | npm | 10+ yrs | ~2.5M/wk | github.com/dexie/Dexie.js | [OK] (flagged SUS due to recent release date) | Approved (Existing core dependency) |
| dexie-react-hooks | npm | 5+ yrs | ~544k/wk | github.com/dexie/Dexie.js | [OK] | Approved (Existing core dependency) |
| react | npm | 12+ yrs | ~203M/wk | github.com/react/react | [OK] (flagged SUS due to recent release date) | Approved (Existing core dependency) |
| react-dom | npm | 12+ yrs | ~192M/wk | github.com/react/react | [OK] (flagged SUS due to recent release date) | Approved (Existing core dependency) |
| zod | npm | 4+ yrs | ~333M/wk | github.com/colinhacks/zod | [OK] (flagged SUS due to recent release date) | Approved (Existing core dependency) |

*No new packages are needed or installed for Phase 06.*

---

## Architecture Patterns

### System Architecture Diagram

```
User Action: "Xuất bản sao lưu" (Export)
   │
   ▼
[BackupExportCard]
   │
   ├──> exportBackupPayload(db)
   │       │
   │       ├──> Reads: projects, milestones, tasks, capacityRules, capacityOverrides, plannedAllocations
   │       ├──> Assembles BackupEnvelope (app='personal-task-planner', schemaVersion=1, exportedAt, counts, tables)
   │       └──> Logs entry to backupMetadata table
   │
   ├──> triggerFileDownload(blob, "task-planner-backup-YYYY-MM-DD-HHmmss.json")
   └──> announceAria("Đã xuất bản sao lưu thành công...")

─────────────────────────────────────────────────────────────────────────────

User Action: Drag/Select File -> "Nhập & Khôi phục" (Import)
   │
   ▼
[BackupImportCard] (File <= 50MB check)
   │
   ├──> file.text() / FileReader
   ├──> JSON.parse()
   │       ├── [Syntax Error] ──> notification.error("Tệp chứa định dạng JSON không hợp lệ")
   │       └── [Valid JSON]   ──> Opens [ImportPreviewModal]
   │
   ▼
[ImportPreviewModal]
   │
   ├──> validateBackupPayload(parsedJson)
   │       ├── Envelope checks: app === 'personal-task-planner', schemaVersion <= CURRENT
   │       ├── Table Schema checks: Zod parse for all records across 6 tables
   │       └── Referential Integrity checks:
   │              - milestone.projectId in projects
   │              - task.projectId in projects
   │              - task.milestoneId in milestones
   │              - plannedAllocation.taskId in tasks
   │
   ├── [INVALID] ──> Renders error summary alert + scrollable error list (Table, ID, Field, Message)
   │                 Confirm button disabled. Local DB untouched.
   │
   └── [VALID]   ──> Renders Envelope tags + 4-column Comparison Table (Current vs Incoming counts + Delta)
                     Displays warning alert. Enables confirm button ONLY when input === "RESTORE"
   │
   ▼ User Types "RESTORE" & Clicks "Xác nhận khôi phục"
   │
   ├──> restoreBackupPayload(db, validatedPayload)
   │       │
   │       └──> db.transaction('rw', [all 6 domain tables + settings + backupMetadata], async () => {
   │               1. Snapshot current 6 tables -> save to settings table ('last_pre_import_snapshot')
   │               2. Clear 6 domain tables
   │               3. bulkAdd validated records into 6 domain tables
   │               4. Log restore entry to backupMetadata
   │            })
   │            [Any failure here automatically rolls back IndexedDB transaction!]
   │
   ├──> Closes Modal
   ├──> useLiveQuery automatically updates all active UI views (no reload)
   ├──> Renders global Post-Restore Alert banner ("Hoàn tác về bản trước đó", "Tải tệp snapshot")
   └──> announceAria("Khôi phục hoàn tất...")

─────────────────────────────────────────────────────────────────────────────

User Action: "Hoàn tác về bản trước đó" (Rollback)
   │
   ▼
[SnapshotRollbackCard] / Post-Restore Banner
   │
   ├──> Modal.confirm("Xác nhận hoàn tác về bản snapshot?")
   └──> On OK: rollbackToSnapshot(db)
           └──> db.transaction('rw', ...) restores snapshot data from settings
```

### Recommended Project Structure
```
src/
├── types/
│   ├── backup.ts                  # BackupEnvelope, BackupTableData, BackupValidationResult, SnapshotData
│   └── models.ts                  # Domain models (Project, Task, etc.)
├── validation/
│   ├── schemas.ts                 # Input schemas
│   └── backupSchemas.ts           # Full model Zod schemas for backup validation (with id, dates, enums)
├── services/
│   └── backup/
│       ├── exportBackup.ts        # Pure exportBackupPayload, generateBackupFileName
│       ├── validateBackup.ts      # Pure validateBackupPayload (Zod + referential integrity)
│       ├── restoreBackup.ts       # Pure restoreBackupPayload & rollbackToSnapshot
│       └── index.ts               # Barrel export for Phase 6 & Phase 8 reuse
├── components/
│   ├── common/
│   │   ├── AriaLiveRegion.tsx     # Accessible announcement region (UX-04)
│   │   └── ResetDbModal.tsx
│   └── settings/
│       ├── BackupExportCard.tsx   # Export trigger & metadata history
│       ├── BackupImportCard.tsx   # Upload.Dragger & file reader
│       ├── ImportPreviewModal.tsx # Comparison table, validation errors, RESTORE keyword gate
│       ├── SnapshotRollbackCard.tsx # Pre-import snapshot info, rollback action, snapshot download
│       ├── PostRestoreBanner.tsx  # Persistent banner shown after restore
│       ├── WeeklyCapacityForm.tsx
│       └── OverridesTable.tsx
└── views/
    └── SettingsView.tsx           # Two-tab layout (Capacity vs Data/Backup)
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Structural validation | Custom `typeof` and regex checks for 6 database tables | `zod` object/array schemas | Zod handles nested types, enums, optional fields, string limits, and emits detailed path-based errors. |
| Atomic database replacement | Looping table clears and inserts in loose `await` statements | `db.transaction('rw', targetDb.tables, ...)` | If an insert fails halfway through, loose awaits corrupt the database. Dexie transactions roll back automatically. |
| File download helper | 3rd party package (`file-saver`, `downloadjs`) | Pure 4-line browser helper (`document.createElement('a')`, `URL.createObjectURL(blob)`, `a.click()`) | Native Web API works offline, requires 0 dependencies, and has zero bundle weight. |
| Live UI refresh | `window.location.reload()` or global events | Dexie `useLiveQuery` | Dexie hooks automatically observe IndexedDB mutations and re-render without losing UI state or tab focus. |
| Screen reader alerts | Custom DOM manipulation in arbitrary components | Centralized `AriaLiveRegion` component + announcement hook | Follows W3C ARIA practices for screen reader status announcement without DOM race conditions. |

---

## Common Pitfalls

### Pitfall 1: Referential Integrity Violations in Valid JSON
**What goes wrong:** A backup file has syntactically valid JSON and valid types, but references non-existent parent IDs (e.g. a Task references `projectId: "uuid-123"` which was deleted or omitted from the backup).
**Why it happens:** Manual file editing, corrupted exports, or partial backups from other versions.
**How to avoid:** Two-tier validation: Tier 1 validates schemas with Zod; Tier 2 builds `Set<string>` of valid IDs (`projectIds`, `milestoneIds`, `taskIds`) and asserts every foreign key exists in the parent set. Abort restore completely if any foreign key is orphan.

### Pitfall 2: Circular Dependency / Order of Insertion in Dexie
**What goes wrong:** Restoring tables in an arbitrary order or failing to clear child tables before parent tables.
**Why it happens:** In relational databases foreign keys restrict order; in Dexie/IndexedDB, order of table clear/bulkAdd inside a single transaction doesn't throw FK constraint errors, but if done outside a transaction, partial writes leave orphaned records.
**How to avoid:** Always execute all clears and `bulkAdd`s inside a single Dexie `transaction('rw', tables, async () => { ... })`.

### Pitfall 3: Overwriting Device-Specific UI Settings
**What goes wrong:** A backup exported on a desktop computer with light theme is imported on a mobile phone with dark theme, overwriting the user's phone preference.
**Why it happens:** Blindly exporting the entire database including the `settings` table.
**How to avoid:** Per decision D-02, strictly export only the 6 core business domain tables (`projects`, `milestones`, `tasks`, `capacityRules`, `capacityOverrides`, `plannedAllocations`). Never export browser settings or device tokens.

### Pitfall 4: Memory Bloat with Multiple Large Snapshots
**What goes wrong:** Keeping multiple snapshots in IndexedDB bloats browser storage and can trigger quota limits.
**Why it happens:** Storing snapshot history as an appending array.
**How to avoid:** Per decision D-10, retain strictly the single latest pre-import snapshot (`last_pre_import_snapshot`). Overwrite previous snapshots on subsequent restores while offering immediate physical file download if the user wants an archive.

### Pitfall 5: Modal Dismissal During Destructive Writes
**What goes wrong:** User clicks modal backdrop or presses Escape while Dexie is clearing and writing 5,000 records, interrupting UI state.
**Why it happens:** Default Ant Design modal settings allow backdrop dismissal and escape key close.
**How to avoid:** Set `maskClosable={false}`, `closable={!loading}`, and disable Cancel button while `loading === true`.

---

## Code Examples

### 1. Headless Export Service
```typescript
// Source: src/services/backup/exportBackup.ts
import type { TaskPlannerDatabase } from '../../db';
import type { BackupEnvelope } from '../../types/backup';
import { generateId } from '../../utils/uuid';
import dayjs from 'dayjs';

export const CURRENT_SCHEMA_VERSION = 1;
export const APP_MARKER = 'personal-task-planner';

export async function exportBackupPayload(targetDb: TaskPlannerDatabase): Promise<BackupEnvelope> {
  const [projects, milestones, tasks, capacityRules, capacityOverrides, plannedAllocations] =
    await Promise.all([
      targetDb.projects.toArray(),
      targetDb.milestones.toArray(),
      targetDb.tasks.toArray(),
      targetDb.capacityRules.toArray(),
      targetDb.capacityOverrides.toArray(),
      targetDb.plannedAllocations.toArray(),
    ]);

  const envelope: BackupEnvelope = {
    app: APP_MARKER,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    tables: {
      projects,
      milestones,
      tasks,
      capacityRules,
      capacityOverrides,
      plannedAllocations,
    },
    counts: {
      projects: projects.length,
      milestones: milestones.length,
      tasks: tasks.length,
      capacityRules: capacityRules.length,
      capacityOverrides: capacityOverrides.length,
      plannedAllocations: plannedAllocations.length,
    },
  };

  const totalRecords = Object.values(envelope.counts).reduce((sum, n) => sum + n, 0);

  // Log export in backupMetadata
  await targetDb.backupMetadata.add({
    id: generateId(),
    timestamp: envelope.exportedAt,
    appVersion: '0.1.0',
    recordCount: totalRecords,
  });

  return envelope;
}

export function generateBackupFileName(date = new Date()): string {
  return `task-planner-backup-${dayjs(date).format('YYYY-MM-DD-HHmmss')}.json`;
}

export function triggerDownload(content: string, fileName: string): void {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

### 2. Strict Referential and Schema Validation
```typescript
// Source: src/services/backup/validateBackup.ts
import { z } from 'zod';
import type { BackupEnvelope, BackupValidationResult, ValidationErrorDetail } from '../../types/backup';
import { APP_MARKER, CURRENT_SCHEMA_VERSION } from './exportBackup';

export function validateBackupPayload(raw: unknown): BackupValidationResult {
  const errors: ValidationErrorDetail[] = [];

  // Stage 1: Basic envelope check
  if (!raw || typeof raw !== 'object') {
    return { valid: false, errors: [{ table: 'envelope', field: 'root', message: 'Dữ liệu không phải là đối tượng JSON hợp lệ' }] };
  }

  const obj = raw as Record<string, unknown>;
  if (obj.app !== APP_MARKER) {
    return { valid: false, errors: [{ table: 'envelope', field: 'app', message: 'Tệp không phải bản sao lưu của ứng dụng này' }] };
  }

  if (typeof obj.schemaVersion !== 'number' || obj.schemaVersion > CURRENT_SCHEMA_VERSION) {
    return {
      valid: false,
      errors: [{
        table: 'envelope',
        field: 'schemaVersion',
        message: `Phiên bản sao lưu (${obj.schemaVersion}) mới hơn ứng dụng (${CURRENT_SCHEMA_VERSION}). Vui lòng cập nhật ứng dụng.`
      }]
    };
  }

  // Stage 2: Structural validation via Zod (BackupEnvelopeSchema)
  // ... parse all 6 tables records ...

  // Stage 3: Referential integrity validation
  // milestone.projectId in projects
  // task.projectId in projects
  // task.milestoneId in milestones
  // plannedAllocation.taskId in tasks

  return {
    valid: errors.length === 0,
    envelope: errors.length === 0 ? (raw as BackupEnvelope) : undefined,
    errors,
  };
}
```

### 3. Atomic Restore with Safety Snapshot
```typescript
// Source: src/services/backup/restoreBackup.ts
import type { TaskPlannerDatabase } from '../../db';
import type { BackupEnvelope, SnapshotData } from '../../types/backup';
import { generateId } from '../../utils/uuid';

export async function restoreBackupPayload(
  targetDb: TaskPlannerDatabase,
  backup: BackupEnvelope
): Promise<{ totalRestored: number; snapshotTime: string }> {
  const snapshotTime = new Date().toISOString();

  await targetDb.transaction('rw', [
    targetDb.projects,
    targetDb.milestones,
    targetDb.tasks,
    targetDb.capacityRules,
    targetDb.capacityOverrides,
    targetDb.plannedAllocations,
    targetDb.settings,
    targetDb.backupMetadata,
  ], async () => {
    // 1. Take snapshot of existing domain tables
    const [p, m, t, cr, co, pa] = await Promise.all([
      targetDb.projects.toArray(),
      targetDb.milestones.toArray(),
      targetDb.tasks.toArray(),
      targetDb.capacityRules.toArray(),
      targetDb.capacityOverrides.toArray(),
      targetDb.plannedAllocations.toArray(),
    ]);

    const snapshot: SnapshotData = {
      timestamp: snapshotTime,
      tables: {
        projects: p,
        milestones: m,
        tasks: t,
        capacityRules: cr,
        capacityOverrides: co,
        plannedAllocations: pa,
      },
      counts: {
        projects: p.length,
        milestones: m.length,
        tasks: t.length,
        capacityRules: cr.length,
        capacityOverrides: co.length,
        plannedAllocations: pa.length,
      },
    };

    // Save snapshot in settings
    await targetDb.settings.put({ key: 'last_pre_import_snapshot', value: snapshot });

    // 2. Clear current domain tables
    await Promise.all([
      targetDb.projects.clear(),
      targetDb.milestones.clear(),
      targetDb.tasks.clear(),
      targetDb.capacityRules.clear(),
      targetDb.capacityOverrides.clear(),
      targetDb.plannedAllocations.clear(),
    ]);

    // 3. Bulk add incoming records
    if (backup.tables.projects.length) await targetDb.projects.bulkAdd(backup.tables.projects);
    if (backup.tables.milestones.length) await targetDb.milestones.bulkAdd(backup.tables.milestones);
    if (backup.tables.tasks.length) await targetDb.tasks.bulkAdd(backup.tables.tasks);
    if (backup.tables.capacityRules.length) await targetDb.capacityRules.bulkAdd(backup.tables.capacityRules);
    if (backup.tables.capacityOverrides.length) await targetDb.capacityOverrides.bulkAdd(backup.tables.capacityOverrides);
    if (backup.tables.plannedAllocations.length) await targetDb.plannedAllocations.bulkAdd(backup.tables.plannedAllocations);

    // 4. Log restore in backupMetadata
    const totalRestored = Object.values(backup.counts).reduce((sum, n) => sum + n, 0);
    await targetDb.backupMetadata.add({
      id: generateId(),
      timestamp: snapshotTime,
      appVersion: '0.1.0',
      recordCount: totalRestored,
    });
  });

  const totalRestored = Object.values(backup.counts).reduce((sum, n) => sum + n, 0);
  return { totalRestored, snapshotTime };
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom browser alert & prompt | Ant Design Modal with keyword confirmation | Established standard | Prevents accidental enter-key confirm; accessible dialog semantics |
| Blind JSON import into IndexedDB | Strict Zod parse + relational integrity validation | Current best practice | Prevents database corruption or runtime UI crashes caused by orphan foreign keys |
| `window.location.reload()` after import | `dexie-react-hooks` `useLiveQuery` | Standard Dexie pattern | Zero flash of white screen, preserves user scroll and client state |
| Storing backups in local filesystem folder via Native File System Access API | Blob download + file drag-and-drop | Standard cross-browser PWA | 100% compatible across Firefox, Safari, Chrome without permission prompts |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | File size cap of 50MB is ample for personal task planner JSON data | User Constraints / Import | Low — personal data across 6 tables rarely exceeds 2MB; 50MB is generous safety ceiling. |
| A2 | Native Web `Blob` and `URL.createObjectURL` suffice without external libraries | Standard Stack | Low — supported in all target evergreen browsers (Chrome, Edge, Firefox, Safari). |

---

## Open Questions (RESOLVED)

1. **What happens if a backup contains empty table arrays?**
   - What we know: A fresh export or a reset database may have 0 projects or 0 tasks.
   - RESOLVED: Valid. As long as `capacityRules` or other tables are structurally compliant, an empty array is valid.
2. **Should rollback also be protected by a confirmation dialog?**
   - What we know: Rollback replaces existing data with snapshot data.
   - RESOLVED: Yes, per UI-SPEC component 5, `Modal.confirm` with danger button warns user before applying rollback.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Test & build runner | ✓ | 24.16.0 | — |
| npm | Package management | ✓ | 11.13.0 | — |
| Vitest | Test execution | ✓ | 5.0.2 | — |
| IndexedDB / fake-indexeddb | Persistence testing | ✓ | fake-indexeddb 6.2.5 | — |

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.2 + @testing-library/react 16.3.3 |
| Config file | `vite.config.ts` |
| Quick run command | `npx vitest run tests/services/backup/` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BACK-01 | Export complete versioned JSON envelope across 6 tables + logging | Unit / Service | `npx vitest run tests/services/backup/exportBackup.test.ts` | ❌ Wave 0 |
| BACK-02 | Preview application marker, version, timestamp, and comparison counts | Component | `npx vitest run tests/components/settings/ImportPreviewModal.test.tsx` | ❌ Wave 0 |
| BACK-03 | Validate structure, IDs, dates, enums, minutes, and referential integrity | Unit / Service | `npx vitest run tests/services/backup/validateBackup.test.ts` | ❌ Wave 0 |
| BACK-04 | Pre-import snapshot taken and keyword RESTORE required to overwrite | Integration / Service | `npx vitest run tests/services/backup/restoreBackup.test.ts` | ❌ Wave 0 |
| BACK-05 | Failed validation or restore aborts and leaves DB untouched | Integration / Service | `npx vitest run tests/services/backup/restoreFailure.test.ts` | ❌ Wave 0 |
| UX-04 | Screen reader announcements for backup, restore, rollback | Component / Unit | `npx vitest run tests/components/common/AriaLiveRegion.test.tsx` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** Run focused test for touched module (e.g. `npx vitest run tests/services/backup/validateBackup.test.ts`)
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/services/backup/exportBackup.test.ts` — covers BACK-01
- [ ] `tests/services/backup/validateBackup.test.ts` — covers BACK-03
- [ ] `tests/services/backup/restoreBackup.test.ts` — covers BACK-04, BACK-05
- [ ] `tests/components/settings/ImportPreviewModal.test.tsx` — covers BACK-02, BACK-04 (RESTORE input)
- [ ] `tests/components/common/AriaLiveRegion.test.tsx` — covers UX-04

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | Strict Zod validation on incoming JSON file, 50MB file size ceiling, strict checking of `app` marker and schema version. |
| V8 Data Protection | yes | Device-specific preferences (`settings.themeMode`) and GitHub tokens are excluded from export payload. |
| V13 API and Web Service | no | No backend API or remote server in this phase. |
| V14 Configuration | yes | Safe local IndexedDB transaction rollback on failure prevents data corruption. |

### Known Threat Patterns for Local JSON Import

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed / Corrupted JSON File | Denial of Service / Tampering | File size cap (50MB) + `try/catch` around `JSON.parse` with clear UI error notification. |
| Hostile Foreign Key Injection (Orphan records) | Tampering / Integrity | Two-pass referential validation checks that milestone, task, and allocation parent references exist in the payload before write. |
| Accidental Data Overwrite | Tampering / Repudiation | Mandatory keyword confirmation (`RESTORE`) + automatic local snapshot saved in `settings` prior to table clear. |
| Prototype Pollution via JSON payload | Tampering | Validated via typed Zod object schemas before passing to Dexie. |

---

## Sources

### Primary (HIGH confidence)
- Existing Codebase: `src/db/schema.ts`, `src/types/models.ts`, `src/validation/schemas.ts`, `src/components/common/ResetDbModal.tsx`
- Project Constraints: `CLAUDE.md`, `.planning/REQUIREMENTS.md`

### Secondary (MEDIUM confidence)
- Official Dexie Documentation: Transactions (`db.transaction('rw', ...)`), bulk operations (`bulkAdd`), hooks (`useLiveQuery`).
- Ant Design 6.6.5 Documentation: `Modal`, `Upload.Dragger`, `Tabs`, `Table`, `Alert`.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Zero new dependencies needed; uses Dexie 4, Zod, Ant Design, native Web APIs.
- Architecture: HIGH — Clear separation of headless backup services (`exportBackup`, `validateBackup`, `restoreBackup`) and UI components (`ImportPreviewModal`, `BackupExportCard`, `BackupImportCard`, `SnapshotRollbackCard`).
- Pitfalls: HIGH — Integrity errors, partial writes, UI setting leaks, and screen reader announcements fully addressed.

**Research date:** 2026-09-27  
**Valid until:** 2026-10-27
