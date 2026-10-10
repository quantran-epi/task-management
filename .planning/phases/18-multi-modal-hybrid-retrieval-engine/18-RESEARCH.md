# Phase 18: Multi-Modal Hybrid Retrieval Engine — Research

**Researched:** 2026-10-10  
**Domain:** Hybrid Retrieval (Lucene BM25 Full-Text, Neo4j Vector Indexing, Bounded Cypher Graph Traversal, Reciprocal Rank Fusion, LLM Query Planning)  
**Confidence:** HIGH  

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Every query runs full-text, semantic vector, and bounded Cypher graph retrieval in parallel. Query planning shapes execution per modality (seeds, filters, depth) but never disables a modality. No sequential fallback that silently drops a modality.
- **D-02:** Natural-language queries route through an LLM query planner that emits a strict typed logical query plan referencing the Phase 17 closed ontology (7 node kinds, 10 relation types). The planner never emits raw Cypher and never invents entities not present as resolved URNs. A manually maintained intent-prototype catalog is not the primary architecture.
- **D-03:** A deterministic fast path exists only when the entire query is a pure identifier or qualified-name lookup (e.g. `AML_RISK`, `MAIN1.FCL_CYCLE_COUNTER`). Any natural-language relation, pronoun, synonym, or multi-clause composition routes through the planner.
- **D-04:** Ambiguous entity references (unresolvable pronouns, name collisions, missing context) return outcome `NEEDS_CLARIFICATION` with safe candidate URNs. The server never best-guesses an entity. Aligns with Phase 17 collision-safe identity rules.
- **D-05:** The planner receives bounded recent conversation turns plus server-resolved typed entity URNs (not full history, not LLM-invented names). Resolution happens server-side against the active graph snapshot before the planner is invoked.
- **D-06:** Scope is corpus- and process-general. Build an ontology registry, strict logical plans, parameterized static Cypher templates, and a degraded hybrid-retrieval fallback that activates on planner failure. Pilot process `60000006` is the acceptance corpus only.
- **D-07:** Support both self-hosted local embedding model (ONNX/Transformers via `@xenova/transformers`, CPU-capable, ~120MB–2GB artifact) and remote OpenAI-compatible `/v1/embeddings` endpoint. Server auto-selects by config. A normal local PC CPU is sufficient for single-user daily workload; dedicated server or GPU is only required for very large corpora or multi-user throughput.
- **D-08:** Embeddings are stored in a Neo4j native vector index on `Evidence`/`Chunk` nodes, co-located with the graph snapshot. One store serves both vector and graph modalities, sharing Phase 17's atomic snapshot activation; no cross-DB synchronization. Index is rebuildable from Markdown.
- **D-09:** Each index generation records `provider`, `model`, `dimensions`, and `embeddingPolicyVersion`. Any change to these fields marks the index stale, triggers a full rebuild of all chunk vectors, validates dimensions, then atomically activates the new index. Query-time verifies the live model matches the index; on mismatch the semantic modality returns `unavailable` rather than wrong results.
- **D-10:** Remote embedding is **off by default**. Enabling requires an explicit config flag (e.g. `EMBEDDING_REMOTE_ENABLED=true` plus endpoint URL). Startup logs a visible banner naming the provider, model, and endpoint host. Every retrieval response tags `embeddingProvider` metadata so clients can display status. Embedding API keys stay in server environment or secret store only — never in PlannerMate client bundle, IndexedDB, published snapshot, logs, or retrieval response body.
- **D-11:** When the embedding provider fails or is unavailable, retrieval returns a partial result containing full-text and graph modality items. Response includes `modalitiesUsed` (list) and `semanticStatus='unavailable'` with reason code (`TIMEOUT`, `UNCONFIGURED`, `PROVIDER_ERROR`). RRF runs on remaining modalities. The query is not blocked.
- **D-12:** Graph modality seeds come **only** from planner-resolved typed entity URNs (identifier parsing, context entities, or prior-turn resolution). Graph runs only when at least one seed exists; absence returns fallback reason `NO_GRAPH_SEED`. Seeds are never derived from full-text or vector top-K candidates to prevent silent precision loss.
- **D-13:** Hop depth is planner-provided per logical plan with values 1–3. Server validates and clamps: depth > 3 is clamped to 3 and a warning is logged. The ontology registry may override per-relation (e.g. `PRECEDES` max 2, `READS_FROM` reverse max 3). Rationale: ROADMAP success criteria #4 requires 1–3 hops; ontology relation chains for impact analysis need 3 hops; Cypher cost grows roughly as `O(avg_degree^hops)` so 3 is the sweet spot before noise and blow-up.
- **D-14:** By default, traversal crosses only `OBSERVED` and `BUSINESS_APPROVED` edges. `INFERRED` edges are skipped unless the query sets `include_inferred=true`. Every response edge is tagged with `evidenceClass` so clients can render badges. Honors Phase 17 D-22 evidence-gated traversal.
- **D-15:** Cypher uses DISTINCT-path semantics (each node visited once per path) and enforces hard caps `maxNodes=100`, `maxEdges=200` via `LIMIT` inside the template. Exceeding either cap truncates results and sets `graphStatus='truncated'` with `reason='RESULT_LIMIT_REACHED'` in the response. Protects the server from runaway queries on cyclic or dense subgraphs.
- **D-16:** The planner specifies relation types and direction explicitly. The logical plan lists `relationTypes` (subset of the 10 ontology types), `direction` per type (`OUTGOING`/`INCOMING`/`BOTH`), and `maxHops` per type. Server validates each type against the ontology registry, caps traversal entries at 5, and enforces `overallMaxDepth <= 3`. The plan maps to a parameterized Cypher template — no string interpolation. The planner receives the ontology registry (names, endpoint kinds, example queries) in context so it can choose precisely.
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

