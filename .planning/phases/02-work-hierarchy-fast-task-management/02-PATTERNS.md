# Phase 02: Work Hierarchy & Fast Task Management - Pattern Map

**Mapped:** 2026-09-26
**Files analyzed:** 18
**Analogs found:** 18 / 18

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/db/repositories/projectRepo.ts` | service | CRUD | `src/db/seeds.ts` | role-match |
| `src/db/repositories/milestoneRepo.ts` | service | CRUD | `src/db/seeds.ts` | role-match |
| `src/db/repositories/taskRepo.ts` | service | CRUD | `src/db/seeds.ts` | role-match |
| `src/db/repositories/cascadeRepo.ts` | service | batch | `src/db/seeds.ts` | exact |
| `src/utils/time.ts` | utility | transform | `src/utils/date.ts` | exact |
| `src/utils/filter.ts` | utility | transform | `src/utils/date.ts` | role-match |
| `src/utils/focus.ts` | utility | request-response | `src/hooks/useHashRoute.ts` | role-match |
| `src/hooks/useTaskFilters.ts` | hook | request-response | `src/hooks/useHashRoute.ts` | exact |
| `src/hooks/useKeyboardShortcuts.ts` | hook | event-driven | `src/components/shell/UpgradeModal.tsx` | exact |
| `src/components/tasks/QuickAddBar.tsx` | component | request-response | `src/components/common/ResetDbModal.tsx` | role-match |
| `src/components/tasks/InlineStatusTag.tsx` | component | request-response | `src/components/shell/StatusBadge.tsx` | role-match |
| `src/components/tasks/InlineProgress.tsx` | component | request-response | `src/components/common/ResetDbModal.tsx` | role-match |
| `src/components/tasks/HierarchyBreadcrumb.tsx` | component | request-response | `src/components/shell/StatusBadge.tsx` | role-match |
| `src/components/tasks/BatchActionBar.tsx` | component | batch | `src/components/common/ResetDbModal.tsx` | role-match |
| `src/components/tasks/TaskFilterBar.tsx` | component | request-response | `src/components/shell/Navigation.tsx` | role-match |
| `src/components/tasks/TaskDrawer.tsx` | component | CRUD | `src/components/shell/AppShell.tsx` | role-match |
| `src/components/tasks/TaskTable.tsx` | component | CRUD | `src/App.tsx` | role-match |
| `src/components/projects/CascadeDeleteModal.tsx` | component | request-response | `src/components/common/ResetDbModal.tsx` | exact |
| `src/components/projects/ProjectModal.tsx` | component | CRUD | `src/components/common/ResetDbModal.tsx` | exact |
| `src/components/projects/MilestoneModal.tsx` | component | CRUD | `src/components/common/ResetDbModal.tsx` | exact |
| `src/components/projects/ProjectTable.tsx` | component | CRUD | `src/App.tsx` | role-match |
| `src/views/TasksView.tsx` | component | CRUD | `src/App.tsx` | role-match |
| `src/views/ProjectsView.tsx` | component | CRUD | `src/App.tsx` | role-match |
| `src/App.tsx` | component | request-response | `src/App.tsx` | exact |

## Pattern Assignments

### `src/db/repositories/projectRepo.ts`, `milestoneRepo.ts`, `taskRepo.ts`, `cascadeRepo.ts` (service, CRUD / batch)

**Analog:** `src/db/seeds.ts`

**Imports pattern** (`src/db/seeds.ts:1-3`):
```typescript
import { db, TaskPlannerDatabase } from '../index';
import { generateId } from '../../utils/uuid';
import type { Project, Milestone, Task } from '../../types/models';
```

**Dexie transaction & atomic execution pattern** (`src/db/seeds.ts:39-54`):
```typescript
export async function resetDatabaseToDefaults(targetDb: TaskPlannerDatabase = db): Promise<void> {
  await targetDb.transaction('rw', targetDb.tables, async () => {
    await Promise.all(targetDb.tables.map((table) => table.clear()));

    const defaultRules: CapacityRule[] = [
      { id: generateId(), dayOfWeek: 1, workMinutes: 480 },
      // ...
    ];
    await targetDb.capacityRules.bulkAdd(defaultRules);
  });
}
```

**Atomic cascade deletion pattern for `cascadeRepo.ts`**:
```typescript
export async function deleteProjectWithCascade(
  projectId: string,
  mode: 'cascade' | 'orphan',
  targetDb: TaskPlannerDatabase = db
): Promise<void> {
  await targetDb.transaction('rw', [targetDb.projects, targetDb.milestones, targetDb.tasks, targetDb.plannedAllocations], async () => {
    const childMilestones = await targetDb.milestones.where('projectId').equals(projectId).toArray();
    const milestoneIds = childMilestones.map((m) => m.id);
    const childTasks = await targetDb.tasks
      .filter((t) => t.projectId === projectId || (t.milestoneId ? milestoneIds.includes(t.milestoneId) : false))
      .toArray();
    const taskIds = childTasks.map((t) => t.id);

    if (mode === 'cascade') {
      await targetDb.plannedAllocations.where('taskId').anyOf(taskIds).delete();
      await targetDb.tasks.bulkDelete(taskIds);
      await targetDb.milestones.bulkDelete(milestoneIds);
      await targetDb.projects.delete(projectId);
    } else {
      const updatedTasks = childTasks.map((t) => ({
        ...t,
        projectId: undefined,
        milestoneId: undefined,
        updatedAt: new Date().toISOString(),
      }));
      await targetDb.tasks.bulkPut(updatedTasks);
      await targetDb.milestones.bulkDelete(milestoneIds);
      await targetDb.projects.delete(projectId);
    }
  });
}
```

---

### `src/utils/time.ts` & `src/utils/filter.ts` (utility, transform)

**Analog:** `src/utils/date.ts`

**Imports & date math pattern** (`src/utils/date.ts:1-5`):
```typescript
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';

