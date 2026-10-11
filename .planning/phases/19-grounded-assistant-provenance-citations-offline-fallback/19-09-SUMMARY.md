---
phase: 19-grounded-assistant-provenance-citations-offline-fallback
plan: 09
subsystem: ai
tags: [grounded-turn, state-machine, provenance, fallback-allowlist, zero-model-calls]
dependency_graph:
  requires: [19-05, 19-06, 19-07, 19-08]
  provides: [19-10, 19-12, 19-13]
  affects: [src/services/ai/groundedTurn.ts]
tech_stack:
  added: []
  patterns: [discriminated-union-state-machine, fallback-allowlist, zero-model-call-gates]
key_files:
  created:
    - src/services/ai/groundedTurn.ts
    - tests/ai/groundedTurn.test.ts
  modified: []
decisions:
  - "Incorporate fallback allowlist in step 4: NETWORK_ERROR, TIMEOUT, and 5xx trigger scoped BM25; 401/403 (AUTH), 400/404 (CONFIG), and INVALID_RESPONSE inhibit fallback (D-41)."
  - "Enforce zero model calls on NO_EVIDENCE, UNSUPPORTED, and NEEDS_CLARIFICATION (D-04, D-07)."
  - "Persist server citations, paths, and conflicts in MODEL_UNAVAILABLE outcome so UI can show evidence and trigger synthesizeFromStoredEvidence (D-43, D-44)."
  - "createFreshLookupTurn preserves prior grounding byte-immutable and passes query to a new message turn (D-49)."
metrics:
  duration: 6m
  completed_date: "2026-10-11"
---

# Phase 19 Plan 09: Grounded Turn State Machine Summary

Orchestrated Wave 3/4 pipeline into a single deterministic state machine owning user turns, fallback allowlists, zero-model-call gates, model-unavailable evidence persistence, and historical turn replay.

## Completed Work

### 1. State Machine Service (`src/services/ai/groundedTurn.ts`)
- Implemented `runGroundedTurn` orchestrating:
  - Intent routing (`operational`, `clarify`, `knowledge`, `mixed`).
  - Semantic scope routing (`routeScope`).
  - Federated retrieval via knowledge server.
  - Fallback allowlist (handling `NETWORK_ERROR`, `TIMEOUT`, and server-disabled while halting on `ERROR_AUTH`, `ERROR_CONFIG`, `ERROR_INVALID_RESPONSE`).
  - Scoped local BM25 fallback path with strong evidence detection.
  - Server evidence packing, provenance validation, and structured answer synthesis.
  - Evidence-only `MODEL_UNAVAILABLE` outcome when model is unconfigured or unavailable.
  - Safe error rendering on `INVALID_GROUNDED_OUTPUT` with preserved evidence.
- Implemented `synthesizeFromStoredEvidence` for rehydrating historical citations without re-retrieval (D-44).
- Implemented `createFreshLookupTurn` returning fresh turn inputs without mutating original grounding (D-49).

### 2. State-Matrix Test Suite (`tests/ai/groundedTurn.test.ts`)
- 22 comprehensive test cases covering the entire outcome matrix:
  - Operational and Clarify intent routing without retrieval or synthesis.
  - Ready and Degraded knowledge synthesis.
  - Zero model calls on `NO_EVIDENCE`, `UNSUPPORTED`, and `NEEDS_CLARIFICATION`.
  - Fallback allowlist activation (`NETWORK_ERROR`, `TIMEOUT`, `SERVER_DISABLED`).
  - Fallback inhibition on `INVALID_RESPONSE`, `ERROR_AUTH` (401), and `ERROR_CONFIG` (404).
  - Clean abort propagation without persistence.
  - `MODEL_UNAVAILABLE` evidence-only state and subsequent `synthesizeFromStoredEvidence`.
  - Immutable historical preservation in `createFreshLookupTurn`.
  - Mixed intent flag propagation.

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- `src/services/ai/groundedTurn.ts` exists.
- `tests/ai/groundedTurn.test.ts` exists.
- Commits `96da442` and `3e4255e` recorded.
- All 22 tests pass.