### Deferred Ideas (OUT OF SCOPE)
- Assistant answer synthesis, citation rendering, conflict presentation UI, abstention UI — Phase 19.
- Interactive graph canvas or manual graph editor — deferred beyond v1.2.
- Full SmartVista/card-system corpus beyond process `60000006` — deferred beyond pilot validation.
- Learned-to-rank / weighted fusion variants (training data, labeling pipeline, model lifecycle) — out of scope; RRF k=60 is the frozen default.
- Server-side query result caching across requests — not addressed in Phase 18; snapshot-pinning is per-request.
- Full benchmark harness, graph integrity hardening, credential isolation verification — Phase 20.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **RETR-01** | Exact technical identifier full-text lookup | Section 2.2: Neo4j full-text Lucene index with `standard-folding` analyzer, matching process IDs, table names, cycle codes. |
| **RETR-02** | Vietnamese ↔ English semantic retrieval | Section 2.3 & 2.4: Multilingual E5 small / OpenAI embeddings enabling cross-lingual query mapping. |
| **RETR-03** | Bounded graph process flow traversal | Section 2.5: Static parameterized Cypher queries following `CONTAINS_STEP`, `PRECEDES`, `INVOKES`, `CALLS`. |
| **RETR-04** | 1–3 hop dependency & impact analysis | Section 2.5: Reverse traversal templates bounded at depth 3 reaching `ScheduledProcess` from `DatabaseObject`. |
| **RETR-05** | Ranked, deduplicated hybrid evidence fusion | Section 2.7: Reciprocal Rank Fusion ($k=60$) over composite `(type, id)` key with citations and conflict tags. |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Query Planning & Entity Resolution | Knowledge Daemon (`knowledge-server`) | — | Resolves server-side graph URNs, classifies fast-path vs LLM plan, enforces closed ontology. |
| Full-Text Search (BM25) | Knowledge Daemon (Neo4j Lucene) | Client (`src/utils/bm25.ts` fallback) | Daemon runs server-side Lucene with accent folding; client preserves independent offline search. |
| Vector Index & Similarity Search | Knowledge Daemon (Neo4j Vector Index) | — | Embeddings stored on `:ChunkSnapshot_<hex>` nodes, co-located with graph projection. |
| Graph Traversal (Cypher) | Knowledge Daemon (Neo4j) | — | Parameterized static Cypher execution bounded to 3 hops and 100 nodes/200 edges. |
| Fusion, Dedup & Conflict Surfacing | Knowledge Daemon (`retrievalService`) | — | RRF ($k=60$) rank aggregation, `(type, id)` deduplication, and response-local conflict tagging. |
| Response Consumption & UI Rendering | Client (Browser / PWA) | — | Renders flat items, handles `NEEDS_CLARIFICATION`, displays evidence badges (Phase 19). |

