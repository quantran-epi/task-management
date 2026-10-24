---
phase: 24-graph-retrieval-optimization
plan: 02
subsystem: knowledge-server/retrieval
tags: [graphrag, seed-preservation, diagnostics, outcomes, regression]
requires:
  - 24-01
provides:
  - "Seed-preserving repository traversal without ad-hoc relation compensation"
  - "Bounded entity/edge/path counts alongside legacy itemCount"
  - "SEED_ONLY outcome with SEED_FOUND_NO_RELATION"
  - "diagnostics.failedSeeds and bounded content-free stageDiagnostics"
affects:
  - knowledge-server/src/graph/neo4jRepository.ts
  - knowledge-server/src/retrieval/contracts.ts
  - knowledge-server/src/retrieval/graphTraversal.ts
  - knowledge-server/src/services/retrievalService.ts
  - knowledge-server/src/types/retrievalProtocol.ts
tech-stack:
  added: []
  patterns:
    - "Resolve seeds independently of path completion"
    - "Strict stage diagnostics with no free-text keys"
    - "Graph evidence exempt from text-corroboration gate"
key-files:
  created:
    - knowledge-server/tests/graphSeedPreservation.test.ts
  modified:
    - knowledge-server/src/graph/neo4jRepository.ts
    - knowledge-server/src/retrieval/contracts.ts
    - knowledge-server/src/retrieval/graphTraversal.ts
    - knowledge-server/src/services/retrievalService.ts
    - knowledge-server/src/types/retrievalProtocol.ts
    - knowledge-server/tests/fixtures/pilotGoldEntities.ts
    - knowledge-server/tests/fixtures/retrievalStubs.ts
    - knowledge-server/tests/graphTraversal.test.ts
    - knowledge-server/tests/neo4jRetrievalIntegrity.test.ts
    - knowledge-server/tests/retrievalProtocol.test.ts
    - knowledge-server/tests/retrievalService.test.ts
decisions:
  - "Seeds resolve through the snapshot-scoped resolveEntities query, independent of path assembly"
  - "SEED_ONLY requires an all-entity response with zero edges, paths, and conflicts"
  - "Graph items bypass the fulltext/vector text-corroboration gate; path closure runs unconditionally"
  - "Stage diagnostics carry only stage names, enum statuses, codes, counts, booleans, and timings"
metrics:
  duration: 13m
  completed: 2026-10-24
---

# Phase 24 Plan 02: Seed Preservation, SEED_ONLY, and Bounded Stage Diagnostics Summary

Resolved seeds now survive traversal and reach the response as `SEED_ONLY` with `SEED_FOUND_NO_RELATION` instead of collapsing into `NO_EVIDENCE`; graph status exposes separate entity/edge/path counts, dropped seeds surface in `diagnostics.failedSeeds`, and every stage emits a strict content-free diagnostic row.

## Objective

Close the root cause chain from D-01/D-02/D-03: a zero-edge seed was dropped by `neo4jRepository.traverse()`, the response collapsed all counts into `itemCount`, and the outcome selector reported `NO_EVIDENCE`, which the client treats as failure. Plan 01 produced `failedSeeds` in planning, but no response field carried them (D-13).

## What Was Built

### `knowledge-server/src/graph/neo4jRepository.ts`

- Deleted the `IMPACT_ANALYSIS + READS_FROM INCOMING` `WRITES_TO` compensation branch. Relation selection is planning-owned (T-24-05).
- Removed the zero-edge path drop; zero-edge seed paths survive as completed single-node partials.
- `traverse()` now calls `resolveEntities(snapshotId, seedUrns)` once and returns `seedEntities`, injecting a seed entity if traversal node output omitted it (bounded by `criteria.limitNodes`, marking truncation).
- Kept snapshot equality checks, evidence-class filters, `LIMIT` parameters, and the static `relation:direction:hops` template lookup unchanged.

