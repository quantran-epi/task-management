---
phase: 38-hard-token-budget-accurate-measurement
plan: 12
subsystem: persistence
tags: [sqlite, backup, parity, ai-office, token-budget, comments]

# Dependency graph
requires:
  - phase: 38-hard-token-budget-accurate-measurement
    plan: 06
    provides: envelope v14 with split usage and per-team threshold fields
provides:
  - "comment at exportBackup AI Office read pair: new columns ride inside the whole-row read"
  - "comment at isSafeBackupSetting: ai_budget_warn_threshold_pct passes by construction"
  - "comment at restoreBackup add(aiTeamMembers): columns validated upstream by record schemas"
  - "comment at serializePayload: rows are opaque JSON, so no SQLite or Rust edit is needed"
  - "(D-23, membership) parity test for aiTeams and aiTeamMembers across all three lists"
affects: [38-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Prove a no-op: a falsifiable membership test plus a comment at each read site, rather than an unverified claim"
    - "Cross-language contract asserted as string membership against source text — the strongest statement available when the two sides cannot import each other"

key-files:
  created: []
  modified:
    - src/services/backup/exportBackup.ts
    - src/services/backup/restoreBackup.ts
    - src/services/localSqlitePersistence.ts
    - tests/db/tableListParity.test.ts

key-decisions:
  - "The parity assertion is membership per table per list, never length equality: at HEAD the lists differ (35 Dexie / 27 TS+local / 27 Rust) for reasons outside this phase, so a length gate would be false and un-greenable here"
  - "src-tauri/src/sqlite_persistence.rs stays untouched — a Rust edit would be a change with no behavioural effect, since columns live inside opaque payload_json"

requirements-completed: [AIO-BUDGET-08]

# Metrics
duration: 4min
completed: 2026-11-13
---

# Phase 38 Plan 12: SQLite/Parity Confirmation Summary

**No structural change was needed, and that is now proven rather than asserted: four comments record why the schema push stops at the TypeScript boundary, and a falsifiable membership test pins `aiTeams` and `aiTeamMembers` in all three table lists**

## Performance

- **Duration:** 4 min
- **Started:** 2026-11-13T21:26:00Z
- **Completed:** 2026-11-13T21:30:30Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- `exportBackup.ts` now states, directly above the `aiTeams`/`aiTeamMembers` read pair, that the whole row is read so the new columns ride along, and that `projectSafeAssignment` strips `diagnosticDetail` and nothing else.
- `exportBackup.ts` states above `isSafeBackupSetting` that `ai_budget_warn_threshold_pct` passes by construction — the suffix rules only reject secret-like keys.
- `restoreBackup.ts` notes beside `add(targetDb.aiTeamMembers, ...)` that the new columns are validated upstream by the record schemas.
- `localSqlitePersistence.ts` notes near `serializePayload` that rows are opaque JSON, so a new column needs no SQLite schema change and no Rust allowlist edit — only a new *table* would.
- `tests/db/tableListParity.test.ts` gained `(D-23, membership)`: `aiTeams` and `aiTeamMembers` each asserted present in the Dexie declarations, in `SQLITE_DOMAIN_TABLES`, and in the Rust `ALLOWED_TABLES` source text. Removing a table from any one list fails it.
- Zero changes under `src-tauri/`: `git diff --stat src-tauri/` is empty.

## Task Commits

Each task was committed atomically:

1. **Task 1: Record the "no structural change" reasoning at the three read sites** — `e95b4bc4` (docs)
2. **Task 2: Falsifiable membership assertion for the two AI Office tables** — `b7d185a1` (test)

**Plan metadata:** committed with this SUMMARY (docs)

## Files Created/Modified

- `src/services/backup/exportBackup.ts` — comment above the AI Office read pair (whole-row read, only `diagnosticDetail` stripped) and above `isSafeBackupSetting` (threshold passes by construction)
- `src/services/backup/restoreBackup.ts` — comment beside the `aiTeamMembers` `add(...)` call (columns ride along, validated upstream)
- `src/services/localSqlitePersistence.ts` — comment near `serializePayload` (opaque JSON, no SQLite/Rust edit for a new column)
- `tests/db/tableListParity.test.ts` — `(D-23, membership)` test covering both tables against all three lists

## Decisions Made

- **Membership, not length.** The plan's prohibition is honored literally: no assertion in the new test compares list lengths. The three lists legitimately differ at HEAD (35 Dexie / 27 TS+local / 27 Rust, with eleven Dexie-only tables such as `documentSets`, `telegramSettings`, `telegramSessionLogs`), so a length equality gate could not be made green by this plan and would have been a false signal.
- **Rust untouched.** `aiTeams` and `aiTeamMembers` are already in `ALLOWED_TABLES` and rows are stored as opaque `payload_json`; editing `sqlite_persistence.rs` would be a change with no behavioural effect and a real risk of drift.
- **Comments at the read sites, not in a doc.** The next reader looking at the export/restore/serialize code sees the invariant without needing to find a planning artifact.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Scoped runs: `tests/db/tableListParity.test.ts` 7/7 green, `tests/services/localSqlitePersistence.test.ts` 9/9 green, `npx tsc --noEmit -p tsconfig.json` clean.

## User Setup Required

None - no external service configuration required.

## Threat Surface Notes

- T-38-32 (tampering, table-list drift): mitigated — the membership test reads the three lists from source (Dexie declarations in `src/db/index.ts`, `SQLITE_DOMAIN_TABLES` in `localSqlitePersistence.ts`, `ALLOWED_TABLES` text in the Rust file) and fails on any single-list removal.
- T-38-SC: no package installed in this plan.

## Known Stubs

None.

## Next Phase Readiness

- Plan 09 can render the resolved threshold and split usage without any persistence-layer work outstanding.
- The phase carries no pending SQLite or Rust change; the "just add it to the allowlist" failure mode is now documented and tested against.

## Self-Check: PASSED

- All four files present and modified.
- Commits `e95b4bc4`, `b7d185a1` exist in `git log`.
