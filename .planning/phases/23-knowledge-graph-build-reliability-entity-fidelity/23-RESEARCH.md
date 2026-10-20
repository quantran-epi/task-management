# Phase 23: Knowledge Graph Build Reliability & Entity Fidelity - Research

**Researched:** 2026-10-20  
**Domain:** Node.js memory management (V8 GC, stream batching), SQLite/Disk caching, Neo4j Cypher querying, Vietnamese Unicode NFD normalization, LLM prompt engineering  
**Confidence:** HIGH  

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Stream Batching & Anti-OOM (BUILD-OOM-01)
- Batch size: Fixed small batches (25–50 chunks per batch) during vector embedding and Neo4j writing.
- Loop pattern: Calculate embeddings for batch -> write `:Chunk` batch transaction to Neo4j immediately -> drop vector array references -> yield event loop via `setImmediate` or `setTimeout(..., 0)` so V8 GC runs and Fastify responds to K8s liveness/readiness probes.
- Memory target: Peak RSS memory stays under 1.5Gi even on document sets with >200 chunks.

#### Persistent Chunk Extraction Cache (BUILD-CACHE-01)
- Cache storage: Disk-based persistent cache directory (configurable, default `./data/cache/extraction/${setId}/${chunkContentHash}.json`).
- Cache key: `chunkContentHash` + `model` + `promptVersion`.
- Incremental rebuild flow:
  1. Scan all chunks in snapshot.
  2. If cache file exists and valid, load extraction results from disk (0ms, 0 tokens).
  3. Send only un-cached chunks to LLM.
  4. Write JSON cache file immediately upon receiving successful LLM response for each chunk.
- Pod restart durability: Cache persists across pod restarts and rebuild retries.

#### Vietnamese URN & Canonical Name Fidelity (ENTITY-FIDELITY-01)
- URN Slugification (`src/graph/identity.ts`): Normalize Vietnamese text using Unicode NFD to strip diacritics to clean ASCII before sanitization, preventing strings of consecutive underscores (`_`).
- Fact Query (`src/graph/neo4jRepository.ts`): Update `GET_FACTS_BY_SNAPSHOT` Cypher query to MATCH or OPTIONAL MATCH endpoint nodes and return `subjectCanonicalName`, `objectCanonicalName`, `subjectKind`, and `objectKind`.
- Fact DTO (`src/services/graphBuildService.ts`): Assign `FactSummaryDTO.subjectName` and `objectName` directly from `subjectCanonicalName` and `objectCanonicalName` returned by Neo4j, completely removing `split(':')[4]` string slicing.
- Prompt Guidance (`src/ai/llmExtraction.ts`): Add entity naming constraints to `SYSTEM_PROMPT` requiring concise, noun-centric entity/step names, forbidding verbatim full-sentence descriptions.

### Claude's Discretion
- File system helpers for cache creation and directory ensures (`fs/promises`).
- Exact batch size parameter defaults (e.g. 25 or 50) and environment variable overrides.
- Unit and integration tests demonstrating memory boundedness, cache hits, and Vietnamese slugification.

### Deferred Ideas (OUT OF SCOPE)
- Distributed Redis / S3 cache for multi-replica cluster (local PVC / disk is sufficient for current deployment).
- Automatic cache eviction / TTL policies (can be added in future maintenance phases).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BUILD-OOM-01 | Eliminate OOM crashes during vector embedding and Neo4j writing on rebuild via bounded stream batching. | Implements batch-by-batch embedding generation and incremental chunk writing in `Neo4jRepository.buildRetrievalGeneration` with event loop pauses. |
| BUILD-CACHE-01 | Implement durable disk-backed chunk extraction cache keyed by `chunkContentHash`, model, and prompt version to prevent redundant LLM invocations. | Refactors `ChunkExtractionStore` in `llmExtraction.ts` to persist per-chunk JSON cache on disk under `./data/cache/extraction/${setId}/`. |
| ENTITY-FIDELITY-01 | Prevent Vietnamese entity name mutilation across URN generation, Cypher queries, FactSummaryDTO, and UI display. | Adds Unicode NFD slugification in `identity.ts`, updates `GET_FACTS_BY_SNAPSHOT` Cypher query to retrieve canonical names from nodes, and updates `FactSummaryDTO` mapping in `graphBuildService.ts`. |
</phase_requirements>

