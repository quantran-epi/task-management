---
phase: 10-date-range-search-multi-criteria-filtering-standup-export
reviewed: 2026-09-28T17:55:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - src/utils/standup.ts
  - tests/utils/standup.test.ts
  - src/db/repositories/allocationRepo.ts
  - src/utils/filter.ts
  - tests/db/allocationRepo.test.ts
  - tests/utils/filter.test.ts
  - src/hooks/useTaskFilters.ts
  - src/components/tasks/TaskFilterBar.tsx
  - src/components/tasks/TaskTable.tsx
  - src/views/TasksView.tsx
  - tests/components/TaskTable.test.tsx
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
status: issues_found
---

# Phase 10: Code Review Report

**Reviewed:** 2026-09-28T17:55:00Z  
**Depth:** standard  
**Files Reviewed:** 11  
**Status:** issues_found  

## Summary

Phase 10 implements date-range search, multi-criteria filtering with tag inheritance, reactive IndexedDB execution range queries, and Vietnamese Markdown standup report export.

The core data structures, Dexie queries, and formatters are generally well-constructed, but adversarial code review uncovered:
1. One critical bug where clipboard fallback textarea auto-selection silently fails due to unsafe `any` ref casting on Ant Design `Input.TextArea`.
2. Several warning-level logic errors: status filtering logic leaking cancelled tasks when `includeClosed: true`, conflicting column filter on `TaskTable` causing `handleCopyStandup` to desynchronize, missing ancestor project resolution from `milestoneId` during tag inheritance, and hardcoded `length !== 4` status heuristics.
3. Code quality improvements in debounce reset and work type fallback.

## Narrative Findings (AI reviewer)

### Critical Issues

### CR-01: Silent Failure of Textarea Selection in Standup Fallback Modal via Unsafe Ref Casting

**File:** `src/components/tasks/TaskTable.tsx:84, 112, 502`  
**Issue:** `TaskTable` declares `const fallbackTextareaRef = useRef<HTMLTextAreaElement>(null)` and passes it to `<Input.TextArea ref={fallbackTextareaRef as unknown as React.Ref<any>} ... />`. In Ant Design 6, `Input.TextArea` forwards a ref of type `TextAreaRef` (`{ resizableTextArea, focus, blur, nativeElement }`), which does NOT possess a `.select()` method. When the Clipboard API fails (e.g. non-secure HTTP contexts, permissions denied, or browser restrictions), the modal opens and executes `fallbackTextareaRef.current?.select()`. Because `.select` is undefined on `TextAreaRef`, the call fails silently. The user is prompted to press Ctrl+C, but the text is never selected as intended.  
**Fix:**
Import `type { TextAreaRef } from 'antd'` and use `resizableTextArea.textArea.select()`:

```tsx
import type { TextAreaRef } from 'antd';

// in component:
const fallbackTextareaRef = useRef<TextAreaRef>(null);

// in handleCopyStandup catch block:
setTimeout(() => {
  fallbackTextareaRef.current?.resizableTextArea?.textArea?.select();
}, 100);

// in JSX:
<Input.TextArea
  ref={fallbackTextareaRef}
  value={standupFallbackText}
  readOnly
  rows={10}
  style={{ fontFamily: 'monospace', fontSize: 12 }}
  onFocus={(e) => e.target.select()}
/>
```

---

### Warnings

### WR-01: Status Filter Bypasses Exclusion of Cancelled Tasks When `includeClosed` is True

**File:** `src/utils/filter.ts:149-163`  
**Issue:** When `task.status === 'Cancelled'` or `'Done'`, `isClosed` is `true`. If `filterState.includeClosed` is `true`, the `if (!filterState.includeClosed)` block is bypassed entirely, and execution exits without evaluating the `else` status block. Consequently, if a user filters for only `statuses: ['Done']` with `includeClosed: true`, `Cancelled` tasks are incorrectly included in the results. Similarly, if `statuses: ['In Progress']` and `includeClosed: true`, both `Done` and `Cancelled` tasks pass through regardless of the `statuses` selection.  
**Fix:**
Ensure explicit `statuses` constraints are respected even when `includeClosed` is enabled:

```ts
    // 3. Status filter and closed exclusion (D-20)
    const isClosed = task.status === 'Done' || task.status === 'Cancelled';
    if (isClosed && !filterState.includeClosed) {
      if (!filterState.statuses || !filterState.statuses.includes(task.status)) {
        return false;
      }
    } else if (filterState.statuses && filterState.statuses.length > 0) {
      if (!filterState.statuses.includes(task.status)) {
        return false;
      }
    }
```

### WR-02: Detached Table Column Filter on `workType` Causes Standup Export Desynchronization

**File:** `src/components/tasks/TaskTable.tsx:200-205`  
**Issue:** `TaskTable` defines `filters` and `onFilter` on the `workType` table column. Filtering via the column header modifies Ant Design's local table display, but does NOT update `TaskFilterState.workTypes`. This creates three critical desynchronizations:
1. `handleCopyStandup` consumes `tasks` (prop passed from view), completely ignoring the column filter and copying tasks the user intentionally hid.
2. The toolbar text ("Hiển thị X tác vụ") shows `tasks.length` rather than the column-filtered count.
3. The filter is not tracked in `activeAdvancedCount` and is not cleared by "Xóa bộ lọc".
**Fix:**
Remove the redundant column-level `filters` and `onFilter` from `TaskTable.tsx` so work type filtering remains centralized in `TaskFilterBar`:

```tsx
    {
      title: 'Loại việc',
      dataIndex: 'workType',
      key: 'workType',
      width: 140,
      render: (workType?: WorkType) => <WorkTypeBadge workType={workType || 'code'} />,
    },
```

### WR-03: Missing Project Lookup from Milestone ID Breaks Tag Inheritance and Project Names

**File:** `src/utils/standup.ts:51, 54-60`, `src/utils/filter.ts:218-224`, `src/components/tasks/TaskTable.tsx:297-300`  
**Issue:** In `standup.ts`, `filter.ts`, and `TaskTable.tsx`, `ancestors.project` and `projectName` are resolved strictly via `task.projectId ? projectMap?.get(task.projectId) : undefined`. Tasks can have `milestoneId` without `task.projectId` populated directly. In such cases, the milestone belongs to a project (`milestone.projectId`), but because `task.projectId` is undefined, `ancestors.project` evaluates to `undefined`. This causes:
1. `formatStandupSummary` to report `Dự án: Cá nhân` for milestone tasks without direct `projectId`.
2. Tag inheritance in `filterTasks` and `TaskTable` to fail falling back to project-level Ops/BA tags.  
**Fix:**
Resolve effective project ID using `task.projectId ?? (task.milestoneId ? milestoneMap?.get(task.milestoneId)?.projectId : undefined)`:

```ts
const milestone = task.milestoneId ? milestoneMap?.get(task.milestoneId) : undefined;
const effectiveProjectId = task.projectId ?? milestone?.projectId;
const project = effectiveProjectId ? projectMap?.get(effectiveProjectId) : undefined;

const ancestors = {
  project: project ? { name: project.name, opsOwners: project.opsOwners, businessAnalysts: project.businessAnalysts } : undefined,
  milestone: milestone ? { name: milestone.name, opsOwners: milestone.opsOwners, businessAnalysts: milestone.businessAnalysts } : undefined,
};
```

### WR-04: Fragile Hardcoded Status Count (`length !== 4`) Misidentifies Active Filters

**File:** `src/components/tasks/TaskFilterBar.tsx:69`, `src/views/TasksView.tsx:133`  
**Issue:** `hasActiveFilters` and `isFiltered` check `filters.statuses.length !== 4`. If a user selects 4 statuses that differ from the default set (e.g. `['Open', 'In Progress', 'Done', 'Cancelled']`), `filters.statuses.length !== 4` is `false`. When no other filter is active, the UI treats the filters as default: "Xóa bộ lọc" button is hidden, and empty table results show "Chưa có tác vụ nào" (No tasks exist) instead of "Không có tác vụ phù hợp" (No matching tasks).  
**Fix:**
Compare elements against `DEFAULT_TASK_FILTER_STATE.statuses`:

```ts
const isStatusFiltered =
  filters.statuses.length !== DEFAULT_TASK_FILTER_STATE.statuses.length ||
  !filters.statuses.every((s) => DEFAULT_TASK_FILTER_STATE.statuses.includes(s));
```

---

### Info

### IN-01: Standup Markdown Format Yields `[undefined]` on Unrecognized WorkType

**File:** `src/utils/standup.ts:50`  
**Issue:** `const workTypeLabel = task.workType ? VIETNAMESE_WORK_TYPE_LABELS[task.workType] : 'Khác'` will return `undefined` if `task.workType` contains an invalid or unmapped value.  
**Fix:**
```ts
const workTypeLabel =
  (task.workType && VIETNAMESE_WORK_TYPE_LABELS[task.workType]) || 'Khác';
```

### IN-02: `resetFilters()` Debounce Lag Causes 200ms Delay in Clearing Search

**File:** `src/hooks/useTaskFilters.ts:63-67`  
**Issue:** In `useTaskFilters.ts`, `resetFilters` resets `filters.search` to `''`, but does not reset `debouncedSearch`. `debouncedSearch` waits 200ms for the debounce `setTimeout` before updating, causing a perceptible delay in refreshing the table upon clicking "Xóa bộ lọc".  
**Fix:**
```ts
  const resetFilters = () => {
    setFiltersState(DEFAULT_TASK_FILTER_STATE);
    setDebouncedSearch('');
    setSortField(undefined);
    setSortOrder(undefined);
  };
```

### IN-03: Project Filter Does Not Switch Hierarchy Scope from Standalone

**File:** `src/components/tasks/TaskFilterBar.tsx:131-143`  
**Issue:** If `filters.hierarchyScope` is `'standalone'`, selecting a project from the "Lọc theo Dự án" dropdown retains `'standalone'`, resulting in 0 matching tasks.  
**Fix:**
In `onChange` of project Select, if `val` is non-empty and `filters.hierarchyScope === 'standalone'`, set `hierarchyScope: 'projects'`.

---

_Reviewed: 2026-09-28T17:55:00Z_  
_Reviewer: Claude (gsd-code-reviewer)_  
_Depth: standard_
