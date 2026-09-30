# Phase 13: Enhanced Workload Analytics & Milestone Burndown - Pattern Map

**Mapped:** 2026-09-30  
**Files analyzed:** 16 files (10 new, 6 modified)  
**Analogs found:** 16 / 16  

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/types/navigation.ts` | model | static type | `src/types/navigation.ts` | exact |
| `src/types/analytics.ts` | model | transform | `src/types/dashboard.ts` | role-match |
| `src/hooks/useHashRoute.ts` | hook | event-driven | `src/hooks/useHashRoute.ts` | exact |
| `src/components/shell/Navigation.tsx` | component | request-response | `src/components/shell/Navigation.tsx` | exact |
| `src/App.tsx` | component | request-response | `src/App.tsx` | exact |
| `src/views/ProjectsView.tsx` | component | CRUD / navigation | `src/views/ProjectsView.tsx` | exact |
| `src/utils/analytics.ts` | utility | transform | `src/utils/dashboard.ts` | exact |
| `src/components/analytics/BurndownSvgChart.tsx` | component | transform / UI render | `src/components/dashboard/WorkloadForecast.tsx` | role-match |
| `src/components/analytics/StackedStatusBar.tsx` | component | transform / UI render | `src/components/tasks/InlineProgress.tsx` | role-match |
| `src/components/analytics/VelocityTrendChart.tsx` | component | transform / UI render | `src/components/dashboard/WorkloadForecast.tsx` | role-match |
| `src/components/analytics/WorkloadProportionBar.tsx` | component | transform / UI render | `src/components/tasks/InlineProgress.tsx` | role-match |
| `src/views/AnalyticsView.tsx` | component | request-response / live query | `src/views/DashboardView.tsx` | exact |
| `tests/utils/analytics.test.ts` | test | transform | `tests/utils/dashboard.test.ts` | exact |
| `tests/components/analytics/BurndownSvgChart.test.tsx` | test | UI render | `tests/components/WorkloadForecast.test.tsx` | role-match |
| `tests/views/AnalyticsView.test.tsx` | test | UI render / integration | `tests/views/DashboardView.test.tsx` | exact |
| `tests/hooks/useHashRoute.test.ts` | test | event-driven | `tests/hooks/useHashRoute.test.ts` | exact |

---

## Pattern Assignments

### 1. `src/types/navigation.ts` (model, static type)

**Analog:** `src/types/navigation.ts`  
**Pattern:** Add `'analytics'` to the `AppRoute` union type.

**Core Pattern** (`src/types/navigation.ts`, lines 1-3):
```typescript
export type AppRoute = 'dashboard' | 'tasks' | 'projects' | 'planner' | 'settings' | 'analytics';

export type NavigateFunction = (route: AppRoute, params?: Record<string, string>) => void;
```

---

### 2. `src/types/analytics.ts` (model, transform)

**Analog:** `src/types/dashboard.ts`  
**Pattern:** Export pure TypeScript interfaces representing calculation outputs, chart data series, and user preference options.

**Imports Pattern** (`src/types/dashboard.ts`, lines 1-3):
```typescript
import type { Task, Milestone, Project, WorkType } from './models';
```

**Core Pattern** (modeled after `src/types/dashboard.ts`, lines 4-33):
```typescript
export type BurndownUnit = 'hours' | 'count';
export type VelocityWindowWeeks = 2 | 4 | 8 | 12;
export type WorkloadDimension = 'opsOwners' | 'businessAnalysts' | 'workType';

export interface BurndownDayPoint {
  date: string;
  dayIndex: number;
  idealRemaining: number;
  actualRemaining: number | null; // null for future dates past Today
}

export interface MilestoneBurndownSeries {
  milestoneId: string;
  startDate: string;
  endDate: string;
  totalScope: number;
  unit: BurndownUnit;
  points: BurndownDayPoint[];
}

export interface WeeklyVelocityBucket {
  weekLabel: string; // e.g. "Tuần 38 (15/09 - 21/09)"
  startDate: string;
  endDate: string;
  completedTasksCount: number;
  completedHours: number;
}