## Summary

Phase 23 stabilizes knowledge graph construction and preserves domain naming fidelity in `knowledge-server`.

Currently, during graph rebuild (`/api/v1/sets/:setId/graph/rebuild`), when reaching 95% ("Retrieval generation"), `Neo4jRepository.buildRetrievalGeneration` flattens all chunks across the snapshot into memory, embeds all documents into huge multi-dimensional float arrays, and accumulates them simultaneously before running a single massive Cypher write transaction. On large document corpora (>200 chunks), this spikes process RSS memory beyond container limits, triggering Kubernetes `Exit Code 137 (OOMKilled)` and rolling back graph changes.

Secondly, `ChunkExtractionStore` operates strictly in memory (`Map<string, ChunkCachedResult>`). If the server restarts or if a document set receives incremental updates, all previous LLM extraction results are lost, forcing full re-extractions of unchanged chunks at significant token expense and execution time.

Finally, Vietnamese entity names suffer severe mutilation: `identity.ts` strips non-ASCII characters directly with regex `/replace(/[^a-zA-Z0-9_.~%-]/g, '_')/`, resulting in strings of underscores (`X__l__merchant_b__t__ch_i`). To make matters worse, `graphBuildService.getFacts()` extracts entity names by splitting the sanitized URN (`split(':')[4]`) rather than retrieving the stored `canonicalName` from Neo4j. In addition, the LLM extraction prompt lacks brevity constraints, causing whole sentences to be extracted as entity names.

**Primary recommendation:**
1. Pipeline vector embedding and Neo4j writing into bounded streaming batches (default 25–50 chunks per batch) with `setImmediate` event-loop yields in `Neo4jRepository.buildRetrievalGeneration`.
2. Convert `ChunkExtractionStore` to a durable file-based cache on disk (using `node:fs/promises`) keyed by `sha256(contentHash + model + promptVersion)`.
3. Introduce `slugifyVietnamese` using standard Unicode NFD decomposition (`normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')`) in `src/graph/identity.ts`.
4. Update `GET_FACTS_BY_SNAPSHOT` to OPTIONAL MATCH `(s:Entity {graphSnapshotId, urn: f.subjectUrn})` and `(o:Entity {graphSnapshotId, urn: f.objectUrn})`, returning their `canonicalName` and `kind` directly for `FactSummaryDTO`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Bounded Chunk Embedding & Neo4j Writing | Backend (`knowledge-server/src/graph/neo4jRepository.ts`) | Embedding Worker (`embeddingProviders.ts`) | Neo4jRepository coordinates batch embedding calls and chunk persistence transactions so memory is bounded. |
| Durable Chunk Extraction Caching | Backend (`knowledge-server/src/ai/llmExtraction.ts`) | File System / PVC (`./data/cache/extraction/`) | LLM extraction pipeline manages cache serialization, read, and write per chunk before and after remote API calls. |
| Vietnamese URN Slugification | Backend Domain (`knowledge-server/src/graph/identity.ts`) | — | Pure function transformation module responsible for deterministic, RFC-compliant URN construction. |
| Canonical Name Preservation & DTO Mapping | Backend Service (`knowledge-server/src/services/graphBuildService.ts`) | Database (`neo4jRepository.ts`) | Cypher projection joins fact endpoints to retrieve true canonical names; service passes them faithfully to API consumers. |
| Entity Naming Prompt Engineering | LLM Pipeline (`knowledge-server/src/ai/llmExtraction.ts`) | — | Enforces concise entity name constraints directly in `SYSTEM_PROMPT`. |

---

## Current Implementation Analysis

### 1. Vector Embedding & OOM in `Neo4jRepository.buildRetrievalGeneration`
In `knowledge-server/src/graph/neo4jRepository.ts` (lines 693–748):
- All documents and chunks are iterated and collected into two unbounded arrays: `chunkRows` and `textsToEmbed`.
- `embeddingProvider.embedDocuments(textsToEmbed)` is invoked with the entire array. While `LocalTransformersEmbeddingProvider` chunks internally into sub-batches of 10 for transformer inference, it still returns the full `number[][]` array containing every vector at once.
- For 300 chunks with 384 dimensions, this produces large floating point allocations in V8 heap.
- After embedding, a single write transaction executes `CYPHER_QUERIES.UNWIND_INSERT_CHUNKS` with all rows.
- No event loop yielding occurs between embedding and DB insertion, starving V8 Garbage Collection and Fastify health check responses.

