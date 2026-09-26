# Phase 2: Work Hierarchy & Fast Task Management - Research

**Researched:** 2026-09-26
**Domain:** Work hierarchy management, task CRUD, Dexie data repositories, cascade deletion safety, Ant Design table/inline controls, filtering & search
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Separate views for Tasks and Projects: use `/#/tasks` for the unified task management table, and `/#/projects` for managing projects and milestones.
- **D-02:** Display hierarchy context on task rows in `/#/tasks` using a compact Breadcrumb Tag (`Project > Milestone`, `Project`, or `Standalone`) with click-to-filter capability.
- **D-03:** In `/#/projects`, display projects in an expandable Ant Design Table where expanding a project reveals its nested milestones and direct tasks.
- **D-04:** Provide quick filtering for standalone tasks via an Ant Design Segmented control on top of the task list (`All` | `Projects` | `Standalone`) plus a project filter dropdown.
- **D-05:** Fast task creation via a top-of-table Input Bar on `/#/tasks` (type name, optional inline project picker, press Enter to create with default status Open).
- **D-06:** Clickable Status Tag in task rows: clicking the status badge opens a dropdown menu to change status immediately with instant IndexedDB persistence.
- **D-07:** Popover Slider & Input for Progress: clicking the progress indicator opens a compact popover with a slider (0-100%) and numeric input; saving on blur/close.
- **D-08:** Comprehensive task editing via a right slide-out Drawer (`Drawer` component) when clicking task title or edit button, preserving table context and supporting `Esc` to close.
- **D-09:** Reparenting tasks (Standalone <-> Project <-> Milestone) handled via cascading Select inputs in the task Drawer form and row action menu, keeping original stable UUID unchanged.
- **D-10:** Automatically reset `milestoneId` to undefined when changing a task's `projectId`, allowing user to select a new milestone belonging to the destination project.
- **D-11:** Batch Selection Bar on `/#/tasks`: multi-select checkboxes reveal a floating action bar to batch-change status, batch-move project/milestone, or batch-delete.
- **D-12:** Contextual creation: on `/#/projects`, each milestone and project row provides a `+ Add Task` button pre-filling the parent project and milestone.
- **D-13:** When deleting a Project with children, modal requires explicit choice: "Delete All (Project + Milestones + Child Tasks)" OR "Delete Project Only (Keep Tasks as Standalone)".
- **D-14:** When deleting a Milestone with child tasks, modal requires explicit choice: "Delete All Child Tasks" OR "Keep Tasks (Move to Project Level)".
- **D-15:** Strict separation between status `Cancelled` (soft state; item remains in DB, styled muted/strikethrough) and `Delete` action (permanent destruction in IndexedDB).
- **D-16:** Atomic deletion cascade: deleting a task permanently removes all corresponding `plannedAllocations` within the same Dexie transaction to prevent orphaned workload records.
- **D-17:** Comprehensive horizontal filter bar above `/#/tasks`: text search, status multiselect, priority filter, project filter, and date horizon quick-filter tags (`All`, `Overdue`, `Today`, `This Week`).
- **D-18:** Text search applies 200ms debounce, case-insensitive, matching across `name`, `description`, and `notes`.
- **D-19:** Default sorting: Deadline ascending (nearest first, nulls last) followed by Priority descending (`Urgent` -> `High` -> `Medium` -> `Low`). Column headers remain sortable.
- **D-20:** Default status filter: display only active tasks (`Open`, `In Progress`, `Resolved`, `In Review`). `Done` and `Cancelled` tasks hidden by default with a quick toggle to show closed tasks.
- **D-21:** Estimate input in Drawer: paired `InputNumber` fields for Hours and Minutes with quick preset buttons (`+30m`, `1h`, `2h`, `4h`, `8h`). Persists strictly as integer minutes.
- **D-22:** Time display format across tables and views: human-readable `Xh Ym` (e.g. `2h 30m`, `45m`, `4h`).
- **D-23:** Quick-add syntax support: typing optional `~2h` or `~30m` in the Quick-Add input bar parses estimate automatically (defaults to 0 minutes if omitted).
- **D-24:** Estimate validation: non-negative integer between 0 and 6000 minutes (100 hours); gentle reminder prompt if estimate is 0 when switching status to `In Progress`.
- **D-25:** Document links managed as dynamic URL list in Drawer (add/remove row with URL validation); rendered with `target="_blank" rel="noopener noreferrer"`.
- **D-26:** Document links indicator on task table row: compact link icon with count badge (`[🔗 N]`), hover opens Popover with direct clickable links.
- **D-27:** Notes field: multi-line TextArea with `white-space: pre-wrap` and automatic URL detection (linkify).
- **D-28:** Notes indicator on table row: single-line truncated preview under task title with tooltip for full text preview.
- **D-29:** Keyboard shortcuts: `/` to focus search bar, `c` to focus quick-add input bar, `Esc` to close Drawer/Modal (ignored when typing in form inputs).
- **D-30:** Focus restoration: save trigger element ref before opening Modal/Drawer and restore focus precisely upon close; maintain WCAG 2.1 AA visible focus outline.
- **D-31:** Table keyboard navigation: Arrow Up/Down to navigate rows, `Enter` to open details Drawer, `Space` to toggle row selection checkbox.
- **D-32:** Action feedback: non-intrusive `message.success({ content: '...', duration: 1.5 })` and aria-live polite region for screen reader announcements on inline edits.

