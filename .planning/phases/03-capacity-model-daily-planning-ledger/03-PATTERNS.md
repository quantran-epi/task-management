# Phase 03: Capacity Model & Daily Planning Ledger - Pattern Map

**Mapped:** 2026-09-26
**Files analyzed:** 18
**Analogs found:** 18 / 18

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/validation/schemas.ts` (mod) | config / schema | transform | `src/validation/schemas.ts` | exact |
| `src/utils/capacity.ts` (new) | utility | transform | `src/utils/time.ts` | exact |
| `src/db/repositories/capacityRepo.ts` (new) | model / repo | CRUD | `src/db/repositories/milestoneRepo.ts` | exact |
| `src/db/repositories/allocationRepo.ts` (new) | model / repo | CRUD | `src/db/repositories/taskRepo.ts` | exact |
| `src/hooks/useWeeklyPlanner.ts` (new) | hook | request-response | `src/hooks/useTaskFilters.ts` | role-match |
| `src/components/planner/DayColumnHeader.tsx` (new) | component | transform | `src/components/tasks/InlineStatusTag.tsx` | role-match |
| `src/components/planner/TaskAllocationCard.tsx` (new) | component | request-response | `src/components/tasks/InlineProgress.tsx` | exact |
| `src/components/planner/DayColumn.tsx` (new) | component | request-response | `src/components/tasks/TaskTable.tsx` | role-match |
| `src/components/planner/WeekNavigator.tsx` (new) | component | request-response | `src/components/tasks/TaskFilterBar.tsx` | role-match |
| `src/components/planner/AllocationModal.tsx` (new) | component | request-response | `src/components/projects/ProjectModal.tsx` | exact |
| `src/components/planner/CapacitySettingsModal.tsx` (new) | component | request-response | `src/components/projects/CascadeDeleteModal.tsx` | exact |
| `src/components/settings/WeeklyCapacityForm.tsx` (new) | component | request-response | `src/components/tasks/TaskDrawer.tsx` | role-match |
| `src/components/settings/OverridesTable.tsx` (new) | component | CRUD | `src/components/projects/ProjectTable.tsx` | exact |
| `src/components/tasks/TaskDrawer.tsx` (mod) | component | CRUD | `src/components/tasks/TaskDrawer.tsx` | exact |
| `src/views/PlannerView.tsx` (new) | component / view | request-response | `src/views/TasksView.tsx` | exact |
| `src/views/SettingsView.tsx` (new) | component / view | request-response | `src/views/ProjectsView.tsx` | exact |
| `src/App.tsx` (mod) | component / shell | request-response | `src/App.tsx` | exact |
| `tests/db/capacityRepo.test.ts` (new) | test | request-response | `tests/db/repos.test.ts` | exact |

---

## Pattern Assignments

### `src/validation/schemas.ts` (config / schema, transform)

**Analog:** `src/validation/schemas.ts` lines 41-75

**Imports pattern:**
```typescript
import { z } from 'zod';
import { isValidCalendarDate } from '../utils/date';
import { isValidUuid } from '../utils/uuid';
```

**Core validation pattern:**
```typescript
export const CapacityRuleInputSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  workMinutes: z.number().int().min(0).max(1440),
});

export const CapacityOverrideInputSchema = z.object({
  date: calendarDateSchema,
  workMinutes: z.number().int().min(0).max(1440),
  note: z.string().max(200).optional(),
});

export const PlannedAllocationInputSchema = z.object({
  taskId: uuidSchema,
  date: calendarDateSchema,
  allocatedMinutes: z.number().int().min(1).max(1440),
});
```

---

### `src/utils/capacity.ts` (utility, transform)

**Analog:** `src/utils/time.ts` lines 59-96

**Imports pattern:**
```typescript
import dayjs from 'dayjs';
```

**Core calculation pattern:**
```typescript
export type DailyLoadState = 'no-capacity' | 'available' | 'busy' | 'overloaded';

export interface DayCapacityMetrics {
  date: string;
  dayOfWeek: number;
  effectiveCapacityMinutes: number;
  activeAllocatedMinutes: number;
  inactiveAllocatedMinutes: number;
  netBalanceMinutes: number;
  loadState: DailyLoadState;
  percent: number;
  isOverloaded: boolean;
  activeTaskCount: number;
  isHighContextSwitching: boolean;
}

