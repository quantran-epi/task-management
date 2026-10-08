---
phase: 16-knowledge-server-foundation-dlp-checks-ast-ingestion
plan: "07"
subsystem: knowledge-ingestion-projection
tags: [sha256, incremental-projection, idempotency, atomic-snapshot, immutable-attempt]
requires:
  - phase: 16-05
    provides: Lossless isomorphic section chunker and shared hash policy
  - phase: 16-06
    provides: Exact browser-local four-way preview and immutable publish snapshot
provides:
  - Node SHA-256 adapter over shared normalized hash inputs
  - Incremental versioned chunk projection with representation reuse and exact mutation counters
  - Idempotent immutable attempts with per-set locking and atomic active snapshot promotion
affects: [16-08, 16-09, 16-11, 17, 18]
tech-stack:
  added: []
  patterns: [candidate isolation before promotion, idempotency before lock rejection, safe terminal error projection]
key-files:
  created:
    - knowledge-server/src/indexing/chunkHasher.ts
    - knowledge-server/src/indexing/incrementalProjector.ts
    - knowledge-server/src/indexing/snapshotStore.ts
    - knowledge-server/src/services/attemptService.ts
    - knowledge-server/tests/incrementalProjector.test.ts
    - knowledge-server/tests/attemptService.test.ts
  modified: []
key-decisions:
  - "Key reusable content by document UUID context plus normalized content hash queues while retaining independent occurrence metadata."
  - "Keep accepted content only in daemon-owned frozen input; public attempt resources and terminal candidates expose safe metadata, not payloads."
  - "Check attempt-key replay before the per-set active lock and promote only a complete candidate with one pointer swap."
patterns-established:
  - "Projection builds an isolated candidate against a cloned active snapshot and reuses prior representation IDs only for content-hash matches."
  - "Attempt locks remain held through terminal completion; different document sets remain independent."
requirements-completed: [INGEST-03, INGEST-04, INGEST-05]
duration: 12min
completed: 2026-10-08
---

# Phase 16 Plan 07: Incremental Projection and Atomic Attempts Summary

**Preview-compatible Node SHA-256 projection now reuses unchanged chunk representations while immutable, idempotent attempts atomically activate complete candidates and preserve prior active snapshots on failure.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-10-08T07:14:04Z
- **Completed:** 2026-10-08T07:26:17Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added Node `createHash('sha256')` adapter over shared newline-normalized document and chunk inputs, with browser hash parity coverage.
- Added four-way document/chunk projection, exact mutation counters, duplicate occurrence retention, movement-safe representation reuse, and recorded chunking policy version.
- Added isolated candidate storage and one-step active pointer promotion only after full projection success.
- Added immutable accepted payloads, attempt-key replay, one-active-attempt-per-set locking, concurrent different-set work, no cancellation API, and safe terminal errors.
- Proved failed multi-document candidates retain prior active snapshots byte-for-byte and do not serialize seeded secret content in attempt/candidate metadata.

## Task Commits

TDD gates committed per task:

1. **Task 1 RED: incremental projection behavior** — `64d05c2` (test)
2. **Task 1 GREEN: stable incremental projection** — `d4b1c27` (feat)
3. **Task 2 RED: attempt lifecycle behavior** — `0abd407` (test)
4. **Task 2 GREEN: immutable atomic attempts** — `72e965d` (feat)

## Files Created/Modified

- `knowledge-server/src/indexing/chunkHasher.ts` — Node-only SHA-256 and projection ID adapter.
- `knowledge-server/src/indexing/incrementalProjector.ts` — Four-way delta classification, representation reuse, candidate records, and mutation summary.
- `knowledge-server/src/indexing/snapshotStore.ts` — Candidate isolation, failure retention, cloned active reads, and atomic promotion.
- `knowledge-server/src/services/attemptService.ts` — Frozen inputs, idempotent accept, per-set serialization, async processing, and safe failures.
- `knowledge-server/tests/incrementalProjector.test.ts` — Cross-runtime hash parity and exact unchanged/change/remove/duplicate movement tests.
- `knowledge-server/tests/attemptService.test.ts` — Replay, concurrency, immutability, rollback, promotion, no-cancel, and secret serialization tests.

