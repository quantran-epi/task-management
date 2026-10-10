---
phase: 17-pilot-ontology-deterministic-extraction-neo4j-knowledge-grap
plan: 02
subsystem: knowledge-graph
tags: [deterministic-extraction, prose-fallback, mdast, consumed-ranges, quarantine, pilot-60000006]
dependency_graph:
  requires:
    - 17-01
  provides:
    - knowledge-server/src/graph/extraction.ts
    - knowledge-server/src/ai/proseExtraction.ts
    - knowledge-server/tests/deterministicExtraction.test.ts
    - knowledge-server/tests/proseFallback.test.ts
  affects:
    - knowledge-server/src/graph/neo4jRepository.ts
    - knowledge-server/src/graph/graphCandidate.ts
tech_stack:
  added: []
  patterns:
    - Deterministic-first MDAST extraction of structured tables and code blocks
    - Consumed character range tracking preventing prose fallback from reprocessing structured data
    - Single bounded LLM call ceiling with zero retries and strict input/output limits
    - Strict endpoint validation and verbatim quote verification before promoting inferred facts
key_files:
  created:
    - knowledge-server/src/graph/extraction.ts
    - knowledge-server/src/ai/proseExtraction.ts
    - knowledge-server/tests/deterministicExtraction.test.ts
    - knowledge-server/tests/proseFallback.test.ts
  modified:
    - knowledge-server/src/types/graphProtocol.ts
decisions:
  - "Lock all deterministic extractions to OBSERVED classification and DETERMINISTIC_TABLE/SQL/CODE methods"
  - "Track consumed character ranges for every parsed table and code block to exclude them from prose segmentation"
  - "Enforce zero retries on LLM prose fallback; quarantine malformed responses or HTTP errors without looping"
  - "Reject prose candidates referencing un-resolved subject/object endpoints and route to quarantine"
metrics:
  duration: 8m
  completed_date: "2026-10-10"
---

# Phase 17 Plan 02: Deterministic Extraction, Range Tracking, and Bounded Prose Fallback Summary

Deterministic MDAST extractors for process 60000006 tables, consumed range tracking, and bounded single-call prose fallback with strict endpoint validation and quarantine routing.

## Key Changes

1. **Graph Protocol Contracts Extended (`knowledge-server/src/types/graphProtocol.ts`)**
   - Added `FactAssertion`, `SourceRange`, `DeterministicExtractionResult`, and `ProseSegment` schemas and types.
   - Preserved `ResolvedNode` alias and `GraphEvidenceRecord` provenance.

2. **Deterministic MDAST Extractors (`knowledge-server/src/graph/extraction.ts`)**
   - Parses markdown AST using remark/unified.
   - Handles `PRC_PROCESS` tables (ScheduledProcess, SoftwareComponent, CALLS relations).
   - Handles `PRC_CONTAINER` tables (ProcessStep keyed by PRC_CONTAINER.ID per D-07, CONTAINS_STEP, INVOKES, PRECEDES, and USES_TYPE).
   - Handles Cycle bind tables (CycleType nodes and USES_TYPE relations).
   - Handles Billing dispatch and Data Object tables (MAIN1-qualified DatabaseObject nodes, WRITES_TO, READS_FROM relations).
   - Handles Status tables (Status nodes).
   - Records exact consumed ranges `[startOffset, endOffset]` for every processed table and code fence.
   - Emits `OBSERVED` classification and `DETERMINISTIC_TABLE` method for all facts.

3. **Bounded Prose Fallback Client (`knowledge-server/src/ai/proseExtraction.ts`)**
   - `collectUncoveredProse`: filters paragraphs, discarding any text overlapping `consumedRanges`.
   - `extractProseCandidatesOnce`:
     - Bounded limits: 12,000 max input chars, 1,200 max tokens, 100,000 max response chars, 30s timeout.
     - Single non-streaming call to OpenAI-compatible endpoint via native `fetch`.
     - Zero retries on HTTP error or malformed JSON (quarantines segments per D-13).
     - Strict endpoint validation: subject and object URNs must exist in pre-resolved endpoints.
     - Exact quote verification against segment text slice.
     - Assigns `INFERRED` classification and `LLM_PROSE` method to validated candidates.

4. **Unit Test Suites (`deterministicExtraction.test.ts`, `proseFallback.test.ts`)**
   - 5 tests verifying deterministic extraction against real process 60000006 markdown files (`01-wiring.md`, `02-data-objects.md`, `04-cycles.md`, `05-breadcrumbs.md`).
   - 5 tests verifying prose fallback range filtering, endpoint quarantine, quote verification, zero-retry behavior, and 12,000 character ceiling.
   - 10/10 tests green with zero TypeScript errors.

## Verification

- `npm --prefix knowledge-server exec tsc --noEmit` passed with 0 errors.
- `npm --prefix knowledge-server test -- tests/deterministicExtraction.test.ts tests/proseFallback.test.ts` passed (10/10 tests).

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED
- FOUND: knowledge-server/src/types/graphProtocol.ts
- FOUND: knowledge-server/src/graph/extraction.ts
- FOUND: knowledge-server/src/ai/proseExtraction.ts
- FOUND: knowledge-server/tests/deterministicExtraction.test.ts
- FOUND: knowledge-server/tests/proseFallback.test.ts
- FOUND: cd41754
- FOUND: f1318d0
