# Phase 18: Multi-Modal Hybrid Retrieval Engine - Context

**Gathered:** 2026-10-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 18 builds a hybrid retrieval engine that fuses full-text (BM25), semantic vector, and bounded Cypher graph traversal over the pilot process `60000006` corpus, returning one ranked, deduplicated, citation-bearing evidence set per query. Phase 18 owns: the LLM query planner contract, the semantic embedding pipeline and index, bounded ontology-aware graph traversal, Reciprocal Rank Fusion with conflict surfacing, and a uniform retrieval response envelope. Phase 18 does **not** own: assistant answer synthesis, chat UI, interactive graph canvas, full-corpus expansion beyond `60000006`, or any new Markdown mutation. Published Markdown remains canonical from Phase 16/17; retrieval reads only from the active snapshot promoted by Phase 17's atomic activation.

Process `60000006` is the **acceptance corpus only**. The retrieval architecture must generalize to the broader card-system corpus, so decisions below prefer corpus-general ontology-driven designs over pilot-specific shortcuts.

</domain>

<decisions>
## Implementation Decisions

### Query intent and planning
- **D-01:** Every query runs full-text, semantic vector, and bounded Cypher graph retrieval in parallel. Query planning shapes execution per modality (seeds, filters, depth) but never disables a modality. No sequential fallback that silently drops a modality.
- **D-02:** Natural-language queries route through an LLM query planner that emits a strict typed logical query plan referencing the Phase 17 closed ontology (7 node kinds, 10 relation types). The planner never emits raw Cypher and never invents entities not present as resolved URNs. A manually maintained intent-prototype catalog is not the primary architecture.
- **D-03:** A deterministic fast path exists only when the entire query is a pure identifier or qualified-name lookup (e.g. `AML_RISK`, `MAIN1.FCL_CYCLE_COUNTER`). Any natural-language relation, pronoun, synonym, or multi-clause composition routes through the planner.
- **D-04:** Ambiguous entity references (unresolvable pronouns, name collisions, missing context) return outcome `NEEDS_CLARIFICATION` with safe candidate URNs. The server never best-guesses an entity. Aligns with Phase 17 collision-safe identity rules.
- **D-05:** The planner receives bounded recent conversation turns plus server-resolved typed entity URNs (not full history, not LLM-invented names). Resolution happens server-side against the active graph snapshot before the planner is invoked.
- **D-06:** Scope is corpus- and process-general. Build an ontology registry, strict logical plans, parameterized static Cypher templates, and a degraded hybrid-retrieval fallback that activates on planner failure. Pilot process `60000006` is the acceptance corpus only.

### Semantic runtime
- **D-07:** Support both self-hosted local embedding model (ONNX/Transformers via `@xenova/transformers`, CPU-capable, ~120MB–2GB artifact) and remote OpenAI-compatible `/v1/embeddings` endpoint. Server auto-selects by config. A normal local PC CPU is sufficient for single-user daily workload; dedicated server or GPU is only required for very large corpora or multi-user throughput.
- **D-08:** Embeddings are stored in a Neo4j native vector index on `Evidence`/`Chunk` nodes, co-located with the graph snapshot. One store serves both vector and graph modalities, sharing Phase 17's atomic snapshot activation; no cross-DB synchronization. Index is rebuildable from Markdown.
- **D-09:** Each index generation records `provider`, `model`, `dimensions`, and `embeddingPolicyVersion`. Any change to these fields marks the index stale, triggers a full rebuild of all chunk vectors, validates dimensions, then atomically activates the new index. Query-time verifies the live model matches the index; on mismatch the semantic modality returns `unavailable` rather than wrong results.
- **D-10:** Remote embedding is **off by default**. Enabling requires an explicit config flag (e.g. `EMBEDDING_REMOTE_ENABLED=true` plus endpoint URL). Startup logs a visible banner naming the provider, model, and endpoint host. Every retrieval response tags `embeddingProvider` metadata so clients can display status. Embedding API keys stay in server environment or secret store only — never in PlannerMate client bundle, IndexedDB, published snapshot, logs, or retrieval response body.
- **D-11:** When the embedding provider fails or is unavailable, retrieval returns a partial result containing full-text and graph modality items. Response includes `modalitiesUsed` (list) and `semanticStatus='unavailable'` with reason code (`TIMEOUT`, `UNCONFIGURED`, `PROVIDER_ERROR`). RRF runs on remaining modalities. The query is not blocked.

