# Phase 10: Date-Range Search, Multi-Criteria Filtering & Standup Export - Pattern Map

**Mapped:** 2026-09-28  
**Files analyzed:** 10 (7 source + 3 test)  
**Analogs found:** 10 / 10 (all git-tracked in repository)  

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/utils/filter.ts` | utility | transform / predicate | `src/utils/filter.ts` | exact |
| `src/utils/standup.ts` | utility | transform / string generation | `src/utils/time.ts` | role-match |
| `src/hooks/useTaskFilters.ts` | hook | state / reactive query | `src/hooks/useTaskFilters.ts` | exact |
| `src/db/repositories/allocationRepo.ts` | service / model | CRUD / query | `src/db/repositories/allocationRepo.ts` | exact |
| `src/components/tasks/TaskFilterBar.tsx` | component | request-response / form | `src/components/tasks/TaskFilterBar.tsx` | exact |
| `src/components/tasks/TaskTable.tsx` | component | request-response / view | `src/components/tasks/TaskTable.tsx` | exact |
| `src/views/TasksView.tsx` | view | request-response / coordinator | `src/views/TasksView.tsx` | exact |
| `tests/utils/standup.test.ts` | test | assertion | `tests/utils/filter.test.ts` | exact |
| `tests/utils/filter.test.ts` | test | assertion | `tests/utils/filter.test.ts` | exact |
| `tests/db/allocationRepo.test.ts` | test | assertion / database | `tests/db/allocationRepo.test.ts` | exact |

---

## Pattern Assignments

### 1. `src/utils/filter.ts` (utility, transform / predicate)

**Analog:** `src/utils/filter.ts` (tracked)

**Imports pattern** (`src/utils/filter.ts:1-3`):
```typescript
import dayjs from 'dayjs';
import type { Task, TaskPriority, TaskStatus, WorkType, Project, Milestone } from '../types/models';
import { resolveInheritedTags } from '../domain/inheritance';
```

**Core filter state & count pattern** (`src/utils/filter.ts:4-22`):
```typescript
export interface TaskFilterState {
  search: string;
  hierarchyScope: 'all' | 'projects' | 'standalone';
  projectId: string | null;
  milestoneId: string | null;
  statuses: TaskStatus[];
  priorities: TaskPriority[];
  workTypes: WorkType[];
  opsOwners: string[];
  businessAnalysts: string[];
  horizon: 'all' | 'overdue' | 'today' | 'this_week';
  executionDateRange: [string, string] | null;
  deadlineRange: [string, string] | null;
  includeClosed: boolean;
}

export const DEFAULT_TASK_FILTER_STATE: TaskFilterState = {
  search: '',
  hierarchyScope: 'all',
  projectId: null,
  milestoneId: null,
  statuses: ['Open', 'In Progress', 'Resolved', 'In Review'],
  priorities: [],
  workTypes: [],
  opsOwners: [],
  businessAnalysts: [],
  horizon: 'all',
  executionDateRange: null,
  deadlineRange: null,
  includeClosed: false,
};

export function countActiveAdvancedFilters(filters: TaskFilterState): number {
  let count = 0;
  if (filters.milestoneId) count++;
  if (filters.workTypes && filters.workTypes.length > 0) count++;
  if (filters.opsOwners && filters.opsOwners.length > 0) count++;
  if (filters.businessAnalysts && filters.businessAnalysts.length > 0) count++;
  if (filters.executionDateRange && filters.executionDateRange[0] && filters.executionDateRange[1]) count++;
  if (filters.deadlineRange && filters.deadlineRange[0] && filters.deadlineRange[1]) count++;
  return count;
}
```

**Filter evaluation pattern with inheritance & Set check** (`src/utils/filter.ts:71-140`):
```typescript
export interface FilterContext {
  todayStr: string;
  projectMap?: Map<string, Project>;
  milestoneMap?: Map<string, Milestone>;
  executionTaskIds?: Set<string> | null;
}

