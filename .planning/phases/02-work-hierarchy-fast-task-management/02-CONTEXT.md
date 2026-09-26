# Phase 2: Work Hierarchy & Fast Task Management - Context

**Gathered:** 2026-09-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 2 delivers CRUD, hierarchy navigation, and parent-child management for projects, milestones, and tasks (standalone, project-level, milestone-level). It implements reparenting without ID mutation, safe cascade deletion modals, rich task details (estimates in hours/minutes stored as integer minutes, actual start/end dates, priorities, status, document links, notes), comprehensive search/filtering/sorting, fast inline table controls for status and progress, and keyboard accessibility.

Requirements covered: WORK-01, WORK-02, WORK-03, WORK-04, WORK-05, TASK-01, TASK-02, TASK-03, TASK-04, TASK-05, TASK-06, UX-02, UX-03, UX-05.

</domain>

<decisions>
## Implementation Decisions

### Hierarchy Layout & Navigation
- **D-01:** Separate views for Tasks and Projects: use `/#/tasks` for the unified task management table, and `/#/projects` for managing projects and milestones.
- **D-02:** Display hierarchy context on task rows in `/#/tasks` using a compact Breadcrumb Tag (`Project > Milestone`, `Project`, or `Standalone`) with click-to-filter capability.
- **D-03:** In `/#/projects`, display projects in an expandable Ant Design Table where expanding a project reveals its nested milestones and direct tasks.
- **D-04:** Provide quick filtering for standalone tasks via an Ant Design Segmented control on top of the task list (`All` | `Projects` | `Standalone`) plus a project filter dropdown.

### Inline Controls & Quick Capture
- **D-05:** Fast task creation via a top-of-table Input Bar on `/#/tasks` (type name, optional inline project picker, press Enter to create with default status Open).
- **D-06:** Clickable Status Tag in task rows: clicking the status badge opens a dropdown menu to change status immediately with instant IndexedDB persistence.
- **D-07:** Popover Slider & Input for Progress: clicking the progress indicator opens a compact popover with a slider (0-100%) and numeric input; saving on blur/close.
- **D-08:** Comprehensive task editing via a right slide-out Drawer (`Drawer` component) when clicking task title or edit button, preserving table context and supporting `Esc` to close.

### Task Reparenting & Batch Operations
- **D-09:** Reparenting tasks (Standalone <-> Project <-> Milestone) handled via cascading Select inputs in the task Drawer form and row action menu, keeping original stable UUID unchanged.
- **D-10:** Automatically reset `milestoneId` to undefined when changing a task's `projectId`, allowing user to select a new milestone belonging to the destination project.
- **D-11:** Batch Selection Bar on `/#/tasks`: multi-select checkboxes reveal a floating action bar to batch-change status, batch-move project/milestone, or batch-delete.
- **D-12:** Contextual creation: on `/#/projects`, each milestone and project row provides a `+ Add Task` button pre-filling the parent project and milestone.

### Deletion Cascade Safety & Data Integrity
- **D-13:** When deleting a Project with children, modal requires explicit choice: "Delete All (Project + Milestones + Child Tasks)" OR "Delete Project Only (Keep Tasks as Standalone)".
- **D-14:** When deleting a Milestone with child tasks, modal requires explicit choice: "Delete All Child Tasks" OR "Keep Tasks (Move to Project Level)".
- **D-15:** Strict separation between status `Cancelled` (soft state; item remains in DB, styled muted/strikethrough) and `Delete` action (permanent destruction in IndexedDB).
- **D-16:** Atomic deletion cascade: deleting a task permanently removes all corresponding `plannedAllocations` within the same Dexie transaction to prevent orphaned workload records.

### Search, Filters & Sorting
- **D-17:** Comprehensive horizontal filter bar above `/#/tasks`: text search, status multiselect, priority filter, project filter, and date horizon quick-filter tags (`All`, `Overdue`, `Today`, `This Week`).
- **D-18:** Text search applies 200ms debounce, case-insensitive, matching across `name`, `description`, and `notes`.
- **D-19:** Default sorting: Deadline ascending (nearest first, nulls last) followed by Priority descending (`Urgent` -> `High` -> `Medium` -> `Low`). Column headers remain sortable.
- **D-20:** Default status filter: display only active tasks (`Open`, `In Progress`, `Resolved`, `In Review`). `Done` and `Cancelled` tasks hidden by default with a quick toggle to show closed tasks.

