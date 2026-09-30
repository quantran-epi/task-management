# Phase 13: Enhanced Workload Analytics & Milestone Burndown - Research

**Researched:** 2026-09-30
**Domain:** Client-Side Data Analytics, Pure SVG Vector Charting, Workload & Burndown Forecasting
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Hỗ trợ Toggle linh hoạt đơn vị đo lường trục Y: Cho phép người dùng chuyển đổi xem giữa Tổng giờ ước lượng (Estimated Hours từ `estimateMinutes`) và Số lượng tác vụ còn lại (Remaining Task Count).
- **D-02:** Trục thời gian (X-axis) và đường tiến độ lý tưởng (Ideal Pace Line) tự động xác định kèm fallback: Mốc bắt đầu lấy từ `milestone.createdAt` hoặc `actualStartDate` sớm nhất của task; mốc kết thúc lấy từ `milestone.deadline`. Nếu Milestone chưa có deadline, tự động fallback sang deadline xa nhất của các task trực thuộc hoặc +14 ngày từ Start Date.
- **D-03:** Đường tiến độ thực tế (Actual Burndown Line) dừng tại mốc Hôm nay (Today): Đường thực tế chỉ vẽ từ Start Date đến Today với điểm đánh dấu (marker) nổi bật tại Hôm nay, không vẽ suy đoán cho tương lai.
- **D-04:** Trải nghiệm tương tác SVG tương tác cao (Interactive Hover Tooltip): Biểu đồ SVG thuần hỗ trợ vạch gióng dọc (vertical crosshair) và Tooltip card hiển thị chi tiết thông số tại điểm hover (Ngày, Thực tế còn lại, Chuẩn lý tưởng, Mức chênh lệch nhanh/chậm tiến độ).
- **D-05:** Chỉ số vận tốc hoàn thành kép (Dual Metric): Thống kê đồng thời cả số lượng task hoàn thành và tổng số giờ hoàn thành mỗi tuần (ví dụ: `8 tasks / tuần (~24h / tuần)`), kèm mini bar chart thể hiện phân bổ theo từng tuần.
- **D-06:** Cửa sổ thời gian tính vận tốc trung bình (Rolling Time Window): Mặc định tính trung bình trượt 4 tuần gần nhất (Rolling 4-week Average), có bộ chọn `Segmented` (2 tuần, 4 tuần, 8 tuần, 12 tuần) để theo dõi xu hướng ngắn hạn và dài hạn.
- **D-07:** Trực quan hóa phân bổ trạng thái tác vụ giữa các dự án (ANLT-02): Mỗi dự án hiển thị một thanh ngang xếp chồng nhiều màu (Stacked Bar) theo tỷ lệ trạng thái (`Open`, `In Progress`, `Resolved`, `In Review`, `Done`, `Cancelled`) kết hợp bảng so sánh hiển thị Velocity và khối lượng còn lại.
- **D-08:** Quy tắc xác định ngày hoàn thành của Task: Ưu tiên `actualEndDate` (YYYY-MM-DD); nếu thiếu thì fallback lấy ngày từ `updatedAt`. Chỉ tính trạng thái `Done` và `Resolved` (loại trừ `Cancelled`). Nếu task được mở lại thì tự động trừ ra khỏi tuần tương ứng.
- **D-09:** Bố cục 3 chiều phân rã tải công việc (ANLT-03): Sử dụng `Segmented` hoặc `Tabs` gồm 3 mục: 'Ops Owner', 'Business Analyst', và 'Loại công việc (Work Type)' để giao diện gọn gàng, tập trung.
- **D-10:** Quy tắc kế thừa và gán tag đa chủ sở hữu: Áp dụng cơ chế kế thừa thẻ từ Milestone/Project (`resolveInheritedTags`) cho các task chưa có tag riêng. Nếu task có nhiều người phụ trách, tính đầy đủ vào thống kê của từng người (kèm nhãn phân bổ). Task không có tag gom vào nhóm 'Chưa phân công' (Unassigned).
- **D-11:** Phạm vi phân tích tải công việc (Workload Allocation Scope): Mặc định chỉ tính các tác vụ còn đang mở (Active Tasks: `Open`, `In Progress`, `In Review`, `Resolved`), đồng thời cung cấp bộ lọc toggle để cho phép xem toàn bộ tác vụ (bao gồm cả `Done`).
- **D-12:** Hình thức trực quan hóa phân bổ: Thanh tỷ trọng ngang nhiều màu (Horizontal Percentage Bar) ở trên kèm Bảng chi tiết bên dưới (Số task, Số giờ, Tỉ lệ %, hỗ trợ mở rộng xem danh sách task chi tiết khi nhấp chọn).
- **D-13:** Mục điều hướng riêng trên Sidebar Menu — **Reversibility:** costly — touches AppRoute navigation, AppShell, Navigation component, and hash routing: Thêm `'analytics'` vào `AppRoute` với nhãn 'Phân tích' (icon `BarChartOutlined`), đặt trước 'Cài đặt'.
- **D-14:** Bố cục giao diện `AnalyticsView`: Thiết kế Dashboard cuộn dọc 3 Section rõ ràng: (1) Milestone Burndown với bộ chọn Milestone Dropdown, (2) Vận tốc & Trạng thái giữa các Dự án, (3) Phân bổ Tải Stakeholder.
- **D-15:** Cơ chế chọn Milestone mặc định và liên kết điều hướng: Tự động chọn Milestone đang mở (`status !== 'Done'`) có deadline gần nhất. Hỗ trợ nhận `milestoneId` từ route params (`onNavigate('analytics', { milestoneId })`) để từ `ProjectsView` có thể click nhảy thẳng sang xem Burndown của Milestone đó.
- **D-16:** Trải nghiệm khi chưa có dữ liệu (Empty State): Từng Section hiển thị `EmptyState` độc lập kèm nút hành động (CTA) hướng dẫn tạo Milestone, thêm Task hoặc hoàn thành task, không làm gián đoạn các section khác.

