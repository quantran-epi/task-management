---
phase: 23-knowledge-graph-build-reliability-entity-fidelity
plan: 01
subsystem: knowledge-graph
tags: [knowledge-graph, entity-fidelity, vietnamese-diacritics, urn, neo4j, cypher, fact-dto]
dependency-graph:
  requires:
    - Phase 17: Knowledge Graph Extraction
    - Phase 19.1: Production Neo4j Integration
  provides:
    - Unicode NFD slugification in URN construction
    - Preserved Vietnamese canonical names in Neo4j fact queries
    - Non-slicing FactSummaryDTO mapping
    - LLM entity naming constraints
  affects:
    - knowledge-server/src/graph/identity.ts
    - knowledge-server/src/graph/neo4jRepository.ts
    - knowledge-server/src/graph/graphRepository.ts
    - knowledge-server/src/services/graphBuildService.ts
    - knowledge-server/src/ai/llmExtraction.ts
    - knowledge-server/src/types/graphProtocol.ts
tech-stack:
  added: []
  patterns:
    - Native String.prototype.normalize('NFD') for diacritic stripping without third-party dependencies
    - Cypher node joins in GET_FACTS_BY_SNAPSHOT to retrieve true entity canonical names
    - Protocol interface enrichment on FactDetail
key-files:
  created:
    - knowledge-server/tests/graphBuildService.test.ts
  modified:
    - knowledge-server/src/graph/identity.ts
    - knowledge-server/src/graph/neo4jRepository.ts
    - knowledge-server/src/graph/graphRepository.ts
    - knowledge-server/src/services/graphBuildService.ts
    - knowledge-server/src/ai/llmExtraction.ts
    - knowledge-server/src/types/graphProtocol.ts
    - knowledge-server/tests/graphIdentity.test.ts
decisions:
  - Use native Unicode NFD normalization and specific Vietnamese character replacements (đ/Đ) to generate clean ASCII URN segments without underscore runs.
  - Return subjectCanonicalName and objectCanonicalName directly from Neo4j :Entity nodes in GET_FACTS_BY_SNAPSHOT Cypher query.
  - Populate FactSummaryDTO from FactDetail canonical name properties and remove fragile split(':')[4] slicing.
  - Add Rule 8 to LLM SYSTEM_PROMPT enforcing concise, noun-centric entity names under 80 characters for ProcessStep entities.
metrics:
  duration: 8m
  completed_date: "2026-10-20"
---

# Phase 23 Plan 01: Vietnamese Entity Fidelity, Unicode NFD Slugification & Canonical Name Joins Summary

Eliminated Vietnamese entity name mutilation across URN generation, Cypher queries, FactSummaryDTO, and UI display per ENTITY-FIDELITY-01.

## What Was Done

### Task 1: Vietnamese Unicode NFD Slugification and URN Generation (Commit: f632dc7)
- Added `slugifyVietnamese` helper in `knowledge-server/src/graph/identity.ts`:
  - Decomposes accents and tone marks via native `normalize('NFD')` and regex diacritic stripping.
  - Maps `đ` / `Đ` to `d` / `D`.
  - Replaces non-URI characters with underscores and collapses consecutive runs of underscores into a single clean separator.
- Updated `encodeUrnSegment` to use `slugifyVietnamese`, ensuring URN segments never contain cascading underscore chains like `X__l__merchant_b__t__ch_i`.
- Added unit tests in `knowledge-server/tests/graphIdentity.test.ts` verifying proper ASCII slugification and absence of consecutive underscores.

### Task 2: Fact Query Node Joins, DTO Canonical Name Preservation, and Entity Naming Prompt Constraints (Commit: b88e44f)
- Extended `FactDetail` in `knowledge-server/src/types/graphProtocol.ts` with `subjectCanonicalName`, `subjectKind`, `objectCanonicalName`, and `objectKind`.
- Updated `CYPHER_QUERIES.GET_FACTS_BY_SNAPSHOT` in `knowledge-server/src/graph/neo4jRepository.ts` to `OPTIONAL MATCH` subject and object `:Entity` nodes and return their `canonicalName` and `kind` using `coalesce()`.
- Updated `InMemoryGraphRepository.getFacts` in `knowledge-server/src/graph/graphRepository.ts` to resolve node names and kinds from candidate nodes.
- Updated `GraphBuildService.getFacts` in `knowledge-server/src/services/graphBuildService.ts` to map `subjectName` and `objectName` directly from node canonical names, completely eliminating `split(':')[4]` string slicing.
- Enforced Rule 8 in `knowledge-server/src/ai/llmExtraction.ts` `SYSTEM_PROMPT` to restrict entity names to concise noun-centric labels (< 80 chars for ProcessStep) and forbid full sentences.
- Added comprehensive unit tests in `knowledge-server/tests/graphBuildService.test.ts` verifying preservation of Vietnamese titles in `FactSummaryDTO`.

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- `npm --prefix knowledge-server test -- tests/graphIdentity.test.ts`: Passed (17/17 tests).
- `npm --prefix knowledge-server test -- tests/graphBuildService.test.ts tests/graphRoutes.test.ts`: Passed (8/8 tests).
- `npm --prefix knowledge-server test -- tests/graphIdentity.test.ts tests/graphBuildService.test.ts tests/graphRoutes.test.ts`: Passed (25/25 tests).
- `grep -n "split(':')\\[4\\]" knowledge-server/src/services/graphBuildService.ts`: 0 matches found.

## Self-Check: PASSED
- `knowledge-server/src/graph/identity.ts`: FOUND
- `knowledge-server/src/graph/neo4jRepository.ts`: FOUND
- `knowledge-server/src/graph/graphRepository.ts`: FOUND
- `knowledge-server/src/services/graphBuildService.ts`: FOUND
- `knowledge-server/src/ai/llmExtraction.ts`: FOUND
- `knowledge-server/src/types/graphProtocol.ts`: FOUND
- `knowledge-server/tests/graphBuildService.test.ts`: FOUND
- Commits `f632dc7` and `b88e44f`: FOUND
