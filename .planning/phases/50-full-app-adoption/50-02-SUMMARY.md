---
phase: 50-full-app-adoption
plan: 02
subsystem: ui
tags: [antd, react, theme, context, codemod, inline-style, vitest, adoption]

requires:
  - phase: 50-full-app-adoption
    provides: 50-01 foundation with codemod, ThemeAppHolder, context hooks and manifest-driven guards
provides:
  - 28 task/planner components on UI barrel imports with context-bound message/modal APIs
  - Token-valued inline styles replaced by CSS custom properties in migrated views
  - Additive wrapper extensions for refs, range pickers and single-date signatures
  - wave-02.txt manifest driving static API and inline style guards
affects: [50-full-app-adoption waves 3-9, 50-UAT.md, U1 task quick-add flow]

tech-stack:
  added: []
  patterns:
    - View imports runtime controls from src/components/ui barrel and icons from ui/icon
    - Static message/Modal.confirm calls use useMessage and useTaskMateModal with rendered contextHolder
    - Inline token literals use CSS vars (--font-size-*, --radius-control, --accent, --fg-secondary, --bg-island, --island-gap)
    - Near-token alpha tints use color-mix so CSS vars remain valid

key-files:
  created:
    - tests/fixtures/adoption/wave-02.txt
    - src/components/ui/__tests__/wave02Wrappers.test.tsx
  modified:
    - src/components/tasks/BatchActionBar.tsx
    - src/components/tasks/CreateJiraIssueModal.tsx
    - src/components/tasks/HierarchyBreadcrumb.tsx
    - src/components/tasks/InlineProgress.tsx
    - src/components/tasks/InlineStatusTag.tsx
    - src/components/tasks/LinkedKnowledgeSection.tsx
    - src/components/tasks/ManualWorkSessionModal.tsx
    - src/components/tasks/QuickAddBar.tsx
    - src/components/tasks/TaskChecklistSection.tsx
    - src/components/tasks/TaskDrawer.tsx
    - src/components/tasks/TaskDrawerPlanning.tsx
    - src/components/tasks/TaskFilterBar.tsx
    - src/components/tasks/TaskJiraSection.tsx
    - src/components/tasks/TaskTable.tsx
    - src/components/tasks/WorkSessionsTab.tsx
    - src/components/tasks/WorkTypeBadge.tsx
    - src/components/planner/ActualWorklogPlanner.tsx
    - src/components/planner/AllocationModal.tsx
    - src/components/planner/CandidateAllocationsTable.tsx
    - src/components/planner/CapacitySettingsModal.tsx
    - src/components/planner/DateInspectionBreakdown.tsx
    - src/components/planner/DayColumn.tsx
    - src/components/planner/DayColumnHeader.tsx
    - src/components/planner/DayInsightPanel.tsx
    - src/components/planner/FeasibilityModal.tsx
    - src/components/planner/TaskAllocationCard.tsx
    - src/components/planner/WeekNavigator.tsx
    - src/components/planner/WorkSessionDetailModal.tsx
    - src/components/ui/input.tsx
    - src/components/ui/textarea.tsx
    - src/components/ui/date-picker.tsx

key-decisions:
  - "Migrated every runtime AntD/icon import to the UI barrel; only import type from antd remains in the 28 views"
  - "Static message/Modal.confirm call arguments and Vietnamese copy are byte-for-byte unchanged; only receiver is now a context instance"
  - "Wrapper gaps (InputRef forwarding, TextAreaRef forwarding, single-date DatePicker and tuple DateRangePicker signatures) were filled additively in src/components/ui with focused tests"
  - "Token normalization changed fontSize 11/12 to --font-size-xs/--font-size-small, radius 6/8 to --radius-control, accent hexes to --accent, gray to --fg-secondary, white to --bg-island and gap 6 to --island-gap"
  - "Accent-tinted 15-hex backgrounds became color-mix(in srgb, var(--accent) 9%, transparent) because appending 15 to a var() is invalid CSS"

patterns-established:
  - "Wave manifests select exactly which views static API and inline style guards scan"
  - "Wrapper prop gaps are solved inside wrapper files, never by runtime AntD imports in a view"

requirements-completed: [ADOPT-01, ADOPT-02]

duration: 72min
completed: 2026-11-21
---

# Phase 50 Plan 02: Full App Adoption — Tasks and Planner Summary

**28 task/planner components now use the TaskMate wrapper barrel and context APIs, with token-valued inline styles replaced by CSS vars and manifest-driven guards green**