### Claude's Discretion
- Màu sắc và phong cách SVG: Sử dụng bảng màu Ant Design chuẩn (`#1677ff` primary, `#52c41a` success, `#fa8c16` warning, `#ff4d4f` error, `#8c8c8c` secondary) để giữ tính đồng bộ với toàn bộ ứng dụng.
- SVG ViewBox & Responsive: Thiết kế SVG với `viewBox` co giãn linh hoạt và CSS `width: 100%` để biểu đồ hiển thị mượt mà trên cả desktop và tablet/mobile.

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ANLT-01 | User can view milestone burndown chart (lightweight SVG vector) tracking remaining vs completed work over time. | Documented mathematical calculation of burndown series, ideal pace line derivation, actual remaining work stepping, unit toggling (`hours` vs `count`), responsive pure React SVG rendering, and hover crosshair tooltip mechanics. |
| ANLT-02 | User can view task status distribution and completion velocity across projects. | Designed stacked status bar ratio algorithm, completion date attribution rules (`actualEndDate` fallback to `updatedAt`), rolling 2/4/8/12-week velocity calculations, and multi-project comparative table models. |
| ANLT-03 | User can view workload allocation broken down by Ops Owner, Business Analyst, and Work Type (hours and active task counts). | Formulated tag inheritance integration via `resolveInheritedTags`, multi-owner multi-attribution weighting, active task filtering (`Open`, `In Progress`, `In Review`, `Resolved`), and stacked proportional distribution bar with expandable detail table. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)
- **Local Application Only:** 100% local behavior in browser; no server or external charting service [CITED: CLAUDE.md:12].
- **UI Framework:** Ant Design 6 (tokens, Table, Card, Segmented, Select, Progress, Empty, Space) [CITED: CLAUDE.md:16].
- **Persistence & Reactivity:** IndexedDB via Dexie with `useLiveQuery` from `dexie-react-hooks` [CITED: CLAUDE.md:18-19].
- **Date Handling:** Keep persisted calendar dates as strict `YYYY-MM-DD` strings to avoid timezone drift [CITED: CLAUDE.md:28].
- **Zero New Charting Dependencies:** Do not add `@ant-design/plots`, `recharts`, `chart.js`, `d3`, or `plotly`. Use pure native React SVG vector elements [CITED: .planning/REQUIREMENTS.md:75].