export interface ProjectStatusMetrics {
  projectId: string;
  projectName: string;
  counts: Record<string, number>;
  totalTasks: number;
  openTasksCount: number;
  remainingHours: number;
  velocityTasksPerWeek: number;
  velocityHoursPerWeek: number;
  weeklyBuckets: WeeklyVelocityBucket[];
}

export interface WorkloadDistributionItem {
  key: string;
  label: string;
  workType?: WorkType;
  taskCount: number;
  hours: number;
  percentage: number;
  taskIds: string[];
}
```

---

### 3. `src/hooks/useHashRoute.ts` (hook, event-driven)

**Analog:** `src/hooks/useHashRoute.ts`  
**Pattern:** Include `'analytics'` in route whitelist `VALID_ROUTES` and sanitize query parameter `milestoneId`.

**Whitelist Pattern** (`src/hooks/useHashRoute.ts`, lines 11-12):
```typescript
const VALID_ROUTES: readonly AppRoute[] = [
  'dashboard',
  'tasks',
  'projects',
  'planner',
  'settings',
  'analytics',
] as const;
```

**Param Sanitization Pattern** (`src/hooks/useHashRoute.ts`, lines 31-43):
```typescript
  if (queryPart) {
    const searchParams = new URLSearchParams(queryPart);
    searchParams.forEach((val, key) => {
      if (key === 'date') {
        if (isValidCalendarDate(val)) {
          params[key] = val;
        }
      } else if (key === 'milestoneId') {
        // Sanitize milestoneId parameter (non-empty alphanumeric/uuid)
        const sanitized = val.trim();
        if (sanitized.length > 0 && /^[a-zA-Z0-9_-]+$/.test(sanitized)) {
          params[key] = sanitized;
        }
      } else {
        params[key] = val;
      }
    });
  }
```

---

### 4. `src/components/shell/Navigation.tsx` (component, request-response)

**Analog:** `src/components/shell/Navigation.tsx`  
**Pattern:** Add sidebar navigation item with `BarChartOutlined` before 'Cài đặt'.

**Imports Pattern** (`src/components/shell/Navigation.tsx`, lines 2-10):
```typescript
import {
  DashboardOutlined,
  CheckSquareOutlined,
  ProjectOutlined,
  CalendarOutlined,
  BarChartOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import type { AppRoute } from '../../types/navigation';
```

**Menu Item Pattern** (`src/components/shell/Navigation.tsx`, lines 19-45):
```typescript
  {
    key: 'planner',
    icon: <CalendarOutlined />,
    label: 'Lập kế hoạch',
  },
  {
    key: 'analytics',
    icon: <BarChartOutlined />,
    label: 'Phân tích',
  },
  {
    key: 'settings',
    icon: <SettingOutlined />,
    label: 'Cài đặt',
  },
```

---

### 5. `src/App.tsx` (component, request-response)

**Analog:** `src/App.tsx`  
**Pattern:** Wire `case 'analytics'` inside `renderContent()` with `navigate` and `params.milestoneId`.

**View Import & Case Pattern** (`src/App.tsx`, lines 11-16, 33-47):
```typescript
import { AnalyticsView } from './views/AnalyticsView';

// ...
  const renderContent = () => {
    switch (route) {
      case 'dashboard':
        return <DashboardView onNavigate={navigate} />;
      case 'tasks':
        return <TasksView />;
      case 'projects':
        return <ProjectsView onNavigate={navigate} />;
      case 'planner':
        return <PlannerView targetDate={params.date} />;
      case 'analytics':
        return <AnalyticsView onNavigate={navigate} initialMilestoneId={params.milestoneId} />;
      case 'settings':
        return <SettingsView onNavigate={navigate} />;
      default:
        return <EmptyState />;
    }
  };
```

---

### 6. `src/views/ProjectsView.tsx` & `src/components/projects/ProjectTable.tsx` (component, CRUD / navigation)

**Analog:** `src/views/ProjectsView.tsx` & `src/components/projects/ProjectTable.tsx`  
**Pattern:** Accept `onNavigate?: NavigateFunction` in `ProjectsView` and `ProjectTable`, adding a "Burndown" action button per Milestone.

**Props & Handler Pattern** (`src/components/projects/ProjectTable.tsx`, lines 221-248):
```typescript
      {
        title: 'Thao tác',
        key: 'actions',
        width: 250,
        render: (_, record) => (
          <Space orientation="horizontal" size="small">
            <Button
              size="small"
              icon={<BarChartOutlined />}
              onClick={() => onNavigate?.('analytics', { milestoneId: record.id })}
            >
              Burndown
            </Button>
            <Button
              size="small"
              icon={<PlusOutlined />}
              onClick={() => onAddTask(project.id, record.id)}
            >
              Tác vụ
            </Button>
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => onEditMilestone(record)}
            />
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => onDeleteMilestone(record)}
            />
          </Space>
        ),
      },
