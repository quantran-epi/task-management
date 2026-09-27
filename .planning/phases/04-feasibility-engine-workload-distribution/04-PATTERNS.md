# Phase 04: Feasibility Engine & Workload Distribution - Pattern Map

**Mapped:** 2026-09-27
**Files analyzed:** 10 (4 new source files, 2 new test files, 4 modified existing files)
**Analogs found:** 10 / 10

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/types/feasibility.ts` | model | request-response | `src/types/models.ts` | exact |
| `src/utils/feasibility.ts` | utility | transform | `src/utils/capacity.ts` | exact |
| `src/components/planner/FeasibilityModal.tsx` | component | request-response | `src/components/planner/AllocationModal.tsx` | exact |
| `src/components/planner/CandidateAllocationsTable.tsx` | component | request-response | `src/components/tasks/TaskDrawerPlanning.tsx` | exact |
| `src/components/planner/DateInspectionBreakdown.tsx` | component | request-response | `src/components/settings/OverridesTable.tsx` | role-match |
| `src/components/tasks/TaskDrawerPlanning.tsx` (mod) | component | CRUD | `src/components/tasks/TaskDrawerPlanning.tsx` | exact |
| `src/views/PlannerView.tsx` (mod) | component | request-response | `src/views/PlannerView.tsx` | exact |
| `src/views/TasksView.tsx` (mod) | component | request-response | `src/views/TasksView.tsx` | exact |
| `tests/utils/feasibility.test.ts` | test | batch | `tests/utils/capacity.test.ts` | exact |
| `tests/components/FeasibilityModal.test.tsx` | test | event-driven | `tests/components/AllocationModal.test.tsx` | exact |

---

## Pattern Assignments

### `src/types/feasibility.ts` (model, request-response)

**Analog:** `src/types/models.ts`

**Imports pattern:**
```typescript
import type { Task, PlannedAllocation, CapacityRule, CapacityOverride } from './models';
```

**Core types pattern:**
```typescript
export type DistributionStrategy = 'balanced-spread' | 'front-load' | 'greedy-fill';

export type DateInspectionStatus =
  | 'available'
  | 'full'
  | 'overloaded'
  | 'excluded-past'
  | 'excluded-non-working';

export interface CandidateAllocation {
  date: string; // YYYY-MM-DD
  dayOfWeek: number;
  existingAllocatedMinutes: number;
  proposedAllocatedMinutes: number;
  totalResultingMinutes: number;
  maxAvailableMinutes: number;
  included: boolean;
}

export interface DateInspectionItem {
  date: string; // YYYY-MM-DD
  dayOfWeek: number;
  capacityMinutes: number;
  activeLoadMinutes: number;
  netBalanceMinutes: number;
  status: DateInspectionStatus;
}

export interface FeasibilityEvaluationInput {
  task: Task;
  existingTaskAllocations: PlannedAllocation[];
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  rules: Map<number, number> | CapacityRule[];
  overrides: Map<string, number> | CapacityOverride[];
  activeAllocationsByDate: Record<string, number>; // other tasks active load
  strategy?: DistributionStrategy;
  maxMinutesPerDay?: number;
}

export interface FeasibilityResult {
  isFeasible: boolean;
  remainingTaskEstimateMinutes: number;
  totalAvailableNetMinutes: number;
  surplusMinutes: number;
  deficitMinutes: number;
  earliestFeasibleDate?: string;
  candidateAllocations: CandidateAllocation[];
  dateBreakdown: DateInspectionItem[];
}
```

---

### `src/utils/feasibility.ts` (utility, transform)

**Analog:** `src/utils/capacity.ts` lines 1-110

**Imports pattern** (`src/utils/capacity.ts` lines 1-3):
```typescript
import dayjs from 'dayjs';
import type { CapacityRule, CapacityOverride, PlannedAllocation, Task } from '../types/models';
import type {
  DistributionStrategy,
  CandidateAllocation,
  DateInspectionItem,
  FeasibilityEvaluationInput,
  FeasibilityResult,
} from '../types/feasibility';
import { getEffectiveDailyCapacity } from './capacity';
```

**Core calculation & classification pattern** (`src/utils/capacity.ts` lines 60-93):
```typescript
/**
 * Evaluates date capacity metrics and status category (CALC-02, CALC-04, D-04).
 */