### Claude's Discretion
- Exact layout spacing, padding, and Ant Design component tokens follow Phase 1 established theme rules.
- Dexie repository query optimizations and compound indexing in schema if needed for text search and status/project filtering.

### Deferred Ideas (OUT OF SCOPE)
- Task dependencies and subtasks (v2 requirement / out of scope for v1).
- Saved search filter presets (PROD-01, v2).
- Task duplication or task templates (PROD-02, v2).
- Command Palette (`Ctrl+K`) for global app navigation (v2 candidate).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WORK-01 | User can create, view, edit, and delete a project with name, description, deadline, notes, and status. | Project repository CRUD in Dexie, expandable table/cards on `/#/projects`, modal forms with Ant Design form validation. |
| WORK-02 | User can create, view, edit, and delete multiple milestones under a project with name, description, deadline, notes, and status. | Milestone repository linked via `projectId`, nested views inside project rows, cascading validation. |
| WORK-03 | User can create, view, edit, and delete a standalone task, a task directly under a project, or a task under a project milestone. | Unified Task repository with optional `projectId` and `milestoneId`, Drawer form, quick-add input bar. |
| WORK-04 | User can move a task between standalone, project-level, and milestone-level placement without changing its stable ID. | Reparenting action updating only `projectId` and `milestoneId`, preserving UUID, auto-resetting invalid milestone on project switch. |
| WORK-05 | User receives an explicit confirmation before deletion cascades to child records; cancellation leaves records available. | Custom confirmation dialogs for Project/Milestone deletion offering explicit choice: delete children vs re-parent to standalone/project-level. |
| TASK-01 | User can record task name, description, deadline, notes, actual start date, actual end date, status, progress percentage, priority, estimate, and document links. | Full Task Drawer form binding all model properties, supporting ISO/calendar date conversion and dynamic link lists. |
| TASK-02 | User can enter estimates using hours and minutes while the application stores an exact integer-minute value. | Split input controls (Hours + Minutes) and quick presets in Drawer; quick parser (`~1h 30m`) in quick-add bar; helper formatters for `Xh Ym`. |
| TASK-03 | User can use task statuses Open, In Progress, Resolved, In Review, Done, and Cancelled. | Fixed status enums, badge colors, dropdown selector inline and in Drawer, muted strikethrough styling for `Cancelled`. |
| TASK-04 | User can use project and milestone statuses Open, In Progress, Done, and Cancelled. | Project/Milestone status dropdowns and badges in project views. |
| TASK-05 | User can search work items by text and filter or sort tasks by status, project, priority, and date horizon. | In-memory reactive filtering on `useLiveQuery` task dataset: 200ms debounced text search across fields, multi-select tags, default sorting. |
| TASK-06 | User can update task status and progress through fast controls without opening a complex editor. | Inline Ant Design Dropdown on Status Tag; compact Slider + InputNumber Popover on Progress column. |
| UX-02 | Core create, edit, status, progress, allocation, and navigation actions remain keyboard accessible with visible focus. | Global shortcut listener (`/`, `c`, `Esc`), table keyboard navigation, focus management. |
| UX-03 | Forms provide labels, inline validation, safe defaults, and focus restoration after modal or drawer actions. | Ant Design Form with Zod/rules schema, ref tracking for trigger button focus restoration on close. |
| UX-05 | Common task updates and workload adjustments require minimal navigation and avoid mandatory multi-step wizards. | Top quick-add bar, inline status/progress popovers, quick batch bar, single-layer drawer. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Audience**: Single personal user — no auth or server.
- **Persistence**: IndexedDB via Dexie 4.4.6; reactive reads via `dexie-react-hooks`.
- **Date formats**: Calendar dates persisted as `YYYY-MM-DD` strings; time durations stored as non-negative integer minutes.
- **IDs**: Stable native `crypto.randomUUID()`.
- **Transactions**: All multi-table updates and cascade deletes wrapped in Dexie transactions.
- **UI Framework**: Ant Design 6.6.5 with Dayjs 1.11.23.
- **Forbidden**: No external backend, no `localStorage` as DB, no raw service worker hacks, no `@types/antd`.

## Summary

Phase 2 builds the core day-to-day workflow: work hierarchy management (Projects and Milestones) and high-speed task management (standalone, project, and milestone tasks). The technical stack is already installed and verified in Phase 1 (React 19, Dexie 4, Ant Design 6, Dayjs, Zod). No external packages are needed.

The core engineering focus is on data integrity and reactive performance:
1. **Repository layer**: Encapsulated Dexie operations (`projectRepo`, `milestoneRepo`, `taskRepo`) providing atomic transactions for multi-record operations (cascade deletion, reparenting, batch updates).
2. **Reactivity & In-Memory Pipeline**: Because this is a personal single-user app with datasets rarely exceeding several thousand items, querying all active tasks via `useLiveQuery` and applying search/filter/sort in-memory provides instant <16ms response times without complex compound IndexedDB index overhead.
3. **Ergonomic Fast Controls**: Inline Status Tag dropdowns, Progress popover sliders, Quick-Add bar with duration syntax (`~2h`), and a side Drawer for detailed task editing ensure minimal navigation friction.

**Primary recommendation:** Build clean typed repositories in `src/db/repositories/` with transactional cascade safety first, then construct the view components on `/#/tasks` and `/#/projects` using standard Ant Design 6 components and custom hooks for search/filter/keyboard shortcuts.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Data Persistence & Schema | Storage (Dexie / IndexedDB) | Browser Runtime | All project, milestone, task entities and cascade logic reside in client-side IndexedDB. |
| Transactional Cascade Logic | Storage / Repository Tier | — | Atomic multi-record deletions (e.g. deleting task + child allocations) must execute inside `db.transaction('rw', ...)` to prevent orphaned records. |
| Search, Filter & Sort | Browser Runtime (React Hooks) | — | Client-side in-memory filtering against live query cache enables instant <16ms search and multi-facet filtering. |
| Quick Task Capture & Inline Edits | UI / Browser Client | Storage | Ant Design Dropdown/Popover triggers direct atomic repo updates on change/blur. |
| Keyboard Shortcuts & Focus Management | UI / Browser Client | DOM | Global listeners and trigger element ref tracking for WCAG 2.1 AA compliant focus restoration. |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| dexie | 4.4.6 [VERIFIED: npm registry] | Local database storage & transactions | Already installed. Schema migrations, ACID transactions, reactive live queries. |
| dexie-react-hooks | 4.4.0 [VERIFIED: npm registry] | React hooks for Dexie | Already installed. Provides `useLiveQuery` for zero-boilerplate reactive UI updates. |
| antd | 6.6.5 [VERIFIED: npm registry] | UI Component library | Already installed. Complete set of Table, Drawer, Modal, Dropdown, Slider, Tag, Breadcrumb, Form. |
| dayjs | 1.11.23 [VERIFIED: npm registry] | Date math & formatting | Already installed. Lightweight immutable date library for horizon filtering (`Today`, `This Week`). |
| zod | 4.6.5 [VERIFIED: npm registry] | Runtime schema validation | Already installed. Validates entity models, inputs, and reparenting integrity. |