```

---

### 7. `src/utils/analytics.ts` (utility, transform)

**Analog:** `src/utils/dashboard.ts`  
**Pattern:** Pure, deterministic calculation functions taking domain models and returning data series.

**Imports Pattern** (`src/utils/dashboard.ts`, lines 1-6):
```typescript
import dayjs from 'dayjs';
import type { Task, Milestone, Project, WorkType } from '../types/models';
import { resolveInheritedTags } from '../domain/inheritance';
import type {
  BurndownDayPoint,
  MilestoneBurndownSeries,
  BurndownUnit,
  WeeklyVelocityBucket,
  ProjectStatusMetrics,
  VelocityWindowWeeks,
  WorkloadDimension,
  WorkloadDistributionItem,
} from '../types/analytics';
```

**Core Burndown Calculation Pattern** (`src/utils/analytics.ts`):
```typescript
export function computeMilestoneBurndown(
  milestone: Milestone,
  tasks: Task[],
  unit: BurndownUnit,
  todayStr: string = dayjs().format('YYYY-MM-DD')
): MilestoneBurndownSeries {
  const msCreated = milestone.createdAt ? milestone.createdAt.slice(0, 10) : todayStr;
  const earliestTaskDate = tasks.reduce<string | null>((earliest, t) => {
    const d = t.actualStartDate || (t.createdAt ? t.createdAt.slice(0, 10) : null);
    if (!d) return earliest;
    return !earliest || d < earliest ? d : earliest;
  }, null);

  const startDate = earliestTaskDate && earliestTaskDate < msCreated ? earliestTaskDate : msCreated;

  let endDate = milestone.deadline;
  if (!endDate) {
    const latestTaskDeadline = tasks.reduce<string | null>((latest, t) => {
      if (!t.deadline) return latest;
      return !latest || t.deadline > latest ? t.deadline : latest;
    }, null);
    endDate = latestTaskDeadline && latestTaskDeadline > startDate
      ? latestTaskDeadline
      : dayjs(startDate).add(14, 'day').format('YYYY-MM-DD');
  }

  if (endDate <= startDate) {
    endDate = dayjs(startDate).add(14, 'day').format('YYYY-MM-DD');
  }

  const startDay = dayjs(startDate);
  const endDay = dayjs(endDate);
  const totalDays = Math.max(1, endDay.diff(startDay, 'day'));

  const totalScope = tasks.reduce((sum, t) => {
    if (unit === 'hours') {
      return sum + (t.estimateMinutes ? t.estimateMinutes / 60 : 0);
    }
    return sum + 1;
  }, 0);

  const points: BurndownDayPoint[] = [];

  for (let i = 0; i <= totalDays; i++) {
    const currentDate = startDay.add(i, 'day').format('YYYY-MM-DD');
    const idealRemaining = Math.max(0, totalScope * (1 - i / totalDays));

    let actualRemaining: number | null = null;
    if (currentDate <= todayStr) {
      const completedScope = tasks.reduce((sum, t) => {
        const isDoneOrResolved = t.status === 'Done' || t.status === 'Resolved';
        if (!isDoneOrResolved) return sum;

        const completionDate = t.actualEndDate || (t.updatedAt ? t.updatedAt.slice(0, 10) : null);
        if (completionDate && completionDate <= currentDate) {
          return sum + (unit === 'hours' ? (t.estimateMinutes ? t.estimateMinutes / 60 : 0) : 1);
        }
        return sum;
      }, 0);

      actualRemaining = Math.max(0, totalScope - completedScope);
    }

    points.push({
      date: currentDate,
      dayIndex: i,
      idealRemaining: Number(idealRemaining.toFixed(2)),
      actualRemaining: actualRemaining !== null ? Number(actualRemaining.toFixed(2)) : null,
    });
  }

  return { milestoneId: milestone.id, startDate, endDate, totalScope, unit, points };
}
```

**Velocity & Status Aggregation Pattern** (`src/utils/analytics.ts`):
```typescript
export function computeProjectStatusMetrics(
  projects: Project[],
  allTasks: Task[],
  windowWeeks: VelocityWindowWeeks,
  todayStr: string = dayjs().format('YYYY-MM-DD')
): ProjectStatusMetrics[] {
  const currentEnd = dayjs(todayStr);

  return projects.map((project) => {
    const projectTasks = allTasks.filter((t) => t.projectId === project.id);
    const counts: Record<string, number> = {
      Open: 0,
      'In Progress': 0,
      Resolved: 0,
      'In Review': 0,
      Done: 0,
      Cancelled: 0,
    };

    let remainingMinutes = 0;

    for (const task of projectTasks) {
      counts[task.status] = (counts[task.status] ?? 0) + 1;
      if (task.status !== 'Done' && task.status !== 'Cancelled') {
        remainingMinutes += task.estimateMinutes ?? 0;
      }
    }

    // Weekly buckets calculation
    const weeklyBuckets: WeeklyVelocityBucket[] = [];
    let windowCompletedTasks = 0;
    let windowCompletedMinutes = 0;

    for (let w = windowWeeks - 1; w >= 0; w--) {
      const wStart = currentEnd.subtract(w * 7 + 6, 'day').format('YYYY-MM-DD');
      const wEnd = currentEnd.subtract(w * 7, 'day').format('YYYY-MM-DD');
      const label = `${dayjs(wStart).format('DD/MM')} - ${dayjs(wEnd).format('DD/MM')}`;

      let weekTasks = 0;
      let weekMins = 0;

      for (const task of projectTasks) {
        if (task.status !== 'Done' && task.status !== 'Resolved') continue;
        const completionDate = task.actualEndDate || (task.updatedAt ? task.updatedAt.slice(0, 10) : null);
        if (completionDate && completionDate >= wStart && completionDate <= wEnd) {
          weekTasks += 1;
          weekMins += task.estimateMinutes ?? 0;
        }
      }

      weeklyBuckets.push({
        weekLabel: label,
        startDate: wStart,
        endDate: wEnd,
        completedTasksCount: weekTasks,
        completedHours: Number((weekMins / 60).toFixed(1)),
      });

      windowCompletedTasks += weekTasks;
      windowCompletedMinutes += weekMins;
    }

    return {
      projectId: project.id,
      projectName: project.name,
      counts,
      totalTasks: projectTasks.length,
      openTasksCount: counts.Open + counts['In Progress'] + counts['In Review'] + counts.Resolved,
      remainingHours: Number((remainingMinutes / 60).toFixed(1)),
      velocityTasksPerWeek: Number((windowCompletedTasks / windowWeeks).toFixed(1)),
      velocityHoursPerWeek: Number((windowCompletedMinutes / 60 / windowWeeks).toFixed(1)),
      weeklyBuckets,
    };
  });
}
```

**Workload Distribution Pattern** (`src/utils/analytics.ts`):
```typescript
export function computeWorkloadDistribution(
  tasks: Task[],
  projects: Project[],
  milestones: Milestone[],
  dimension: WorkloadDimension,
  includeDone: boolean = false
): WorkloadDistributionItem[] {
  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const milestoneMap = new Map(milestones.map((m) => [m.id, m]));

  const filteredTasks = tasks.filter((t) => {
    if (t.status === 'Cancelled') return false;
    if (!includeDone && t.status === 'Done') return false;
    return true;
  });

  const bucketMap = new Map<string, { label: string; workType?: WorkType; taskIds: Set<string>; minutes: number }>();

  const getBucket = (key: string, label: string, workType?: WorkType) => {
    let b = bucketMap.get(key);
    if (!b) {
      b = { label, workType, taskIds: new Set(), minutes: 0 };
      bucketMap.set(key, b);
    }
    return b;
  };

  for (const task of filteredTasks) {
    const mins = task.estimateMinutes ?? 0;

    if (dimension === 'workType') {
      const wt = task.workType ?? 'code';
      const b = getBucket(wt, wt, wt);
      b.taskIds.add(task.id);
      b.minutes += mins;
    } else {
      const project = task.projectId ? projectMap.get(task.projectId) : undefined;
      const milestone = task.milestoneId ? milestoneMap.get(task.milestoneId) : undefined;
      const res = resolveInheritedTags(dimension, task, { project, milestone });

      if (res.tags.length === 0) {
        const b = getBucket('unassigned', 'Chưa phân công');
        b.taskIds.add(task.id);
        b.minutes += mins;
      } else {
        for (const tag of res.tags) {
          const b = getBucket(tag, tag);
          b.taskIds.add(task.id);
          b.minutes += mins;
        }
      }
    }
  }

  const totalMinutes = Array.from(bucketMap.values()).reduce((sum, b) => sum + b.minutes, 0);

  return Array.from(bucketMap.entries()).map(([key, data]) => ({
    key,
    label: data.label,
    workType: data.workType,
    taskCount: data.taskIds.size,
    hours: Number((data.minutes / 60).toFixed(1)),
    percentage: totalMinutes > 0 ? Number(((data.minutes / totalMinutes) * 100).toFixed(1)) : 0,
    taskIds: Array.from(data.taskIds),
  })).sort((a, b) => b.hours - a.hours);
}
```

---

### 8. `src/components/analytics/BurndownSvgChart.tsx` (component, transform / UI render)

**Analog:** `src/components/dashboard/WorkloadForecast.tsx`  
**Pattern:** Pure React SVG vector charting using Ant Design theme tokens, interactive mouse hover tracking, vertical crosshair line, and floating tooltip.

**Imports & Tokens Pattern** (`src/components/dashboard/WorkloadForecast.tsx`, lines 1-7):
```typescript
import React, { useState } from 'react';
import { theme, Card, Tag, Typography } from 'antd';
import type { BurndownDayPoint, BurndownUnit } from '../../types/analytics';
```

**Core SVG Coordinate & Tooltip Pattern**:
```typescript
export interface BurndownSvgChartProps {
  points: BurndownDayPoint[];
  totalScope: number;
  unit: BurndownUnit;
  todayStr: string;
}

