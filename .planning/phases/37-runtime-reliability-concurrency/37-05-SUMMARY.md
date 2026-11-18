---
phase: 37-runtime-reliability-concurrency
plan: 05
subsystem: persistence
tags: [backup, envelope, sqlite, parity, ai-office, ledger, zod]
dependency-graph:
  requires:
    - 37-01 (SCHEMA_V22, AiTeamBatch/AiTeamAssignment types, AiTeam.concurrencyLimit)
  provides:
    - BACKUP_SCHEMA_VERSION 13
    - BackupAiTeamBatchRecordSchema
    - BackupAiTeamAssignmentRecordSchema
    - projectSafeAssignment (diagnosticDetail strip)
    - BackupTableData.aiTeamBatches / .aiTeamAssignments (+ counts)
    - AI_OFFICE_TABLE_KEYS at nine entries
    - SQLite names aiTeamBatches / aiTeamAssignments on TS and Rust sides
  affects:
    - 37-06/37-07 (any later backup or SQLite work reads the nine-key group and envelope 13)
    - any future envelope bump must move the nine pinned test files with it
tech-stack:
  added: []
  patterns:
    - "strictObject backup records so an undeclared key is rejected, never silently stripped"
    - "export projection (projectSafeAssignment) removes diagnosticDetail before the row enters the envelope"
    - "all-or-nothing AI Office group: nine keys or none, refused outside the transaction"
    - "snapshot fields (agentName/skillId/skillVersion/model) are historical, never live-validated"
key-files:
  created: []
  modified:
    - src/validation/backupSchemas.ts
    - src/types/backup.ts
    - src/services/backup/exportBackup.ts
    - src/services/backup/restoreBackup.ts
    - src/services/backup/validateBackup.ts
    - src/services/localSqlitePersistence.ts
    - src-tauri/src/sqlite_persistence.rs
    - tests/services/backup/officeBackup.test.ts
    - tests/services/backup/validateBackup.test.ts
    - tests/services/backup/v2Compatibility.test.ts
    - tests/services/backup/exportBackup.test.ts
    - tests/validation/backupSchemas.test.ts
    - tests/validation/backupSchemasTimer.test.ts
    - tests/backup/tabCheckpointBackup.test.ts
    - tests/services/github/githubPullRestore.test.ts
    - tests/noteAttachments.test.ts
    - tests/views/SettingsView.test.tsx
    - tests/db/tableListParity.test.ts
decisions:
  - "diagnosticDetail is stripped by projectSafeAssignment in both export and captureSnapshot — not at the envelope level, so no nested projection can reintroduce it"
  - "BackupAiTeamAssignmentRecordSchema omits diagnosticDetail entirely: a hand-crafted payload carrying the key is rejected by strictObject"
  - "snapshot projection in restoreBackup.captureSnapshot uses the same strip, because the pre-import snapshot is downloadable as an envelope"
  - "parity test now pins LATEST_SCHEMA_VERSION = 22 so a future bump cannot silently desync its store source"
actuals:
  tokens: 21000
  tasks: 3
  commits: 3
  plan_head_before: 0c88ebb52f6a32305ccd0a8c4795f66568655933
  plan_head_after: ef323fdc00f34175f31e9e01c7cd2d601950a263
