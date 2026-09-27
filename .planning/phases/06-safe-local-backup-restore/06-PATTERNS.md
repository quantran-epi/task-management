# Phase 06: Safe Local Backup & Restore - Pattern Map

**Mapped:** 2026-09-27  
**Files analyzed:** 13 (8 implementation + 5 test files)  
**Analogs found:** 13 / 13  

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/types/backup.ts` | model | transform | `src/types/models.ts` | exact |
| `src/validation/backupSchemas.ts` | utility | transform | `src/validation/schemas.ts` | exact |
| `src/services/backup/exportBackup.ts` | service | file-I/O | `src/db/repositories/cascadeRepo.ts` | role-match |
| `src/services/backup/validateBackup.ts` | service | transform | `src/validation/schemas.ts` | role-match |
| `src/services/backup/restoreBackup.ts` | service | batch | `src/db/repositories/cascadeRepo.ts` | exact |
| `src/services/backup/index.ts` | utility | request-response | `src/db/repositories/cascadeRepo.ts` | exact |
| `src/components/common/AriaLiveRegion.tsx` | component | event-driven | `src/components/shell/StatusBadge.tsx` | role-match |
| `src/components/settings/BackupExportCard.tsx` | component | file-I/O | `src/components/settings/WeeklyCapacityForm.tsx` | exact |
| `src/components/settings/BackupImportCard.tsx` | component | file-I/O | `src/components/settings/OverridesTable.tsx` | role-match |
| `src/components/settings/ImportPreviewModal.tsx` | component | request-response | `src/components/common/ResetDbModal.tsx` | exact |
| `src/components/settings/SnapshotRollbackCard.tsx` | component | CRUD | `src/components/settings/WeeklyCapacityForm.tsx` | exact |
| `src/components/settings/PostRestoreBanner.tsx` | component | event-driven | `src/components/common/ResetDbModal.tsx` | role-match |
| `src/views/SettingsView.tsx` | component | request-response | `src/views/SettingsView.tsx` (existing) | exact |

---

## Pattern Assignments

### `src/types/backup.ts` (model, transform)

**Analog:** `src/types/models.ts`

**Imports pattern:**
```typescript
import type {
  Project,
  Milestone,
  Task,
  CapacityRule,
  CapacityOverride,
  PlannedAllocation,
} from './models';
```

**Core Model Pattern:**
```typescript
// Envelope and snapshot interfaces mirroring models.ts definition style
export interface BackupTableData {
  projects: Project[];
  milestones: Milestone[];
  tasks: Task[];
  capacityRules: CapacityRule[];
  capacityOverrides: CapacityOverride[];
  plannedAllocations: PlannedAllocation[];
}

export interface BackupTableCounts {
  projects: number;
  milestones: number;
  tasks: number;
  capacityRules: number;
  capacityOverrides: number;
  plannedAllocations: number;
}

export interface BackupEnvelope {
  app: 'personal-task-planner';
  schemaVersion: number;
  exportedAt: string; // ISO 8601
  tables: BackupTableData;
  counts: BackupTableCounts;
}

export interface ValidationErrorDetail {
  table: string;
  recordId?: string;
  field: string;
  message: string;
}

export interface BackupValidationResult {
  valid: boolean;
  envelope?: BackupEnvelope;
  errors: ValidationErrorDetail[];
}

export interface SnapshotData {
  timestamp: string;
  tables: BackupTableData;
  counts: BackupTableCounts;
}
```

---

### `src/validation/backupSchemas.ts` (utility, transform)

**Analog:** `src/validation/schemas.ts`

**Imports pattern** (from `src/validation/schemas.ts` lines 1-10):
```typescript
import { z } from 'zod';
import { isValidCalendarDate } from '../utils/date';
import { isValidUuid } from '../utils/uuid';
import {
  PROJECT_STATUSES,
  MILESTONE_STATUSES,
  TASK_STATUSES,
  TASK_PRIORITIES,
} from './schemas';
```

**Validation Primitives Pattern** (from `src/validation/schemas.ts` lines 41-58):
```typescript
const calendarDateSchema = z
  .string()
  .refine(isValidCalendarDate, {
    message: 'Must be a valid calendar date in YYYY-MM-DD format',
  });

const uuidSchema = z
  .string()
  .refine(isValidUuid, {
    message: 'Must be a valid RFC 4122 v4 UUID',
  });
