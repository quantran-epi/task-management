---
phase: 38-hard-token-budget-accurate-measurement
plan: 06
subsystem: backup
tags: [backup, zod, schema-version, token-budget, ai-office]

# Dependency graph
requires:
  - phase: 38-hard-token-budget-accurate-measurement
    plan: 01
    provides: V25 Dexie columns (inputTokens, outputTokens, usageEstimated, budgetWarnThresholdPct)
provides:
  - BACKUP_SCHEMA_VERSION = 14
  - BackupAiTeamRecordSchema.budgetWarnThresholdPct (int 1..100, optional)
  - BackupAiTeamMemberRecordSchema split usage (inputTokens/outputTokens/usageEstimated, optional)
  - BackupAiTeamAssignmentRecordSchema split usage (same three, optional)
  - every current-envelope fixture reads CURRENT_SCHEMA_VERSION
affects: [38-07, 38-09, 38-12]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bump the envelope literal and sweep every fixture onto CURRENT_SCHEMA_VERSION in the SAME changeset — no knowingly-broken intermediate gate"
    - "New optional numeric backup columns reuse aiTokensSchema; no second numeric schema"
    - "strictObject stays strict: an undeclared key is refused even on a row carrying a new field"

key-files:
  created: []
  modified:
    - src/validation/backupSchemas.ts
    - tests/services/backup/officeBackup.test.ts
    - tests/validation/backupSchemas.test.ts
    - tests/services/backup/v2Compatibility.test.ts
    - tests/services/backup/validateBackup.test.ts
    - tests/validation/backupSchemasTimer.test.ts
    - tests/services/github/githubPullRestore.test.ts
    - tests/backup/tabCheckpointBackup.test.ts
    - tests/noteAttachments.test.ts
    - tests/views/SettingsView.test.tsx

key-decisions:
  - "The version bump and the nine-file fixture sweep ship together: every one of those files is red between the two, so splitting would create a knowingly broken gate"
  - "validateBackup.ts is untouched — integer/non-negative guards live on the record schemas, and equality with the legacy scalar is not a valid invariant for pre-38 rows"
  - "The repetition test asserts on two restore hops (source -> db2 -> db3) rather than re-restoring one envelope, so it also proves the export projection does not drift"
  - "No denylist edit for ai_budget_warn_threshold_pct; a test now pins that it passes isSafeBackupSetting by construction"

requirements-completed: [AIO-BUDGET-02, AIO-BUDGET-08]

# Metrics
duration: 4min
completed: 2026-11-13
---

# Phase 38 Plan 06: Backup envelope v14 Summary

**Envelope v14 with validated split-usage and per-team threshold fields on team, member and attempt records, plus a nine-file fixture sweep onto `CURRENT_SCHEMA_VERSION` so the next bump is a one-line change**

## Performance

- **Duration:** 4 min
- **Started:** 2026-11-13T14:16:00Z
- **Completed:** 2026-11-13T14:20:12Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments

- `BACKUP_SCHEMA_VERSION` is now `14 as const`, with a doc comment naming exactly what version 14 adds; a v13 payload is rejected by `z.literal(BACKUP_SCHEMA_VERSION)` as designed under C-16/D-49.
- `BackupAiTeamRecordSchema` gained `budgetWarnThresholdPct` bounded to an integer 1..100 and optional, so a team with no override still validates.
- Member and assignment records both gained `inputTokens` / `outputTokens` / `usageEstimated` via the existing `aiTokensSchema` (`int().nonnegative()`), so a hand-edited backup carrying `-1` or `1.5` is refused before any write.
- All nine current-envelope fixtures and assertions now read `CURRENT_SCHEMA_VERSION`; `grep -rn "toBe(13)\|schemaVersion: 13" tests/` returns nothing.
- Round-trip proof: a team with threshold 65 and a lead member with 1200/300/true survive export → validate → restore byte-identical, and survive a second export/restore hop with stable row counts.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end "a split-usage row survives export → validate → restore"** — `b29775ee` (feat)
2. **Task 2: Sweep every current-envelope fixture onto `CURRENT_SCHEMA_VERSION`** — `5a06809e` (test)
3. **Task 3: Prove the envelope round-trips twice without accumulation** — `b8088cc3` (test)

**Plan metadata:** committed with this SUMMARY (docs)

## Files Created/Modified

- `src/validation/backupSchemas.ts` — `BACKUP_SCHEMA_VERSION = 14`; `budgetWarnThresholdPct` on the team record; split-usage trio on member and assignment records; `tokenUsage` retained for pre-38 restores
- `tests/services/backup/officeBackup.test.ts` — fixtures carry the new fields; `(AIO-BUDGET-02, D-23)` round-trip test; `(D-23, repetition)` two-hop test; version assertions read the constant
- `tests/validation/backupSchemas.test.ts` — new suite covering accept/reject for every new field, the undeclared `promptTokens` key, and the settings whitelist; current-version assertions read the constant
- `tests/services/backup/v2Compatibility.test.ts` — dropped the constant-vs-literal assertion; retitled to name the current envelope
- `tests/services/backup/validateBackup.test.ts`, `tests/validation/backupSchemasTimer.test.ts`, `tests/noteAttachments.test.ts` — assert against `CURRENT_SCHEMA_VERSION`, retitled away from pinned versions
- `tests/services/github/githubPullRestore.test.ts`, `tests/backup/tabCheckpointBackup.test.ts`, `tests/views/SettingsView.test.tsx` — hand-built current-envelope fixtures read the constant

## Decisions Made

- Bump and sweep in one changeset, as the plan's key link requires: nine files are red between the two steps.
- `validateBackup.ts` deliberately unchanged. Integer/non-negative enforcement already lives on the record schemas; a cross-invariant comparing split usage to the legacy `usedTokens` scalar would reject legitimate pre-38 rows.
- The repetition test hops through a third database instead of re-restoring the same envelope into one database, so it additionally proves the export projection is stable.
- `ai_budget_warn_threshold_pct` needed no denylist edit; a test now pins the whitelist behavior so a future suffix rule cannot silently drop it.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Scoped runs: `tests/services/backup/officeBackup.test.ts` 18/18, `tests/validation/backupSchemas.test.ts` 20/20, and the full nine-file verify set 98/98 green. `npx tsc --noEmit -p tsconfig.json` is clean.

## User Setup Required

None - no external service configuration required.

## Threat Surface Notes

- T-38-17 (tampering, `BackupAiTeam*RecordSchema`): mitigated — `strictObject` plus `aiTokensSchema` plus the 1..100 threshold bound, each with a rejection test (`-1`, `1.5`, `0`, `101`, `2.5`, `'65'`, `'yes'`).
- T-38-18 (information disclosure, new backup keys): mitigated — `inputTokens`, `outputTokens`, `usageEstimated`, `budgetWarnThresholdPct` match neither `FORBIDDEN_BACKUP_KEYS` nor the key regex; a test asserts an undeclared `promptTokens` key is still refused.
- T-38-19 (repudiation, envelope version): mitigated — the version is one literal; every fixture reads the constant; v13 restore fails loudly by design.
- T-38-SC: no package installed in this plan.

## Known Stubs

None.

## Next Phase Readiness

- Plan 07 can write split usage onto attempt rows and trust that the backup path round-trips it.
- Plan 12 still owes the SQLite/parity confirmation and the comment-only edits; no structural change is required by this plan.

## Self-Check: PASSED

- All ten files present and modified.
- Commits `b29775ee`, `5a06809e`, `b8088cc3` exist in `git log`.