requirements-completed: [AIO-RUNTIME-05, AIO-GROUP-04]
coverage:
  - id: D1
    description: "Envelope 13 carries both ledger tables; export -> validate -> restore loses no row"
    requirement: AIO-RUNTIME-05
    verification:
      - kind: unit
        ref: "tests/services/backup/officeBackup.test.ts#round-trips the ledger and never exports diagnosticDetail (D-17, T-37-14)"
        status: pass
      - kind: unit
        ref: "tests/services/backup/officeBackup.test.ts#exports the AI Office tables at schemaVersion 13"
        status: pass
    human_judgment: false
  - id: D2
    description: "diagnosticDetail never reaches the exported artifact, though the local row has it"
    requirement: AIO-RUNTIME-05
    verification:
      - kind: unit
        ref: "tests/services/backup/officeBackup.test.ts#round-trips the ledger and never exports diagnosticDetail (D-17, T-37-14)"
        status: pass
    human_judgment: false
  - id: D3
    description: "A version-12 envelope is rejected with the legacy message; a version-13 envelope validates"
    requirement: AIO-RUNTIME-05
    verification:
      - kind: unit
        ref: "tests/services/backup/validateBackup.test.ts#rejects a version-12 envelope with the existing legacy message and names schemaVersion"
        status: pass
      - kind: unit
        ref: "tests/services/backup/v2Compatibility.test.ts#emits the version-13 envelope"
        status: pass
    human_judgment: false
  - id: D4
    description: "Ledger referential integrity is enforced before any clear; snapshots are never live-validated"
    requirement: AIO-RUNTIME-05
    verification:
      - kind: unit
        ref: "tests/services/backup/officeBackup.test.ts#rejects an aiTeamMembers row whose teamId names no team"
        status: pass
      - kind: unit
        ref: "tests/services/backup/officeBackup.test.ts#refuses a partial AI Office payload before any clear (WR-10, D-20)"
        status: pass
    human_judgment: false
  - id: D5
    description: "TS SQLite list and Rust allowlist both name the two ledger tables; parity test guards it"
    requirement: AIO-GROUP-04
    verification:
      - kind: unit
        ref: "tests/db/tableListParity.test.ts#carries both ledger tables in the TS list and the Rust allowlist (Phase 37 D-26)"
        status: pass
      - kind: unit
        ref: "tests/db/tableListParity.test.ts#every TS domain table appears in the Rust allowlist"
        status: pass
    human_judgment: false
  - id: D6
    description: "blocked / needs-input rows validate and round-trip unchanged (D-24 future flows representable)"
    requirement: AIO-RUNTIME-05
    verification:
      - kind: unit
        ref: "tests/services/backup/officeBackup.test.ts#round-trips the ledger and never exports diagnosticDetail (D-17, T-37-14)"
        status: pass
    human_judgment: false
duration: 10 min
completed: 2026-11-12
status: complete
---

# Phase 37 Plan 05: Backup envelope 13 and SQLite parity Summary

**Both ledger tables and `AiTeam.concurrencyLimit` through the whole backup surface in one changeset, with `diagnosticDetail` provably absent from the artifact**

## Performance

- **Duration:** 10 min
- **Started:** 2026-11-11T19:20:00Z
- **Completed:** 2026-11-11T19:30:00Z
- **Tasks:** 3
- **Files modified:** 18

## Accomplishments

- `BACKUP_SCHEMA_VERSION` is 13; a version-12 envelope is still rejected with `LEGACY_BACKUP_MESSAGE`, never silently accepted
- `BackupAiTeamBatchRecordSchema` and `BackupAiTeamAssignmentRecordSchema` land as `strictObject` with every D-22 field; the assignment schema deliberately omits `diagnosticDetail`, so a hand-crafted payload carrying it is refused
- `BackupAiTeamRecordSchema` gains `concurrencyLimit` (1-12, optional) — without it the `strictObject` would strip the field on restore
- `BackupChatMessageRecordSchema` declares all eight ledger link fields, so a restored report keeps its `assignmentId` (a plain `z.object` strips undeclared keys)
- `projectSafeAssignment` removes `diagnosticDetail` before the row enters the envelope — applied in both `exportBackupPayload` and `captureSnapshot` (the pre-import snapshot is downloadable, so it needs the same strip)
- `AI_OFFICE_TABLE_KEYS` is nine entries; the all-or-nothing guard still refuses a payload carrying only some of them
- `validateBackup` checks `batch.teamId`, `batch.threadId`, `assignment.batchId` and `retryOfAssignmentId` resolve, while `agentName`/`skillId`/`skillVersion`/`model` stay historical snapshots
- `SQLITE_DOMAIN_TABLES` and Rust `ALLOWED_TABLES` both name both ledger tables; the parity test reads `SCHEMA_V22` and pins `LATEST_SCHEMA_VERSION = 22`

## Task Commits

1. **Task 1: Envelope 13 with both ledger tables through export/restore/validate** - `8de6c214` (feat)
2. **Task 2: Every envelope literal in the suite moves to 13** - `62ab48e8` (test)
3. **Task 3: SQLite mirror parity for both ledger tables (TS and Rust)** - `ef323fdc` (feat)

