# Phase 5: Actionable Dashboard & Workload Forecasting - Pattern Map

**Mapped:** 2026-09-27
**Files analyzed:** 14
**Analogs found:** 14 / 14

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/types/navigation.ts` | config | static definition | `src/types/navigation.ts` | exact |
| `src/types/dashboard.ts` | model | static definition | `src/types/models.ts` | role-match |
| `src/utils/dashboard.ts` | utility | transform / batch | `src/utils/capacity.ts` | role-match |
| `src/hooks/useHashRoute.ts` | hook | event-driven / request-response | `src/hooks/useHashRoute.ts` | exact |
| `src/hooks/useDashboardForecast.ts` | hook | streaming (Dexie reactive) | `src/hooks/useWeeklyPlanner.ts` | exact |
| `src/components/shell/Navigation.tsx` | component | request-response | `src/components/shell/Navigation.tsx` | exact |
| `src/components/dashboard/TodaySummaryCard.tsx` | component | transform | `src/components/planner/DayColumnHeader.tsx` | role-match |
| `src/components/dashboard/AttentionTodayList.tsx` | component | CRUD / request-response | `src/components/tasks/TaskTable.tsx` | role-match |
| `src/components/dashboard/MiniDayCard.tsx` | component | request-response | `src/components/planner/DayColumnHeader.tsx` | role-match |
| `src/components/dashboard/WorkloadForecast.tsx` | component | request-response | `src/components/planner/WeekNavigator.tsx` | role-match |
| `src/views/DashboardView.tsx` | controller / view | streaming (reactive view) | `src/views/PlannerView.tsx` | role-match |
| `src/views/PlannerView.tsx` | controller / view | request-response (param sync) | `src/views/PlannerView.tsx` | exact |
| `src/App.tsx` | controller / router | request-response | `src/App.tsx` | exact |
| `tests/utils/dashboard.test.ts` | test | batch / assertion | `tests/utils/capacity.test.ts` | role-match |

---

## Pattern Assignments

### `src/types/navigation.ts` (config, static definition)

**Analog:** `src/types/navigation.ts`

**Core Pattern** (lines 1-2):
```typescript
// Add 'dashboard' to union
export type AppRoute = 'dashboard' | 'tasks' | 'projects' | 'planner' | 'settings';
```

---

### `src/types/dashboard.ts` (model, static definition)

**Analog:** `src/types/models.ts`

**Core Pattern**:
```typescript
import type { Task, PlannedAllocation } from './models';
import type { DayCapacityMetrics } from '../utils/capacity';

export type ForecastHorizon = 7 | 14 | 30;

export interface AttentionTaskItem {
  task: Task;
  category: 'overdue' | 'due-today' | 'scheduled-today';
  daysOverdue?: number;
  scheduledMinutes?: number;
}

export interface HorizonDayData {
  date: string;
  dayOfWeek: number;
  dayName: string;
  isToday: boolean;
  metrics: DayCapacityMetrics;
  excessMinutes: number;
}