export const BurndownSvgChart: React.FC<BurndownSvgChartProps> = ({
  points,
  totalScope,
  unit,
  todayStr,
}) => {
  const { token } = theme.useToken();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (points.length === 0) return null;

  const width = 720;
  const height = 320;
  const padding = { top: 30, right: 30, bottom: 40, left: 60 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const maxVal = Math.max(
    totalScope,
    ...points.map((p) => Math.max(p.idealRemaining, p.actualRemaining ?? 0)),
    1
  );
  const n = Math.max(1, points.length - 1);

  const getX = (index: number) => padding.left + (index / n) * chartW;
  const getY = (val: number) => padding.top + (1 - val / maxVal) * chartH;

  const idealPath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(p.idealRemaining).toFixed(1)}`)
    .join(' ');

  const actualPoints = points.filter((p) => p.actualRemaining !== null);
  const actualPath = actualPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(p.dayIndex).toFixed(1)} ${getY(p.actualRemaining!).toFixed(1)}`)
    .join(' ');

  const hoveredPoint = hoverIndex !== null ? points[hoverIndex] : null;

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}
        onMouseLeave={() => setHoverIndex(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const relX = ((e.clientX - rect.left) / rect.width) * width - padding.left;
          const idx = Math.round((relX / chartW) * n);
          if (idx >= 0 && idx <= n) setHoverIndex(idx);
        }}
      >
        {/* Horizontal grid lines & Y labels */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = padding.top + ratio * chartH;
          const val = (1 - ratio) * maxVal;
          return (
            <g key={ratio}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke={token.colorBorderSecondary}
                strokeDasharray="3 3"
              />
              <text x={padding.left - 8} y={y + 4} textAnchor="end" fontSize={11} fill={token.colorTextTertiary}>
                {unit === 'hours' ? `${Math.round(val)}h` : Math.round(val)}
              </text>
            </g>
          );
        })}

        {/* Ideal Pace Line */}
        <path d={idealPath} fill="none" stroke="#8c8c8c" strokeWidth={2} strokeDasharray="5 5" />

        {/* Actual Remaining Line */}
        {actualPoints.length > 0 && (
          <path d={actualPath} fill="none" stroke={token.colorPrimary} strokeWidth={3} />
        )}

        {/* Hover Crosshair & Details */}
        {hoveredPoint && (
          <g>
            <line
              x1={getX(hoveredPoint.dayIndex)}
              y1={padding.top}
              x2={getX(hoveredPoint.dayIndex)}
              y2={height - padding.bottom}
              stroke={token.colorTextSecondary}
              strokeWidth={1}
              strokeDasharray="2 2"
            />
            {hoveredPoint.actualRemaining !== null && (
              <circle
                cx={getX(hoveredPoint.dayIndex)}
                cy={getY(hoveredPoint.actualRemaining)}
                r={5}
                fill={token.colorPrimary}
              />
            )}
          </g>
        )}
      </svg>
    </div>
  );
};
```

---

### 9. `src/components/analytics/StackedStatusBar.tsx` (component, transform / UI render)

**Analog:** `src/components/tasks/InlineProgress.tsx` & `src/components/tasks/InlineStatusTag.tsx`  
**Pattern:** Proportional horizontal segments using standard status colors with hover tooltips displaying exact counts.

**Color Mapping Pattern** (`src/components/tasks/InlineStatusTag.tsx`, lines 15-29):
```typescript
const STATUS_COLORS: Record<string, string> = {
  Open: '#8c8c8c',
  'In Progress': '#1677ff',
  Resolved: '#fa8c16',
  'In Review': '#13c2c2',
  Done: '#52c41a',
  Cancelled: '#d9d9d9',
};
```

**Render Pattern**:
```typescript
export interface StackedStatusBarProps {
  counts: Record<string, number>;
  totalTasks: number;
}

