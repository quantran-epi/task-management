# Phase 18: Multi-Modal Hybrid Retrieval Engine - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-10
**Phase:** 18-Multi-Modal Hybrid Retrieval Engine
**Branch:** phase-18-build
**Areas discussed:** Query intent, Semantic runtime, Graph traversal, Fusion output

---

## Query Intent

### Modality execution

| Option | Description | Selected |
|--------|-------------|----------|
| Run all three | Every query executes full-text + vector + graph in parallel; planning shapes execution, never disables modalities | ✓ |
| Route by intent | Static classifier picks one or two modalities per intent | |
| Exact-first fallback | Try exact match first; drop to hybrid only on miss | |

**User's choice:** Run all three.
**Notes:** Rejected sequential/routing options because any single-modality route hides evidence that would have been retrieved by the modalities skipped.

### Natural-language query planning

| Option | Description | Selected |
|--------|-------------|----------|
| Static rules + embeddings primary | Hand-maintained intent-prototype catalog as foundation | |
| LLM query planner | Planner emits strict typed logical query plan referencing closed ontology | ✓ |
| LLM fallback only | LLM used only when static rules fail | |

**User's choice:** LLM query planner.
**Notes:** User explicitly rejected pilot-scope reasoning: "it's not because phase 18 pilot test scope is small, so we made the bad solution." Static-prototype-primary approach cannot handle synonyms, mixed Vietnamese/English, pronouns, multi-intent composition, or decomposition without exploding the catalog. Deterministic code still extracts hard signals (identifiers, filters, limits, schema/security validation) before planner invocation.

### Deterministic fast path

| Option | Description | Selected |
|--------|-------------|----------|
| Pure identifier only | Fast path when entire query is identifier/qualified-name lookup | ✓ |
| Identifier + simple relation | Fast path extends to simple predicates like "what calls X" | |
| No fast path | Every query goes through planner | |

**User's choice:** Pure identifier only.
**Notes:** Any natural-language relation routes through the planner to preserve synonym and multi-intent handling.

### Ambiguity behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Request clarification | Return `NEEDS_CLARIFICATION` with safe candidates | ✓ |
| Search broadly without conclusion | Hybrid retrieve across all plausible interpretations | |
| Best guess with warning | Pick most-likely entity, flag uncertainty | |

**User's choice:** Request clarification.
**Notes:** Aligns with Phase 17 collision-safe identity rule — server never best-guesses an entity.

### Planner context

| Option | Description | Selected |
|--------|-------------|----------|
| Turns + resolved entities | Bounded recent turns + server-resolved typed entity URNs | ✓ |
| Resolved entities only | Current turn only, no history | |
| Full history | All turns since session start | |
| Current query only | No context carryover | |

**User's choice:** Turns + resolved entities.
**Notes:** Resolution happens server-side before planner invocation so the planner never sees LLM-invented names.

### Architecture scope

| Option | Description | Selected |
|--------|-------------|----------|
| Pilot-specific | Optimize for process 60000006, defer generality | |
| Broader reusable architecture | Build ontology registry + strict logical plans for broader corpus | ✓ |

**User's choice:** Broader reusable architecture.
**Notes:** Process 60000006 is acceptance corpus only. User correction: "we need to build for the broader use case."

---

## Semantic Runtime

### Embedding provider location

| Option | Description | Selected |
|--------|-------------|----------|
| Support both | Self-hosted local (ONNX/Transformers) + remote OpenAI-compatible endpoint, auto-select by config | ✓ |
| Remote only | Depend on external `/v1/embeddings` endpoint | |
| Local only | Always run embeddings in-process | |

**User's choice:** Support both.
**Notes:** Normal local PC CPU is sufficient for daily single-user workload (small model: ~10–50 ms/query). Dedicated server/GPU only required for very large corpora or multi-user throughput.

### Vector index storage

| Option | Description | Selected |
|--------|-------------|----------|
| Neo4j native vector index | Vectors co-located with graph snapshot, shared atomic activation | ✓ |
| Separate vector store | ANN engine beside Neo4j, independent lifecycle | |
| In-memory brute-force | Vectors in snapshot file, loaded to RAM | |

**User's choice:** Neo4j native vector index.
**Notes:** Single-store design eliminates cross-DB sync and keeps vector+graph consistent per `snapshotId`.

### Provider/model change policy