---

## 1. Scope

Phase 18 builds a multi-modal hybrid retrieval engine inside the optional `knowledge-server` daemon. It accepts queries via `POST /api/v1/sets/:setId/retrieve`, evaluates them against the active snapshot of process `60000006`, executes full-text, vector, and Cypher graph queries in parallel, fuses results with Reciprocal Rank Fusion ($k=60$), detects conflicts, and returns a uniform JSON envelope.

The client application (PlannerMate PWA) remains offline-first and functional without the server. All embedding models, vector libraries, and Neo4j drivers reside solely within `knowledge-server/package.json`.

---

## 2. Technical Approach

### 2.1 Overview Architecture Flow
```
Client Request (POST /api/v1/sets/:setId/retrieve)
           │
           ▼
[1] Request-Start Snapshot Pinning (pin active snapshotId)
           │
     ┌─────┴────────────────────────────────────────────────┐
     ▼                                                      ▼
[2a] Fast-Path Classifier                           [2b] Server-Side Entity Resolution
     (Pure ID / Qualified Name)                          (Map query/context to seed URNs)
           │                                                │
           │                                                ▼
           │                                        [2c] LLM Query Planner (Strict Zod)
           │                                             (1 repair retry -> Degraded Fallback)
           └──────────────────────┬─────────────────────────┘
                                  ▼
[3] Parallel Execution Fan-Out (Promise.allSettled + AbortController)
     ├─ Full-Text Modality (Neo4j Lucene `standard-folding`, timeout 500ms)
     ├─ Vector Modality    (Local ONNX E5 / Remote OpenAI, timeout 1500ms)
     └─ Graph Modality     (Static Parameterized Cypher, 1–3 hops, timeout 2000ms)
                                  │
                                  ▼
[4] Reciprocal Rank Fusion & Deduplication
     ├─ Formula: RRF(d) = Σ 1 / (60 + rank_i)
     ├─ Composite Key Dedup: (type, id) -> [chunk, entity, edge]
     └─ Modalities Contributed & Stable Tie-Breaking
                                  │
                                  ▼
[5] Conflict Surfacing & Citation Assembly
     ├─ Detect Divergent Functional Targets & Contradictory Assertions
     ├─ Tag shared conflictGroupId, retain both sides
     └─ Reference-based citation linking (supportingChunkIds)
                                  │
                                  ▼
[6] Uniform Envelope Assembly (outcome: READY | NEEDS_CLARIFICATION | NO_EVIDENCE | ...)
```

### 2.2 Full-Text Indexing (Neo4j Lucene)
- Co-located with candidate chunks on `:ChunkSnapshot_<hex>`.
- **Analyzer:** `standard-folding` (removes accents via `ASCIIFoldingFilter`, standard lowercasing, English tokenization). Supports unaccented and accented Vietnamese queries (`đổi tên`, `doi ten`) without server plugins.
- **Ranking:** Lucene relevance score (BM25 under Neo4j 5.26).
- **Client Boundary:** Client-side `src/utils/bm25.ts` remains independent and untouched for offline PWA operation.