## Files Created/Modified

- `src/validation/backupSchemas.ts` - two ledger record schemas, `concurrencyLimit`, eight `ChatMessage` link fields, version 13
- `src/types/backup.ts` - `aiTeamBatches` / `aiTeamAssignments` on `BackupTableData` and `BackupTableCounts`
- `src/services/backup/exportBackup.ts` - destructure + `Promise.all` + `projectSafeAssignment` + `tables` + `counts`
- `src/services/backup/restoreBackup.ts` - `RESTORE_TABLES`, nine-key `AI_OFFICE_TABLE_KEYS`, clear list, adds, `captureSnapshot` (three sites)
- `src/services/backup/validateBackup.ts` - two `validateTable` blocks, four referential checks, envelope `tables`/`counts` passthrough
- `src/services/localSqlitePersistence.ts` - `SQLITE_DOMAIN_TABLES` +2
- `src-tauri/src/sqlite_persistence.rs` - `ALLOWED_TABLES` +2
- `tests/services/backup/officeBackup.test.ts` - ledger seed, round-trip, `diagnosticDetail` absence, partial-payload narrowing
- `tests/services/backup/{validateBackup,v2Compatibility,exportBackup}.test.ts` - version and counts literals; new v12-rejection case
- `tests/validation/{backupSchemas,backupSchemasTimer}.test.ts`, `tests/backup/tabCheckpointBackup.test.ts`, `tests/services/github/githubPullRestore.test.ts`, `tests/noteAttachments.test.ts`, `tests/views/SettingsView.test.tsx` - version fixtures
- `tests/db/tableListParity.test.ts` - `SCHEMA_V22`, both ledger names, `LATEST_SCHEMA_VERSION` pin

## Decisions Made

- The `diagnosticDetail` strip lives in a row projection (`projectSafeAssignment`) rather than an envelope filter, because an envelope-level filter leaves the key inside `tables` for any later consumer that reads the fixture directly.
- `captureSnapshot` strips too: the pre-import snapshot is exposed through `downloadSnapshotFile` as a real envelope, so omitting the strip there would leak the same field via "Undo import".
- The parity test asserts the literal `22` for `LATEST_SCHEMA_VERSION` in addition to reading `SCHEMA_V22`, so a future bump that forgets to repoint the store source fails loudly instead of silently reading a stale version.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `BackupAiTeamMemberRecordSchema` declaration was truncated by the first edit**
- **Found during:** Task 1
- **Issue:** Adding `concurrencyLimit` to `BackupAiTeamRecordSchema` replaced the closing `});` plus the following `export const BackupAiTeamMemberRecordSchema = z.strictObject({` line, leaving the member schema body with no declaration header — a syntax error that `tsc` reports as dozens of cascading errors.
- **Fix:** Restored the closing brace and the member-schema declaration line before running any test.
- **Files modified:** `src/validation/backupSchemas.ts`
- **Verification:** `npx tsc --noEmit` clean; `officeBackup.test.ts` 14/14.
- **Committed in:** `8de6c214` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (self-inflicted edit error, caught before commit)
**Impact on plan:** No behaviour change. No scope creep.

## Issues Encountered

None beyond the edit error above.

## Known Stubs

None. Both ledger tables are wired end to end (Dexie → export → validate → restore → SQLite TS/Rust); no placeholder or empty-value path remains.

## Threat Flags

None. The new surface is exactly the two threat-register entries T-37-14 (exported `aiTeamAssignments`), T-37-15 (referential checks), T-37-16 (forbidden key names) and T-37-17 (partial payload); all four are mitigated and covered by tests.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Envelope 13 is the current contract; any later plan touching backup records works against the nine-key AI Office group.
- 37-06/37-07 can now persist and mirror ledger rows without tripping the native allowlist.
- The nine version-pinned test files are the checklist any future envelope bump must move.
- `npx vitest` over the 11 plan-relevant files: 101 passed. `npx tsc --noEmit`: no errors.

---
*Phase: 37-runtime-reliability-concurrency*
*Completed: 2026-11-12*

## Self-Check: PASSED
