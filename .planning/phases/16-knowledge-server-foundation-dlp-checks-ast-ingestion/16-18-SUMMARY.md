---
phase: 16-knowledge-server-foundation-dlp-checks-ast-ingestion
plan: 18
subsystem: backup
tags: [backup, validation, zod, referential-integrity, cr-08]
requires: [16-15]
provides: [document-chat-backup-validation]
affects: [backup-service, docs-chat]
tech-stack:
  added: []
  patterns: [zod-refinement-boundary, stage-3-referential-check]
key-files:
  created: []
  modified:
    - src/validation/backupSchemas.ts
    - src/services/backup/validateBackup.ts
    - tests/services/backup/validateBackup.test.ts
    - tests/services/backup/knowledgeBackupRestore.test.ts
decisions:
  - "Accept 'document' as valid ChatScopeType in BackupChatThreadRecordSchema, requiring entityId via Zod refinement."
  - "Validate in Stage 3 that document-scoped chat threads reference existing Note UUIDs in imported payload before committing to restore."
metrics:
  duration: 4m
  completed_date: "2026-10-09"
---

# Phase 16 Plan 18: Close CR-08 Document Chat Scope Validation Summary

Validation and restore boundaries updated to accept document-scoped chat threads with referential integrity enforcement against imported notes.

## Completed Tasks

| Task | Name | Commit | Key Files |
| ---- | ---- | ------ | --------- |
| 1 | Accept document chat scope and validate its document reference | 58022ff | `src/validation/backupSchemas.ts`, `src/services/backup/validateBackup.ts`, `tests/services/backup/validateBackup.test.ts` |
| 2 | Prove document chat export, validation, restore, and rollback | 2a8bcff | `tests/services/backup/knowledgeBackupRestore.test.ts` |

## Key Changes

1. **Zod Trust Boundary (`src/validation/backupSchemas.ts`)**:
   - Added `'document'` to `BackupChatThreadRecordSchema.scopeType` enum.
   - Added refinement requiring `entityId` when `scopeType === 'document'`.

2. **Stage 3 Referential Validation (`src/services/backup/validateBackup.ts`)**:
   - Added referential integrity check ensuring `ct.scopeType === 'document'` has its `entityId` present in the imported `notes` set.
   - Reports `table: 'chatThreads'`, `field: 'entityId'` with clean descriptive error when reference is broken.

3. **Round-Trip & Rollback Lifecycle Testing (`tests/services/backup/knowledgeBackupRestore.test.ts`)**:
   - Verified rejection of document threads missing `entityId` or referencing absent Note IDs.
   - Verified export, validation, transactional restore, snapshot rollback, and bearer token exclusion.

## Deviations from Plan

None - executed according to plan and acceptance criteria.

## Self-Check: PASSED

- `src/validation/backupSchemas.ts` exists and updated
- `src/services/backup/validateBackup.ts` exists and updated
- Commits `58022ff` and `2a8bcff` exist in git history
- Targeted tests `knowledgeBackupRestore.test.ts` and `validateBackup.test.ts` pass
