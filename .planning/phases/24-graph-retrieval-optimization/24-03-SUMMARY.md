---
phase: 24-graph-retrieval-optimization
plan: 03
subsystem: knowledge-server/retrieval
tags: [graphrag, rrf, federation, determinism, diagnostics]
requires:
  - 24-01
  - 24-02
provides:
  - "Atomic protected graph-package admission under a 0.6 quota"
  - "Deterministic total-order graph package ranking"
  - "Deduplicated retained federated graph counts with severity precedence"
  - "Federated stageDiagnostics and failedSeeds aggregation"
affects:
  - knowledge-server/src/retrieval/fusion.ts
  - knowledge-server/src/services/retrievalService.ts
  - knowledge-server/src/services/federatedRetrievalService.ts
  - knowledge-server/src/types/retrievalProtocol.ts
tech-stack:
  added: []
  patterns:
    - "Whole-package admission: no partial graph evidence under a shared limit"
    - "Explicit total-order comparator; array stability irrelevant"
    - "Retained-identity cardinality counts, never per-set sums"
    - "Severity precedence over last-writer-wins status"
key-files:
  created: []
  modified:
    - knowledge-server/src/retrieval/fusion.ts
    - knowledge-server/src/services/retrievalService.ts
    - knowledge-server/src/services/federatedRetrievalService.ts
    - knowledge-server/src/types/retrievalProtocol.ts
    - knowledge-server/tests/retrievalFusion.test.ts
    - knowledge-server/tests/federatedRetrieval.test.ts
decisions:
  - "PROTECTED_GRAPH_QUOTA_RATIO = 0.6; quota expands to the full limit only when no text candidate exists"
  - "Package members are the seed entity, target entities, edges, and every supporting chunk; any missing member drops the package"
  - "Package ranking order: intent relevance, answerability, evidence strength, path length, stable identity"
  - "Federated graph counts derive from deduplicated retained identities (entity/edge/path), not per-set count sums"
  - "Stage rows dedupe on byte-identical content and cap at 20; failed seeds dedupe on urn+reasonCode and cap at 5"
metrics:
  duration: 25m
  completed: 2026-10-24
---

# Phase 24 Plan 03: Atomic Graph Packages, Deterministic Ranking, and Federated Aggregation Summary

Valid graph evidence now survives RRF fusion as a citation-closed unit under a bounded quota, path ordering ignores Neo4j return order, and federation reports deduplicated retained counts, severity-preserving statuses, stage rows, and failed seeds.

## Objective

Close the D-16/D-17/D-18 chain where RRF ranked individual items, `slice(0, limit)` cut package closure, and federation summed only `itemCount`; also surface D-19 stage metadata and D-13 failed seeds through the federated response.

## What Was Built

### `knowledge-server/src/retrieval/fusion.ts`

- `PROTECTED_GRAPH_QUOTA_RATIO = 0.6`.
- `ProtectedGraphPackage` — `seedUrns`, `targetUrns`, `edgeIds`, `pathId`, `supportingChunkIds`, `pathRankKey`.
- `buildProtectedGraphPackages(input)` — one package per citation-closed path plus one per orphan edge; rejects pinned-snapshot mismatches, empty hop citations, and reports `MISSING_SUPPORTING_CHUNK` instead of repairing.
- `rankGraphPackages(packages, context)` — explicit total order over intent relevance, answerability, evidence strength, path length, and stable identity. `localeCompare` is not used; comparisons are byte-order `<`/`>`.
- `protectedPackageMembers(pkg)` — stable member composite keys (`entity:`/`edge:`/`chunk:`).
- `fuseRetrievalCandidates(..., { protectedGraphPackages })` — admits whole packages while `admitted + packageSize <= quota`, then fills remaining slots from RRF order excluding admitted keys. A final guard ensures at least one text item survives when text candidates exist. `RRF_K`, composite keys, integrity guard, and diagnostics are unchanged.

### `knowledge-server/src/services/retrievalService.ts`

- Builds packages from graph chunks/edges/paths and ranks them using `selectedRelations` from the validated plan.
- Passes ranked packages into fusion and orders `paths` by package rank, with edge-fact-key identity as the tie-break; gateway array index is never the ordering source.
- `graphBeforeFusion` / `graphAfterFusion` snapshots remain populated.