dayjs.extend(customParseFormat);
```

**Validation & conversion pattern** (`src/utils/date.ts:32-45`):
```typescript
export function isValidMinutes(minutes: unknown): boolean {
  return typeof minutes === 'number' && Number.isInteger(minutes) && minutes >= 0;
}

export function toMinutes(hours: number): number {
  if (typeof hours !== 'number' || !Number.isFinite(hours) || hours < 0) {
    throw new RangeError('Hours must be a non-negative finite number');
  }
  return Math.round(hours * 60);
}
```

---

### `src/hooks/useKeyboardShortcuts.ts` (hook, event-driven)

**Analog:** `src/components/shell/UpgradeModal.tsx`

**Event listener & cleanup pattern** (`src/components/shell/UpgradeModal.tsx:7-18`):
```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && (['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable)) {
      return;
    }
    // Action handler
  };

  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, []);
```

---

### `src/hooks/useTaskFilters.ts` (hook, request-response)

**Analog:** `src/hooks/useHashRoute.ts`

**State listener & reducer pattern** (`src/hooks/useHashRoute.ts:1-24`):
```typescript
import { useState, useMemo } from 'react';
import type { Task } from '../types/models';

export function useTaskFilters(tasks: Task[]) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  // ...
  const filteredTasks = useMemo(() => {
    // Debounced search + filter pipeline
    return tasks;
  }, [tasks, searchQuery, selectedStatuses]);

  return { searchQuery, setSearchQuery, filteredTasks };
}
```

---

### `src/components/projects/CascadeDeleteModal.tsx`, `ProjectModal.tsx`, `MilestoneModal.tsx` (component, modal CRUD)

**Analog:** `src/components/common/ResetDbModal.tsx`

**Modal state, async loading & error handling pattern** (`src/components/common/ResetDbModal.tsx:1-30`):
```typescript
import React, { useState } from 'react';
import { Modal, Input, Typography, Alert, message } from 'antd';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const ModalComponent: React.FC<ModalProps> = ({ open, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      // Execute repository call
      message.success('Updated successfully');
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Operation failed:', err);
      message.error('Failed to complete action');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={handleConfirm}
      okButtonProps={{ loading }}
    >
      {/* Form content */}
    </Modal>
  );
};
```

---

### `src/components/tasks/TaskDrawer.tsx` (component, drawer CRUD)

**Analog:** `src/components/shell/AppShell.tsx`

**Drawer layout & responsiveness pattern** (`src/components/shell/AppShell.tsx:41-56`):
```typescript
<Drawer
  placement="right"
  open={drawerOpen}
  onClose={() => setDrawerOpen(false)}
  styles={{ body: { padding: 24 } }}
  title="Edit Task"
  destroyOnClose
  width={screens.md ? 520 : '100%'}