### Graph traversal
- **D-12:** Graph modality seeds come **only** from planner-resolved typed entity URNs (identifier parsing, context entities, or prior-turn resolution). Graph runs only when at least one seed exists; absence returns fallback reason `NO_GRAPH_SEED`. Seeds are never derived from full-text or vector top-K candidates to prevent silent precision loss.
- **D-13:** Hop depth is planner-provided per logical plan with values 1–3. Server validates and clamps: depth > 3 is clamped to 3 and a warning is logged. The ontology registry may override per-relation (e.g. `PRECEDES` max 2, `READS_FROM` reverse max 3). Rationale: ROADMAP success criteria #4 requires 1–3 hops; ontology relation chains for impact analysis need 3 hops; Cypher cost grows roughly as `O(avg_degree^hops)` so 3 is the sweet spot before noise and blow-up.
- **D-14:** By default, traversal crosses only `OBSERVED` and `BUSINESS_APPROVED` edges. `INFERRED` edges are skipped unless the query sets `include_inferred=true`. Every response edge is tagged with `evidenceClass` so clients can render badges. Honors Phase 17 D-22 evidence-gated traversal.
- **D-15:** Cypher uses DISTINCT-path semantics (each node visited once per path) and enforces hard caps `maxNodes=100`, `maxEdges=200` via `LIMIT` inside the template. Exceeding either cap truncates results and sets `graphStatus='truncated'` with `reason='RESULT_LIMIT_REACHED'` in the response. Protects the server from runaway queries on cyclic or dense subgraphs.
- **D-16:** The planner specifies relation types and direction explicitly. The logical plan lists `relationTypes` (subset of the 10 ontology types), `direction` per type (`OUTGOING`/`INCOMING`/`BOTH`), and `maxHops` per type. Server validates each type against the ontology registry, caps traversal entries at 5, and enforces `overallMaxDepth <= 3`. The plan maps to a parameterized Cypher template — no string interpolation. The planner receives the ontology registry (names, endpoint kinds, example queries) in context so it can choose precisely.

### Fusion output and response envelope
- **D-17:** Fusion uses Reciprocal Rank Fusion (RRF) with `k=60`. `score(doc) = Σ 1 / (k + rank_i)` across modalities that returned the doc. Rank-based, no score normalization or weight calibration. Enterprise standard (Azure AI Search, Elasticsearch hybrid, Vertex AI). Documents appearing in multiple modalities naturally rank higher.
- **D-18:** Cross-modality deduplication uses composite key `(type, id)`: chunks by `chunkId`, entities by URN, edges by `factKey`. Same chunk returned by multiple modalities collapses into one record with summed RRF score and `modalitiesContributed[]`. Chunks, entities, and edges remain separate record types.
- **D-19:** Response includes the top 20 items by RRF score by default, overridable per query to 10–50. Response carries `totalCandidates` (pre-cutoff count) so clients can indicate truncated evidence.
- **D-20:** Response is a single flat `items[]` array ranked by RRF score. Each item carries a `type` tag (`chunk`/`entity`/`edge`) and `modalitiesContributed[]`. The client decides grouping and presentation. No server-side bundling heuristic.
- **D-21:** The server detects contradicting evidence heuristically — same `(seedURN, relationType)` with divergent targets, or same `factKey` with contradicting supporting evidence. All contradicting items remain in the response tagged with a shared `conflictGroupId` and `hasConflict=true`. The server never picks a side. Honors Phase 17 D-12 "retain both evidence assertions" and the "never guess" principle.
- **D-22:** Each item carries full citations with reference-based deduplication: chunks carry `{sourceDocumentId, sectionAnchor, lineStart, lineEnd, snapshotId}`; entities carry `{urn, canonicalName, snapshotId, firstSeenInDoc}`; edges carry `{factKey, sourceURN, targetURN, evidenceClass, supportingEvidence[]}` where `supportingEvidence[]` references chunks already present in the response by `chunkId` (no text duplication). Reuses Phase 17 `GraphEvidenceRecord`.
- **D-23:** Response uses a uniform envelope `{outcome, items[], diagnostics, modalityStatus, planTrace, snapshotId, embeddingProvider}`. `outcome` is one of `READY`, `NEEDS_CLARIFICATION`, `NO_EVIDENCE`, `UNSUPPORTED`, `DEGRADED`. `NEEDS_CLARIFICATION` adds `candidates[]`; `NO_EVIDENCE` adds `reason` + `suggestedRefinements[]`; `UNSUPPORTED` adds `reason` + `unsupportedConstructs[]`; `DEGRADED` keeps `items[]` but sets `degraded=true`. Clients branch on `outcome` field, not on HTTP status (always 200 unless transport error).
- **D-24:** The server resolves the active `snapshotId` once at request start and pins it for the entire query. All three modalities read from the pinned snapshot. The response echoes `snapshotId`. If a modality cannot read the pinned snapshot (promoted away mid-query), its items are marked `status='stale'` in `modalityStatus`. Mirrors Phase 17 atomic activation.
- **D-25:** Each modality has an independently configurable timeout via env vars `RETRIEVAL_TIMEOUT_FULLTEXT_MS`, `RETRIEVAL_TIMEOUT_VECTOR_MS`, `RETRIEVAL_TIMEOUT_GRAPH_MS`. Defaults: full-text 500 ms, vector 1500 ms, graph 2000 ms. On timeout the modality returns `status='timeout'` with reason code; its items drop from fusion and the response is flagged `degraded=true` for that modality. One slow modality never blocks the overall response.

