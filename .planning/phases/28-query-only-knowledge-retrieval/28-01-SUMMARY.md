---
phase: 28-query-only-knowledge-retrieval
plan: 01
subsystem: knowledge-server
tags: [retrieval, federated, bm25, zod, fastify, indexeddb, snapshot, query-only]

requires:
  - phase: 18-retrieval-protocol
    provides: strict retrieval protocol schemas and federated fan-out service
provides:
  - Thin wire FederatedRetrievalRequestSchema ({query, limit?, setIds?}) and internal ResolvedFederatedRetrievalRequestSchema
  - Server-authoritative published-set discovery from SnapshotStore.listActiveSnapshots()
  - Server-local snapshot-lexical BM25 retrieval for published sets without a graph generation
  - Per-set router that falls back from graph evidence to published snapshots truthfully
  - Query-only /api/v1/retrieve with NO_PUBLISHED_SETS and all-unknown DEGRADED coverage behavior
affects: [28-query-only-knowledge-retrieval, 28-02, 28-03, 28-04, 28-05]

actuals:
  tokens: 13886
  tasks: 3
  commits: 2
  plan_head_before: c1c42e5c23297c77a9cf834d36d38c73ddc72fe4
  plan_head_after: 6b1f9cee0ac3c2a2cd2a7b693b214d4ee8e0847a

tech-stack:
  added: []
  patterns:
    - strict wire schema separated from resolved internal fan-out request
    - clone-on-read server-authoritative enumeration in deterministic setId order
    - server-local BM25 with Vietnamese NFD normalization (no cross-rootDir import)
    - truthful coverage ledger with UNAVAILABLE/NOT_SEARCHED_BUDGET states

key-files:
  created:
    - knowledge-server/src/services/snapshotLexicalRetrieval.ts
    - knowledge-server/src/services/perSetRetrievalRouter.ts
    - knowledge-server/src/services/publishedSetDiscovery.ts
    - knowledge-server/tests/snapshotLexicalRetrieval.test.ts
    - knowledge-server/tests/perSetRetrievalRouter.test.ts
    - knowledge-server/tests/publishedSetDiscovery.test.ts
  modified:
    - knowledge-server/src/types/retrievalProtocol.ts
    - knowledge-server/src/routes/retrieval.ts
    - knowledge-server/src/server.ts
    - knowledge-server/src/main.ts
    - knowledge-server/src/indexing/snapshotStore.ts
    - knowledge-server/src/services/federatedRetrievalService.ts
    - knowledge-server/tests/retrievalProtocol.test.ts
    - knowledge-server/tests/retrievalRoutes.test.ts

key-decisions:
  - "D-07: replaced the old setTierAssignments/budgets wire contract with a thin query-only request; no backward-compatibility branch"
  - "D-02: a published set without a retrieval generation stays searchable via snapshot-lexical BM25 instead of being reported as empty"
  - "D-05: explicit setIds are exact-matched; unknown ids are UNAVAILABLE and never broaden the search"
  - "T-28-16: all-unknown explicit setIds returns DEGRADED with the full UNAVAILABLE ledger, never NO_EVIDENCE or NO_PUBLISHED_SETS"
  - "runFederatedRetrieval keeps its resolved-request contract; only its input type was renamed"

patterns-established:
  - "Wire-to-resolved scoping: thin untrusted request parsed at the route, then resolved against server state before fan-out"
  - "Truthful per-set attribution: real published snapshotId only; never a fabricated gsnap id for a searched set"

requirements-completed: [SDLC-RET-01, SDLC-RET-02, SDLC-RET-05]

coverage:
  - id: D1
    description: "Query-only {query, limit} reaches a published snapshot and returns set/snapshot-attributed evidence"
    requirement: SDLC-RET-01
    verification:
      - kind: integration
        ref: "knowledge-server/tests/retrievalRoutes.test.ts#Phase 28 query-only retrieve route > accepts only {query, limit} and returns attributed evidence from the published snapshot"
        status: pass
    human_judgment: false
  - id: D2
    description: "Server-authoritative deterministic published-set discovery with explicit setIds restriction"
    requirement: SDLC-RET-05
    verification:
      - kind: unit
        ref: "knowledge-server/tests/publishedSetDiscovery.test.ts#publishedSetDiscovery"
        status: pass
    human_judgment: false
  - id: D3
    description: "Published-but-unbuilt set is searched through server-local snapshot lexical BM25"
    requirement: SDLC-RET-02
    verification:
      - kind: unit
        ref: "knowledge-server/tests/snapshotLexicalRetrieval.test.ts#snapshotLexicalRetrieval"
        status: pass
      - kind: unit
        ref: "knowledge-server/tests/perSetRetrievalRouter.test.ts#perSetRetrievalRouter"
        status: pass
    human_judgment: false
  - id: D4
    description: "Zero published sets and all-unknown explicit setIds return truthful HTTP 200 outcomes"
    requirement: SDLC-RET-05
    verification:
      - kind: integration
        ref: "knowledge-server/tests/retrievalRoutes.test.ts#Phase 28 query-only retrieve route > returns NO_PUBLISHED_SETS / returns DEGRADED with a full UNAVAILABLE ledger"
        status: pass
    human_judgment: false
  - id: D5
    description: "Live AI Chat / Analysis Mode / Telegram end-to-end query-only retrieval with zero local documents"
    requirement: SDLC-RET-01
    verification: []
    human_judgment: true
    rationale: "Cross-surface client wiring is delivered by later Phase 28 plans and requires a real app walkthrough; this plan covers the server path only."