export function filterTasks(
  tasks: Task[],
  filterState: TaskFilterState,
  context: FilterContext
): Task[] {
  const { todayStr, projectMap, milestoneMap, executionTaskIds } = context;
  const searchTerm = filterState.search.trim().toLowerCase();

  return tasks.filter((task) => {
    // 1. Text search
    if (searchTerm) {
      const matchName = task.name.toLowerCase().includes(searchTerm);
      const matchDesc = (task.description ?? '').toLowerCase().includes(searchTerm);
      const matchNotes = (task.notes ?? '').toLowerCase().includes(searchTerm);
      if (!matchName && !matchDesc && !matchNotes) return false;
    }

    // 2. Milestone filter
    if (filterState.milestoneId && task.milestoneId !== filterState.milestoneId) {
      return false;
    }

    // 3. WorkType filter
    if (filterState.workTypes && filterState.workTypes.length > 0) {
      if (!task.workType || !filterState.workTypes.includes(task.workType)) {
        return false;
      }
    }

    // 4. Ops Owners filter with inheritance
    if (filterState.opsOwners && filterState.opsOwners.length > 0) {
      const ancestors = {
        project: task.projectId ? projectMap?.get(task.projectId) : undefined,
        milestone: task.milestoneId ? milestoneMap?.get(task.milestoneId) : undefined,
      };
      const resolved = resolveInheritedTags('opsOwners', task, ancestors);
      const hasMatch = filterState.opsOwners.some((target) =>
        resolved.tags.some((t) => t.toLowerCase() === target.toLowerCase())
      );
      if (!hasMatch) return false;
    }

    // 5. Deadline date range
    if (filterState.deadlineRange && filterState.deadlineRange[0] && filterState.deadlineRange[1]) {
      if (!task.deadline) return false;
      const [start, end] = filterState.deadlineRange;
      if (task.deadline < start || task.deadline > end) return false;
    }

    // 6. Execution date range via planned allocations Set
    if (executionTaskIds !== null && executionTaskIds !== undefined) {
      if (!executionTaskIds.has(task.id)) return false;
    }

    return true;
  });
}
```

---

### 2. `src/utils/standup.ts` (utility, transform / string generation & clipboard)

**Analog:** `src/utils/time.ts` (pure formatting) and `src/components/tasks/WorkTypeBadge.tsx` (labels config)

**Imports pattern**:
```typescript
import type { Task, Project, Milestone } from '../types/models';
import { WORK_TYPE_CONFIG } from '../components/tasks/WorkTypeBadge';
import { resolveInheritedTags } from '../domain/inheritance';
```

**Core formatting pattern**:
```typescript
export interface StandupContext {
  projectMap: Map<string, Project>;
  milestoneMap: Map<string, Milestone>;
  dateStr: string;
}

export function formatStandupSummary(tasks: Task[], context: StandupContext): string {
  const { projectMap, milestoneMap, dateStr } = context;

  // Exclude Cancelled tasks per D-09
  const activeAndDone = tasks.filter((t) => t.status !== 'Cancelled');

  const doneTasks = activeAndDone.filter((t) => t.status === 'Done');
  const inProgressTasks = activeAndDone.filter(
    (t) => t.status === 'In Progress' || t.status === 'In Review' || t.status === 'Resolved'
  );
  const openTasks = activeAndDone.filter((t) => t.status === 'Open');

  const formatTaskLine = (task: Task): string => {
    const workConfig = WORK_TYPE_CONFIG[task.workType ?? 'code'] ?? WORK_TYPE_CONFIG.code;
    const project = task.projectId ? projectMap.get(task.projectId) : undefined;
    const milestone = task.milestoneId ? milestoneMap.get(task.milestoneId) : undefined;
    const projectName = project ? project.name : 'Độc lập';
    const deadlineText = task.deadline ?? 'Chưa đặt';

    const ancestors = { project, milestone };
    const ops = resolveInheritedTags('opsOwners', task, ancestors).tags;
    const bas = resolveInheritedTags('businessAnalysts', task, ancestors).tags;

    let responsibleText = 'Chưa phân công';
    if (ops.length > 0 && bas.length > 0) {
      responsibleText = `Ops: ${ops.join(', ')} | BA: ${bas.join(', ')}`;
    } else if (ops.length > 0) {
      responsibleText = `Ops: ${ops.join(', ')}`;
    } else if (bas.length > 0) {
      responsibleText = `BA: ${bas.join(', ')}`;
    }

    return `- [${workConfig.label}] ${task.name} (Dự án: ${projectName} | Hạn: ${deadlineText} | Phụ trách: ${responsibleText})`;
  };

  const renderSection = (title: string, list: Task[]): string => {
    if (list.length === 0) {
      return `${title}\n- (Không có)`;
    }
    return `${title}\n${list.map(formatTaskLine).join('\n')}`;
  };

  return [
    `## Báo cáo Standup (${dateStr})`,
    '',
    renderSection('### ✅ Đã hoàn thành', doneTasks),
    '',
    renderSection('### 🔄 Đang thực hiện', inProgressTasks),
    '',
    renderSection('### 📋 Kế hoạch / Đang chờ', openTasks),
  ].join('\n');
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}
```

---

### 3. `src/hooks/useTaskFilters.ts` (hook, state / reactive query)

**Analog:** `src/hooks/useTaskFilters.ts` (tracked)

**Imports pattern** (`src/hooks/useTaskFilters.ts:1-10`):
```typescript
import { useState, useEffect, useMemo } from 'react';
import type { Task, Project, Milestone } from '../types/models';
import {
  filterTasks,
  sortTasks,
  DEFAULT_TASK_FILTER_STATE,
  type TaskFilterState,
} from '../utils/filter';
import { getTodayDateString } from '../utils/date';
```

**State management & memoized filter pattern** (`src/hooks/useTaskFilters.ts:23-79`):
```typescript
export interface UseTaskFiltersOptions {
  projectMap?: Map<string, Project>;
  milestoneMap?: Map<string, Milestone>;
  executionTaskIds?: Set<string> | null;
}

