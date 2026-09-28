---
phase: 11-jira-cloud-integration-task-lifecycle
plan: 03
subsystem: jira-integration
tags: [jira, filter, search, standup, table, planner, badge]
dependency_graph:
  requires: [11-02]
  provides: [jira-search-filter, jira-table-tags, jira-planner-badges, jira-standup-export]
  affects: [TaskTable, TaskAllocationCard, TaskFilterBar, filterTasks, formatStandupSummary]
tech_stack:
  added: []
  patterns: [case-insensitive Jira key search, tri-state Jira filter, stopPropagation external link navigation, micro-badge rendering in grid card, formatted markdown export]
key_files:
  created:
    - tests/components/planner/TaskAllocationCardJira.test.tsx
  modified:
    - src/utils/filter.ts
    - src/components/tasks/TaskFilterBar.tsx
    - src/utils/standup.ts
    - src/services/jira/jiraApi.ts
    - src/components/tasks/TaskTable.tsx
    - src/components/planner/TaskAllocationCard.tsx
    - tests/utils/filter.test.ts
    - tests/utils/standup.test.ts
    - tests/components/TaskTable.test.tsx
decisions:
  - "Sanitized Jira browse URLs using getJiraBrowseUrl with protocol/trailing-slash trimming and URI encoding"
  - "Used stopPropagation on Jira key tags in TaskTable and TaskAllocationCard to prevent accidental drawer opening during navigation"
  - "Appended [JiraKey] immediately following [WorkType] in formatStandupSummary preserving existing format when unlinked"
metrics:
  duration: 10m
  completed_date: "2026-09-28"
---

# Phase 11 Plan 03: Jira Views, Search, Table Badges & Standup Integration Summary

Exposed Jira Cloud integration across views, filters, and reports: added case-insensitive Jira Key keyword search and Jira status filtering (`all` | `linked` | `unlinked`) to `TaskFilterBar` and `filterTasks`, rendered clickable Jira Key tags with `stopPropagation` in `TaskTable` and micro-badges in `TaskAllocationCard` on `/planner`, and updated `formatStandupSummary` to include `[JiraKey]` in daily clipboard standup exports.

## Completed Tasks

| Task | Name | Commit | Files |
| --- | --- | --- | --- |
| 1 | Filter state extension (Jira status filter and keyword search across jiraKey) and Standup export formatting | `91ac436` (test), `dcb8cbd` (feat) | `src/utils/filter.ts`, `src/components/tasks/TaskFilterBar.tsx`, `src/utils/standup.ts`, `tests/utils/filter.test.ts`, `tests/utils/standup.test.ts` |
| 2 | Jira Key badge rendering in TaskTable and TaskAllocationCard with direct web navigation | `411f0dd` | `src/services/jira/jiraApi.ts`, `src/components/tasks/TaskTable.tsx`, `src/components/planner/TaskAllocationCard.tsx`, `tests/components/TaskTable.test.tsx`, `tests/components/planner/TaskAllocationCardJira.test.tsx` |

## Key Decisions Made

- **Jira browse URL sanitization helper**: Created centralized `getJiraBrowseUrl` in `src/services/jira/jiraApi.ts` stripping protocol and trailing slashes, appending `.atlassian.net` if bare subdomain, and URI-encoding issue keys.
- **Event propagation isolation**: Applied `e.stopPropagation()` on both `TaskTable` tags and `TaskAllocationCard` micro-badges so clicking the Jira key directly opens Jira web in a new tab without inadvertently opening `TaskDrawer` or edit popovers.
- **Standup export formatting**: Positioned `[JiraKey]` immediately after `[WorkType]` (e.g. `- [Lập trình][SHB-1234] Tên Task...`), cleanly falling back to `- [Lập trình] Tên Task...` when unlinked, preserving Phase 10 reporting compatibility.

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- All created files exist on disk (`tests/components/planner/TaskAllocationCardJira.test.tsx`).
- All task commits verified in git log (`91ac436`, `dcb8cbd`, `411f0dd`).
- Full project test suite passed: 499 tests across 79 test files green.
- Production build (`npm run build`) completed successfully with zero TypeScript or bundler errors.
