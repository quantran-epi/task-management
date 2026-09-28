# Phase 10: Date-Range Search, Multi-Criteria Filtering & Standup Export - Research

**Researched:** 2026-09-28  
**Domain:** Reactive Client-Side Filtering, IndexedDB Date Range Queries, Markdown Standup Formatting, Clipboard API  
**Confidence:** HIGH  

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Expand existing `TaskFilterBar` with a collapsible advanced filter section toggled via an "Bộ lọc nâng cao" button with an active filter count badge. Avoids separate drawer or modal fragmentation and keeps filtering inline with the table.
- **D-02:** Ant Design `DatePicker.RangePicker` for both execution date range and deadline date range inputs using standard `YYYY-MM-DD` strings to prevent timezone drift.
- **D-03:** Advanced filter controls include:
  - `milestoneId`: Select dropdown filtered by selected project (or all milestones).
  - `opsOwners`: Select `mode="tags"` / multiselect for filtering tasks matching any selected Ops Owner (supporting inheritance matching).
  - `businessAnalysts`: Select `mode="tags"` / multiselect for filtering tasks matching any selected BA (supporting inheritance matching).
  - `workType`: Multiselect for 7 work types (`code`, `document`, `meeting`, `support_testing`, `investigate`, `configuration`, `review_code`).
  - `executionDateRange`: `[startDate, endDate]` range picker.
  - `deadlineRange`: `[startDate, endDate]` range picker.
- **D-04:** Single "Xóa bộ lọc" (Reset) button resets all filter criteria (both basic and advanced) back to `DEFAULT_TASK_FILTER_STATE`.
- **D-05:** Reactive execution date query using Dexie `db.plannedAllocations.where('date').between(start, end, true, true)` via `useLiveQuery` in a dedicated hook or filter pipeline. Extracts unique `taskId` Set matching planned hours in the range.
- **D-06:** Tasks without planned hours in the selected execution date range are excluded (filtered out of the table), not dimmed.
- **D-07:** Task row display stays focused on task attributes; does not compute or display cumulative allocated hours in range inside table cells (pure filtering).
- **D-08:** Standup export action button ("📋 Sao chép Standup") placed on the toolbar / header row of `TaskTable` / `TaskFilterBar`. Clicking writes formatted Markdown text to clipboard via `navigator.clipboard.writeText()` with Ant Design `message.success` confirmation.
- **D-09:** Standup grouping by status categories:
  - `### ✅ Đã hoàn thành` for `Done` tasks.
  - `### 🔄 Đang thực hiện` for `In Progress`, `In Review`, `Resolved` tasks.
  - `### 📋 Kế hoạch / Đang chờ` for `Open` tasks.
  - Exclude `Cancelled` tasks from export.
- **D-10:** Per-task standup item format:
  - `- [WorkTypeLabel] Task Title (Dự án: ProjectName | Hạn: YYYY-MM-DD | Phụ trách: Ops / BA)`
  - Uses Vietnamese labels tailored to SHB banking IT daily standup reporting via Teams/Slack/Email.

### Claude's Discretion

- Exact layout spacing, flex wrap thresholds, and collapse animation of the advanced filter container.
- Specific icons for the advanced filter toggle and standup export buttons.
- Fallback behavior when `navigator.clipboard` is unavailable (e.g. non-HTTPS iframe / fallback prompt).

### Deferred Ideas (OUT OF SCOPE)

