# Phase 23: Knowledge Graph Build Reliability & Entity Fidelity - Context

**Gathered:** 2026-10-20
**Status:** Ready for planning
**Source:** PRD Express Path (.planning/phases/23-knowledge-graph-build-reliability-entity-fidelity/REQUIREMENTS.md)

<domain>
## Phase Boundary

Eliminate OOM crashes during vector embedding and Neo4j writing on rebuild, implement durable disk caching for chunk LLM extraction to prevent redundant LLM invocations and token waste, and fix Vietnamese entity name mutilation across URN generation, Cypher queries, and UI display.

Deliverables:
- Bounded stream batching for vector embedding and Neo4j writing in `knowledge-server` with event-loop ticks for GC/healthcheck.
- Persistent disk-backed chunk extraction cache keyed by `chunkContentHash`, model, and prompt version with incremental load.
- Unicode NFD-to-ASCII Vietnamese slugification for URN generation.
- Node `canonicalName` preservation in `GET_FACTS_BY_SNAPSHOT` Cypher queries and `FactSummaryDTO`.
- LLM entity naming constraints in `SYSTEM_PROMPT` preventing descriptive prose bloat.
</domain>

<decisions>
## Implementation Decisions

### Stream Batching & Anti-OOM (BUILD-OOM-01)
- Batch size: Fixed small batches (25–50 chunks per batch) during vector embedding and Neo4j writing.
- Loop pattern: Calculate embeddings for batch -> write `:Chunk` batch transaction to Neo4j immediately -> drop vector array references -> yield event loop via `setImmediate` or `setTimeout(..., 0)` so V8 GC runs and Fastify responds to K8s liveness/readiness probes.
- Memory target: Peak RSS memory stays under 1.5Gi even on document sets with >200 chunks.

### Persistent Chunk Extraction Cache (BUILD-CACHE-01)
- Cache storage: Disk-based persistent cache directory (configurable, default `./data/cache/extraction/${setId}/${chunkContentHash}.json`).
- Cache key: `chunkContentHash` + `model` + `promptVersion`.
- Incremental rebuild flow:
  1. Scan all chunks in snapshot.
  2. If cache file exists and valid, load extraction results from disk (0ms, 0 tokens).
  3. Send only un-cached chunks to LLM.
  4. Write JSON cache file immediately upon receiving successful LLM response for each chunk.
- Pod restart durability: Cache persists across pod restarts and rebuild retries.

### Vietnamese URN & Canonical Name Fidelity (ENTITY-FIDELITY-01)
- URN Slugification (`src/graph/identity.ts`): Normalize Vietnamese text using Unicode NFD to strip diacritics to clean ASCII before sanitization, preventing strings of consecutive underscores (`_`).
- Fact Query (`src/graph/neo4jRepository.ts`): Update `GET_FACTS_BY_SNAPSHOT` Cypher query to MATCH or OPTIONAL MATCH endpoint nodes and return `subjectCanonicalName`, `objectCanonicalName`, `subjectKind`, and `objectKind`.
- Fact DTO (`src/services/graphBuildService.ts`): Assign `FactSummaryDTO.subjectName` and `objectName` directly from `subjectCanonicalName` and `objectCanonicalName` returned by Neo4j, completely removing `split(':')[4]` string slicing.
- Prompt Guidance (`src/ai/llmExtraction.ts`): Add entity naming constraints to `SYSTEM_PROMPT` requiring concise, noun-centric entity/step names, forbidding verbatim full-sentence descriptions.

### Claude's Discretion
- File system helpers for cache creation and directory ensures (`fs/promises`).
- Exact batch size parameter defaults (e.g. 25 or 50) and environment variable overrides.
- Unit and integration tests demonstrating memory boundedness, cache hits, and Vietnamese slugification.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Implementation Files
- `knowledge-server/src/graph/neo4jRepository.ts` — Neo4j chunk and fact queries, transaction boundaries.
- `knowledge-server/src/embedding/embeddingProviders.ts` — Transformer vector calculation pipeline.
- `knowledge-server/src/ai/llmExtraction.ts` — LLM extraction pipeline, prompt templates, and ChunkExtractionStore.
- `knowledge-server/src/services/graphBuildService.ts` — Graph rebuild orchestrator and FactSummaryDTO mapping.
- `knowledge-server/src/graph/identity.ts` — URN generation and `encodeUrnSegment`.
</canonical_refs>

<specifics>
## Specific Ideas

- Vietnamese diacritics removal standard pattern: `str.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')`.
- FactSummaryDTO must reflect exact Vietnamese names like `"Xử lý merchant bị Front-End từ chối (Bước 20)"` without ASCII mutilation.
</specifics>

<deferred>
## Deferred Ideas

- Distributed Redis / S3 cache for multi-replica cluster (local PVC / disk is sufficient for current deployment).
- Automatic cache eviction / TTL policies (can be added in future maintenance phases).
</deferred>

---

*Phase: 23-knowledge-graph-build-reliability-entity-fidelity*
*Context gathered: 2026-10-20 via PRD Express Path*