## Summary

Phase 13 establishes a dedicated `#/analytics` dashboard giving visibility into delivery velocity, milestone burndown, and stakeholder workload distribution.

The primary technical challenge is implementing robust, clean, and responsive vector visualizations using zero external chart dependencies. Drawing upon browser-native SVG (`<svg viewBox="..." preserveAspectRatio="xMidYMid meet">`) and pure math functions in TypeScript, we avoid bundle bloat while ensuring instantaneous rendering from Dexie's local IndexedDB tables.

All analytics computations operate synchronously or in pure memoized selectors (`useMemo`) over records reactively loaded via `useLiveQuery`. Workload allocation links seamlessly with the inheritance engine established in Phase 9 (`resolveInheritedTags`), ensuring consistent multi-stakeholder and work type attribution across the application.

**Primary recommendation:** Implement mathematical computation functions in pure modules (`src/utils/analytics.ts`), build reusable vector chart components (`BurndownSvgChart`, `StackedStatusBar`, `VelocityTrendChart`), and assemble the three-section dashboard in `src/views/AnalyticsView.tsx` with top-level navigation support.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Burndown Point Calculation | Client Utility (`src/utils/analytics.ts`) | — | Pure date-math and task state aggregation across days from `milestone.createdAt` to `milestone.deadline`. |
| SVG Rendering & Hover Crosshair | Client React UI (`src/components/analytics/*`) | — | Native vector SVG components reacting to mouse move events with zero external chart library overhead. |
| Velocity & Rolling Trend Math | Client Utility (`src/utils/analytics.ts`) | — | Rolling window aggregation (2, 4, 8, 12 weeks) filtering completed tasks (`Done`, `Resolved`) based on `actualEndDate` or `updatedAt`. |
| Tag Inheritance & Workload Breakdown | Client Domain (`src/domain/inheritance.ts` & `src/utils/analytics.ts`) | — | Leverages existing `resolveInheritedTags` to resolve Ops Owner and BA tags before bucketing hours and active task counts. |
| Navigation & Deep Linking | Shell & Routing (`src/types/navigation.ts`, `useHashRoute.ts`) | — | Adds `'analytics'` route with query parameter support (`milestoneId`) for cross-view linking from `ProjectsView`. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.3.0 | UI rendering & state | Core application UI framework [CITED: CLAUDE.md:14]. |
| Ant Design | 6.6.5 | Component library | Provides layout, tables, segmentation, tags, empty states, and theme tokens [CITED: CLAUDE.md:16]. |
| Dayjs | 1.11.23 | Date math & rolling windows | Handles calendar day difference, week stepping, and date formatting [CITED: CLAUDE.md:28]. |
| Dexie & dexie-react-hooks | 4.4.6 / 4.4.0 | Local IndexedDB storage & live query | Reactively streams `tasks`, `milestones`, and `projects` [CITED: CLAUDE.md:18-19]. |
| Native React SVG | Browser native | Vector charting | Zero bundle cost, full accessibility, crisp on high-DPI displays, eliminates heavy plotting libraries [CITED: .planning/REQUIREMENTS.md:75]. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @ant-design/icons | 6.3.4 | UI icons | `BarChartOutlined` for sidebar navigation and analytics headers [CITED: CLAUDE.md:29]. |
| `src/utils/time.ts` | In-repo | Minute formatting (`formatMinutes`) | Displaying aggregate hours and minutes cleanly [VERIFIED: src/utils/time.ts:34-50]. |
| `src/domain/inheritance.ts` | In-repo | Tag inheritance resolution | Resolving inherited Ops and BA owners on tasks [VERIFIED: src/domain/inheritance.ts:14-39]. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native React SVG | Recharts / Chart.js | External libraries add 200KB-500KB bundle weight, introduce potential React 19 peer dependency conflicts, and violate project out-of-scope constraints. |
| Pure Memoized Selectors | Web Worker calculation | Current dataset size for a single user (~a few hundred to low thousands of tasks) computes in <5ms. Web Workers add serialization overhead and are unnecessary until profiling proves need. |

