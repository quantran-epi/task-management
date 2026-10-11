---
phase: 19-grounded-assistant-provenance-citations-offline-fallback
plan: 05
subsystem: ai
tags: [intent-router, scope-router, 9router, structured-outputs, json-schema]

requires:
  - phase: 19-02
    provides: Browser grounding trust boundary and grounded answer contracts
provides:
  - Non-streaming zero-tool structured JSON completion with capability probing on 9router
  - Deterministic-first intent router with clarify fallback
  - Natural language semantic scope router with strict JSON Schema and deterministic alias fallback
affects: [19-07, 19-08, 19-09, 19-10, AIChatDrawer, groundedTurn]

tech-stack:
  added: []
  patterns: [non-streaming structured JSON, host-model capability caching, deterministic-first intent scoring, canonical scope resolution]

key-files:
  created:
    - src/services/ai/intentRouter.ts
    - src/services/ai/semanticScopeRouter.ts
    - tests/ai/intentRouter.test.ts
    - tests/ai/semanticScopeRouter.test.ts
  modified:
    - src/services/ai/nineRouterClient.ts
    - tests/ai/nineRouterClient.test.ts

key-decisions:
  - "nineRouterClient.completeJson executes non-streaming, zero-tool structured calls under strict response_format with 45s timeout."
  - "Capability probe results are cached in-memory per sanitized host and model for 24h, avoiding repeated probe latency."
  - "Intent router is 100% deterministic, scoring Vietnamese queries against operational verbs and knowledge hints without model calls."
  - "Semantic scope router strips setId before sending catalog to model and strictly rejects any LLM response containing setId."
  - "Deterministic alias fallback resolves canonical and alias matches, routing general queries to isBase baseline sets."

patterns-established:
  - "Model-safe catalog projection: map catalog to strip database UUIDs before sending context to LLMs."
  - "Strict output rejection: enforce z.strictObject validation and reject forbidden fields like setId at runtime."

requirements-completed: [ANSWER-01, ANSWER-05]

duration: 18m
completed: 2026-10-11
---

# Phase 19 Plan 05: Pre-Retrieval Intent and Semantic Scope Routing Summary

**Three independent pre-retrieval services now provide deterministic intent routing, canonical-only semantic scope routing with alias fallback, and non-streaming structured JSON completion on 9router without leaking internal IDs.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-10-11T10:48:00Z
- **Completed:** 2026-10-11T11:06:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Extended `nineRouterClient` with `completeJson()` using non-streaming, zero-tool, strict `response_format` and typed `TIMEOUT` / `ABORTED` / `INVALID_RESPONSE` error handling.
- Implemented `probeStructuredOutputCapability()` with in-memory caching keyed by endpoint host and model ID (24-hour TTL).
- Created deterministic `routeIntent()` scoring queries against operational verbs and knowledge hints, returning `mixed` when both exceed 0.3, dominant routes when ratio >= 2, or `clarify` with confidence 0.
- Created `routeScope()` combining structured LLM interpretation with deterministic alias matching, resolving general questions to `isBase` baseline sets and scoped queries to `scope_diff` + `baseline` groups.
- Enforced strict model boundaries: catalog projection omits `setId` before LLM call, and router strictly rejects responses attempting to invent `setId`.

## Task Commits

1. **Task 1: Extend nineRouterClient with completeJson() and capability probe** - `eaf0cd1` (feat)
2. **Task 2: Create deterministic intentRouter + semanticScopeRouter with alias fallback** - `360356e` (feat)

## Files Created/Modified

- `src/services/ai/nineRouterClient.ts` - Added `completeJson`, `probeStructuredOutputCapability`, `NineRouterClientError`.
- `tests/ai/nineRouterClient.test.ts` - Verified non-streaming POST, timeout handling, abort handling, probe caching, and API key redaction.
- `src/services/ai/intentRouter.ts` - Deterministic intent scoring and clarify threshold logic.
- `src/services/ai/semanticScopeRouter.ts` - Canonical scope routing, setId stripping/rejection, and alias fallback.
- `tests/ai/intentRouter.test.ts` - Operational, knowledge, mixed, ambiguous/clarify, and normalization test cases.
- `tests/ai/semanticScopeRouter.test.ts` - LLM happy path, alias fallback, base default, setId rejection, and empty catalog test cases.

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `npx vitest run tests/ai/nineRouterClient.test.ts tests/ai/intentRouter.test.ts tests/ai/semanticScopeRouter.test.ts` passed: 3 test files, 32 tests passing.
- Acceptance criteria verified:
  - `grep -c "stream: false" src/services/ai/nineRouterClient.ts` = 1
  - `grep -c "response_format" src/services/ai/nineRouterClient.ts` = 4 (>= 2)
  - `grep -c "setId" src/services/ai/semanticScopeRouter.ts` verifies catalog payload strips `setId` and model responses containing `setId` are rejected.
  - TypeScript compiler clean across all modified files.

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED
