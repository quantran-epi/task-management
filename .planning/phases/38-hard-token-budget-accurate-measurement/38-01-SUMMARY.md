---
phase: 38-hard-token-budget-accurate-measurement
plan: 01
subsystem: database
tags: [dexie, indexeddb, zod, schema-migration, token-budget, ai-office]

# Dependency graph
requires:
  - phase: 37-runtime-reliability-concurrency
    provides: SCHEMA_V24, the run ledger stores, and the concurrencyLimit add/remove idiom
  - phase: 37.1-live-steering
    provides: the unified team-chat model (SCHEMA_V23) the V25 spec spreads from
provides:
  - SCHEMA_V25 opened at Dexie version 25 with LATEST_SCHEMA_VERSION = 25
  - AiTeam.budgetWarnThresholdPct plus clampBudgetWarnThresholdPct and its 1..100 band constants
  - AiTeamMember/AiTeamAssignment inputTokens, outputTokens, usageEstimated (all optional)
  - ChatTokenUsage cacheReadTokens and cacheCreationTokens
  - warnThresholdPctSchema at the zod write boundary
  - seeded inputTokens/outputTokens = 0 on every member-creation path
affects: [38-02, 38-06, 38-07, 38-09, 38-10, 39]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Additive Dexie version: spread the previous SCHEMA_Vn, register this.version(n).stores(...), no .upgrade() hook when every new column is unindexed"
    - "Optional column + reader coalescing: new usage columns are optional so pre-V25 rows type-check; writers seed 0 so the first increment is arithmetic"
    - "zod range at the boundary, clamp function as the runtime belt (mirrors Phase 37 concurrencyLimit)"

key-files:
  created: []
  modified:
    - tests/db/tableListParity.test.ts
    - tests/db/schemaV22Migration.test.ts
    - src/db/schema.ts
    - src/db/index.ts
    - src/types/aiOffice.ts
    - src/types/models.ts
    - src/validation/aiOfficeSchemas.ts
    - src/db/repositories/aiTeamRepo.ts
    - tests/services/ai/office/aiTeamRepo.test.ts

key-decisions:
  - "Migration tests assert against LATEST_SCHEMA_VERSION (and a >= 22 floor) instead of a literal, so the next bump cannot turn them red again"
  - "V25 has no .upgrade() hook: every new column is unindexed and lives in the opaque row payload, and C-16 puts backfill out of scope"
  - "BUDGET_PAUSE_THRESHOLD stays exported; plan 09 deprecates it after BudgetTopUpModal's replacement exists"
  - "New usage columns are optional on the type and seeded 0 on write, so old rows read undefined and new rows never string-concatenate"

patterns-established:
  - "Split usage: inputTokens/outputTokens/usageEstimated live on both the member row and the attempt row; usedTokens remains the legacy scalar readers sum"
  - "Per-team override: budgetWarnThresholdPct on AiTeam, absent means the global default; cleared by passing undefined through the 'key' in patch idiom"

requirements-completed: [AIO-BUDGET-06, AIO-BUDGET-08]

# Metrics
duration: 4min
completed: 2026-11-13
---

# Phase 38 Plan 01: V25 schema foundation Summary

**Dexie V25 with split input/output token columns on member and attempt rows, a 1..100 per-team warn threshold validated at the zod boundary, and the two pre-existing red migration tests rewritten to follow LATEST_SCHEMA_VERSION**

## Performance

- **Duration:** 4 min
- **Started:** 2026-11-13T14:09:30Z
- **Completed:** 2026-11-13T14:12:30Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- Repaired the two already-red migration tests by removing the hardcoded `23`; both now track `LATEST_SCHEMA_VERSION`, so the V24 → V25 bump in the same plan left them green.
- Landed `SCHEMA_V25` and `this.version(25)` with no `.upgrade()` hook, proven by a real-Dexie tracer that writes split usage, closes the database, reopens the same `dbName`, and reads 120/30/true back.
- Added `budgetWarnThresholdPct` end to end: type field, `clampBudgetWarnThresholdPct`, `warnThresholdPctSchema` (int 1..100), and the `updateTeam` add/remove branch so `undefined` clears the override.
- Seeded `inputTokens: 0` / `outputTokens: 0` on all four member-creation paths (createTeam lead, createTeam employees, `writeLeadRow`, `addTeamMember`) and made `writeLeadRow` carry usage across a same-agent re-assignment.

## Task Commits

Each task was committed atomically:

1. **Task 1: Repair the two migration-test literals (Wave 0)** - `75105f04` (test)
2. **Task 2: End-to-end "new columns round-trip through Dexie at V25"** - `c297f324` (feat)
3. **Task 3: Threshold at the write boundary + seeded usage columns** - `dfe783ce` (feat)

**Plan metadata:** committed with this SUMMARY (docs)

## Files Created/Modified

- `tests/db/tableListParity.test.ts` — imports `LATEST_SCHEMA_VERSION`; the store-list assertion compares the source literal against it instead of `23`
- `tests/db/schemaV22Migration.test.ts` — `expect(LATEST_SCHEMA_VERSION).toBeGreaterThanOrEqual(22)`; `db.verno` still pins the exact version
- `src/db/schema.ts` — `SCHEMA_V25` spread from `SCHEMA_V24`; `LATEST_SCHEMA_VERSION = 25`
- `src/db/index.ts` — imports `SCHEMA_V25` and registers `this.version(25).stores(SCHEMA_V25)` after version 24
- `src/types/aiOffice.ts` — `AiTeam.budgetWarnThresholdPct`; member and assignment split-usage fields; `DEFAULT_/MIN_/MAX_BUDGET_WARN_THRESHOLD_PCT` and `clampBudgetWarnThresholdPct`
- `src/types/models.ts` — `ChatTokenUsage.cacheReadTokens` and `cacheCreationTokens`
- `src/validation/aiOfficeSchemas.ts` — `warnThresholdPctSchema`, wired into `AiTeamInputSchema` and `AiTeamUpdateSchema`
- `src/db/repositories/aiTeamRepo.ts` — threshold carry/clamp/clear in `createTeam` and `updateTeam`; zero-seeded usage on every member-creation path; usage carried through `writeLeadRow`
- `tests/services/ai/office/aiTeamRepo.test.ts` — V25 close/reopen tracer, threshold edge/rejection/clear tests, seeding test, CR-02 carry test

## Decisions Made

- Migration tests now assert against `LATEST_SCHEMA_VERSION` (and a `>= 22` floor for the V22-baseline test) rather than a literal, per the plan's "fix the intent, not the number".
- `BUDGET_PAUSE_THRESHOLD` left exported — plan 09 deprecates it once `BudgetTopUpModal` has a replacement.
- The CR-02 test asserts both halves of the carry contract: a same-agent patch keeps the row and its usage; a different agent gets a fresh row seeded at 0 (usage belongs to the agent, not the seat).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Scoped test runs (`tests/services/ai/office/aiTeamRepo.test.ts`, `tests/db/tableListParity.test.ts`, `tests/db/schemaV22Migration.test.ts`) are 43/43 green; `npx tsc --noEmit -p tsconfig.json` is clean; `bash .planning/scripts/verify-team-chat-architecture.sh` exits 0.

## User Setup Required

None - no external service configuration required.

## Threat Surface Notes

- T-38-01 (tampering, `AiTeamUpdateSchema`/`updateTeam`): mitigated — `z.number().int().min(1).max(100)` rejects 0, 101 and 2.5 (asserted), and `clampBudgetWarnThresholdPct` re-clamps in the repo.
- T-38-02 (tampering, new member/attempt columns): partially mitigated — every creation path seeds non-negative 0; the `z.number().int().nonnegative()` backup-boundary guard lands in plan 06 as planned.
- T-38-03 (information disclosure, new column names): verified — `inputTokens`, `outputTokens`, `usageEstimated`, `budgetWarnThresholdPct`, `cacheReadTokens`, `cacheCreationTokens` match neither `FORBIDDEN_BACKUP_KEYS` nor the key regex in `src/validation/backupSchemas.ts:194-216`.
- T-38-SC: no package installed in this plan.

## Next Phase Readiness

- Every later plan in phase 38 can write `inputTokens`/`outputTokens`/`usageEstimated` and `budgetWarnThresholdPct` against a schema that is already open at V25.
- Plan 06 still owes the backup-boundary non-negative integer schema for the new usage columns, and plan 09 owes the `BUDGET_PAUSE_THRESHOLD` deprecation.

## Self-Check: PASSED

- `src/db/schema.ts`, `src/db/index.ts`, `src/types/aiOffice.ts`, `src/types/models.ts`, `src/validation/aiOfficeSchemas.ts`, `src/db/repositories/aiTeamRepo.ts` all present and modified.
- Commits `75105f04`, `c297f324`, `dfe783ce` all exist in `git log`.

---
*Phase: 38-hard-token-budget-accurate-measurement*
*Completed: 2026-11-13*