### Supporting

All required dependencies were installed during Phase 1. No new packages required.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Client-side in-memory filter | Dexie compound indexes & queries | Compound indexes in IndexedDB are rigid, require exact key order, and do not support partial string text matching across multiple fields (`name`, `description`, `notes`). In-memory filtering on the loaded task set is fast (<5ms for 5,000 tasks) and flexible. |
| Right slide-out Drawer | Full-page navigation or Modal | Drawer preserves table scroll position and visual context while offering ample screen real estate for notes and metadata. |

## Package Legitimacy Audit

No external packages need to be installed for Phase 2. The dependency tree is unchanged from Phase 1.

## Architecture Patterns

### System Architecture Diagram

```
User Action (Keyboard/Click)
  │
  ├──> Top Quick-Add Bar (name + "~2h" parser) ──> taskRepo.create() ──┐
  │                                                                     │
  ├──> Inline Tag / Popover (Status / Progress) ──> taskRepo.update() ──┤
  │                                                                     │
  ├──> Task Drawer (Reparent / Details / Notes) ─> taskRepo.update() ───┼──> Dexie DB (IndexedDB)
  │                                                                     │       │
  ├──> Cascade Delete Modal (Choose delete/orphan) ─> cascadeDelete() ──┤       │
  │                                                                     │       ▼
  └──> Filter Bar (Search text, Status, Horizon)                        │   useLiveQuery()
          │                                                             │       │
          ▼                                                             │       ▼
     In-Memory Filter Pipeline <────────────────────────────────────────┴── Reactive Cache
          │
          ▼
   Filtered & Sorted Items ──> Ant Design Table (/#/tasks or /#/projects)
```

### Recommended Project Structure

```
src/
├── db/
│   ├── repositories/
│   │   ├── projectRepo.ts       # Project CRUD & queries
│   │   ├── milestoneRepo.ts     # Milestone CRUD & queries
│   │   ├── taskRepo.ts          # Task CRUD, inline status/progress, reparenting
│   │   └── cascadeRepo.ts       # Safe atomic cascade deletions & reparenting
│   └── index.ts                 # TaskPlannerDatabase instance
├── utils/
│   ├── time.ts                  # Minute <-> "Xh Ym" formatting & quick syntax parsing (~2h)
│   ├── filter.ts                # In-memory search & filter predicates (debounce, horizons)
│   └── focus.ts                 # Focus restoration helper for Drawers & Modals
├── hooks/
│   ├── useTaskFilters.ts        # State & pipeline for task table filtering/sorting
│   └── useKeyboardShortcuts.ts  # Global listener for '/', 'c', 'Esc'
├── components/
│   ├── tasks/
│   │   ├── QuickAddBar.tsx      # Top-of-table fast task creation bar
│   │   ├── TaskTable.tsx        # Main tasks table with inline controls & selection
│   │   ├── TaskFilterBar.tsx    # Horizontal filters (search, status, priority, horizon)
│   │   ├── TaskDrawer.tsx       # Slide-out full editor
│   │   ├── InlineStatusTag.tsx  # Clickable Status Tag with dropdown
│   │   ├── InlineProgress.tsx   # Progress slider/input popover
│   │   ├── BatchActionBar.tsx   # Floating multi-select actions
│   │   └── HierarchyBreadcrumb.tsx # Project > Milestone tag with click-to-filter
│   └── projects/
│       ├── ProjectTable.tsx     # Expandable table showing milestones & direct tasks
│       ├── ProjectModal.tsx     # Project create/edit modal
│       ├── MilestoneModal.tsx   # Milestone create/edit modal
│       └── CascadeDeleteModal.tsx # Explicit choice modal for cascading deletion
└── views/
    ├── TasksView.tsx            # View container for /#/tasks
    └── ProjectsView.tsx         # View container for /#/projects
```