### `knowledge-server/src/services/federatedRetrievalService.ts`

- Cross-set deduplication of retained graph identities (`entity:<id>`, `edge:<id>`), while non-graph items keep a set-aware key.
- `modalityStatus.graph.entityCount/edgeCount/pathCount` derive from retained identity-set cardinalities; `itemCount` is the final retained item count.
- Severity precedence `error > timeout > stale > truncated > unavailable > ok` replaces last-writer-wins.
- `diagnostics.stageDiagnostics` concatenated, byte-identical dedupe, capped at 20, flags preserved; `diagnostics.failedSeeds` deduped on `urn + reasonCode`, capped at 5.
- Outcome order: DEGRADED (warning or non-ok modality) → SEED_ONLY (all contributing sets entity-only) → NO_EVIDENCE → READY.

### `knowledge-server/src/types/retrievalProtocol.ts`

- Federated `diagnostics` gains optional `stageDiagnostics` (`max(20)`) and `failedSeeds` (`max(5)`). Strict object; no free-text field added.

## Verification

```
cd knowledge-server && npx vitest run tests/retrievalFusion.test.ts tests/retrievalService.test.ts
→ 2 files, 54 tests passed

npx vitest run tests/federatedRetrieval.test.ts
→ 14 passed, 3 failed (all three failures pre-existing at HEAD)
```

`npx tsc --noEmit` exits 0.

Pre-existing federated failures (verified by stashing this plan's changes and re-running at HEAD):
- `Progressive expansion` / `Budget stop` assert `toHaveBeenCalledWith(setId, expect.anything())` but the route passes a third signal argument.
- `marks all modalities as timeout when every set times out` receives `ERROR` rather than `TIMEOUT` under `app.inject`; failure path maps to `ERROR` before the all-timeout branch. Aggregation logic itself verified directly against `runFederatedRetrieval` (timeout statuses preserved).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fusion tie-break used `localeCompare`**
- **Found during:** Task 2
- **Issue:** The existing RRF comparator ended with `localeCompare`, which is locale-dependent and violates the plan's fixed-order requirement.
- **Fix:** Replaced with a byte-order `stableStringCompare` helper reused by package ranking.
- **Files modified:** `knowledge-server/src/retrieval/fusion.ts`
- **Commit:** 264b3bf

**2. [Rule 2 - Missing critical functionality] Text evidence could be fully crowded out**
- **Found during:** Task 1
- **Issue:** Quota admission alone still allowed graph packages to occupy every remaining slot when text candidates were present.
- **Fix:** Added a final guard that admits the top text candidate (evicting the last admitted item if needed) whenever text candidates exist.
- **Files modified:** `knowledge-server/src/retrieval/fusion.ts`
- **Commit:** 264b3bf

**3. [Rule 3 - Blocking] Federated status aggregation overwrote severe statuses**
- **Found during:** Task 3
- **Issue:** `if (ms.x.status !== 'ok') status = ms.x.status` let a later `timeout`/`stale` be overwritten by nothing but also could not express ordering; a later `ok` left the previous value only by accident.
- **Fix:** Explicit severity map with strict `>` comparison.
- **Files modified:** `knowledge-server/src/services/federatedRetrievalService.ts`
- **Commit:** 90211a5

## Deferred Issues

- The three pre-existing `federatedRetrieval.test.ts` failures listed under Verification are out of scope; they exercise route-level mock argument shape and failure-code mapping, not this plan's aggregation logic.
- Client mirror of the federated diagnostics (`src/services/knowledge/retrievalProtocol.ts`) remains plan 24-04's responsibility.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model. New surfaces are server-internal: package admission is bounded by the quota and existing caps, and federated diagnostics remain strict schemas with no message field.

## Self-Check: PASSED

- Modified files verified on disk: `fusion.ts`, `retrievalService.ts`, `federatedRetrievalService.ts`, `retrievalProtocol.ts`.
- Commits verified in `git log`: 264b3bf, f97ad5b, 90211a5.
- Targeted suites: 54 fusion/service tests pass; federated additions pass; `tsc --noEmit` clean.
