---
phase: 37-runtime-reliability-concurrency
plan: 01
subsystem: persistence
tags: [dexie, migration, ai-office, ledger, concurrency, zod]
dependency-graph:
  requires: []
  provides:
    - SCHEMA_V22
    - LATEST_SCHEMA_VERSION 22
    - aiTeamBatches store
    - aiTeamAssignments store
    - aiTeamRunRepo (openBatch/closeBatch/createAssignment/transitionAssignment)
    - AiTeam.concurrencyLimit
    - clampTeamConcurrency
    - AiTeamBatch / AiTeamAssignment / AiTeamPlanSnapshot types
  affects:
    - 37-03 (ChatMessage link fields consume batchId/assignmentId/attemptNo)
    - 37-04 (retry path calls createAssignment with retryOfAssignmentId)
    - 37-05 (scheduler derives its limit from AiTeam.concurrencyLimit)
    - 37-06/37-07 (backup + SQLite parity must carry both new tables)
tech-stack:
  added: []
  patterns:
    - "append-only attempt ledger: retry inserts a new row, never mutates the previous"
    - "single guarded write path for runStatus (from-match inside one rw transaction)"
    - "additive Dexie version with no .upgrade() hook (C-16: no backfill)"
    - "optional-field add/remove idiom ('key' in patch) so clearing stays expressible"
key-files:
  created:
    - src/db/repositories/aiTeamRunRepo.ts
    - tests/db/schemaV22Migration.test.ts
    - tests/db/aiTeamRunRepo.test.ts
  modified:
    - src/types/aiOffice.ts
    - src/db/schema.ts
    - src/db/index.ts
    - src/validation/aiOfficeSchemas.ts
    - src/db/repositories/aiTeamRepo.ts
    - tests/db.test.ts
    - tests/services/ai/office/aiTeamRepo.test.ts
decisions:
  - "Dexie version is 22, not the D-22 'V20' text: V20/V21 are taken by post-36 repairs"
  - "attemptNo allocated inside the insert rw transaction; two concurrent retries get 2 and 3"
  - "transitionAssignment returns null on a lost race instead of throwing; caller branches"
  - "concurrencyLimit default 3 is a Phase 37 choice — only the 1-12 range matches ghostDevConfig.ts"
  - "createTeam also clamps, so the create path cannot write an out-of-band value"
actuals:
  tokens: 8000
  tasks: 3
  commits: 3
  plan_head_before: 3decc621168469d7eaec607ae04d37a03f2e361d
  plan_head_after: 9e5d1e41fc43bd2c9065c39bbb3c2ffc164f1acb
requirements-completed: [AIO-RUNTIME-05, AIO-GROUP-04]
coverage:
  - id: D1
    description: "Dexie opens at version 22 with aiTeamBatches + aiTeamAssignments and every V21 row intact"
    requirement: AIO-RUNTIME-05
    verification:
      - kind: unit
        ref: "tests/db/schemaV22Migration.test.ts#opens at the latest version, which is 22"
        status: pass
      - kind: unit
        ref: "tests/db.test.ts#registers all core tables in schema"
        status: pass
    human_judgment: false
  - id: D2
    description: "transitionAssignment is the only runStatus writer; stale from returns null and leaves the row byte-identical"
    requirement: AIO-RUNTIME-05
    verification:
      - kind: unit
        ref: "tests/db/aiTeamRunRepo.test.ts#returns null and writes nothing when the from status does not match"
        status: pass
    human_judgment: false
  - id: D3
    description: "Append-only attempt chain: retry adds attempt 2, concurrent retries never collide, prior row unchanged"
    requirement: AIO-RUNTIME-05
    verification:
      - kind: unit
        ref: "tests/db/aiTeamRunRepo.test.ts#allocates distinct attempt numbers for two concurrent retries"
        status: pass
      - kind: unit
        ref: "tests/db/aiTeamRunRepo.test.ts#keeps the previous attempt row untouched when a retry is appended"
        status: pass
    human_judgment: false
  - id: D4
    description: "concurrencyLimit persisted per team, 1-12 trust-boundary clamp, explicit clear semantics"
    requirement: AIO-GROUP-04
    verification:
      - kind: unit
        ref: "tests/services/ai/office/aiTeamRepo.test.ts#stores the boundaries 1 and 12 verbatim"
        status: pass
      - kind: unit
        ref: "tests/services/ai/office/aiTeamRepo.test.ts#rejects 0 and leaves the stored value untouched"
        status: pass
    human_judgment: false
duration: 6 min
completed: 2026-11-11
status: complete
---

# Phase 37 Plan 01: Run-ledger contract and per-team concurrency Summary

**Two-table Dexie V22 run ledger with one guarded transition function, plus a validated 1-12 per-team concurrency limit**

## Performance