export function useTaskFilters(
  tasks: Task[] = [],
  options: UseTaskFiltersOptions = {}
): UseTaskFiltersReturn {
  const { projectMap, milestoneMap, executionTaskIds } = options;
  const [filters, setFiltersState] = useState<TaskFilterState>(DEFAULT_TASK_FILTER_STATE);
  const [debouncedSearch, setDebouncedSearch] = useState<string>(filters.search);
  const [sortField, setSortField] = useState<string | undefined>(undefined);
  const [sortOrder, setSortOrder] = useState<'ascend' | 'descend' | undefined>(undefined);

  // 200ms search debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(filters.search);
    }, 200);
    return () => clearTimeout(timer);
  }, [filters.search]);

  const todayStr = useMemo(() => getTodayDateString(), []);

  const filteredTasks = useMemo(() => {
    const effectiveFilterState: TaskFilterState = {
      ...filters,
      search: debouncedSearch,
    };
    const matched = filterTasks(tasks, effectiveFilterState, {
      todayStr,
      projectMap,
      milestoneMap,
      executionTaskIds,
    });
    return sortTasks(matched, sortField, sortOrder);
  }, [tasks, filters, debouncedSearch, sortField, sortOrder, todayStr, projectMap, milestoneMap, executionTaskIds]);
```

---

### 4. `src/db/repositories/allocationRepo.ts` (service / model, CRUD / query)

**Analog:** `src/db/repositories/allocationRepo.ts` lines 200-210 (tracked)

**Date range cursor query pattern**:
```typescript
/**
 * Queries unique task IDs that have planned allocations in the specified date range (SRCH-01, D-05).
 */
