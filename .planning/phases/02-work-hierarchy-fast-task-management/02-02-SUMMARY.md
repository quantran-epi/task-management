---
phase: 02-work-hierarchy-fast-task-management
plan: 02
subsystem: ui-task-management
tags: [antd, filtering, debouncing, keyboard-shortcuts, focus-restoration, inline-controls, quick-add, drawer]
requires:
  - phase: 02-work-hierarchy-fast-task-management
    plan: 01
    provides: Domain repositories (taskRepo, projectRepo, milestoneRepo) and time parsing utilities
provides:
  - In-memory reactive task filter, horizon matcher, and priority/deadline sorting
  - WCAG 2.1 AA focus restoration helper (createFocusRestorer)
  - Global keyboard shortcuts ('/', 'c', 'Esc') with input guardrails
  - Inline table controls (InlineStatusTag, InlineProgress, HierarchyBreadcrumb)
  - Fast task capture bar with ~Xh Ym estimate parsing (QuickAddBar)
  - Full-fidelity slide-out editor with cascading reparenting and URL validation (TaskDrawer)
affects:
  - 02-03 (TasksView, ProjectsView, TaskTable, BatchActionBar integration)
  - 03 (daily capacity planning and workload ledger)
tech-stack:
  added: []
  patterns:
    - In-memory memoized filtering pipeline over live Dexie data
    - 200ms debounced search text input
    - Strict calendar date comparisons (YYYY-MM-DD) avoiding UTC midnight timezone drift
    - Cascading reparenting with automatic child milestone reset
    - Timeout-deferred document.activeElement focus restoration
key-files:
  created:
    - src/utils/filter.ts
    - src/utils/focus.ts
    - src/hooks/useTaskFilters.ts
    - src/hooks/useKeyboardShortcuts.ts
    - src/components/tasks/InlineStatusTag.tsx
    - src/components/tasks/InlineProgress.tsx
    - src/components/tasks/HierarchyBreadcrumb.tsx
    - src/components/tasks/QuickAddBar.tsx
    - src/components/tasks/TaskDrawer.tsx
    - tests/utils/filter.test.ts
    - tests/utils/focus.test.ts
    - tests/hooks/useKeyboardShortcuts.test.ts
    - tests/hooks/useTaskFilters.test.ts
    - tests/components/InlineControls.test.tsx
    - tests/components/QuickAddBar.test.tsx
    - tests/components/TaskDrawer.test.tsx
  modified:
    - vite.config.ts
    - tests/setup.ts
decisions:
  - "Configured JSDOM global.ResizeObserver mock in tests/setup.ts to support Ant Design 6 dropdown, popover, and select animations."
  - "Configured fileParallelism: false in vite.config.ts test runner to prevent Windows worker thread timeouts across concurrent test files."
  - "Used strict YYYY-MM-DD calendar string comparisons in matchesHorizon to eliminate timezone drift across UTC midnight (T-02-06)."
  - "Guarded global keyboard shortcuts ('/', 'c') by verifying target is neither an input, textarea, textbox role, nor contentEditable (T-02-04)."
  - "Validated document links with /^https?:\\/\\// regex and rendered anchors with target='_blank' rel='noopener noreferrer' to mitigate XSS (T-02-05)."
metrics:
  duration: 18m
  completed_date: "2026-09-26"
  tasks_completed: 3
  files_created: 16
---

# Phase 2 Plan 2: Task Filtering, Inline Controls & TaskDrawer Summary

In-memory filtering and sorting pipeline, global keyboard shortcuts, WCAG 2.1 AA focus restoration, fast inline table controls (status dropdown, progress popover), top-of-table QuickAddBar with duration syntax parsing, and full-fidelity TaskDrawer editor with cascading reparenting.

## What Was Built

1. **In-Memory Filtering, Sorting & Horizon Utilities (`src/utils/filter.ts`, `src/hooks/useTaskFilters.ts`)**
   - `filterTasks`: Case-insensitively searches `name`, `description`, and `notes` (D-18); filters by hierarchy scope (`all`, `projects`, `standalone`); filters by active statuses while excluding `Done` and `Cancelled` unless explicitly toggled (`includeClosed`) (D-20); filters by priority.
   - `matchesHorizon`: Categorizes tasks into `Overdue` (`deadline < today`), `Today` (`deadline === today`), and `This Week` (`deadline >= today && deadline <= endOfWeek`) using canonical `YYYY-MM-DD` strings without timezone drift (D-17, T-02-06).
   - `sortTasks`: Defaults to Deadline ascending (nulls last) followed by Priority descending (`Urgent` -> `High` -> `Medium` -> `Low`) per D-19.
   - `useTaskFilters`: Encapsulates filter state with a 200ms debounce timer on text search and exposes memoized filtered/sorted outputs.

2. **Keyboard Shortcuts & Focus Restoration (`src/hooks/useKeyboardShortcuts.ts`, `src/utils/focus.ts`)**
   - `useKeyboardShortcuts`: Listens globally for `/` (focus search), `c` (focus quick-add), and `Escape` (dismiss drawer/modal). Safely ignores keystrokes when typing inside `INPUT`, `TEXTAREA`, or `contentEditable` elements (D-29, T-02-04).
   - `createFocusRestorer`: Captures `document.activeElement` before drawer/modal opening and restores focus via deferred `setTimeout` upon dismissal to prevent focus trapping (D-30, T-02-07).

