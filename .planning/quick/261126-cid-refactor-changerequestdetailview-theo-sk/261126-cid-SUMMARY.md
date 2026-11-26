---
phase: quick
plan: 261126-cid
subsystem: ui
tags: [react, antd, typescript, task-detail, task-list, sticky-toolbar, regression-tests]

requires: []
provides:
  - "CR Detail: compact header with Jira/updated meta, stats strip from loaded data, two-column grid with task table and always-visible secondary cards"
  - "Task list: sticky filter bar, offset sticky table header, compact floating batch bar with wrapping actions"
affects: [ChangeRequestDetailView, TasksView, TaskTable, TaskFilterBar, BatchActionBar]

actuals:
  tokens: 5777
  tasks: 2
  commits: 2
  plan_head_before: d38b7072c98801c54ff347bfdd3c55170ee1abd3
  plan_head_after: b60e334ca57b30ff378f93bf0f375f5a3ea2c8fb

tech-stack:
  added: []
  patterns:
    - "Derive CR stats with useMemo from existing useLiveQuery data; zero new IndexedDB queries"
    - "Single sticky layer: filter bar pins at top:50; table header uses measured offsetHeader via ResizeObserver"

key-files:
  created:
    - .planning/quick/261126-cid-refactor-changerequestdetailview-theo-sk/261126-cid-SUMMARY.md
  modified:
    - src/views/ChangeRequestDetailView.tsx
    - tests/views/ChangeRequestDetailView.test.tsx
    - src/components/tasks/TaskFilterBar.tsx
    - src/components/tasks/TaskTable.tsx
    - src/components/tasks/BatchActionBar.tsx
    - tests/components/TaskTable.test.tsx

key-decisions:
  - "Kept all 5 CR task columns, subsystem options and data-testid values unchanged; kept TaskTable columns/test IDs unchanged"
  - "CR secondary blocks render expanded in a 2-column grid; notes count now matches EntityNotesSection (includes diagram notes)"
  - "Removed only the overlapping internal TaskTable toolbar sticky layer; AntD table header stays sticky with measured offset below the pinned filter bar"
  - "Batch bar keeps all handlers, Popconfirm and transaction calls; only style and label text buttons changed"
  - "No new dependency, no Dexie schema change, no PWA/GitHub Pages work, no full test suite"

patterns-established:
  - "CR stats derive from already-loaded useLiveQuery data, never a new db.* query"

requirements-completed: [CR-DETAIL-SKETCH-009-A, TASK-LIST-SKETCH-010-A, REVIEW-CLEAN]

duration: ~50min
completed: 2026-11-26
status: complete
---

# Quick 261126-cid: CR Detail + Task List Refactor Summary

**CR Detail now scans as a compact header plus stats strip and always-visible two-column cards; Tasks list pins its filter bar and header while the batch bar floats compact at bottom**

## Performance

- **Duration:** ~50 min
- **Started:** 2026-11-26T09:10:00Z
- **Completed:** 2026-11-26T10:05:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- CR Detail compact header with Jira Epic / updated-at meta and a `cr-detail-stats` strip computed from existing `tasks`, `crNotesCount`, `cr.documentLinks`, `cr.reminders` — no new Dexie query.
- CR task table keeps exactly Task / Subsystem / Status / Ước lượng / Hạn, subsystem options limited to `cr.targets`, all `data-testid` values intact.
- Ghi chú / Jira / Tài liệu / Nhắc nhở render as four always-visible cards with count badges; note filtering excludes task notes and deleted notes; document links keep `target="_blank" rel="noreferrer"`.
- TaskFilterBar pins at `top: 0` with an opaque elevated token background; table header pins below it via a `ResizeObserver`-measured `offsetHeader`.
- Batch bar stays fixed/compact at bottom, wraps actions on narrow windows, renders only when rows are selected, keeps all handlers and Popconfirm.
- All targeted tests and typecheck green; two rounds of code review run, critical/warning findings in changed files fixed.

## Task Commits

Each task was committed atomically:

1. **Task 1: CR Detail header nén + stats strip + khối phụ hiện thẳng** - `80f49e10` (feat)
2. **Task 2: Sticky toolbar/header + batch bar compact + quality gates** - `b60e334c` (feat)

## Files Created/Modified

