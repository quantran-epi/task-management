---
phase: 21-knowledge-graph-entity-extraction-semantic-retrieval-improve
verified: 2026-10-18T18:32:00Z
status: passed
score: 16/16 must-haves verified
overrides_applied: 0
---

# Phase 21: Knowledge Graph Entity Extraction & Semantic Retrieval Improvement Verification Report

**Phase Goal:** Eliminate dummy `STEP_xxx` entity extraction, extract meaningful `TEN_BUOC` and `WRITES` (DatabaseObject/WRITES_TO) from process tables, improve Neo4j seed resolution for natural language queries, and activate hybrid LLM prose extraction so graph retrieval yields relevant items (> 0 count).
**Verified:** 2026-10-18T18:32:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth   | Status     | Evidence       |
| --- | ------- | ---------- | -------------- |
| 1   | Process table extraction derives canonicalName from TEN_BUOC or PROCEDURE_NAME column instead of dummy Step numbers | ✓ VERIFIED | `handleStepTable` in `extraction.ts` sets `canonicalName = stepName \|\| ...` where `stepName = cells[nameIdx]?.trim()`. Verified by `deterministicExtraction.test.ts`. |
| 2   | ProcessStep aliases include rawStepId, TEN_BUOC, and accent-stripped lowercase variant | ✓ VERIFIED | `extraction.ts` lines 456-462: `aliasesSet.add(rawStepId); aliasesSet.add(stepName); aliasesSet.add(diacriticFree)`. Verified by unit tests. |
| 3   | Tables with WRITES or GHI column extract DatabaseObject nodes and emit WRITES_TO facts from step to target database table | ✓ VERIFIED | `extraction.ts` lines 550-590: parses tokens, builds `DatabaseObject` node, and emits `WRITES_TO` fact. Verified by unit tests. |
| 4   | SQL code blocks and inline code spans extract DatabaseObject and SoftwareComponent entities without requiring a table | ✓ VERIFIED | `extraction.ts` lines 868-960: AST code and inlineCode visitor extracts Oracle tables and PL/SQL packages/procedures. Verified by unit tests. |
| 5   | AI knowledge document prompt stops forcing dummy STEP_ID column when source documentation lacks legacy step numbers | ✓ VERIFIED | `src/views/NotesView.tsx`: `AI_KNOWLEDGE_DOC_PROMPT` Section 6 instructs: "Chỉ đưa cột STEP_ID / MA_BUOC vào bảng khi tài liệu gốc ĐÃ CÓ SẴN mã định danh bước từ hệ thống cũ. TUYỆT ĐỐI KHÔNG tự bịa hoặc tự sinh mã giả như STEP_01, STEP_02". |
| 6   | Recommended doc template features THU_TU, TEN_BUOC, TARGET, WRITES, and GHI_CHU as standard columns | ✓ VERIFIED | `src/views/NotesView.tsx`: lines 138 & 183 feature `\| THU_TU \| TEN_BUOC \| TARGET \| WRITES \| GHI_CHU \|`. |
| 7   | Prompt instructions guide AI and users to wrap actual database tables and procedures in code backticks | ✓ VERIFIED | `src/views/NotesView.tsx`: Section 6 explicitly requires backticks for components and tables (`MAIN1.PKG_PAYMENT`, `MAIN1.TBL_PAYMENT_LOG`). |
| 8   | NormalizeDocModal and its unit tests pass with updated table structure and prompt text | ✓ VERIFIED | `NormalizeDocModal.tsx` passes prompt, and `NormalizeDocModal.test.tsx` (5/5 tests passing). |
| 9   | Neo4j RESOLVE_ENTITIES query matches user query tokens against canonicalName and aliases using substring contains rather than strict equality | ✓ VERIFIED | `neo4jRepository.ts` line 363: `any(a IN e.aliases WHERE toLower(a) CONTAINS toLower(token))`. Verified in `neo4jRepository.test.ts`. |
| 10  | Query token extraction produces both diacritic-bearing and diacritic-stripped tokens alongside bigrams to capture natural Vietnamese terminology | ✓ VERIFIED | `queryPlanning.ts` lines 186-225: generates bigrams, unaccented bigrams, unaccented words, filters stopwords. Verified in `retrievalPlanning.test.ts`. |
| 11  | Natural language queries regarding business steps resolve seed URNs instead of defaulting to NO_GRAPH_SEED | ✓ VERIFIED | Tested with "thanh toan", "doi soat", "khoi tao giao dich" in `retrievalPlanning.test.ts` (14/14 tests passing). |
| 12  | Retrieval service returns graph modality items with count > 0 when matching entities and traversal paths exist | ✓ VERIFIED | `retrievalService.test.ts` asserts `retrieval.items.some(i => i.modality === 'graph') === true` and `graphCount > 0` for natural language queries. |
| 13  | docker-compose.yml defines PROSE_EXTRACTION_ENABLED=true with default fallback | ✓ VERIFIED | `docker-compose.yml` line 55: `PROSE_EXTRACTION_ENABLED=${PROSE_EXTRACTION_ENABLED:-true}`. |
| 14  | knowledgeServer startup gracefully handles PROSE_EXTRACTION_ENABLED=true even when remote LLM endpoint is unconfigured or unreachable by falling back to deterministic extraction | ✓ VERIFIED | `main.ts` lines 328-335: logs warning and sets `enabled = false` instead of throwing fatal startup error. Verified in `main.test.ts`. |
| 15  | If prose LLM extraction times out or returns malformed response during graph snapshot build, deterministic extractions are preserved without failing snapshot creation | ✓ VERIFIED | `graphBuildService.ts` lines 216-239: try-catch around `extractProseCandidatesOnce` logs warning and proceeds with deterministic candidate. Verified in `proseFallback.test.ts`. |
| 16  | Unit and integration tests verify prose fallback resilience and hybrid graph build pipeline | ✓ VERIFIED | `proseFallback.test.ts` (11/11 tests passing) verifies 504 timeouts, network drops, malformed JSON, and successful LLM merges. |

