# Phase 16 Plan 21: Terminal Attempt Polling & Atomic Manifest Reconciliation Summary

**One-liner:** Polled accepted publish attempts and atomically reconciled active document metadata from durable frozen submission manifests on In sync terminal success, cleaning up stale rows and retiring manifests while preserving failure states.

## Frontmatter
- **phase:** 16-knowledge-server-foundation-dlp-checks-ast-ingestion
- **plan:** 21
- **subsystem:** knowledge
- **tags:** [knowledge, reconciliation, indexeddb, polling, manifest, dlp, gap-closure]
- **dependency_graph:**
  - **requires:** [16-23]
  - **provides:** [atomic-terminal-reconciliation, manifest-retirement, resumed-polling]
  - **affects:** [src/db/repositories/publishAttemptRepo.ts, src/services/knowledge/knowledgeClient.ts, src/services/knowledge/publishOrchestrator.ts]
- **tech_stack:**
  - **added:** []
  - **patterns:** [Atomic Dexie multi-table transaction, strict 1:1 manifest-to-replacement validation, attempt-ID-only resumed polling, content-free metadata derivation]
- **key_files:**
  - **created:** []
  - **modified:**
    - src/db/repositories/publishAttemptRepo.ts
    - src/services/knowledge/knowledgeClient.ts
    - src/services/knowledge/publishOrchestrator.ts
    - tests/knowledge/publishStatus.test.ts
    - tests/knowledge/knowledgeClient.test.ts
- **decisions:**
  - Enforce exact 1:1 identity, count, and hash correspondence between replacement metadata rows and durable frozen submission manifest before executing atomic replacement.
  - Delete stale published document metadata only during authoritative terminal In sync activation in the same transaction that stores the terminal attempt and replacement rows.
  - Retire submittedDocuments manifest from attempt cache upon successful In sync commit while preserving it across Failed, Warning, and Publishing updates.
  - Load durable manifest via getCachedPublishAttempt in knowledgeClient to construct PublishedDocumentMetadata without rereading mutable local Notes.
  - Allow PublishSession.pollAcceptedAttempt to accept target attempt ID for resumed polling without requiring an in-memory preview.
- **metrics:**
  - **duration:** ~20m
  - **completed_date:** 2026-10-09

## Key Achievements

1. **Atomic Terminal Reconciliation & Stale Row Cleanup (Task 1):**
   - Strengthened `reconcileRemoteAttempt` to validate replacement metadata strictly against stored or supplied frozen manifests.
   - Replaced existing rows for the document set atomically, eliminating stale metadata for removed documents.
   - Retired the frozen submission manifest upon successful activation commit.
   - Preserved active document metadata and frozen manifests unchanged on Failed, Warning, or Publishing states.
   - Verified via unit tests that malformed hashes, mismatched counts, missing activeSnapshotId, and missing IDs reject before mutation.

2. **Resumed Terminal Polling from Frozen Manifest (Task 2):**
   - Updated `knowledgeClient` to retrieve cached attempts via `getCachedPublishAttempt` during terminal reconciliation.
   - Constructed `PublishedDocumentMetadata` rows exclusively from frozen submitted hashes and daemon `activeSnapshotId`.
   - Enabled `PublishSession.pollAcceptedAttempt(attemptId?)` to resume polling by attempt ID without an in-memory `ChangePreview`.
   - Verified that close/reopen followed by post-submit local Note edits keeps the published hash bound to the submitted snapshot (H1), resulting in accurate `Local changes` state.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Missing node_modules in worktree knowledge-server directory**
- **Found during:** Task 2 verification run
- **Issue:** Worktree environment lacked dependencies for local `knowledge-server` workspace imported in `changePreview.ts`.
- **Fix:** Copied `knowledge-server/node_modules` from main repo directory.
- **Files modified:** None (untracked node_modules).

## Verification Results

- `npm test -- tests/knowledge/publishStatus.test.ts`: 12 passed.
- `npm test -- tests/knowledge/knowledgeClient.test.ts`: 14 passed.
- `npm test -- tests/knowledge/publishDlpGate.test.ts`: 7 passed.
- Targeted three-file suite (33 tests across 3 files): 33 passed.

## Self-Check: PASSED
- `src/db/repositories/publishAttemptRepo.ts`: FOUND
- `src/services/knowledge/knowledgeClient.ts`: FOUND
- `src/services/knowledge/publishOrchestrator.ts`: FOUND
- Commit 48bf892: FOUND
- Commit 1ff4b16: FOUND
- Commit 6c9535c: FOUND
