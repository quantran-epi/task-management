---
phase: 52-cr-milestones-t-ng-m-c-tri-n-khai-gi-a-cr-v-task-milestoneid
plan: 04
subsystem: ui
tags: [react, antd-wrappers, dexie, cr-milestones, task-table, task-drawer, vitest]

requires:
  - phase: 52 plan 01
    provides: "Dexie V31 crMilestones store, crMilestoneRepo CRUD and cascade unlink verbs"
  - phase: 52 plan 02
    provides: "NoteEntityType crMilestone and EntityNotesSection-compatible note surfaces"
provides:
  - "CR Detail 'Mốc triển khai' block with inline CRUD, per-milestone notes and grouped task column"
  - "Global TaskTable always-visible Mốc column resilient to stale localStorage config"
  - "TaskDrawer milestone Select scoped to current CR with safe stale-value fallback"
affects:
  - "Phase 52-05 browser light/dark verification"
  - "Any future UI touching ChangeRequestDetailView, TaskTable or TaskDrawer"

tech-stack:
  added: []
  patterns:
    - "All AntD controls via src/components/ui wrappers; icons via src/components/ui/icon"
    - "Milestone ownership scoped by CR in UI and enforced again by taskRepo"
    - "Legacy localStorage column config augmented with ALWAYS_VISIBLE_COLUMNS instead of migrated"
    - "Group headers use AntD Table rowSpan inside one dataSource; no second table"

key-files:
  created:
    - src/components/tasks/__tests__/TaskDrawer.test.tsx
  modified:
    - src/views/ChangeRequestDetailView.tsx
    - src/components/tasks/TaskDrawer.tsx
    - src/components/tasks/TaskTable.tsx
    - tests/views/ChangeRequestDetailView.test.tsx
    - tests/components/tasks/TaskTable.test.tsx

key-decisions:
  - "Milestone section inserted after Ghi chú in secondaryBlocks; existing link/reminder code and Command Deck layout untouched"
  - "Task rows grouped by milestone with rowSpan; unassigned group always last after rank sort"
  - "Stale or cross-CR milestoneId prefills as '' and repository remains final invariant guard"
  - "Existing pre-existing test failures left untouched and recorded rather than silently patched"

requirements-completed: []

duration: ~25min
completed: 2026-11-28
---

# Phase 52 Plan 04: CR Milestone UI Summary

**Inline CR milestone CRUD with per-milestone notes, grouped task column, global Mốc column and CR-scoped TaskDrawer Select**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-11-28T10:55:00+07:00
- **Completed:** 2026-11-28
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- CR Detail gained `cr-detail-milestones` block: empty state, inline create/edit with required-name validation, Popconfirm cascade delete, note counts and `EntityNotesSection` only for selected milestone
- CR Detail task table groups by milestone using one Table with `rowSpan`; `Chưa gán mốc` group sorts last and keeps search/status filters intact
- Global TaskTable shows fixed always-visible `Mốc` column after `CR`, resolving names through one live query and falling back to `Chưa gán mốc`
- TaskDrawer prefill, CR-change clearing, unassigned option, empty-CR hint and safe dangling-id fallback all pass focused tests
- Wrapper-only imports, CSS-var-only styling, tsc, lint and production build all clean

## Task Commits

1. **Task 1: Section 'Mốc triển khai' trong CR Detail (D-05, D-09, D-10)** - `24144550` (feat)
2. **Task 2: Cột 'Mốc' trong TaskTable toàn cục (D-09)** - `615233a6` (feat)
3. **Task 3: Select 'Mốc' trong TaskDrawer (D-02, D-03, D-09)** - `1d34cb6c` (feat)

**Plan metadata:** pending final SUMMARY-only commit (STATE/ROADMAP intentionally untouched per orchestrator scope)

## Files Created/Modified
- `src/views/ChangeRequestDetailView.tsx` - milestone section, inline CRUD, notes mount, grouped task column
- `src/components/tasks/TaskTable.tsx` - always-visible Mốc column with legacy config fallback
- `src/components/tasks/TaskDrawer.tsx` - CR-scoped milestone Select and save plumbing
- `tests/views/ChangeRequestDetailView.test.tsx` - column order, block order and milestone CRUD/grouping tests
- `tests/components/tasks/TaskTable.test.tsx` - column order, display and stale-config tests
- `src/components/tasks/__tests__/TaskDrawer.test.tsx` - new prefill/clear/save/fallback/hint tests

## Decisions Made
- Kept the approved Command Deck layout and all link/reminder code unchanged; milestone block added as a new secondary block after notes
- Used `rowSpan` group headers inside the existing filtered task Table rather than introducing a second table
- Used `''` sentinel for unassigned milestone in the form and mapped to `undefined` on submit to satisfy `exactOptionalPropertyTypes`
- Verified suspicious baseline failures against pristine HEAD before treating them as pre-existing

## Deviations from Plan

None - plan tasks executed as written. Test assertions differed from suggested helper details only where the existing wrapper DOM required stable selectors.

## Issues Encountered
- **Pre-existing failures confirmed on clean HEAD** (not caused by this plan): in `tests/views/ChangeRequestDetailView.test.tsx`, `shows all three secondary blocks expanded...` fails at `getByRole('button', { name: /Spec/ })`; three `cr-detail-task-search` filter cases fail because the wrapper input is not found; three link-editor cases fail at `cr-detail-link-url`. In `tests/components/tasks/TaskTable.test.tsx`, `renders default columns and task rows` fails with duplicate `Tác vụ` columnheader. Baseline verification used pristine copies of source and test files and produced the same failures before this plan's changes.
- `tests/components/TaskDrawerAndQuickAdd.test.tsx` QuickAdd workType case also fails identically on pristine TaskDrawer; out of scope.
- `columns.render` returning cell props emits an AntD deprecation warning; the plan explicitly requires `rowSpan` through the render path, so no deprecated API migration was made.

## User Setup Required
None.

## Known Stubs
None. All three surfaces read and write real Dexie data.

## Threat Flags
None. New surfaces are covered by the plan's T-52-10/T-52-11/T-52-12 register: inline name validation delegates to `CrMilestoneInputSchema`, Select options are CR-scoped with repo invariant as final guard, and notes mount with the selected milestone's exact id.

## Next Phase Readiness
Phase 52-05 can perform Chrome light/dark verification of the three milestone surfaces. Focused plan paths report 36 passed / 8 pre-existing failures; `npx tsc --noEmit`, `npm run lint` and `npm run build` all exit 0. Full Vitest suite intentionally not run.

## Pre-existing Test Failures
Recorded above; do not attribute to 52-04. Do not patch them inside this plan.

## Self-Check: PASSED

- All six declared source/test files and SUMMARY.md exist on disk
- Task commits `24144550`, `615233a6`, `1d34cb6c` present in git history
- Focused tests: 4 files, 36 passed, 8 baseline-identical failures; `tsc`, `lint`, `build` clean
- No direct `antd`/`@ant-design/icons` imports added
- `ItemInsightView.tsx` and its tests unchanged; `.planning/STATE.md`, ROADMAP and unrelated uncommitted files untouched

---
*Phase: 52-cr-milestones-t-ng-m-c-tri-n-khai-gi-a-cr-v-task-milestoneid*
*Completed: 2026-11-28*