### Estimate Input & Duration Display
- **D-21:** Estimate input in Drawer: paired `InputNumber` fields for Hours and Minutes with quick preset buttons (`+30m`, `1h`, `2h`, `4h`, `8h`). Persists strictly as integer minutes.
- **D-22:** Time display format across tables and views: human-readable `Xh Ym` (e.g. `2h 30m`, `45m`, `4h`).
- **D-23:** Quick-add syntax support: typing optional `~2h` or `~30m` in the Quick-Add input bar parses estimate automatically (defaults to 0 minutes if omitted).
- **D-24:** Estimate validation: non-negative integer between 0 and 6000 minutes (100 hours); gentle reminder prompt if estimate is 0 when switching status to `In Progress`.

### Document Links & Notes
- **D-25:** Document links managed as dynamic URL list in Drawer (add/remove row with URL validation); rendered with `target="_blank" rel="noopener noreferrer"`.
- **D-26:** Document links indicator on task table row: compact link icon with count badge (`[🔗 N]`), hover opens Popover with direct clickable links.
- **D-27:** Notes field: multi-line TextArea with `white-space: pre-wrap` and automatic URL detection (linkify).
- **D-28:** Notes indicator on table row: single-line truncated preview under task title with tooltip for full text preview.

### Keyboard Accessibility & Feedback
- **D-29:** Keyboard shortcuts: `/` to focus search bar, `c` to focus quick-add input bar, `Esc` to close Drawer/Modal (ignored when typing in form inputs).
- **D-30:** Focus restoration: save trigger element ref before opening Modal/Drawer and restore focus precisely upon close; maintain WCAG 2.1 AA visible focus outline.
- **D-31:** Table keyboard navigation: Arrow Up/Down to navigate rows, `Enter` to open details Drawer, `Space` to toggle row selection checkbox.
- **D-32:** Action feedback: non-intrusive `message.success({ content: '...', duration: 1.5 })` and aria-live polite region for screen reader announcements on inline edits.

### Claude's Discretion
- Exact layout spacing, padding, and Ant Design component tokens follow Phase 1 established theme rules.
- Dexie repository query optimizations and compound indexing in schema if needed for text search and status/project filtering.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture & Requirements
- `.planning/ROADMAP.md` § Phase 2 — Deliverables, goals, and success criteria.
- `.planning/REQUIREMENTS.md` § Work Hierarchy & Task Details — WORK-01 to WORK-05, TASK-01 to TASK-06, UX-02, UX-03, UX-05.
- `CLAUDE.md` — Technical stack (Ant Design 6, Dexie 4, React 19, Dayjs, Web Crypto, TypeScript strict).
- `.planning/phases/01-foundation-deployment-shell/01-CONTEXT.md` — Established app shell layout, hash routing, theme tokens, and database patterns.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/types/models.ts` — Fully defined TypeScript interfaces for `Project`, `Milestone`, `Task`, `CapacityRule`, `CapacityOverride`, `PlannedAllocation`.
- `src/db/schema.ts` — Initial Dexie table declarations (`projects`, `milestones`, `tasks`, etc.).
- `src/db/index.ts` — Dexie database instance and live query reactivity.
- `src/components/shell/AppShell.tsx` — Responsive Ant Design layout shell with hash route tabs.
- `src/components/common/EmptyState.tsx` — Standard empty state display.
- `src/hooks/useHashRoute.ts` — Active hash route listener.
- `src/utils/uuid.ts` — Standard `crypto.randomUUID()` generator.
- `src/utils/date.ts` — Format and parsing helpers for `YYYY-MM-DD`.

### Established Patterns
- Calendar dates as `YYYY-MM-DD` strings; durations as non-negative integer minutes.
- Dexie transactions for multi-record operations.
- Hash-based navigation (`/#/tasks`, `/#/projects`).
- Ant Design 6 form controls, message API, and theme provider tokens.

### Integration Points
- `src/components/shell/Navigation.tsx` — Add menu links or verify routing to `/#/tasks` and `/#/projects`.
- `src/App.tsx` — Render task and project view components according to current hash route.
- `src/db/` — Add dedicated repositories/query functions for projects, milestones, tasks, and cascade deletion.

</code_context>

<specifics>
## Specific Ideas
- High-efficiency personal task workflow: quick-add bar on top of task table with optional `~2h` estimate parsing.
- Clear visual hierarchy using Ant Design Breadcrumb Tag for project/milestone relationships.
- Fast status switching via Tag click and fast progress adjustment via popover slider without opening heavy forms.
- Reassuring safety on deletion: explicit modals offering choice between cascading delete or orphaning tasks to standalone.

</specifics>

<deferred>
## Deferred Ideas
- Task dependencies and subtasks (v2 requirement / out of scope for v1).
- Saved search filter presets (PROD-01, v2).
- Task duplication or task templates (PROD-02, v2).
- Command Palette (`Ctrl+K`) for global app navigation (v2 candidate).

</deferred>

---

*Phase: 02-Work Hierarchy & Fast Task Management*
*Context gathered: 2026-09-26*