export function inspectDateCapacity(
  date: string,
  today: string,
  taskId: string,
  rules: Map<number, number> | CapacityRule[],
  overrides: Map<string, number> | CapacityOverride[],
  otherTasksActiveLoad: number
): DateInspectionItem {
  const isPast = date < today;
  const capacityMinutes = getEffectiveDailyCapacity(date, rules, overrides);
  const netBalanceMinutes = Math.max(0, capacityMinutes - otherTasksActiveLoad);
  const dayOfWeek = dayjs(date, 'YYYY-MM-DD').day();

  let status: DateInspectionItem['status'];
  if (isPast) {
    status = 'excluded-past';
  } else if (capacityMinutes === 0) {
    status = 'excluded-non-working';
  } else if (otherTasksActiveLoad > capacityMinutes) {
    status = 'overloaded';
  } else if (netBalanceMinutes === 0) {
    status = 'full';
  } else {
    status = 'available';
  }

  return {
    date,
    dayOfWeek,
    capacityMinutes,
    activeLoadMinutes: otherTasksActiveLoad,
    netBalanceMinutes,
    status,
  };
}
```

**Forward projection pattern** (bounding loop with max horizon):
```typescript
/**
 * Projects forward to find earliest feasible completion date (CALC-03, D-09).
 * Hard-capped at 365 days to prevent infinite loops.
 */
export function findEarliestFeasibleDate(
  startDate: string,
  requiredMinutes: number,
  rules: Map<number, number> | CapacityRule[],
  overrides: Map<string, number> | CapacityOverride[],
  getOtherLoadForDate: (date: string) => number,
  maxHorizonDays = 365
): string | undefined {
  if (requiredMinutes <= 0) return startDate;

  let accumulated = 0;
  let cursor = dayjs(startDate, 'YYYY-MM-DD');

  for (let i = 0; i < maxHorizonDays; i++) {
    const dateStr = cursor.format('YYYY-MM-DD');
    const cap = getEffectiveDailyCapacity(dateStr, rules, overrides);
    if (cap > 0) {
      const otherLoad = getOtherLoadForDate(dateStr);
      const available = Math.max(0, cap - otherLoad);
      accumulated += available;
      if (accumulated >= requiredMinutes) {
        return dateStr;
      }
    }
    cursor = cursor.add(1, 'day');
  }

  return undefined;
}
```

**Deterministic distribution pattern** (15m quantization, tie-breaker: earlier date wins):
```typescript
/**
 * Balanced spread distribution algorithm (CALC-05, D-05, D-07).
 * Iteratively allocates 15-minute quanta to lowest loaded eligible day.
 */
