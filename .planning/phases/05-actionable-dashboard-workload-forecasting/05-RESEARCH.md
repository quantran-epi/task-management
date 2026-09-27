# Phase 5: Actionable Dashboard & Workload Forecasting - Research

**Researched:** 2026-09-27
**Domain:** Actionable Dashboard, Workload Forecasting Horizons (7-day, 14-day, 30-day), Attention Task Triage, Deep-Linking & Routing
**Confidence:** HIGH

## Summary

Phase 5 delivers actionable dashboard views covering today's focus, urgent work, and workload forecasting across 7-day, 14-day, and rolling 30-day horizons. It provides high-visibility workload metrics, overload detection banners, and direct clickable links that immediately navigate to targeted tasks or planning dates in PlannerView.

Stack uses existing dependencies: React 19, Ant Design 6.6.5, Dexie 4.4.6, dexie-react-hooks, Dayjs 1.11.23, and Vitest. Zero new external libraries needed. All calculations build on established domain modules: `src/utils/capacity.ts`, `src/utils/date.ts`, and repository patterns in `src/db/repositories/`.

**Primary recommendation:** Build pure calculation helper functions in `src/utils/dashboard.ts` (query criteria, grouping, horizon generation) covered with fast unit tests, wire reactive Dexie hooks via `useLiveQuery` in `src/views/DashboardView.tsx`, extend `useHashRoute` to parse and emit query parameters (`?date=YYYY-MM-DD`), and link directly to `PlannerView` and `TaskDrawer`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01: Stacked 2-Tier layout**: Top tier for Today focus area (Today Summary KPI card on left/top + Attention Task List). Bottom tier for Workload Forecast section containing Horizon switchers, Overload Alert banner, and Mini Day Cards grid. Responsive stacking on desktop vs mobile.
- **D-02: Dashboard as default landing route**: `AppRoute` updated to include `'dashboard' | 'tasks' | 'projects' | 'planner' | 'settings'`. App default route set to `dashboard` (visiting `/#/` or root URL navigates to `/#/dashboard`). First menu item on Sidebar Navigation is `Dashboard` with `<DashboardOutlined />` icon.
- **D-03: Today Summary KPI card**: Ant Design `Card` with `Statistic` metrics displaying Planned Time vs Effective Capacity (`Xh Ym / Zh Wm`). Mini Ant Design `Progress` bar displaying percentage of capacity utilized. Dual-encoded load status badge (Available, Busy, Overloaded, No-Capacity) with icon, text label, and color conforming to WCAG 2.1 AA. Count of tasks scheduled for today.
- **D-04: Contextual empty/rest day handling for Today**: Zero-capacity days (weekends, approved leave overrides) display subtle "Rest Day / Leave" indicator with zero capacity explanation. Working days with 0 planned tasks display "All clear — Xh available for planning" with primary CTA button to open Planner.
- **D-05: Segmented Horizon Switcher**: Ant Design `Segmented` control toggling between `Next 7 Days` (default), `Next 14 Days`, and `Next 30 Days`. Smooth client-side switching without page reload or layout thrashing.
- **D-06: Mini Day Cards Grid**: Grid of compact daily cards representing each date in selected horizon. Each day card shows: formatted date (`MMM D`), day of week (`Mon`, `Tue`), mini progress bar, allocated vs capacity hours, and dual-encoded 4-state badge (Available, Busy, Overloaded, No-Capacity). Cards for overloaded days feature clear warning styling and overload delta (`+Xh Ym`).
- **D-07: Dedicated Overload Alert Banner**: Prominent Ant Design `Alert` (warning/error) displayed above day grid whenever active horizon contains overloaded dates. Summary text stating total overloaded dates and total excess hours. Interactive clickable chips for each overloaded date allowing direct focus or jump.
- **D-08: Next Month Horizon definition**: Defined as rolling 30-day projection starting from `today` (`today` through `today + 29 days`), ensuring uninterrupted forward visibility regardless of calendar month boundaries.
- **D-09: "Attention Today" task criteria (DASH-01)**: Strict inclusion of active tasks (excluding `Done` and `Cancelled`) matching any of:
  1. Overdue: `dueDate < today`
  2. Due Today: `dueDate === today`
  3. Scheduled Today: has active planning allocation record on `today`
