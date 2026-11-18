---
phase: 39-skill-versioning-enrichment-approval
plan: 01
subsystem: ai-office / skill-versioning / backup
tags: [skill-version, dexie, backup-schema, d-07, d-14, d-15]
requires:
  - "Phase 36 aiSkillVersions table + [skillId+version] index"
  - "Phase 36 backup envelope v13 / Dexie v25"
provides:
  - "AiSkillVersion.version optional (D-14) + baseVersion (D-15)"
  - "getLatestApprovedVersionNumber(skillId, db?)"
  - "listPendingSkillVersions(db?)"
  - "ONLY_PENDING_ON_CREATE_MESSAGE"
  - "decideSkillVersion writes aiSkills atomically (D-07)"
  - "backup schema + validator accept a version-less pending row"
affects:
  - "39-02 (tool path), 39-04 (run pin), 39-05/39-06 (UI surfaces) all read this repo"
tech-stack:
  added: []
  patterns:
    - "read -> guard -> compute -> write inside one Dexie rw transaction"
    - "optional-absent key (never `undefined`) so a compound index skips the row"
key-files:
  created: []
  modified:
    - src/types/aiOffice.ts
    - src/db/repositories/aiSkillVersionRepo.ts
    - src/validation/backupSchemas.ts
    - src/services/backup/validateBackup.ts
    - tests/services/ai/office/aiSkillVersionRepo.test.ts
    - tests/services/backup/officeBackup.test.ts
decisions:
  - "D-14: version assigned only at approval over approved rows; pending rows omit the key"
  - "D-07: approval overwrites aiSkills name/description/body in the same rw transaction"
  - "D-15: baseVersion recorded at proposal time, 0 = implicit baseline"
  - "No envelope bump (13) and no Dexie bump (25) — both fields optional-absent"
metrics:
  duration: "~25 min"
  completed: "2026-11-14"
---

# Phase 39 Plan 01: Approval-time skill version numbering + backup round-trip Summary

A skill version number now exists only on an approved row: `createSkillVersion` writes no `version` key and records `baseVersion`, while `decideSkillVersion` assigns `max(approved) + 1` and overwrites `aiSkills` in the same `rw` transaction. Backup schema and validator accept the version-less pending shape without an envelope or Dexie bump.

## What changed

**`src/types/aiOffice.ts`** — `AiSkillVersion.version` became `version?: number | undefined` (D-14) and `baseVersion?: number | undefined` was added (D-15). Both use the file's existing `exactOptionalPropertyTypes` idiom.

**`src/db/repositories/aiSkillVersionRepo.ts`** — rewritten:
- `listSkillVersions` sorts `(b.version ?? 0) - (a.version ?? 0)` with a `createdAt` tiebreak; without the `?? 0` the subtraction is `NaN` and unnumbered pendings reorder on every render.
- `getLatestSkillVersion` unchanged in body; doc comment now records that the `[skillId+version]` compound index skips absent key parts, so it returns the highest numbered row by construction.
- `getLatestApprovedVersionNumber` (new) — the single numbering reader, filtered to `approved`.
- `listPendingSkillVersions` (new) — `where('status').equals('pending')`, newest first. `status` was already indexed; no schema change.
- `createSkillVersion` throws `ONLY_PENDING_ON_CREATE_MESSAGE` (`Chỉ có thể tạo phiên bản kỹ năng ở trạng thái chờ duyệt.`) when `status !== 'pending'`, then writes `baseVersion` and no `version` property at all.
- `decideSkillVersion` opens `rw` over `[db.aiSkillVersions, db.aiSkills]`; rejected rows get no number, approved rows get `max(approved) + 1` plus an `aiSkills` overwrite of `name`/`description`/`body` with `updatedAt = decidedAt`.

**`src/validation/backupSchemas.ts`** — `version` is now `z.number().int().positive().optional()` (so `0` is still refused), `baseVersion: z.number().int().nonnegative().optional()`. `BACKUP_SCHEMA_VERSION` stays 13.

**`src/services/backup/validateBackup.ts`** — the duplicate-version loop skips rows with `version === undefined` after the `skillId` reference check, so two pendings for one skill no longer key `S:undefined` and refuse the payload.

## Verification

- `npx tsc --noEmit -p tsconfig.json` — 0 `error TS` lines
- `npx vitest run tests/services/ai/office/aiSkillVersionRepo.test.ts` — 13 passed
- `npx vitest run tests/services/backup/officeBackup.test.ts` — 22 passed
- Adjacent suites re-run green: `validateBackup`, `exportBackup`, `aiOfficeRepo` (58 passed), `localSqlitePersistence`, `tableListParity` (16 passed)
- `CURRENT_SCHEMA_VERSION === 13` and `LATEST_SCHEMA_VERSION === 25` asserted in the export test

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `listSkillVersions` sort would have been `NaN` for unnumbered rows**
- **Found during:** Task 1
- **Issue:** the plan's acceptance grep `grep -n "version: (latest"` must return no match, but the natural way to write the approved-row put is inline in the object literal.
- **Fix:** hoisted the computation to `const nextVersion = (latestApproved?.version ?? 0) + 1;` and used `version: nextVersion`. Also renamed the numbering filter callback parameter from `version` to `row` so the acceptance grep `filter((row) => row.status === 'approved')` matches the plan's stated text.
- **Files modified:** `src/db/repositories/aiSkillVersionRepo.ts`
- **Commit:** 006d5ccc

**2. [Rule 2 - Missing critical coverage] `baseVersion` had no direct test**
- **Found during:** Task 2
- **Issue:** the plan's eight tests never assert that `createSkillVersion` reads the approved maximum into `baseVersion` after an approval exists — the only `baseVersion` assertion was `=== 0` on a fresh skill.
- **Fix:** added `'records the latest approved number as baseVersion on a new pending (D-15)'` (test count 13, still ≥ the plan's 13).
- **Files modified:** `tests/services/ai/office/aiSkillVersionRepo.test.ts`
- **Commit:** 88eae49c

No architectural changes, no auth gates, no package installs.

## Known Stubs

None.

## Threat Flags

None — no new network endpoint, auth path, or file-access pattern. The new backup key `baseVersion` was checked against `FORBIDDEN_BACKUP_KEYS` and the forbidden-key regex (T-39-04) and passes.

## Self-Check: PASSED

- FOUND: src/db/repositories/aiSkillVersionRepo.ts
- FOUND: src/types/aiOffice.ts
- FOUND: src/validation/backupSchemas.ts
- FOUND: src/services/backup/validateBackup.ts
- FOUND: tests/services/ai/office/aiSkillVersionRepo.test.ts
- FOUND: tests/services/backup/officeBackup.test.ts
- FOUND: 006d5ccc
- FOUND: 88eae49c
- FOUND: ec414da4