### 2. Ephemeral In-Memory `ChunkExtractionStore`
In `knowledge-server/src/ai/llmExtraction.ts` (lines 64–178):
- `ChunkExtractionStore` keeps `private chunksBySet = new Map<string, Map<string, ChunkExtractionItem>>()` and `private cachedResults = new Map<string, Map<string, ChunkCachedResult>>()`.
- The cache key is purely `chunkId` (`docId:chunkIndex`), with no content hash, model name, or prompt version.
- When the process restarts, both maps are empty. A rebuild or retry must re-invoke the LLM for all chunks.
- If a document is edited or added, existing unchanged chunks are not recognized unless currently in RAM.

### 3. Vietnamese Name Mutilation in `identity.ts` & `graphBuildService.ts`
- In `knowledge-server/src/graph/identity.ts`:
  ```typescript
  function encodeUrnSegment(str: string): string {
    return str.replace(/[^a-zA-Z0-9_.~%-]/g, '_');
  }
  ```
  Vietnamese characters (e.g. `ử`, `ý`, `ệ`, `đ`) are not in `[a-zA-Z0-9_.~%-]`, so they become underscores `_`. A title like `"Xử lý merchant bị Front-End từ chối (Bước 20)"` becomes `"X__l__merchant_b__Front_End_t__ch_i__B__c_20_"`.
- In `knowledge-server/src/graph/neo4jRepository.ts`:
  `GET_FACTS_BY_SNAPSHOT` matches only `(f:Fact)` and `(ev:Evidence)`. It does not match the subject and object `(e:Entity)` nodes.
- In `knowledge-server/src/services/graphBuildService.ts` (lines 572–596):
  ```typescript
  const subjectParts = rel.subjectUrn.split(':');
  const subjectName = decodeURIComponent(subjectParts[4] || rel.subjectUrn);
  ```
  Because the query does not fetch `canonicalName`, the service splits the URN string at index 4, displaying the mutilated underscore string to users.
- In `knowledge-server/src/ai/llmExtraction.ts`:
  `SYSTEM_PROMPT` warns against dummy names like `STEP_1`, but does not restrict name length or forbid extracting full explanatory sentences as entity names.

---

## Architecture & Technical Strategy

### 1. Bounded Stream Batching for Chunks & Embeddings (BUILD-OOM-01)

Instead of collecting all chunks into memory and generating all embeddings before database insertion, process chunks in bounded batches of $N = 32$ (configurable 25–50 via env `RETRIEVAL_BATCH_SIZE`).

#### Flow:
1. Divide `sourceSnapshot.documents` chunks into batches of size $B$ (default 32).
2. For each batch:
   - Extract raw texts for the batch.
   - If `embeddingProvider` is present:
     - Compute embeddings for the batch ($B$ vectors).
     - Associate each vector with its chunk row.
   - Execute an isolated write transaction to:
     - `UNWIND $rows AS row MERGE (c:Chunk ...)`
     - Set the snapshot isolation label `SET c:\`${snapshotLabel}\``
     - Link facts to same-document chunks where offsets/lines overlap.
   - Clear vector and row references for the batch.
   - Yield the Node.js event loop: `await new Promise((r) => setImmediate(r));`.
3. Once all chunk batches are written:
   - Create fulltext index on `:\`${snapshotLabel}\``.
   - Create vector index on `:\`${snapshotLabel}\``.
   - `CALL db.awaitIndex(...)`.
   - Update `GraphSnapshot` retrieval metadata.

This keeps peak heap memory consumption constant at $O(B)$ rather than $O(N_{\text{total}})$, completely neutralizing OOM crashes even for thousands of chunks.

```
+-----------------------------------------------------------+
| Source Snapshot Chunks (N Chunks)                         |
+-----------------------------------------------------------+
                             |
                   Slice Batch (size B=32)
                             v
+-----------------------------------------------------------+
| 1. Compute Vectors for Batch (32 vectors)                 |
| 2. Execute Neo4j Write Transaction (Insert + Label + Link)|
| 3. Dereference Batch & Vectors                            |
| 4. await new Promise(r => setImmediate(r)) (GC / Health)  |
+-----------------------------------------------------------+
                             |
                  Repeat until complete
                             v
+-----------------------------------------------------------+
| Create & Await Fulltext & Vector Indexes                  |
+-----------------------------------------------------------+
```

