---
phase: 19-grounded-assistant-provenance-citations-offline-fallback
plan: 10
subsystem: storage
tags: [dexie, indexeddb, backup, zod, grounding, provenance, security]

requires:
  - phase: 19-02
    provides: ChatMessageGroundingSchema, GroundedAnswerSchema, PersistedCitationSchema
provides:
  - ChatMessage.grounding additive property on domain model
  - chatRepo.saveMessage write-boundary validation and persistence
  - BackupChatMessageRecordSchema grounding validation and boundary checks
  - Secret forbid-list and size-limit enforcement in backup validation
affects: [19-11, 19-12, 19-13, 19-14, chat-ui, backup-sync]

tech-stack:
  added: []
  patterns: [additive unindexed Dexie storage, strict boundary safeParse, recursive forbid-list scanning, exactOptionalPropertyTypes compliance]

key-files:
  created:
    - tests/db/chatRepoGrounding.test.ts
    - tests/backup/backupChatGrounding.test.ts
  modified:
    - src/types/models.ts
    - src/db/repositories/chatRepo.ts
    - src/validation/backupSchemas.ts

key-decisions:
  - "ChatMessage.grounding is unindexed; no Dexie schema version bump beyond V10 needed."
  - "chatRepo.saveMessage enforces ChatMessageGroundingSchema with INVALID_GROUNDING code to reject malformed records on save."
  - "Backup validation scans for secret keys (apiKey, bearerToken, etc.) recursively with FORBIDDEN_FIELD code before strict parsing."
  - "Backup validation enforces size caps (20 citations, 1200 char excerpt, 20 paths, 10 conflicts) with GROUNDING_SIZE_EXCEEDED code."

patterns-established:
  - "Additive unindexed entity properties: omit from Dexie store indexes, conditional spread on save, passthrough on read."
  - "Defense-in-depth backup trust boundary: recursive forbid-list + structural limits + schema safeParse."

requirements-completed: [ANSWER-01, ANSWER-02, ANSWER-07]

duration: 15m
completed: 2026-10-11
---

# Phase 19 Plan 10: Grounded Chat Persistence & Backup Trust Boundary Summary

Additive persistence of structured grounding (`ChatMessageGrounding`) in IndexedDB alongside assistant messages and backup trust boundary validation with secret and size limits.

## What Was Done

### Task 1: Extend ChatMessage model + chatRepo to persist grounding (D-46)
- Extended `ChatMessage` interface in `src/types/models.ts` with optional `grounding?: ChatMessageGrounding | undefined`.
- Extended `SaveMessageInput` and `saveMessage` in `src/db/repositories/chatRepo.ts` with runtime validation using `ChatMessageGroundingSchema.safeParse`.
- Throws explicit `INVALID_GROUNDING` error on malformed grounding payload.
- Persisted `grounding` via conditional spread `...(input.grounding ? { grounding: input.grounding } : {})` without bumping Dexie schema version (remains V10).
- Created `tests/db/chatRepoGrounding.test.ts` covering 6 test cases for round-trip, absent grounding, invalid grounding rejection, V10 schema stability, ordering, and 1,200 character excerpts.
- Commit: `a940bbf`

### Task 2: Extend backup Zod schema + round-trip test (D-46, D-48)
- Extended `BackupChatMessageRecordSchema` in `src/validation/backupSchemas.ts` with optional `grounding` field.
- Implemented recursive `findForbiddenKeyInObject` scanning for secret-bearing and trace fields (`apiKey`, `bearerToken`, `systemPrompt`, `rawModelResponse`, `authorization`), emitting `FORBIDDEN_FIELD` issue code (AI-SPEC §7, T-19-30).
- Implemented size cap refinements: max 20 citations, max 1,200 chars per citation excerpt, max 20 paths, max 10 conflicts, emitting `GROUNDING_SIZE_EXCEEDED` issue code (D-48, T-19-31).
- Maintained compatibility with `exactOptionalPropertyTypes: true` across models and backup validators.
- Created `tests/backup/backupChatGrounding.test.ts` covering 8 test cases for full backup round-trip, citation count limits, excerpt length limits, secret leakage rejection, backwards compatibility with absent grounding, local authority, and server authority hash invariants.
- Commit: `de2f0fd`

## Deviations from Plan

None - plan executed exactly as written.

## Threat Surface Scan

| Flag | File | Description |
|------|------|-------------|
| None | N/A | No new network endpoints, external trust boundary expansions, or unauthenticated pathways introduced. All secrets actively rejected at backup boundary. |

## Verification

Targeted Vitest tests executed:
```bash
npm test -- tests/backup/backupChatGrounding.test.ts tests/db/chatRepoGrounding.test.ts tests/ai/groundedAnswerSchemas.test.ts
```
Result: 3 test files passed, 24 tests passed.

Dexie schema check:
`db.verno` remains 10 (no schema migration bump).

## Self-Check: PASSED
- FOUND: `src/types/models.ts`
- FOUND: `src/db/repositories/chatRepo.ts`
- FOUND: `src/validation/backupSchemas.ts`
- FOUND: `tests/db/chatRepoGrounding.test.ts`
- FOUND: `tests/backup/backupChatGrounding.test.ts`
- FOUND commit `a940bbf`: `feat(19-10): persist chat message grounding in chatRepo and domain models`
- FOUND commit `de2f0fd`: `feat(19-10): extend backup schema and validate chat grounding boundaries`