export interface DashboardForecastState {
  todayDate: string;
  todayMetrics: DayCapacityMetrics | null;
  attentionTasks: AttentionTaskItem[];
  horizon: ForecastHorizon;
  horizonDays: HorizonDayData[];
  overloadedDays: Array<{ date: string; excessMinutes: number }>;
  totalExcessMinutes: number;
  isLoading: boolean;
}
```

---

### `src/utils/dashboard.ts` (utility, transform / batch)

**Analog:** `src/utils/capacity.ts`

**Imports Pattern**:
```typescript
import dayjs from 'dayjs';
import type { Task, PlannedAllocation, CapacityRule, CapacityOverride } from '../types/models';
import { getEffectiveDailyCapacity, calculateDayMetrics, type DayCapacityMetrics } from './capacity';
import { isTaskActive } from '../db/repositories/allocationRepo';
import type { AttentionTaskItem, HorizonDayData } from '../types/dashboard';
```

**Core Transform Pattern**:
```typescript
// Categorize & sort attention items per D-09 & D-10
export function categorizeAttentionTasks(
  tasks: Task[],
  todayAllocations: PlannedAllocation[],
  today: string
): AttentionTaskItem[] {
  const allocationMap = new Map<string, number>();
  for (const alloc of todayAllocations) {
    allocationMap.set(alloc.taskId, (allocationMap.get(alloc.taskId) ?? 0) + alloc.allocatedMinutes);
  }

  const overdue: AttentionTaskItem[] = [];
  const dueToday: AttentionTaskItem[] = [];
  const scheduledToday: AttentionTaskItem[] = [];

  const priorityWeight: Record<Task['priority'], number> = {
    Urgent: 4,
    High: 3,
    Medium: 2,
    Low: 1,
  };

  for (const task of tasks) {
    if (!isTaskActive(task.status)) continue;
    const scheduledMins = allocationMap.get(task.id) ?? 0;

    if (task.deadline && task.deadline < today) {
      const daysOverdue = dayjs(today, 'YYYY-MM-DD').diff(dayjs(task.deadline, 'YYYY-MM-DD'), 'day');
      overdue.push({ task, category: 'overdue', daysOverdue, scheduledMinutes: scheduledMins });
    } else if (task.deadline && task.deadline === today) {
      dueToday.push({ task, category: 'due-today', scheduledMinutes: scheduledMins });
    } else if (scheduledMins > 0) {
      scheduledToday.push({ task, category: 'scheduled-today', scheduledMinutes: scheduledMins });
    }
  }

  overdue.sort((a, b) => (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0));
  dueToday.sort((a, b) => priorityWeight[b.task.priority] - priorityWeight[a.task.priority]);
  scheduledToday.sort((a, b) => (b.scheduledMinutes ?? 0) - (a.scheduledMinutes ?? 0));

  return [...overdue, ...dueToday, ...scheduledToday];
}

// Generate horizon calendar dates per D-05 & D-08
export function getHorizonDates(startDate: string, daysCount: number): string[] {
  const start = dayjs(startDate, 'YYYY-MM-DD');
  const dates: string[] = [];
  for (let i = 0; i < daysCount; i++) {
    dates.push(start.add(i, 'day').format('YYYY-MM-DD'));
  }
  return dates;
}
```

---

### `src/hooks/useHashRoute.ts` (hook, event-driven / request-response)

**Analog:** `src/hooks/useHashRoute.ts`

**Imports Pattern**:
```typescript
import { useState, useEffect } from 'react';
import type { AppRoute } from '../types/navigation';
```

**Hash Parsing & Navigation Pattern**:
```typescript
export interface HashRouteState {
  route: AppRoute;
  params: Record<string, string>;
  navigate: (nextRoute: AppRoute, nextParams?: Record<string, string>) => void;
}