### Claude's Discretion
- Exact JSON shape of the logical query plan, provided it is strictly typed, references only ontology-registered relation types and resolved URNs, carries no raw Cypher, and is Zod-validated before Cypher template binding.
- Choice of specific embedding model artifact (e.g. `multilingual-e5-small` vs `bge-m3`) subject to D-07/D-09 metadata-binding and rebuild rules, provided multilingual Vietnamese↔English retrieval success criterion holds.
- Internal detection heuristic for `hasConflict` grouping, provided D-21 "surface both sides, never pick" invariant holds and `conflictGroupId` is stable within a response.
- Internal Cypher template catalog shape (one template per `(traversal entry count, direction mix)` combination vs a single `apoc.path.subgraphAll` call with filter parameters), provided D-15 cycle/cap guarantees and D-16 no-interpolation rule hold.
- Exact field names in the response envelope, provided D-23 outcome enum and D-20 flat-items contract hold.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone and phase scope
- `.planning/PROJECT.md` — Markdown-canonical constraint, optional-server isolation, pilot boundary, evidence integrity, DLP boundary, and v1.2 "Hybrid GraphRAG Knowledge Assistant MVP" milestone.
- `.planning/REQUIREMENTS.md` — Active requirements for querying flow/dependency/impact, citations, classification, and benchmark success criteria.
- `.planning/ROADMAP.md` — Phase 18 goal, `RETR-01` through `RETR-05`, success criteria including Vietnamese↔English retrieval, 1–3 hop bounded traversal, and single ranked deduplicated evidence set.
- `.planning/phases/17-pilot-ontology-deterministic-extraction-neo4j-knowledge-grap/17-CONTEXT.md` — Closed ontology (7 node kinds, 10 relation types), URN identity, deterministic-first extraction, evidence classification, atomic rebuild. Explicitly defers hybrid retrieval to Phase 18.

### Pilot corpus (acceptance only; architecture must generalize beyond)
- `docs/sample-markdown-flow/60000006-SHB-Credit-calculations/README.md` — Pilot overview, process/container ID collision, flow summary.
- `docs/sample-markdown-flow/60000006-SHB-Credit-calculations/01-wiring.md` — Deterministic tables for process/container/bind/parameter structure.
- `docs/sample-markdown-flow/60000006-SHB-Credit-calculations/02-data-objects.md` — Database object roles, read/write behavior, source IDs.
- `docs/sample-markdown-flow/60000006-SHB-Credit-calculations/03-call-chain.md` — Scheduler → JDBC → PL/SQL call chain for traversal validation.
- `docs/sample-markdown-flow/60000006-SHB-Credit-calculations/04-cycles.md` — Cycle types, dispatch behavior, status transitions.