export function calculateDayMetrics(
  date: string,
  capacityMinutes: number,
  activeAllocatedMinutes: number,
  inactiveAllocatedMinutes: number,
  activeTaskCount: number,
  contextSwitchThreshold = 4
): DayCapacityMetrics {
  const netBalance = capacityMinutes - activeAllocatedMinutes;
  let loadState: DailyLoadState;

  if (capacityMinutes === 0) {
    loadState = activeAllocatedMinutes > 0 ? 'overloaded' : 'no-capacity';
  } else {
    const ratio = activeAllocatedMinutes / capacityMinutes;
    if (ratio > 1) {
      loadState = 'overloaded';
    } else if (ratio >= 0.8) {
      loadState = 'busy';
    } else {
      loadState = 'available';
    }
  }

  const percent = capacityMinutes > 0
    ? Math.min(100, Math.round((activeAllocatedMinutes / capacityMinutes) * 100))
    : (activeAllocatedMinutes > 0 ? 100 : 0);

  return {
    date,
    dayOfWeek: dayjs(date).day(),
    effectiveCapacityMinutes: capacityMinutes,
    activeAllocatedMinutes,
    inactiveAllocatedMinutes,
    netBalanceMinutes: netBalance,
    loadState,
    percent,
    isOverloaded: loadState === 'overloaded',
    activeTaskCount,
    isHighContextSwitching: activeTaskCount > contextSwitchThreshold,
  };
}
```

---

### `src/db/repositories/capacityRepo.ts` (model / repo, CRUD)

**Analog:** `src/db/repositories/milestoneRepo.ts` and `src/db/repositories/taskRepo.ts`

**Imports pattern:**
```typescript
import { db as defaultDb, type TaskPlannerDatabase } from '../index';
import type { CapacityRule, CapacityOverride } from '../../types/models';
import { generateId } from '../../utils/uuid';
import {
  CapacityRuleInputSchema,
  CapacityOverrideInputSchema,
  type CapacityRuleInput,
  type CapacityOverrideInput,
} from '../../validation/schemas';
```

**Core CRUD & Transaction pattern:**
```typescript
export async function getCapacityRules(
  db: TaskPlannerDatabase = defaultDb
): Promise<CapacityRule[]> {
  return await db.capacityRules.toArray();
}

export async function updateCapacityRule(
  dayOfWeek: number,
  workMinutes: number,
  db: TaskPlannerDatabase = defaultDb
): Promise<CapacityRule> {
  const validated = CapacityRuleInputSchema.parse({ dayOfWeek, workMinutes });
  return await db.transaction('rw', db.capacityRules, async () => {
    const existing = await db.capacityRules.where('dayOfWeek').equals(validated.dayOfWeek).first();
    if (existing) {
      const updated: CapacityRule = { ...existing, workMinutes: validated.workMinutes };
      await db.capacityRules.put(updated);
      return updated;
    }
    const created: CapacityRule = {
      id: generateId(),
      dayOfWeek: validated.dayOfWeek,
      workMinutes: validated.workMinutes,
    };
    await db.capacityRules.add(created);
    return created;
  });
}

export async function setCapacityOverride(
  input: CapacityOverrideInput,
  db: TaskPlannerDatabase = defaultDb
): Promise<CapacityOverride> {
  const validated = CapacityOverrideInputSchema.parse(input);
  return await db.transaction('rw', db.capacityOverrides, async () => {
    const existing = await db.capacityOverrides.where('date').equals(validated.date).first();
    if (existing) {
      const updated: CapacityOverride = {
        ...existing,
        workMinutes: validated.workMinutes,
        ...(validated.note !== undefined ? { note: validated.note } : {}),
      };
      await db.capacityOverrides.put(updated);
      return updated;
    }
    const created: CapacityOverride = {
      id: generateId(),
      date: validated.date,
      workMinutes: validated.workMinutes,
      ...(validated.note ? { note: validated.note } : {}),
    };
    await db.capacityOverrides.add(created);
    return created;
  });
}