## Performance

- **Duration:** 72 min
- **Started:** 2026-11-21T12:48:35Z
- **Completed:** 2026-11-21T20:01:00Z
- **Tasks:** 2/2
- **Files modified:** 33

## Accomplishments
- All 28 task/planner views import runtime controls only from `src/components/ui` and icons from `src/components/ui/icon`; no `theme.useToken()` remains in this surface.
- All static `message.*` calls and the single `Modal.confirm` call are now context-bound via `useMessage()` / `useTaskMateModal()`; `TaskTable` renders `{contextHolder}`.
- Inline token literals across the wave are replaced by the one source of CSS variables; near-token values normalized per D-09.
- Additive wrapper extensions keep existing view call signatures compiling without runtime AntD imports, backed by a focused wrapper test.
- `wave-02.txt` registers the 28 migrated paths so static API and inline style guards enforce this wave.

## Task Commits

1. **Task 1: Codemod import + static API to hook cho 28 files** — `25544f29` (feat)
2. **Task 2: Dọn inline token-valued + manifest wave-02** — `88d03c3d` (test)

**Plan metadata commit:** pending — orchestrator owns final metadata commit after the wave.

## Files Created/Modified
- `tests/fixtures/adoption/wave-02.txt` — 28 migrated source paths
- `src/components/ui/__tests__/wave02Wrappers.test.tsx` — focused tests for wrapper extensions
- `src/components/ui/input.tsx`, `textarea.tsx`, `date-picker.tsx` — additive ref/signature support
- 28 files under `src/components/tasks/` and `src/components/planner/` — barrel imports, context hooks, CSS vars

## Decisions Made
- AntD runtime imports removed from views; only `import type` remains.
- Static API copy and argument objects, including `QuickAddBar` message options, kept byte-for-byte.
- Dynamic inline values (widths, transforms, computed positions) left untouched per D-08.
- `color-mix` used where an alpha suffix used to follow a hardcoded hex, since hex-to-var substitution would otherwise produce invalid CSS.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Wrapper prop gaps blocked migration**
- **Found during:** Task 1 type check
- **Issue:** Input/Textarea refs and single-date/tuple date-picker signatures were not accepted by wrappers, so migrated views failed `tsc`.
- **Fix:** Extended `Input`, `Textarea`, and `DatePicker` wrappers additively; added `wave02Wrappers.test.tsx`.
- **Files modified:** `src/components/ui/input.tsx`, `textarea.tsx`, `date-picker.tsx`, `__tests__/wave02Wrappers.test.tsx`
- **Commit:** `25544f29`

**2. [Rule 1 - Bug] CSS var alpha concatenation**
- **Found during:** Task 2 review
- **Issue:** Replacing `#1677ff15` with `var(--accent)15` yields invalid CSS.
- **Fix:** Rewrote tinted backgrounds as `color-mix(in srgb, var(--accent) 9%, transparent)`.
- **Files modified:** `src/components/tasks/TaskTable.tsx`
- **Commit:** `88d03c3d`

**3. [Rule 1 - Bug] Static import conversion script inserted hook calls into destructured parameters**
- **Found during:** Task 1 type check
- **Issue:** First conversion pass placed `useMessage()` inside component parameter destructuring, producing syntax errors.
- **Fix:** Moved hook calls into component bodies before the first state hook; verified all 15 affected components compile.
- **Files modified:** migrated task/planner views
- **Commit:** `25544f29`

**Total deviations:** 3 auto-fixed (1 Rule 3, 2 Rule 1). No scope creep.

## Issues Encountered
- None beyond deviations above; all final gates pass.

## User Setup Required
None.

## Next Phase Readiness
Wave 2 guard manifests are active. The U1 task quick-add flow is ready for Chrome light/dark UAT; later waves can add their own manifests and continue codemod-driven migration.

## Self-Check: PASSED

- Verified `25544f29` and `88d03c3d` in git history.
- Verified `wave-02.txt` has exactly 28 non-empty lines.
- Final gates: `npx tsc --noEmit`, `npm run lint`, `npx eslint src/components/tasks src/components/planner`, `npm run test:foundation` (14 files / 83 tests), static API guard, inline style sweep — all green.
- Working tree clean after both task commits.

## Self-Check: PASSED

- SUMMARY file exists on disk (8289 bytes).
- Both task commits verified in git history.

---
*Phase: 50-full-app-adoption*
*Completed: 2026-11-21*