export function parseHash(hashStr: string, defaultRoute: AppRoute = 'dashboard'): { route: AppRoute; params: Record<string, string> } {
  if (!hashStr) return { route: defaultRoute, params: {} };
  const clean = hashStr.replace(/^#\/?/, '').trim();
  const [routePart, queryPart] = clean.split('?');
  const validRoutes: AppRoute[] = ['dashboard', 'tasks', 'projects', 'planner', 'settings'];
  const route = validRoutes.includes(routePart as AppRoute) ? (routePart as AppRoute) : defaultRoute;

  const params: Record<string, string> = {};
  if (queryPart) {
    const searchParams = new URLSearchParams(queryPart);
    searchParams.forEach((val, key) => {
      params[key] = val;
    });
  }
  return { route, params };
}

export function buildHash(route: AppRoute, params?: Record<string, string>): string {
  if (!params || Object.keys(params).length === 0) {
    return `#/${route}`;
  }
  const query = new URLSearchParams(params).toString();
  return `#/${route}?${query}`;
}

export function useHashRoute(defaultRoute: AppRoute = 'dashboard'): HashRouteState {
  const getStateFromHash = (): { route: AppRoute; params: Record<string, string> } => {
    if (typeof window === 'undefined') return { route: defaultRoute, params: {} };
    return parseHash(window.location.hash, defaultRoute);
  };

  const [state, setState] = useState(getStateFromHash);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onHashChange = () => setState(getStateFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [defaultRoute]);

  const navigate = (nextRoute: AppRoute, nextParams?: Record<string, string>) => {
    if (typeof window !== 'undefined') {
      window.location.hash = buildHash(nextRoute, nextParams);
    }
    setState({ route: nextRoute, params: nextParams ?? {} });
  };

  return { route: state.route, params: state.params, navigate };
}
```

---

### `src/hooks/useDashboardForecast.ts` (hook, streaming / Dexie reactive)

**Analog:** `src/hooks/useWeeklyPlanner.ts`

**Imports Pattern**:
```typescript
import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import dayjs from 'dayjs';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import { getEffectiveDailyCapacity, calculateDayMetrics } from '../utils/capacity';
import { isTaskActive } from '../db/repositories/allocationRepo';
import { getTodayDateString } from '../utils/date';
import { categorizeAttentionTasks, getHorizonDates } from '../utils/dashboard';
import type { ForecastHorizon, DashboardForecastState, HorizonDayData } from '../types/dashboard';
import type { CapacityOverride, Task } from '../types/models';
```

**Reactive Live Query Pattern**:
```typescript
export function useDashboardForecast(
  targetDb: TaskPlannerDatabase = defaultDb,
  initialHorizon: ForecastHorizon = 7
): DashboardForecastState & { setHorizon: (h: ForecastHorizon) => void } {
  const [horizon, setHorizon] = useState<ForecastHorizon>(initialHorizon);
  const todayDate = useMemo(() => getTodayDateString(), []);

  const dates = useMemo(() => getHorizonDates(todayDate, horizon), [todayDate, horizon]);
  const horizonStartDate = dates[0]!;
  const horizonEndDate = dates[dates.length - 1]!;

  const liveData = useLiveQuery(
    async () => {
      const rules = await targetDb.capacityRules.toArray();
      const overrides = await targetDb.capacityOverrides
        .where('date')
        .between(horizonStartDate, horizonEndDate, true, true)
        .toArray();
      const overrideMap = new Map<string, CapacityOverride>(overrides.map((o) => [o.date, o]));

      const allocations = await targetDb.plannedAllocations
        .where('date')
        .between(horizonStartDate, horizonEndDate, true, true)
        .toArray();

      const taskIds = Array.from(new Set(allocations.map((a) => a.taskId)));
      const allocTasks = taskIds.length > 0 ? await targetDb.tasks.where('id').anyOf(taskIds).toArray() : [];
      const taskMap = new Map<string, Task>(allocTasks.map((t) => [t.id, t]));

      const allTasks = await targetDb.tasks.toArray();
      const todayAllocations = allocations.filter((a) => a.date === todayDate);
      const attentionTasks = categorizeAttentionTasks(allTasks, todayAllocations, todayDate);

      // Map day metrics across active horizon
      // ...
    },
    [horizonStartDate, horizonEndDate, todayDate, targetDb]
  );
  // ...
}
```

---

### `src/components/shell/Navigation.tsx` (component, request-response)

**Analog:** `src/components/shell/Navigation.tsx`

**Menu Items Excerpt** (lines 18-39):
```typescript
import {
  DashboardOutlined,
  CheckSquareOutlined,
  ProjectOutlined,
  CalendarOutlined,
  SettingOutlined,
} from '@ant-design/icons';

const items: MenuItem[] = [
  {
    key: 'dashboard',
    icon: <DashboardOutlined />,
    label: 'Tổng quan',
  },
  {
    key: 'tasks',
    icon: <CheckSquareOutlined />,
    label: 'Tác vụ',
  },
  // ...
];
```

---

### `src/components/dashboard/TodaySummaryCard.tsx` (component, transform)

**Analog:** `src/components/planner/DayColumnHeader.tsx`

**Imports Pattern**:
```typescript
import React from 'react';
import { Card, Statistic, Progress, Tag, Button, Space, Typography } from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  MinusCircleOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons';
import type { DayCapacityMetrics } from '../../utils/capacity';
import { formatMinutes } from '../../utils/time';
```

**Dual-Encoding & Status Badge Pattern**:
```typescript
const LOAD_STATUS_CONFIG = {
  available: { label: 'Khả dụng', color: 'success' as const, icon: <CheckCircleOutlined /> },
  busy: { label: 'Bận', color: 'warning' as const, icon: <ClockCircleOutlined /> },
  overloaded: { label: 'Quá tải', color: 'error' as const, icon: <ExclamationCircleOutlined /> },
  'no-capacity': { label: 'Nghỉ', color: 'default' as const, icon: <MinusCircleOutlined /> },
};
```

---

### `src/components/dashboard/AttentionTodayList.tsx` (component, CRUD / request-response)

**Analog:** `src/components/tasks/TaskTable.tsx` & `src/components/tasks/InlineStatusTag.tsx`

**Inline Actions Pattern**:
```typescript
import { Checkbox, List, Tag, Space, Typography, Button } from 'antd';
import { InlineStatusTag } from '../tasks/InlineStatusTag';
import { updateTaskStatus } from '../../db/repositories/taskRepo';

// Mark done checkbox directly persists to Dexie
const handleToggleDone = async (task: Task) => {
  const nextStatus = task.status === 'Done' ? 'Open' : 'Done';
  await updateTaskStatus(task.id, nextStatus, db);
};
```

---

### `src/components/dashboard/MiniDayCard.tsx` (component, request-response)

**Analog:** `src/components/planner/DayColumnHeader.tsx`

**Card Pattern & Click Navigation**:
```typescript
export interface MiniDayCardProps {
  day: HorizonDayData;
  onNavigateToDate: (date: string) => void;
}

export const MiniDayCard: React.FC<MiniDayCardProps> = ({ day, onNavigateToDate }) => {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onNavigateToDate(day.date)}
      style={{
        cursor: 'pointer',
        padding: '8px 10px',
        borderRadius: 6,
        border: day.metrics.isOverloaded ? '1px solid #ff4d4f' : '1px solid #f0f0f0',
        backgroundColor: day.isToday ? 'rgba(22, 119, 255, 0.05)' : '#ffffff',
      }}
    >
      {/* Date, Status Tag, Mini Progress, Net balance */}
    </div>
  );
};
```

---

### `src/components/dashboard/WorkloadForecast.tsx` (component, request-response)

**Analog:** `src/components/planner/WeekNavigator.tsx` & `05-RESEARCH.md` Pattern 3

**Segmented Switcher & Overload Alert Pattern**:
```typescript
import React from 'react';
import { Card, Segmented, Alert, Space, Tag, Typography } from 'antd';
import type { ForecastHorizon, HorizonDayData } from '../../types/dashboard';
import { MiniDayCard } from './MiniDayCard';
import { formatMinutes } from '../../utils/time';