- **D-10: Grouped Urgency Ordering**: Displayed in urgency groups:
  1. Overdue items at top, sorted by days overdue descending (most overdue first).
  2. Due Today items, sorted by `priority` ('Urgent' -> 'High' -> 'Medium' -> 'Low').
  3. Scheduled Today items, sorted by allocated minutes descending.
- **D-11: Inline Quick Actions & Links (DASH-06, TASK-06)**: Direct Mark Done checkbox/button on each attention item. Compact status update dropdown for fast state changes. Task title is clickable link opening `TaskDrawer` in-place on Dashboard.
- **D-12: Scrollable container with max height**: Attention list constrained to max-height (~350px-400px) with internal scrolling to prevent pushing forecast section below the fold. Header displays total count badge and quick link "View all in Tasks" navigating to `TasksView`.
- **D-13: Date navigation to PlannerView (DASH-06)**: Clicking any Day Card in forecast grid or any overloaded date chip navigates directly to `/#/planner?date=YYYY-MM-DD`. `PlannerView` and `WeekNavigator` parse target date parameter and automatically jump to week containing that date.
- **D-14: In-place TaskDrawer inspection**: Clicking task title in Attention list opens `TaskDrawer` directly within `DashboardView`. Full details, notes, links, and Planning tab accessible without losing Dashboard scroll or filters.
- **D-15: Today Card CTA**: Prominent "Open Today in Planner" action button on Today Summary card immediately jumps to `PlannerView` focused on current week.
- **D-16: Deep Linking URL query support**: `useHashRoute` hook extended to support query parameters attached to hash (e.g. `/#/planner?date=2026-09-27`). Survives page reload (F5) and enables direct bookmarking of specific planning weeks.

### Claude's Discretion
- Visual styling tokens, card padding, and breakpoint thresholds for Ant Design responsive layout.
- Implementation details of pure date projection helper functions (`getProjectionDates`, `getHorizonMetrics`).
- Loading skeletons while live queries resolve IndexedDB records.