export const StackedStatusBar: React.FC<StackedStatusBarProps> = ({ counts, totalTasks }) => {
  if (totalTasks === 0) {
    return <div style={{ height: 16, background: '#f5f5f5', borderRadius: 4 }} />;
  }

  const statuses = ['Done', 'Resolved', 'In Progress', 'In Review', 'Open', 'Cancelled'];

  return (
    <div style={{ display: 'flex', width: '100%', height: 16, borderRadius: 4, overflow: 'hidden' }}>
      {statuses.map((status) => {
        const count = counts[status] ?? 0;
        if (count === 0) return null;
        const pct = (count / totalTasks) * 100;
        return (
          <Tooltip key={status} title={`${status}: ${count} (${pct.toFixed(0)}%)`}>
            <div style={{ width: `${pct}%`, backgroundColor: STATUS_COLORS[status] || '#bfbfbf' }} />
          </Tooltip>
        );
      })}
    </div>
  );
};
```

---

### 10. `src/components/analytics/VelocityTrendChart.tsx` (component, transform / UI render)

**Analog:** `src/components/dashboard/WorkloadForecast.tsx`  
**Pattern:** Pure SVG mini column bar chart showing weekly task and hour completion trends.

**Render Pattern**:
```typescript
export interface VelocityTrendChartProps {
  buckets: WeeklyVelocityBucket[];
}