### 2. Persistent Chunk Extraction Cache (BUILD-CACHE-01)

To ensure zero-token, zero-latency re-extraction across process restarts and incremental document additions:

#### Cache Directory Structure:
```
data/cache/extraction/
  └── <setId>/
      ├── <cacheKey1>.json
      ├── <cacheKey2>.json
      └── ...
```
Where `cacheDir` is configurable via `EXTRACTION_CACHE_DIR` (default: `./data/cache/extraction`).

#### Cache Key Formulation:
Each chunk is hashed deterministically:
$$\text{chunkContentHash} = \text{sha256}(\text{chunk.text})$$
$$\text{cacheKey} = \text{sha256}(\text{chunkContentHash} + \text{":"} + \text{model} + \text{":"} + \text{promptVersion})$$
- `promptVersion`: Exported constant `PROMPT_VERSION = '2026.10.1'` in `llmExtraction.ts`. If the prompt or ontology changes, the cache safely invalidates itself.
- `model`: Configured LLM model string (e.g. `gpt-4o-mini`).

#### Cached Payload Contract (`ChunkCachePayload`):
```json
{
  "version": 1,
  "chunkContentHash": "...",
  "model": "gpt-4o-mini",
  "promptVersion": "2026.10.1",
  "cachedAt": "2026-10-20T12:00:00.000Z",
  "result": {
    "chunkId": "doc-1:0",
    "nodes": [ ... ],
    "facts": [ ... ],
    "evidence": [ ... ],
    "quarantines": [ ... ]
  }
}
```

#### Rebuild Cache Flow:
1. `splitDocumentIntoChunks` produces chunks.
2. For each chunk:
   - Compute `chunkContentHash` and `cacheKey`.
   - Check if `./data/cache/extraction/${setId}/${cacheKey}.json` exists on disk.
   - If found: parse and load into `nodesMap`, `factsMap`, `evidenceList`, `quarantinesList`. Set status to `SUCCESS` without making network calls.
3. For chunks not found on disk:
   - Invoke LLM.
   - On success: write JSON to `./data/cache/extraction/${setId}/${cacheKey}.json` immediately using atomic write (`fs.writeFile` to temp file then rename or direct `fs.writeFile`).
   - Store in `ChunkExtractionStore`.
4. If a chunk extraction fails, do not write a valid cache file.

### 3. Vietnamese URN Slugification & Canonical Name Fidelity (ENTITY-FIDELITY-01)

#### 3.1 Slugification in `src/graph/identity.ts`
Implement `slugifyVietnamese(text: string): string`:
- Unicode NFD normalization decomposes accented characters (e.g., `ế` $\rightarrow$ `e` + combining mark `̂` + `́`).
- Regex removes combining marks: `text.normalize('NFD').replace(/[̀-ͯ]/g, '')`.
- Explicitly replace `đ` $\rightarrow$ `d` and `Đ` $\rightarrow$ `D`.
- Then sanitize via safe identifier regex: convert spaces, punctuation, and non-alphanumeric chars into `_` or `-`, and collapse consecutive underscores.
- Result: `"Xử lý merchant bị từ chối"` becomes `"Xu_ly_merchant_bi_tu_choi"`. Valid RFC URN segment, completely free of `X__l__merchant_b__t__ch_i`.

#### 3.2 Cypher Fact Query in `src/graph/neo4jRepository.ts`
Update `CYPHER_QUERIES.GET_FACTS_BY_SNAPSHOT`:
```cypher
MATCH (f:Fact {graphSnapshotId: $graphSnapshotId})
OPTIONAL MATCH (s:Entity {graphSnapshotId: $graphSnapshotId, urn: f.subjectUrn})
OPTIONAL MATCH (o:Entity {graphSnapshotId: $graphSnapshotId, urn: f.objectUrn})
OPTIONAL MATCH (ev:Evidence {graphSnapshotId: $graphSnapshotId})-[:EVIDENCE_FOR]->(f)
RETURN f.factKey AS factKey,
       f.ontologyVersion AS ontologyVersion,
       f.subjectUrn AS subjectUrn,
       coalesce(s.canonicalName, f.subjectUrn) AS subjectCanonicalName,
       coalesce(s.kind, 'Entity') AS subjectKind,
       f.relation AS relation,
       f.objectUrn AS objectUrn,
       coalesce(o.canonicalName, f.objectUrn) AS objectCanonicalName,
       coalesce(o.kind, 'Entity') AS objectKind,
       f.qualifiersJson AS qualifiersJson,
       f.effectiveClassification AS effectiveClassification,
       f.hasConflict AS hasConflict,
       f.sourceMissing AS sourceMissing,
       collect(ev) AS evidenceRecords
```