### 2.3 Semantic Vector Indexing (Neo4j Native Vector)
- **Engine:** Neo4j 5.26+ Native Vector Index (`db.index.vector.queryNodes`).
- **Dimensions:** 384 for default local E5; up to 1536 for remote OpenAI. Cosine similarity.
- **Snapshot Binding:** Index name `chunk_vector_<hex>` binds to generation label `:ChunkSnapshot_<hex>`.
- Rebuilt atomically during document-set publish; verified online via `db.awaitIndex()`.

### 2.4 Embedding Pipeline (Local & Remote Adapters)
- **Local Adapter:** `@xenova/transformers@2.17.2` running quantized `Xenova/multilingual-e5-small` (revision `761b726d...`, 384 dims, ~140 MB artifact). Prefix `query: ` / `passage: `.
- **Remote Adapter:** Native Node `fetch` to OpenAI-compatible `/v1/embeddings`. Strict DLP gate: `EMBEDDING_REMOTE_ENABLED=false` by default; startup banner logged.
- **Mismatch Protection:** Snapshot records `{provider, model, revision, dimensions, embeddingPolicyVersion}`. Mismatch returns `status: 'unavailable'` rather than false rankings.

### 2.5 Query Planning & Fast-Path Classifier
- **Fast-Path:** Regex-based identifier classifier (`MAIN1.FCL_CYCLE_COUNTER`, `AML_RISK`, `60000006`). Emits 1-hop impact plan directly, bypassing LLM.
- **LLM Planner:** Provider-neutral JSON schema output conforming to `LogicalQueryPlanSchema`. Accepts resolved seed URNs and closed ontology registry. Zero raw Cypher.
- **Repair & Degraded Fallback:** Exactly 1 schema repair round on failure. If repair fails, fallback to deterministic degraded plan (1-hop traversal across resolved seeds).

### 2.6 Bounded Graph Traversal (Static Cypher Templates)
- **Ontology Registry:** 7 node kinds, 10 relation types (`CONTAINS_STEP`, `PRECEDES`, `CALLS`, `INVOKES`, `READS_FROM`, `WRITES_TO`, `EMITS`, `CONSUMES`, `USES_TYPE`, `HAS_STATUS`).
- **Templates:** Pre-compiled static queries with zero string interpolation.
- **Hard Bounds:** Depth clamped to 1–3 hops. Hard limits inside query: `maxNodes=100`, `maxEdges=200`, `pathLimit=100`. Exceeding sets `graphStatus='truncated'`.
- **Evidence Gating:** Default traversal crosses only `OBSERVED` and `BUSINESS_APPROVED` edges; `INFERRED` requires `includeInferred=true`.

### 2.7 Reciprocal Rank Fusion & Deduplication
- **Score:** $RRF(d) = \sum \frac{1}{60 + \text{rank}_m(d)}$.
- **Key:** Composite `(type, id)` separates `chunk`, `entity`, and `edge` records.
- **Cutoff:** Top 20 items default (overridable 10–50).
- **Tie-Breaking:** Modalities count $\to$ modality priority (`vector` > `fulltext` > `graph`) $\to$ lexicographical ID comparison.

### 2.8 Conflict Surfacing & Response Envelope
- **Heuristics:** Detects divergent targets on functional edges or contradictory assertions on shared facts. Retains both sides tagged with a stable `conflictGroupId`.
- **Envelope:** Uniform schema `{ outcome, snapshotId, embeddingProvider, items[], totalCandidates, modalityStatus, planTrace }`.
- **Outcomes:** `READY`, `NEEDS_CLARIFICATION`, `NO_EVIDENCE`, `UNSUPPORTED`, `DEGRADED`. HTTP status remains 200 for semantic routing.

---

## 3. Key Decisions & Tradeoffs (Discretion Areas)

