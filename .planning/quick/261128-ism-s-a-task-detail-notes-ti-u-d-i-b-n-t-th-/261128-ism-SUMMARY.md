---
phase: 261128-ism
plan: 01
subsystem: ui
tags: [item-insight, notes, antd, flexbox, regression-test, chrome-verification]
requires: []
provides:
  - "Task detail Notes card wraps a 120-character note title fully at 1280/768/375 in light and dark"
  - "Regression test asserting full title text, wrap style contract, header wrap, and enabled add button"
affects: [ItemInsightView, task-detail-notes]
tech-stack:
  added: []
  patterns: ["Card styles prop for local header/title layout", "span with min-width:0 + overflow-wrap:anywhere inside ListItem.Meta"]
key-files:
  created:
    - ".planning/quick/261128-ism-s-a-task-detail-notes-ti-u-d-i-b-n-t-th-/ism-chrome-verify.mjs"
    - ".planning/quick/261128-ism-s-a-task-detail-notes-ti-u-d-i-b-n-t-th-/ism-note-375-light.png"
    - ".planning/quick/261128-ism-s-a-task-detail-notes-ti-u-d-i-b-n-t-th-/ism-note-375-dark.png"
  modified:
    - "src/views/ItemInsightView.tsx"
    - "tests/views/ItemInsightView.test.tsx"
key-decisions:
  - "Fix confined to task branch of ItemInsightView; CR/system Notes card and shared components untouched"
  - "AntD Card head/title ellipsis reset with whiteSpace:normal + textOverflow:clip so narrow columns wrap instead of truncate"
  - "No new dependencies, CSS files, schema changes, or token changes"
requirements-completed: []
duration: 25min
completed: 2026-11-28
---

# Quick 261128-ism: Task Insight Note Title Wrap Summary

**Task-detail Notes card now wraps 120-character note titles and header text without overlap, verified in real Chrome at 1280/768/375 in light and dark.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-11-28T06:39:11Z
- **Completed:** 2026-11-28T07:05:00Z
- **Tasks:** 2/2
- **Files modified:** 2 source/test files; 3 verification artifacts

## Accomplishments

- Added `styles={{ header: { flexWrap: 'wrap', gap: 'var(--gap-8)' }, title: { minWidth: 0, overflowWrap: 'anywhere', whiteSpace: 'normal', textOverflow: 'clip' } }}` to task Notes Card.
- Wrapped note title in `<span data-testid="insight-note-title" style={{ display: 'block', minWidth: 0, overflowWrap: 'anywhere' }}>`.
- Added `alignItems: 'flex-start'` to ListItem; preserved Xem/Sửa actions, add-note handler, labels, and all old tests.
- Added regression test with exactly 120-character note title created via `createNote` and `NOTE_TITLE_MAX_LENGTH`.
- Verified via real Chrome that full title remains in DOM, wraps to multiple lines, has no ellipsis/overflow, header does not overlap button, and the button opens NoteEditor at all 6 mode/width combinations.

## Task Commits

1. **Task 1: Layout fix + regression test** - `95ffef2a` (`fix(261128-ism): wrap long note titles in task insight Notes card`)
2. **Task 2: Chrome light/dark verification** - included in `95ffef2a` (verification artifacts kept uncommitted per instruction)

**Plan metadata:** not committed (instruction: do not commit SUMMARY/PLAN/STATE artifacts)

## Files Created/Modified

- `src/views/ItemInsightView.tsx` - task-detail Notes card wrap contract.
- `tests/views/ItemInsightView.test.tsx` - 120-char note title regression and style assertions.
- `.planning/quick/261128-ism-s-a-task-detail-notes-ti-u-d-i-b-n-t-th-/ism-chrome-verify.mjs` - executable Chrome verification harness.
- `.planning/quick/261128-ism-s-a-task-detail-notes-ti-u-d-i-b-n-t-th-/ism-note-375-light.png` - 375px light screenshot.
- `.planning/quick/261128-ism-s-a-task-detail-notes-ti-u-d-i-b-n-t-th-/ism-note-375-dark.png` - 375px dark screenshot.

## Decisions Made

- Kept the fix inside `ItemInsightView.tsx` task branch; CR/system Notes section and shared notes components were not touched.
- Reset AntD's built-in `text-overflow: ellipsis` on the Card title rather than adding a global CSS override.
- Used one atomic code commit as requested despite the plan's TDD task tag; RED was run and observed failing before implementation, GREEN passed after.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] AntD Card head title still ellipsized at narrow widths**
- **Found during:** Task 2 (Chrome verification)
- **Issue:** Initial `minWidth:0` + `overflowWrap:anywhere` was not enough because AntD `.ant-card-head-title` sets `whiteSpace:nowrap` and `textOverflow:ellipsis`; browser geometry showed header overflow at all 6 combinations.
- **Fix:** Added `whiteSpace:'normal'` and `textOverflow:'clip'` to `styles.title` and asserted them in the regression test.
- **Files modified:** `src/views/ItemInsightView.tsx`, `tests/views/ItemInsightView.test.tsx`
- **Verification:** Chrome re-run: 6/6 pass, `headTitleOverflows:false`, no overlap, editor opens.
- **Committed in:** `95ffef2a`

**2. [Rule 1 - Bug] Browser harness seeded fixture before Dexie live queries settled**
- **Found during:** Task 2 (Chrome verification setup)
- **Issue:** Raw IndexedDB writes were not observed by mounted Dexie live queries; insight tab showed "not found".
- **Fix:** Reloaded after seeding and opened the insight via the app's own deeplink event.
- **Files modified:** verification harness only (artifact directory)
- **Verification:** Full title rendered in real Chrome; screenshots captured.
- **Committed in:** artifact only, not committed per instruction.

---

**Total deviations:** 2 auto-fixed (2 bugs). **Impact:** Both confined to this quick task; no scope creep into sibling sessions.

## Issues Encountered

- Scoped test showed one pre-existing flaky command-deck assertion on two consecutive runs; three repeated final runs all passed (11/11). No change made to that legacy test.
- Chrome console contained only pre-existing AntD deprecation warnings and React duplicate-key warnings unrelated to this diff; no runtime errors from the changes.

## User Setup Required

None.

## Next Phase Readiness

Ready. Task-detail note titles wrap correctly across supported breakpoints; no known blockers.

---
*Phase: 261128-ism*
*Completed: 2026-11-28*