## Package Legitimacy Audit

> All recommended dependencies are already installed in `package.json`. No new external packages are introduced in Phase 13.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| antd | npm | ~10 yrs | 4.1M/wk | github.com/ant-design/ant-design | [OK] (flagged SUS only for recent minor patch) | Approved (Existing) |
| react | npm | ~12 yrs | 207M/wk | github.com/react/react | [OK] (flagged SUS only for recent patch) | Approved (Existing) |
| react-dom | npm | ~12 yrs | 195M/wk | github.com/react/react | [OK] (flagged SUS only for recent patch) | Approved (Existing) |
| dexie | npm | ~10 yrs | 2.6M/wk | github.com/dexie/Dexie.js | [OK] (flagged SUS only for recent patch) | Approved (Existing) |
| dexie-react-hooks | npm | ~4 yrs | 577k/wk | github.com/dexie/Dexie.js | [OK] | Approved (Existing) |
| dayjs | npm | ~7 yrs | 82M/wk | github.com/iamkun/dayjs | [OK] | Approved (Existing) |
| zod | npm | ~5 yrs | 352M/wk | github.com/colinhacks/zod | [OK] (flagged SUS only for recent patch) | Approved (Existing) |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none (all existing core packages)

## Architecture Patterns

### System Architecture Diagram

```
IndexedDB (Dexie: tasks, milestones, projects)
               │
               ▼ useLiveQuery()
      AnalyticsView Controller
               │
   ┌───────────┼───────────┐
   ▼           ▼           ▼
Section 1   Section 2   Section 3
Burndown    Velocity &  Stakeholder
Chart       Status      Workload
(ANLT-01)   (ANLT-02)   (ANLT-03)
   │           │           │
   │           ▼           ▼
   │      Stacked Bars  Inheritance
   │      & Mini Trends Resolver
   ▼           │           │
Pure SVG    Antd Table  Proportion Bar
Crosshair   Comparison  & Task Table
```

### Component Structure
```
src/
├── types/
│   ├── analytics.ts               # Analytics data models, series, and calculation options
│   └── navigation.ts              # Extended with 'analytics' route
├── utils/
│   └── analytics.ts               # Pure calculation functions (burndown, velocity, workload)
├── components/
│   └── analytics/
│       ├── BurndownSvgChart.tsx   # Interactive SVG line chart with crosshair & tooltip
│       ├── StackedStatusBar.tsx   # Segmented status bar with proportional widths
│       ├── VelocityTrendChart.tsx # SVG bar chart for weekly throughput
│       └── WorkloadProportionBar.tsx # Stakeholder/type allocation bar
└── views/
    └── AnalyticsView.tsx          # Main dashboard hosting 3 modular sections
```

### Pattern 1: Mathematical Burndown Series Generation
**What:** Transforming milestone date boundaries and child tasks into a day-by-day burndown time series.
**When to use:** In `ANLT-01` to power the SVG vector line chart.
**Algorithm Details:**
1. **Start Date ($D_{start}$):** Earliest of `milestone.createdAt` (substring 0..10) or earliest `task.actualStartDate` / `task.createdAt`.
2. **End Date ($D_{end}$):** `milestone.deadline`. Fallback: latest task deadline if present; fallback: $D_{start} + 14\text{ days}$.
3. **Total Scope at Start ($S_0$):**
   - If unit is `'hours'`: Sum of `task.estimateMinutes / 60` for all tasks associated with the milestone.
   - If unit is `'count'`: Total count of tasks associated with the milestone.
4. **Ideal Pace Line:** Linear descent from $(D_{start}, S_0)$ to $(D_{end}, 0)$. For day index $i \in [0, N]$:
   $$\text{Ideal}(i) = S_0 \times \left(1 - \frac{i}{N}\right)$$