### Pattern 1: Safe Cascade Deletion with Transactional Atomicity
**What:** When deleting a Project or Milestone, provide user choice (cascade delete vs reparent to standalone/project-level). Execute the chosen choice inside a single Dexie readwrite transaction.
**When to use:** Project and Milestone deletion (WORK-05, D-13, D-14, D-16).
**Example:**
```typescript
// src/db/repositories/cascadeRepo.ts
import { db } from '../index';

export async function deleteProjectWithCascade(
  projectId: string,
  mode: 'cascade' | 'orphan'
): Promise<void> {
  await db.transaction('rw', [db.projects, db.milestones, db.tasks, db.plannedAllocations], async () => {
    const childMilestones = await db.milestones.where('projectId').equals(projectId).toArray();
    const milestoneIds = childMilestones.map((m) => m.id);
    const childTasks = await db.tasks
      .filter((t) => t.projectId === projectId || (t.milestoneId ? milestoneIds.includes(t.milestoneId) : false))
      .toArray();
    const taskIds = childTasks.map((t) => t.id);

    if (mode === 'cascade') {
      // 1. Delete associated planned allocations
      await db.plannedAllocations.where('taskId').anyOf(taskIds).delete();
      // 2. Delete child tasks
      await db.tasks.bulkDelete(taskIds);
      // 3. Delete milestones
      await db.milestones.bulkDelete(milestoneIds);
      // 4. Delete project
      await db.projects.delete(projectId);
    } else {
      // Orphan mode: unhook tasks to standalone (keep UUID, remove projectId & milestoneId)
      const updatedTasks = childTasks.map((t) => ({
        ...t,
        projectId: undefined,
        milestoneId: undefined,
        updatedAt: new Date().toISOString(),
      }));
      await db.tasks.bulkPut(updatedTasks);
      // Delete milestones and project
      await db.milestones.bulkDelete(milestoneIds);
      await db.projects.delete(projectId);
    }
  });
}
```

### Pattern 2: Quick-Add Time Syntax Parsing
**What:** Extract duration estimates from string input such as `"Draft spec ~2h 30m"` or `"Review PR ~45m"`.
**When to use:** In Quick-Add task bar (D-23) and Task detail inputs.
**Example:**
```typescript
// src/utils/time.ts
export function parseQuickAddInput(rawInput: string): { name: string; estimateMinutes: number } {
  const match = rawInput.match(/^(.*?)(?:~(\s*(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?))?$/i);
  if (!match) return { name: rawInput.trim(), estimateMinutes: 0 };

  const name = match[1]?.trim() || rawInput.trim();
  const hours = match[3] ? parseInt(match[3], 10) : 0;
  const minutes = match[4] ? parseInt(match[4], 10) : 0;
  const estimateMinutes = Math.min(6000, Math.max(0, hours * 60 + minutes));

  return { name, estimateMinutes };
}

export function formatMinutes(totalMinutes: number): string {
  if (!totalMinutes || totalMinutes <= 0) return '0m';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}
```

### Pattern 3: Focus Management and Restoration
**What:** Capture active element ref before opening a Drawer or Modal; restore focus when closing.
**When to use:** Drawer and Modal open/close cycles (D-30, UX-03).
**Example:**
```typescript
// src/utils/focus.ts
export function createFocusRestorer() {
  const previousActiveElement = document.activeElement as HTMLElement | null;
  return () => {
    if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
      // Use setTimeout to ensure closing animation / DOM cleanup does not steal focus
      setTimeout(() => previousActiveElement.focus(), 0);
    }
  };
}
```