export function distributeBalancedSpread(
  eligibleDays: { date: string; capacityMinutes: number; activeLoad: number; maxMinutes: number }[],
  minutesToDistribute: number,
  quantum = 15
): Map<string, number> {
  const proposed = new Map<string, number>();
  for (const d of eligibleDays) proposed.set(d.date, 0);

  let remaining = minutesToDistribute;
  while (remaining >= quantum) {
    const candidates = eligibleDays.filter(
      (d) => (proposed.get(d.date) ?? 0) + quantum <= d.maxMinutes
    );
    if (candidates.length === 0) break;

    candidates.sort((a, b) => {
      const loadA = (a.activeLoad + (proposed.get(a.date) ?? 0)) / a.capacityMinutes;
      const loadB = (b.activeLoad + (proposed.get(b.date) ?? 0)) / b.capacityMinutes;
      if (Math.abs(loadA - loadB) > 0.0001) {
        return loadA - loadB;
      }
      return a.date.localeCompare(b.date);
    });

    const chosen = candidates[0]!;
    proposed.set(chosen.date, (proposed.get(chosen.date) ?? 0) + quantum);
    remaining -= quantum;
  }

  if (remaining > 0) {
    for (const d of eligibleDays) {
      const cur = proposed.get(d.date) ?? 0;
      if (cur + remaining <= d.maxMinutes) {
        proposed.set(d.date, cur + remaining);
        break;
      }
    }
  }

  return proposed;
}
```

---

### `src/components/planner/FeasibilityModal.tsx` (component, request-response)

**Analog:** `src/components/planner/AllocationModal.tsx` lines 1-177

**Imports pattern:**
```typescript
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Modal,
  Form,
  DatePicker,
  Radio,
  Segmented,
  InputNumber,
  Button,
  Space,
  Alert,
  Typography,
  message,
} from 'antd';
import {
  ThunderboltOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import dayjs, { type Dayjs } from 'dayjs';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { upsertAllocation } from '../../db/repositories/allocationRepo';
import { formatMinutes } from '../../utils/time';
import { createFocusRestorer } from '../../utils/focus';
import { evaluateTaskFeasibility } from '../../utils/feasibility';
import { getTodayDateString } from '../../utils/date';
import type { Task, PlannedAllocation } from '../../types/models';
import type { DistributionStrategy, CandidateAllocation } from '../../types/feasibility';
```

**Focus restoration & state initialization pattern** (`src/components/planner/AllocationModal.tsx` lines 57-91):
```typescript
const restorerRef = useRef<(() => void) | null>(null);

useEffect(() => {
  if (open) {
    restorerRef.current = createFocusRestorer();
  }
}, [open]);

const handleClose = () => {
  onCancel();
  if (restorerRef.current) {
    restorerRef.current();
  }
};
```

**Reactive data loading pattern** (`src/components/planner/AllocationModal.tsx` lines 66-75, 102-117):
```typescript
const activeRules = useLiveQuery(() => db.capacityRules.toArray(), [db], []);
const activeOverrides = useLiveQuery(() => db.capacityOverrides.toArray(), [db], []);
const taskAllocations = useLiveQuery(
  () => db.plannedAllocations.where('taskId').equals(task?.id ?? '').toArray(),
  [task?.id, db],
  []
);
```

**Batch persistence with Dexie transaction** (`src/db/repositories/allocationRepo.ts` lines 43-73 + `src/components/planner/AllocationModal.tsx` lines 147-175):
```typescript
const handleApply = async () => {
  if (!task) return;
  const includedCandidates = candidates.filter((c) => c.included && c.proposedAllocatedMinutes > 0);
  if (includedCandidates.length === 0) {
    message.warning('No candidate allocations selected to apply');
    return;
  }

  setSubmitting(true);
  try {
    await db.transaction('rw', [db.plannedAllocations, db.tasks], async () => {
      for (const c of includedCandidates) {
        // D-08 / D-12: Merge with existing allocations on that date
        const newTotal = c.existingAllocatedMinutes + c.proposedAllocatedMinutes;
        await upsertAllocation(task.id, c.date, newTotal, db);
      }
    });

    const totalAppliedMinutes = includedCandidates.reduce(
      (sum, c) => sum + c.proposedAllocatedMinutes,
      0
    );
    message.success(
      `Successfully allocated ${formatMinutes(totalAppliedMinutes)} across ${includedCandidates.length} days`
    );
    onSuccess?.();
    handleClose();
  } catch {
    message.error('Failed to apply allocations');
  } finally {
    setSubmitting(false);
  }
};
```

---

### `src/components/planner/CandidateAllocationsTable.tsx` (component, request-response)

**Analog:** `src/components/tasks/TaskDrawerPlanning.tsx` lines 147-262

**Imports pattern:**
```typescript
import React from 'react';
import { Table, Checkbox, InputNumber, Space, Typography, Tag, Empty } from 'antd';
import dayjs from 'dayjs';
import { formatMinutes } from '../../utils/time';
import type { CandidateAllocation } from '../../types/feasibility';

const { Text } = Typography;
```

**Table columns & inline editing pattern** (`src/components/tasks/TaskDrawerPlanning.tsx` lines 147-164):
```typescript
export interface CandidateAllocationsTableProps {
  candidates: CandidateAllocation[];
  onToggleCandidate: (date: string, included: boolean) => void;
  onChangeMinutes: (date: string, minutes: number) => void;
  taskRemainingMinutes: number;
}

const columns = [
  {
    title: 'Include',
    key: 'include',
    width: 60,
    render: (_: unknown, record: CandidateAllocation) => (
      <Checkbox
        checked={record.included}
        onChange={(e) => onToggleCandidate(record.date, e.target.checked)}
        aria-label={`Include ${record.date}`}
      />
    ),
  },
  {
    title: 'Date',
    dataIndex: 'date',
    key: 'date',
    render: (d: string) => (
      <Text strong style={{ fontSize: 13 }}>
        {dayjs(d, 'YYYY-MM-DD').format('YYYY-MM-DD (ddd)')}
      </Text>
    ),
  },
  {
    title: 'Existing',
    dataIndex: 'existingAllocatedMinutes',
    key: 'existing',
    render: (m: number) => <Text type="secondary">{m > 0 ? formatMinutes(m) : '-'}</Text>,
  },
  {
    title: 'Proposed',
    key: 'proposed',
    render: (_: unknown, record: CandidateAllocation) => (
      <InputNumber
        min={0}
        max={record.maxAvailableMinutes}
        step={15}
        value={record.proposedAllocatedMinutes}
        disabled={!record.included}
        onChange={(v) => onChangeMinutes(record.date, v ?? 0)}
        suffix="m"
        style={{ width: 90 }}
        aria-label={`Proposed minutes for ${record.date}`}
      />
    ),
  },
  {
    title: 'Resulting Total',
    key: 'total',
    render: (_: unknown, record: CandidateAllocation) => (
      <Text strong>{formatMinutes(record.existingAllocatedMinutes + (record.included ? record.proposedAllocatedMinutes : 0))}</Text>
    ),
  },
];
```

---

### `src/components/planner/DateInspectionBreakdown.tsx` (component, request-response)

**Analog:** `src/components/settings/OverridesTable.tsx` lines 50-130

**Imports pattern:**
```typescript
import React from 'react';
import { Collapse, Table, Tag, Space, Typography } from 'antd';
import dayjs from 'dayjs';
import { formatMinutes } from '../../utils/time';
import type { DateInspectionItem, DateInspectionStatus } from '../../types/feasibility';

const { Text } = Typography;
```

**Status badge tag mapping pattern** (`src/components/settings/OverridesTable.tsx` / `src/components/tasks/InlineStatusTag.tsx`):
```typescript
const STATUS_TAGS: Record<DateInspectionStatus, { color: string; label: string }> = {
  available: { color: 'success', label: 'Available' },
  full: { color: 'default', label: 'Full' },
  overloaded: { color: 'error', label: 'Overloaded' },
  'excluded-past': { color: 'default', label: 'Past' },
  'excluded-non-working': { color: 'warning', label: 'Non-working' },
};
```

---

### `src/components/tasks/TaskDrawerPlanning.tsx` (component, CRUD - modification)

**Analog:** `src/components/tasks/TaskDrawerPlanning.tsx` lines 265-275

**Integration pattern** (adding Feasibility trigger button in Planning header):
```typescript
// Add FeasibilityModal trigger button next to Section Title
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
  <Title level={5} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
    <ClockCircleOutlined />
    <span>Planning & Daily Allocations</span>
  </Title>
  <Button
    size="small"
    icon={<ThunderboltOutlined />}
    onClick={() => setFeasibilityOpen(true)}
    aria-label="Check Feasibility & Auto-Distribute"
  >
    ✨ Auto-Distribute
  </Button>
</div>
```

---

### `src/views/PlannerView.tsx` (component, request-response - modification)

**Analog:** `src/views/PlannerView.tsx` lines 80-100

**Integration pattern** (toolbar action opening Feasibility / Auto-distribute):
```typescript
// In toolbar button group:
<Button
  icon={<ThunderboltOutlined />}
  onClick={() => setFeasibilityModalOpen(true)}
  aria-label="Auto-Distribute Tasks"
>
  Auto-Distribute
</Button>
```

---

### `tests/utils/feasibility.test.ts` (test, batch)

**Analog:** `tests/utils/capacity.test.ts` lines 80-140

**Setup & Assertion pattern:**
```typescript
import { describe, it, expect } from 'vitest';
import {
  evaluateTaskFeasibility,
  findEarliestFeasibleDate,
  distributeBalancedSpread,
  inspectDateCapacity,
} from '../../src/utils/feasibility';
import type { Task, CapacityRule, CapacityOverride } from '../../src/types/models';

describe('Feasibility Engine (CALC-01, CALC-02, CALC-03, CALC-04, CALC-05)', () => {
  const baseRules: CapacityRule[] = [
    { id: '1', dayOfWeek: 1, workMinutes: 480 }, // Mon: 8h
    { id: '2', dayOfWeek: 2, workMinutes: 480 }, // Tue: 8h
    { id: '3', dayOfWeek: 3, workMinutes: 480 }, // Wed: 8h
    { id: '4', dayOfWeek: 4, workMinutes: 480 }, // Thu: 8h
    { id: '5', dayOfWeek: 5, workMinutes: 480 }, // Fri: 8h
    { id: '6', dayOfWeek: 6, workMinutes: 0 },   // Sat: 0h
    { id: '7', dayOfWeek: 0, workMinutes: 0 },   // Sun: 0h
  ];

  it('CALC-01: evaluates unallocated remaining estimate against inclusive range', () => {
    // ...
  });
});
```

---

### `tests/components/FeasibilityModal.test.tsx` (test, event-driven)

**Analog:** `tests/components/AllocationModal.test.tsx` lines 1-105

**Setup & Interaction pattern:**
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../src/db/index';
import { createTask } from '../../src/db/repositories/taskRepo';
import { FeasibilityModal } from '../../src/components/planner/FeasibilityModal';

describe('FeasibilityModal Component (CALC-03, CALC-05, CALC-06, D-14, D-15)', () => {
  let testDb: TaskPlannerDatabase;

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase('TestFeasibilityModal_' + Math.random().toString(36).slice(2));
    await testDb.open();
  });

  afterEach(async () => {
    await testDb.delete();
  });

  it('renders modal with feasibility banner, candidate allocations table, and breakdown', async () => {
    // ...
  });

  it('CALC-06: candidate minute edits do not mutate IndexedDB until Apply Allocations is clicked', async () => {
    // ...
  });
});
```

---

## Shared Patterns

### 1. Focus Management (Modals and Drawers)
**Source:** `src/utils/focus.ts`
**Apply to:** `FeasibilityModal.tsx`
```typescript
const restorerRef = useRef<(() => void) | null>(null);
useEffect(() => {
  if (open) {
    restorerRef.current = createFocusRestorer();
  }
}, [open]);

const handleClose = () => {
  onCancel();
  if (restorerRef.current) restorerRef.current();
};
```

### 2. Time Format and Granularity
**Source:** `src/utils/time.ts`
**Apply to:** All table columns, banners, and tooltips
```typescript
import { formatMinutes } from '../../utils/time';
// formatMinutes(150) -> '2h 30m'
```

### 3. Atomic Multi-Record Writes (D-12 Unique Constraint)
**Source:** `src/db/repositories/allocationRepo.ts` lines 43-73
**Apply to:** Commit action in `FeasibilityModal.tsx`
```typescript
await db.transaction('rw', [db.plannedAllocations, db.tasks], async () => {
  for (const candidate of selectedCandidates) {
    await upsertAllocation(task.id, candidate.date, candidate.totalMinutes, db);
  }
});
```

---

## No Analog Found

*None. All new and modified files have direct structural analogs in the current codebase.*

---

## Metadata

**Analog search scope:** `src/types`, `src/utils`, `src/components/planner`, `src/components/tasks`, `src/views`, `tests`  
**Files scanned:** 58  
**Pattern extraction date:** 2026-09-27  