export async function removeCapacityOverride(
  date: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await db.capacityOverrides.where('date').equals(date).delete();
}
```

---

### `src/db/repositories/allocationRepo.ts` (model / repo, CRUD)

**Analog:** `src/db/repositories/taskRepo.ts` lines 11-60 and `cascadeRepo.ts`

**Imports pattern:**
```typescript
import { db as defaultDb, type TaskPlannerDatabase } from '../index';
import type { PlannedAllocation, Task } from '../../types/models';
import { generateId } from '../../utils/uuid';
import {
  PlannedAllocationInputSchema,
  type PlannedAllocationInput,
} from '../../validation/schemas';
```

**Upsert with merge semantics pattern (D-12):**
```typescript
export async function upsertAllocation(
  input: PlannedAllocationInput,
  db: TaskPlannerDatabase = defaultDb
): Promise<PlannedAllocation> {
  const validated = PlannedAllocationInputSchema.parse(input);

  return await db.transaction('rw', db.plannedAllocations, async () => {
    const existing = await db.plannedAllocations
      .where('taskId')
      .equals(validated.taskId)
      .and((a) => a.date === validated.date)
      .first();

    if (existing) {
      const updated: PlannedAllocation = {
        ...existing,
        allocatedMinutes: validated.allocatedMinutes,
      };
      await db.plannedAllocations.put(updated);
      return updated;
    }

    const newRecord: PlannedAllocation = {
      id: generateId(),
      taskId: validated.taskId,
      date: validated.date,
      allocatedMinutes: validated.allocatedMinutes,
    };
    await db.plannedAllocations.add(newRecord);
    return newRecord;
  });
}

export async function deleteAllocation(
  id: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await db.plannedAllocations.delete(id);
}