- **PROD-01 (Next Milestone candidate):** Save and reuse preferred filter combinations (saved presets). Out of scope for Phase 10.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SRCH-01 | User can search and filter tasks by planned execution date window (via daily allocation ledger). | Dexie index on `plannedAllocations.date` (`src/db/schema.ts:18`) queried with `where('date').between(start, end, true, true)` via `useLiveQuery` to extract matching `taskId` Set. |
| SRCH-02 | User can search and filter tasks by deadline date range. | Ant Design `DatePicker.RangePicker` produces canonical `YYYY-MM-DD` strings; `filterTasks` compares `task.deadline >= start && task.deadline <= end` lexicographically. |
| SRCH-03 | User can filter tasks simultaneously by status, priority, workType, project, milestone, Ops Owner, and BA. | Expanded `TaskFilterState` and pure in-memory `filterTasks` pipeline evaluating all criteria simultaneously with Ops/BA inheritance via `resolveInheritedTags`. |
| SRCH-04 | User can copy filtered task results as formatted Markdown standup summary to clipboard. | Pure `formatStandupSummary` utility grouping by status (`✅ Đã hoàn thành`, `🔄 Đang thực hiện`, `📋 Kế hoạch / Đang chờ`) with `navigator.clipboard.writeText()` and modal fallback. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Persistence**: IndexedDB via Dexie 4 is the working data store; app functions 100% offline [VERIFIED: CLAUDE.md].
- **Identifiers**: Stable client-generated UUIDs (`crypto.randomUUID()`) [VERIFIED: CLAUDE.md].
- **Calendar Dates**: Persist and compare calendar days as `YYYY-MM-DD` strings to avoid timezone drift [VERIFIED: CLAUDE.md].
- **UI Stack**: Ant Design 6.6.5 component system with bundled TypeScript definitions (no `@types/antd`) [VERIFIED: CLAUDE.md].
- **Date Math**: Dayjs 1.11.23 for UI date parsing/formatting [VERIFIED: CLAUDE.md].
- **Validation**: Runtime validation via Zod at boundaries [VERIFIED: CLAUDE.md].
- **Zero New Dependencies**: Leverage existing installed dependencies only [VERIFIED: CLAUDE.md].

## Summary

Phase 10 equips the Personal Task & Workload Planner with comprehensive search, multi-criteria filtering, and one-click standup export. Users can query scheduled tasks across planned execution windows (leveraging the existing `plannedAllocations` table indexed on `date`) and deadline ranges, as well as filtering by banking domain attributes (`workType`, `opsOwners`, `businessAnalysts`), milestone, project, status, and priority. The filtered view can be exported to the system clipboard as a formatted Markdown daily standup report.

The technical architecture extends the existing pure filtering pipeline in `src/utils/filter.ts` and state hook in `src/hooks/useTaskFilters.ts`, combining in-memory multi-attribute filtering with a reactive Dexie `useLiveQuery` for allocation dates. The UI expands `TaskFilterBar.tsx` with an inline collapsible advanced filter panel containing Ant Design `DatePicker.RangePicker` and `Select` controls, badged with an active filter counter, and adds a standup copy button to the toolbar with graceful fallback when clipboard permissions are unavailable.

**Primary recommendation:** Keep filtering logic pure in `src/utils/filter.ts` accepting an indexed `executionTaskIds: Set<string> | null` from Dexie `useLiveQuery`, execute standup formatting as an isolated pure utility in `src/utils/standup.ts`, and place the advanced collapsible filter panel directly inside `TaskFilterBar.tsx` to maintain instant, zero-lag filtering without UI fragmentation.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Execution date range query (`SRCH-01`) | Database / Storage (IndexedDB/Dexie) | Browser Client (`useLiveQuery`) | `plannedAllocations` contains per-day minute records. Querying via indexed `date` B-tree cursor avoids loading all allocations into memory. |
| Deadline range filtering (`SRCH-02`) | Browser / Client (`filterTasks`) | — | Deadlines exist directly on `Task` objects already in memory. Pure string comparison `deadline >= start && deadline <= end` is instantaneous. |
| Multi-criteria filtering & inheritance (`SRCH-03`) | Browser / Client (`filterTasks`) | — | Pure function evaluating `Task[]` against `TaskFilterState` using in-memory `projectMap` and `milestoneMap` for tag inheritance. |
| Advanced filter UI & badge (`D-01`, `D-03`) | Browser / Client (`TaskFilterBar`) | — | Ant Design `DatePicker.RangePicker`, `Select`, `Badge`, and collapsible flex container. |
| Standup Markdown generation (`SRCH-04`) | Browser / Client (`formatStandupSummary`) | — | Pure string transformation formatting filtered tasks into Markdown sections according to banking IT standup standards. |
| Clipboard write & fallback toast (`SRCH-04`) | Browser / Client (`navigator.clipboard`) | UI Modal fallback | Async browser Clipboard API with Ant Design `message.success`/`message.error` and interactive text copy modal fallback. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| antd | 6.6.5 | UI components: `DatePicker.RangePicker`, `Select`, `Badge`, `Button`, `Modal`, `message` [VERIFIED: package.json:14] | Fixed UI decision; provides accessible RangePicker with Dayjs integration, tag multiselect, and count badges. |
| @ant-design/icons | 6.3.4 | Filter, copy, calendar, and clear icons [VERIFIED: package.json:13] | Standard icon set matching Ant Design components. |
| dexie | 4.4.6 | IndexedDB querying for `plannedAllocations` [VERIFIED: package.json:16] | High-performance IndexedDB wrapper with compound indexes and `.where('date').between()` range queries. |
| dexie-react-hooks | 4.4.0 | Reactive React queries via `useLiveQuery` [VERIFIED: package.json:17] | Automatically re-evaluates execution task ID set whenever allocations are created, updated, or removed. |
| dayjs | 1.11.23 | Date parsing/formatting for RangePickers [VERIFIED: package.json:15] | Immutable date library integrated with Ant Design DatePicker; outputs canonical `YYYY-MM-DD`. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| fake-indexeddb | 6.2.5 | In-memory IndexedDB test shim [VERIFIED: package.json:30] | Used in Vitest unit tests verifying Dexie allocation date-range queries. |
| vitest | 5.0.2 | Test runner [VERIFIED: package.json:35] | Fast ESM test runner configured with Node environment for non-DOM tests. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inline collapsible panel in `TaskFilterBar` | Ant Design `Drawer` or `Modal` | Drawers/Modals occlude the table, require multiple clicks to inspect results, and decouple filter inputs from visual table feedback. Inline collapsible keeps table visible. |
| Native `navigator.clipboard.writeText` | `copy-to-clipboard` npm package | Browser native API requires zero extra bytes; fallback modal covers permission denial or unsecure contexts without any library. |
| In-memory Dexie Set query | In-memory filter over all allocations | Loading all allocations across months/years into browser memory on every render wastes memory; Dexie `.where('date').between()` uses IndexedDB index. |