```

**Full Record Schema Pattern:**
```typescript
export const BackupProjectRecordSchema = z.object({
  id: uuidSchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().optional(),
  deadline: calendarDateSchema.optional(),
  notes: z.string().optional(),
  status: z.enum(PROJECT_STATUSES),
  createdAt: z.string(),
  updatedAt: z.string(),
});
```

---

### `src/services/backup/restoreBackup.ts` (service, batch)

**Analog:** `src/db/repositories/cascadeRepo.ts`

**Imports pattern:**
```typescript
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import type { BackupEnvelope, SnapshotData } from '../../types/backup';
import { generateId } from '../../utils/uuid';
```

**Atomic Transaction Pattern** (from `src/db/repositories/cascadeRepo.ts` lines 15-38):
```typescript
export async function restoreBackupPayload(
  backup: BackupEnvelope,
  targetDb: TaskPlannerDatabase = defaultDb
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
    // 1. Take snapshot of current 6 domain tables
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

### `src/components/settings/ImportPreviewModal.tsx` (component, request-response)

**Analog:** `src/components/common/ResetDbModal.tsx`

**Imports pattern:**
```typescript
import React, { useState } from 'react';
import { Modal, Input, Typography, Alert, Table, Tag, Space, Button } from 'antd';
import type { BackupEnvelope, ValidationErrorDetail } from '../../types/backup';
```

**Keyword Confirmation & Modal Action Pattern** (from `src/components/common/ResetDbModal.tsx` lines 12-58):
```typescript
// State & handlers
const [confirmText, setConfirmText] = useState('');
const [loading, setLoading] = useState(false);

const handleConfirm = async () => {
  if (confirmText !== 'RESTORE' || !isValid) return;
  setLoading(true);
  try {
    await onRestore();
    setConfirmText('');
    onClose();
  } finally {
    setLoading(false);
  }
};

// Modal attributes
<Modal
  title="Xem trước & Xác nhận Khôi phục"
  open={open}
  onCancel={() => {
    setConfirmText('');
    onClose();
  }}
  onOk={handleConfirm}
  okText="Xác nhận khôi phục"
  cancelText="Hủy"
  okButtonProps={{ danger: true, disabled: confirmText !== 'RESTORE' || !isValid, loading }}
  maskClosable={!loading}
  closable={!loading}
>
  <Alert
    type="warning"
    message="Hành động thay thế toàn bộ dữ liệu"
    description="Nhập RESTORE để xác nhận thay thế dữ liệu hiện tại bằng tệp sao lưu. Bản snapshot an toàn sẽ được tạo tự động."
    showIcon
    style={{ marginBottom: 16 }}
  />
  <Input
    value={confirmText}
    onChange={(e) => setConfirmText(e.target.value)}
    placeholder="RESTORE"
  />
</Modal>
```

---

### `src/components/settings/BackupExportCard.tsx` (component, file-I/O)

**Analog:** `src/components/settings/WeeklyCapacityForm.tsx`

**Imports & Live Query pattern** (from `src/components/settings/WeeklyCapacityForm.tsx` lines 1-10):
```typescript
import React, { useState } from 'react';
import { Card, Button, Typography, Space, notification } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { exportBackupPayload, generateBackupFileName, triggerDownload } from '../../services/backup/exportBackup';

const { Title, Text, Paragraph } = Typography;
```

**Live Query for Metadata Pattern** (from `src/components/settings/WeeklyCapacityForm.tsx` lines 31-40):
```typescript
export const BackupExportCard: React.FC<{ db?: TaskPlannerDatabase }> = ({ db = defaultDb }) => {
  const lastBackup = useLiveQuery(
    async () => {
      return await db.backupMetadata.orderBy('timestamp').reverse().first();
    },
    [db]
  );
  // Export trigger + download handling
};
```

---

### `src/components/common/AriaLiveRegion.tsx` (component, event-driven)

**Analog:** `src/components/shell/StatusBadge.tsx`

**Component Pattern:**
```typescript
import React, { useEffect, useState } from 'react';

// Lightweight event emitter for screen reader announcements
type Listener = (msg: string) => void;
const listeners = new Set<Listener>();

export function announceToScreenReader(message: string): void {
  listeners.forEach((fn) => fn(message));
}

export const AriaLiveRegion: React.FC = () => {
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    const handler: Listener = (msg) => {
      setAnnouncement(msg);
    };
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{
        position: 'absolute',
        width: 1,
        height: 1,
        padding: 0,
        margin: -1,
        overflow: 'hidden',
        clip: 'rect(0, 0, 0, 0)',
        whiteSpace: 'nowrap',
        border: 0,
      }}
    >
      {announcement}
    </div>
  );
};
```

---

### `src/views/SettingsView.tsx` (view, layout refactor)

**Analog:** `src/views/SettingsView.tsx` (existing)

**Tabs Layout Pattern:**
```typescript
import React from 'react';
import { Tabs, Typography, Button } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { WeeklyCapacityForm } from '../components/settings/WeeklyCapacityForm';
import { OverridesTable } from '../components/settings/OverridesTable';
import { BackupExportCard } from '../components/settings/BackupExportCard';
import { BackupImportCard } from '../components/settings/BackupImportCard';
import { SnapshotRollbackCard } from '../components/settings/SnapshotRollbackCard';
import { ResetDbModal } from '../components/common/ResetDbModal';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import type { AppRoute } from '../types/navigation';

export const SettingsView: React.FC<SettingsViewProps> = ({ db = defaultDb, onNavigate }) => {
  const items = [
    {
      key: 'capacity',
      label: 'Công suất làm việc',
      children: (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <WeeklyCapacityForm db={db} />
          <OverridesTable db={db} />
        </Space>
      ),
    },
    {
      key: 'backup',
      label: 'Sao lưu & Dữ liệu',
      children: (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <BackupExportCard db={db} />
          <BackupImportCard db={db} />
          <SnapshotRollbackCard db={db} />
        </Space>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '16px 24px' }}>
      {/* Header with Title and Back button */}
      <Tabs defaultActiveKey="capacity" orientation="horizontal" items={items} />
    </div>
  );
};
```

---

## Test Patterns

### Service Integration Test Pattern

**Analog:** `tests/db/cascadeRepo.test.ts` (lines 14-25)

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db/index';
import { restoreBackupPayload } from '../../src/services/backup/restoreBackup';

describe('restoreBackupPayload atomic execution', () => {
  let testDb: TaskPlannerDatabase;

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase('TestRestoreDB_' + Math.random().toString(36).slice(2));
    await testDb.open();
  });

  afterEach(async () => {
    await testDb.delete();
  });

  it('restores all tables and stores pre-import snapshot', async () => {
    // assertions
  });
});
```

### Component Test Pattern

**Analog:** `tests/components/CapacitySettings.test.tsx` (lines 1-25)

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../src/db/index';
import { initializeDatabaseDefaults } from '../../src/db/seeds';
import { ImportPreviewModal } from '../../src/components/settings/ImportPreviewModal';

describe('ImportPreviewModal', () => {
  let testDb: TaskPlannerDatabase;

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase('TestImportModal_' + Math.random().toString(36).slice(2));
    await testDb.open();
    await initializeDatabaseDefaults(testDb);
  });

  afterEach(async () => {
    await testDb.delete();
  });

  it('enables confirm button only when RESTORE keyword typed', async () => {
    // test modal confirm interaction
  });
});
```