export interface WorkloadForecastProps {
  horizon: ForecastHorizon;
  onHorizonChange: (h: ForecastHorizon) => void;
  horizonDays: HorizonDayData[];
  overloadedDays: Array<{ date: string; excessMinutes: number }>;
  onDateClick: (date: string) => void;
}
```

---

### `src/views/DashboardView.tsx` (controller / view, streaming)

**Analog:** `src/views/PlannerView.tsx`

**Imports Pattern**:
```typescript
import React, { useState } from 'react';
import { Grid, Row, Col } from 'antd';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import { useDashboardForecast } from '../hooks/useDashboardForecast';
import { TodaySummaryCard } from '../components/dashboard/TodaySummaryCard';
import { AttentionTodayList } from '../components/dashboard/AttentionTodayList';
import { WorkloadForecast } from '../components/dashboard/WorkloadForecast';
import { TaskDrawer } from '../components/tasks/TaskDrawer';
import type { AppRoute } from '../types/navigation';
```

**Layout & In-Place Inspection Pattern**:
```typescript
export interface DashboardViewProps {
  db?: TaskPlannerDatabase;
  onNavigate?: (route: AppRoute, params?: Record<string, string>) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ db = defaultDb, onNavigate }) => {
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);
  const forecast = useDashboardForecast(db);
  const screens = Grid.useBreakpoint();

  const handleDateClick = (date: string) => {
    onNavigate?.('planner', { date });
  };

  return (
    <div data-testid="dashboard-view" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Top Tier: Today Focus */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <TodaySummaryCard
            metrics={forecast.todayMetrics}
            scheduledCount={forecast.attentionTasks.filter(t => t.category === 'scheduled-today').length}
            onOpenPlanner={() => handleDateClick(forecast.todayDate)}
          />
        </Col>
        <Col xs={24} lg={16}>
          <AttentionTodayList
            items={forecast.attentionTasks}
            onTaskClick={(taskId) => setDrawerTaskId(taskId)}
            onViewAllTasks={() => onNavigate?.('tasks')}
            db={db}
          />
        </Col>
      </Row>

      {/* Bottom Tier: Workload Forecast */}
      <WorkloadForecast
        horizon={forecast.horizon}
        onHorizonChange={forecast.setHorizon}
        horizonDays={forecast.horizonDays}
        overloadedDays={forecast.overloadedDays}
        onDateClick={handleDateClick}
      />

      {/* In-place Task Drawer */}
      <TaskDrawer
        taskId={drawerTaskId}
        open={drawerTaskId !== null}
        onClose={() => setDrawerTaskId(null)}
        db={db}
      />
    </div>
  );
};
```

---

### `src/views/PlannerView.tsx` (controller / view, request-response param sync)

**Analog:** `src/views/PlannerView.tsx`

**Target Date Sync Pattern**:
```typescript
export interface PlannerViewProps {
  db?: TaskPlannerDatabase;
  initialDate?: string;
  targetDate?: string;
}