export const VelocityTrendChart: React.FC<VelocityTrendChartProps> = ({ buckets }) => {
  const maxVal = Math.max(1, ...buckets.map((b) => b.completedTasksCount));
  const height = 40;
  const barWidth = 14;
  const gap = 6;
  const width = buckets.length * (barWidth + gap);

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      {buckets.map((b, idx) => {
        const barHeight = (b.completedTasksCount / maxVal) * (height - 8);
        const x = idx * (barWidth + gap);
        const y = height - barHeight;
        return (
          <Tooltip key={b.weekLabel} title={`${b.weekLabel}: ${b.completedTasksCount} tasks (${b.completedHours}h)`}>
            <rect x={x} y={y} width={barWidth} height={barHeight} fill="#52c41a" rx={2} />
          </Tooltip>
        );
      })}
    </svg>
  );
};
```

---

### 11. `src/components/analytics/WorkloadProportionBar.tsx` (component, transform / UI render)

**Analog:** `src/components/tasks/InlineProgress.tsx` & `src/components/tasks/WorkTypeBadge.tsx`  
**Pattern:** Multi-color proportional distribution bar with legend chips and color indicators.

**Palette Pattern**:
```typescript
const PALETTE = ['#1677ff', '#52c41a', '#fa8c16', '#722ed1', '#13c2c2', '#eb2f96', '#faad14', '#8c8c8c'];
```

---

### 12. `src/views/AnalyticsView.tsx` (component, request-response / live query)

**Analog:** `src/views/DashboardView.tsx`  
**Pattern:** Top-level view loading IndexedDB collections with `useLiveQuery`, holding local tab/filter states, and rendering 3 modular sections with empty states.

**Imports & LiveQuery Pattern** (`src/views/DashboardView.tsx`, lines 1-15 and `src/views/ProjectsView.tsx`, lines 42-46):
```typescript
import React, { useState, useMemo } from 'react';
import { Card, Row, Col, Select, Segmented, Table, Empty, Button, Space, Typography } from 'antd';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import { getAllMilestones } from '../db/repositories/milestoneRepo';
import { getAllProjects } from '../db/repositories/projectRepo';
import { BurndownSvgChart } from '../components/analytics/BurndownSvgChart';
import { StackedStatusBar } from '../components/analytics/StackedStatusBar';
import { WorkloadProportionBar } from '../components/analytics/WorkloadProportionBar';
import {
  computeMilestoneBurndown,
  computeProjectStatusMetrics,
  computeWorkloadDistribution,
} from '../utils/analytics';
import type { AppRoute, NavigateFunction } from '../types/navigation';
import type { BurndownUnit, VelocityWindowWeeks, WorkloadDimension } from '../types/analytics';
import { getTodayDateString } from '../utils/date';

