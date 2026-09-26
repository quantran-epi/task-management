---
phase: 02-work-hierarchy-fast-task-management
reviewed: 2026-09-26T19:30:00Z
depth: standard
files_reviewed: 24
files_reviewed_list:
  - src/App.tsx
  - src/components/projects/CascadeDeleteModal.tsx
  - src/components/projects/MilestoneModal.tsx
  - src/components/projects/ProjectModal.tsx
  - src/components/projects/ProjectTable.tsx
  - src/components/tasks/BatchActionBar.tsx
  - src/components/tasks/HierarchyBreadcrumb.tsx
  - src/components/tasks/InlineProgress.tsx
  - src/components/tasks/InlineStatusTag.tsx
  - src/components/tasks/QuickAddBar.tsx
  - src/components/tasks/TaskDrawer.tsx
  - src/components/tasks/TaskFilterBar.tsx
  - src/components/tasks/TaskTable.tsx
  - src/db/repositories/cascadeRepo.ts
  - src/db/repositories/milestoneRepo.ts
  - src/db/repositories/projectRepo.ts
  - src/db/repositories/taskRepo.ts
  - src/hooks/useKeyboardShortcuts.ts
  - src/hooks/useTaskFilters.ts
  - src/utils/filter.ts
  - src/utils/focus.ts
  - src/utils/time.ts
  - src/validation/schemas.ts
  - src/views/ProjectsView.tsx
  - src/views/TasksView.tsx
findings:
  critical: 3
  warning: 6
  info: 1
  total: 10
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-09-26T19:30:00Z
**Depth:** standard
**Files Reviewed:** 24
**Status:** issues_found

## Summary

Code review completed across 24 source files covering work hierarchy management (Projects and Milestones), cascade deletion strategies, fast inline task operations, filter/horizon pipelines, and modal/drawer editors.

While core data integrity and atomic IndexedDB operations in `cascadeRepo` are solid, three critical blockers were discovered:
1. Optional fields (`deadline`, `notes`, `description`, `actualStartDate`, `actualEndDate`, `documentLinks`) cannot be cleared or removed in `updateTask`, `updateProject`, or `updateMilestone` due to schema restrictions and `!== undefined` guards.
2. Global keyboard shortcut listener hijacks native clipboard copying (`Ctrl+C` / `Cmd+C`), blocking users from copying text anywhere on the page outside editable inputs.
3. Unscoped keyboard event bubbling on `TaskTable` causes dual-activation bugs when interacting with inline controls (e.g. Enter opens both the progress popover and the task drawer; arrow keys inside numeric inputs shift table row focus).

Additionally, 6 warnings and 1 info item were identified across form error handling, batch action selection cleanup, filter semantics, and table sorting.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Optional Fields Cannot Be Cleared in `updateTask`, `updateProject`, and `updateMilestone`

**File:** `src/db/repositories/taskRepo.ts:58-73`
**File:** `src/db/repositories/projectRepo.ts:50-56`
**File:** `src/db/repositories/milestoneRepo.ts:52-57`
**File:** `src/validation/schemas.ts:68-74, 85-91, 109-123`
**Issue:** Optional fields (`deadline`, `notes`, `description`, `actualStartDate`, `actualEndDate`, `documentLinks`) can never be cleared or removed once set.
In `updateTask`, property assignments are guarded by `if (validated.field !== undefined) updated.field = validated.field`. When a user deletes a deadline or clears notes in `TaskDrawer`, `ProjectModal`, or `MilestoneModal`, the form sends `undefined`. The update repository ignores `undefined`, preserving the existing values from `...existing`.
Furthermore, `TaskUpdateSchema`, `ProjectUpdateSchema`, and `MilestoneUpdateSchema` define these fields as `.optional()` instead of `.nullable().optional()`. Passing `null` causes Zod schema validation to throw an error. There is no code path that allows a user to delete or clear an existing deadline, note, or description.
**Fix:**
Allow `null` in update schemas and explicitly delete/clear properties when `null` or empty values are supplied:
```typescript
// In src/validation/schemas.ts:
export const TaskUpdateSchema = z.object({
  projectId: uuidSchema.nullable().optional(),
  milestoneId: uuidSchema.nullable().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().nullable().optional(),
  deadline: calendarDateSchema.nullable().optional(),
  notes: z.string().nullable().optional(),
  actualStartDate: calendarDateSchema.nullable().optional(),
  actualEndDate: calendarDateSchema.nullable().optional(),
  status: z.enum(TASK_STATUSES).optional(),
  progress: z.number().int().min(0).max(100).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  estimateMinutes: z.number().int().min(0).max(6000).optional(),
  documentLinks: z.array(httpUrlSchema).nullable().optional(),
});

// In src/db/repositories/taskRepo.ts:
if ('deadline' in validated) {
  if (validated.deadline) updated.deadline = validated.deadline;
  else delete updated.deadline;
}
if ('notes' in validated) {
  if (validated.notes) updated.notes = validated.notes;
  else delete updated.notes;
}
if ('description' in validated) {
  if (validated.description) updated.description = validated.description;
  else delete updated.description;
}
if ('actualStartDate' in validated) {
  if (validated.actualStartDate) updated.actualStartDate = validated.actualStartDate;
  else delete updated.actualStartDate;
}
if ('actualEndDate' in validated) {
  if (validated.actualEndDate) updated.actualEndDate = validated.actualEndDate;
  else delete updated.actualEndDate;
}
if ('documentLinks' in validated) {
  if (validated.documentLinks && validated.documentLinks.length > 0) updated.documentLinks = validated.documentLinks;
  else delete updated.documentLinks;
}
```