// In component body:
useEffect(() => {
  if (targetDate && dayjs(targetDate, 'YYYY-MM-DD').isValid()) {
    setCurrentDate(targetDate);
  }
}, [targetDate]);
```

---

### `src/App.tsx` (controller / router, request-response)

**Analog:** `src/App.tsx`

**Default Route & View Routing Excerpt**:
```typescript
import { DashboardView } from './views/DashboardView';

export const App: React.FC = () => {
  const { route, params, navigate } = useHashRoute('dashboard');

  const renderContent = () => {
    switch (route) {
      case 'dashboard':
        return <DashboardView onNavigate={navigate} />;
      case 'tasks':
        return <TasksView />;
      case 'projects':
        return <ProjectsView />;
      case 'planner':
        return <PlannerView targetDate={params.date} />;
      case 'settings':
        return <SettingsView onNavigate={navigate} />;
      default:
        return <EmptyState />;
    }
  };
  // ...
};
```

---

## Shared Patterns

### Reactive Query Pattern (`dexie-react-hooks`)
**Source:** `src/hooks/useWeeklyPlanner.ts` lines 73-182
**Apply to:** `src/hooks/useDashboardForecast.ts`, `src/views/DashboardView.tsx`
```typescript
const liveData = useLiveQuery(
  async () => {
    const records = await db.table.toArray();
    return processRecords(records);
  },
  [dependencies, db]
);
```

### 4-State Capacity & WCAG 2.1 AA Badges
**Source:** `src/components/planner/DayColumnHeader.tsx` lines 23-56
**Apply to:** `src/components/dashboard/TodaySummaryCard.tsx`, `src/components/dashboard/MiniDayCard.tsx`
```typescript
const LOAD_STATUS_CONFIG: Record<
  DailyLoadState,
  {
    label: string;
    color: 'success' | 'warning' | 'error' | 'default';
    icon: React.ReactNode;
    progressStatus: 'success' | 'normal' | 'exception' | 'active';
  }
> = {
  available: { label: 'Khả dụng', color: 'success', icon: <CheckCircleOutlined />, progressStatus: 'success' },
  busy: { label: 'Bận', color: 'warning', icon: <ClockCircleOutlined />, progressStatus: 'normal' },
  overloaded: { label: 'Quá tải', color: 'error', icon: <ExclamationCircleOutlined />, progressStatus: 'exception' },
  'no-capacity': { label: 'Nghỉ', color: 'default', icon: <MinusCircleOutlined />, progressStatus: 'normal' },
};
```

### Inline Task Actions
**Source:** `src/components/tasks/InlineStatusTag.tsx` lines 49-68
**Apply to:** `src/components/dashboard/AttentionTodayList.tsx`
```typescript
try {
  await updateTaskStatus(taskId, nextStatus, db);
  message.success({ content: 'Đã cập nhật trạng thái', duration: 1.5 });
} catch {
  message.error({ content: 'Không thể cập nhật trạng thái', duration: 2 });
}
```

---

## No Analog Found

None. All files have concrete existing analogs in the codebase.

---

## Metadata

**Analog search scope:** `src/`, `tests/`
**Files scanned:** 64
**Pattern extraction date:** 2026-09-27