- **Duration:** 6 min
- **Started:** 2026-11-11T18:55:25Z
- **Completed:** 2026-11-11T19:01:55Z
- **Tasks:** 3
- **Files modified:** 10 (3 created, 7 modified)

## Accomplishments

- `SCHEMA_V22` adds `aiTeamBatches` and `aiTeamAssignments` additively; `LATEST_SCHEMA_VERSION = 22`; the V20/V21 repair hooks keep their version numbers
- `AiTeamBatch` / `AiTeamAssignment` / `AiTeamPlanSnapshot` typed for D-24's future flows (handoff `dependsOn`, `blocked`/`needs-input`, edited-plan snapshot)
- `transitionAssignment(id, from, to, patch)` is the single `runStatus` writer: from-match inside one `rw` transaction, `null` on a lost race
- `createAssignment` allocates `attemptNo` inside the insert transaction, so concurrent retries get distinct numbers and the previous attempt row is never mutated
- `AiTeam.concurrencyLimit` validated by zod (int 1-12) and clamped by `clampTeamConcurrency`, with omit-preserves / undefined-clears semantics

## Task Commits

1. **Task 1: End-to-end ledger tables (types -> Dexie V22 -> readable store)** - `5913489d` (feat)
2. **Task 2: Ledger repository (open/close batch, allocate attempt, guarded transition)** - `3b222727` (feat)
3. **Task 3: Per-team concurrency setting (zod, repo semantics, clamp, tests)** - `9e5d1e41` (feat)

**Plan metadata:** `9e5d1e41`+1 (docs: complete plan)

## Files Created/Modified

- `src/db/repositories/aiTeamRunRepo.ts` (new) - openBatch, closeBatch, createAssignment, transitionAssignment, getAssignment, listBatchAssignments, listRetryableAssignments
- `src/types/aiOffice.ts` - ledger types, `AiTeam.concurrencyLimit`, concurrency constants + `clampTeamConcurrency`
- `src/db/schema.ts` - `SCHEMA_V22`, `LATEST_SCHEMA_VERSION = 22`
- `src/db/index.ts` - `this.version(22)`, two `Table<>` declarations
- `src/validation/aiOfficeSchemas.ts` - `concurrencyLimit` on both team schemas
- `src/db/repositories/aiTeamRepo.ts` - `updateTeam`/`createTeam` clamp handling
- `tests/db/schemaV22Migration.test.ts` (new) - V21 -> V22 upgrade proof
- `tests/db/aiTeamRunRepo.test.ts` (new) - 10 ledger tests
- `tests/db.test.ts`, `tests/services/ai/office/aiTeamRepo.test.ts` - store list and boundary matrix

## Decisions Made

- Dexie version 22, not D-22's literal "V20" — V20/V21 were consumed by post-36 repair migrations (recorded in 37-PATTERNS.md).
- `transitionAssignment` returns `null` rather than throwing on a stale `from`; that is the contract later plans branch on.
- `createTeam` clamps as well as `updateTeam`, so no create path can write an out-of-band value.
- `MAX_BATCH_SIZE` left in place; it is deleted in 37-04 with its last reference so each plan keeps the tree compiling.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Flaky FIFO assertion in the ledger test**
- **Found during:** Task 2 (ledger repository)
- **Issue:** Three `createAssignment` calls in the same millisecond produce identical `queuedAt`, so the id tie-break reorders rows and a fixed insertion-order assertion failed ~50% of runs.
- **Fix:** The test now derives the expected order with the same comparator the function documents, instead of assuming insertion order.
- **Files modified:** `tests/db/aiTeamRunRepo.test.ts`
- **Verification:** 6 consecutive runs green after the change.
- **Committed in:** `3b222727` (Task 2 commit)

**2. [Rule 3 - Blocking] Wrong relative import depth in the new repo test**
- **Found during:** Task 2 (ledger repository)
- **Issue:** `tests/db/aiTeamRunRepo.test.ts` imported `../../../src/db/index`; `tests/db/` is two levels deep, so Vitest could not resolve the module.
- **Fix:** Rewrote the prefix to `../../src/`.
- **Files modified:** `tests/db/aiTeamRunRepo.test.ts`
- **Verification:** Test file runs and passes.
- **Committed in:** `3b222727` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both were local to the new test file. No production behaviour changed, no scope creep.

## Issues Encountered

`tsc --noEmit` initially flagged an unused `rootId` local in `createAssignment`; removed it before the Task 2 commit.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Lexer contract complete: 37-03 can add the `ChatMessage` link fields, 37-04 can call `createAssignment` with `retryOfAssignmentId`, 37-05 can read `concurrencyLimit`.
- 37-06/37-07 still owe the backup schema, export/restore/validate, SQLite TS + Rust and parity-test coverage for both new tables (D-26).
- `MAX_BATCH_SIZE` and its refusal remain live until 37-04 by design.

---
*Phase: 37-runtime-reliability-concurrency*
*Completed: 2026-11-11*

## Self-Check: PASSED
