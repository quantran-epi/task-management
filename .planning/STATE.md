---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Banking IT Enhancements & Jira Integration
status: verifying
stopped_at: Completed 13.2-03-PLAN.md
last_updated: "2026-10-03T04:53:53.506Z"
last_activity: 2026-10-03
progress:
  total_phases: 9
  completed_phases: 9
  total_plans: 30
  completed_plans: 30
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-27)

**Core value:** Make planned work realistically fit available time by exposing overload early and suggesting feasible daily workload distributions.
**Current focus:** Phase 13.2 — ai-chat-drawer-item-context-grounding-9router-ask-answer-int

## Current Position

Phase: 13.2
Plan: Not started
Status: Phase complete — ready for verification
Next recommended run: /gsd-execute-phase 13.2
Last activity: 2026-10-04 - Completed quick task 261004-chp: context history pruning and char limit wiring

### Quick Tasks Completed

| # | Description | Date | Commit | Status | Directory |
| --- | ------------- | ------ | -------- | -------- | ----------- |
| 1 | `260928-kn3` · Planner task item subtitle and auto-distribute project filter | 2026-09-28 | — | — | — |
| 2 | `260928-kn4` · UI enhancements & project links | 2026-09-28 | — | — | — |
| 260930-j2e | in task drawer detail, there are many fields now, divide them in sections for more focus and easy to use | 2026-09-30 | 2008412 | — | [260930-j2e-in-task-drawer-detail-there-are-many-fie](./quick/260930-j2e-in-task-drawer-detail-there-are-many-fie/) |
| 260930-km1 | task list page need global sort, criteria may be by creation date, updated date, etc. | 2026-09-30 | 2111c95 | — | [260930-km1-task-list-page-need-global-sort-criteria](./quick/260930-km1-task-list-page-need-global-sort-criteria/) |
| 260930-dii | Day Insight — per-task planned vs actual for a single date (read-only) | 2026-09-30 | 801eeb5 | complete | [260930-dii-day-insight-per-task-plan-vs-actual](./quick/260930-dii-day-insight-per-task-plan-vs-actual/) |
| 260930-ugc | Setup Tauri desktop app for macOS and Windows | 2026-09-30 | faf3662 | complete | [260930-ugc-setup-tauri-desktop-app-for-macos-and-wi](./quick/260930-ugc-setup-tauri-desktop-app-for-macos-and-wi/) |
| 260930-uwl | Add Tauri notification plugin for native desktop notifications | 2026-09-30 | e2d8996 | complete | [260930-uwl-add-tauri-notification-plugin-for-native](./quick/260930-uwl-add-tauri-notification-plugin-for-native/) |
| 260930-vdl | pop out and pin timer as separate small window with multi-timer support and live sync | 2026-09-30 | 74e9bd2 | complete | [260930-vdl-pop-out-and-pin-timer-as-separate-small-](./quick/260930-vdl-pop-out-and-pin-timer-as-separate-small-/) |
| 260930-wva | fix vitest virtual:pwa-register alias for windows runners | 2026-09-30 | 9bbc0f5 | complete | [260930-wva-fix-vitest-virtual-pwa-alias-windows](./quick/260930-wva-fix-vitest-virtual-pwa-alias-windows/) |
| 261001-hex | Add Tauri local SQLite file persistence with user-selected path, row-level transactional autosave, close flush, missing-path recovery, and GitHub auto-sync by interval or fixed daily local time with dirty-only sync and missed-run catch-up | 2026-10-01 | 7d84dd6 | complete | [261001-hex-add-tauri-local-sqlite-file-persistence-](./quick/261001-hex-add-tauri-local-sqlite-file-persistence-/) |
| 261002-cie | Jira status mapping, local-only status edits, note details, screenshot attachments, and quick notes | 2026-10-02 | df12789 | complete | [261002-cie-need-ui-for-local-status-to-jira-status-](./quick/261002-cie-need-ui-for-local-status-to-jira-status-/) |
| 261002-f2d | task, project, and milestone need one more status call pending. task list and project list need pagination | 2026-10-02 | afdb2a7 | complete | [261002-f2d-task-project-and-milestone-need-one-more](./quick/261002-f2d-task-project-and-milestone-need-one-more/) |
| 261003-grt | make AI launch that associate t items: task, project, etc more easier, use a button, current open detail and cmd + J is not work | 2026-10-03 | 3cfd08e | complete | [261003-grt-make-ai-launch-that-associate-t-items-ta](./quick/261003-grt-make-ai-launch-that-associate-t-items-ta/) |
| 261003-tcl | AI tool calling harness with Dexie query tools and recognizable loading status | 2026-10-03 | f53b01f | complete | [261003-tcl-ai-tool-calling-harness](./quick/261003-tcl-ai-tool-calling-harness/) |
| 261003-laj | add debug feature to see AI messages, system prompts, payloads, tool executions, and Tauri devtools | 2026-10-03 | 5993583 | complete | [261003-laj-add-debug-feature-to-see-ai-messages-bac](./quick/261003-laj-add-debug-feature-to-see-ai-messages-bac/) |
| 20261003-mut | AI drawer header cleanup, mutations with confirmation, and inline input button | 2026-10-03 | — | complete | [20261003-ai-mutations-and-ui-cleanup](./quick/20261003-ai-mutations-and-ui-cleanup/) |
| 261002-remove-analytics | Remove analytics page, components, calculations, tests, and navigation items | 2026-10-02 | — | complete | [261002-remove-analytics](./quick/261002-remove-analytics/) |
| 261002-jm1 | Fix close-window action, stale popout cache, Jira mapping labels, note indicator, and pagination | 2026-10-02 | — | complete | [261002-jm1-fix-close-window-action-stale-popout-cac](./quick/261002-jm1-fix-close-window-action-stale-popout-cac/) |
| 261002-su2 | Install @ant-design/plots and build charts 1 (Estimate vs Actual), 2 (Work Type Breakdown), and 6 (Productivity Heatmap) | 2026-10-02 | 777a838 | complete | [261002-su2-install-ant-design-plots-build-chart-1-e](./quick/261002-su2-install-ant-design-plots-build-chart-1-e/) |
| 261002-t9m | Filter analytics charts to only show items with data (> 0 hours / minutes) | 2026-10-02 | — | complete | [261002-t9m-filter-charts-to-only-show-items-with-da](./quick/261002-t9m-filter-charts-to-only-show-items-with-da/) |
| 261002-eac | Estimate vs actual accuracy analytics per task type | 2026-10-02 | 6e5dcdc | complete | [261002-eac-estimate-accuracy-per-task-type](./quick/261002-eac-estimate-accuracy-per-task-type/) |
| 261002-rec | Recurring tasks and GitHub sync diagnostics | 2026-10-02 | — | complete | [261002-rec-recurring-tasks](./quick/261002-rec-recurring-tasks/) |
| 261002-vqg | Open local folder link in system file explorer and browse local folders | 2026-10-02 | 39bac40 | complete | [261002-vqg-open-local-folder-link-in-file-explorer-](./quick/261002-vqg-open-local-folder-link-in-file-explorer-/) |
| 261002-wik | Command Palette (Cmd+K), Task Checklist / Subtasks, and Daily Review Modal | 2026-10-02 | 779c019 | complete | [261002-wik-implement-command-palette-task-checklist](./quick/261002-wik-implement-command-palette-task-checklist/) |
| 261002-x11 | Add Command Palette cheatsheet guide and prefix filters | 2026-10-02 | be616ad | complete | [261002-x11-add-command-palette-cheatsheet-guide-and](./quick/261002-x11-add-command-palette-cheatsheet-guide-and/) |
| 261002-x47 | Fix 31 TypeScript build errors across 7 files | 2026-10-02 | a146d26 | complete | [261002-x47-fix-31-typescript-build-errors-across-7-](./quick/261002-x47-fix-31-typescript-build-errors-across-7-/) |
| 261003-pdm | Normalize command palette item navigation with detail modals, tools, and navigators | 2026-10-03 | 99569a7 | complete | [261003-pdm-command-palette-item-detail-modals](./quick/261003-pdm-command-palette-item-detail-modals/) |
| 261003-bz6 | Command palette insight pages for task, project, and milestone with pre-implementation analysis, and note edit modal fix | 2026-10-03 | 59b2905 | complete | [261003-bz6-for-command-palette-now-i-want-each-item](./quick/261003-bz6-for-command-palette-now-i-want-each-item/) |
| 261003-tbl | Fix AI input Cmd+Enter clearing and add table items context menu with Ask AI for task, project, milestone | 2026-10-03 | cff43e2 | complete | [261003-tbl-fix-ai-input-and-add-table-context-menu](./quick/261003-tbl-fix-ai-input-and-add-table-context-menu/) |
| 261003-pop | Fix AI input Cmd+Enter clearing, resizable and pinable AI popout window, and Claude shortcut for local paths | 2026-10-03 | — | complete | [261003-pop-fix-ai-input-popout-and-claude-shortcut](./quick/261003-pop-fix-ai-input-popout-and-claude-shortcut/) |
| 261003-set | Fix SettingsView test timeout in CI with testTimeout configuration and clean Dexie teardown | 2026-10-03 | — | complete | [261003-set-fix-settingsview-test-timeout-in-ci](./quick/261003-set-fix-settingsview-test-timeout-in-ci/) |
| 261003-wib | enhance UI aesthetics and modern app icon | 2026-10-03 | 2e51acb | complete | [261003-wib-enhance-ui-aesthetics-and-modern-app-ico](./quick/261003-wib-enhance-ui-aesthetics-and-modern-app-ico/) |
| 261004-blg | fix drawer interactions, ai header actions dropdown, chat input height, task planner instructions modal, and rename app to PlannerMate | 2026-10-04 | ade0453 | complete | [261004-blg-fix-drawer-interactions-ai-header-action](./quick/261004-blg-fix-drawer-interactions-ai-header-action/) |
| 261004-nps | normalize page structure UI across all views with unified PageHeader, update top header, enable notes search by parent name, and add item filter to NotesView | 2026-10-04 | — | complete | [261004-nps-normalize-page-structure-and-notes-filter](./quick/261004-nps-normalize-page-structure-and-notes-filter/) |
| 261004-nls | fix note detail modal layout shift on open/close and display entity name in note detail modal | 2026-10-04 | — | complete | [261004-nls-fix-note-detail-modal-layout-shift-and-entity-name](./quick/261004-nls-fix-note-detail-modal-layout-shift-and-entity-name/) |
| 261004-ash | app shortcuts with HUD autocomplete, cross-platform modifiers, multi-key combos, and view actions | 2026-10-04 | — | complete | [261004-ash-app-shortcuts-with-hud-autocomplete](./quick/261004-ash-app-shortcuts-with-hud-autocomplete/) |
| 261004-chp | wire charLimit config to context grounding and add lightweight history and tool output pruning | 2026-10-04 | 7897cc3 | complete | [261004-chp-context-history-pruning-and-char-limit](./quick/261004-chp-context-history-pruning-and-char-limit/) |
| 261004-cct | make context char limit freely configurable with estimated token preview and presets | 2026-10-04 | — | complete | [261004-cct-context-char-limit-and-token-preview](./quick/261004-cct-context-char-limit-and-token-preview/) |

