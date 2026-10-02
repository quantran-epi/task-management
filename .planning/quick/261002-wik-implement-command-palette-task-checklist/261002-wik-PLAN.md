---
phase: quick
plan: 261002-wik
type: execute
wave: 1
depends_on: []
files_modified:
  - src/types/models.ts
  - src/validation/schemas.ts
  - src/validation/backupSchemas.ts
  - src/db/repositories/taskRepo.ts
  - src/components/tasks/TaskChecklistSection.tsx
  - src/components/tasks/TaskDrawer.tsx
  - src/components/palette/CommandPaletteModal.tsx
  - src/components/dailyReview/DailyReviewModal.tsx
  - src/components/shell/AppShell.tsx
  - tests/components/tasks/TaskChecklistSection.test.tsx
  - tests/components/palette/CommandPaletteModal.test.tsx
  - tests/components/dailyReview/DailyReviewModal.test.tsx
autonomous: true
requirements:
  - CMD-PALETTE-01
  - TASK-CHECKLIST-01
  - DAILY-REVIEW-01
user_setup: []
must_haves:
  truths:
    - "Task supports optional checklist items with text and done toggle, and can sync progress percentage."
    - "User can trigger Command Palette via Cmd+K or Ctrl+K or header button, search across views, tasks, projects, notes, and execute quick navigation or task creation."
    - "User can open Daily Review modal to see today's logged hours vs capacity, inspect today's planned tasks, and roll over incomplete tasks to tomorrow."
    - "Only targeted tests for checklist, command palette, and daily review are executed."
  artifacts:
    - path: "src/components/tasks/TaskChecklistSection.tsx"
      provides: "Interactive checklist editor for subtasks with progress sync"
    - path: "src/components/palette/CommandPaletteModal.tsx"
      provides: "Global Cmd+K command palette for search and quick navigation"
    - path: "src/components/dailyReview/DailyReviewModal.tsx"
      provides: "Daily standup and shutdown review modal with task rollover"
  key_links:
    - from: "src/components/tasks/TaskDrawer.tsx"
      to: "src/components/tasks/TaskChecklistSection.tsx"
      via: "embeds checklist form item and passes progress update callback"
    - from: "src/components/shell/AppShell.tsx"
      to: "src/components/palette/CommandPaletteModal.tsx"
      via: "hotkey listener and header trigger button"
    - from: "src/components/shell/AppShell.tsx"
      to: "src/components/dailyReview/DailyReviewModal.tsx"
      via: "header daily review button"
---

<objective>
Implement Command Palette (Cmd+K / Ctrl+K), Task Checklist / Subtasks, and Daily Review / Standup Modal.