#### 3.3 Fact DTO Mapping in `src/services/graphBuildService.ts`
Update `getFacts`:
```typescript
const facts: FactSummaryDTO[] = factDetails.map((fd) => {
  return {
    factKey: fd.relation.factKey,
    subjectUrn: fd.relation.subjectUrn,
    subjectName: fd.subjectCanonicalName || fd.relation.subjectUrn,
    subjectKind: fd.subjectKind || 'Entity',
    relation: fd.relation.relation,
    objectUrn: fd.relation.objectUrn,
    objectName: fd.objectCanonicalName || fd.relation.objectUrn,
    objectKind: fd.objectKind || 'Entity',
    effectiveClassification: fd.relation.effectiveClassification,
    evidenceCount: fd.evidence.length,
    hasConflict: fd.relation.hasConflict,
    qualifiers: fd.relation.qualifiers || {},
  };
});
```
Delete `split(':')[4]` completely. `FactDetail` interface updated to include `subjectCanonicalName`, `subjectKind`, `objectCanonicalName`, `objectKind`.

#### 3.4 Entity Naming Constraints in `SYSTEM_PROMPT` (`llmExtraction.ts`)
Add rule to `CRITICAL SAFETY RULES` in `SYSTEM_PROMPT`:
```text
8. ENTITY NAMING CONSTRAINTS:
   - Entity names MUST be concise, noun-centric identifiers or step labels (e.g. "Xử lý merchant bị từ chối", "Verify Card Expiry", "PRC_SETTLEMENT").
   - NEVER extract full conversational sentences, instructions, or paragraphs as entity names.
   - For ProcessStep entities, keep names under 80 characters.
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Vietnamese diacritic removal | Custom mapping table for every vowel combination | `String.prototype.normalize('NFD')` + `replace(/[̀-ͯ]/g, '')` + `replace(/[đĐ]/g, ...)` | Native JavaScript engine handles all 134+ Vietnamese accent combinations accurately without huge static lookup maps. |
| Cache File Locking | Complex custom IPC locks | Atomic file write pattern (`tempFile` + `fs.rename`) or single-threaded node event loop writes per chunk | Disk writes for individual chunk JSONs are discrete files keyed by content hash; no multi-process race condition in single knowledge daemon. |
| Stream Batching Framework | RxJS / heavy streaming libraries | Simple native `for (let i = 0; i < chunks.length; i += BATCH_SIZE)` loop with `setImmediate` | Pure standard library, zero new dependencies, predictable memory profile. |

---

## Common Pitfalls

### Pitfall 1: Cypher Cardinality Multiplier on Evidence Collection
**What goes wrong:** Adding `OPTIONAL MATCH (s:Entity)` and `OPTIONAL MATCH (o:Entity)` before `OPTIONAL MATCH (ev:Evidence)` in `GET_FACTS_BY_SNAPSHOT` can multiply rows if an entity has multiple labels or non-unique instance keys.
**Why it happens:** In Cypher, if `s` or `o` matches multiple nodes, `ev` collects duplicates.
**How to avoid:** The index constraint guarantees `(graphSnapshotId, urn)` is unique for `:Entity`. Match on `{graphSnapshotId: $graphSnapshotId, urn: f.subjectUrn}`. Furthermore, in `InMemoryGraphRepository.getFacts()`, also populate `subjectCanonicalName` and `objectCanonicalName` by looking up nodes in `candidate.nodes` by URN to keep test mocks in exact sync with Neo4j.

### Pitfall 2: Dangling Vectors in Heap
**What goes wrong:** Passing a large array of embeddings into helper scopes that retain references in closures, preventing V8 GC from reclaiming memory.
**Why it happens:** Keeping `const allVectors = []` in the outer function scope.
**How to avoid:** Limit vector lifetime strictly to the batch iteration scope:
```typescript
{
  const batchVectors = await embeddingProvider.embedDocuments(batchTexts);
  // assign to batch chunk rows
  await writeChunkBatchTx(batchRows);
  // batchVectors falls out of scope
}
await new Promise(r => setImmediate(r));
```

### Pitfall 3: Stale Cache when Prompt or Ontology Changes
**What goes wrong:** Prompt rules change (e.g. new entity naming guidelines or ontology types), but chunks load from old cache, retaining stale extractions.
**Why it happens:** Cache key only includes `chunkContentHash`.
**How to avoid:** Include `promptVersion` (`PROMPT_VERSION = '2026.10.1'`) and `model` in the cache key. When prompt rules are updated, `PROMPT_VERSION` is bumped, invalidating previous cache files cleanly without needing manual deletions.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.2 |
| Config file | `knowledge-server/vite.config.ts` / `vitest.config.ts` (using npm run test in knowledge-server) |
| Quick run command | `npm --prefix knowledge-server test -- tests/graphIdentity.test.ts` |
| Full suite command | `npm --prefix knowledge-server test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BUILD-OOM-01 | Vector embedding & chunk DB insertion execute in bounded batches without unbounded heap growth | Unit / Integration | `npm --prefix knowledge-server test -- tests/retrievalBatching.test.ts` | Wave 0 |
| BUILD-CACHE-01 | `ChunkExtractionStore` persists to disk, hits cache on 2nd run, loads 100% in <3s without LLM calls | Unit / Integration | `npm --prefix knowledge-server test -- tests/chunkCache.test.ts` | Wave 0 |
| ENTITY-FIDELITY-01 | Vietnamese URN slugification strips diacritics cleanly; `GET_FACTS_BY_SNAPSHOT` returns exact Vietnamese `canonicalName` without URN mutilation | Unit | `npm --prefix knowledge-server test -- tests/graphIdentity.test.ts` | Yes (extend with Vietnamese cases) |