### Existing server contracts
- `knowledge-server/src/types/graphProtocol.ts` — `NodeKindSchema`, `RelationTypeSchema`, `EvidenceClassificationSchema`, `GraphEvidenceRecordSchema`, `FactDetail`, `GraphCandidate`, `ActiveGraphView` — reusable foundation for retrieval DTOs.
- `knowledge-server/src/graph/graphRepository.ts` — `GraphRepository` interface (`writeCandidate`, `activateCandidate`, `getActiveGraph`, `getFacts`, `getQuarantines`) and `InMemoryGraphRepository`.
- `knowledge-server/src/graph/neo4jRepository.ts` — `Neo4jRepository`, `CYPHER_QUERIES`, `STATIC_RELATION_WRITERS`, parameterized template pattern. **Landmine:** `initializeSchemaConstraints` currently sets uniqueness constraints only; Phase 18 must add full-text indexes and vector indexes.
- `knowledge-server/src/services/graphBuildService.ts` — Build state machine; current `getFacts`/`getEvidence` load active graph then filter in memory — retrieval must not reuse that pattern for query-time hot path.
- `knowledge-server/src/routes/graph.ts` — Existing routes under `/api/v1/sets/:setId/graph/*`; integration point for the new retrieval endpoint (e.g. `POST /api/v1/sets/:setId/retrieve`).
- `knowledge-server/src/types/protocol.ts` — `EvidenceChunk` provenance fields, `CHUNKING_POLICY_VERSION`, strict Zod protocol pattern.
- `knowledge-server/src/parser/sectionChunker.ts` — Exact chunk heading path, line/offset range, content hash — used by both full-text indexing and citation payload.
- `knowledge-server/src/indexing/snapshotStore.ts` — Active-candidate lifecycle, atomic promotion — Phase 18 must pin `snapshotId` against this contract (D-24).
- `knowledge-server/package.json` — Current deps: `neo4j-driver@6.2.0`, Fastify, Zod, remark. **Landmine:** no embedding or vector dependency yet; Phase 18 adds `@xenova/transformers` (local adapter) or OpenAI-compatible HTTP client (remote adapter) per D-07.

### Client-side offline fallback (must stay independent)
- `src/utils/bm25.ts` — Client-side BM25 with Vietnamese diacritic normalization. Phase 18 server retrieval must not displace this: PlannerMate continues to operate offline when the knowledge server is disabled, unreachable, or absent.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `knowledge-server/src/types/graphProtocol.ts` — Reuse `NodeKindSchema`, `RelationTypeSchema`, `EvidenceClassificationSchema`, `GraphEvidenceRecordSchema` directly in the retrieval request/response Zod schemas; do not invent a parallel evidence model.
- `knowledge-server/src/graph/neo4jRepository.ts` — Reuse the parameterized `CYPHER_QUERIES` + `STATIC_RELATION_WRITERS` pattern for the traversal template catalog so the no-interpolation guarantee (D-16) holds end-to-end.
- `knowledge-server/src/indexing/snapshotStore.ts` — Reuse `getActiveSnapshotId()` at request start to pin `snapshotId` for D-24; do not read "latest" per modality.
- `knowledge-server/src/parser/sectionChunker.ts` — Reuse `{sourceDocumentId, sectionAnchor, lineStart, lineEnd}` directly in response chunk citations (D-22).
- `knowledge-server/tests/pilotAcceptance.test.ts` — Existing fixture location can be extended with hybrid retrieval acceptance cases (Vietnamese↔English queries, 1–3 hop impact, conflict surfacing, degraded modes).