duration: 15min
completed: 2026-11-17
status: complete
---

# Phase 28 Plan 01: Query-Only Knowledge Retrieval Server Path Summary

**Thin query-only `/api/v1/retrieve` with server-authoritative published-set discovery, snapshot-lexical BM25 fallback, and truthful DEGRADED/UNAVAILABLE coverage**

## Performance

- **Duration:** 15 min (active execution after dependency gate; wall clock includes checkpoint pause)
- **Started:** 2026-11-17T06:19:00Z
- **Completed:** 2026-11-17T06:34:58Z
- **Tasks:** 3 of 3 (Task 1 dependency install approved and verified by coordinator)
- **Files modified:** 14 (8 source, 6 test files)

## Accomplishments

- Query-only `{query, limit?, setIds?}` wire schema with a separate resolved internal fan-out request and query-only budgets (`DEFAULT_QUERY_ONLY_BUDGETS`)
- `SnapshotStore.listActiveSnapshots()` enumerates active published snapshots in deterministic ascending `setId` order using clone-on-read
- Server-local Okapi BM25 (k1=1.2, b=0.75) with Vietnamese diacritic normalization, title ×3 weighting, and full chunk provenance/attribution
- Per-set retrieval router: real graph evidence passes through; `PINNED_SNAPSHOT_UNAVAILABLE` or absent retrieval service falls back to the published snapshot; no snapshot returns truthful all-unavailable
- Route returns HTTP 200 `NO_PUBLISHED_SETS` for an empty server and HTTP 200 `DEGRADED` with a full `UNAVAILABLE` ledger when every explicit `setIds` entry is unknown
- Production wiring registers the query-only route when either a retrieval service or federated deps exists, and main.ts constructs federated deps regardless of Neo4j

## Task Commits

Each task was committed atomically:

1. **Task 1: Install existing knowledge-server dependency set** - coordinator-approved/out-of-band (no source commit; manifests git-unchanged)
2. **Task 2: One published set end to end** - `2bac9670` (feat)
3. **Task 3: Authoritative discovery, explicit restriction, all-unknown DEGRADED** - `2bac9670` (feat, shared implementation commit)
4. **Regression fix: omit undefined options argument** - `6b1f9cee` (fix)

**Plan metadata:** this SUMMARY commit (docs)

_Note: Tasks 2 and 3 share one implementation commit because the test runner was unavailable behind the blocking-human install gate; see Deviations._

## Files Created/Modified

- `knowledge-server/src/types/retrievalProtocol.ts` - thin wire schema, resolved request, coverage states/ledger, NO_PUBLISHED_SETS outcome, query-only budgets
- `knowledge-server/src/routes/retrieval.ts` - query-only handler, NO_PUBLISHED_SETS and DEGRADED branches, content-free logging
- `knowledge-server/src/indexing/snapshotStore.ts` - deterministic `listActiveSnapshots()`
- `knowledge-server/src/services/snapshotLexicalRetrieval.ts` - server-local Vietnamese BM25 retrieval from published snapshots
- `knowledge-server/src/services/perSetRetrievalRouter.ts` - graph-lexical per-set readiness router
- `knowledge-server/src/services/publishedSetDiscovery.ts` - server-authoritative scope resolver
- `knowledge-server/src/services/federatedRetrievalService.ts` - input type renamed to resolved request, fan-out behavior unchanged
- `knowledge-server/src/server.ts`, `knowledge-server/src/main.ts` - route registration and production dependency wiring independent of Neo4j
- Six focused test files: `snapshotLexicalRetrieval.test.ts`, `perSetRetrievalRouter.test.ts`, `publishedSetDiscovery.test.ts`, `retrievalProtocol.test.ts`, `retrievalRoutes.test.ts` (extended)

## Decisions Made