export async function getTaskIdsWithAllocationsInRange(
  startDate: string,
  endDate: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<Set<string>> {
  const allocations = await db.plannedAllocations
    .where('date')
    .between(startDate, endDate, true, true)
    .toArray();
  return new Set(allocations.map((a) => a.taskId));
}
```

---

### 5. `src/components/tasks/TaskFilterBar.tsx` (component, request-response / form)

**Analog:** `src/components/tasks/TaskFilterBar.tsx` (tracked)

**Imports pattern**:
```typescript
import React, { useState } from 'react';
import {
  Input,
  Select,
  Segmented,
  Checkbox,
  Radio,
  Space,
  Button,
  Badge,
  DatePicker,
  theme,
  type InputRef,
} from 'antd';
import {
  SearchOutlined,
  FilterOutlined,
  ClearOutlined,
  DownOutlined,
  UpOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { TaskFilterState } from '../../utils/filter';
import { countActiveAdvancedFilters, DEFAULT_TASK_FILTER_STATE } from '../../utils/filter';
import type { Project, Milestone, TaskStatus, TaskPriority, WorkType } from '../../types/models';
import { WORK_TYPE_CONFIG } from './WorkTypeBadge';
```

**Collapsible section & RangePicker pattern**:
```typescript
const [advancedOpen, setAdvancedOpen] = useState(false);
const activeAdvancedCount = countActiveAdvancedFilters(filters);

// DatePicker.RangePicker handling standard YYYY-MM-DD strings (D-02)
<DatePicker.RangePicker
  placeholder={['Kế hoạch từ', 'đến']}
  value={
    filters.executionDateRange && filters.executionDateRange[0] && filters.executionDateRange[1]
      ? [dayjs(filters.executionDateRange[0]), dayjs(filters.executionDateRange[1])]
      : null
  }
  onChange={(_, dateStrings) => {
    if (dateStrings[0] && dateStrings[1]) {
      onFilterChange({ executionDateRange: [dateStrings[0], dateStrings[1]] });
    } else {
      onFilterChange({ executionDateRange: null });
    }
  }}
/>
```

**Toggle button with Badge pattern** (UI-SPEC § Component Inventory):
```typescript
<Badge count={activeAdvancedCount} offset={[-2, 2]} size="small">
  <Button
    icon={<FilterOutlined />}
    onClick={() => setAdvancedOpen((prev) => !prev)}
    aria-label="Bộ lọc nâng cao"
  >
    Bộ lọc nâng cao {advancedOpen ? <UpOutlined /> : <DownOutlined />}
  </Button>
</Badge>

<Button
  icon={<ClearOutlined />}
  onClick={() => onFilterChange(DEFAULT_TASK_FILTER_STATE)}
  aria-label="Xóa bộ lọc"
>
  Xóa bộ lọc
</Button>
```

---

### 6. `src/components/tasks/TaskTable.tsx` (component, view / table)

**Analog:** `src/components/tasks/TaskTable.tsx` (tracked)

**Toolbar Standup CTA button with clipboard & fallback modal**:
```typescript
import { Button, message, Modal, Input } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { formatStandupSummary, copyTextToClipboard } from '../../utils/standup';

// Toolbar CTA
<Button
  icon={<CopyOutlined />}
  onClick={handleCopyStandup}
  aria-label="Sao chép Standup"
>
  Sao chép Standup
</Button>
```

**Clipboard action & error fallback pattern**:
```typescript
const handleCopyStandup = async () => {
  const markdown = formatStandupSummary(tasks, {
    projectMap,
    milestoneMap,
    dateStr: today,
  });

  const copied = await copyTextToClipboard(markdown);
  if (copied) {
    message.success({ content: 'Đã sao chép báo cáo Standup vào clipboard', duration: 2 });
  } else {
    message.error({
      content: 'Không thể sao chép Standup vào clipboard. Vui lòng cấp quyền truy cập bảng tạm cho trình duyệt.',
      duration: 3,
    });
    // Fallback modal per UI-SPEC & Pitfall 3
    setFallbackText(markdown);
    setFallbackModalOpen(true);
  }
};
```

---

### 7. `src/views/TasksView.tsx` (view, coordinator)

**Analog:** `src/views/TasksView.tsx` (tracked)

**Reactive execution date query integration**:
```typescript
// Query matching task IDs reactively when executionDateRange is set (D-05)
const executionTaskIds = useLiveQuery(async () => {
  if (
    !filters.executionDateRange ||
    !filters.executionDateRange[0] ||
    !filters.executionDateRange[1]
  ) {
    return null;
  }
  const [start, end] = filters.executionDateRange;
  return getTaskIdsWithAllocationsInRange(start, end, db);
}, [db, filters.executionDateRange?.[0], filters.executionDateRange?.[1]]);
```

---

### 8. `tests/utils/standup.test.ts` (test, assertion)

**Analog:** `tests/domain/inheritance.test.ts` and `tests/utils/filter.test.ts` (tracked)

**Test file pattern**:
```typescript
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { formatStandupSummary } from '../../src/utils/standup';
import type { Task, Project, Milestone } from '../../src/types/models';

describe('formatStandupSummary (SRCH-04, D-08, D-09, D-10)', () => {
  it('groups tasks into Done, In Progress, and Open sections with Vietnamese banking headers', () => {
    // Excludes Cancelled tasks
    // Formats responsible parties Ops and BA
    // Shows '- (Không có)' for empty sections
  });
});
```

---

## Shared Patterns

### Date Range Handling & Formatting
**Source:** `src/utils/date.ts` and `src/utils/filter.ts`  
**Apply to:** All date inputs, Dexie queries, and table comparisons  
- Canonical dates MUST always remain `YYYY-MM-DD` strings.
- In Ant Design `DatePicker.RangePicker`, read canonical strings from `dateStrings: [string, string]`.
- String comparisons `<` and `>` are strictly lexicographical for `YYYY-MM-DD`.

### Tag Inheritance Resolution
**Source:** `src/domain/inheritance.ts:14-39`  
**Apply to:** `src/utils/filter.ts` (Ops/BA filtering) and `src/utils/standup.ts` (standup item line formatting)  
```typescript
const ancestors = {
  project: task.projectId ? projectMap?.get(task.projectId) : undefined,
  milestone: task.milestoneId ? milestoneMap?.get(task.milestoneId) : undefined,
};
const ops = resolveInheritedTags('opsOwners', task, ancestors).tags;
const bas = resolveInheritedTags('businessAnalysts', task, ancestors).tags;
```

### UI Copywriting & Feedback Standards
**Source:** `10-UI-SPEC.md` § Copywriting Contract  
**Apply to:** `TaskTable.tsx`, `TaskFilterBar.tsx`  
- Primary CTA: `Sao chép Standup`
- Secondary CTA: `Bộ lọc nâng cao`
- Reset CTA: `Xóa bộ lọc`
- Success toast: `Đã sao chép báo cáo Standup vào clipboard` (duration: 2s)
- Error toast: `Không thể sao chép Standup vào clipboard. Vui lòng cấp quyền truy cập bảng tạm cho trình duyệt.`
- Empty state heading: `Không có tác vụ phù hợp`

---

## No Analog Found

All required files have existing tracked analogs in the codebase.

| File | Role | Data Flow | Reason |
|---|---|---|---|
| (none) | — | — | Full analog coverage |

---

## Metadata

**Analog search scope:** `src/`, `tests/`  
**Files scanned:** 10  
**Pattern extraction date:** 2026-09-28  