### `knowledge-server/src/retrieval/contracts.ts` + `graphTraversal.ts`

- `GraphTraversalResult.seedEntities?: readonly EntityItem[]`.
- `BoundedGraphTraversalResult.seedEntities` plus `BoundedGraphTraversalStatus` with `entityCount`, `edgeCount`, `pathCount`; `itemCount` stays `chunks + entities + edges`.
- Seed entities merge into the entity map by URN before traversal entities, so they never duplicate and always survive.
- `reason: 'SEED_FOUND_NO_RELATION'` when entities exist with zero edges/paths and no truncation; `RESULT_LIMIT_REACHED` keeps precedence. Terminal statuses (`timeout`, `stale`, `unavailable`, `error`) never emit the seed-only code.

### `knowledge-server/src/types/retrievalProtocol.ts`

- `SEED_ONLY` added to `RETRIEVAL_OUTCOMES`.
- `STAGE_NAMES`, `StageNameSchema`, `StageDiagnosticSchema` (strict: no message/query keys), `GraphRetainedCountsSchema`.
- `ModalityStatusDetailSchema` gains optional `entityCount`, `edgeCount`, `pathCount`.
- `RetrievalDiagnosticsSchema` gains optional `graphBeforeFusion`, `graphAfterFusion`, `stageDiagnostics` (max 8), `failedSeeds` (max 5).
- `SEED_ONLY` invariant: at least one entity item, empty `paths`, empty `conflictGroups`, `reason === 'SEED_FOUND_NO_RELATION'`, and no `failedSeeds` URN that also appears as a returned entity.

### `knowledge-server/src/services/retrievalService.ts`

- Graph status carries the count breakdown into `modalityStatus.graph` (zeros on failure paths).
- Graph items bypass the text-corroboration relevance gate; fulltext/vector keep it. `closeOrderedPaths` runs whenever path candidates exist.
- `SEED_ONLY` is evaluated before `NO_EVIDENCE` and requires the whole item set to be entity-only (an uncorroborated chunk arriving from any modality keeps `READY`/`DEGRADED` semantics intact).
- `diagnostics.failedSeeds` copied from executable planning outcomes; `graphBeforeFusion`/`graphAfterFusion` populated.
- `stageDiagnostics` rows for `entity_resolution`, `validation`, `planning`, `neo4j_traversal`, `fusion`; planning carries `fallback: true` + `fallbackReason: 'FALLBACK_ONE_HOP'` on the degraded plan, traversal carries `truncated: true` on truncated results.

### Fixture and regression coverage

- `pilotGoldEntities.ts` gains `URN_TABLE_EVT_EVENT`, `URN_PKG_EVT_EVENT_WRITER`, `PILOT_GOLD_EVT_EVENT_NODES`, `PILOT_GOLD_EVT_EVENT_RELATIONS`, `PILOT_GOLD_SUPPORTING_CHUNKS` (additive only).
- `graphSeedPreservation.test.ts` (new, 14 tests) covers zero-edge seeds, count breakdown, seed/entity dedupe, `itemCount` compatibility, stable invalid-plan codes with zero gateway calls, repository seed preservation, absence of ad-hoc `WRITES_TO` queries, the four-item EVT_EVENT trace, `SEED_ONLY` degradation, and the mixed-seed `failedSeeds` case.
- `retrievalService.test.ts` adds `SEED_ONLY` selection, `failedSeeds` reporting, no-`SEED_ONLY`-on-failure, stage diagnostic bounds, `FALLBACK_ONE_HOP`, and the end-to-end `MAIN1.EVT_EVENT` regression.

## Verification

```
cd knowledge-server && npx vitest run tests/graphSeedPreservation.test.ts \
  tests/graphTraversal.test.ts tests/retrievalService.test.ts \
  tests/retrievalProtocol.test.ts tests/neo4jRetrievalIntegrity.test.ts
→ 5 files, 121 tests passed
```

