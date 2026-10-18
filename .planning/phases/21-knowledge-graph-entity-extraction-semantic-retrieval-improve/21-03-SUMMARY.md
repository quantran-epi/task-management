# Phase 21 Plan 03: Cypher Substring Search & Query Token Extraction Summary

- Phase: 21-knowledge-graph-entity-extraction-semantic-retrieval-improve
- Plan: 03
- Subsystem: knowledge-server (retrieval & graph query planning)
- Tags: neo4j, cypher, query-planning, retrieval, entity-resolution, bigrams, diacritics
- Key Files Modified:
  - `knowledge-server/src/graph/neo4jRepository.ts`
  - `knowledge-server/src/retrieval/queryPlanning.ts`
  - `knowledge-server/tests/neo4jRepository.test.ts`
  - `knowledge-server/tests/retrievalPlanning.test.ts`
  - `knowledge-server/tests/retrievalService.test.ts`
- Commits:
  - `0e34e0d`: feat(21-03): upgrade Cypher RESOLVE_ENTITIES query with alias and canonicalName substring contains
  - `fa0a486`: feat(21-03): enrich query token extraction and seed resolution in queryPlanning
  - `cb7e0e5`: test(21-03): verify graph modality retrieval and path fusion for natural language queries

## Execution Overview

1. **Neo4j Cypher `RESOLVE_ENTITIES` Upgrade**:
   - Updated `CYPHER_QUERIES.RESOLVE_ENTITIES` to check `any(a IN e.aliases WHERE toLower(a) CONTAINS toLower(token))` alongside `toLower(e.canonicalName) CONTAINS toLower(token)`.
   - Preserves exact match on `e.urn` and `e.normalizedKey` with `LIMIT 25` to protect retrieval performance and bounded latency.

2. **Enriched Query Token Extraction & Seed Resolution**:
   - Enhanced `extractQueryTokens` in `queryPlanning.ts` to generate:
     - 2-word n-grams (bigrams) for consecutive words to capture multi-word business phrases (e.g. `thanh toán`, `đối soát`, `khởi tạo`).
     - Diacritic-stripped counterparts for single words and bigrams via `removeVietnameseDiacritics`.
     - Filtered conversational stopwords (e.g. `cho`, `tôi`, `biết`, `là`, `những`, `của`) while retaining domain action words.
     - Capped token list to at most 20 tokens to mitigate query explosion (T-21-06).

3. **Graph Modality Retrieval & Fusion Verification**:
   - Added unit tests in `retrievalPlanning.test.ts` verifying seed resolution for accented and unaccented Vietnamese business step queries.
   - Added integration test in `retrievalService.test.ts` demonstrating that natural language queries map to real entity seeds, invoke bounded traversal, and return graph modality items with count > 0 and closed citation paths.

## Deviations from Plan

None - plan executed exactly as written.

## Threat Flags

None - all user query tokens are passed strictly as parameterized arrays in `$tokens` via `UNWIND $tokens` (T-21-05 mitigated); token count capped at 20 and query limit capped at 25 (T-21-06 mitigated).

## Self-Check: PASSED
- `knowledge-server/src/graph/neo4jRepository.ts`: FOUND
- `knowledge-server/src/retrieval/queryPlanning.ts`: FOUND
- `knowledge-server/tests/neo4jRepository.test.ts`: FOUND
- `knowledge-server/tests/retrievalPlanning.test.ts`: FOUND
- `knowledge-server/tests/retrievalService.test.ts`: FOUND
- Commits `0e34e0d`, `fa0a486`, `cb7e0e5`: FOUND