**Installation:**
No new packages required. All necessary dependencies are already installed in `package.json`.

## Package Legitimacy Audit

> All required libraries are already installed in `package.json`. No external dependencies are added in Phase 10.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none) | — | — | — | — | [OK] | No packages to install |

**Packages removed due to [SLOP] verdict:** none  
**Packages flagged as suspicious [SUS]:** none  

## In-Repo Discrete Values Verbatim Citations

To guarantee typecheck and runtime precision, the following discrete values are quoted verbatim from the codebase:

1. **Work Types** (`src/types/models.ts:6-14`):
```typescript
export type WorkType =
  | 'code'
  | 'document'
  | 'meeting'
  | 'support_testing'
  | 'investigate'
  | 'configuration'
  | 'review_code';
```
[VERIFIED: src/types/models.ts:6-14]

2. **Work Type Labels & Colors** (`src/components/tasks/WorkTypeBadge.tsx:20-56`):
```typescript
export const WORK_TYPE_CONFIG: Record<WorkType, WorkTypeConfig> = {
  code: { label: 'Lập trình', color: 'blue', icon: <CodeOutlined /> },
  document: { label: 'Tài liệu', color: 'green', icon: <FileTextOutlined /> },
  meeting: { label: 'Họp hành', color: 'purple', icon: <TeamOutlined /> },
  support_testing: { label: 'Hỗ trợ SIT / UAT', color: 'orange', icon: <CheckCircleOutlined /> },
  investigate: { label: 'Điều tra lỗi / R&D', color: 'magenta', icon: <BugOutlined /> },
  configuration: { label: 'Cấu hình hệ thống', color: 'cyan', icon: <SettingOutlined /> },
  review_code: { label: 'Review code', color: 'gold', icon: <EyeOutlined /> },
};
```
[VERIFIED: src/components/tasks/WorkTypeBadge.tsx:20-56]

3. **Task Status and Priority** (`src/types/models.ts:3-4`):
```typescript
export type TaskStatus = 'Open' | 'In Progress' | 'Resolved' | 'In Review' | 'Done' | 'Cancelled';
export type TaskPriority = 'Low' | 'Medium' | 'High' | 'Urgent';
```
[VERIFIED: src/types/models.ts:3-4]

4. **Existing Filter State** (`src/utils/filter.ts:4-22`):
```typescript
export interface TaskFilterState {
  search: string;
  hierarchyScope: 'all' | 'projects' | 'standalone';
  projectId: string | null;
  statuses: TaskStatus[];
  priorities: TaskPriority[];
  horizon: 'all' | 'overdue' | 'today' | 'this_week';
  includeClosed: boolean;
}

export const DEFAULT_TASK_FILTER_STATE: TaskFilterState = {
  search: '',
  hierarchyScope: 'all',
  projectId: null,
  statuses: ['Open', 'In Progress', 'Resolved', 'In Review'],
  priorities: [],
  horizon: 'all',
  includeClosed: false,
};
```
[VERIFIED: src/utils/filter.ts:4-22]