- `src/views/ChangeRequestDetailView.tsx` - compact header, stats strip, 2-column grid, expanded secondary cards
- `tests/views/ChangeRequestDetailView.test.tsx` - regressions for expanded blocks, stats, header meta, note filtering
- `src/components/tasks/TaskFilterBar.tsx` - sticky root with opaque token background and stable testid
- `src/components/tasks/TaskTable.tsx` - sticky table header with measured offset; textarea rows honored
- `src/components/tasks/BatchActionBar.tsx` - compact wrapping fixed bar, danger delete preserved
- `tests/components/TaskTable.test.tsx` - sticky bar, batch labels/visibility, confirm dialog, doc-link options

## Decisions Made

- Stats `MỞ / PENDING` counts all unfinished non-Done/non-Cancelled tasks, per plan behavior.
- Note count in stats now matches the notes body (includes diagram notes) to avoid badge/body disagreement.
- Reminder count uses `Math.max(reminders.length, reminderDate ? 1 : 0)` so legacy `reminderDate` is not lost behind an empty array.
- Filter bar z-index raised to 50 so it stays above AntD's sticky header; table header offset measured from the bar height instead of hardcoded.
- Kept `CR_TYPE_LABEL.NEW_FEATURE.color = var(--accent)` because an existing test pins that literal and it predates this plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stale TaskTable assertions**
- **Found during:** Task 2 verification
- **Issue:** Three pre-existing assertions did not match current source: old `#1677ff` CR tag color vs `var(--accent)`; `vi.spyOn(Modal, 'confirm')` vs hook-based `useTaskMateModal`; `openDocumentLink` called with one arg vs options object.
- **Fix:** Updated assertions to match current behavior, scoped confirm checks to the rendered dialog, and pinned options shape.
- **Files modified:** `tests/components/TaskTable.test.tsx`
- **Verification:** All 5 targeted test files pass (42 tests).
- **Committed in:** `b60e334c`

**2. [Rule 1 - Bug] Sticky layers overlapped**
- **Found during:** Task 2 code review
- **Issue:** Filter bar, internal toolbar and AntD table header all pinned near `top: 0`.
- **Fix:** Removed internal toolbar sticky, gave the AntD header a `ResizeObserver`-measured offset, raised filter bar z-index to 50.
- **Files modified:** `src/components/tasks/TaskFilterBar.tsx`, `src/components/tasks/TaskTable.tsx`
- **Verification:** Typecheck + targeted tests pass after change.
- **Committed in:** `b60e334c`

**3. [Rule 2 - Missing Critical] Stats/body inconsistency**
- **Found during:** Task 2 code review
- **Issue:** Note count excluded diagram notes while the notes block included them; reminder count dropped legacy `reminderDate` when `reminders: []`.
- **Fix:** Removed the `type !== 'diagram'` filter from `crNotesCount`; reminder count uses `Math.max(...)`.
- **Files modified:** `src/views/ChangeRequestDetailView.tsx`
- **Verification:** Targeted CR detail tests pass, typecheck clean.
- **Committed in:** `b60e334c`

**4. [Rule 1 - Bug] Textarea rows ignored**
- **Found during:** Task 2 code review
- **Issue:** `Textarea` wrapper injects `autoSize` with `maxRows: 5`, overriding `rows={10}` in the standup fallback modal.
- **Fix:** Pass `autoSize={false}` explicitly.
- **Files modified:** `src/components/tasks/TaskTable.tsx`
- **Verification:** Targeted tests pass.
- **Committed in:** `b60e334c`

---

**Total deviations:** 4 auto-fixed (4 Rule 1/2)
**Impact on plan:** All fixes inside the 6 plan files. No scope creep into unrelated files; unrelated working-tree changes from parallel work were not staged.

## Issues Encountered

- Two unrelated AI component changes (`src/components/ai/AISettingsDrawer.tsx`, `src/components/ai/ChatHeader.tsx`) were present in the working tree from a parallel quick task; they were deliberately excluded from both task commits.
- `code-review` flagged findings in AI/Oracle/MCP files outside this plan's scope; ignored per plan's "fix only findings belonging to the 6 files" instruction.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Refactor complete on `pre-v1.6-baseline`. Both task commits are in place; docs artifacts are intentionally left uncommitted for orchestrator handling.

## Self-Check: PASSED

- All 6 plan files plus SUMMARY.md exist on disk.
- Both task commits (`80f49e10`, `b60e334c`) verified in git history.
- Final verification: 5 targeted Vitest files, 42 tests pass; `npx tsc --noEmit` exit 0.

---
*Phase: quick*
*Completed: 2026-11-26*
