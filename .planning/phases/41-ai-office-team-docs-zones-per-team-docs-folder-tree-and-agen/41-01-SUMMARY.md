---
phase: 41-ai-office-team-docs-zones
plan: 01
subsystem: ai-office/storage
tags: [dexie, schema-migration, backup-validation, planning-docs]
requires:
  - "Dexie V26 (phase 39)"
provides:
  - "SCHEMA_V27 + LATEST_SCHEMA_VERSION = 27"
  - "AiTeam.docsFolderId, AiTeamMember.docsFolderId"
  - "docsFolderId in BackupAiTeamRecordSchema and BackupAiTeamMemberRecordSchema"
affects:
  - "src/db/repositories/teamDocsRepo.ts (plan 41-02 reads/writes docsFolderId)"
  - "src/services/ai/office/teamTools.ts (plan 41-03)"
tech-stack:
  added: []
  patterns:
    - "additive Dexie version with no .upgrade() hook"
    - "optional backup field so a pre-phase export still restores under z.strictObject"
key-files:
  created: []
  modified:
    - src/db/schema.ts
    - src/db/index.ts
    - src/types/aiOffice.ts
    - src/validation/backupSchemas.ts
    - tests/db/schemaV26Migration.test.ts
    - tests/services/ai/office/aiTeamRepo.test.ts
    - tests/services/backup/officeBackup.test.ts
    - .planning/ROADMAP.md
    - .planning/REQUIREMENTS.md
decisions:
  - "D-13/D-15: docsFolderId is unindexed row payload, so V27 spreads SCHEMA_V26 byte-identically and needs no upgrade hook"
  - "D-14: docsFolderId is uuidSchema.optional() in both strictObjects; not added to FORBIDDEN_BACKUP_KEYS"
  - "D-01: write_doc is the member write path; create_note/update_note wording corrected in ROADMAP criterion 2 and AIO-DOCS-02, mechanism added to criterion 4 and AIO-DOCS-04"
metrics:
  duration: "~5 min"
  completed: "2026-11-15T04:42:48Z"
  tasks: 3
  files_changed: 9
---

# Phase 41 Plan 01: Storage and contract foundation Summary

Dexie V27 with two unindexed `docsFolderId` row fields, mirrored in both AI team backup record schemas, plus the four planning statements that named the superseded `create_note` write path.

## What Was Built

**Task 1 — Dexie V27 (`6505cccf`)**
- `src/db/schema.ts`: `SCHEMA_V27 = { ...SCHEMA_V26 } as const` with a comment naming Phase 41 D-13/D-15; `LATEST_SCHEMA_VERSION` 26 → 27.
- `src/db/index.ts`: imports `SCHEMA_V27`, registers `this.version(27).stores(SCHEMA_V27)` after the `version(26)` block with no `.upgrade()` hook (D-12, C-16).
- Three `LATEST_SCHEMA_VERSION` pins bumped 26 → 27 in `tests/db/schemaV26Migration.test.ts:74` (test title also renamed), `tests/services/ai/office/aiTeamRepo.test.ts:812`, `tests/services/backup/officeBackup.test.ts:274`. Every V25→V26 upgrade assertion left untouched.

**Task 2 — type and backup fields (`4c5c2f9c`)**
- `src/types/aiOffice.ts`: `docsFolderId?: string | undefined` on `AiTeam` (D-13) and `AiTeamMember` (D-13a), JSDoc in the `mcpEnabled` style.
- `src/validation/backupSchemas.ts`: `docsFolderId: uuidSchema.optional()` in `BackupAiTeamRecordSchema` and `BackupAiTeamMemberRecordSchema` (D-14). `FORBIDDEN_BACKUP_KEYS` untouched — a UUID is not free text.

**Task 3 — planning wording (`64fb2f42`)**
- `.planning/ROADMAP.md` criterion 2 and `.planning/REQUIREMENTS.md` AIO-DOCS-02: corrected to name the team tool `write_doc` (actions list/create/update) as the member write path.
- `.planning/ROADMAP.md` criterion 4 and `.planning/REQUIREMENTS.md` AIO-DOCS-04: mechanism added — DB-tool mutations stay outside `EMPLOYEE_READ_ONLY_ALLOWLIST` and are refused by the runtime read-only gate; `write_doc` is the only write path.
- Criteria 1/3/5/6, AIO-DOCS-01/03/05/06, all checkbox states, and the Phase 42 block untouched.

## Verification

- `npx vitest run tests/db/tableListParity.test.ts tests/db/schemaV26Migration.test.ts tests/services/ai/office/aiTeamRepo.test.ts tests/services/backup/officeBackup.test.ts` — 4 files, 96 tests passed.
- `npx tsc --noEmit` — clean.
- `grep -n 'LATEST_SCHEMA_VERSION = 27' src/db/schema.ts` — matched at :198.
- `grep -n 'version(27).stores(SCHEMA_V27)' src/db/index.ts` — matched at :671.
- Task 3 six-count verify command — exited 0.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — the two new fields are `uuidSchema` inside existing `z.strictObject`s (T-41-01/T-41-02 mitigated as planned); V27 adds no index and no upgrade hook (T-41-03 accepted).

## Self-Check: PASSED

- `src/db/schema.ts` — FOUND (`SCHEMA_V27`, `LATEST_SCHEMA_VERSION = 27`)
- `src/db/index.ts` — FOUND (`version(27).stores(SCHEMA_V27)`)
- `src/types/aiOffice.ts` — FOUND (2 × `docsFolderId?: string | undefined;`)
- `src/validation/backupSchemas.ts` — FOUND (2 × `docsFolderId: uuidSchema.optional()`)
- commits `6505cccf`, `4c5c2f9c`, `64fb2f42` — FOUND in `git log`
