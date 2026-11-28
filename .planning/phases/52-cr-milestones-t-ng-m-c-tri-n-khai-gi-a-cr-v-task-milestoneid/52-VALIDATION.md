---
phase: 52
phase-slug: cr-milestones-t-ng-m-c-tri-n-khai-gi-a-cr-v-task-milestoneid
date: 2026-11-28
---

# Phase 52 — Validation Strategy

Source: `52-RESEARCH.md` § Validation Architecture.

## Principle

Verify at the state owner. Plans must prove data contracts (Dexie V31, backup v15,
repo invariants, cascade semantics, note union) with scoped tests, not screenshots.

## Test Ladder

1. **Automated focused tests** — scoped paths only. NEVER run the full Vitest suite
   (exceeds one hour). Run:
   - `npx vitest run tests/db/tableListParity.test.ts tests/db/schemaV31Migration.test.ts tests/db/cascadeRepo.test.ts tests/db/repositories/taskRepo.test.ts tests/db/repositories/noteRepo.test.ts tests/services/backup/backupValidation.test.ts --bail=1`
   - add/remove paths to match the files each plan actually modifies
2. **Static gates** — `npx tsc --noEmit`, `npm run lint`, `npm run build`.
3. **Chrome UAT** — CR Detail milestone CRUD + notes; TaskDrawer milestone select;
   task table "Mốc" column; light and dark; observed, not inferred from code.
4. **Diff review** — review final diff for warnings/bugs before declaring complete.

## Required Evidence by Decision

| Decision | Evidence |
|---|---|
| D-01/D-03 | V31 migration test: table exists, index present, legacy `milestones` absent |
| D-02/D-03 | taskRepo test: valid milestone accepted; cross-CR milestone rejected; CR change clears milestoneId |
| D-04 | cascade test: delete milestone clears task.milestoneId + detaches notes; task/notes survive |
| D-05 | noteRepo/validation test: `crMilestone` entity links round-trip through save/backup |
| D-07 | backup test: v15 round-trip, v14 restores with empty crMilestones, legacy table gate still rejects |
| D-08 | tableListParity test + explicit statement if cargo not run |
| D-09 | Chrome UAT light/dark + wrapper-only lint/static check |
| D-11 | All gates above green; honest report of any skipped check |