3. **Fast Inline Table Controls (`src/components/tasks/`)**
   - `InlineStatusTag.tsx`: Displays Ant Design Tag with arrow `▾` and dropdown menu across all 6 statuses; updates Dexie database immediately with toast notification (D-06, D-32); renders `Cancelled` with strikethrough styling (D-15); prompts reminder toast when switching 0-estimate tasks to `In Progress` (D-24).
   - `InlineProgress.tsx`: Displays compact 80px progress bar; clicking opens popover containing paired Slider and InputNumber (0-100%); persists to database on popover close or blur (D-07, TASK-06).
   - `HierarchyBreadcrumb.tsx`: Renders compact chip indicating `Standalone`, `ProjectName`, or `ProjectName > MilestoneName`; triggers click-to-filter callback (D-02).

4. **Fast Task Creation Bar (`src/components/tasks/QuickAddBar.tsx`)**
   - Single input field with placeholder `"Add a task (e.g. 'Review pull request ~1h 30m'). Press Enter to save..."` and `data-shortcut-id="quick-add-input"` for `c` hotkey targeting (D-05, D-29).
   - Extracts duration syntax (`~Xh Ym`) into integer minutes via `parseQuickAddInput`.
   - On Enter or click "Add Task", creates task in status `Open`, priority `Medium`, clears input, and fires success notification (UX-05).
   - Supports optional inline project selector.

5. **Full-Fidelity Task Drawer (`src/components/tasks/TaskDrawer.tsx`)**
   - 520px slide-out editing panel with `destroyOnClose: true` (D-08, TASK-01).
   - Form fields: Name, cascading Project -> Milestone Select (auto-clears milestone when project changes, preserving task UUID per D-10, WORK-04), Status, Priority.
   - Estimate controls: paired Hours (0-100) and Minutes (0-59) inputs plus quick preset buttons (`+30m`, `1h`, `2h`, `4h`, `8h`), persisting strictly as non-negative integer minutes (D-21, TASK-02).
   - Calendar DatePickers for Deadline, Actual Start Date, Actual End Date (`YYYY-MM-DD`).
   - Dynamic document links form list validating `http/https` protocols and rendering `target="_blank" rel="noopener noreferrer"` (D-25, T-02-05).
   - Pre-wrap formatted Notes text area (D-27).
   - Focus restoration integrated into drawer close lifecycle (D-30, UX-03).

## Test Coverage

- `tests/utils/filter.test.ts`: 7 tests covering case-insensitive text search, hierarchy scoping, active/closed status filtering, date horizon calculations, and deadline/priority sorting.
- `tests/utils/focus.test.ts`: 2 tests verifying element focus capture, deferred restoration, and graceful handling of disconnected elements.
- `tests/hooks/useKeyboardShortcuts.test.ts`: 2 tests verifying shortcut dispatching and input/contentEditable guardrails.
- `tests/hooks/useTaskFilters.test.ts`: 2 tests verifying filter state updates and 200ms search debouncing.
- `tests/components/InlineControls.test.tsx`: 7 tests verifying InlineStatusTag dropdown updates, reminder toasts, strikethrough styling, InlineProgress slider/input persistence, and HierarchyBreadcrumb rendering.
- `tests/components/QuickAddBar.test.tsx`: 4 tests verifying duration parsing, project assignment, Enter submission, and empty submission rejection.
- `tests/components/TaskDrawer.test.tsx`: 6 tests verifying detail editing, cascading reparenting with milestone reset, Standalone selection, preset duration buttons, URL validation, and trigger focus restoration.
- All 16 test files (103 tests) passing; `npx tsc --noEmit` and production build clean.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] exactOptionalPropertyTypes in useTaskFilters return type**
- **Found during:** Task 1 implementation
- **Issue:** `sortField?: string` and `sortOrder?: 'ascend' | 'descend'` required explicit `| undefined` union under `exactOptionalPropertyTypes: true`.
- **Fix:** Updated `UseTaskFiltersReturn` interface to declare `string | undefined` and `'ascend' | 'descend' | undefined`.
- **Files modified:** `src/hooks/useTaskFilters.ts`
- **Commit:** 3048143

**2. [Rule 3 - Blocking Issue] JSDOM ResizeObserver missing for Ant Design components**
- **Found during:** Task 2 component tests
- **Issue:** Ant Design Dropdown, Popover, and Select throw `ResizeObserver is not defined` in JSDOM.
- **Fix:** Added `global.ResizeObserver` mock class to `tests/setup.ts`.
- **Files modified:** `tests/setup.ts`
- **Commit:** 0ca615a

**3. [Rule 3 - Blocking Issue] Windows Vitest worker pool timeouts**
- **Found during:** Task 3 full test suite run
- **Issue:** Spawning 14+ concurrent JSDOM workers on Windows caused Vitest worker pool response timeouts.
- **Fix:** Added `fileParallelism: false` to test config in `vite.config.ts`.
- **Files modified:** `vite.config.ts`
- **Commit:** 7b07b3e

## TDD Gate Compliance

- Task 1 RED: Commit `c206566` -> Task 1 GREEN: Commit `3048143`
- Task 2 RED: Commit `68f4525` -> Task 2 GREEN: Commit `0ca615a`
- Task 3 RED: Commit `45df666` -> Task 3 GREEN: Commit `7b07b3e`

## Self-Check: PASSED