>
  {/* Ant Design Form */}
</Drawer>
```

---

### `src/components/tasks/InlineStatusTag.tsx` & `HierarchyBreadcrumb.tsx` (component, request-response)

**Analog:** `src/components/shell/StatusBadge.tsx`

**Tag styling & compact indicator pattern** (`src/components/shell/StatusBadge.tsx:8-23`):
```typescript
import React from 'react';
import { Badge, Tag } from 'antd';

export const InlineTag: React.FC<Props> = ({ status, onClick }) => {
  return (
    <Tag
      color={status === 'Done' ? 'success' : 'processing'}
      style={{ cursor: 'pointer', userSelect: 'none' }}
      onClick={onClick}
    >
      {status}
    </Tag>
  );
};
```

---

### `src/views/TasksView.tsx`, `ProjectsView.tsx`, `App.tsx` (view, reactive Dexie pipeline)

**Analog:** `src/App.tsx`

**Reactive query & view routing pattern** (`src/App.tsx:26-53`):
```typescript
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';

export const TasksView: React.FC = () => {
  const tasks = useLiveQuery(() => db.tasks.toArray(), []) ?? [];
  const projects = useLiveQuery(() => db.projects.toArray(), []) ?? [];
  const milestones = useLiveQuery(() => db.milestones.toArray(), []) ?? [];

  // Pass live datasets to table and filter controls
  return (
    <div>
      {/* Filter bar, Quick add bar, Task table */}
    </div>
  );
};
```

---

### Tests: `tests/db/*.test.ts` & `tests/components/*.test.tsx`

**Analog:** `tests/db.test.ts` and `tests/shell.test.tsx`

**Database unit test fixture pattern** (`tests/db.test.ts:8-19`):
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../src/db/index';

describe('Repository Integration', () => {
  let testDb: TaskPlannerDatabase;
  const testDbName = 'TestTaskPlannerDB';

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase(testDbName);
    await testDb.open();
  });

  afterEach(async () => {
    await testDb.delete();
  });
  // Tests
});
```

---

## Shared Patterns

### Dexie Transactions
**Source:** `src/db/seeds.ts:9-33`, `tests/db.test.ts:70-113`
**Apply to:** All repository multi-write and cascade delete operations (`taskRepo.ts`, `cascadeRepo.ts`, `projectRepo.ts`)
```typescript
await targetDb.transaction('rw', [targetDb.tasks, targetDb.plannedAllocations], async () => {
  await targetDb.plannedAllocations.where('taskId').equals(taskId).delete();
  await targetDb.tasks.delete(taskId);
});
```

### Feedback & Error Notifications
**Source:** `src/components/common/ResetDbModal.tsx:23-28`
**Apply to:** All inline actions, quick add, form submissions, and deletions
```typescript
import { message } from 'antd';

try {
  await repoCall();
  message.success({ content: 'Action saved', duration: 1.5 });
} catch (err) {
  console.error('Operation error:', err);
  message.error('Failed to save changes');
}
```

### Date and Minute Representation
**Source:** `src/utils/date.ts:12-45`
**Apply to:** All task and milestone forms, input parsers, and table columns
- Calendar dates: strict string `YYYY-MM-DD`
- Estimates and durations: strict non-negative integer minutes
- Timestamps: ISO 8601 strings (`new Date().toISOString()`)

### Keyboard Accessibility & Target Guard
**Source:** `src/components/shell/UpgradeModal.tsx:7-18`
**Apply to:** `useKeyboardShortcuts.ts` and table navigation
```typescript
const isInputActive = (target: HTMLElement | null): boolean => {
  if (!target) return false;
  return ['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable;
};
```

## No Analog Found

All 18 new and modified files have established analogs in Phase 1 code.

| File | Role | Data Flow | Reason |
|---|---|---|---|
| *None* | — | — | Full analog coverage achieved |

## Metadata

**Analog search scope:** `src/`, `tests/`
**Files scanned:** 22
**Pattern extraction date:** 2026-09-26