## Decisions Made

- Reusable representation matching uses per-document content-hash queues. Duplicate chunks each retain occurrence IDs/ranges while consuming distinct prior occurrence matches.
- Public attempt status omits accepted content. Frozen input remains separately inspectable inside service for processing/tests, preventing payload leakage through normal status serialization.
- Snapshot reads and candidate writes use structured clones so callers cannot mutate store-owned active state.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Restored locked knowledge-server dependencies**
- **Found during:** Task 1 RED verification
- **Issue:** Worktree lacked `knowledge-server/node_modules`, so parser imports failed before reaching expected missing implementation.
- **Fix:** Ran `npm --prefix knowledge-server ci --legacy-peer-deps` against committed lockfile; no dependency files changed.
- **Files modified:** None.
- **Verification:** RED then failed on missing `chunkHasher.ts` as intended; final targeted tests and build pass.
- **Committed in:** Not applicable; dependency hydration produced no repository changes.

**2. [Rule 1 - Bug] Corrected duplicate fixture to use byte-identical raw chunks**
- **Found during:** Task 1 GREEN verification
- **Issue:** Initial repeated sections differed because only one final occurrence contained trailing newline, so content hashes correctly differed.
- **Fix:** Constructed both occurrences from one identical section string.
- **Files modified:** `knowledge-server/tests/incrementalProjector.test.ts`
- **Verification:** Duplicate hash/reuse test passes with two independent occurrence IDs.
- **Committed in:** `d4b1c27`

**3. [Rule 3 - Blocking] Localized Node type reference to Node-only adapter**
- **Found during:** Task 1 knowledge-server build
- **Issue:** Existing server `tsconfig.json` does not globally load Node types, so new `node:crypto` import failed compilation.
- **Fix:** Added a file-local Node type reference in `chunkHasher.ts`, keeping plan scope and browser-neutral shared policy unchanged.
- **Files modified:** `knowledge-server/src/indexing/chunkHasher.ts`
- **Verification:** `npm run knowledge:build` passes.
- **Committed in:** `d4b1c27`

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking). **Impact on plan:** Required test/build correctness only; no package, protocol, retrieval, vector, graph, or answer scope added.

## Issues Encountered

- Initial `git merge master` conflicted in `.planning/STATE.md`. Coordinator authorized taking master version; merge completed before plan execution. Merge commit excluded from plan commit list.
- First Task 2 commit command timed out before staging/commit. Re-run with longer hook timeout completed normally; no partial commit existed.
- Local Node runtime was v20.19.5 while dependency metadata recommends Node 22.12+/24; targeted Vitest and TypeScript build still passed.

## Verification

- `npm run test:knowledge -- incrementalProjector.test.ts` — 4/4 passed.
- `npm run test:knowledge -- attemptService.test.ts` — 5/5 passed.
- `npm run test:knowledge -- incrementalProjector.test.ts attemptService.test.ts` — 9/9 passed across 2 files.
- `npm run knowledge:build` — passed with TypeScript 7 strict compilation.
- Scope scan across plan source files found no retrieval, vector, Neo4j, graph, full-text, or answer implementation.
- TDD sequence verified in git log: RED then GREEN for both tasks.

## Known Stubs

None. Empty arrays/maps are working accumulators, not UI or data-source placeholders.

## User Setup Required

None - no external service configuration required.

## Self-Check: PASSED

- All six plan-declared code/test files exist.
- Commits `64d05c2`, `d4b1c27`, `0abd407`, and `72e965d` exist in chronological order.
- Both task acceptance criteria and plan-level verification commands pass.
- `.planning/STATE.md`, `.planning/ROADMAP.md`, and `.planning/REQUIREMENTS.md` remained unchanged after prerequisite merge.

## Next Phase Readiness

- Server route wiring can consume `AttemptService.accept`, `getAttempt`, and `getActiveSnapshot` without changing projection semantics.
- Later graph/retrieval phases can rebuild from active versioned chunk snapshots; none were pulled into this plan.

---
*Phase: 16-knowledge-server-foundation-dlp-checks-ast-ingestion*
*Completed: 2026-10-08*