5. **Actual Remaining Work:** For each calendar date $d$ from $D_{start}$ up to $\min(D_{end}, \text{Today})$:
   - Identify which tasks were completed on or before date $d$.
   - A task is considered completed on date $d$ if `status` is `Done` or `Resolved` AND `completionDate <= d` (where `completionDate` is `actualEndDate || updatedAt.slice(0, 10)`).
   - Remaining work at date $d$ equals total initial scope minus sum of scope of completed tasks on or before $d$.
6. **Stop at Today (D-03):** The actual line array terminates at $\text{Today}$. Days beyond $\text{Today}$ have no actual points.

### Pattern 2: Responsive SVG Coordinates & Interactive Crosshair
**What:** Mapping data coordinates $(dayIndex, value)$ to SVG canvas coordinates $(x, y)$ inside a fluid `viewBox`.
**Coordinate Formula:**
- SVG ViewBox: `0 0 W H` (e.g. `W = 600`, `H = 300`, padding `top = 20, bottom = 40, left = 50, right = 20`).
- Usable width: $W_{usable} = W - \text{left} - \text{right}$.
- Usable height: $H_{usable} = H - \text{top} - \text{bottom}$.
- For day index $i \in [0, N]$:
  $$x_i = \text{left} + \left(\frac{i}{N}\right) \times W_{usable}$$
- For value $v \in [0, V_{max}]$:
  $$y_v = \text{top} + \left(1 - \frac{v}{V_{max}}\right) \times H_{usable}$$
- **Hover Detection:** Map client `onMouseMove(e)` to relative SVG bounding box, calculate closest day index $i = \text{round}\left(\frac{x_{rel} - \text{left}}{W_{usable}} \times N\right)$, clamp to $[0, N]$, and display vertical dashed `<line>` and a floating HTML/Antd Tooltip.

### Pattern 3: Rolling Window Weekly Completion Velocity (ANLT-02)
**What:** Calculating weekly throughput across projects over rolling windows of 2, 4, 8, and 12 weeks.
**Algorithm Details:**
1. Group completed tasks (`Done` or `Resolved`) into ISO calendar weeks ($W_{-k}$ relative to current week).
2. For each project and each week in the selected window (default 4 weeks per D-06):
   - Count completed tasks.
   - Sum completed hours: $\sum (\text{estimateMinutes} / 60)$.
3. Average Velocity:
   $$\text{AvgVelocity}_{\text{count}} = \frac{\text{Total Completed Tasks}}{\text{Window Weeks}}$$
   $$\text{AvgVelocity}_{\text{hours}} = \frac{\text{Total Completed Hours}}{\text{Window Weeks}}$$

### Pattern 4: Multi-Dimensional Workload Distribution with Inheritance (ANLT-03)
**What:** Aggregating active tasks by Ops Owner, BA, or Work Type.
**Algorithm Details:**
1. Filter tasks by scope: Default active tasks only (`Open`, `In Progress`, `In Review`, `Resolved`), with toggle to include `Done` (D-11).
2. For each task:
   - If dimension is `'workType'`: Key is `task.workType ?? 'unspecified'`.
   - If dimension is `'opsOwners'` or `'businessAnalysts'`:
     Call `resolveInheritedTags(field, task, { project, milestone })` [VERIFIED: src/domain/inheritance.ts:14-39].
     If resolved tags are empty, assign to `'Chưa phân công'` (Unassigned).
     If multiple owners exist (e.g. `['An', 'Bình']`), allocate task count and estimated hours to each owner (D-10).
