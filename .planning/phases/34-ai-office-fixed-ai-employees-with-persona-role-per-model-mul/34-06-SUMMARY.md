---
phase: 34-ai-office-fixed-ai-employees-with-persona-role-per-model-mul
plan: 06
subsystem: backup
tags: [backup, ai-office, dexie, zod, schema-v11]
requires:
  - 34-01 (AI Office types, Zod schemas, Dexie version 17)
provides:
  - AI Office tables and chat attribution in the five-file backup contract
affects:
  - src/types/backup.ts
  - src/validation/backupSchemas.ts
  - src/services/backup/exportBackup.ts
  - src/services/backup/validateBackup.ts
  - src/services/backup/restoreBackup.ts
tech-stack:
  added: []
  patterns:
    - optional-absent table validation (`rawTables.X !== undefined ? validateTable(...) : undefined`)
    - conditional clear list mirroring `clearKnowledge`
key-files:
  created:
    - tests/services/backup/officeBackup.test.ts
  modified:
    - src/types/backup.ts
    - src/validation/backupSchemas.ts
    - src/services/backup/exportBackup.ts
    - src/services/backup/validateBackup.ts
    - src/services/backup/restoreBackup.ts
    - tests/services/backup/exportBackup.test.ts
decisions:
  - D-34 honored: envelope stays v11, all six tables optional-absent
  - AI Office record schemas use `strictObject` so a forbidden key is rejected, not stripped
metrics:
  duration: ~12 min
  completed: 2026-11-08
---

# Phase 34 Plan 06: AI Office Backup Contract Summary

Six AI Office tables and the four chat-message attribution fields now round-trip through export → validate → restore while the envelope stays at v11 and every new table remains optional-absent.

## What Was Built

**Task 1 — types and schemas** (`122fec22`)
- `BackupTableData` / `BackupTableCounts` gained `aiEmployees`, `aiLeads`, `aiSkills`, `aiTeams`, `aiTeamMembers`, `aiTeamLinks` as optional entries.
- Six `BackupAi*RecordSchema` exports mirroring `src/types/aiOffice.ts`, with the same length caps as `aiOfficeSchemas.ts` (name 60, role 60, capability 300, skill description 300), `uuidSchema` ids, and `z.number().int().nonnegative()` token counts.
- `'team'` added to the `BackupChatThreadRecordSchema` `scopeType` enum (the model union already carried it).
- `BackupChatMessageRecordSchema` declares `agentId`, `agentName`, `agentKind`, `messageKind` explicitly — Pitfall 6, the plain `z.object` would otherwise strip them on restore.

**Task 2 — export / validate / restore** (`1b10c764`)
- `exportBackupPayload` reads the six tables and adds them to `tables` and `counts`; `CURRENT_SCHEMA_VERSION` untouched at 11.
- `validateBackupPayload` validates each table only when present, and a new Stage 5 checks referential integrity: member/link `teamId` → `aiTeams`, team `leadId` → `aiLeads`, employee `skillId` → `aiSkills` when present.
- `restoreBackupPayload` adds the six tables to `RESTORE_TABLES`, clears them only when at least one payload key is defined (mirroring `clearKnowledge`), and bulk-adds after the existing adds. `captureSnapshot` includes them so rollback restores the pre-import state.

**Task 3 — proof** (`54d1e13c`)
- `tests/services/backup/officeBackup.test.ts`: full round-trip into a fresh database (six tables plus a `team`-scoped thread and an attributed message, asserting all four attribution fields), a v11 payload without AI Office keys that validates and leaves local rows intact, and two negative cases (dangling `aiTeamMembers.teamId`, `agentKind: 'manager'`).

## Verification

- `npx vitest run tests/services/backup` — 7 files, 51 tests passed.
- `npx tsc --noEmit` — clean.
- `CURRENT_SCHEMA_VERSION` still 11; `v2Compatibility.test.ts` still asserts `=== 11`.
- `git diff --stat` for `package.json`/`package-lock.json` against base — empty (T-34-SC).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Existing export counts assertions failed after the export gained six keys**
- **Found during:** Task 2 verification
- **Issue:** `tests/services/backup/exportBackup.test.ts` asserts the counts object with `toEqual`, so the six new zero-valued keys broke two tests.
- **Fix:** Added the six `ai*: 0` entries to both expected counts objects. The export change itself is required by the plan; the assertions were stale-by-construction.
- **Files modified:** `tests/services/backup/exportBackup.test.ts`
- **Commit:** `1b10c764`

### Notes

- Worktree HEAD was `af9e2715` (one commit ahead of the stated base `2cc78790`, the workbench tab-reload commit). Base is an ancestor; no rewrite performed, as required.
- `BackupChatThreadRecordSchema` has no `team`-requires-`entityId` refinement, per plan instruction — `buildScopeKey` already requires it.
- No new packages installed.

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, or trust-boundary surface beyond the backup file boundary already covered by T-34-27..T-34-31.

## Self-Check: PASSED

- `src/types/backup.ts` — FOUND
- `src/validation/backupSchemas.ts` — FOUND
- `src/services/backup/exportBackup.ts` — FOUND
- `src/services/backup/validateBackup.ts` — FOUND
- `src/services/backup/restoreBackup.ts` — FOUND
- `tests/services/backup/officeBackup.test.ts` — FOUND
- Commits `122fec22`, `1b10c764`, `54d1e13c` — FOUND