### Sampling Rate
- **Per task commit:** Run the targeted test file for the modified component.
- **Per wave merge:** Run `npm --prefix knowledge-server test`.
- **Phase gate:** All knowledge-server unit tests pass green before completion.

### Wave 0 Gaps
- [ ] `knowledge-server/tests/chunkCache.test.ts` — covers BUILD-CACHE-01 (disk persistence, key generation, hit/miss flow).
- [ ] `knowledge-server/tests/retrievalBatching.test.ts` — covers BUILD-OOM-01 (batching logic, event loop yield).

---

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | Slugification of URN segments prevents Cypher/URN injection and directory traversal in cache paths (`path.join` + sanitized filename). |
| V6 Cryptography | yes | Use `crypto.createHash('sha256')` for content hashes and cache keys. |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Directory Traversal via cache key | Tampering | Cache key is strictly hex SHA-256 (`[a-f0-9]{64}.json`), path resolved under fixed root `EXTRACTION_CACHE_DIR`. |
| Cypher Injection via Vietnamese characters | Injection | Parameterized Cypher queries (`$graphSnapshotId`, `$rows`). No raw string interpolation in Cypher queries. |

---

## Sources

### Primary (HIGH confidence)
- Codebase inspection:
  - `knowledge-server/src/graph/neo4jRepository.ts`
  - `knowledge-server/src/embedding/embeddingProviders.ts`
  - `knowledge-server/src/ai/llmExtraction.ts`
  - `knowledge-server/src/services/graphBuildService.ts`
  - `knowledge-server/src/graph/identity.ts`
  - `knowledge-server/src/types/graphProtocol.ts`
- Standard ECMAScript Internationalization / Unicode normalization: `String.prototype.normalize('NFD')`.

### Secondary (MEDIUM confidence)
- Node.js V8 garbage collection & event-loop concurrency mechanics: `setImmediate` yields macrotask queue, allowing GC sweeps and I/O handlers to fire.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - stdlib `fs/promises`, `crypto`, native regex and `String.prototype.normalize`.
- Architecture: HIGH - streaming batch write and persistent file cache follow existing knowledge-server patterns.
- Pitfalls: HIGH - identified exact failure modes from previous OOM runs and URN splitting bugs.

**Research date:** 2026-10-20  
**Valid until:** 2026-11-20