### Established Patterns
- Knowledge server is an independent Node/TypeScript/Fastify service; PlannerMate remains operational without it.
- Published Markdown snapshots are immutable inputs; derived indexes (BM25, vector, Cypher graph) are disposable projections rebuilt from Markdown.
- Protocol boundaries use strict Zod schemas and content-free status/error metadata — retrieval endpoint must follow the same pattern.
- Candidate state is built separately and promoted only when complete; retrieval must respect the active-snapshot boundary and never read building/failed state.
- No embedding, vector, or LLM provider dependency in `knowledge-server/package.json` yet — Phase 18 must select the minimum necessary integration without coupling the static PWA to any server.

### Integration Points
- Add a `/api/v1/sets/:setId/retrieve` route alongside existing graph routes in `knowledge-server/src/routes/graph.ts`.
- Add a retrieval orchestrator service that: (1) pins `snapshotId`, (2) invokes planner, (3) fans out to full-text + vector + graph in parallel with per-modality timeouts, (4) runs RRF + dedup + conflict detection, (5) assembles the uniform response envelope.
- Add an ontology registry module (shared by Phase 17 and Phase 18) exposing: 10 relation types, their endpoint node-kind pairs, default direction semantics, and per-relation `maxHops` overrides.
- Add an embedding provider abstraction with two adapters (local ONNX via `@xenova/transformers`, remote OpenAI-compatible via `fetch`), selected by config, exposing `describe()` / `embedDocuments()` / `embedQuery()`.
- Add build-time hooks in the Phase 17 projection pipeline to populate the Neo4j vector index on `Evidence`/`Chunk` nodes before snapshot promotion, so the vector index inherits atomic activation (D-08).
- Add a Zod-validated query plan schema and a static Cypher template catalog keyed by `(relationType, direction)` tuples; reject plans that reference non-ontology types or exceed caps (D-13/D-15/D-16).
- Keep DLP boundary intact: query text and chunk text leaving the server to a remote embedding endpoint occur only when D-10 opt-in flag is set; log banner at startup; tag `embeddingProvider` in every response.

</code_context>

<specifics>
## Specific Ideas

- Required Vietnamese↔English retrieval example: query `"AML_RISK đổi tên ảnh hưởng gì"` must surface the English `AML_RISK` DatabaseObject and its `SoftwareComponent` dependents via `READS_FROM`/`WRITES_TO` incoming traversal, not require the user to rephrase in English.
- Required 1–3 hop impact example: seed `urn:plannermate:oracle:MAIN1:AML_RISK` must reach `ScheduledProcess:60000006` across 3 hops `DatabaseObject ← READS_FROM ← SoftwareComponent ← INVOKES ← ProcessStep ← CONTAINS_STEP ← ScheduledProcess`.
- Required pure-identifier fast path example: query `"MAIN1.FCL_CYCLE_COUNTER"` goes through the deterministic fast path (D-03) without invoking the planner.
- Required ambiguity example: query `"cái này đổi có ảnh hưởng gì"` without resolved context returns `NEEDS_CLARIFICATION` with candidate URNs rather than guessing.
- Required conflict-surfacing example: if two chunks state different `PRECEDES` targets for the same `ProcessStep` seed, both appear in `items[]` with a shared `conflictGroupId`.
- Required snapshot-pin example: a rebuild promoted during a running query must not cause citation mismatch — all returned items reference the pinned `snapshotId` or are marked `status='stale'`.
- Required degraded-mode example: with `EMBEDDING_REMOTE_ENABLED=false` and no local model, retrieval returns `outcome=DEGRADED`, `semanticStatus='unavailable'`, `reason='UNCONFIGURED'`, and still fuses full-text + graph.

</specifics>

<deferred>
## Deferred Ideas

- Assistant answer synthesis, citation rendering, conflict presentation UI, abstention UI — Phase 19.
- Interactive graph canvas or manual graph editor — deferred beyond v1.2.
- Full SmartVista/card-system corpus beyond process `60000006` — deferred beyond pilot validation.
- Learned-to-rank / weighted fusion variants (training data, labeling pipeline, model lifecycle) — out of scope; RRF k=60 is the frozen default.
- Server-side query result caching across requests — not addressed in Phase 18; snapshot-pinning is per-request.
- Full benchmark harness, graph integrity hardening, credential isolation verification — Phase 20.

</deferred>

---

*Phase: 18-Multi-Modal Hybrid Retrieval Engine*
*Context gathered: 2026-10-10*
