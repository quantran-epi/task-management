---
phase: 24-graph-retrieval-optimization
plan: 07
subsystem: tests/graph-benchmark
tags: [graphrag, correctness-baseline, determinism, citation-closure, sha256]
requires:
  - 24-01
  - 24-02
  - 24-03
provides:
  - "Committed 12-case graph reference fixture across all seven D-21 categories"
  - "Strict typed fixture schema with URN/relation/endpoint legality checks"
  - "Offline deterministic evaluator with all D-22 metrics and hard gates"
  - "graph:benchmark npm entry and SHA-256-addressed baseline artifact"
affects:
  - tests/fixtures/ai/graph-retrieval-reference.json
  - tests/fixtures/ai/graph-reference-fixture-schema.ts
  - tests/ai/graphRetrievalEvaluator.ts
  - tests/ai/graphRetrievalEvaluator.test.ts
  - scripts/run-graph-benchmark.ts
  - package.json
tech-stack:
  added: []
  patterns:
    - "Fixture JSON authored with frozen values; runtime load never imports TS constants"
    - "Two-pass evaluation (forward + reversed arrays) proves ordering determinism"
    - "Baseline is hash-addressed: fixture bytes SHA-256 gates overwrite and tuning"
key-files:
  created:
    - tests/fixtures/ai/graph-retrieval-reference.json
    - tests/fixtures/ai/graph-reference-fixture-schema.ts
    - tests/ai/graphRetrievalEvaluator.ts
    - tests/ai/graphRetrievalEvaluator.test.ts
    - scripts/run-graph-benchmark.ts
    - .planning/phases/24-graph-retrieval-optimization/24-GRAPH-BASELINE.json
  modified:
    - package.json
decisions:
  - "Fixture corpus is self-contained per case (nodes/edges/chunks) so evaluation needs no Neo4j, server, or model"
  - "Determinism is proven by a second pass over fully reversed nodes/edges/chunks arrays, comparing item and path order"
  - "Zero-result denominator counts only cases that expect evidence (READY/SEED_ONLY), excluding seed-only-adjacent no-evidence cases"
  - "Identity compares returned factKeys against both the fixture-declared key per (subject, relation, object) and the expected key set"
  - "Existing baseline with a different fixtureHash is refused; re-baselining requires deleting the artifact"
  - "EXPLAIN/PROFILE tuning remains gated on a passing baseline at the same fixture hash"
metrics:
  duration: 21m
  completed: 2026-10-24
---

# Phase 24 Plan 07: Deterministic Graph Correctness Baseline Summary

A 12-case committed graph reference set now runs fully offline through real plan derivation, bounded traversal, package ranking, and fusion, and passes a hard gate on zero-result rate, entity recall, edge precision, identity preservation, citation closure, ordering determinism, and p50/p95 latency. The passing baseline is pinned to the exact fixture SHA-256 (`7db28461…f17b8`) and records no query or chunk content.

## Objective

D-22 requires correctness measurement before any Neo4j `EXPLAIN`/`PROFILE` work; the existing grounded-answer benchmark measures synthesis quality, not traversal correctness (D-21, SC-7). This plan supplies that baseline and blocks tuning until it passes.

## What Was Built

### `tests/fixtures/ai/graph-reference-fixture-schema.ts`

- `GRAPH_REFERENCE_CATEGORIES` + `GraphReferenceCategorySchema` for all seven D-21 categories.
- `GraphReferenceNodeSchema`, `GraphReferenceEdgeSchema`, `GraphReferenceChunkSchema`, `GraphReferenceSeedSchema`, `GraphReferenceExpectedSchema`, `GraphReferenceCaseSchema`, `GraphReferenceFixtureSchema` (min 12 cases).
- URNs use the protocol `UrnSchema`; relations use `RelationTypeSchema`; outcomes use `RETRIEVAL_OUTCOMES`; reasons use `ReasonCodeSchema`; factKeys use the 64-hex `Sha256HexSchema`.
- Super-refine rejects seeds absent from the case corpus (except the nonexistent-entity category) and edges whose endpoints are not declared.

### `tests/fixtures/ai/graph-retrieval-reference.json`

12 cases, stable `GRF-01`…`GRF-12`, values frozen at authoring time:

| Category | Cases |
| --- | --- |
| direct_lookup | GRF-01 |
| read_write_relation | GRF-02 (WRITES_TO), GRF-03 (READS_FROM) |
| seed_only | GRF-04, GRF-11 (SoftwareComponent) |
| nonexistent_entity | GRF-05 |
| mixed_kinds | GRF-06 (DatabaseObject + ScheduledProcess) |
| multiple_relations | GRF-07 (READS_FROM + WRITES_TO + CALLS) |
| multi_hop_flow_impact | GRF-08 (2-hop CALLS flow), GRF-09 (2-hop impact), GRF-10 (depth-5 HOP_LIMIT_EXCEEDED), GRF-12 (PRECEDES chain) |

### `tests/ai/graphRetrievalEvaluator.ts`