### CR-02: Keyboard Shortcuts Hijack Native Browser Clipboard Copy (`Ctrl+C` / `Cmd+C`)

**File:** `src/hooks/useKeyboardShortcuts.ts:42-49`
**Issue:** `useKeyboardShortcuts` checks `else if (e.key === 'c' || e.key === 'C')` without checking whether modifier keys (`ctrlKey`, `metaKey`, `altKey`) are active. When a user selects text on the page outside an editable field (such as a task title, description, or project name) and presses `Ctrl+C` (Windows/Linux) or `Cmd+C` (macOS) to copy, `e.key` is `'c'`, so `e.preventDefault()` executes, cancelling the native copy command and shifting focus to the QuickAdd input. Similarly, `Ctrl+/` or `Cmd+/` triggers the search handler.
**Fix:**
Bypass shortcut handling if any modifier key (`ctrlKey`, `metaKey`, `altKey`) is pressed:
```typescript
// In src/hooks/useKeyboardShortcuts.ts:
if (isInput || e.ctrlKey || e.metaKey || e.altKey) {
  return;
}

if (e.key === '/') {
  e.preventDefault();
  handlersRef.current.onSearch?.();
} else if (e.key === 'c' || e.key === 'C') {
  e.preventDefault();
  handlersRef.current.onQuickAdd?.();
}
```

### CR-03: Table Keyboard Navigation Bubbling Breaks Child Controls and Causes Dual-Open Bug

**File:** `src/components/tasks/TaskTable.tsx:87-117`
**File:** `src/components/tasks/InlineProgress.tsx:105-110`
**Issue:** `TaskTable` attaches `handleKeyDown` to `<div data-testid="task-table-container">` without checking whether `e.target === e.currentTarget` or whether the event originated from an interactive child element.
1. When a user navigates to the progress bar in `InlineProgress` and presses `Enter` to open the progress popover, `InlineProgress` calls `e.preventDefault()` but not `e.stopPropagation()`. The `Enter` key bubbles up to `TaskTable.handleKeyDown`, which invokes `onOpenDrawer(activeTask.id)`, causing both the popover and the full task drawer to open simultaneously.
2. When the user interacts with the `InputNumber` or `Slider` inside `InlineProgress`, pressing `ArrowUp` or `ArrowDown` bubbles up to `TaskTable`, which prevents default and shifts the highlighted table row instead of changing the progress number.
3. Pressing `Space` inside child buttons or inputs toggles table row selection.
**Fix:**
Stop propagation in `InlineProgress` and ignore non-container keydown events in `TaskTable`:
```typescript
// In src/components/tasks/InlineProgress.tsx:
onKeyDown={(e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    e.stopPropagation();
    setOpen((prev) => !prev);
  }
}}

// In src/components/tasks/TaskTable.tsx:
const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
  // Only handle container-level keyboard navigation
  if (e.target !== e.currentTarget) return;
  if (tasks.length === 0) return;
  // ... rest of navigation logic
};
```

## Warnings

### WR-01: `TaskDrawer` Silently Swallows Save Errors

**File:** `src/components/tasks/TaskDrawer.tsx:242-246`
**Issue:** `handleSave` catches all errors with an empty catch block: `catch { // Form validation error caught by Ant Design Form }`. If `updateTask` or `reparentTask` throws (e.g. database error, Dexie transaction failure, or Zod schema validation error on malformed URLs), no notification or feedback is shown to the user. The save button stops loading and the drawer stays open without explanation.
**Fix:**
Differentiate between Ant Design form validation errors and execution errors, displaying `message.error`:
```typescript
} catch (err: unknown) {
  if (err && typeof err === 'object' && 'errorFields' in err) {
    // Ant Design form validation error; fields display inline messages
    return;
  }
  message.error({
    content: err instanceof Error ? err.message : 'Failed to save task',
    duration: 2.5,
  });
} finally {
  setSaving(false);
}
```

### WR-02: `BatchActionBar` Fails to Clear Selection on Status Update

**File:** `src/components/tasks/BatchActionBar.tsx:64-83`
**Issue:** Unlike `handleDelete` (line 103) and `handleReparentSubmit` (line 125), `handleStatusMenuClick` does not call `onClearSelection()`. If selected tasks are changed to `Done` while `includeClosed: false`, the tasks disappear from view but remain selected in the batch action bar. Subsequent batch operations (such as batch delete) will inadvertently apply to off-screen tasks.
**Fix:**
Call `onClearSelection()` upon successful status update in `handleStatusMenuClick`:
```typescript
message.success({ content: `Updated ${selectedCount} tasks to ${nextStatus}`, duration: 2 });
onClearSelection();
```