- Kept the existing `runFederatedRetrieval` shape and behavior; renamed only its input type to `ResolvedFederatedRetrievalRequest`.
- Readiness is consumed for attribution but never removes a published set from the fleet; a `PUBLISHED_ONLY` set is assigned and searched lexically.
- The resolver emits `UNAVAILABLE` rows only for genuinely unknown ids and `NOT_SEARCHED_BUDGET` for overflow; searched sets get their ledger from the federated fan-out (28-03).
- Route merges the resolver's UNAVAILABLE coverage into the federated response so a mixed known/unknown explicit restriction keeps its truthful ledger.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Per-set route call passed an explicit `undefined` third argument**
- **Found during:** Focused test verification after the dependency gate
- **Issue:** The pre-existing route regression test expects `retrievalService.retrieve(setId, request)` with exactly two arguments; the new handler always passed a third `undefined` options value.
- **Fix:** Spread a conditional options array so no third argument is passed when there is no abort signal.
- **Files modified:** `knowledge-server/src/routes/retrieval.ts`
- **Verification:** All 59 focused tests pass; `tsc` build clean.
- **Committed in:** `6b1f9cee`

**2. [Process deviation] Task 3 `tdd="true"` RED→GREEN sequence not executed separately**
- **Found during:** Task 3 execution (before dependency gate approval)
- **Issue:** `knowledge-server/node_modules` had no `vitest`/`fastify`/`zod`; the blocking-human gate forbade installing packages before confirmation, so a failing RED test commit could not be produced or verified.
- **Fix:** Implemented Tasks 2 and 3 together in one `feat` commit after approval, then ran the exact focused test command and fixed the one real failure. Tests and implementation are both committed and green; no separate `test(...)` RED commit exists.
- **Files modified:** all 14 plan files
- **Verification:** `npm --prefix knowledge-server test -- tests/snapshotLexicalRetrieval.test.ts tests/perSetRetrievalRouter.test.ts tests/publishedSetDiscovery.test.ts tests/retrievalProtocol.test.ts tests/retrievalRoutes.test.ts` → 5 files, 59 tests passed.
- **Committed in:** `2bac9670`, `6b1f9cee`

**3. [Scope note] Legacy federated route fixtures still use the old wire shape**
- **Found during:** Static review after wire-schema narrowing
- **Issue:** `knowledge-server/tests/federatedRetrieval.test.ts` (owned by Phase 28 plan 03) still builds requests with `setTierAssignments`/`budgets`.
- **Fix:** Left untouched here per D-07 (no compatibility branch) and plan file ownership; the resolved fan-out contract is preserved so 28-03 can migrate fixtures without behavior changes.
- **Files modified:** none
- **Verification:** Out of scope for this plan's focused test command; `tsc` build is unaffected because that file is a test.
- **Committed in:** N/A

---

**Total deviations:** 2 auto-fixed/corrected (1 bug fix, 1 TDD process deviation) + 1 scope note
**Impact on plan:** The bug fix preserves existing route behavior. The TDD deviation is due solely to the gated dependency install; all tests now pass and the implementation is verified. No scope creep, no new dependency, no deleted files.

## Issues Encountered

- Dependency install required `NODE_TLS_REJECT_UNAUTHORIZED=0` due to proxy certificate; the coordinator approved and restored the one-line npm lockfile rewrite, leaving both manifests git-unchanged. Verified locally: `INSTALLED` and empty `git status --porcelain` for both manifests.
- Full suite intentionally not run (project rule: over an hour). Only the five plan-specified focused test files were run.

## Authentication Gates

- Task 1 dependency install was a `checkpoint:human-verify` with `gate="blocking-human"`; it was never auto-approved. The coordinator reported human approval and the gate was independently re-verified before resuming.

## User Setup Required

None - the dependency install was completed and verified by the coordinator; no external service configuration was added.

## Next Phase Readiness

Ready for Phase 28 plan 02. Server query-only retrieval is functional in isolation; client/cross-surface wiring and full live-surface verification remain for later plans. `tests/federatedRetrieval.test.ts` must be migrated to the resolved request shape in 28-03. Manual live verification (publish one set, POST `{query, limit}` to confirm `items[].setId`/`snapshotId`) is deferred to the phase-level UAT with the knowledge daemon running.

---
*Phase: 28-query-only-knowledge-retrieval*
*Completed: 2026-11-17*

## Self-Check: PASSED

- All 3 new source modules, 3 new test files and this SUMMARY exist on disk.
- Both task/implementation commits (`2bac9670`, `6b1f9cee`) are ancestors of HEAD.
- Focused verification: 5 files, 59 tests passed; `npm --prefix knowledge-server run build` clean.
- Dependency manifests `knowledge-server/package.json` and `knowledge-server/package-lock.json` remain git-unchanged.