| Option | Description | Selected |
|--------|-------------|----------|
| Full rebuild on any change | Any change to provider/model/dimensions/embeddingPolicyVersion triggers full re-embedding | ✓ |
| Rebuild only on dimension change | Keep vectors if dimensions match | |
| Multi-generation parallel | Allow multiple generations keyed by model | |

**User's choice:** Full rebuild on any change.
**Notes:** Rejected dimension-only policy because same-dimension vectors from different models still live in different vector spaces — similarity would silently drift.

### Remote provider enablement

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit opt-in + startup banner | Off by default; config flag enables; startup banner names provider/endpoint; API key server-side only | ✓ |
| Silent opt-in no banner | Flag turns on; no banner | |
| Per-query confirmation | Prompt user each query | |
| Local only, no remote | Reverse the "support both" decision | |

**User's choice:** Explicit opt-in + startup banner.
**Notes:** DLP boundary — query text and chunk text leaving the server to a third-party endpoint is a new external data boundary that requires explicit enablement. Credentials stay in server environment or secret store.

### Degraded mode when embedding unavailable

| Option | Description | Selected |
|--------|-------------|----------|
| Partial result + explicit flag | Return full-text + graph; mark `semanticStatus='unavailable'` with reason | ✓ |
| Fail entire query | 503 with reason | |
| Silent fallback full-text only | Hide semantic failure | |

**User's choice:** Partial result + explicit flag.
**Notes:** Query must not be blocked by one modality's failure.

---

## Graph Traversal

### Seed strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Planner-resolved seeds only | Typed entity URNs only; no seed → `NO_GRAPH_SEED` | ✓ |
| Top-K candidates from fulltext/vector | Derive seed from highest-ranked candidate | |
| Hybrid planner + top-K | Both sources, deduplicate traversal | |

**User's choice:** Planner-resolved seeds only.
**Notes:** Rejected top-K derivation because a high-score candidate may not be the semantic target; silent precision loss.

### Hop depth

| Option | Description | Selected |
|--------|-------------|----------|
| Planner-provided + hard cap 3 | Planner suggests 1–3; server clamps > 3; ontology per-relation override | ✓ |
| Fixed depth 3 always | Every query runs depth 3 | |
| Explicit relation path from planner | Planner emits full relation path | |

**User's choice:** Planner-provided + hard cap 3.
**Notes:** Depth 3 chosen because ROADMAP success criteria #4 requires 1–3 hops, ontology relation chains need 3 hops for impact analysis, and Cypher cost grows roughly `O(avg_degree^hops)`. Beyond 3 noise dominates.

### Evidence class filter

| Option | Description | Selected |
|--------|-------------|----------|
| OBSERVED + BUSINESS_APPROVED default, INFERRED opt-in | Default safe; `include_inferred=true` opt-in | ✓ |
| All classes with badge only | Traverse everything, tag `evidenceClass` | |
| OBSERVED strict | Only directly observed edges | |

**User's choice:** OBSERVED + BUSINESS_APPROVED default, INFERRED opt-in.
**Notes:** Honors Phase 17 D-22 evidence-gated traversal.

### Result size and cycles

| Option | Description | Selected |
|--------|-------------|----------|
| DISTINCT path + maxNodes 100/maxEdges 200 | Hard caps in Cypher template; truncate flag on overflow | ✓ |
| No cap, return all | Trust downstream | |
| Planner decides cap | Planner emits numeric caps | |

**User's choice:** DISTINCT path + maxNodes 100/maxEdges 200.
**Notes:** Protects server from runaway queries on cyclic or dense subgraphs. Phase 17 does not enforce acyclicity at write-time.

### Relation types and direction

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit types + direction, max 5 | Planner lists relationTypes + direction + per-type maxHops; server validates against ontology registry | ✓ |
| Preset category groups | Planner picks `data-flow`/`control-flow`/`metadata` category | |
| All relations both directions | Traverse everything | |

**User's choice:** Explicit types + direction, max 5.
**Notes:** All-relations option causes precision collapse through `USES_TYPE`/`HAS_STATUS` to unrelated siblings. Explicit specification keeps traversal bounded and debuggable.

---

## Fusion Output

### Fusion algorithm

| Option | Description | Selected |
|--------|-------------|----------|
| RRF k=60 | Reciprocal Rank Fusion with k=60; rank-based, no normalization | ✓ |
| Weighted linear combination | Normalize + weighted sum per modality | |
| Learned-to-rank | Trained model | |

