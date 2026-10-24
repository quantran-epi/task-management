---
phase: 24-graph-retrieval-optimization
plan: 01
subsystem: knowledge-server/retrieval
tags: [ontology, planning, traversal, validation, graphrag]
requires: []
provides:
  - "Registry-derived per-seed plan derivation and step validation"
  - "Per-seed fast path, per-seed failure reporting, sanitized repair, stable validation codes"
  - "Reject-not-clamp traversal validation with stable status reasons"
affects:
  - knowledge-server/src/retrieval/queryPlanning.ts
  - knowledge-server/src/retrieval/graphTraversal.ts
  - knowledge-server/src/retrieval/nineRouterQueryPlanner.ts
  - knowledge-server/src/services/retrievalService.ts
tech-stack:
  added: []
  patterns:
    - "Frozen ontology registry as sole authority for relation/direction/endpoint/hop legality"
    - "Loose bounded planner candidate schema then strict typed re-parse"
    - "Stable reason codes only across validation, repair, and status surfaces"
key-files:
  created:
    - knowledge-server/src/retrieval/retrievalPlanDerivation.ts
    - knowledge-server/tests/ontologyPlanning.test.ts
    - knowledge-server/tests/graphPlanValidation.test.ts
  modified:
    - knowledge-server/src/types/retrievalProtocol.ts
    - knowledge-server/src/retrieval/queryPlanning.ts
    - knowledge-server/src/retrieval/nineRouterQueryPlanner.ts
    - knowledge-server/src/retrieval/contracts.ts
    - knowledge-server/src/retrieval/graphTraversal.ts
    - knowledge-server/src/services/retrievalService.ts
    - knowledge-server/tests/retrievalPlanning.test.ts
    - knowledge-server/tests/graphTraversal.test.ts
    - knowledge-server/tests/nineRouterPlanner.test.ts
    - knowledge-server/tests/retrievalProtocol.test.ts
    - knowledge-server/tests/retrievalService.test.ts
decisions:
  - "MODEL_DEPTH_INPUT_CAP=10 bounds untrusted model input; semantic validation caps at 3 and rejects 4..10 as HOP_LIMIT_EXCEEDED"
  - "Per-seed derivation replaces defaultTraversalStepsForKind and normalizePlanSemantics entirely"
  - "Failed seeds reported individually; valid sibling seeds always survive"
  - "Repair context carries attempt + stable reason codes only; original request query is never mutated"
metrics:
  duration: 24m
  completed: 2026-10-24
---

# Phase 24 Plan 01: Ontology-Driven Per-Seed Planning and Reject-Not-Clamp Validation Summary

Per-seed traversal plans now derive from `RETRIEVAL_ONTOLOGY_REGISTRY`; invalid relations, directions, endpoints, and depths are rejected with stable reason codes instead of being silently clamped or rewritten.

## Objective

Remove the root causes of the `MAIN1.EVT_EVENT` regression: one hardcoded relation per node kind, first-seed kind governing all seeds, impact-plan rewriting, silent depth clamping, and free-text validation issues.

## What Was Built

### `knowledge-server/src/retrieval/retrievalPlanDerivation.ts` (new)

Pure, registry-driven module:

- `PLAN_VALIDATION_REASON_CODES` — the six stable validation codes.
- `TRAVERSAL_PLAN_LIMITS` — `MAX_STEPS 5`, `MAX_DEPTH 3`, `SAFE_FALLBACK_DEPTH 1`, `MAX_SEEDS 5`.
- `LooseTraversalStepSchema` / `LooseLogicalQueryPlanSchema` — bounded loose candidates (`relationType` max 64) so unknown relations reach semantic validation.
- `directionForSeedKind` — `BOTH` only when the kind is legal on both endpoints.
- `deriveAllRelationSteps(kind, maxDepth)` — iterates registry insertion order, no relation list or kind switch.
- `deriveSeedPlan(seed, options)` — per-seed plan with `maxDepth`, `selectedRelations`, `allowAllRelations`, `applySafeFallback`.
- `validateStepAgainstRegistry` — ordered checks: relation, direction, endpoint kind, hop ceiling.
- `validateOverallDepth` — rejects outside 1..3.

Derived results: `DatabaseObject` → `READS_FROM INCOMING` + `WRITES_TO INCOMING`; `ScheduledProcess` → `CONTAINS_STEP OUTGOING`; `SoftwareComponent` → eight relations in registry order.

### Protocol changes (`knowledge-server/src/types/retrievalProtocol.ts`)

- `REASON_CODES` extended from 8 to 17 with all nine Phase 24 codes.
- `MODEL_DEPTH_INPUT_CAP = 10`; step `maxHops` and `overallMaxDepth` parse 1..10.
- `TraversalStepSchema.seedUrn` optional.
- `FailedSeedSchema` / `FailedSeed` strict `{ urn, reasonCode }`.

### Planning (`queryPlanning.ts`, `nineRouterQueryPlanner.ts`, `contracts.ts`)