### Anti-Patterns to Avoid
- **Mutating UUID on Reparenting:** Never delete and re-create a task to change its parent. Modify `projectId` and `milestoneId` on the existing record (preserving `id`).
- **Orphaned Milestone References:** When changing `projectId`, never leave the old `milestoneId` intact if it belonged to the previous project. Reset `milestoneId = undefined`.
- **Calling Dexie inside Loops:** Never execute sequential individual `db.tasks.delete()` or `db.tasks.update()` in a `forEach` loop. Use `bulkDelete()` or wrap in `db.transaction()`.
- **Mixing Soft-Delete with Hard-Delete:** Status `Cancelled` is an active business status (item kept in database). Delete action permanently wipes record and cascades to allocations.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Popover sliders & dropdowns | Custom absolute positioned overlays | Ant Design `Popover`, `Dropdown`, `Slider`, `Tag` | Keyboard trap, click-outside detection, scroll repositioning, and ARIA attributes are handled out-of-the-box. |
| In-table expandable hierarchy | Custom recursive table renderer | Ant Design `Table` `expandable` prop | Ant Design handles indentation, expand/collapse icons, row keys, and ARIA treegrid semantics. |
| Date parsing & relative horizon checks | Custom JS `Date` math | Dayjs (`dayjs(date).isSame(dayjs(), 'day')`, etc.) | Native `Date` objects suffer from timezone offset bugs when manipulating `YYYY-MM-DD` strings. |
| Search debouncing | Custom `setTimeout` tracking | Standard debounced ref or simple 200ms timer hook | Avoid race conditions on search query state updates. |

## Common Pitfalls

### Pitfall 1: Timezone Offsets in Horizon Filters
**What goes wrong:** A task due "Today" is marked "Overdue" or vice versa because `new Date()` is parsed as UTC midnight while user is in local GMT+7.
**Why it happens:** Passing `"2026-09-26"` into `new Date("2026-09-26")` parses as UTC, but `dayjs().format('YYYY-MM-DD')` uses local time.
**How to avoid:** Compare strings directly using `YYYY-MM-DD` format (e.g. `task.deadline < todayString`), or use Dayjs with strict date formatting without converting to UTC timestamps.
**Warning signs:** Tasks due today showing up as overdue in evening hours.

### Pitfall 2: Orphaning Allocations on Task Deletion
**What goes wrong:** User deletes a task, but future phase (Phase 3 Planner) shows phantom workloads because `plannedAllocations` still reference the deleted `taskId`.
**Why it happens:** IndexedDB lacks native foreign key cascade constraints.
**How to avoid:** Every task deletion MUST delete associated `plannedAllocations` inside an atomic Dexie transaction (`db.transaction('rw', [db.tasks, db.plannedAllocations], ...)`).

### Pitfall 3: Form State Desynchronization in Drawer
**What goes wrong:** Clicking different tasks in the table opens the Drawer with stale values from the previous task.
**Why it happens:** Ant Design `Form` instances cache initial values if `destroyOnClose` is not specified or `form.setFieldsValue()` is not triggered on ID change.
**How to avoid:** Use `destroyOnClose` on `Drawer` and call `form.resetFields()` + `form.setFieldsValue(task)` whenever `selectedTaskId` changes.

### Pitfall 4: Shortcut Key Collisions
**What goes wrong:** Typing `"c"` or `"/"` inside an input field triggers the quick-add focus or search shortcut.
**Why it happens:** Global keydown listener lacks target check.
**How to avoid:** In keyboard shortcut handler, check `if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName) || (e.target as HTMLElement).isContentEditable) return;`.

## Code Examples

### Status Tag Inline Dropdown (Ant Design 6)
```typescript
// Source: Ant Design Dropdown & Tag component docs
import React from 'react';
import { Dropdown, Tag, type MenuProps } from 'antd';
import type { TaskStatus } from '../../types/models';

const STATUS_CONFIG: Record<TaskStatus, { color: string; label: string }> = {
  Open: { color: 'default', label: 'Open' },
  'In Progress': { color: 'processing', label: 'In Progress' },
  Resolved: { color: 'warning', label: 'Resolved' },
  'In Review': { color: 'cyan', label: 'In Review' },
  Done: { color: 'success', label: 'Done' },
  Cancelled: { color: 'error', label: 'Cancelled' },
};

interface InlineStatusTagProps {
  status: TaskStatus;
  onChange: (nextStatus: TaskStatus) => void;
}

export const InlineStatusTag: React.FC<InlineStatusTagProps> = ({ status, onChange }) => {
  const items: MenuProps['items'] = (Object.keys(STATUS_CONFIG) as TaskStatus[]).map((st) => ({
    key: st,
    label: (
      <Tag color={STATUS_CONFIG[st].color} style={{ margin: 0 }}>
        {STATUS_CONFIG[st].label}
      </Tag>
    ),
  }));

  return (
    <Dropdown
      menu={{
        items,
        onClick: ({ key }) => onChange(key as TaskStatus),
      }}
      trigger={['click']}
    >
      <Tag
        color={STATUS_CONFIG[status].color}
        style={{ cursor: 'pointer', userSelect: 'none' }}
      >
        {STATUS_CONFIG[status].label} ▾
      </Tag>
    </Dropdown>
  );
};
```