export interface AnalyticsViewProps {
  db?: TaskPlannerDatabase;
  onNavigate?: NavigateFunction;
  initialMilestoneId?: string;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  db = defaultDb,
  onNavigate,
  initialMilestoneId,
}) => {
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | undefined>(initialMilestoneId);
  const [burndownUnit, setBurndownUnit] = useState<BurndownUnit>('hours');
  const [velocityWindow, setVelocityWindow] = useState<VelocityWindowWeeks>(4);
  const [workloadDim, setWorkloadDim] = useState<WorkloadDimension>('opsOwners');
  const [includeDoneWorkload, setIncludeDoneWorkload] = useState(false);

  const projects = useLiveQuery(() => getAllProjects(db), [db]) ?? [];
  const milestones = useLiveQuery(() => getAllMilestones(db), [db]) ?? [];
  const tasks = useLiveQuery(() => db.tasks.toArray(), [db]) ?? [];
  const today = getTodayDateString();

  // ... computed selectors with useMemo
```

---

### 13. `tests/utils/analytics.test.ts` (test, transform)

**Analog:** `tests/utils/dashboard.test.ts`  
**Pattern:** Vitest unit test suite with mock `Task`, `Milestone`, and `Project` records verifying mathematical edge cases.

**Test Structure Pattern** (`tests/utils/dashboard.test.ts`, lines 1-19):
```typescript
import { describe, it, expect } from 'vitest';
import type { Task, Milestone, Project } from '../../src/types/models';
import {
  computeMilestoneBurndown,
  computeProjectStatusMetrics,
  computeWorkloadDistribution,
} from '../../src/utils/analytics';

describe('analytics utils', () => {
  const baseTask: Task = {
    id: 't-1',
    name: 'Sample Task',
    status: 'Open',
    progress: 0,
    priority: 'Medium',
    estimateMinutes: 120,
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  };

  describe('computeMilestoneBurndown', () => {
    // Verifies ideal pace line, actual line clamping at today, and unit toggling
  });

  describe('computeProjectStatusMetrics', () => {
    // Verifies rolling window velocity and status distribution counts
  });

  describe('computeWorkloadDistribution', () => {
    // Verifies inheritance attribution, multiple owner weighting, and workType buckets
  });
});
```

---

### 14. `tests/components/analytics/BurndownSvgChart.test.tsx` (test, UI render)

**Analog:** `tests/components/WorkloadForecast.test.tsx`  
**Pattern:** Testing SVG render output, ideal/actual paths, and hover crosshair interactions.

**Imports & Setup Pattern** (`tests/components/WorkloadForecast.test.tsx`, lines 1-5):
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BurndownSvgChart } from '../../../src/components/analytics/BurndownSvgChart';
import type { BurndownDayPoint } from '../../../src/types/analytics';
```

---

### 15. `tests/views/AnalyticsView.test.tsx` (test, UI render / integration)

**Analog:** `tests/views/DashboardView.test.tsx`  
**Pattern:** In-memory IndexedDB with `fake-indexeddb/auto`, test database lifecycle, seeding test tasks, and asserting multi-section rendering.

**Setup Pattern** (`tests/views/DashboardView.test.tsx`, lines 1-24):
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { AnalyticsView } from '../../src/views/AnalyticsView';
import { TaskPlannerDatabase } from '../../src/db/index';
import { initializeDatabaseDefaults } from '../../src/db/seeds';
import { createProject } from '../../src/db/repositories/projectRepo';
import { createMilestone } from '../../src/db/repositories/milestoneRepo';
import { createTask } from '../../src/db/repositories/taskRepo';

describe('AnalyticsView Integration (ANLT-01..ANLT-03)', () => {
  let testDb: TaskPlannerDatabase;

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase('TestAnalyticsView_' + Math.random().toString(36).slice(2));
    await testDb.open();
    await initializeDatabaseDefaults(testDb);
  });

  afterEach(async () => {
    await testDb.delete();
  });

  it('renders all three analytics sections', async () => {
    // Assert burndown section, project status section, workload section
  });
});
```

---

### 16. `tests/hooks/useHashRoute.test.ts` (test, event-driven)

**Analog:** `tests/hooks/useHashRoute.test.ts`  
**Pattern:** Add test assertions validating `#/${route}` parsing for `'analytics'` and query parameter handling for `milestoneId`.

