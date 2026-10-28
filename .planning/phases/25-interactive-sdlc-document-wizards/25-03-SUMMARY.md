---
phase: 25-interactive-sdlc-document-wizards
plan: 03
subsystem: wizard-persistence
tags: [wizard, sdlc, zod, indexeddb, backup]

requires:
  - phase: 25-interactive-sdlc-document-wizards
    provides: "Pinned Phase 25 persistence and payload-cap decisions from Plans 25-01 and 25-02"
provides:
  - "Strict wizard lifecycle, identity, revision, artifact, and SDLC DocumentSet contracts"
  - "Chat repository validation for project-scoped wizard snapshots"
  - "Backup schema parity and pre-restore referential validation for wizard metadata"
affects: [25-05, 25-06, 25-11, 25-interactive-sdlc-document-wizards]

tech-stack:
  added: []
  patterns:
    - "Zod strict discriminated lifecycle schemas with application-owned transition guards"
    - "Optional model metadata preserves historical records without Dexie migration"
    - "Backup validation rejects cross-project, orphan artifact, and duplicate SDLC mappings before restore"

key-files:
  created:
    - "src/services/ai/wizardSchemas.ts"
    - "tests/ai/wizardState.test.ts"
    - "tests/backup/wizardBackup.test.ts"
  modified:
    - "src/types/models.ts"
    - "src/validation/schemas.ts"
    - "src/validation/knowledgeSchemas.ts"
    - "src/db/repositories/chatRepo.ts"
    - "src/db/repositories/documentSetRepo.ts"
    - "src/validation/backupSchemas.ts"
    - "src/services/backup/validateBackup.ts"

decisions:
  - "Keep Phase 25 fields optional on ChatMessage, Note, and DocumentSet so historical records parse without a Dexie schema bump."
  - "Use exact project/thread/session/revision identity checks at chat-save and backup-validation boundaries."
  - "Enforce the 524,288 UTF-8 byte render payload cap after deterministic JSON serialization."
  - "Require source artifact IDs and hashes for PL03B, PL07, and CAB metadata; require packHash/path for change-pack entries."

metrics:
  duration: 7h16m
  completed: 2026-10-28
  tasks: 2
  files: 10
---

# Phase 25 Plan 03: Wizard State and Backup Contracts Summary

**Strict lifecycle and artifact identity contracts now survive chat persistence and backup restore without weakening historical-data compatibility.**

## Accomplishments

- Added `wizardSchemas.ts` with strict skill/status/render payload schemas, lifecycle snapshots, artifact metadata, exact SDLC set metadata, stable transition error codes, and idempotency-key construction.
- Added legal transition enforcement for collecting, gap fill, review, approval, export, completion, edit, and abandonment paths.
- Added monotonic input/draft revision and exact project/thread/session identity checks.
- Enforced the 524,288 UTF-8 byte bounded render payload cap.
- Added optional `ChatMessage.wizard`, `Note.sdlcArtifact`, and `DocumentSet.sdlc` model fields without adding tables, indexes, or Dexie migrations.
- Validated wizard snapshots before `saveMessage`; project-scoped thread/entity identity is checked before transaction writes.
- Extended backup schemas to retain wizard, artifact, SDLC set, and presentation metadata instead of stripping unknown fields.
- Added backup reference checks for wizard project/thread/artifact identity, artifact source notes, and one SDLC set per project.
- Added round-trip and invalid-reference tests using fake IndexedDB.

## Verification

Targeted tests passed:

```text
npm test -- tests/ai/wizardState.test.ts tests/backup/wizardBackup.test.ts tests/ai/chatRepo.test.ts
3 test files passed, 14 tests passed
```

Regression coverage also passed:

```text
npm test -- tests/ai/wizardState.test.ts tests/backup/wizardBackup.test.ts tests/ai/chatRepo.test.ts tests/services/backup/validateBackup.test.ts tests/services/backup/restoreBackup.test.ts tests/services/backup/exportBackup.test.ts
6 test files passed, 34 tests passed
```

## Task Commits

1. `6dbda45` — `test(25-03): add failing wizard state contracts`
2. `30f9c65` — `feat(25-03): add durable wizard state contracts`
3. `32cb348` — `test(25-03): add failing wizard backup parity`
4. `bcbbf3e` — `feat(25-03): preserve wizard metadata through backups`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected transition error ordering for stale review edits**
- **Found during:** Task 1 verification
- **Issue:** A review-to-gap-fill edit with unchanged input revision returned an edit-specific code instead of the required stable stale-revision code.
- **Fix:** Reused `WIZARD_INPUT_REVISION_STALE` for revision-regression and unchanged-revision edit rejection.
- **Files modified:** `src/services/ai/wizardSchemas.ts`
- **Commit:** `30f9c65`

**2. [Rule 1 - Bug] Applied payload cap to serialized render content rather than only title fields**
- **Found during:** Task 1 verification
- **Issue:** The first test placed oversized content in a field capped by the inner schema, so the outer byte-cap assertion did not exercise the intended boundary.
- **Fix:** Kept inner content validation permissive and applied the UTF-8 byte cap to deterministic serialized `renderPayload`; corrected the test fixture to overflow `markdown`.
- **Files modified:** `src/services/ai/wizardSchemas.ts`, `tests/ai/wizardState.test.ts`
- **Commit:** `30f9c65`

None - no architectural deviations, package installs, authentication gates, or out-of-scope fixes.

## Known Stubs

None. No production stub or placeholder blocks the plan goal.

## Self-Check: PASSED

- `src/services/ai/wizardSchemas.ts` exists and exports required lifecycle, artifact, metadata, transition, and idempotency contracts.
- `tests/ai/wizardState.test.ts` and `tests/backup/wizardBackup.test.ts` exist and pass.
- All task commits exist in git history: `6dbda45`, `30f9c65`, `32cb348`, `bcbbf3e`.
- `STATE.md` and `ROADMAP.md` were not modified, per orchestrator instruction.

---
*Phase: 25-interactive-sdlc-document-wizards*
*Plan: 03*
*Completed: 2026-10-28*
