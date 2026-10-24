---
phase: 24-graph-retrieval-optimization
plan: 04
subsystem: client/retrieval-protocol
tags: [protocol-parity, zod, backward-compatibility, diagnostics, seed-only]
requires:
  - 24-01
  - 24-02
  - 24-03
provides:
  - "Client mirror of SEED_ONLY, nine reason codes, stage names, and depth cap"
  - "Federated diagnostics.stageDiagnostics and diagnostics.failedSeeds acceptance"
  - "Backward-compatible persisted grounding entities/graphCounts/stageDiagnostics/failedSeeds"
affects:
  - src/services/knowledge/retrievalProtocol.ts
  - src/services/ai/groundedAnswerSchemas.ts
tech-stack:
  added: []
  patterns:
    - "Parity test imports both protocol modules and asserts deep equality"
    - "Shared enum/schema reuse instead of redefinition across boundaries"
    - "Optional additive persisted fields under a frozen schemaVersion"
key-files:
  created:
    - tests/knowledge/retrievalProtocolParity.test.ts
  modified:
    - src/services/knowledge/retrievalProtocol.ts
    - src/services/ai/groundedAnswerSchemas.ts
    - tests/knowledge/retrievalProtocol.test.ts
    - tests/ai/groundedAnswerSchemas.test.ts
decisions:
  - "Client mirrors server declaration order verbatim so array equality is meaningful"
  - "Depth parsing widened to MODEL_DEPTH_INPUT_CAP=10; semantic 1..3 rejection stays server-side"
  - "Persisted Phase 24 fields are all optional and schemaVersion remains 1"
  - "Persisted diagnostics reuse protocol schemas, so no free-text field can be persisted"
metrics:
  duration: 9m
  completed: 2026-10-24
---

# Phase 24 Plan 04: Client Protocol Parity and Backward-Compatible Grounding Summary

The strict client mirrors now accept every Phase 24 server outcome, reason code, count, and diagnostic key, and persisted chat grounding gained optional seed-only evidence fields without breaking historical records.

## Objective

Close the boundary rejection described in Pitfall 8: the client protocol mirror lacked `SEED_ONLY`, the nine new reason codes, stage diagnostics, and federated `failedSeeds`, so a valid server response could be rejected and `groundedTurn` would silently fall back to BM25.

## What Was Built

### `src/services/knowledge/retrievalProtocol.ts`

- `RETRIEVAL_OUTCOMES` gains `SEED_ONLY`; `REASON_CODES` gains the nine Phase 24 codes in server order.
- `MODEL_DEPTH_INPUT_CAP = 10` exported; `TraversalStepSchema.maxHops` and `LogicalQueryPlanSchema.overallMaxDepth` now parse 1..10. `TraversalStepSchema.seedUrn` optional.
- `FailedSeedSchema`, `STAGE_NAMES`, `StageNameSchema`, `StageDiagnosticSchema`, and `GraphRetainedCountsSchema` added with the server's strict shapes.
- `ModalityStatusDetailSchema` gains optional `entityCount`, `edgeCount`, `pathCount`.
- `RetrievalDiagnosticsSchema` gains optional `graphBeforeFusion`, `graphAfterFusion`, `stageDiagnostics` (max 8), `failedSeeds` (max 5).
- `RetrievalResponseSchema` enforces the `SEED_ONLY` invariant: at least one entity, empty paths and conflicts, `SEED_FOUND_NO_RELATION`, and no failed seed repeating a returned entity URN.
- `FederatedRetrievalResponseSchema.diagnostics` gains optional `stageDiagnostics` (max 20) and `failedSeeds` (max 5).

### `src/services/ai/groundedAnswerSchemas.ts`

- `GroundingOutcomeSchema` gains `SEED_ONLY`.
- `PersistedEntityRefSchema` — strict `{ urn, canonicalName (1-200), kind, snapshotId (uuid), evidenceClass? }`.
- `ChatMessageGroundingSchema` gains optional `entities` (max 50), `graphCounts`, `stageDiagnostics` (max 20), and `failedSeeds` (max 5). `schemaVersion` stays `z.literal(1)`; both provenance branches untouched.
- New persisted schemas reuse the protocol's `StageDiagnosticSchema`, `FailedSeedSchema`, `GraphRetainedCountsSchema`, and `NodeKindSchema` rather than redefining them.

### Tests

- `tests/knowledge/retrievalProtocolParity.test.ts` (new, 7 tests) imports both modules and asserts equality of outcomes, reason codes, stage names, depth cap, and the key sets of stage/failed-seed/count/diagnostics/federated-diagnostics shapes.
- `tests/knowledge/retrievalProtocol.test.ts` adds behavior cases: depth-5 parses / depth-0 fails, nonnegative count fields, `SEED_ONLY` invariant, federated stage rows (unknown key rejected), and a federated response without the optional keys.
- `tests/ai/groundedAnswerSchemas.test.ts` adds seven Phase 24 cases: historical fixture unchanged, seed-only fixture preserved, entity cap and kind validation, `graphCounts` bounds, `failedSeeds` cap and reason validation, and provenance enforcement still active.

## Verification

```
npx vitest run tests/knowledge/retrievalProtocolParity.test.ts \
  tests/knowledge/retrievalProtocol.test.ts tests/ai/groundedAnswerSchemas.test.ts
→ 3 files, 36 tests passed

npx tsc --noEmit
→ exit 0
```

## Deviations from Plan

None - plan executed exactly as written.

## Deferred Issues

- No client-side wiring yet: `groundedTurn` / chat persistence still need to populate the new optional fields; plan 24-05+ owns that consumption path.
- `tests/knowledge/retrievalProtocolParity.test.ts` imports the server module directly; root vitest excludes `knowledge-server/**` as a *test* root but still resolves the source import (verified by execution).

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model. New client surfaces are strict Zod schemas over already-bounded server JSON, and persisted diagnostics reuse content-free protocol schemas.

## Self-Check: PASSED

- Created file verified on disk: `tests/knowledge/retrievalProtocolParity.test.ts`.
- Commits verified in `git log`: 0d56d7f, cde63ff.
- Targeted suite: 36 tests passed; `tsc --noEmit` exits 0.