5. **Planned Allocations Schema Index** (`src/db/schema.ts:18`):
```typescript
plannedAllocations: 'id, taskId, date',
```
[VERIFIED: src/db/schema.ts:18]

6. **Inheritance Resolver Signature** (`src/domain/inheritance.ts:14-18`):
```typescript
export function resolveInheritedTags(
  field: 'opsOwners' | 'businessAnalysts',
  item: { opsOwners?: string[]; businessAnalysts?: string[]; milestoneId?: string; projectId?: string },
  ancestors: EntityTagAncestors
): TagInheritanceResult
```
[VERIFIED: src/domain/inheritance.ts:14-18]

## Architecture Patterns

### System Architecture Diagram

```
[ User Input / Filter Bar ]
   │
   ├─► DatePicker.RangePicker (Execution: YYYY-MM-DD [start, end])
   │      │
   │      ▼
   │   Dexie useLiveQuery: db.plannedAllocations.where('date').between(start, end, true, true)
   │      │
   │      ▼
   │   executionTaskIds (Set<string> of distinct taskIds)
   │
   ├─► DatePicker.RangePicker (Deadline: YYYY-MM-DD [start, end])
   ├─► Select Dropdowns (milestone, workTypes, opsOwners, businessAnalysts, statuses, priorities)
   ├─► Input (search text - debounced 200ms)
   │      │
   │      ▼
   │   TaskFilterState
   │      │
   │      ▼
[ filterTasks(tasks, filterState, context: { todayStr, projectMap, milestoneMap, executionTaskIds }) ]
   │
   ├─► In-Memory Multi-Criteria Evaluation (O(N)):
   │      1. Text search (name, description, notes)
   │      2. Hierarchy scope (all, projects, standalone) & projectId
   │      3. milestoneId match
   │      4. Status & includeClosed
   │      5. Priority match
   │      6. WorkType match
   │      7. Ops Owner match (direct || inherited from milestone/project)
   │      8. BA match (direct || inherited from milestone/project)
   │      9. Date horizon (all, overdue, today, this_week)
   │     10. Deadline date range [start, end]
   │     11. Execution date match (task.id in executionTaskIds)
   │
   ▼
[ sortTasks(filtered, sortField, sortOrder) ]
   │
   ├─► Rendered in TaskTable (Inline Table View)
   │
   └─► Standup Export Trigger ("Sao chép Standup" CTA)
          │
          ▼
       formatStandupSummary(filteredTasks, { projectMap, milestoneMap, date: todayStr })
          │
          ├─► Status Grouping:
          │     - ### ✅ Đã hoàn thành (Done)
          │     - ### 🔄 Đang thực hiện (In Progress, In Review, Resolved)
          │     - ### 📋 Kế hoạch / Đang chờ (Open)
          │     (Cancelled tasks excluded)
          │
          ├─► Item Format:
          │     - [WorkType] Name (Dự án: X | Hạn: Y | Phụ trách: Ops/BA)
          │
          ▼
       navigator.clipboard.writeText(markdown)
          ├─► Success: message.success("Đã sao chép báo cáo Standup vào clipboard")
          └─► Error / Denied: message.error(...) + Modal preview fallback
```

### Recommended Project Structure
```
src/
├── utils/
│   ├── filter.ts          # Extended TaskFilterState, filterTasks, countActiveAdvancedFilters
│   └── standup.ts         # Pure formatStandupSummary and clipboard copy helper with fallback
├── hooks/
│   └── useTaskFilters.ts  # Filter state, debounce, execution task IDs integration, memoized results
├── db/repositories/
│   └── allocationRepo.ts  # getTaskIdsWithAllocationsInRange helper query
├── components/tasks/
│   ├── TaskFilterBar.tsx  # Top row + collapsible advanced filter panel with RangePickers and Badge
│   └── TaskTable.tsx      # Table view, toolbar Standup CTA button, empty state
└── views/
    └── TasksView.tsx      # View coordinator wiring Dexie, projects, milestones, filters, and standup
```