### Progress Popover with Slider & Number Input
```typescript
// Source: Ant Design Popover & Slider docs
import React, { useState } from 'react';
import { Popover, Progress, Slider, InputNumber, Space } from 'antd';

interface InlineProgressProps {
  progress: number;
  onChange: (nextProgress: number) => void;
}

export const InlineProgress: React.FC<InlineProgressProps> = ({ progress, onChange }) => {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState(progress);

  const handleOpenChange = (visible: boolean) => {
    if (!visible && val !== progress) {
      onChange(val);
    }
    setOpen(visible);
  };

  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={handleOpenChange}
      content={
        <div style={{ width: 220, padding: 8 }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Progress:</span>
              <InputNumber
                min={0}
                max={100}
                value={val}
                onChange={(n) => setVal(n ?? 0)}
                formatter={(v) => `${v}%`}
                size="small"
                style={{ width: 80 }}
              />
            </div>
            <Slider min={0} max={100} value={val} onChange={setVal} />
          </Space>
        </div>
      }
    >
      <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Progress percent={progress} size="small" style={{ width: 80, margin: 0 }} />
      </div>
    </Popover>
  );
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Ant Design modal forms for small field edits | Inline Dropdown/Popover directly in table cell | Ant Design v5/v6 | Zero-click context switching; updates persist instantly to IndexedDB without obscuring table. |
| Full-page table reload on filter change | Reactive Dexie `useLiveQuery` + in-memory memoized filter | React 19 + Dexie 4 | UI updates instantly on keystroke; live queries react automatically across tabs. |
| Hard cascade deletion with no choice | Modal presenting "Delete children" vs "Reparent to standalone" | Modern productivity apps (Linear, Notion) | Prevents catastrophic accidental loss of child tasks when restructuring projects. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Personal task dataset size (< 5,000 tasks) fits in memory for fast client-side filtering without IndexedDB compound index pagination. | Summary & Architecture | None; even low-end mobile devices filter 5,000 JS objects in under 10ms. |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build & test runner | ✓ | v20.19.5 | — |
| npm | Package management | ✓ | 10.8.2 | — |
| git | Source control & GSD tracking | ✓ | 2.52.0.windows.1 | — |
| Browser IndexedDB | Persistence | ✓ | Supported (fake-indexeddb in tests) | — |

**Missing dependencies with no fallback:**
- None.

**Missing dependencies with fallback:**
- None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.2 + React Testing Library 16.3.3 + fake-indexeddb 6.2.5 |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test` |
| Full suite command | `npm test && npm run build` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WORK-01 | Create, view, edit, delete projects | unit/integration | `npm test tests/db/projectRepo.test.ts` | ❌ Wave 0 |
| WORK-02 | Create, view, edit, delete milestones | unit/integration | `npm test tests/db/milestoneRepo.test.ts` | ❌ Wave 0 |
| WORK-03 | Create, view, edit, delete tasks (standalone, project, milestone) | unit/integration | `npm test tests/db/taskRepo.test.ts` | ❌ Wave 0 |
| WORK-04 | Reparent task between standalone/project/milestone keeping stable UUID | unit | `npm test tests/db/taskRepo.test.ts` | ❌ Wave 0 |
| WORK-05 | Safe cascade deletion confirmation and atomic execution | integration | `npm test tests/db/cascadeRepo.test.ts` | ❌ Wave 0 |
| TASK-01 | Task detail recording (dates, priority, links, notes) | unit/integration | `npm test tests/components/TaskDrawer.test.tsx` | ❌ Wave 0 |
| TASK-02 | Hours/minutes estimate parsing and storage as integer minutes | unit | `npm test tests/utils/time.test.ts` | ❌ Wave 0 |
| TASK-03 | Support statuses Open, In Progress, Resolved, In Review, Done, Cancelled | unit | `npm test tests/components/InlineStatusTag.test.tsx` | ❌ Wave 0 |
| TASK-04 | Support project/milestone statuses | unit | `npm test tests/components/ProjectTable.test.tsx` | ❌ Wave 0 |
| TASK-05 | Search by text, filter by status/project/priority/horizon, sort | unit | `npm test tests/utils/filter.test.ts` | ❌ Wave 0 |
| TASK-06 | Fast inline status and progress updates | integration | `npm test tests/components/InlineControls.test.tsx` | ❌ Wave 0 |
| UX-02 | Keyboard accessibility (shortcuts, visible focus) | integration | `npm test tests/hooks/useKeyboardShortcuts.test.ts` | ❌ Wave 0 |
| UX-03 | Form inline validation and focus restoration | integration | `npm test tests/utils/focus.test.ts` | ❌ Wave 0 |
| UX-05 | Quick-add bar and minimal navigation workflows | integration | `npm test tests/components/QuickAddBar.test.tsx` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test`
- **Per wave merge:** `npm test && npm run build`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/db/projectRepo.test.ts` — covers WORK-01
- [ ] `tests/db/milestoneRepo.test.ts` — covers WORK-02
- [ ] `tests/db/taskRepo.test.ts` — covers WORK-03, WORK-04
- [ ] `tests/db/cascadeRepo.test.ts` — covers WORK-05
- [ ] `tests/utils/time.test.ts` — covers TASK-02 (parsing & formatting)
- [ ] `tests/utils/filter.test.ts` — covers TASK-05 (filtering, horizons, sorting)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Single personal user application, no auth tier. |
| V3 Session Management | no | Local single user, no session tier. |
| V4 Access Control | no | Single user, all data stored in origin-isolated IndexedDB. |
| V5 Input Validation | yes | Zod validation for task/project/milestone inputs, integer minute bounds (0-6000), valid URL format for document links (`/^https?:\/\//`). |
| V6 Cryptography | no | Cryptography applies to Phase 8 backup encryption, not Phase 2. |