**Assertion Pattern** (`tests/hooks/useHashRoute.test.ts`, lines 13-29):
```typescript
    it('parses analytics route with milestoneId parameter', () => {
      expect(parseHash('#/analytics?milestoneId=ms-123')).toEqual({
        route: 'analytics',
        params: { milestoneId: 'ms-123' },
      });
    });
```

---

## Shared Patterns

### 1. Tag Inheritance Resolution
**Source:** `src/domain/inheritance.ts`, lines 14-39  
**Apply to:** `src/utils/analytics.ts` in `computeWorkloadDistribution`  
```typescript
const res = resolveInheritedTags(dimension, task, { project, milestone });
```

### 2. Time Formatting
**Source:** `src/utils/time.ts`, lines 34-50  
**Apply to:** All analytics tooltips, summaries, and table columns displaying hours/minutes  
```typescript
formatMinutes(minutes)
```

### 3. Date Sanitization & Today String
**Source:** `src/utils/date.ts`, lines 30-45  
**Apply to:** Burndown timeline calculation, velocity buckets, and view defaults  
```typescript
getTodayDateString()
```

### 4. Status Tag Colors & Labels
**Source:** `src/components/tasks/InlineStatusTag.tsx`, lines 15-29  
**Apply to:** `StackedStatusBar.tsx` and project status distribution tables  

---

## No Analog Found

*None. All 16 files have direct or high-fidelity role-matched analogs in the existing repository.*

---

## Metadata

**Analog search scope:** `src/`, `tests/`  
**Files scanned:** 127  
**Pattern extraction date:** 2026-09-30  