## Performance Metrics

**Velocity:**

- Total plans completed: 47 (v1.0)
- Average duration: 13.5 min
- Total execution time: 1.58 hours

**Historical by Phase (v1.0):**

| Phase | Plans | Total | Avg/Plan |
|---|---|---|---|
| 1. Foundation & Deployment Shell | 4 | 39m | 9.8m |
| 2. Work Hierarchy & Fast Task Management | 3 | 53m | 17.6m |
| 3. Capacity Model & Daily Planning Ledger | 4 | 59m | 14.8m |
| 4. Feasibility Engine & Workload Distribution | 3 | 45m | 15.0m |
| 5. Actionable Dashboard & Workload Forecasting | 3 | 34m | 11.3m |
| 6. Safe Local Backup & Restore | 3 | 28m | 9.3m |
| 7. PWA Offline Capability & Lifecycle Hardening | 4 | 38m | 9.5m |
| 8. Optional Encrypted GitHub Backup | 3 | 43m | 14.3m |
| 09 | 3 | - | - |
| 10 | 2 | - | - |
| Phase 11 P01 | 9m | 2 tasks | 18 files |
| Phase 11 P02 | 12m | 2 tasks | 4 files |
| Phase 11 P03 | 10m | 2 tasks | 9 files |
| 11 | 3 | - | - |
| Phase 12 P01 | 15m | 3 tasks | 15 files |
| Phase 12 P02 | 10m | 3 tasks | 7 files |
| Phase 12 P03 | 12m | 3 tasks | 11 files |
| 12 | 3 | - | - |
| 12.1 | 3 | - | - |
| 13 | 3 | - | - |
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 12.1 P01 | 15m | 3 tasks | 16 files |
| Phase 12.1 P03 | 25m | 3 tasks | 8 files |
| Phase 12.1 P04 | 12m | 3 tasks | 10 files |
| Phase 12.2 P01 | 15m | 3 tasks | 14 files |
| Phase 12.2 P02 | 14m | 3 tasks | 9 files |
| Phase 12.2 P03 | 24m | 3 tasks | 4 files |
| Phase 12.2 P04 | 18m | 2 tasks | 9 files |
| Phase 13 P01 | 6m | 3 tasks | 7 files |
| Phase 13 P02 | 10m | 3 tasks | 7 files |
| Phase 13 P03 | 15m | 2 tasks | 5 files |
| Phase 13.1 P01 | 15m | 3 tasks | 12 files |
| Phase 13.1 P03 | 20m | 3 tasks | 17 files |
| Phase 13.1 P04 | 10m | 3 tasks | 6 files |
| Phase 13.1 P05 | 18m | 3 tasks | 14 files |
| Phase 13.2 P01 | 12m | 3 tasks | 11 files |
| Phase 13.2 P02 | 14m | 3 tasks | 9 files |
| Phase 13.2 P03 | 11m | 2 tasks | 7 files |