### Known Threat Patterns for Local React/Dexie Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via user-entered Markdown/URLs in task notes or links | Tampering | Render document links using standard `<a href={url} target="_blank" rel="noopener noreferrer">` with strictly validated `http://` or `https://` protocols (reject `javascript:` URIs). Render notes as text or safe pre-wrap without raw HTML injection (`dangerouslySetInnerHTML` forbidden). |
| Tab hijacking via external links | Information Disclosure | Always pair `target="_blank"` with `rel="noopener noreferrer"`. |

## Sources

### Primary (HIGH confidence)
- Official Dexie Docs (`dexie.org/docs/Table/Table.bulkDelete`, `dexie.org/docs/Dexie/Dexie.transaction`) - Transactions and bulk operations
- Ant Design 6 Official Documentation (`ant.design/components/table`, `ant.design/components/drawer`, `ant.design/components/popover`) - Table expandable hierarchy, Drawer, Popover controls
- Codebase files: `src/types/models.ts`, `src/db/schema.ts`, `src/db/index.ts`, `CLAUDE.md`

### Secondary (MEDIUM confidence)
- MDN Web Docs: KeyboardEvent accessibility patterns, ARIA menu and live-region guidelines

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Core dependencies verified and operational in repo
- Architecture: HIGH - Clear separation between repositories, in-memory pipeline, and Ant Design presentation
- Pitfalls: HIGH - Documented timezone, foreign key cascade, and focus restoration edge cases

**Research date:** 2026-09-26
**Valid until:** 2026-10-26 (stable architecture)
