---
phase: 16-knowledge-server-foundation-dlp-checks-ast-ingestion
plan: "02"
subsystem: database
tags:
  - document-set
  - publish-status
  - remote-reconciliation
  - bounded-history
  - tdd
dependency_graph:
  requires:
    - "16-01"
  provides:
    - documentSetRepo
    - publishAttemptRepo
    - getDocumentPublishStatuses
    - reconcileRemoteAttempt
    - markPollingUncertain
    - listRecentAttempts
  affects:
    - src/db/repositories/documentSetRepo.ts
    - src/db/repositories/publishAttemptRepo.ts
tech_stack:
  added: []
  patterns:
    - One-time folder snapshot capturing explicit ordered UUID membership (D-01)
    - Transport-free local change derivation via SHA-256 hash comparison (D-02)
    - Server-authoritative remote reconciliation with strict Zod validation (D-08, T-16-05)
    - Content-free attempt caching strictly rejecting bodies, tokens, and excerpts (T-16-06)
    - Polling uncertainty annotation preserving Publishing primary state (D-13, D-27)
    - Deterministic newest-10 attempt pruning per set by server timestamp (D-29, T-16-07)
key_files:
  created:
    - src/db/repositories/documentSetRepo.ts
    - src/db/repositories/publishAttemptRepo.ts
    - tests/knowledge/documentSetRepo.test.ts
    - tests/knowledge/publishStatus.test.ts
  modified: []
decisions:
  - D-01: Folder snapshot initializes explicit ordered UUID membership once; later folder moves or note edits do not alter set.
  - D-02: Local note body modifications derive Local changes state without network traffic or canonical Markdown mutation.
  - D-08: Server remains authoritative; only explicit terminal server responses enter cache.
  - D-13: Polling uncertainty keeps primary state Publishing and stores subordinate note; never infers failure.
  - D-27: Primary status follows six exact states: Failed > Warning > Publishing > Local changes > In sync > Never published.
  - D-29: Attempt history retains exactly newest 10 attempts per set by server timestamp.
metrics:
  duration: 12m
  completed_date: "2026-10-08"
---

# Phase 16 Plan 02: Stable Document Sets, Status Derivation & Bounded Remote Cache Summary

Implemented transactional document-set lifecycle, folder snapshots, aggregate status derivation, and bounded last-known remote attempt reconciliation.

## Accomplishments

1. **Transactional Document-Set Repository (Task 1)**:
   - Implemented `createDocumentSet`, `createDocumentSetFromFolder`, `updateDocumentSet`, `deleteDocumentSet`, `listDocumentSets`, and `getDocumentPublishStatuses` in `src/db/repositories/documentSetRepo.ts`.
   - Folder initialization takes one query over `notes` excluding folders and deleted notes, preserving selected order without creating live folder predicates (D-01).
   - Membership edits and set deletions operate strictly on set metadata tables and leave canonical Note records byte-for-byte intact (T-16-04, D-02).
   - Derived aggregate document publish state according to exact D-27 priority (`Failed` > `Warning` > `Publishing` > `Local changes` > `In sync` > `Never published`) and listed all containing sets (D-27, D-28).

2. **Server-Authoritative Attempt Reconciliation & Bounded Cache (Task 2)**:
   - Implemented `reconcileRemoteAttempt`, `markPollingUncertain`, and `listRecentAttempts` in `src/db/repositories/publishAttemptRepo.ts`.
   - Strict Zod validation rejects malformed status, non-UUIDs, bad counts, or non-hex hashes before opening write transactions (T-16-05).
   - Strict content-free schemas forbid body, tokens, request payload, or raw DLP excerpts (T-16-06).
   - Preserved `Publishing` primary state during network uncertainty while annotating subordinate connection error copy (D-13, D-27).
   - Bound local attempt history atomically to exactly the newest 10 attempts per set by server timestamp under mixed insertion orders (D-29, T-16-07).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Aligned repository input types with exactOptionalPropertyTypes**
- **Found during:** Production build (`npm run build`).
- **Issue:** TypeScript error TS2379 with `exactOptionalPropertyTypes: true` on optional `description?: string | undefined`.
- **Fix:** Added `undefined` union to optional interface properties in `documentSetRepo.ts` and pruned unused imports.
- **Files modified:** `src/db/repositories/documentSetRepo.ts`, `src/db/repositories/publishAttemptRepo.ts`, `tests/knowledge/publishStatus.test.ts`.
- **Commit:** b363f5e

## TDD Gate Compliance

- RED gate: `298052b` (Task 1 failing test), `f260403` (Task 2 failing test)
- GREEN gate: `33d9ef1` (Task 1 implementation), `3a947c9` (Task 2 implementation)
- REFACTOR gate: `b363f5e` (clean up unused imports and strict property types)

## Self-Check: PASSED

- FOUND: src/db/repositories/documentSetRepo.ts
- FOUND: src/db/repositories/publishAttemptRepo.ts
- FOUND: tests/knowledge/documentSetRepo.test.ts
- FOUND: tests/knowledge/publishStatus.test.ts
- FOUND commit 298052b: test(16-02): add failing test for document-set repository
- FOUND commit 33d9ef1: feat(16-02): implement transactional document-set repository
- FOUND commit f260403: test(16-02): add failing test for publish status reconciliation
- FOUND commit 3a947c9: feat(16-02): reconcile validated remote state and bound history
- FOUND commit b363f5e: refactor(16-02): clean up unused imports and strict property types