| Discretion Area | Selected Recommendation | Rationale & Tradeoffs |
|---|---|---|
| **Query Plan Shape** | Strict Zod `LogicalQueryPlanSchema` with typed `traversalSteps` and resolved `seedUrns`. | Enforces closed ontology and prevents Cypher injection while providing precise intent signaling. |
| **Local Model Artifact** | `Xenova/multilingual-e5-small` int8 (384 dims, 140MB). | Minimal memory/cold-start footprint on CPU; validated Vietnamese (`vi`) and English cross-lingual support. |
| **Cypher Template Catalog** | Discrete static templates in `CYPHER_QUERIES` (outgoing, incoming reverse, step-by-step). | Avoids APOC plugin dependencies; strictly prevents string interpolation and guarantees Cypher safety. |
| **Conflict Grouping** | Deterministic hash `sha256("CONFLICT:" + subjectUrn + ":" + relationType)`. | Stable across queries within a snapshot; ensures both contradictory assertions are co-located in client view. |
| **Response DTO Structure** | Single flat `items[]` array with discriminated union (`chunk`, `entity`, `edge`). | Avoids arbitrary server-side grouping; allows client UI maximum presentation flexibility (Phase 19). |

---

## 4. Dependencies & Prerequisites

### Package Additions (`knowledge-server/package.json`)
```bash
cd knowledge-server
npm install --save-exact @xenova/transformers@2.17.2
```

### Direct vs Transitive Stack
- Direct: `@xenova/transformers@2.17.2` (Local ONNX feature extraction).
- Native Node 24 APIs: `fetch`, `AbortController`, `AbortSignal.timeout`, `crypto.randomUUID()`.
- Existing libraries reused: `neo4j-driver@6.2.0`, `fastify@^5.12.5`, `zod@^4.6.5`.

---

## 5. Risks & Mitigations

1. **Path Explosion in Cyclic Graph:** Bounded by Cypher DISTINCT-path traversal, depth clamp (max 3), and hard caps (`maxNodes=100`, `maxEdges=200`).
2. **LLM Entity Hallucination:** Server resolves URNs prior to LLM call; plan schema rejects unresolved names.
3. **Modality Hang / Latency Spike:** Per-modality timeouts (500ms, 1500ms, 2000ms) with `Promise.allSettled`.
4. **ONNX Cold-Start Delay:** Pre-warm model at service startup; fallback to degraded mode during initial warm-up.
5. **Snapshot Promotion Mid-Query:** Snapshot pinning at request arrival; 10-minute grace period before cleaning superseded generations.
6. **DLP Boundary Breach:** Remote endpoints default to disabled; visible console banner logged; authorization tokens isolated to server env.

---

## 6. Plan Decomposition Guidance

Phase 18 decomposes into 7 implementation waves minimizing shared-file conflicts:

- **Wave 1: Core Protocol & RRF Engine**
  - Files: `knowledge-server/src/types/retrievalProtocol.ts`, `knowledge-server/src/retrieval/rrf.ts`
  - Tests: Unit tests for RRF scoring, tie-breaking, and composite dedup.
- **Wave 2: Full-Text & Vector Indexes in Neo4j**
  - Files: `knowledge-server/src/graph/neo4jRepository.ts`, `knowledge-server/src/retrieval/vectorStore.ts`
  - Scope: Index creation DDL (`standard-folding` analyzer, 384-dim vector index), procedure queries.
- **Wave 3: Embedding Adapters**
  - Files: `knowledge-server/src/embedding/localOnnxAdapter.ts`, `knowledge-server/src/embedding/remoteOpenAiAdapter.ts`, `knowledge-server/src/embedding/embeddingService.ts`
  - Scope: Feature extraction, prefixing, truncation policy, DLP banner.
- **Wave 4: Fast-Path Classifier & LLM Query Planner**
  - Files: `knowledge-server/src/retrieval/identifierClassifier.ts`, `knowledge-server/src/retrieval/entityResolver.ts`, `knowledge-server/src/retrieval/queryPlanner.ts`
  - Scope: Regex classifier, candidate resolution, JSON schema repair, degraded fallback.
- **Wave 5: Bounded Graph Traversal & Conflict Engine**
  - Files: `knowledge-server/src/retrieval/graphTraversal.ts`, `knowledge-server/src/retrieval/conflictDetector.ts`
  - Scope: Static template execution, depth clamping, conflict grouping.