### Pattern 1: Reactive Execution Window Filtering with Dexie `useLiveQuery`
**What:** When an execution date range `[startDate, endDate]` is specified, query Dexie's indexed `plannedAllocations` table for records where `date >= startDate && date <= endDate` using `between(startDate, endDate, true, true)`. Extract unique `taskId` values into a `Set<string>`.
**When to use:** Whenever `filters.executionDateRange` is active. When null, query is bypassed and returns `null` (no filter).
**Example:**
```typescript
// Source: Dexie.js official documentation on Collection.between() and useLiveQuery
export function useExecutionTaskIds(
  db: TaskPlannerDatabase,
  dateRange?: [string, string] | null
): Set<string> | null | undefined {
  return useLiveQuery(
    async () => {
      if (!dateRange || !dateRange[0] || !dateRange[1]) {
        return null;
      }
      const [start, end] = dateRange;
      const allocations = await db.plannedAllocations
        .where('date')
        .between(start, end, true, true)
        .toArray();
      return new Set(allocations.map((a) => a.taskId));
    },
    [db, dateRange?.[0], dateRange?.[1]]
  );
}
```

### Pattern 2: Multi-Criteria Filter Pipeline with Inheritance Resolution
**What:** Extend `filterTasks` to evaluate all 11 criteria in a single pass. For Ops Owner and BA matching, resolve the effective tags using `resolveInheritedTags` with the provided `ancestors` (`project` and `milestone`).
**When to use:** Pure in-memory filtering inside `useTaskFilters` or unit tests.
**Example:**
```typescript
// Filter condition for Ops Owners with inheritance:
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
```

### Pattern 3: Standup Markdown Formatting and Safe Clipboard Copy
**What:** Pure utility function `formatStandupSummary` that groups filtered tasks by status category, excludes `Cancelled` tasks, formats each task with banking IT labels, and handles empty categories gracefully with `- (Không có)`.
**When to use:** Exporting standup summary to clipboard upon clicking "Sao chép Standup".
**Example:**
```typescript
export function formatStandupSummary(
  tasks: Task[],
  context: {
    projectMap: Map<string, Project>;
    milestoneMap: Map<string, Milestone>;
    dateStr: string;
  }
): string {
  const { projectMap, milestoneMap, dateStr } = context;

  const doneTasks = tasks.filter((t) => t.status === 'Done');
  const inProgressTasks = tasks.filter(
    (t) => t.status === 'In Progress' || t.status === 'In Review' || t.status === 'Resolved'
  );
  const openTasks = tasks.filter((t) => t.status === 'Open');

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
```

### Anti-Patterns to Avoid
- **Passing Date objects into FilterState:** Never store `Date` objects in filter state. Ant Design `RangePicker` passes Dayjs objects in `onChange`, but state must convert immediately to `[string, string]` (`YYYY-MM-DD`) via `.format('YYYY-MM-DD')` to prevent timezone offsets.
- **Filtering Planned Allocations in Javascript Memory:** Do not load all `plannedAllocations` table records into client memory to find active tasks. Use Dexie's B-tree index `.where('date').between(...)`.
- **Dimming vs Excluding in Execution Date Search:** D-06 explicitly requires tasks without planned hours in the execution window to be excluded from the table, not dimmed.
- **Including Cancelled tasks in Standup:** D-09 mandates excluding `Cancelled` tasks from standup markdown.
- **Unchecked navigator.clipboard Calls:** In non-HTTPS contexts or if clipboard permissions are denied, `navigator.clipboard.writeText()` rejects with a DOMException. Always wrap in try/catch and provide the copywriting error toast plus a fallback modal displaying the text.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Date Range Picker UI | Custom dual calendar input | Ant Design `DatePicker.RangePicker` [VERIFIED: CLAUDE.md] | Built-in presets, keyboard navigation, popover layout, and Dayjs formatting. |
| Tag Multiselect Dropdowns | Custom autocomplete tag selector | Ant Design `Select mode="tags"` and `mode="multiple"` [VERIFIED: CLAUDE.md] | Handles tag overflow (`maxTagCount="responsive"`), deletion, keyboard search, and deduplication. |
| Reactive IndexedDB State | Custom IndexedDB event listeners or polling | Dexie `useLiveQuery` [VERIFIED: CLAUDE.md] | Automatically re-subscribes to IndexedDB mutations and triggers React re-render when allocations change. |
| Tag Inheritance Resolution | Custom parent traversal loops in table | `resolveInheritedTags()` in `src/domain/inheritance.ts` [VERIFIED: src/domain/inheritance.ts:14-39] | Pre-tested nearest-ancestor tag inheritance logic built in Phase 9. |
| Active Filter Count Badge | Custom badge CSS overlays | Ant Design `Badge count={count}` [VERIFIED: CLAUDE.md] | Standard accessible badge component matching Ant Design design tokens. |