---

## Shared Patterns

### Atomic Multi-table Dexie Transactions
**Source:** `src/db/repositories/cascadeRepo.ts` lines 15, 81, 121  
**Apply to:** `src/services/backup/restoreBackup.ts` (restore and rollback functions)  
```typescript
await db.transaction('rw', [db.projects, db.milestones, db.tasks, db.capacityRules, db.capacityOverrides, db.plannedAllocations, db.settings, db.backupMetadata], async () => {
  // All clears and inserts occur inside atomic boundary
});
```

### String Keyword Confirmation for Destructive Actions
**Source:** `src/components/common/ResetDbModal.tsx` lines 13-28, 41-56  
**Apply to:** `src/components/settings/ImportPreviewModal.tsx`  
```typescript
const [confirmText, setConfirmText] = useState('');
<Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="RESTORE" />
<Button danger disabled={confirmText !== 'RESTORE'} loading={loading}>Xác nhận khôi phục</Button>
```

### Reactive View Updates without Hard Reload
**Source:** `src/components/settings/WeeklyCapacityForm.tsx` lines 31-40  
**Apply to:** `BackupExportCard.tsx`, `SnapshotRollbackCard.tsx`, `ImportPreviewModal.tsx`  
```typescript
const data = useLiveQuery(() => db.tableName.toArray(), [db]);
```

### Assistive Technology Announcements
**Source:** `src/components/shell/AppShell.tsx` + `UX-04`  
**Apply to:** Global container in `AppShell` or `SettingsView`  
```typescript
<div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
  {statusText}
</div>
```

---

## No Analog Found

None. All Phase 6 components, services, and schemas map directly to existing repository, validation, modal, and settings patterns.

---

## Metadata

**Analog search scope:** `src/db/`, `src/components/`, `src/validation/`, `src/views/`, `tests/`  
**Files scanned:** 68 files  
**Pattern extraction date:** 2026-09-27  
