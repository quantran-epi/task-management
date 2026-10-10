---
phase: 18-multi-modal-hybrid-retrieval-engine
plan: 05
subsystem: graph-retrieval
tags: [graph-traversal, cypher, evidence-gating, simple-paths, bounded-caps]
dependency-graph:
  requires: [18-01, 18-04]
  provides: [graph-traversal, static-cypher-catalog, bounded-graph-runner]
  affects: [18-07, 18-08, 18-09]
tech-stack:
  added: []
  patterns: [static-query-catalog, simple-path-uniqueness, evidence-classification-gating, sentinel-overflow-truncation, content-free-error-mapping]
key-files:
  created:
    - knowledge-server/src/retrieval/graphTraversal.ts
    - knowledge-server/tests/graphTraversal.test.ts
  modified: []
decisions:
  - "Lock static traversal templates strictly to compile-time generated tuples (relationType, direction, depth) over frozen ontology registry, eliminating runtime query interpolation per D-15 and D-16."
  - "Enforce simple-path node uniqueness via single(m IN nodes(path) WHERE m = n) and snapshot isolation across all path nodes and relationships per D-15."
  - "Filter traversal by evidence classification allowlist: OBSERVED and BUSINESS_APPROVED by default, INFERRED only on explicit opt-in per D-14."
  - "Enforce hard caps of 100 unique nodes and 200 unique edges both in Cypher LIMIT and in TypeScript mapper using +1 sentinel values, reporting truncated status and RESULT_LIMIT_REACHED per D-15."
  - "Return explicit unavailable/NO_GRAPH_SEED status with zero gateway calls when plan seedUrns is empty per D-12."
  - "Map AbortError to TIMEOUT, missing generation to PINNED_SNAPSHOT_UNAVAILABLE, and DB errors to PROVIDER_ERROR without exposing Cypher or internal error text per T-18-01."
metrics:
  duration: 12m
  completed-date: "2026-10-10"
---

# Phase 18 Plan 05: Safe Bounded Graph Traversal & Static Cypher Catalog Summary

Static bounded Cypher query catalog, plan validator, and bounded path execution runner with evidence gating and truncation caps implemented for multi-modal hybrid retrieval.

## Objective Realized

Built `knowledge-server/src/retrieval/graphTraversal.ts` and automated test suite `knowledge-server/tests/graphTraversal.test.ts`:
1. `STATIC_TRAVERSAL_QUERIES`: Static compile-time Cypher catalog covering all 10 relation types across 3 directions (`OUTGOING`, `INCOMING`, `BOTH`) and depths 1..maxHops from `RETRIEVAL_ONTOLOGY_REGISTRY`. Zero string interpolation or dynamic clauses.
2. `validateTraversalPlan`: Second-line semantic validator checking server-resolved seed allowlist, max 5 traversal steps, clamping overall depth to 1..3, clamping relation hops to ontology registry ceilings, and establishing strict evidence classification allowlists (`OBSERVED`, `BUSINESS_APPROVED`, and optional `INFERRED`).
3. `runBoundedGraphTraversal`: Bounded execution coordinator querying `GraphRetrievalGateway` with `+1` sentinel caps (`101` nodes, `201` edges), deduplicating entities by URN and edges by `factKey`, enforcing simple-path uniqueness and evidence gating, mapping sentinel overflow to `status='truncated'` and `reason='RESULT_LIMIT_REACHED'`, and mapping timeouts/stale generations/errors to content-free codes (`TIMEOUT`, `PINNED_SNAPSHOT_UNAVAILABLE`, `PROVIDER_ERROR`).

## Key Changes

1. **Static Traversal Catalog & Template Builder (`knowledge-server/src/retrieval/graphTraversal.ts`)**:
   - `buildStaticTemplate()`: Compiles static Cypher query with snapshot filtering on nodes and relationships, simple path predicate `single(m IN nodes(path) WHERE m = n)`, evidence class allowlist `$evidenceClasses`, and limits `$pathLimit`, `$maxEdges`.
   - `STATIC_TRAVERSAL_QUERIES`: Pre-compiled dictionary keyed by `${relationType}:${direction}:${depth}` tuples.
   - Prohibits unrestricted `MATCH path` or string interpolation.

2. **Traversal Plan Validation (`knowledge-server/src/retrieval/graphTraversal.ts`)**:
   - `validateTraversalPlan()`: Rechecks resolved seeds against allowlist, flags empty seeds with `NO_GRAPH_SEED`, rejects > 5 steps, clamps depth to 1..3 with warning metadata, and configures default evidence classes.

3. **Bounded Traversal Execution (`knowledge-server/src/retrieval/graphTraversal.ts`)**:
   - `runBoundedGraphTraversal()`: Zero gateway calls when seeds are empty; passes `+1` sentinel bounds; maps entity and edge records with reference-based chunk citations; slices results to 100 entities and 200 edges; returns clean status metadata.

4. **Automated Unit Tests (`knowledge-server/tests/graphTraversal.test.ts`)**:
   - 26 vitest cases verifying template catalog completeness across all 10 relations and 3 directions, absence of `${` or unrestricted paths, presence of snapshot and evidence clauses, seed allowlist validation, depth and hop clamping, 1-hop flow, 2-hop call chain, 3-hop reverse impact paths, evidence classification filtering, node and edge overflow truncation, timeout mapping, stale snapshot mapping, and content-free error masking.

## Verification

- `npm --prefix knowledge-server test -- tests/graphTraversal.test.ts`: 26 passing tests.
- `npm --prefix knowledge-server exec tsc -- --noEmit`: Clean typecheck under strict TypeScript.

## Deviations from Plan

None - plan executed exactly as written.

## Threat Model Compliance

- **T-18-01 (Information Disclosure)**: Edge items carry reference IDs in `supportingChunkIds` only; errors and timeouts map to constant status codes (`TIMEOUT`, `PINNED_SNAPSHOT_UNAVAILABLE`, `PROVIDER_ERROR`) with zero Cypher or stack text.
- **T-18-02 (Injection/Elevation)**: Static template catalog derivation derived solely from frozen ontology registry; all parameter values (`$snapshotId`, `$seedUrns`, `$evidenceClasses`, `$pathLimit`, `$maxEdges`) passed via parameters.
- **T-18-03 (Denial of Service)**: Simple-path uniqueness prevents cyclic path explosion; hard caps of 100 nodes and 200 edges enforced in Cypher and mapper.
- **T-18-04 (Tampering / Snapshot Isolation)**: All path nodes and relations require `graphSnapshotId = $snapshotId`; missing snapshot returns stale without querying.
- **T-18-05 (Tampering / Evidence Class)**: Traversal restricted to `OBSERVED` and `BUSINESS_APPROVED` by default; `INFERRED` requires explicit request opt-in and is filtered if unpermitted.
- **T-18-SC (Dependencies)**: Zero new dependencies added.

## Self-Check: PASSED

- FOUND: `knowledge-server/src/retrieval/graphTraversal.ts`
- FOUND: `knowledge-server/tests/graphTraversal.test.ts`
- FOUND: commit `363954b` (feat(18-05): bind validated plans to static bounded Cypher templates)
- FOUND: commit `7166fd2` (feat(18-05): execute paths and map bounded entity/edge evidence with truncation)