**Key insight:** All required primitives (UI components, IndexedDB reactivity, date utilities, inheritance resolution) already exist in the codebase and installed dependencies. Phase 10 requires zero new npm packages.

## Runtime State Inventory

> Greenfield feature addition within existing schema; no migrations or data transformations required.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | None — schema v2 index `plannedAllocations.date` already exists [VERIFIED: src/db/schema.ts:18] | None |
| Live service config | None | None |
| OS-registered state | None | None |
| Secrets/env vars | None | None |
| Build artifacts | None | None |

## Common Pitfalls

### Pitfall 1: Timezone Offset in Ant Design RangePicker
**What goes wrong:** User picks `2026-10-01` to `2026-10-05` in UI, but `RangePicker` produces ISO strings with local timezone offsets (e.g., `2026-09-30T17:00:00.000Z`), causing date mismatches against stored `YYYY-MM-DD` strings.  
**Why it happens:** Converting Dayjs objects with `.toISOString()` converts to UTC.  
**How to avoid:** Always extract dates using `.format('YYYY-MM-DD')` or read the second parameter of `RangePicker`'s `onChange: (dates, dateStrings) => ...` which directly yields canonical `[string, string]`.  
**Warning signs:** Filtering for "today" shows tasks from yesterday or misses tasks scheduled for today.

### Pitfall 2: Node.js 20.17 Vitest JSDOM ESM Worker Crash
**What goes wrong:** Running `vitest run` without specifying `--environment node` triggers `RangeError: Maximum call stack size exceeded` in `@exodus/bytes/encoding-lite.js` required by `html-encoding-sniffer` under JSDOM 29.1.1 on Node 20.17 [VERIFIED: codebase bash test].  
**Why it happens:** Node 20.17 lacks native CommonJS `require(ESM)` support present in Node >= 20.19 / Node 24 LTS.  
**How to avoid:** For all non-DOM tests (filter logic, standup formatting, allocation queries via `fake-indexeddb`), add `// @vitest-environment node` at the top of the test file, or run tests with `--environment node`.  
**Warning signs:** Vitest unhandled error: `require() of ES Module .../@exodus/bytes/encoding-lite.js not supported`.

### Pitfall 3: Clipboard API Security Context Denial
**What goes wrong:** `navigator.clipboard.writeText()` throws an exception or is `undefined` when running inside an insecure context (`http://` on non-localhost, or certain iframe permissions).  
**Why it happens:** The W3C Clipboard API requires a Secure Context (HTTPS or localhost) and explicit user gesture permissions.  
**How to avoid:** Check `if (navigator.clipboard?.writeText)` and wrap the call in a `try...catch` block. On failure, display the Copywriting Contract error toast (`Không thể sao chép Standup vào clipboard...`) and open a fallback `Modal` containing the formatted text in an Ant Design `Input.TextArea` with an instruction to manually copy.  
**Warning signs:** Uncaught (in promise) DOMException on standup export.

### Pitfall 4: Sub-optimal Performance from Reactive Allocation Queries
**What goes wrong:** Changing any filter field causes repeated unnecessary queries to `plannedAllocations` table.  
**Why it happens:** Passing entire `filters` object as dependency to `useLiveQuery`.  
**How to avoid:** Key the `useLiveQuery` dependency array only on `filters.executionDateRange?.[0]` and `filters.executionDateRange?.[1]`. If execution date range is unset (`null`), return `null` immediately without executing an IndexedDB query.  
**Warning signs:** UI stuttering or IndexedDB console warnings while typing in the text search box.

## Code Examples

### 1. Extended TaskFilterState and Active Filter Counter
```typescript
// Location: src/utils/filter.ts
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

### 2. Standup Markdown Generation Utility
```typescript
// Location: src/utils/standup.ts
import type { Task, Project, Milestone } from '../types/models';
import { WORK_TYPE_CONFIG } from '../components/tasks/WorkTypeBadge';
import { resolveInheritedTags } from '../domain/inheritance';