### Deferred Ideas (OUT OF SCOPE)
- Multi-task batch auto-scheduling across an entire milestone (v2 backlog).
- Auto-rebalancing existing allocations when high-priority urgent work arrives (v2 backlog).
- Personal task templates and saved filter presets (v2 PROD-01, PROD-02).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DASH-01 | User can see tasks requiring attention today, including overdue and urgent work. | Implemented via `AttentionTodayList.tsx` querying overdue (`deadline < today`), due today (`deadline === today`), and scheduled today active allocations. Grouped and sorted per D-09, D-10. |
| DASH-02 | User can see today's active planned load, available capacity, and overload status. | Implemented via `TodaySummaryCard.tsx` using `getEffectiveDailyCapacity` and `calculateDayMetrics`. Displays dual-encoded load status badge, `Xh Ym / Zh Wm`, progress bar, and scheduled task count. |
| DASH-03 | User can review active workload and overloaded dates over the next 7 days. | Implemented via `WorkloadForecast.tsx` horizon switcher (7-day option: `today` to `today + 6`). Day card grid and Overload Alert banner per D-05, D-06, D-07. |
| DASH-04 | User can review active workload and overloaded dates over the next 14 days. | Implemented via `WorkloadForecast.tsx` horizon switcher (14-day option: `today` to `today + 13`). Day card grid and Overload Alert banner. |
| DASH-05 | User can review active workload and overloaded dates for the next calendar month. | Implemented via `WorkloadForecast.tsx` horizon switcher (rolling 30-day option: `today` to `today + 29`). Day card grid and Overload Alert banner per D-08. |
| DASH-06 | Dashboard presents actionable task and date links rather than only aggregate metrics. | Implemented via deep-link hash routing (`/#/planner?date=YYYY-MM-DD`), interactive Day Cards, overloaded chip alerts, in-place `TaskDrawer`, and mark-done checkboxes per D-11, D-13, D-14, D-16. |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Attention Task Filtering & Grouping | Client Domain Logic (`src/utils/dashboard.ts`) | IndexedDB Repo (`src/db/repositories/`) | In-memory evaluation of overdue, due-today, and scheduled tasks against canonical calendar strings (`YYYY-MM-DD`). |
| Multi-Horizon Forecast Projection | Client Domain Logic (`src/utils/dashboard.ts`) | Reactive Hook (`src/hooks/useDashboardForecast.ts`) | Pure calculation generating N-day metrics using existing `getEffectiveDailyCapacity` and `calculateDayMetrics`. |
| Deep-Link Hash Routing | Browser Client Hook (`src/hooks/useHashRoute.ts`) | Navigation Component (`src/components/shell/Navigation.tsx`) | Parse and serialize `/#/<route>?<query>` via window `hashchange` events. |
| In-Place Task Drawer Inspection | View Component (`src/views/DashboardView.tsx`) | Shared Component (`src/components/tasks/TaskDrawer.tsx`) | View manages modal/drawer open state; reuses existing drawer without page transition. |
| Weekly Planner Date Synchronization | View Component (`src/views/PlannerView.tsx`) | Hook (`src/hooks/useWeeklyPlanner.ts`) | PlannerView consumes target date from query parameter or prop and aligns weekly anchor. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react | 19.3.0 | UI rendering | Project fixed dependency [VERIFIED: npm registry] |
| antd | 6.6.5 | UI components (`Card`, `Statistic`, `Progress`, `Segmented`, `Alert`, `Tag`, `Button`, `Checkbox`) | Project design system [VERIFIED: npm registry] |
| @ant-design/icons | 6.3.4 | Iconography (`DashboardOutlined`, `CalendarOutlined`, `CheckCircleOutlined`, `ClockCircleOutlined`, `ExclamationCircleOutlined`, `MinusCircleOutlined`) | Project standard icon set [VERIFIED: npm registry] |
| dexie | 4.4.6 | Local IndexedDB persistence | Project database layer [VERIFIED: npm registry] |
| dexie-react-hooks | 4.4.0 | `useLiveQuery` reactive UI updates | Instant UI reaction on task/allocation edits [VERIFIED: npm registry] |
| dayjs | 1.11.23 | Date calculation and formatting | Project canonical date engine [VERIFIED: npm registry] |

### Supporting
Zero new dependencies needed. All features are covered by existing libraries.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom SVG charts / chart.js | Native Ant Design `Progress` & compact Mini Cards | Ant Design `Progress` and mini cards provide dual-encoded accessible metrics, zero extra bundle weight, and direct clickability. Custom charts add weight and accessibility hurdles without solving the core need. |
| react-router query params | Custom hash query parsing in `useHashRoute` | App already uses hash routing (`/#/<route>`) without react-router. A 10-line parser handles `?key=val` on hash strings with zero new dependencies. |

**Installation:**
No new packages required.

## Package Legitimacy Audit

Zero external packages installed for Phase 5. Stack is 100% existing dependencies.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| *(none)* | — | — | — | — | — | Clean (0 packages installed) |

## Architecture Patterns

### System Architecture Diagram