Purpose: Provide keyboard-first fast search & quick actions across the app, granular subtask checklist tracking with progress calculation inside tasks, and end-of-day/standup review with one-click task rollover.
Output:
- Task Checklist model, validation schemas, and interactive UI in TaskDrawer.
- CommandPaletteModal with Cmd+K listener, fuzzy/substring search over views/tasks/projects/notes, and quick-add task support.
- DailyReviewModal showing today's logged hours vs capacity, completed vs pending items, 1-click rollover to tomorrow, and standup markdown copy.
- Targeted unit/component tests for each feature.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/types/models.ts
@src/validation/schemas.ts
@src/validation/backupSchemas.ts
@src/components/tasks/TaskDrawer.tsx
@src/components/shell/AppShell.tsx
@src/utils/standup.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Task Checklist / Subtasks model, schemas & UI in TaskDrawer</name>
  <files>
    src/types/models.ts
    src/validation/schemas.ts
    src/validation/backupSchemas.ts
    src/db/repositories/taskRepo.ts
    src/components/tasks/TaskChecklistSection.tsx
    src/components/tasks/TaskDrawer.tsx
    tests/components/tasks/TaskChecklistSection.test.tsx
  </files>
  <action>
    1. In src/types/models.ts, define:
       export interface TaskChecklistItem {
         id: string; // crypto.randomUUID()
         text: string;
         done: boolean;
       }
       Add optional field checklist?: TaskChecklistItem[] to Task interface.
    2. In src/validation/schemas.ts, define taskChecklistItemSchema (id: z.string(), text: z.string().trim().min(1).max(200), done: z.boolean()) and add checklist: z.array(taskChecklistItemSchema).optional() to TaskInputSchema and TaskUpdateSchema.
    3. In src/validation/backupSchemas.ts, add BackupTaskChecklistItemSchema and include checklist: z.array(BackupTaskChecklistItemSchema).optional() in BackupTaskRecordSchema.
    4. In src/db/repositories/taskRepo.ts, ensure checklist is preserved and updated when creating and updating tasks.
    5. Create src/components/tasks/TaskChecklistSection.tsx:
       - Displays list of subtask items with Checkbox for toggling done status.
       - Editable text for each item and delete button (DeleteOutlined).
       - Add item form with text Input and Add button (or Enter key).
       - Progress calculation helper and button "Đồng bộ tiến độ" (Calculate progress percentage: Math.round((completed / total) * 100)) that updates the Task form progress field.
       - Optional toggle/checkbox "Tự động đồng bộ tiến độ" to keep task progress in sync when checklist items change.
    6. Integrate TaskChecklistSection into src/components/tasks/TaskDrawer.tsx:
       - Bind checklist field in TaskDrawer form.
       - Add a "Checklist / Việc phụ" section inside the details tab (under "Thời gian & tiến độ" or as a dedicated section).
       - Ensure checklist items save to Task record on handleSave.
    7. Write unit tests in tests/components/tasks/TaskChecklistSection.test.tsx covering adding items, toggling done state, deleting items, and calculating progress.
  </action>
  <verify>
    <automated>npx vitest run tests/components/tasks/TaskChecklistSection.test.tsx</automated>
  </verify>
  <done>
    Task model and schemas validate checklist arrays. TaskDrawer allows adding, toggling, editing, and deleting checklist items with progress percentage sync. Unit tests pass.
  </done>
</task>