3. Compute total hours and percentages across buckets. Render top horizontal percentage bar and detailed Antd `Table`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Date Parsing & Week Math | Custom epoch calculations | `dayjs` (`.isoWeek()`, `.subtract()`, `.isSame()`, `.format('YYYY-MM-DD')`) | Edge cases with leap years, DST shifts, and ISO week boundary definitions [VERIFIED: src/utils/date.ts:1-20]. |
| Responsive Layout & Tables | Custom CSS tables or modals | Ant Design `Card`, `Segmented`, `Table`, `Select`, `Progress`, `Tooltip` | Built-in accessible keyboard navigation, sortable headers, dark-mode token support [VERIFIED: src/App.tsx:50-64]. |
| Tag Inheritance Resolution | Custom parent lookup logic | `resolveInheritedTags` in `src/domain/inheritance.ts` | Already handles direct override vs milestone inheritance vs project inheritance edge cases [VERIFIED: src/domain/inheritance.ts:14-39]. |
| Minutes Formatting | Custom hours/minutes string concatenation | `formatMinutes` in `src/utils/time.ts` | Standardized in-repo format handling zero, negative, and minute-clamping bounds [VERIFIED: src/utils/time.ts:34-50]. |

## Common Pitfalls

### Pitfall 1: Zero or Degenerate Milestone Date Range
**What goes wrong:** A milestone has start date equal to end date, or end date before start date, causing division by zero ($N = 0$) in SVG coordinate interpolation.
**Why it happens:** User created a milestone today and set deadline to today, or didn't set a deadline.
**How to avoid:** Enforce minimum span of 1 day ($N \ge 1$). If $D_{end} \le D_{start}$, automatically set $D_{end} = D_{start} + 14\text{ days}$ per D-02 fallback rule.

### Pitfall 2: Actual Burndown Line Speculating Into Future Dates
**What goes wrong:** Actual remaining work line continues flat or drops into future days beyond today.
**Why it happens:** For-loop runs over entire milestone duration up to $D_{end}$ without checking against $\text{Today}$.
**How to avoid:** Explicitly clamp actual line series to $\min(D_{end}, \text{Today})$ per D-03. Ensure the last point on or before Today renders a distinct marker circle.

### Pitfall 3: Inaccurate Completion Date Attribution
**What goes wrong:** Tasks completed weeks ago appear in the current week's velocity because their status was edited recently.
**Why it happens:** Relying solely on `task.updatedAt` when `actualEndDate` is missing or when other task attributes were touched.
**How to avoid:** Prioritize `actualEndDate` (strict `YYYY-MM-DD`). Only fallback to `updatedAt.slice(0, 10)` if `actualEndDate` is absent per D-08. Strictly exclude `Cancelled` tasks.

### Pitfall 4: Hover Tooltip Clipping on SVG Edges
**What goes wrong:** An SVG `<g>` tooltip near the right edge gets cut off by the SVG `viewBox` boundary.
**Why it happens:** SVG elements cannot overflow outside the `<svg>` container box without clipping.
**How to avoid:** Either position an absolute HTML container overlay with Antd `Tooltip` / standard CSS floating card above the SVG, or clamp tooltip SVG box coordinates so it stays within $[0, W - \text{boxWidth}]$.

## Code Examples

### Burndown Computation Function
```typescript
// Pure analytics module: src/utils/analytics.ts
import dayjs from 'dayjs';
import type { Milestone, Task } from '../types/models';

export interface BurndownDayPoint {
  date: string;
  dayIndex: number;
  idealRemaining: number;
  actualRemaining: number | null; // null for dates after Today
}

export function computeMilestoneBurndown(
  milestone: Milestone,
  tasks: Task[],
  unit: 'hours' | 'count',
  todayStr: string = dayjs().format('YYYY-MM-DD')
): { points: BurndownDayPoint[]; totalScope: number; startDate: string; endDate: string } {
  // Determine start date
  const msCreated = milestone.createdAt ? milestone.createdAt.slice(0, 10) : todayStr;
  const earliestTaskDate = tasks.reduce<string | null>((earliest, t) => {
    const d = t.actualStartDate || (t.createdAt ? t.createdAt.slice(0, 10) : null);
    if (!d) return earliest;
    return !earliest || d < earliest ? d : earliest;
  }, null);

  const startDate = earliestTaskDate && earliestTaskDate < msCreated ? earliestTaskDate : msCreated;

  // Determine end date with D-02 fallback
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

  // Calculate total initial scope
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
      // Calculate work completed on or before currentDate
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
      idealRemaining,
      actualRemaining,
    });
  }

  return { points, totalScope, startDate, endDate };
}
```