```
User visits app / clicks link
       │
       ▼
┌────────────────────────────────────────────────────────┐
│ App.tsx (ConfigProvider, viVN locale)                  │
│   ├── useHashRoute('dashboard')                        │
│   │     └── parses: route ('dashboard'|'planner'|...)  │
│   │         and params ({ date: 'YYYY-MM-DD' })        │
└──────┬─────────────────────────────────────────────────┘
       │
       ├───────────────────────────────────────────────────────┐
       │ (route === 'dashboard')                               │ (route === 'planner')
       ▼                                                       ▼
┌──────────────────────────────────────┐     ┌──────────────────────────────────────┐
│ DashboardView.tsx                    │     │ PlannerView.tsx                      │
│                                      │     │                                      │
│ ┌──────────────────────────────────┐ │     │ ┌──────────────────────────────────┐ │
│ │ Top Tier: Today Focus            │ │     │ │ WeekNavigator                    │ │
│ │  ├── TodaySummaryCard (D-03,04)  │ │     │ │  (initialized with target date)  │ │
│ │  └── AttentionTodayList (D-09-12)│ │     │ └──────────────────────────────────┘ │
│ └──────────────────────────────────┘ │     │ ┌──────────────────────────────────┐ │
│ ┌──────────────────────────────────┐ │     │ │ 7-Day DayColumns Grid            │ │
│ │ Bottom Tier: Workload Forecast   │ │     │ └──────────────────────────────────┘ │
│ │  ├── Segmented (7 / 14 / 30)     │ │     └──────────────────────────────────────┘
│ │  ├── OverloadAlert (D-07)        │ │                        ▲
│ │  └── MiniDayCardsGrid (D-06)     │ │                        │
│ └──────────────────────────────────┘ │                        │
│ ┌──────────────────────────────────┐ │                        │
│ │ TaskDrawer (in-place inspection) │ │                        │
│ └──────────────────────────────────┘ │                        │
└──────┬───────────────────────────────┘                        │
       │                                                        │
       │ Click Day Card or Overload Chip                        │
       └────────────────── navigate('planner', { date: 'YYYY-MM-DD' }) ──┘
```

### Recommended Project Structure
```
src/
├── types/
│   ├── navigation.ts             # Update AppRoute: add 'dashboard'
│   └── dashboard.ts              # AttentionTask, HorizonType, DashboardForecast types
├── utils/
│   └── dashboard.ts              # Pure helpers: getAttentionTasks, getHorizonDates, calculateHorizonMetrics
├── hooks/
│   ├── useHashRoute.ts           # Extend: query parameter support (/#/planner?date=YYYY-MM-DD)
│   └── useDashboardForecast.ts   # Live query for today metrics, attention tasks, and horizon projections
├── components/
│   ├── shell/
│   │   └── Navigation.tsx        # Add Dashboard item with DashboardOutlined icon
│   └── dashboard/
│       ├── TodaySummaryCard.tsx  # Today KPI card, progress, load badge, rest day notice, CTA
│       ├── AttentionTodayList.tsx# Overdue, due today, scheduled tasks list with inline actions
│       ├── WorkloadForecast.tsx  # Segmented switcher, Overload Alert banner, Mini Day Cards grid
│       └── MiniDayCard.tsx       # Single day card with load badge, progress, balance, click-to-planner
└── views/
    ├── DashboardView.tsx         # Assembles Top & Bottom tiers, embeds in-place TaskDrawer
    ├── PlannerView.tsx           # Reads initialDate / query date parameter to sync week
    └── App.tsx                   # Default route 'dashboard', render DashboardView
```

### Pattern 1: URL Hash Query Parameter Parsing and Serialization
**What:** Support deep linking like `/#/planner?date=2026-10-05` without breaking GitHub Pages static hosting.
**When to use:** In `src/hooks/useHashRoute.ts` for all view transitions.
**Example:**
```typescript
// Pure hash parsing
export function parseHash(hashStr: string): { route: AppRoute; params: Record<string, string> } {
  const clean = hashStr.replace(/^#\/?/, '').trim();
  const [routePart, queryPart] = clean.split('?');
  const validRoutes: AppRoute[] = ['dashboard', 'tasks', 'projects', 'planner', 'settings'];
  const route = validRoutes.includes(routePart as AppRoute) ? (routePart as AppRoute) : 'dashboard';

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
```