- **Wave 6: Retrieval Orchestrator & Fastify Route**
  - Files: `knowledge-server/src/services/retrievalService.ts`, `knowledge-server/src/routes/retrieval.ts`
  - Scope: Parallel fan-out, snapshot pinning, timeout handling, HTTP 200 semantic routing.
- **Wave 7: Integration & Acceptance Test Suite**
  - Files: `knowledge-server/tests/retrievalAcceptance.test.ts`
  - Scope: Full acceptance suite against pilot process `60000006` corpus.

---

## 7. Validation Architecture

### Automated Verification Commands
- Quick test suite: `npm test` inside `knowledge-server/` (`vitest run`).
- Full retrieval acceptance: `npx vitest run tests/retrievalAcceptance.test.ts`.

### Roadmap Success Criteria → Automated Test Map

| Criteria / Requirement | Behavior | Test Type | Automated Test Assertion |
|---|---|---|---|
| **Success Criteria 1 (RETR-01)** | Exact identifier lookup (process IDs, table names, cycle codes) | Integration | `expect(response.items).toEqual(expect.arrayContaining([expect.objectContaining({ rawSnippet: expect.stringContaining('MAIN1.FCL_CYCLE_COUNTER') })]))` |
| **Success Criteria 2 (RETR-02)** | Vietnamese ↔ English semantic search (`AML_RISK đổi tên ảnh hưởng gì`) | Acceptance | `expect(response.items.some(i => i.id.includes('AML_RISK'))).toBe(true)` |
| **Success Criteria 3 (RETR-03)** | Process flow & call chain graph traversal | Integration | `expect(response.items.filter(i => i.type === 'edge')).toHaveLength(greaterThan(0))` |
| **Success Criteria 4 (RETR-04)** | 1–3 hop impact & dependency query | Acceptance | Validates path from `AML_RISK` $\to$ `SoftwareComponent` $\to$ `ProcessStep` $\to$ `ScheduledProcess:60000006`. |
| **Success Criteria 5 (RETR-05)** | Single ranked, deduplicated RRF evidence set | Integration | `expect(response.items).toBeSortedBy('score', { descending: true })` with unique `(type, id)` keys. |

---

## 8. Open Questions

1. **Local Node 24 `@xenova/transformers` installation on Windows:**
   - *Status:* NPM registry verifies compatibility, but corporate TLS blocked transitive `sharp` download during exploratory probe.
   - *Recommendation:* Wave 3 must verify direct installation under Node 24 and fall back gracefully to remote embeddings if local native binaries fail to build.
2. **Vietnamese diacritic edge cases with `standard-folding`:**
   - *Status:* Neo4j source confirms ASCII folding, but non-alphanumeric tokenization varies.
   - *Recommendation:* Covered by Acceptance Test TC-02. If tokenization drops symbols, add a normalized search shadow property.

---

## 9. Sources

### Authoritative Documentation & Registries
- Neo4j 5.26 Vector Index Documentation: `https://neo4j.com/docs/cypher-manual/current/indexes/semantic-indexes/vector-indexes/`
- Neo4j 5.26 Full-Text Index Documentation: `https://neo4j.com/docs/cypher-manual/current/indexes/semantic-indexes/full-text-indexes/`
- Neo4j Official Source (StandardFoldingAnalyzer): `https://github.com/neo4j/neo4j/blob/5.26.0/community/fulltext-index/src/main/java/org/neo4j/kernel/api/impl/fulltext/analyzer/StandardFoldingAnalyzer.java`
- Hugging Face Model Card (`intfloat/multilingual-e5-small`): `https://huggingface.co/intfloat/multilingual-e5-small`
- OpenAI Embeddings Reference: `https://developers.openai.com/api/reference/resources/embeddings/methods/create`
- Reciprocal Rank Fusion Standard: Cormack, Clarke, & Büttcher (SIGIR 2009).

## RESEARCH COMPLETE