**User's choice:** RRF k=60.
**Notes:** Enterprise standard (Azure AI Search, Elasticsearch hybrid, Vertex AI). No weight calibration needed.

### Deduplication

| Option | Description | Selected |
|--------|-------------|----------|
| By (type, id) composite key | chunkId / URN / factKey; merge RRF scores; `modalitiesContributed[]` | ✓ |
| Bundle by linked entity | Server bundles chunk+entity+edges around anchor | |
| Content hash | sha256 of normalized text | |

**User's choice:** By (type, id) composite key.
**Notes:** Keeps dedupe debuggable; content-hash option risks silent collapse of distinct-id items with identical text.

### Top-N cutoff

| Option | Description | Selected |
|--------|-------------|----------|
| Top 20 default, overridable 10-50 | Default 20; query param override; `totalCandidates` reported | ✓ |
| No cutoff | Return everything | |
| Score threshold only | Cut by RRF score threshold | |

**User's choice:** Top 20 default, overridable 10-50.
**Notes:** Score-threshold option rejected because tuning threshold produces inconsistent counts per query.

### Response structure

| Option | Description | Selected |
|--------|-------------|----------|
| Flat ranked list, type tag | Single `items[]` ranked by RRF; `type` tag per item | ✓ |
| Grouped by type | Chunks/entities/edges in separate arrays | |
| Clustered by anchor entity | Server-side bundling | |

**User's choice:** Flat ranked list, type tag.
**Notes:** Matches enterprise hybrid search response shape; client decides grouping.

### Conflict handling

| Option | Description | Selected |
|--------|-------------|----------|
| Surface both with conflictGroupId | All contradicting items present; shared `conflictGroupId`; `hasConflict=true` | ✓ |
| Suppress lower evidence class | Prefer OBSERVED > BUSINESS_APPROVED > INFERRED | |
| No detection, flat list | UI resolves | |

**User's choice:** Surface both with conflictGroupId.
**Notes:** Honors Phase 17 D-12 and the "never guess" principle.

### Citation detail

| Option | Description | Selected |
|--------|-------------|----------|
| Full citations, dedup by ref | Full citation fields per item; `supportingEvidence[]` references chunks in response by id | ✓ |
| Minimal citation, lazy fetch | Client fetches citation per item via separate endpoint | |
| Inline evidence excerpts | Embed excerpt text per item | |

**User's choice:** Full citations, dedup by ref.
**Notes:** Reuses Phase 17 `GraphEvidenceRecord`; no payload duplication.

### Outcome envelope

| Option | Description | Selected |
|--------|-------------|----------|
| Uniform envelope with outcome field | `{outcome, items[], diagnostics, modalityStatus, planTrace, snapshotId, embeddingProvider}` | ✓ |
| HTTP status by outcome | Non-200 codes for non-success outcomes | |
| Items + warnings only | Only `items[]` + warning strings | |

**User's choice:** Uniform envelope with outcome field.
**Notes:** Client branches on `outcome` field (not HTTP status). `DEGRADED` outcome is impossible to signal cleanly through HTTP alone.

### Snapshot pinning

| Option | Description | Selected |
|--------|-------------|----------|
| Pin active snapshotId at request start | Resolve once; all modalities read pinned snapshot; response echoes `snapshotId` | ✓ |
| Client-supplied snapshotId required | Client passes explicitly | |
| No pinning, read-latest per modality | Each modality reads whatever is active | |

**User's choice:** Pin active snapshotId at request start.
**Notes:** Guarantees consistency across modalities during a snapshot flip; mirrors Phase 17 atomic activation.

### Per-modality timeout

| Option | Description | Selected |
|--------|-------------|----------|
| Per-modality timeout, partial fusion | Independent configurable timeout per modality; timeout drops items and flags degraded | ✓ |
| Single request timeout | One overall timeout cancels all | |
| No timeout | Trust downstream | |

**User's choice:** Per-modality timeout, partial fusion (with each timeout independently configurable via env vars).
**Notes:** Defaults — full-text 500 ms, vector 1500 ms, graph 2000 ms. One slow modality must not block the response.

---

*Phase: 18-Multi-Modal Hybrid Retrieval Engine*
*Discussion closed: 2026-10-10*
