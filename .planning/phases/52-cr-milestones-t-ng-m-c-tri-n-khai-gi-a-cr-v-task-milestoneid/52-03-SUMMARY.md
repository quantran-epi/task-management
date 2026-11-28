---
phase: 52-cr-milestones-t-ng-m-c-tri-n-khai-gi-a-cr-v-task-milestoneid
plan: 03
subsystem: backup
tags: [backup, zod, dexie, sqlite, tauri, vitest, cr-milestones]

requires:
  - phase: 52 plan 01
    provides: "Dexie V31 crMilestones store and CrMilestone type"
  - phase: 52 plan 02
    provides: "Note entityType crMilestone widened in domain model and UI"
provides:
  - "Backup envelope v15 with crMilestones tables/counts, v14 normalization, and referential milestone checks"
  - "Export/restore/preview support for CR milestones and TS/Rust SQLite allowlist parity"
affects:
  - "Phase 52 remaining UI plans and all backup/restore flows"

tech-stack:
  added: []
  patterns:
    - "v14 → v15 normalization injects crMilestones: [] instead of rejecting the backup"
    - "Referential validation covers milestone.crId, task.milestoneId CR ownership and crMilestone notes"
    - "Absent milestone table means legacy; validator injects the key so restore clears local milestones by design (D-07)"

key-files:
  created: []
  modified:
    - src/types/backup.ts
    - src/validation/backupSchemas.ts
    - src/services/backup/validateBackup.ts
    - src/services/backup/exportBackup.ts
    - src/services/backup/restoreBackup.ts
    - src/components/settings/ImportPreviewModal.tsx
    - src/services/localSqlitePersistence.ts
    - src-tauri/src/sqlite_persistence.rs
    - tests/db/tableListParity.test.ts
    - tests/services/backup/validateBackup.test.ts
    - tests/services/backup/exportBackup.test.ts
    - tests/services/backup/restoreBackup.test.ts
    - tests/validation/backupSchemas.test.ts

key-decisions:
  - "BACKUP_SCHEMA_VERSION = 15; BackupCrMilestoneRecordSchema validates milestone rows; note entityType and task milestoneId are widened"
  - "legacyLinks threshold stays < 14; legacyMilestones threshold is < 15 and only injects when the raw key is absent"
  - "A task milestoneId must reference an existing milestone owned by the same CR; a crMilestone note must reference an existing milestone"
  - "assertNoLegacyTables is unchanged: projects/milestones still rejected, crMilestones allowed"
  - "Restore captures local milestones in the snapshot, clears them, then bulkAdds the incoming table; a v14 import intentionally clears local milestones"
  - "SQLITE_DOMAIN_TABLES and Rust ALLOWED_TABLES both include crMilestones; parity test checks Dexie, SCHEMA_V31, TS list and Rust list"

requirements-completed: []

duration: ~10min
completed: 2026-11-28
---

# Phase 52 Plan 03: Backup v15 & SQLite Parity Summary

**CR milestones ride in encrypted backups v15, v14 backups normalize instead of failing, and native SQLite mirror accepts milestone rows**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-11-28T03:41:14Z
- **Completed:** 2026-11-28T03:50:00Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments

- `BACKUP_SCHEMA_VERSION = 15`; `BackupCrMilestoneRecordSchema`, optional `crMilestones` fields in `BackupTableData`, `BackupTableCounts` and envelope; `task.milestoneId` and crMilestone note entity accepted
- Validation normalizes v14 → v15 with empty milestones, rejects cross-CR task links, dangling milestone notes and milestones whose CR is absent; legacy `projects`/`milestones` gate unchanged
- Export writes `tables.crMilestones` and `counts.crMilestones`; restore snapshots/clears/bulkAdds milestones; ImportPreviewModal shows 'Mốc triển khai (CR Milestones)' with current count
- `SQLITE_DOMAIN_TABLES` and Rust `ALLOWED_TABLES` include `crMilestones` with four-source parity assertion
- 90 focused tests pass across the five plan paths; `npx tsc --noEmit`, `npm run lint` and `cargo check --manifest-path src-tauri/Cargo.toml` all pass

## Task Commits

1. **Task 1: Backup schema v15 + normalize v14 + referential milestone (D-07)** - `76762bf3` (feat)
2. **Task 2: Export/restore/preview + SQLite allowlist parity (D-07, D-08)** - `fab9946b` (feat)

**Plan metadata commit:** pending final SUMMARY-only commit (STATE/ROADMAP intentionally untouched per orchestrator scope)

## Files Created/Modified

- `src/types/backup.ts` - optional `CrMilestone[]`/count fields for v14 type compatibility
- `src/validation/backupSchemas.ts` - v15 literal, milestone record schema, widened task/note fields
- `src/services/backup/validateBackup.ts` - v14 normalization, milestone validation, referential checks
- `src/services/backup/exportBackup.ts` - milestone rows and counts in exported envelope
- `src/services/backup/restoreBackup.ts` - milestone snapshot, clear, add, restore comment for v14 behavior
- `src/components/settings/ImportPreviewModal.tsx` - Vietnamese milestone label and live count
- `src/services/localSqlitePersistence.ts` - `crMilestones` in TS domain table list
- `src-tauri/src/sqlite_persistence.rs` - `crMilestones` in Rust allowlist
- `tests/db/tableListParity.test.ts` - SCHEMA_V31 import and four-source parity test
- `tests/services/backup/validateBackup.test.ts` - v15/v14/referential tests
- `tests/services/backup/exportBackup.test.ts` - milestone export assertions and count updates
- `tests/services/backup/restoreBackup.test.ts` - export→restore round-trip and v14 clear test
- `tests/validation/backupSchemas.test.ts` - legacy gate allows `crMilestones`

## Decisions Made

- v14 backups remain valid; normalization injects an empty milestone table so restore deliberately clears local milestones
- Referential integrity checks milestone CR membership, task-to-milestone CR match and note entity existence before any restore write
- Snapshot still captures milestones, so a bad import remains one-click rollback
- Cargo check compiled the Tauri crate; 32 pre-existing unused-function warnings remain, no errors

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical mitigation] Milestone CR ownership was not validated**

- **Found during:** Task 2 (export→restore round-trip)
- **Issue:** threat register T-52-07 requires `milestone.crId` to exist among change requests; the first implementation only checked task links and note references, so a round-trip export containing a milestone without its CR was rejected late and indirectly by the unrelated task check
- **Fix:** Added an explicit `crMilestones[].crId` referential check in `validateBackup` and seeded the CR in the round-trip fixture
- **Files modified:** `src/services/backup/validateBackup.ts`, `tests/services/backup/restoreBackup.test.ts`
- **Verification:** 90 focused tests pass; `tsc`, `lint`, `cargo check` clean
- **Committed in:** `fab9946b`

**2. [Rule 1 - Bug] New export fixture broke two exact count assertions**

- **Found during:** Task 2 (focused export test)
- **Issue:** adding a milestone row to the export fixture changed the exact `counts` object and `recordCount` log from 7 to 8
- **Fix:** Updated the two existing assertions and added `crMilestones: 1` to the expected count map
- **Files modified:** `tests/services/backup/exportBackup.test.ts`
- **Verification:** focused export suite passes
- **Committed in:** `fab9946b`

---

**Total deviations:** 2 (1 missing mitigation, 1 test fixture bug). No new dependencies, no architectural change.

## Issues Encountered

- `npx tsc --noEmit` initially rejected the Zod-parsed milestone row under `exactOptionalPropertyTypes`; fixed with an explicit `NonNullable<BackupEnvelope['tables']['crMilestones']>` cast after validation, matching the file's existing envelope casts
- Full Vitest suite intentionally not run (project rule: over an hour)

## User Setup Required

None.

## Known Stubs

None. All declared backup fields are produced by export and consumed by restore/preview.

## Threat Flags

None. All new backup surfaces (envelope fields, validation stage 3, snapshot/restore writes, native allowlist) are covered by the plan's T-52-06..T-52-09 register.

## Next Phase Readiness

- Backup v15 round-trip, v14 acceptance and native mirror parity are committed
- Remaining Phase 52 plans can rely on milestones surviving encrypted backup export/restore

## Self-Check: PASSED

- All 13 source/test files and SUMMARY.md exist on disk
- Task commits `76762bf3` and `fab9946b` found in git history
- Focused tests: 5 files, 90 tests passed; `npx tsc --noEmit`, `npm run lint`, `cargo check` all exit 0
- Pre-existing uncommitted files (`STATE.md`, `ChangeRequestDetailView.tsx`, `ItemInsightView.tsx`, related tests, `.gitkeep`) untouched

---
*Phase: 52-cr-milestones-t-ng-m-c-tri-n-khai-gi-a-cr-v-task-milestoneid*
*Completed: 2026-11-28*
