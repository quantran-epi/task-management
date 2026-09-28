---
phase: 09-banking-it-domain-fields-work-types
plan: 01
subsystem: database
tags:
  - dexie
  - schema-v2
  - migration
  - validation
  - backup
  - banking-it
status: complete
dependency_graph:
  requires: []
  provides:
    - WorkType
    - WORK_TYPES
    - SCHEMA_V2
    - Dexie v2 upgrade migration
    - normalizeTags
    - tagListSchema
    - workTypeSchema
    - Backup schema v2 export
    - Backup v1 backward-compatible normalization
  affects:
    - 09-02
    - 09-03
tech_stack:
  added: []
  patterns:
    - Non-destructive atomic Dexie version upgrade with in-place data backfill
    - Multi-entry asterisk indexes (*opsOwners, *businessAnalysts) for array-tag queries
    - Zod transformation pipeline for case-insensitive deduplication and tag count/length limits
    - Forward/backward compatible backup envelope normalization (v1 -> v2)
key_files:
  created:
    - tests/db/schemaV2Migration.test.ts
    - tests/validation/domainSchemas.test.ts
    - tests/services/backup/v2Compatibility.test.ts
  modified:
    - src/types/models.ts
    - src/db/schema.ts
    - src/db/index.ts
    - src/validation/schemas.ts
    - src/validation/backupSchemas.ts
    - src/services/backup/exportBackup.ts
    - src/services/backup/validateBackup.ts
    - tests/setup.ts
decisions:
  - "Dexie schema v2 adds *opsOwners, *businessAnalysts multi-entry indexes on projects, milestones, tasks, and workType index on tasks."
  - "Migration backfill atomic transaction populates empty arrays for opsOwners/businessAnalysts and 'code' for task workType on existing records."
  - "Backup export version bumped to schemaVersion: 2; backup import engine transparently normalizes v1 payloads by injecting default tag arrays and workType."
actuals:
  tokens: 7905
  tasks: 3
  commits: 3
  plan_head_before: 9f9b89fd84a464c3b3960df3cc82b70c4f6749f9
  plan_head_after: 8c47a72caf2b7996263273974a36b5b20c5cb8fe
---

# Phase 9 Plan 1: Banking IT Domain Models, Dexie Schema v2 & Backup Compatibility Summary

Extended core data models with Banking IT ownership fields (`opsOwners`, `businessAnalysts`) and task work classification (`workType`), registered Dexie `SCHEMA_V2` with multi-entry tag indexes, implemented atomic upgrade backfilling legacy records, and upgraded backup export/import to `schemaVersion: 2` with backward-compatible v1 normalization.

## Performance & Verification

- **Dexie Schema v2 & Multi-Entry Indexes (SHB-05, D-14, D-15):** Added multi-entry asterisk indexes `*opsOwners` and `*businessAnalysts` to `projects`, `milestones`, and `tasks`, along with `workType` index on `tasks`. Verified atomic migration from v1 to v2 database in `tests/db/schemaV2Migration.test.ts`, confirming non-destructive upgrade and individual tag query resolution via `db.tasks.where('opsOwners').equals(...)`.
- **Zod Validation & Tag Normalization (D-01, D-02, D-03, D-04):** Built `normalizeTags` with whitespace trimming and case-insensitive deduplication preserving first-seen casing. Implemented `tagListSchema` capping at 10 tags and 50 characters per tag. Defined `workTypeSchema` over all 7 Banking IT types (`code`, `document`, `meeting`, `support_testing`, `investigate`, `configuration`, `review_code`) defaulting to `'code'`. Verified across 11 automated test cases in `tests/validation/domainSchemas.test.ts`.
- **Backup Schema v2 & v1 Backward Compatibility (D-16, D-17):** Bumped `CURRENT_SCHEMA_VERSION` to 2 in `src/services/backup/exportBackup.ts`. Updated `src/services/backup/validateBackup.ts` to accept schemas 1 and 2, normalizing v1 records with default empty tag arrays and `workType: 'code'`. Verified in `tests/services/backup/v2Compatibility.test.ts`.
- **Full Build & TypeScript Check:** Production build succeeded via `tsc && vite build` with zero TypeScript errors.

## Completed Tasks

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Dexie Schema v2 definition, model extensions, and atomic migration backfill | b2bc8a3 | src/types/models.ts, src/db/schema.ts, src/db/index.ts, tests/db/schemaV2Migration.test.ts |
| 2 | Zod validation schemas and tag normalization rules | 5254d5d | src/validation/schemas.ts, src/validation/backupSchemas.ts, tests/validation/domainSchemas.test.ts |
| 3 | Backup export schema v2 bump and backward-compatible v1 import normalization | 8c47a72 | src/services/backup/exportBackup.ts, src/services/backup/validateBackup.ts, tests/services/backup/v2Compatibility.test.ts |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Unused type import compilation error in schemas.ts**
- **Found during:** Task 3 verification (`npm run build`)
- **Issue:** `src/validation/schemas.ts` imported `WorkType` which was unused, failing strict TypeScript compilation under `noUnusedLocals`.
- **Fix:** Removed unused import.
- **Files modified:** `src/validation/schemas.ts`
- **Commit:** 8c47a72

**2. [Rule 3 - Blocking Issue] Test environment compatibility for Node.js 20.17**
- **Found during:** Task 1 verification
- **Issue:** Local Node runtime is v20.17.0 where JSDOM 29.1.1's nested ESM dependencies (`html-encoding-sniffer` and `@exodus/bytes`) hit `RangeError: Maximum call stack size exceeded` in Node's experimental ESM require loader.
- **Fix:** Added guards in `tests/setup.ts` for non-window environments and explicitly configured node environment (`// @vitest-environment node`) on non-DOM database, validation, and backup test suites.
- **Files modified:** `tests/setup.ts`, `tests/db/repos.test.ts`, `tests/services/backup/validateBackup.test.ts`
- **Commit:** b2bc8a3

## Threat Mitigations

- **T-09-01 (Denial of Service):** Enforced maximum 10 tags per field and maximum 50 characters per tag via `tagListSchema` in `src/validation/schemas.ts`.
- **T-09-02 (Tampering):** Two-stage backup validator validates structural envelope, record schemas, and referential integrity for both v1 and v2 payloads before modifying IndexedDB.
- **T-09-03 (Tampering):** Dexie atomic transaction in `upgrade(tx)` guarantees full rollback if migration encounters an unexpected data shape.

## Self-Check: PASSED

- All 3 created test files verified on disk.
- All 3 task commits (`b2bc8a3`, `5254d5d`, `8c47a72`) confirmed in git history.
- Verification test suites passing via Vitest.
- TypeScript compiler passes with 0 errors via `npm run build`.