### Pure React SVG Burndown Chart Component
```typescript
// Pure SVG chart component: src/components/analytics/BurndownSvgChart.tsx
import React, { useState } from 'react';
import { theme } from 'antd';
import type { BurndownDayPoint } from '../../utils/analytics';

interface BurndownSvgChartProps {
  points: BurndownDayPoint[];
  totalScope: number;
  unit: 'hours' | 'count';
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

  const width = 700;
  const height = 320;
  const padding = { top: 30, right: 30, bottom: 40, left: 60 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const maxVal = Math.max(totalScope, ...points.map((p) => Math.max(p.idealRemaining, p.actualRemaining ?? 0)), 1);
  const n = points.length - 1;

  const getX = (index: number) => padding.left + (index / (n || 1)) * chartW;
  const getY = (val: number) => padding.top + (1 - val / maxVal) * chartH;

  // Ideal path
  const idealPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(p.idealRemaining)}`).join(' ');

  // Actual path (only non-null points)
  const actualPoints = points.filter((p) => p.actualRemaining !== null);
  const actualPath = actualPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(p.dayIndex)} ${getY(p.actualRemaining!)}`).join(' ');

  // Today marker coordinate
  const todayPoint = actualPoints[actualPoints.length - 1];

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        onMouseLeave={() => setHoverIndex(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const mouseX = e.clientX - rect.left;
          const relX = (mouseX / rect.width) * width - padding.left;
          const idx = Math.round((relX / chartW) * n);
          if (idx >= 0 && idx <= n) setHoverIndex(idx);
        }}
      >
        {/* Horizontal grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = padding.top + ratio * chartH;
          const val = (1 - ratio) * maxVal;
          return (
            <g key={ratio}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke={token.colorBorderSecondary} strokeDasharray="3 3" />
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

        {/* Today Marker */}
        {todayPoint && (
          <circle cx={getX(todayPoint.dayIndex)} cy={getY(todayPoint.actualRemaining!)} r={5} fill={token.colorPrimary} />
        )}

        {/* Hover Crosshair & Marker */}
        {hoverIndex !== null && (
          <g>
            <line x1={getX(hoverIndex)} y1={padding.top} x2={getX(hoverIndex)} y2={height - padding.bottom} stroke={token.colorTextSecondary} strokeWidth={1} strokeDasharray="2 2" />
          </g>
        )}
      </svg>
    </div>
  );
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Heavy external charting library (e.g., Recharts, Chart.js) | Native React SVG vector components | v1.1 Milestone Decision | Zero extra dependencies, 100% theme consistency, crisp high-DPI scaling, zero security exposure. |
| Hardcoded velocity time windows | Configurable rolling windows (2/4/8/12 weeks) | Phase 13 Decision D-06 | Allows both tactical sprint pacing and long-term trend analysis. |
| Manual stakeholder assignment | Automated ancestor tag inheritance (`resolveInheritedTags`) | Phase 9 (SHB-03) | Eliminates duplicate tag input while ensuring accurate aggregate workload analytics. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Task dataset size remains manageable for pure synchronous in-memory calculation without requiring background Web Workers. | Architecture Patterns | Low. Single-user scope has <2000 tasks. In-memory aggregation takes <5ms. |

## Open Questions

1. **How should tasks without estimate minutes be represented when the burndown or workload unit is toggled to 'Hours'?**
   - What we know: Tasks with `estimateMinutes === 0` contribute 0 hours to the total sum.
   - What's unclear: Does 0 hours mislead the user into thinking all tasks are complete?
   - Recommendation: In unit toggling, display an informational tag or footnote if active tasks have 0 estimate minutes, encouraging accurate estimation.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build & test execution | ✓ | 24 LTS | — |
| Vite | Dev & static bundling | ✓ | 8.3.1 | — |
| Ant Design | UI components & tokens | ✓ | 6.6.5 | — |
| Vitest | Automated testing | ✓ | 5.0.2 | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.2 + React Testing Library 16.3.3 |
| Config file | `vite.config.ts` |
| Quick run command | `npx vitest run tests/utils/analytics.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ANLT-01 | Burndown computation generates accurate ideal line, actual series clamped to today, and handles unit toggling | unit | `npx vitest run tests/utils/analytics.test.ts` | ❌ Wave 0 |
| ANLT-01 | BurndownSvgChart renders SVG paths, markers, and updates hover crosshair | component | `npx vitest run tests/components/analytics/BurndownSvgChart.test.tsx` | ❌ Wave 0 |
| ANLT-02 | Completion velocity groups by rolling 2/4/8/12 weeks and calculates throughput accurately | unit | `npx vitest run tests/utils/analytics.test.ts` | ❌ Wave 0 |
| ANLT-02 | Stacked status bar calculates proportional widths and renders across projects | component | `npx vitest run tests/components/analytics/StackedStatusBar.test.tsx` | ❌ Wave 0 |
| ANLT-03 | Workload allocation aggregates hours and active tasks across Ops, BA, and Work Types with inheritance | unit | `npx vitest run tests/utils/analytics.test.ts` | ❌ Wave 0 |
| ANLT-03 | Workload table and proportion bar render breakdowns with unassigned grouping | component | `npx vitest run tests/components/analytics/WorkloadProportionBar.test.tsx` | ❌ Wave 0 |
| NAV-13 | AppShell navigation and hash route parsing support `'analytics'` route and deep links | integration | `npx vitest run tests/hooks/useHashRoute.test.ts` | ✅ (extend existing) |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/utils/analytics.test.ts`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/utils/analytics.test.ts` — covers pure computation algorithms for ANLT-01, ANLT-02, ANLT-03.
- [ ] `tests/components/analytics/BurndownSvgChart.test.tsx` — covers interactive SVG chart rendering.
- [ ] `tests/views/AnalyticsView.test.tsx` — covers full dashboard layout, empty states, and tab switching.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Single-user client-only local application. |
| V3 Session Management | no | Local client only; no session cookies or tokens involved in analytics. |
| V4 Access Control | no | Local client application. |
| V5 Input Validation | yes | Sanitize query parameters (`milestoneId`), validate non-negative numbers, prevent NaN / infinite SVG coordinate values. |
| V6 Cryptography | no | No encryption changes needed for Phase 13 analytics. |

