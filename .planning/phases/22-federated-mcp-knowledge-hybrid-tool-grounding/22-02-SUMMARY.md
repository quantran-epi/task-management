---
phase: 22
plan: 02
subsystem: ai-retrieval
tags:
  - mcp
  - federated-retrieval
  - grounded-turn
  - evidence-pack
dependency_graph:
  requires:
    - 22-01
  provides:
    - mcpRetrievalRunner
    - mcpEvidencePacking
    - parallelDocsAndMcpRetrieval
  affects:
    - src/services/ai/mcpRetrievalRunner.ts
    - src/services/ai/groundedTurn.ts
    - src/services/ai/groundedTurnDeps.ts
    - src/services/ai/evidencePack.ts
    - src/services/ai/groundedAnswerSchemas.ts
tech_stack:
  patterns:
    - dynamic-tool-runner-loop
    - promise-allsettled-parallel-retrieval
    - m-prefix-citation-ids
key_files:
  created:
    - src/services/ai/mcpRetrievalRunner.ts
    - tests/ai/mcpRetrievalRunner.test.ts
  modified:
    - src/services/ai/groundedAnswerSchemas.ts
    - src/services/ai/evidencePack.ts
    - src/services/ai/groundedTurn.ts
    - src/services/ai/groundedTurnDeps.ts
    - tests/ai/evidencePack.test.ts
    - tests/ai/groundedTurn.test.ts
decisions:
  - Bounded MCP retrieval with 15s AbortController budget and max 3-turn tool loop to avoid hanging chat turns
  - M* citation format with server authority and OBSERVED evidence class for dynamic MCP tool observations
  - Promise.allSettled in groundedTurn to execute Knowledge Docs RAG and MCP tool runner concurrently with fail-soft fallback
metrics:
  duration: 18m
  completed_date: "2026-10-20"
---

# Phase 22 Plan 02: Dynamic MCP Retrieval Runner, Parallel Grounded Turn & Evidence Packing Summary

Parallelized Knowledge Docs RAG and dynamic MCP tool execution within `groundedTurn` using `Promise.allSettled`, a bounded 15s/3-turn tool runner, and unified `M*` citation packing into `EvidencePack`.

## Completed Tasks

1. **Task 1: Create mcpRetrievalRunner with 15s budget and bounded tool loop**
   - Created `src/services/ai/mcpRetrievalRunner.ts` providing `runMcpRetrieval` with 15s AbortController timeout and max 3 turns using `completeJson`.
   - Created unit tests in `tests/ai/mcpRetrievalRunner.test.ts` verifying tool discovery, invocation, 3-turn bound, and timeout tolerance.
   - Commit: `01b91da`

2. **Task 2: Extend CitationIdSchema and evidencePack for M* citations**
   - Updated `src/services/ai/groundedAnswerSchemas.ts` to accept `^(S|L|M)[1-9][0-9]*$` in `CitationIdSchema`, `evidenceKind: 'mcp_tool'`, and optional `mcpMetadata`.
   - Updated `src/services/ai/evidencePack.ts` to accept `mcpItems`, assign `M1`, `M2`... citation IDs with authority `'server'` and evidenceClass `'OBSERVED'`.
   - Extended `tests/ai/evidencePack.test.ts` to verify `M*` packing and closure validation.
   - Commit: `4dbbf7a`

3. **Task 3: Parallelize Docs RAG and MCP tool retrieval in groundedTurn**
   - Added `runMcpRetrieval` to `GroundedTurnDeps` in `src/services/ai/groundedTurn.ts` and `src/services/ai/groundedTurnDeps.ts`.
   - Dispatched Knowledge Docs retrieval and dynamic MCP retrieval in parallel using `Promise.allSettled`.
   - Implemented fail-soft coverage warning handling when MCP retrieval times out or fails, continuing synthesis using Docs evidence.
   - Added tests 26, 27, and 28 to `tests/ai/groundedTurn.test.ts`.
   - Commit: `87c39c8`

## Deviations from Plan

None - plan executed exactly as written.

## Verification

Ran targeted vitest test suite:
`npm test -- tests/ai/mcpRetrievalRunner.test.ts tests/ai/evidencePack.test.ts tests/ai/groundedTurn.test.ts`
All 58 tests passed across 3 test suites.

## Self-Check: PASSED

- FOUND: `src/services/ai/mcpRetrievalRunner.ts`
- FOUND: `tests/ai/mcpRetrievalRunner.test.ts`
- FOUND: `src/services/ai/evidencePack.ts`
- FOUND: `src/services/ai/groundedAnswerSchemas.ts`
- FOUND: `src/services/ai/groundedTurn.ts`
- FOUND: `src/services/ai/groundedTurnDeps.ts`
- FOUND commit `01b91da`
- FOUND commit `4dbbf7a`
- FOUND commit `87c39c8`