<task type="auto">
  <name>Task 2: Global Command Palette (Cmd+K / Ctrl+K) & Quick-Add</name>
  <files>
    src/components/palette/CommandPaletteModal.tsx
    src/components/shell/AppShell.tsx
    tests/components/palette/CommandPaletteModal.test.tsx
  </files>
  <action>
    1. Create src/components/palette/CommandPaletteModal.tsx:
       - Global keydown listener for (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' to toggle modal open.
       - Clean modal interface without default footer, featuring a prominent search Input with SearchOutlined icon and placeholder "Tìm kiếm trang, tác vụ, dự án, ghi chú... (hoặc gõ '+ tên' để thêm nhanh)".
       - Categorized list results:
         * Navigation: Dashboard, Planner, Tasks, Projects, Analytics, Notes, Settings.
         * Tasks: search recent/active tasks matching title or jiraKey. Selecting a task opens TaskDrawer or navigates to Tasks.
         * Projects: search projects matching name. Selecting navigates to Projects.
         * Notes: search notes matching title or body snippet. Selecting navigates to Notes.
         * Quick Actions: "Thêm tác vụ nhanh...", "Mở Daily Review / Standup".
       - Quick-add parsing: when query starts with "+" or user activates Quick Add mode, parse input using parseQuickAddInput (name and ~time) and create task directly using createTask, then show success toast and close palette.
       - Keyboard navigation: ArrowUp, ArrowDown to highlight result, Enter to select, Escape to close.
    2. In src/components/shell/AppShell.tsx:
       - Mount CommandPaletteModal with handlers for navigation (onNavigate), task inspection (setInspectingTaskId), project inspection, and daily review modal trigger.
       - Add a Search / Command Palette shortcut trigger button in AppShell Header (e.g. Button with SearchOutlined and "⌘K" / "Ctrl+K" badge) so user can also open palette by clicking.
    3. Write component test in tests/components/palette/CommandPaletteModal.test.tsx verifying hotkey listener, search filtering, result selection navigation, and quick task creation.
  </action>
  <verify>
    <automated>npx vitest run tests/components/palette/CommandPaletteModal.test.tsx</automated>
  </verify>
  <done>
    Cmd+K / Ctrl+K and header search button open CommandPaletteModal. Typing filters navigation, tasks, projects, notes, and allows quick task creation. Component tests pass.
  </done>
</task>

<task type="auto">
  <name>Task 3: Daily Review / Standup Modal & Rollover with targeted tests</name>
  <files>
    src/components/dailyReview/DailyReviewModal.tsx
    src/components/shell/AppShell.tsx
    tests/components/dailyReview/DailyReviewModal.test.tsx
  </files>
  <action>
    1. Create src/components/dailyReview/DailyReviewModal.tsx:
       - Modal accessible via header button in AppShell ("Daily Review" / "Đánh giá ngày") or from Command Palette.
       - Header / Summary Section:
         * Current date display (getTodayDateString()).
         * Logged work time today: queries getWorkSessionsForDate(todayStr) and sums durationMinutes (formatted via formatMinutes).
         * Daily capacity: queries getEffectiveCapacityForDate(todayStr).
         * Capacity utilization progress bar / stats (logged vs capacity).
       - Planned Tasks for Today Section:
         * Queries getAllocationsForDate(todayStr) to list today's planned tasks with status tags, allocated minutes, and spent minutes.
         * Visual indicator for completed tasks (status Done) vs incomplete tasks (Open, In Progress, etc.).
       - Rollover uncompleted tasks action:
         * Button "Chuyển việc dở dang sang ngày mai" (Roll over incomplete tasks to tomorrow).
         * Filters today's allocations where task.status is not Done and not Cancelled.
         * Determines target date (dayjs(todayStr).add(1, 'day').format('YYYY-MM-DD')).
         * Calls updateAllocation(alloc.id, alloc.allocatedMinutes, targetDate) for each uncompleted allocation (handling collision merging).
         * Displays message with count of rolled over tasks and reloads data.
       - Standup Report button:
         * Button "Sao chép báo cáo Standup" utilizing formatStandupSummary(todayTasks, { todayStr }) to copy markdown to clipboard.
    2. In src/components/shell/AppShell.tsx:
       - Add state dailyReviewOpen (boolean).
       - Add a header button (e.g. CheckCircleOutlined or CarryOutOutlined with tooltip "Daily Review / Standup") to open DailyReviewModal.
       - Render DailyReviewModal with props for open, onClose, onNavigate, onInspectTask.
    3. Write component test in tests/components/dailyReview/DailyReviewModal.test.tsx verifying today's work sessions and capacity display, task list rendering, rollover execution, and standup copy functionality.
  </action>
  <verify>
    <automated>npx vitest run tests/components/dailyReview/DailyReviewModal.test.tsx</automated>
  </verify>
  <done>
    DailyReviewModal displays today's metrics and planned tasks, executes rollover of incomplete tasks to tomorrow, and exports standup summary. Targeted tests pass.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| User input -> Task model | Checklist text, quick-add task title, search query crossing into DB |
| Date rollover -> DB | Batch updating planned allocations across date boundaries |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-quick-01 | Tampering | TaskChecklistItem | mitigate | Validate text length (1-200 chars) and sanitize boolean done in zod schemas |
| T-quick-02 | Denial of Service | CommandPaletteModal | mitigate | Client-side search limits results per category to max 8 items; debounce search input if needed |
| T-quick-03 | Tampering | DailyReviewModal rollover | mitigate | Use updateAllocation with strict isValidCalendarDate check for targetDate and transactional collision resolution |
</threat_model>

<verification>
Run ONLY targeted test files for new code:
- npx vitest run tests/components/tasks/TaskChecklistSection.test.tsx
- npx vitest run tests/components/palette/CommandPaletteModal.test.tsx
- npx vitest run tests/components/dailyReview/DailyReviewModal.test.tsx
</verification>

<success_criteria>
- Checklist items can be created, edited, toggled, deleted, and synchronized with task progress in TaskDrawer.
- Command Palette responds to Cmd+K / Ctrl+K and header button, providing instant search and quick-add task creation.
- Daily Review modal provides clear today's metrics vs capacity, lists today's planned tasks, allows 1-click rollover to tomorrow, and copies standup summary.
- All 3 targeted tests pass cleanly without running unrelated tests.
</success_criteria>

<output>
Create .planning/quick/261002-wik-implement-command-palette-task-checklist/261002-wik-PLAN.md
</output>