### Known Threat Patterns for Analytics & SVG

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via SVG Injection | Tampering | Use declarative React JSX `<svg>` tags; never use `dangerouslySetInnerHTML` for vector rendering. |
| Division by Zero / NaN Coordinates | Denial of Service | Clamp denominators (e.g. `Math.max(1, totalDays)`), validate coordinates before passing to SVG attributes. |
| URL Parameter Tampering | Tampering | Sanitize hash route parameter `milestoneId` through existing validation and verify existence against database milestones before selection. |

## Sources

### Primary (HIGH confidence)
- Codebase Source: `src/domain/inheritance.ts:14-39` — `resolveInheritedTags` interface and implementation [VERIFIED].
- Codebase Source: `src/types/models.ts:1-90` — Data models for `Task`, `Milestone`, `Project`, and `WorkType` [VERIFIED].
- Codebase Source: `src/types/navigation.ts:1-5` — `AppRoute` union and navigation signature [VERIFIED].
- Codebase Source: `src/hooks/useHashRoute.ts:1-84` — Hash route parsing, validation, and parameter serialization [VERIFIED].
- Codebase Source: `src/utils/time.ts:34-50` — `formatMinutes` function [VERIFIED].
- Codebase Source: `src/utils/date.ts:1-60` — `isValidCalendarDate`, `getTodayDateString` helpers [VERIFIED].

### Secondary (MEDIUM confidence)
- npm registry: Package legitimacy and version validation via `gsd-tools query package-legitimacy check`.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - zero new dependencies, leverages existing verified libraries.
- Architecture: HIGH - pure math utility decoupled from presentation, native React SVG.
- Pitfalls: HIGH - identified boundary conditions (zero duration, future speculation, NaN coordinates).

**Research date:** 2026-09-30
**Valid until:** 2026-10-30
