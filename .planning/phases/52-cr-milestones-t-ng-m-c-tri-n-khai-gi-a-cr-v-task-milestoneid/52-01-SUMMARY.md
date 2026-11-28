---
phase: 52-cr-milestones-t-ng-m-c-tri-n-khai-gi-a-cr-v-task-milestoneid
plan: 01
subsystem: database
tags: [dexie, indexeddb, cr-milestones, invariants, cascade-delete, zod, vitest]

requires:
  - phase: 31.2
    provides: "CR/Task data model and legacy milestones table removal; this plan reintroduces grouping as crMilestones"
provides:
  - "Dexie V31 crMilestones store (id, crId index), CrMilestone type and optional Task.milestoneId"
  - "crMilestoneRepo CRUD verbs and taskRepo cross-store invariant enforcement"
  - "Atomic cascade verbs: delete milestone unlinks task/note; delete CR purges milestones and detaches notes"
affects:
  - "Phase 52 UI plans (CR Detail milestone section, Task column/drawer), backup schema v15, SQLite mirror allowlists"

tech-stack:
  added: []
  patterns:
    - "milestoneId unindexed on tasks — use Table.filter for lookups, never where('milestoneId')"
    - "Cross-store writes enforced at repo layer inside one Dexie transaction"
    - "Optional fields assigned conditionally to satisfy exactOptionalPropertyTypes"

key-files:
  created:
    - src/db/repositories/crMilestoneRepo.ts
    - tests/db/schemaV31Migration.test.ts
    - tests/db/crMilestoneRepo.test.ts
  modified:
    - src/types/models.ts
    - src/db/schema.ts
    - src/db/index.ts
    - src/validation/schemas.ts
    - src/db/repositories/taskRepo.ts
    - src/db/repositories/cascadeRepo.ts
    - tests/db/taskRepo.test.ts
    - tests/db/reparent.test.ts
    - tests/db/cascadeRepo.test.ts

key-decisions:
  - "crMilestones is a new V31 store; legacy 'milestones' remains rejected by assertNoLegacyTables"
  - "Task.milestoneId stays optional with no bulk migration; changing crId clears milestoneId like systemId"
  - "Milestone delete only unlinks tasks/notes inside one rw transaction; both rows survive"
  - "NoteEntityType widening to 'crMilestone' belongs to plan 03; this plan compares entityType as string at the cascade boundary"
  - "Cascade delete verb is re-exported from crMilestoneRepo without creating an import cycle (cascadeRepo does not import crMilestoneRepo)"

patterns-established:
  - "Repo verbs own cross-store invariants; UI/backup layers call verbs instead of hand-rolling checks"
  - "Note detach on entity delete preserves standalone notes for backup validation"

requirements-completed: []

duration: ~15min
completed: 2026-11-28
---

# Phase 52 Plan 01: CR Milestone Data Layer Summary

**Dexie V31 `crMilestones` store with repo-enforced CR/milestone invariants and atomic cascade unlink for tasks and notes**

## Performance

- **Duration:** ~15 min (resumed execution; Task 1 and Task 2 committed previously)
- **Started:** 2026-11-28
- **Completed:** 2026-11-28T03:23:48Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments
- `CrMilestone` type + `Task.milestoneId?`; `SCHEMA_V31` adds indexed `crMilestones` without resurrecting legacy tables
- `crMilestoneRepo` create/list/update/get with immutable CR ownership; Zod accepts optional `milestoneId` on task input/update
- `taskRepo` asserts milestone existence and CR match on create/update/reparent; CR change clears `milestoneId`
- `deleteCrMilestoneWithCascade` clears task refs and detaches notes in one transaction while preserving rows
- `deleteChangeRequestWithCascade` purges milestones and detaches milestone notes alongside tasks

## Task Commits

1. **Task 1: CrMilestone + Dexie V31 + Zod fields** - `828ce9a6` (feat)
2. **Task 2: crMilestoneRepo + taskRepo milestone invariant** - `24d37062` (feat)
3. **Task 3: Milestone cascade + CR cascade milestones** - `77da40fa` (feat)

**Plan metadata:** pending final docs commit (SUMMARY only; STATE/ROADMAP intentionally untouched per resume scope)

## Files Created/Modified
- `src/types/models.ts` - `CrMilestone` interface and optional `Task.milestoneId`
- `src/db/schema.ts` - `SCHEMA_V31` with `crMilestones: 'id, crId'`, latest version 31
- `src/db/index.ts` - `crMilestones` table declaration and `version(31)` store
- `src/validation/schemas.ts` - `milestoneId` in task schemas, `CrMilestoneInputSchema`
- `src/db/repositories/crMilestoneRepo.ts` - milestone CRUD verbs and cascade re-export
- `src/db/repositories/taskRepo.ts` - `assertMilestoneMatchesCr` on all task writes
- `src/db/repositories/cascadeRepo.ts` - milestone/CR cascade deletion transactions
- `tests/db/schemaV31Migration.test.ts` - V31 schema and legacy-table guard tests
- `tests/db/crMilestoneRepo.test.ts` - milestone CRUD + cascade unlink tests
- `tests/db/taskRepo.test.ts` - invariant tests for create/update
- `tests/db/reparent.test.ts` - reparent clears milestoneId
- `tests/db/cascadeRepo.test.ts` - milestone and CR cascade tests

## Decisions Made
- Cross-store integrity lives in repo verbs; no UI-side checks required for milestone assignment
- No bulk migration: existing tasks without `milestoneId` stay valid
- Cascade delete is unlink-only for tasks/notes, never row deletion
- Plan 03 owns `NoteEntityType` widening, so plan 01 compares `entityType` as string in the note filter

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `NoteEntityType` lacks `'crMilestone'` until plan 03**
- **Found during:** Task 3 (milestone cascade)
- **Issue:** `tsc` rejected the note filter comparison against `'crMilestone'` because `NoteEntityType` is still `'task' | 'cr' | 'system'` in this plan
- **Fix:** Cast `note.entityType` to `string | undefined` in the cascade filter and in test fixtures, with a comment pointing to plan 03 as the widening owner
- **Files modified:** `src/db/repositories/cascadeRepo.ts`, `tests/db/cascadeRepo.test.ts`, `tests/db/crMilestoneRepo.test.ts`
- **Verification:** `npx tsc --noEmit` clean; focused tests pass
- **Committed in:** `77da40fa`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Type bridge only; no behavior or scope change. Plan 03 will replace the cast with the widened union.

## Issues Encountered
- Resume inherited uncommitted Task 3 implementation in `cascadeRepo.ts`/`crMilestoneRepo.ts` plus partial tests; disk state was treated as source of truth and completed rather than reverted
- Parallel session's CR detail/insight files and `.planning/STATE.md` were left untouched; no full Vitest suite was run

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Data layer ready for UI plans: CR Detail can call `createCrMilestone`, `listCrMilestones`, `updateCrMilestone`, `deleteCrMilestoneWithCascade`
- Backup work must bump to v15 and add `crMilestones`; plan 03 must widen `NoteEntityType` and remove the temporary string casts

---
*Phase: 52-cr-milestones-t-ng-m-c-tri-n-khai-gi-a-cr-v-task-milestoneid*
*Completed: 2026-11-28*