### WR-03: `filterTasks` Bypasses Status Filter for Closed Tasks When `includeClosed` Is True

**File:** `src/utils/filter.ts:108-123`
**Issue:** When `filterState.includeClosed === true`, the condition `if (!filterState.includeClosed)` is skipped for closed tasks (`Done`, `Cancelled`). The code does not check if `task.status` is in `filterState.statuses`. If a user filters by `statuses: ['Done']` or `statuses: ['Open']` with `includeClosed: true`, all `Cancelled` tasks pass through unconstrained.
**Fix:**
Apply status filtering consistently when a specific status list is provided:
```typescript
const isClosed = task.status === 'Done' || task.status === 'Cancelled';
if (isClosed && !filterState.includeClosed && (!filterState.statuses || !filterState.statuses.includes(task.status))) {
  return false;
}
if (filterState.statuses && filterState.statuses.length > 0) {
  if (!filterState.statuses.includes(task.status)) {
    return false;
  }
}
```

### WR-04: `ProjectModal` and `MilestoneModal` Close on Save Failure

**File:** `src/components/projects/ProjectModal.tsx:75-77`
**File:** `src/components/projects/MilestoneModal.tsx:75-77`
**File:** `src/views/ProjectsView.tsx:64-77, 112-125`
**Issue:** In `ProjectsView.tsx`, `handleSaveProject` and `handleSaveMilestone` catch errors from repository calls, show `message.error`, but do not rethrow. Because `onSave` resolves, `handleOk` in `ProjectModal` and `MilestoneModal` executes `handleClose()`, closing the modal and discarding user edits despite the operation failing.
**Fix:**
Rethrow errors in `handleSaveProject` / `handleSaveMilestone` so the modal's `handleOk` catch block prevents `handleClose()`:
```typescript
// In src/views/ProjectsView.tsx:
} catch (err) {
  message.error({ content: 'Failed to save project', duration: 2 });
  throw err;
}
```

### WR-05: `Popconfirm` Inside `Dropdown` Menu Item in `TaskTable` Unmounts on Click

**File:** `src/components/tasks/TaskTable.tsx:297-308`
**Issue:** In `TaskTable.tsx`, line 297 nests `<Popconfirm>` inside an Ant Design `Dropdown` menu item label. Clicking a dropdown menu item triggers menu dismissal by default, which unmounts the menu item and its embedded Popconfirm popover. Furthermore, `onConfirm={() => db && deleteTaskWithAllocations(record.id, db)}` does not await completion, has no error handling or success toast, and silently does nothing if `db` is undefined.
**Fix:**
Trigger `Modal.confirm` from the menu item's `onClick` handler instead of embedding `Popconfirm` inside `label`:
```typescript
{
  key: 'delete',
  icon: <DeleteOutlined style={{ color: token.colorError }} />,
  danger: true,
  label: 'Delete Task',
  onClick: () => {
    Modal.confirm({
      title: 'Delete Task',
      content: `Are you sure you want to delete "${record.name}"?`,
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await deleteTaskWithAllocations(record.id, db);
          message.success({ content: 'Task deleted', duration: 1.5 });
        } catch {
          message.error({ content: 'Failed to delete task', duration: 2 });
        }
      },
    });
  },
}
```

### WR-06: Missing Sortable Column Headers in `TaskTable`

**File:** `src/components/tasks/TaskTable.tsx:119-334`
**File:** `src/views/TasksView.tsx:96-106`
**Issue:** `02-UI-SPEC.md` requires "Sort controls: Default sorted by `Deadline asc, Priority desc`. Sortable table headers." `useTaskFilters` implements `sortField`, `sortOrder`, and `setSort`, but `TaskTable.tsx` does not define `sorter: true` on any column, and `TasksView.tsx` does not wire sorting handlers to the table. Users cannot click headers to sort tasks.
**Fix:**
Add `sorter: true` and `sortOrder` to columns in `TaskTable.tsx`, wire `onChange` in `Table`, and pass `setSort` from `TasksView.tsx`.

## Info

### IN-01: Stale `todayStr` Memoization in `useTaskFilters`

**File:** `src/hooks/useTaskFilters.ts:57`
**Issue:** `const todayStr = useMemo(() => getTodayDateString(), []);` memoizes the date string once on mount with an empty dependency array. If the application runs past midnight without a page reload, date horizon filtering (overdue, today, this_week) evaluates against the stale date.
**Fix:** Compute `todayStr` dynamically inside the filtering memo:
```typescript
const filteredTasks = useMemo(() => {
  const effectiveFilterState: TaskFilterState = {
    ...filters,
    search: debouncedSearch,
  };
  const todayStr = getTodayDateString();
  const matched = filterTasks(tasks, effectiveFilterState, todayStr);
  return sortTasks(matched, sortField, sortOrder);
}, [tasks, filters, debouncedSearch, sortField, sortOrder]);
```

---

_Reviewed: 2026-09-26T19:30:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