- `GRAPH_GATE_THRESHOLDS`: max zero-result 0.1, min recall 0.9, min precision 0.9, required identity/closure/determinism, min 12 latency samples.
- `evaluateGraphReferenceCases` runs the real pipeline per case: `deriveSeedPlan` → `validateTraversalPlan` → `runBoundedGraphTraversal` (fixture gateway) → `buildProtectedGraphPackages` → `rankGraphPackages` → `fuseRetrievalCandidates` → `closeOrderedPaths`.
- Depth 4..10 reaches the semantic boundary and returns `HOP_LIMIT_EXCEEDED` through `validateOverallDepth`, not a synthetic failure.
- Second pass over reversed `nodes`/`edges`/`chunks` arrays compares per-case ordered item IDs and path keys.
- `evaluateGraphGate` returns stable codes plus case IDs only (`ZERO_RESULT_RATE`, `ENTITY_RECALL`, `EDGE_PRECISION`, `IDENTITY_PRESERVATION`, `CITATION_CLOSURE`, `DETERMINISTIC_ORDERING`, `INSUFFICIENT_LATENCY_SAMPLES`, `CASE_FAILED`).
- `computeFixtureHash`, `buildGraphBaseline`, `serializeGraphBaseline`, `checkBaselineFixtureHash` produce and guard the artifact.
- Evaluator opens no socket, reads no environment, invokes no model.

### `scripts/run-graph-benchmark.ts` + `package.json`

- Validates the fixture, evaluates, prints a content-free metric table, exits 0/1.
- `--json <path>` writes schemaVersion, UTC `createdAt`, fixture SHA-256, thresholds, metrics, per-case codes/counts/latency, and `passed`; refuses to overwrite a baseline from different fixture bytes.
- Header comment states the EXPLAIN/PROFILE gate and same-hash requirement.
- `"graph:benchmark": "tsx scripts/run-graph-benchmark.ts"`; `tsx` already present, no dependency added. `scripts/run-benchmark.ts` untouched.

### `.planning/phases/24-graph-retrieval-optimization/24-GRAPH-BASELINE.json`

Generated from a passing run: `fixtureHash 7db28461ee049581e3c197e4b4e2078d46d1e80a7172b48312ee3fbd608f17b8`, 12 cases, zero-result 0, recall 1, precision 1, identity/closure/determinism true, p50 0.644 ms / p95 4.573 ms, `passed: true`. Verified to contain zero occurrences of queries, chunk text, document titles, URNs, URLs, or Cypher.

## Verification

```
npx vitest run tests/ai/graphRetrievalEvaluator.test.ts
→ 19 tests passed

npm run graph:benchmark -- --json .planning/phases/24-graph-retrieval-optimization/24-GRAPH-BASELINE.json
→ exit 0, "[GRAPH BENCHMARK] PASSED"

npx tsc --noEmit
→ no errors in any touched file
```

Independent check: recomputed SHA-256 of `tests/fixtures/ai/graph-retrieval-reference.json` equals the baseline `fixtureHash`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Early-return inside the case loop dropped results**
- **Found during:** Task 2
- **Issue:** `runPass` returned `finish()` directly for seed-not-found, invalid-plan, and traversal-failure branches, so `results` ended up undefined for the caller and the reversed pass threw `Cannot read properties of undefined (reading 'map')`.
- **Fix:** Push the result and `continue` instead of returning from inside the loop.
- **Files modified:** `tests/ai/graphRetrievalEvaluator.ts`
- **Commit:** 7dc0434

**2. [Rule 3 - Blocking] Literal `['graph']` widened to `string[]` under `strict`**
- **Found during:** Task 3 typecheck
- **Issue:** `ChunkItem`/`EdgeItem` `modalitiesContributed` requires `ModalityKind[]`; the untyped object literals widened.
- **Fix:** Annotate `['graph'] as ModalityKind[]`; also spread the `Set` into an array before `sorted`.
- **Files modified:** `tests/ai/graphRetrievalEvaluator.ts`
- **Commit:** bbb6147

**3. [Rule 2 - Missing critical functionality] Zero-result denominator needed a declared rule**
- **Found during:** Task 2
- **Issue:** Counting every case in the zero-result denominator would let intentional no-evidence cases (nonexistent entity, depth-5 rejection) mask real misses.
- **Fix:** Denominator counts only cases expecting evidence (`READY`/`SEED_ONLY`); the rate and denominator are both persisted in the baseline.
- **Files modified:** `tests/ai/graphRetrievalEvaluator.ts`
- **Commit:** 7dc0434

## Deferred Issues

- Fixture corpus is deliberately small (12 cases) and synthetic-but-stable, per the plan's 12–20 bounded in-process scope; broader corpus coverage is out of scope for this baseline.
- Neo4j `EXPLAIN`/`PROFILE` tuning is intentionally not started here; it is gated on this baseline.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model. New surfaces are local test/benchmark code: strict schema validation of committed JSON (T-24-16), a hash-addressed baseline that refuses mismatched overwrites (T-24-17), and serialization that carries only IDs, codes, counts, hashes, and metrics (T-24-18). No packages installed (T-24-SC).

## Self-Check: PASSED

- Created files verified on disk: fixture JSON, fixture schema, evaluator, evaluator test, benchmark runner, baseline artifact.
- Commits verified in `git log`: 7093d7f, 7dc0434, bbb6147.
- Targeted suite: 19 tests passed; benchmark exit 0; `tsc --noEmit` clean for touched files; baseline hash matches fixture bytes.
