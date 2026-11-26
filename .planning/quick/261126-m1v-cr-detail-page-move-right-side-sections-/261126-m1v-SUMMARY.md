---
phase: quick
plan: 261126-m1v
subsystem: ui
tags: [cr-detail, task-table, filtering, layout]
requires: []
provides:
  - "CR detail task table full width with four secondary cards stacked beneath"
  - "In-memory task filter by diacritic-folded name and status, with filter-only empty state"
affects: [ChangeRequestDetailView]
tech-stack:
  added: []
  patterns:
    - "searchIncludes from src/utils/searchText.ts for Vietnamese fold"
    - "UI wrappers InputSearch/Select from src/components/ui"
key-files:
  created: []
  modified:
    - src/views/ChangeRequestDetailView.tsx
    - tests/views/ChangeRequestDetailView.test.tsx
decisions:
  - "Filtered table source only: stats strip and all secondary blocks still use the full task array"
  - "Filter controls mounted only when tasks exist; empty CR keeps its original empty state"
  - "Status options derive from TASK_STATUS_LABEL plus ALL sentinel"
metrics:
  duration: 5min
  completed: 2026-11-26
  tasks: 2
  commits: 2
  actuals:
    tokens: 3400
    tasks: 2
    commits: 2
status: complete
---

# Quick 261126-m1v: CR detail full-width task table and in-page task filter Summary

CR detail task table takes full content width; Ghi chú/Jira/Tài liệu/Nhắc nhở stack beneath in order. Tasks filter in-memory by name (diacritic-folded) and status with a dedicated no-match empty state; stats strip stays based on all tasks.

## Key Decisions

- `filteredTasks = useMemo(...)` runs over the already-loaded `tasks` array with `searchIncludes`; no new IndexedDB query, no schema change.
- Table uses `filteredTasks`; stats strip, delete confirm copy, and all four secondary blocks still use the original `tasks` array so filtering cannot change counts.
- Status Select options are `Tất cả` plus every `TASK_STATUS_LABEL` label keyed by its raw `TaskStatus` value.
- Filter toolbar renders only when `tasks.length > 0`; empty CR keeps `CR này chưa có tác vụ nào`.

## Deviations from Plan

None — plan executed as written. Test used `querySelector('input')` inside `cr-detail-task-search` because AntD attaches the testid to the wrapper root; plan wording (`fireEvent.change` on the testid) was adapted without changing behavior.

## Verification

- `npx vitest run tests/views/ChangeRequestDetailView.test.tsx src/views/__tests__/ChangeRequestDetailView.subsystemOptions.test.tsx --bail=1` — 21 tests passed.
- `npx tsc --noEmit` — clean.
- `git diff HEAD~2..HEAD --name-only` — only the two allowed files.
- No `gridTemplateColumns` remains in the view; `searchIncludes`, `cr-detail-task-search`, `subsystem-cell-`, `cr-detail-stats`, `cr-detail-block-` all present.
- Full suite not run (project rule: over an hour).

## Self-Check: PASSED

- `src/views/ChangeRequestDetailView.tsx` and `tests/views/ChangeRequestDetailView.test.tsx` exist and are committed in `1c3537e8`, `26654b09`.