## Accumulated Context

### Decisions

Decisions logged across v1.0 and v1.1:

- [Phase 13.2]: Docked Side-by-Side: AppShell Content transitions marginRight by drawer width when pinned (D-01)
- [Phase 13.2]: Drag-resizable AI Chat Drawer width clamped 320px-650px persisted in localStorage (D-02)
- [Phase 13.2]: AI Chat Drawer operates below inspection drawers at z-index 100/1000 while TaskDrawer/NotificationDrawer stay at 1050 (D-03)
- [Phase 13.2]: Cmd+J / Ctrl+J global shortcut and header RobotOutlined button toggle AI Chat Drawer (D-04)
- [Phase 13.2]: SCHEMA_V8 with scoped chat threads and messages with cascade deletion on entity removal (D-07)
- [Phase 13.2]: Dual-tier 9router credential management in OS Keychain (Tauri) and Dexie settings (Web) (D-20)
- [Quick 261003-9rm]: Auto-fetch available models from 9Router on drawer open, remove hardcoded fake model fallback in ChatHeader, and prevent unroutable model payloads
- [Phase 13.2]: Native fetch SSE streaming client with line buffering, AbortController cancellation, and API key redaction (D-14, D-15)
- [Phase 13.1]: Use keyring v4.2 with Entry::delete_credential to support cross-platform secret storage and deletion
- [Phase 13.1]: Keep secrets in module-level in-memory cache and OS Keychain, completely excluding them from SQLite mirror and Dexie IndexedDB
- [Phase 13.1]: Pause auto-sync scheduler without infinite retries upon 401/403 or remote SHA conflict until user intervenes
- [Phase 13.1]: WorkSession records remain the single source of truth for Actual time without secondary aggregate fields (D-28)
- [Phase 13.1]: Running segments crossing local midnight are deterministically split across calendar dates while paused duration is excluded (D-30)
- [Phase 13.1]: Weekly Actual Worklog grid displays planned vs actual hours per task and date with color-coded variance (negative neutral, positive warning) (D-26, D-31)
- [Phase 13.1]: Planner shows tasks with planned allocations or work sessions during the week with a searchable Add Task dropdown for ad-hoc entries (D-27)
- [Phase 13.1]: Users can quickly enter minutes directly in table cells or open a detail modal to inspect and edit start/end times and segments (D-29)
- [Phase 13.1]: Actual Worklog operations remain strictly local without external Jira worklog sync (D-32)
- [Phase 13.1]: Single reusable Notes pop-out window with Always on Top, screen-boundary clamping, and web popup fallback
- [Phase 13.1]: Cascade deletion detaches parent-linked notes into standalone notes without losing content or attachments
- [Phase 13.1]: ActiveTimer.segments made optional on TypeScript model level for test mock compatibility while populated with fallback in schema upgrade and runtime methods
- [Phase 13.1]: Finishing a paused timer resolves WorkSession.endTime to the last segment's endTime, excluding trailing idle pause time from logged work sessions
- [Phase 13.1]: Safe status automation strictly scoped to Open -> In Progress inside Dexie transaction, leaving review and terminal statuses intact
- [Phase 13]: BurndownSvgChart renders pure SVG with dynamic tooltip overlay without D3/Recharts dependencies
- [Phase 13]: StackedStatusBar handles zero-task projects safely with dashed empty placeholder to prevent division by zero
- [Phase 13]: WorkloadProportionBar maps stakeholder palette cycle and reserves neutral gray for unassigned tasks
- [Phase 11]: Sanitized Jira browse URLs using getJiraBrowseUrl with protocol/trailing-slash trimming and URI encoding
- [Phase 11]: Used stopPropagation on Jira key tags in TaskTable and TaskAllocationCard to prevent accidental drawer opening during navigation
- [Phase 11]: Appended [JiraKey] immediately following [WorkType] in formatStandupSummary preserving existing format when unlinked
- [Phase 10]: Query plannedAllocations on indexed date with .between(startDate, endDate, true, true) and return deduplicated Set<string> of taskIds with allocatedMinutes > 0
- [Phase 10]: FilterContext supports backwards compatibility by normalizing string todayStr argument into { todayStr }
- [Phase 10]: Multi-criteria filterTasks resolves inherited Ops and BA tags via resolveInheritedTags matching direct, milestone, or project assignments
- [Phase 10]: formatStandupSummary excludes Cancelled tasks and groups items into Done, In Progress / In Review / Resolved, and Open with Vietnamese banking IT labels

