---
phase: 52-cr-milestones-t-ng-m-c-tri-n-khai-gi-a-cr-v-task-milestoneid
plan: 02
subsystem: ui
tags: [notes, cr-milestones, antd-wrappers, dexie, ai-tools, zod, vitest]

requires:
  - phase: 52 plan 01
    provides: "Dexie V31 crMilestones store, crMilestoneRepo CRUD verbs and cascade unlink"
provides:
  - "Note entityType crMilestone accepted by Zod/TS and round-tripped through noteRepo"
  - "Five note UI surfaces with milestone pickers, filters and entity labels"
  - "AI note query/read/write enums and milestone name resolution; reminder/knowledge-link enums unchanged"
affects:
  - "Phase 52 remaining plans (CR Detail milestone notes section, Notes views)"
  - "AI tool allowlists and note surfaces in later milestones"

tech-stack:
  added: []
  patterns:
    - "Milestones are a Note entityType, not a new note type or field"
    - "All Ant Design controls come from src/components/ui wrappers (GUARD-01)"
    - "AI note enums widen deliberately; reminder and knowledge-link enums stay ['task','cr','system'] (D-06)"

key-files:
  created: []
  modified:
    - src/types/models.ts
    - src/validation/schemas.ts
    - src/db/repositories/__tests__/noteRepo.test.ts
    - src/components/notes/NoteEditor.tsx
    - src/components/notes/QuickNotesPanel.tsx
    - src/components/notes/DocListPane.tsx
    - src/components/notes/NoteDetailModal.tsx
    - src/views/NotesPopoutView.tsx
    - src/services/ai/aiTools.ts
    - src/workbench/__tests__/QuickNotesPanel.test.tsx

key-decisions:
  - "crMilestone is simply a fourth NoteEntityType value — no MilestoneNote type or text field on milestone"
  - "QuickNotesPanel uses a 'Mốc' segmented option but the full 'Mốc triển khai (CR Milestone)' label in NoteEditor"
  - "AI get_item_insight gained a read-only crMilestone branch so the widened enum cannot advertise an always-erroring option"
  - "manage_reminders and knowledge-link enums were not widened (D-06); no chat scope added"

patterns-established:
  - "Every note surface resolving entity names loads db.crMilestones alongside CR/task/system tables"
  - "Focused Vitest with fake-indexeddb and seeded milestones verifies note entity round-trip and picker behavior"

requirements-completed: []

duration: ~12min
completed: 2026-11-28
---

# Phase 52 Plan 02: CR Milestone Notes Summary

**Notes bind to CR milestones via the existing entityType/entityId pair across five UI surfaces and AI note tools, without introducing a new note type**

## Performance

- **Duration:** ~12 min (resumed execution; Task 1 committed previously)
- **Started:** 2026-11-28T10:33:40+07:00
- **Completed:** 2026-11-28T10:42:00+07:00
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- `NOTE_ENTITY_TYPES` and `NoteEntityType` include `'crMilestone'`; noteRepo round-trip test passes with a seeded CR milestone
- NoteEditor, QuickNotesPanel, DocListPane, NoteDetailModal and NotesPopoutView resolve and display CR milestones
- AI note query/read/write enums accept `'crMilestone'`; query_notes resolves milestone names; reminder and knowledge-link enums remain unchanged
- Focused tests, TypeScript and ESLint all green

## Task Commits

1. **Task 1: Widen NOTE_ENTITY_TYPES + NoteEntityType union + round-trip noteRepo test** - `144b7bbd` (feat)
2. **Task 2: Note pickers, filters, labels và AI enums nhận crMilestone** - `a312388c` (feat)

**Plan metadata:** pending final docs commit (SUMMARY only; STATE/ROADMAP intentionally untouched per resume scope)

## Files Created/Modified

- `src/types/models.ts` - `NoteEntityType` union widened with `'crMilestone'`
- `src/validation/schemas.ts` - `NOTE_ENTITY_TYPES` tuple widened; Note schemas unchanged
- `src/db/repositories/__tests__/noteRepo.test.ts` - milestone note round-trip and schema parse assertions
- `src/components/notes/NoteEditor.tsx` - milestone entity option and milestone list in entity picker
- `src/components/notes/QuickNotesPanel.tsx` - 'Mốc' segmented type, milestone names, placeholder and entity linking
- `src/components/notes/DocListPane.tsx` - 'Mốc triển khai' quick-note filter option
- `src/components/notes/NoteDetailModal.tsx` - milestone name resolution and 'Mốc triển khai' label
- `src/views/NotesPopoutView.tsx` - `crMilestone:<id>` entity-name map entries for filter chips and note tags
- `src/services/ai/aiTools.ts` - widened note enums, milestone name resolution, read-only get_item_insight branch
- `src/workbench/__tests__/QuickNotesPanel.test.tsx` - seeded milestone, segmented option and saved entityType/id assertions

## Decisions Made

- Reused the existing Note entityType/entityId pair; no new note type or milestone text field
- Kept D-06 boundary: reminder and knowledge-link enums stay `['task', 'cr', 'system']`, no chat scope added
- Gave get_item_insight a crMilestone read branch rather than leaving a widened enum that always errors

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] get_item_insight advertised crMilestone with no executor branch**
- **Found during:** Task 2
- **Issue:** Plan required widening the get_item_insight entity enum to include crMilestone, but the executor only handled task/cr/system and would return `Invalid item type` for the new value
- **Fix:** Added a read-only crMilestone branch returning CR id, target date, task counts and linked note count from existing tables
- **Files modified:** `src/services/ai/aiTools.ts`
- **Verification:** `npx tsc --noEmit` clean; `npm run lint` clean
- **Committed in:** `a312388c`

**2. [Rule 1 - Bug] New QuickNotesPanel test used Ant Design 6 select DOM class that no longer exists**
- **Found during:** Task 2 (focused test run)
- **Issue:** Test asserted `.ant-select-selection-item`, but the wrapped Select renders the selected value in `.ant-select-content` with a title; assertion saw `undefined`
- **Fix:** Assert the selected value through the wrapper's `textContent`, matching existing test style
- **Files modified:** `src/workbench/__tests__/QuickNotesPanel.test.tsx`
- **Verification:** 19 focused tests pass across the two target files
- **Committed in:** `a312388c`

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes required for the plan's own acceptance criteria; no scope creep or new dependency.

## Issues Encountered

- Task 1 was already committed at resume (`144b7bbd`); its files were not re-edited
- Cascade filter retains a pre-existing `as string | undefined` bridge cast from plan 01; it remains correct with the widened union and was intentionally left untouched

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Remaining Phase 52 plans can mount milestone notes via `EntityNotesSection entityType="crMilestone"`
- Focused verification: `npx vitest run src/workbench/__tests__/QuickNotesPanel.test.tsx src/db/repositories/__tests__/noteRepo.test.ts --bail=1`, `npx tsc --noEmit`, `npm run lint` all pass
- Full Vitest suite intentionally not run (project rule: over an hour)

## Self-Check: PASSED

- All 10 modified source/test files and SUMMARY.md exist on disk
- Task commits `144b7bbd` and `a312388c` found in git history
- Focused tests (19), `npx tsc --noEmit`, and `npm run lint` passed

---
*Phase: 52-cr-milestones-t-ng-m-c-tri-n-khai-gi-a-cr-v-task-milestoneid*
*Completed: 2026-11-28*