- `defaultTraversalStepsForKind` and `normalizePlanSemantics` deleted.
- Fast path and fallback merge per-seed derived plans, stamping `seedUrn` per step, bounded by 5 steps / 5 seeds.
- `validatePlanSemantics` partitions seeds: allowlisted survive, unknown become `failedSeeds` with `SEED_NOT_FOUND`; valid seeds are never erased.
- `QueryExecutionPlanningOutcome.executable` gains `failedSeeds` and `seedKinds`.
- `QueryPlannerContext.repair` carries `{ attempt: 1, reasonCodes }` only.
- Planner prompt now lists node kinds, the closed ten-relation table with source/target kinds, default direction, max hops, and all bounds; the DatabaseObject reverse-step special case is gone.
- Planner parses through the loose schema, then strict-parses only when semantics pass.

### Traversal (`graphTraversal.ts`)

- Depth/hop clamping removed; `clampedDepth` renamed `validatedDepth`.
- `validateTraversalPlan(plan, allowedSeedSet, seedKinds?)` validates per-step against the kinds named by `seedUrn`, else all plan seed kinds.
- Failures map to `status.reason` (`error`, except `NO_GRAPH_SEED` which stays `unavailable`) instead of collapsing to `PROVIDER_ERROR`.
- `GraphTraversalOptions.seedKinds` threaded from `retrievalService`.

## Verification

Targeted suites (all green):

```
npx vitest run --root knowledge-server tests/ontologyPlanning.test.ts \
  tests/retrievalPlanning.test.ts tests/nineRouterPlanner.test.ts \
  tests/graphTraversal.test.ts tests/graphPlanValidation.test.ts \
  tests/retrievalService.test.ts tests/retrievalProtocol.test.ts
→ 7 files, 143 tests passed
```

Acceptance greps:

```
grep -rc "defaultTraversalStepsForKind" knowledge-server/src  → 0
grep -rc "normalizePlanSemantics"      queryPlanning.ts      → 0
grep -rc "REPAIR_VALIDATION_ERRORS"    queryPlanning.ts      → 0
grep -rc "REPAIR_VALIDATION_ERRORS"    nineRouterQueryPlanner.ts → 0
grep -rci "clamped"                    graphTraversal.ts     → 0
grep -rc "No static query template registered" graphTraversal.ts → 0
```

`tsc --noEmit` reports no errors in any touched file (pre-existing missing-module errors elsewhere are unrelated).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Empty relation selection produced zero fallback steps**
- **Found during:** Task 1
- **Issue:** `deriveSeedPlan` with `applySafeFallback` re-applied the same `selectedRelations` filter, returning `[]`.
- **Fix:** Fallback path now forces `allowAllRelations`.
- **Files modified:** `knowledge-server/src/retrieval/retrievalPlanDerivation.ts`
- **Commit:** bc4a5e2

**2. [Rule 1 - Bug] Duplicate reason codes in repair payload**
- **Found during:** Task 2
- **Issue:** A depth-5 plan with a depth-5 step emitted `HOP_LIMIT_EXCEEDED` twice.
- **Fix:** Dedupe reason codes at both planning and planner validation boundaries.
- **Files modified:** `queryPlanning.ts`, `nineRouterQueryPlanner.ts`
- **Commit:** a0d6f5c

**3. [Rule 3 - Blocking] Existing tests asserted superseded behavior**
- **Found during:** Tasks 2 and 3
- **Issue:** Legacy tests asserted single-relation fast paths, blanket `BOTH` fallback, impact-plan rewriting, free-text repair strings, and depth-4 schema rejection.
- **Fix:** Rewrote assertions to the new per-seed and stable-code contracts; added mixed-kind, per-seed failure, one-repair, depth-5, unknown-relation, and impact-plan cases.
- **Files modified:** `retrievalPlanning.test.ts`, `nineRouterPlanner.test.ts`, `retrievalProtocol.test.ts`, `graphTraversal.test.ts`, `retrievalService.test.ts`
- **Commits:** a0d6f5c, 2a6c20b, edd5f1f

**4. [Rule 2 - Missing critical functionality] Seed kinds were not reaching traversal validation**
- **Found during:** Task 3
- **Issue:** Without a kind map, `validateTraversalPlan` could not enforce endpoint/direction legality end-to-end.
- **Fix:** Added `seedKindMap` + `QueryExecutionPlanningOutcome.seedKinds` and threaded `GraphTraversalOptions.seedKinds` through `RetrievalService`.
- **Files modified:** `queryPlanning.ts`, `graphTraversal.ts`, `retrievalService.ts`
- **Commit:** 2a6c20b

## Deferred Issues

- `knowledge-server/tests/retrievalIndex.test.ts` fails with `PROSE_EXTRACTION_NOT_CONFIGURED` where `DIMENSION_MISMATCH` is expected. Pre-existing, unrelated to planning/traversal (graph build prose extraction config), and out of scope for this plan.
- `tests/retrievalRoutes.test.ts`, `tests/retrievalAcceptance.test.ts`, `tests/federatedRetrieval.test.ts` cannot run in this environment because `@fastify/cors`, `mdast-util-to-string`, and `neo4j-driver` are absent from `knowledge-server/node_modules`. Pre-existing environment gap, no new packages installed.

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundaries. All new surfaces are server-side validation over already-bounded model input.

## Self-Check: PASSED

- Created files verified on disk: `retrievalPlanDerivation.ts`, `ontologyPlanning.test.ts`, `graphPlanValidation.test.ts`.
- Commits verified in `git log`: ebf3a58, bc4a5e2, a0d6f5c, 2a6c20b, edd5f1f.
- Targeted tests pass (143 tests); acceptance greps return 0.