### Pattern 2: Pure Attention Task Classification & Ordering
**What:** Pure function classifying and ordering active tasks into Overdue, Due Today, and Scheduled Today.
**When to use:** In `src/utils/dashboard.ts` called inside reactive hooks.
**Example:**
```typescript
export interface AttentionTaskItem {
  task: Task;
  category: 'overdue' | 'due-today' | 'scheduled-today';
  daysOverdue?: number;
  scheduledMinutes?: number;
}

export function categorizeAttentionTasks(
  activeTasks: Task[],
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

  for (const task of activeTasks) {
    // Exclude Done and Cancelled (already active tasks)
    const hasTodayAlloc = allocationMap.has(task.id);
    const scheduledMins = allocationMap.get(task.id) ?? 0;

    if (task.deadline && task.deadline < today) {
      const daysOverdue = dayjs(today).diff(dayjs(task.deadline), 'day');
      overdue.push({ task, category: 'overdue', daysOverdue, scheduledMinutes: scheduledMins });
    } else if (task.deadline && task.deadline === today) {
      dueToday.push({ task, category: 'due-today', scheduledMinutes: scheduledMins });
    } else if (hasTodayAlloc && scheduledMins > 0) {
      scheduledToday.push({ task, category: 'scheduled-today', scheduledMinutes: scheduledMins });
    }
  }

  // Sort groups per D-10
  overdue.sort((a, b) => (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0));
  dueToday.sort((a, b) => priorityWeight[b.task.priority] - priorityWeight[a.task.priority]);
  scheduledToday.sort((a, b) => (b.scheduledMinutes ?? 0) - (a.scheduledMinutes ?? 0));

  return [...overdue, ...dueToday, ...scheduledToday];
}
```

### Pattern 3: Rolling Horizon Date Range & Metric Aggregation
**What:** Pure function computing horizon dates and daily capacity metrics for 7, 14, or 30 days.
**When to use:** In `src/utils/dashboard.ts`.
**Example:**
```typescript
export function getHorizonDates(startDate: string, daysCount: number): string[] {
  const start = dayjs(startDate, 'YYYY-MM-DD');
  const dates: string[] = [];
  for (let i = 0; i < daysCount; i++) {
    dates.push(start.add(i, 'day').format('YYYY-MM-DD'));
  }
  return dates;
}
```

### Anti-Patterns to Avoid
- **Duplicating Capacity Calculation Logic:** Do not re-implement daily capacity calculations in the dashboard. Use existing `getEffectiveDailyCapacity` and `calculateDayMetrics` from `src/utils/capacity.ts`.
- **Mutating Active Task Statuses in Memory Only:** Always invoke `taskRepo.updateStatus` inside transactions so Dexie live queries update both dashboard and planner reactively.
- **Full Page Reload on Link Click:** Avoid standard `<a href="...">` that changes page origin or triggers browser refreshes. Use `navigate(route, { date })` via `useHashRoute`.
- **Unbounded Attention List Rendering:** Do not let the attention list expand indefinitely without scroll containment. Adhere to `maxHeight: 360px` with `overflowY: 'auto'` per D-12.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Load Status Badges & Colors | Custom badge CSS / HTML | `Ant Design Tag` with `StatusBadge` pattern from Phase 3 | Phase 3 already established WCAG 2.1 AA compliant 4-state badges with icons (`CheckCircleOutlined`, `ClockCircleOutlined`, `ExclamationCircleOutlined`, `MinusCircleOutlined`). |
| Day of Week and Date Math | Custom JS Date arithmetic | `dayjs(date).format('YYYY-MM-DD')` | JS Date timezone conversions cause midnight drift between UTC and local machine time. |
| In-Place Task Editing | Custom lightweight task edit modal | Reusable `TaskDrawer` component | `TaskDrawer` already provides full validation, notes, document links, and `TaskDrawerPlanning` tab. |

**Key insight:** All required business logic (capacity rules, overrides, task activity filters, date math) was verified in Phases 1-4. Phase 5 is an aggregation, projection, and navigation layer.

## Common Pitfalls

### Pitfall 1: Timezone Drift on Rolling Horizons
**What goes wrong:** Horizon dates shift backward or forward when crossing Daylight Saving Time or UTC boundaries.
**Why it happens:** Using native `new Date()` with hour manipulations or `toISOString().split('T')[0]`.
**How to avoid:** Use canonical `YYYY-MM-DD` strings with Dayjs: `dayjs(today, 'YYYY-MM-DD').add(i, 'day').format('YYYY-MM-DD')`.
**Warning signs:** Dates displaying off-by-one day on Sunday/Monday or during late evening local hours.

