# Phase 21: Knowledge Graph Entity Extraction & Semantic Retrieval Improvement - Context

**Gathered:** 2026-10-18
**Status:** Ready for planning
**Source:** PRD Express Path (.planning/proposals/knowledge-graph-extraction-fix-plan.md)

<domain>
## Phase Boundary

Phase 21 resolves the critical defect where the Knowledge Graph contains meaningless `STEP_xxx` entities and returns 0 item count during AI chat retrieval. It covers:
1. Fixing `handleStepTable` in `knowledge-server/src/graph/extraction.ts` to extract `TEN_BUOC` into `canonicalName` and `aliases`, and parsing `WRITES` columns to generate `DatabaseObject` entities and `WRITES_TO` facts.
2. Expanding extraction to capture technical entities from code blocks (SQL, PL/SQL) and inline code spans (`SCHEMA.TABLE`) across documents without requiring strict tables.
3. Updating `AI_KNOWLEDGE_DOC_PROMPT` in `NotesView.tsx` to stop forcing dummy `STEP_ID` columns and encourage true technical entities.
4. Improving Neo4j seed resolution (`RESOLVE_ENTITIES`) in `neo4jRepository.ts` and `queryPlanning.ts` to support case-insensitive and Vietnamese normalized matching on `canonicalName` and `aliases`, eliminating false `NO_GRAPH_SEED` fallback.
5. Enabling and verifying hybrid prose extraction (`PROSE_EXTRACTION_ENABLED=true`) in `docker-compose.yml` with safe deterministic fallback.

Exclusions:
- Re-architecting vector embeddings or BM25 fulltext search (those remain completely untouched and independent).
- Interactive visual graph canvas UI.
</domain>

<decisions>
## Implementation Decisions

### ProcessStep & Table Parsing
- **`TEN_BUOC` as Canonical**: In `handleStepTable`, `canonicalName` must derive from `cells[nameIdx]` (`TEN_BUOC` / `PROCEDURE_NAME`), with `Step {execOrder}` as fallback only if name is missing.
- **Aliases Enrichment**: `aliases` of `ProcessStep` must include `rawStepId`, `TEN_BUOC`, and accent-stripped lowercase variant to support search queries.
- **`WRITES` Extraction**: In `handleStepTable`, parse `writesIdx` (`WRITES` / `GHI`), extract table identifiers (`MAIN1.TBL_...`), create `DatabaseObject` node, and emit `WRITES_TO` fact assertions.
- **Non-table Code Spans**: Scan Markdown AST for SQL/PLSQL blocks and inline code `SCHEMA.TABLE` / `PKG.PROC` to emit `DatabaseObject` and `SoftwareComponent` nodes even in non-table sections.

### Prompt & Template Standardization
- **Remove Mandatory `STEP_ID`**: Update `AI_KNOWLEDGE_DOC_PROMPT` and `RECOMMENDED_DOC_TEMPLATE` in `src/views/NotesView.tsx`. Change recommendation to `| THU_TU | TEN_BUOC | TARGET | WRITES | GHI_CHU |`. Only keep `STEP_ID` if the original source document already has system step IDs.
- **Preserve Real Code Identifiers**: Guide the AI to preserve exact technical names in code backticks.

### Seed Resolution & Retrieval
- **Fuzzy / Normalized Matching in Neo4j**: Enhance `CYPHER_QUERIES.RESOLVE_ENTITIES` in `knowledge-server/src/graph/neo4jRepository.ts` to match user query tokens against `e.canonicalName` and `e.aliases` using case-insensitive contains.
- **Semantic Seed Resolution**: In `knowledge-server/src/retrieval/queryPlanning.ts`, ensure natural language queries mapping to step names or component names resolve to seed URNs rather than defaulting to `NO_GRAPH_SEED`.

### Hybrid LLM Prose Extraction
- **Configuration**: Set `PROSE_EXTRACTION_ENABLED=true` in `docker-compose.yml` and wire endpoints in `main.ts`.
- **Fail-Safe Fallback**: Ensure that if LLM is offline or times out during prose extraction, the deterministic table/regex extraction remains 100% operational without failing the snapshot build.

### Claude's Discretion
- Exact regex patterns for SQL DDL/DML token extraction in code blocks.
- Thresholds for query token matching against entity names and aliases.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture & Extraction
- `.planning/proposals/knowledge-graph-extraction-fix-plan.md` — Core design proposal and defect breakdown.
- `knowledge-server/src/graph/extraction.ts` — Deterministic table & AST extraction handlers.
- `knowledge-server/src/ai/proseExtraction.ts` — Existing uncovered prose LLM extraction pipeline.
- `knowledge-server/src/graph/neo4jRepository.ts` — Neo4j Cypher queries including `RESOLVE_ENTITIES`.
- `knowledge-server/src/retrieval/queryPlanning.ts` — Query token extraction, seed resolution, and logical plan builder.
- `knowledge-server/src/services/retrievalService.ts` — Tri-modal retrieval execution (`fulltext`, `vector`, `graph`).
- `src/views/NotesView.tsx` — `AI_KNOWLEDGE_DOC_PROMPT` and doc templates.
</canonical_refs>

<specifics>
## Specific Ideas
- A question like "Cho tôi biết quy trình thanh toán" should match the `ProcessStep` entity "Khởi tạo giao dịch" or "Xử lý thanh toán", finding seed URNs and traversing to `MAIN1.PKG_PAYMENT` and `MAIN1.TBL_PAYMENT_LOG`.
- Graph item count in `RetrievalResponse` must be > 0 when the document set contains relevant entities and relationships.
</specifics>

<deferred>
## Deferred Ideas
- Interactive graph canvas visualization (deferred to v2).
- Automatic ontology extension via unsupervised clustering.
</deferred>

---

*Phase: 21-knowledge-graph-entity-extraction-semantic-retrieval-improve*
*Context gathered: 2026-10-18 via PRD Express Path (.planning/proposals/knowledge-graph-extraction-fix-plan.md)*