- [Milestone v1.1]: Defined tight 5-phase roadmap (Phases 9-13) covering Banking IT domain fields, search, Jira integration, notifications, and workload analytics.
- [Milestone v1.1]: Zero new dependencies — native React SVG for burndown chart, native fetch + Basic Auth for Jira REST API v3, Dexie v2 multi-entry indexes.
- [Roadmap]: Structured into 8 vertical delivery phases adhering to standard granularity and dependency constraints (v1.0).
- [Roadmap]: Prioritized local file backup and restore (Phase 6) before encrypted GitHub backup integration (Phase 8).
- [Roadmap]: Retained strict runtime session storage for GitHub credentials and Web Crypto passphrases.
- [Phase 01]: Used jsdom@29.1.1 to align with Node 20.19.5 engine requirements avoiding undici 8 webidl incompatibility
- [Phase 01]: Explicitly added @testing-library/dom peer dependency to support jest-dom test matchers in Vitest
- [Phase 01]: Configured JSDOM matchMedia mock in tests/setup.ts to simulate desktop min-width breakpoints for Ant Design ResponsiveObserver
- [Phase 01]: Added @testing-library/jest-dom/vitest to tsconfig.json types to provide full DOM assertion typing
- [Phase 01]: Configured GitHub Actions workflow with strict least-privilege permissions: contents: read, pages: write, id-token: write
- [Phase 01]: Enforced test execution step (npm test) prior to build and deployment in CI workflow
- [Phase 01]: Header background dynamically references token.colorBgContainer with token.colorBorderSecondary border to prevent dark mode contrast failure (CR-01)
- [Phase 01]: Sider theme dynamically switches to dark in dark mode via isDark prop (CR-01)
- [Phase 01]: Enforced unique index &dayOfWeek on capacityRules table to prevent duplicate weekday rows (CR-02)
- [Phase 01]: initializeDatabaseDefaults wrapped in atomic readwrite transaction with ConstraintError handling for multi-tab concurrency (CR-02)
- [Phase 01]: App.tsx queries capacity rules ordered by dayOfWeek (WR-01)
- [Phase 01]: ResetDbModal catches reset errors with logging (WR-02)
- [Phase 2]: Preserved exactOptionalPropertyTypes strict typing in repositories by using conditional assignment rather than spreading undefined values into models.
- [Phase 2]: Quick-add parser uses lastIndexOf('~') and regex matching on the trailing token to handle unspaced and multi-token task names robustly.
- [Phase 2]: Atomic transactions wrap all multi-table deletion routines in cascadeRepo, cleaning up plannedAllocations to eliminate orphaned allocations.
- [Phase 2]: Configured JSDOM global.ResizeObserver mock in tests/setup.ts to support Ant Design 6 dropdown, popover, and select animations
- [Phase 2]: Configured fileParallelism: false in vite.config.ts test runner to prevent Windows worker thread timeouts across concurrent test files
- [Phase 2]: Used strict YYYY-MM-DD calendar string comparisons in matchesHorizon to eliminate timezone drift across UTC midnight (T-02-06)
- [Phase 2]: Defaulted CascadeDeleteModal action to task-preserving orphan mode to prevent accidental data loss (T-02-08, D-13, D-14)
- [Phase 2]: Wrapped batch mutations in Dexie atomic transactions to guarantee data consistency during multi-record updates (T-02-09, D-11)
- [Phase 03]: Specific date overrides take precedence over weekly template rules in getEffectiveDailyCapacity
- [Phase 03]: Enforced unique constraint per (taskId, date) by transactional check-and-update in upsertAllocation per D-12
- [Phase 03]: Implemented date collision resolution in updateAllocation: moving an allocation to an already allocated date merges records per PLAN-02
- [Phase 03]: Filtered task status in getAllocationsForDate and getWeeklyAllocationsWithTasks to strictly exclude Done and Cancelled tasks from active load sums per PLAN-05 and D-16
- [Phase 03]: Displayed soft orange warning Alert when cumulative planned time exceeds task estimate without blocking saving per D-10 and PLAN-06
- [Phase 03]: Rendered inactive Done and Cancelled task allocation cards with 50% opacity, strikethrough, and exclusion badges per D-16
- [Phase 03]: Primary view on /#/planner displays 7-day Monday through Sunday grid with reactive capacity metrics per D-01
- [Phase 03]: Dual-encoded day column header with color, text, and icons satisfying WCAG 2.1 AA for all 4 load states (available, busy, overloaded, no-capacity) per D-14, D-15, PLAN-04
- [Phase 03]: Flagged days with >4 tasks using an accessible high context switching warning tag per D-13
- [Phase 03]: Implemented WeekNavigator with prev/next week controls, Today shortcut, and DatePicker week selector with Alt+Left/Right and Alt+T keyboard shortcuts per D-02
- [Phase 03]: Provided Show Completed toggle allowing muted display of Done/Cancelled tasks while strictly excluding them from active daily load sums per D-16, PLAN-05
- [Phase 03]: Mounted PlannerView and SettingsView on /#/planner and /#/settings routes without placeholder empty states
- [Phase 03]: Expanded desktop weekly grid column min-width from 135px to 180px with overflow-x auto to prevent squashing columns
- [Phase 03]: DayColumnHeader top row and metrics row wrap dynamically to avoid truncation in constrained widths
- [Phase 03]: TaskAllocationCard converted to 2-tier stacked structure with full-width 2-line clamped task titles
- [Phase 04]: Hard-capped forward projection search in findEarliestFeasibleDate at 365 days max to prevent DoS loops (T-04-01)
- [Phase 04]: Clamped remaining unallocated minutes and validated non-negative numbers to guard against numeric tampering (T-04-02)
- [Phase 04]: Consolidated non-quantum residual (< 15m) into first eligible day with available room per D-07
- [Phase 04]: Broken load ratio ties in distributeBalancedSpread and distributeGreedyFill deterministically using earlier calendar date string comparison
- [Phase 04]: Preserved candidates in local component state overrides without mutating IndexedDB during inline minute adjustments or checkbox toggling (T-04-03, CALC-06)
- [Phase 04]: Integrated action shortcuts Extend to Earliest Feasible Date and Allocate Available Capacity directly into warning alert banner (D-10, D-12)
- [Phase 04]: Implemented atomic multi-record commit inside Dexie transaction calling upsertAllocation for each selected candidate with merged existing minutes (D-08, D-16)
- [Phase 04]: Guarded FeasibilityModal live queries to only execute when open=true, avoiding background query overhead when closed
- [Phase 04]: Implemented on-demand direct db.tasks queries in PlannerView and TasksView toolbar triggers to guarantee immediate task resolution
- [Phase 05]: Extended AppRoute union with 'dashboard' as primary route
- [Phase 05]: Sanitized hash route date parameter via strict isValidCalendarDate check to prevent tampering (T-05-01)
- [Phase 05]: Whitelisted hash route against AppRoute union defaulting to 'dashboard' (T-05-02)
- [Phase 05]: Capped max forecast horizon at 30 days per threat model T-05-05
- [Phase 05]: Clamped MiniDayCard progress percent between 0 and 100 per threat model T-05-06
- [Phase 06]: Excluded settings and backupMetadata tables from exported backup payload to preserve client preferences and prevent token leaks (D-02, T-06-01)
- [Phase 06]: Formatted backup file name as task-planner-backup-YYYY-MM-DD-HHmmss.json for deterministic sorting and uniqueness (D-03)
- [Phase 06]: Logged export event into backupMetadata table upon each successful export for UI history (D-04)
- [Phase 06]: Implemented centralized AriaLiveRegion event dispatcher for accessible screen reader status feedback (D-15, UX-04)
- [Phase 06]: Restructured SettingsView into two tabs: 'capacity' (Công suất làm việc) and 'data' (Sao lưu & Dữ liệu) (D-16)
- [Phase 06]: Enforced two-stage validation separating structural envelope checks from in-memory referential integrity checks
- [Phase 06]: Automatically captured pre-import snapshot of 6 domain tables into settings.last_pre_import_snapshot before any destructive write
- [Phase 06]: Bound danger confirm button in ImportPreviewModal to exact keyword RESTORE to prevent accidental triggers
- [Phase 06]: Wrap downloadSnapshotFile payload in BackupEnvelope with APP_MARKER, CURRENT_SCHEMA_VERSION, and snapshot timestamp for re-import compatibility
- [Phase 07]: Configured VitePWA with registerType: 'prompt' to prevent unprompted auto-skipWaiting during active writes
- [Phase 07]: Set navigateFallback to /task-management/index.html to prevent 404s on deep hash navigation in GitHub Pages
- [Phase 07]: FormGuardContext tracks active editing sessions across drawers and modals to prevent data loss on reload
- [Phase 07]: Requested storage persistence automatically on boot alongside database seed initialization
- [Phase 07]: Gated StorageManager APIs defensively behind feature detection with empty state fallback for private/legacy browsers
- [Phase 07]: Displayed storage mode, quota progress, and safe advisory alert recommending JSON backups when unpersisted
- [Phase 07]: Surfaced PWA lifecycle status and manual update check trigger in Settings data tab
- [Phase 07]: Wrapped BeforeInstallPromptEvent prompt() in try/catch/finally to unconditionally nullify prompt reference and prevent InvalidStateError on dismissal
- [Phase 07]: Created ServiceWorkerContext provider as singleton at AppShell root to eliminate duplicate SW registrations and timer leaks
- [Phase 07]: Added useRegisterActiveForm hook and wired all 6 editing drawers and modals to prevent data loss on update reload
- [Phase 08]: OWASP-compliant PBKDF2 with 600,000 iterations and HMAC-SHA256 for browser-side AES-GCM-256 key derivation
- [Phase 08]: Strict transient in-memory secret holder with zero writes to IndexedDB, localStorage, sessionStorage, or logs
- [Phase 08]: Repository coordinates (owner, repo, branch) persisted in IndexedDB settings while PAT and passphrase remain in memory
- [Phase 08]: GitHubConfigCard mounted in SettingsView Data tab coexisting cleanly with local backup
- [Phase 08]: Native fetch for GitHub Contents API with Bearer token authentication and token redaction from errors (T-08-05)
- [Phase 08]: Pre-flight GET checks current blob SHA against last_synced_sha before payload assembly and upload (D-06, SYNC-06)
- [Phase 08]: Guarded conflict modal requires exact OVERWRITE keyword to prevent destructive accidental remote overwrites (D-08, T-08-08)
- [Phase 08]: Push orchestrator automatically creates .task-management/backup.enc.json on HTTP 404 without prior SHA (D-09)
- [Phase 08]: Record last_synced_sha and last_synced_at into db.settings and log audit trail to db.backupMetadata (D-17)
- [Phase 08]: Decrypted remote backup must validate structural and referential integrity using Phase 6 validation engine before touching IndexedDB
- [Phase 08]: Passphrase prompt modal activates only when in-memory passphrase is missing or incorrect, allowing seamless one-click pull when already entered
- [Phase 08]: Restoring remote backup executes atomically with pre-import safety snapshot in settings.last_pre_import_snapshot, requiring explicit RESTORE confirmation
- [Phase 08]: Corrupt remote payloads halt restore with zero local database mutation and provide immediate raw un-decrypted file download for offline diagnostics
- [Phase 08]: Local operations, weekly capacity configuration, and local JSON export/import operate 100% autonomously without network access or GitHub credentials
- [Phase ?]: Extended Dexie with SCHEMA_V3 indexing jiraKey for fast search queries while preserving v1/v2 records
- [Phase ?]: Zero npm dependencies for Jira REST v3: native fetch, btoa, and custom minimal ADF serializer
- [Phase ?]: Smart status mapping with word-boundary regex for PR and Review to avoid false matches on progress
- [Phase ?]: Diagnostic feedback in Settings distinguishing success, CORS blockage, and 401/403 credentials failure
- [Phase ?]: Used useLiveQuery to load Jira settings reactively in TaskJiraSection and CreateJiraIssueModal
- [Phase ?]: Enforced exact regex ^[A-Z][A-Z0-9]+-[0-9]+$ on manual Jira key inputs to prevent malformed keys or URL injection
- [Phase 12]: Extended Dexie with non-destructive SCHEMA_V4 indexing reminderDate across projects, milestones, and tasks
- [Phase 12]: Touched parent task updatedAt timestamp inside atomic Dexie transactions during allocation mutations to maintain accurate stale task detection
- [Phase 12]: Rendered NotificationBell in AppShell header with red badge counter capped at 99+ active alerts
- [Phase 12]: Constructed 5-tab responsive slide-out NotificationDrawer (All, Deadline, Overload, Stale, Reminders) without global dismiss button
- [Phase 12]: Permitted quick Done status toggling directly on task notification rows via Checkbox
- [Phase 12]: Integrated direct modal/drawer inspection for tasks, projects, milestones, and date-focused PlannerView navigation on alert clicks
- [Phase 12]: Enforced non-dismissible overdue and overload alerts while allowing single-day dismissal for stale and reminder alerts
- [Phase 12]: Dispatched Web Desktop Notification only on startup, throttled once per browser session via sessionStorage, using aggregated counts without leaking sensitive details
- [Phase 12]: Evaluated proactive alerts in local memory across 5 strict priority tiers: overdue (1), 14-day capacity overload (2), due soon (3), stale tasks (4), and custom reminders (5)
- [Phase 12]: Enforced immutable alert obligations by rejecting dismissals for overdue tasks and capacity overload alerts
- [Phase 12]: Auto-pruned expired dismissal keys on write within settings table to prevent unbounded dictionary growth
- [Phase 12.1]: Dexie schema v5 adds workSessions and activeTimers tables
- [Phase 12.1]: Backup payload schemaVersion upgraded to 3 with backward compatibility for v1/v2
- [Phase 12.1]: Cascade deletions atomically purge work sessions and active timers for tasks, milestones, and projects
- [Phase 12.1]: AppShell embeds ActiveTimerWidget next to NotificationBell with zero-timer auto-hide
- [Phase 12.1]: TaskTable rows feature inline Start, Pause, Resume, and Finish timer buttons
- [Phase 12.1]: TaskDrawer includes dedicated Work Sessions tab with historical table and manual modal
- [Phase 12.1]: Include tick in TimerContext useMemo dependency array so tick increments trigger context consumer re-renders every second without writing tick counts to IndexedDB
- [Phase 12.1]: Use db.tasks.bulkGet(ids) in ActiveTimerWidget to reliably fetch task records by primary key id, filtering out undefined entries
- [Phase 12.1]: Invert TaskTable column header to 'Đã dùng / Ước tính' to match cell format, and evaluate live running timer duration against task estimate with Set ref deduplication to prevent toast alert spam
- [Phase 12.2]: Migrate Dexie schema to Version 6 by cloning v5 table structures and migrating legacy reminderDate/reminderNote into reminders array elements
- [Phase 12.2]: Cap reminders at max 5 items per entity in both Zod validation and dynamic form list
- [Phase 12.2]: Default requireInteraction to true for persistent desktop notification banners until user acknowledgment
- [Phase 12.2]: Provide dedicated Tab 4 'notifications' (Thông báo) in SettingsView separating alerts configuration from data backup
- [Phase 12.2]: Sync browserNotificationsEnabled boolean alongside full NotificationSettings payload for backwards compatibility
- [Phase 12.2]: Run a 30-second interval ticker in useDesktopNotification matching minute-exact reminders for immediate dispatch
- [Phase 12.2]: Initialize visibleColumns state synchronously in TaskTable using planner:task_table_columns with permanent enforcement of name column
- [Phase 12.2]: Support 3-state cycling (ascend -> descend -> reset) on TaskTable column sorters for name, status, priority, estimateMinutes, and deadline
- [Phase 12.2]: Persist desktop Sider collapsed state under planner:sidebar_collapsed while ignoring responsive auto-collapse triggers
- [Phase 12.2]: Standardize desktop notification dispatch via sendDesktopNotification supporting Service Worker showNotification and window.Notification fallback with exactOptionalPropertyTypes compliance
- [Phase 12.2]: Add 10-second interval clock state ticker in useNotifications feeding currentTime and todayDate into evaluateNotifications for reactive reminder triggering without page reloads
- [Phase 12.2]: Deduplicate real-time multi-category alerts (reminders, overdue, overload, timer) via notifiedAlertIdsRef and seed non-reminders on initial startup summary to prevent notification storms
- [Phase 12.2]: Add test notification button and immediate toggle confirmation in NotificationSettingsCard to give users instant visual proof of desktop banner operation
- [Phase 13]: Added analytics route to AppRoute and useHashRoute with milestoneId parameter sanitization
- [Phase 13]: Milestone burndown ideal line slopes from totalScope to 0; actualRemaining clamps at todayStr
- [Phase 13]: Completion velocity calculates completed tasks and hours across 2, 4, 8, 12 week rolling windows
- [Phase 13]: Stakeholder workload aggregates active tasks by Ops Owner, BA, and Work Type honoring tag inheritance
- [Phase 13]: AnalyticsView renders 3 distinct vertical cards for Milestone Burndown, Delivery Velocity, and Stakeholder Workload
- [Phase 13]: Milestone selector prioritizes open milestones with nearest deadline and responds to route param initialMilestoneId
- [Phase 13]: Overall velocity summary card provides dual metric (tasks/week and hours/week) paired with mini trend chart
- [Phase 13]: Stakeholder workload table supports expandable rows to inspect underlying tasks directly in place
- [Phase ?]: Phase 13.2: XML tags <item_context> and Markdown format for task/project/milestone prompt grounding (D-09)
- [Phase 13.2]: Sticky notes content and screenshot captions grounded within 12,000 char budget (D-10, T-13.2-06)
- [Phase 13.2]: Claude Code CLI launcher generates shell-escaped command claude '...' and spawns OS terminal via Tauri or clipboard on Web (D-13, T-13.2-07)
- [Phase 13.2]: Action chips in assistant bubbles for one-click add to task checklist, save to sticky notes, or launch Claude Code (D-18)

### Pending Todos

None yet.

### Blockers/Concerns

None.

### Roadmap Evolution

- Phase 12.1 inserted after Phase 12: Task timer, work session logs, reload persistence, concurrent timers, allocation reminders, spent time views (URGENT)
- Phase 13.1 inserted after Phase 13: Timer pause timestamps; Jira project mapping and live status sync; timer status automation and project subtitles; Tauri external links and built-in Jira proxy; sticky notes attached to tasks, projects, or milestones with searchable screenshot attachments, pop-out mode, pinning, and resizable windows; actual worklog planner; secure GitHub credentials and recurring auto-sync fixes (URGENT)

## Deferred Items

| Category | Item | Status | Deferred At |
|---|---|---|---|
| *(none)* | - | - | - |

## Session Continuity

Last session: 2026-10-03T04:21:50.571Z
Stopped at: Completed 13.2-03-PLAN.md
Resume file: None

## Operator Next Steps

- Execute Phase 13.2 Plan 03 via /gsd-execute-phase 13.2