**Score:** 16/16 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `knowledge-server/src/graph/extraction.ts` | Deterministic AST and table entity extraction supporting TEN_BUOC, WRITES_TO, and code spans (>= 800 lines) | ✓ VERIFIED | Exists, 974 lines, fully wired. |
| `knowledge-server/tests/deterministicExtraction.test.ts` | Unit tests verifying step name extraction, aliases enrichment, and WRITES_TO database objects (>= 200 lines) | ✓ VERIFIED | Exists, 311 lines, 11 tests passing. |
| `src/views/NotesView.tsx` | Updated AI_KNOWLEDGE_DOC_PROMPT and RECOMMENDED_DOC_TEMPLATE containing `THU_TU \| TEN_BUOC \| TARGET \| WRITES \| GHI_CHU` | ✓ VERIFIED | Exists, 977 lines, contains required prompt and template columns. |
| `tests/components/notes/NormalizeDocModal.test.tsx` | Unit test suite verifying prompt consumption and template normalization (>= 80 lines) | ✓ VERIFIED | Exists, 126 lines, 5 tests passing. |
| `knowledge-server/src/graph/neo4jRepository.ts` | Enhanced RESOLVE_ENTITIES query supporting substring contains and alias matching | ✓ VERIFIED | Exists, contains `any(a IN e.aliases WHERE toLower(a) CONTAINS toLower(token))`. |
| `knowledge-server/src/retrieval/queryPlanning.ts` | Diacritic-tolerant token extraction and bigram phrase extraction for semantic seed resolution (>= 500 lines) | ✓ VERIFIED | Exists, 546 lines, fully wired. |
| `knowledge-server/tests/retrievalPlanning.test.ts` | Tests verifying seed resolution for natural language and diacritic-free queries (>= 150 lines) | ✓ VERIFIED | Exists, 189 lines, 14 tests passing. |
| `docker-compose.yml` | Container environment definition with hybrid prose extraction activated | ✓ VERIFIED | Exists, contains `PROSE_EXTRACTION_ENABLED=${PROSE_EXTRACTION_ENABLED:-true}`. |
| `knowledge-server/src/main.ts` | Configuration loader allowing seamless prose extraction fallback and safe endpoint defaults (>= 300 lines) | ✓ VERIFIED | Exists, 477 lines, handles fallback cleanly. |
| `knowledge-server/tests/proseFallback.test.ts` | Tests verifying fail-safe behavior of prose extraction during LLM outage or timeout (>= 120 lines) | ✓ VERIFIED | Exists, 330 lines, 11 tests passing. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `extraction.ts` | `identity.ts` | `buildUrn('smartvista', 'PRC_CONTAINER')` | ✓ WIRED | Line 469: calls `buildUrn` for process step identity. |
| `extraction.ts` | `ResolvedNode` | `addNode` registering `ProcessStep` & `DatabaseObject` | ✓ WIRED | Lines 486 & 578: registers resolved entities to candidate context. |
| `src/views/NotesView.tsx` | `src/components/notes/NormalizeDocModal.tsx` | `AI_KNOWLEDGE_DOC_PROMPT` import | ✓ WIRED | Imported on line 18 and passed as system prompt in streaming chat. |
| `queryPlanning.ts` | `neo4jRepository.ts` | `gateway.resolveEntities` call passing tokens | ✓ WIRED | Line 274: passes extracted query tokens into Neo4j entity resolution. |
| `retrievalService.ts` | `queryPlanning.ts` | `buildQueryExecutionPlan` call | ✓ WIRED | Line 139: executes plan building and seed resolution. |
| `main.ts` | `proseExtraction.ts` | `ProseExtractionServerConfig` wiring | ✓ WIRED | Lines 309-385: wires prose extraction options into server runtime. |
| `docker-compose.yml` | `main.ts` | `PROSE_EXTRACTION_ENABLED` env var | ✓ WIRED | Declared in service env and read in `readKnowledgeServerOptions`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `handleStepTable` | `canonicalName`, `aliases`, `tableUrn` | Markdown step table rows (`THU_TU`, `TEN_BUOC`, `TARGET`, `WRITES`) | Populates step nodes, database nodes, and `WRITES_TO` facts | ✓ FLOWING |
| `extractQueryTokens` | `tokens` | User chat query | Produces words, bigrams, and unaccented terms | ✓ FLOWING |
| `resolveQueryEntities` | `resolvedSeeds` | Neo4j Cypher `RESOLVE_ENTITIES` via `$tokens` parameter | Resolves matching entity URNs from Neo4j | ✓ FLOWING |
| `GraphBuildService` | `inferredFacts`, `inferredEvidence` | `extractProseCandidatesOnce` (or safe empty fallback on error) | Produces LLM inferred facts or falls back to deterministic | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Deterministic extraction unit tests | `npm --prefix knowledge-server test -- tests/deterministicExtraction.test.ts` | 11 passed | ✓ PASS |
| General doc extraction unit tests | `npm --prefix knowledge-server test -- tests/generalDocumentExtraction.test.ts` | 6 passed | ✓ PASS |
| Notes NormalizeDocModal unit tests | `npm test -- tests/components/notes/NormalizeDocModal.test.tsx` | 5 passed | ✓ PASS |
| Retrieval planning & service tests | `npm --prefix knowledge-server test -- tests/retrievalPlanning.test.ts tests/retrievalService.test.ts tests/neo4jRepository.test.ts` | 56 passed | ✓ PASS |
| Prose fallback & main config tests | `npm --prefix knowledge-server test -- tests/proseFallback.test.ts tests/main.test.ts tests/graphBuildRuntime.test.ts` | 54 passed | ✓ PASS |
| Full knowledge-server test suite | `npm --prefix knowledge-server test` | 402 passed, 18 skipped | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| GRAPH-EXTRACT-01 | 21-01, 21-02, 21-04 | Entity & relation extraction improvements (meaningful step names, diacritic-normalized aliases, WRITES_TO facts, code spans) | ✓ SATISFIED | Implemented in `extraction.ts`, prompt standardized in `NotesView.tsx`, verified in tests. |
| GRAPH-RETRIEVE-01 | 21-03, 21-04 | Semantic retrieval improvements (Cypher substring matching, diacritic-tolerant query planning, hybrid prose fallback) | ✓ SATISFIED | Implemented in `neo4jRepository.ts`, `queryPlanning.ts`, `main.ts`, `graphBuildService.ts`, verified in tests. |

### Anti-Patterns Found

None. Scanned files for `TODO`, `FIXME`, `HACK`, `TBD`, empty handlers, or dummy stubs. References to `SD-XXXXX` in `NotesView.tsx` are intentional example placeholders within user-facing Markdown template strings.

### Human Verification Required

None. All extraction logic, database relationship creation, Cypher queries, tokenization, fallback handlers, and prompt templates are thoroughly covered by automated test suites.

---

_Verified: 2026-10-18T18:32:00Z_
_Verifier: Claude (gsd-verifier)_