export async function getAllocationsForTask(
  taskId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<PlannedAllocation[]> {
  return await db.plannedAllocations.where('taskId').equals(taskId).toArray();
}
```

---

### `src/components/planner/AllocationModal.tsx` (component, request-response)

**Analog:** `src/components/projects/ProjectModal.tsx` lines 1-60

**Imports pattern:**
```typescript
import React, { useEffect, useRef } from 'react';
import { Modal, Form, Select, DatePicker, InputNumber, Space, Alert } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import type { Task } from '../../types/models';
import { createFocusRestorer } from '../../utils/focus';
```

**Focus restoration and form pattern:**
```typescript
export const AllocationModal: React.FC<AllocationModalProps> = ({
  open,
  defaultDate,
  defaultTaskId,
  tasks,
  onClose,
  onSave,
  loading = false,
}) => {
  const [form] = Form.useForm();
  const restorerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (open) {
      restorerRef.current = createFocusRestorer();
      form.setFieldsValue({
        taskId: defaultTaskId ?? undefined,
        date: defaultDate ? dayjs(defaultDate, 'YYYY-MM-DD') : dayjs(),
        hours: 1,
        minutes: 0,
      });
    }
  }, [open, defaultDate, defaultTaskId, form]);

  const handleClose = () => {
    onClose();
    if (restorerRef.current) restorerRef.current();
  };
  // Modal layout with OK / Cancel submission
};
```

---

### `src/components/planner/TaskAllocationCard.tsx` (component, request-response)

**Analog:** `src/components/tasks/InlineProgress.tsx` lines 1-50

**Inline adjustment Popover pattern (D-11):**
```typescript
import React, { useState } from 'react';
import { Card, Popover, Button, InputNumber, Space, Popconfirm, Tag } from 'antd';
import { EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { formatMinutes } from '../../utils/time';

export const TaskAllocationCard: React.FC<TaskAllocationCardProps> = ({
  allocation,
  task,
  projectName,
  onUpdateMinutes,
  onDelete,
  isMuted = false,
}) => {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [hours, setHours] = useState(Math.floor(allocation.allocatedMinutes / 60));
  const [minutes, setMinutes] = useState(allocation.allocatedMinutes % 60);

  const handleSave = () => {
    const total = hours * 60 + minutes;
    if (total > 0) {
      onUpdateMinutes(allocation.id, total);
      setPopoverOpen(false);
    }
  };
  // Card layout with duration badge and Popover action trigger
};
```

---

### `src/components/planner/DayColumnHeader.tsx` (component, transform)

**Analog:** `src/components/tasks/InlineStatusTag.tsx` lines 15-38

**Accessible tag + icon + progress pattern (D-14, D-15, PLAN-04, UX-02):**
```typescript
import React from 'react';
import { Tag, Progress, Space, Typography, Tooltip } from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  MinusCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { DayCapacityMetrics } from '../../utils/capacity';
import { formatMinutes } from '../../utils/time';

const LOAD_CONFIG: Record<
  DayCapacityMetrics['loadState'],
  { label: string; color: string; icon: React.ReactNode }
> = {
  available: { label: 'Available', color: 'success', icon: <CheckCircleOutlined /> },
  busy: { label: 'Busy', color: 'warning', icon: <ClockCircleOutlined /> },
  overloaded: { label: 'Overloaded', color: 'error', icon: <ExclamationCircleOutlined /> },
  'no-capacity': { label: 'No Capacity', color: 'default', icon: <MinusCircleOutlined /> },
};
```

---

### `src/views/PlannerView.tsx` (component / view, request-response)

**Analog:** `src/views/TasksView.tsx` lines 1-60

**Live query + week navigation pattern:**
```typescript
import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import { WeekNavigator } from '../components/planner/WeekNavigator';
import { DayColumn } from '../components/planner/DayColumn';
import { AllocationModal } from '../components/planner/AllocationModal';
import { CapacitySettingsModal } from '../components/planner/CapacitySettingsModal';
import { useWeeklyPlan } from '../hooks/useWeeklyPlanner';

dayjs.extend(isoWeek);

export const PlannerView: React.FC<{ db?: TaskPlannerDatabase }> = ({ db = defaultDb }) => {
  const [selectedWeekStart, setSelectedWeekStart] = useState(() =>
    dayjs().startOf('isoWeek').format('YYYY-MM-DD')
  );
  const [showCompleted, setShowCompleted] = useState(false);
  const [capacityModalOpen, setCapacityModalOpen] = useState(false);
  // Live reactive data query
  const weeklyData = useWeeklyPlan(selectedWeekStart, db);
};
```

---

### `tests/db/capacityRepo.test.ts` (test, request-response)

**Analog:** `tests/db/repos.test.ts` lines 32-60

**Database test lifecycle pattern:**
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../src/db/index';
import {
  getCapacityRules,
  updateCapacityRule,
  setCapacityOverride,
  removeCapacityOverride,
} from '../../src/db/repositories/capacityRepo';

describe('Capacity Repository (CAP-01, CAP-02, CAP-03, CAP-04)', () => {
  let testDb: TaskPlannerDatabase;

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase('TestCapacityDB_' + Math.random().toString(36).slice(2));
    await testDb.open();
  });

  afterEach(async () => {
    await testDb.delete();
  });

  it('updates capacity rule for specific weekday', async () => {
    await updateCapacityRule(1, 420, testDb);
    const rules = await getCapacityRules(testDb);
    const monday = rules.find((r) => r.dayOfWeek === 1);
    expect(monday?.workMinutes).toBe(420);
  });
});
```

---

## Shared Patterns

### Accessible Dialog Focus Restoration
**Source:** `src/utils/focus.ts`
**Apply to:** `AllocationModal.tsx`, `CapacitySettingsModal.tsx`, inline edit popovers
```typescript
import { createFocusRestorer } from '../../utils/focus';

useEffect(() => {
  if (open) {
    restorerRef.current = createFocusRestorer();
  }
}, [open]);

const handleClose = () => {
  onClose();
  if (restorerRef.current) {
    restorerRef.current();
  }
};
```

### Pure Time Formatting & Duration Utilities
**Source:** `src/utils/time.ts`
**Apply to:** All planner card labels, day column headers, settings inputs
```typescript
import { formatMinutes, validateMinutes } from '../../utils/time';
// Examples:
formatMinutes(480); // '8h'
formatMinutes(90);  // '1h 30m'
```

### Reactive Dexie Reads
**Source:** `src/views/TasksView.tsx`
**Apply to:** `PlannerView.tsx`, `SettingsView.tsx`, `useWeeklyPlanner.ts`
```typescript
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';

const data = useLiveQuery(() => queryFunction(db), [dep1, dep2]) ?? fallback;
```

### Inactive Task Exclusion for Load Metrics (D-16, PLAN-05)
**Source:** `src/db/repositories/allocationRepo.ts` and `src/utils/capacity.ts`
**Apply to:** Daily workload sums and task card rendering
```typescript
// Exclude Done and Cancelled tasks from active load calculation
const isActive = task.status !== 'Done' && task.status !== 'Cancelled';
if (isActive) {
  activeAllocatedMinutes += allocation.allocatedMinutes;
} else {
  inactiveAllocatedMinutes += allocation.allocatedMinutes;
}
```

---

## No Analog Found

Every new or modified file in Phase 03 has a direct or strong role-match analog in the existing codebase.

---

## Metadata

**Analog search scope:** `src/`, `tests/`
**Files scanned:** 38
**Pattern extraction date:** 2026-09-26