### Pitfall 2: Done/Cancelled Tasks Polluting Scheduled Today or Active Forecast
**What goes wrong:** Completed or cancelled tasks appear in today's attention list or add active load to forecast day cards.
**Why it happens:** Forgetting to filter out `isTaskActive(task.status)` when reading allocations.
**How to avoid:** Use `isTaskActive` from `src/db/repositories/allocationRepo.ts` consistently across all dashboard queries per PLAN-05 and D-09.
**Warning signs:** Workload capacity percentage exceeds 100% on days where only finished tasks are assigned.

### Pitfall 3: PlannerView Ignoring URL Target Date
**What goes wrong:** User clicks an overloaded date chip or day card (`/#/planner?date=2026-10-15`), but PlannerView remains stuck on current week.
**Why it happens:** `PlannerView` only initializes state once with `initialDate` or doesn't react when `params.date` changes on the hash route.
**How to avoid:** Add an effect or state synchronization in `PlannerView` reacting to incoming `targetDate` prop.
**Warning signs:** Clicking date chips in Dashboard changes the URL hash but does not switch the visible week in Planner.

## Code Examples

### Query Parameter Extension for `useHashRoute.ts`
```typescript
// Source: src/hooks/useHashRoute.ts pattern
export interface HashRouteState {
  route: AppRoute;
  params: Record<string, string>;
  navigate: (nextRoute: AppRoute, nextParams?: Record<string, string>) => void;
}

export function useHashRoute(defaultRoute: AppRoute = 'dashboard'): HashRouteState {
  const getStateFromHash = (): { route: AppRoute; params: Record<string, string> } => {
    if (typeof window === 'undefined') return { route: defaultRoute, params: {} };
    return parseHash(window.location.hash);
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

### Overload Alert Banner with Interactive Date Chips
```typescript
// Source: Ant Design 6 Alert + Tag pattern (05-UI-SPEC.md)
export const OverloadAlertBanner: React.FC<{
  overloadedDays: Array<{ date: string; excessMinutes: number }>;
  onDateClick: (date: string) => void;
}> = ({ overloadedDays, onDateClick }) => {
  if (overloadedDays.length === 0) return null;

  const totalExcess = overloadedDays.reduce((sum, d) => sum + d.excessMinutes, 0);

  return (
    <Alert
      type="warning"
      showIcon
      message="Phát hiện quá tải công suất"
      description={
        <Space orientation="vertical" size={8} style={{ width: '100%' }}>
          <Typography.Text>
            Có {overloadedDays.length} ngày vượt quá sức chứa với tổng thời gian quá tải {formatMinutes(totalExcess)}. Nhấn vào ngày để điều chỉnh:
          </Typography.Text>
          <Space wrap size={[6, 6]}>
            {overloadedDays.map((d) => (
              <Tag
                key={d.date}
                color="error"
                style={{ cursor: 'pointer', margin: 0 }}
                onClick={() => onDateClick(d.date)}
              >
                {d.date}: +{formatMinutes(d.excessMinutes)}
              </Tag>
            ))}
          </Space>
        </Space>
      }
      style={{ marginBottom: 16 }}
    />
  );
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| TasksView as default route | DashboardView as default landing route | Phase 5 | Users immediately see what needs attention and their day's capacity without manual navigation. |
| Parameterless hash routes (`/#/planner`) | Hash routes with search parameters (`/#/planner?date=YYYY-MM-DD`) | Phase 5 | Direct deep-linking from warnings and horizon day cards directly to the target week. |
| 7-Day fixed weekly view only | Multi-horizon projections (7-day, 14-day, 30-day) | Phase 5 | Early detection of bottlenecks weeks before deadlines arrive. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Rolling 30 days is preferred over calendar month boundary for "next-month" horizon | Locked Decisions (D-08) | Zero risk; locked in CONTEXT.md D-08 to provide consistent forward projection regardless of whether today is the 1st or 28th of the month. |

## Open Questions

None. All requirements, user decisions, UI layout tokens, and copywriting are completely specified in `05-CONTEXT.md` and `05-UI-SPEC.md`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build & Dev Tooling | ✓ | v20.19.5 | — |
| npm | Package management | ✓ | 10.8.2 | — |
| Vitest | Test runner | ✓ | 5.0.2 | — |
| Browser IndexedDB | Persistence | ✓ | fake-indexeddb in tests, Native in browser | — |

**Missing dependencies:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.2 |
| Config file | `vite.config.ts` |
| Quick run command | `npx vitest run tests/utils/dashboard.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DASH-01 | Attention task list captures overdue, due today, and scheduled today active tasks with proper grouping and sorting | unit | `npx vitest run tests/utils/dashboard.test.ts` | ❌ Wave 0 |
| DASH-02 | Today summary KPI card computes active planned load, effective capacity, and 4-state load badge | unit / component | `npx vitest run tests/components/TodaySummaryCard.test.tsx` | ❌ Wave 0 |
| DASH-03 | 7-day workload forecast produces accurate day cards and overload detection | unit / component | `npx vitest run tests/components/WorkloadForecast.test.tsx` | ❌ Wave 0 |
| DASH-04 | 14-day workload forecast computes multi-day metrics and excess hours | unit | `npx vitest run tests/utils/dashboard.test.ts` | ❌ Wave 0 |
| DASH-05 | 30-day rolling forecast projects month-ahead capacity and flags overloaded days | unit | `npx vitest run tests/utils/dashboard.test.ts` | ❌ Wave 0 |
| DASH-06 | Clickable links on day cards, chips, and task titles navigate to Planner and open TaskDrawer | component / integration | `npx vitest run tests/views/DashboardView.test.tsx` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/utils/dashboard.test.ts` (< 10 seconds)
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/utils/dashboard.test.ts` — covers pure logic for DASH-01, DASH-04, DASH-05, and URL hash query parsing.
- [ ] `tests/components/TodaySummaryCard.test.tsx` — covers DASH-02 (metrics display, rest day state, zero-load state).
- [ ] `tests/components/AttentionTodayList.test.tsx` — covers DASH-01 and DASH-06 (grouping, mark-done, status dropdown, drawer trigger).
- [ ] `tests/components/WorkloadForecast.test.tsx` — covers DASH-03, DASH-04, DASH-05, DASH-06 (horizon switching, overload alert chips, day card click).
- [ ] `tests/views/DashboardView.test.tsx` — integration test verifying overall dashboard assembly and Planner deep linking.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Personal local offline app; no authentication. |
| V3 Session Management | no | Local browser runtime; no server sessions. |
| V4 Access Control | no | Single-user local application. |
| V5 Input Validation | yes | URL hash query parameters sanitized against valid calendar dates (`YYYY-MM-DD`) and known routes (`AppRoute`). |
| V6 Cryptography | no | No cryptographic operations in Phase 5 (deferred to Phases 6 and 8). |

### Known Threat Patterns for Client Dashboard

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed Date Query Parameter | Tampering / Denial of Service | Validate `date` parameter from URL hash with Dayjs: `dayjs(date, 'YYYY-MM-DD').isValid()`. If invalid or out of range, fallback safely to `getTodayDateString()`. |
| Unsanitized Route String | Tampering / XSS | Route string from hash matched strictly against whitelist union: `'dashboard' \| 'tasks' \| 'projects' \| 'planner' \| 'settings'`. Fallback to `'dashboard'`. |

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `src/utils/capacity.ts`, `src/utils/date.ts`, `src/db/repositories/allocationRepo.ts`, `src/hooks/useWeeklyPlanner.ts`, `src/hooks/useHashRoute.ts`
- Specifications: `.planning/phases/05-actionable-dashboard-workload-forecasting/05-CONTEXT.md` and `05-UI-SPEC.md`
- Requirements: `.planning/REQUIREMENTS.md`

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Zero new packages; uses existing React 19 + Ant Design 6.6.5 + Dexie 4.4.6.
- Architecture: HIGH - Fully derived from existing working modules and approved UI spec.
- Pitfalls: HIGH - Timezone, task status filtering, and query param synchronization verified.

**Research date:** 2026-09-27
**Valid until:** 2026-10-27