export interface StandupContext {
  projectMap: Map<string, Project>;
  milestoneMap: Map<string, Milestone>;
  dateStr: string;
}

export function formatStandupSummary(tasks: Task[], context: StandupContext): string {
  const { projectMap, milestoneMap, dateStr } = context;

  // Filter out Cancelled tasks per D-09
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
```

### 3. Safe Clipboard Copy with Notification
```typescript
// Location: src/utils/standup.ts
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (navigator?.clipboard?.writeText) {
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

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom modal/drawer filter forms | Inline collapsible filter bar with active badge | Modern desktop web apps (e.g. GitHub/Jira 2024+) | Preserves context; user sees real-time table results update directly behind the filter controls without closing a dialog. |
| `document.execCommand('copy')` | `navigator.clipboard.writeText()` with Modal fallback | Web Standards (Async Clipboard API) | Safe, asynchronous, non-blocking clipboard interaction. Fallback modal handles restricted iframe/HTTP contexts. |
| In-memory filtering of full relational datasets | Dexie indexed B-tree cursor query `.where('date').between(...)` | Dexie v3/v4 | Scales efficiently even with hundreds of daily allocation entries without freezing UI thread. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Standup format section titles use Vietnamese banking IT labels (`### ✅ Đã hoàn thành`, `### 🔄 Đang thực hiện`, `### 📋 Kế hoạch / Đang chờ`) [VERIFIED: 10-CONTEXT.md:35-42]. | Standup Export Format | Low — matches locked decision D-09 verbatim. |
| A2 | Cancelled tasks must be excluded from standup export [VERIFIED: 10-CONTEXT.md:39]. | Standup Export Format | Low — matches locked decision D-09 verbatim. |

*Note: All claims in this research are verified from CONTEXT.md, UI-SPEC.md, or the existing codebase — no unverified assumptions exist.*

## Open Questions

1. **Should the milestone filter dropdown show all milestones or only milestones belonging to the selected project?**
   - *What we know:* D-03 specifies: `milestoneId`: Select dropdown filtered by selected project (or all milestones).
   - *Recommendation:* When `filters.projectId` is selected, filter the milestone options to only those with `milestone.projectId === filters.projectId`. When `filters.projectId` is null, display all milestones with their parent project name in parentheses (e.g. `Milestone A (Project X)`). If project changes and the selected milestone does not belong to the newly selected project, clear `milestoneId`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Tooling runtime | ✓ | v20.17.0 | Target is Node 24 LTS; use `--environment node` in Vitest for non-DOM tests [VERIFIED: bash] |
| npm | Package management | ✓ | 10.8.2 | Bundled with Node [VERIFIED: bash] |
| Vite | Dev/Build server | ✓ | 8.3.1 | [VERIFIED: package.json:33] |
| Vitest | Test execution | ✓ | 5.0.2 | [VERIFIED: package.json:35] |
| Dexie | IndexedDB persistence | ✓ | 4.4.6 | [VERIFIED: package.json:16] |
| Ant Design | UI components | ✓ | 6.6.5 | [VERIFIED: package.json:14] |

**Missing dependencies with no fallback:**
- None

**Missing dependencies with fallback:**
- JSDOM 29.1.1 on Node 20.17 has an ESM dependency require bug (`@exodus/bytes`). **Fallback:** Configure `// @vitest-environment node` on non-DOM test suites. Runs cleanly in < 1 second.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.2 [VERIFIED: package.json:35] |
| Config file | `vite.config.ts` [VERIFIED: vite.config.ts] |
| Quick run command | `npx vitest run tests/utils/filter.test.ts tests/utils/standup.test.ts --environment node` |
| Full suite command | `npx vitest run --environment node` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SRCH-01 | Filter tasks matching execution date range via planned allocations | unit / db | `npx vitest run tests/utils/filter.test.ts tests/db/allocationRepo.test.ts --environment node` | ❌ Wave 0 (extend existing) |
| SRCH-02 | Filter tasks matching deadline date range | unit | `npx vitest run tests/utils/filter.test.ts --environment node` | ❌ Wave 0 (extend existing) |
| SRCH-03 | Multi-criteria filter simultaneously matching workType, milestone, Ops Owner, BA with inheritance | unit | `npx vitest run tests/utils/filter.test.ts --environment node` | ❌ Wave 0 (extend existing) |
| SRCH-04 | Format filtered tasks into Markdown standup grouped by status | unit | `npx vitest run tests/utils/standup.test.ts --environment node` | ❌ Wave 0 (new file) |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/utils/filter.test.ts tests/utils/standup.test.ts --environment node`
- **Per wave merge:** `npm run build && npx vitest run tests/utils/ tests/db/ --environment node`
- **Phase gate:** All unit tests green and `npm run build` zero TypeScript errors before verification.

### Wave 0 Gaps
- [ ] `tests/utils/standup.test.ts` — covers SRCH-04 standup Markdown generation, formatting, status grouping, and empty category handling.
- [ ] Extend `tests/utils/filter.test.ts` — add test cases covering `executionDateRange` with Set matching, `deadlineRange` boundary tests, `workTypes`, `milestoneId`, and `opsOwners`/`businessAnalysts` inheritance filtering.
- [ ] Extend `tests/db/allocationRepo.test.ts` — add test verifying `getTaskIdsWithAllocationsInRange` using `fake-indexeddb`.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Single-user local application, no backend auth. |
| V3 Session Management | no | Local application state stored in IndexedDB. |
| V4 Access Control | yes | Client-side origin isolation (Same-Origin Policy). |
| V5 Input Validation | yes | Strict `YYYY-MM-DD` date validation, sanitization of task names in Markdown standup summary. |
| V6 Cryptography | no | Existing Web Crypto AES-GCM backup encryption untouched in this phase. |

### Known Threat Patterns for Client-Side Filtering & Clipboard Export

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via Clipboard Injection | Tampering | Standup export is plain text copied via `navigator.clipboard.writeText(markdown)`. Never rendered via `dangerouslySetInnerHTML`. |
| Denial of Service via Huge Allocation Range | Denial of Service | IndexedDB cursor query with `.between(start, end, true, true)` uses Dexie B-tree index, bounding scan time. Filter state debounce prevents per-keystroke queries. |
| Clipboard Permission Crash | Repudiation / Denial of Service | Try/catch around `navigator.clipboard.writeText` with clear user feedback toast and interactive modal fallback. |

## Sources

### Primary (HIGH confidence)
- `src/db/schema.ts` — Dexie schema v2 with `plannedAllocations: 'id, taskId, date'` and multi-entry indexes [VERIFIED: src/db/schema.ts:12-21].
- `src/domain/inheritance.ts` — Tag inheritance resolver `resolveInheritedTags` [VERIFIED: src/domain/inheritance.ts:14-39].
- `src/components/tasks/WorkTypeBadge.tsx` — `WORK_TYPE_CONFIG` with Vietnamese banking IT labels [VERIFIED: src/components/tasks/WorkTypeBadge.tsx:20-56].
- `src/utils/filter.ts` — `TaskFilterState`, `DEFAULT_TASK_FILTER_STATE`, `filterTasks` [VERIFIED: src/utils/filter.ts:4-140].
- `src/db/repositories/allocationRepo.ts` — Dexie allocation query patterns and methods [VERIFIED: src/db/repositories/allocationRepo.ts:197-210].
- `.planning/phases/10-date-range-search-multi-criteria-filtering-standup-export/10-CONTEXT.md` — User decisions D-01 through D-10 [VERIFIED: 10-CONTEXT.md].
- `.planning/phases/10-date-range-search-multi-criteria-filtering-standup-export/10-UI-SPEC.md` — UI design contract [VERIFIED: 10-UI-SPEC.md].

### Secondary (MEDIUM confidence)
- Dexie.js Official Documentation: Collection `.between()` range queries and `useLiveQuery` hook patterns [CITED: dexie.org/docs/Collection/Collection.between()].
- MDN Web Docs: Asynchronous Clipboard API (`navigator.clipboard.writeText`) [CITED: developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText].

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — completely aligns with existing project stack (Ant Design, Dexie, Dayjs).
- Architecture: HIGH — pure filtering pipeline and live Dexie allocation queries already verified in codebase.
- Pitfalls: HIGH — Node 20.17 Vitest JSDOM ESM issue discovered and verified with working node environment fallback.

**Research date:** 2026-09-28  
**Valid until:** 2026-10-28 (30 days for stable offline web app)