Acceptance greps:

```
grep -c "edges.length === 0) continue" knowledge-server/src/graph/neo4jRepository.ts → 0
grep -c "writesQuery"                  knowledge-server/src/graph/neo4jRepository.ts → 0
```

`npx tsc --noEmit` reports no errors.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `BoundedGraphTraversalResult` consumers required new required fields**
- **Found during:** Task 1
- **Issue:** `runGraphModality` returned hand-built status literals and a fallback result object lacking `seedEntities`, failing typecheck once the fields became required.
- **Fix:** Threaded `entityCount`/`edgeCount`/`pathCount` and `seedEntities` through the service's failure paths.
- **Files modified:** `knowledge-server/src/services/retrievalService.ts`
- **Commit:** b7466ef

**2. [Rule 1 - Bug] Existing `traverse` assertion counted the new resolution call**
- **Found during:** Task 1
- **Issue:** `neo4jRetrievalIntegrity.test.ts` mapped every session call to its `seedUrns` param, and the new `resolveEntities` call carries none.
- **Fix:** Filtered to calls that carry `seedUrns`.
- **Files modified:** `knowledge-server/tests/neo4jRetrievalIntegrity.test.ts`
- **Commit:** b7466ef

**3. [Rule 3 - Blocking] Graph gateway stub could not return chunks or paths**
- **Found during:** Tasks 2 and 3
- **Issue:** `DeterministicGraphGatewayStub.traverse` returned only entities and edges, so path closure and citation-dependent regressions were untestable.
- **Fix:** Added `mockChunks`, `mockSeedEntities`, `mockPaths`, and `mockTruncationReason`.
- **Files modified:** `knowledge-server/tests/fixtures/retrievalStubs.ts`
- **Commits:** b7466ef, 51d7d10

**4. [Rule 2 - Missing critical functionality] Graph evidence was blanked by the text gate**
- **Found during:** Task 2
- **Issue:** `enforceRelevanceGate && !hasTextualSupport` cleared graph items too, so a resolved seed vanished whenever no chunk corroborated the query text.
- **Fix:** Exempted graph items (already ontology-valid, snapshot-consistent, cap-bounded, citation-closed) from the gate and closed paths unconditionally.
- **Files modified:** `knowledge-server/src/services/retrievalService.ts`
- **Commit:** e2382a4

**5. [Rule 3 - Blocking] Prior tests asserted the superseded NO_EVIDENCE behavior**
- **Found during:** Task 2
- **Issue:** Two parameterized cases expected `NO_EVIDENCE` for a resolved seed with uncorroborated chunks.
- **Fix:** Rewrote them to assert graph evidence survives while the same chunk from fulltext/vector is still gated out.
- **Files modified:** `knowledge-server/tests/retrievalService.test.ts`
- **Commit:** e2382a4

## Deferred Issues

- Client-side schema parity (`src/services/knowledge/retrievalProtocol.ts`) is not updated here; plan 24-04 owns that mirror.
- `tests/retrievalIndex.test.ts`, `tests/retrievalRoutes.test.ts`, `tests/retrievalAcceptance.test.ts`, and `tests/federatedRetrieval.test.ts` remain unrunnable in this environment due to pre-existing missing deps (`@fastify/cors`, `mdast-util-to-string`, `neo4j-driver`). No new packages installed.
- `federatedRetrievalService.ts` does not yet emit the new diagnostics; plan 24-03 owns federated aggregation.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model. New surfaces are server-internal: seed resolution reuses the existing snapshot-scoped `resolveEntities` query, and diagnostics are strict schemas with no free-text fields.

## Self-Check: PASSED

- Created file verified on disk: `knowledge-server/tests/graphSeedPreservation.test.ts`.
- Commits verified: b7466ef, e2382a4, 51d7d10.
- Targeted suite: 121 tests passed; acceptance greps return 0; `tsc --noEmit` clean.
