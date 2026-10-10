# Phase 18 Research — Part A: Indices + Embeddings

## Scope

Part A covers only Neo4j-native vector/full-text indexing, local and remote embedding adapters, direct dependency changes, and snapshot-pinned index activation. It honors Phase 18 D-07 through D-11 and existing Phase 17 candidate/active-pointer lifecycle; query planning, graph traversal, RRF, response design, and test architecture remain Part B. PlannerMate PWA stays independent: all model runtime, Neo4j access, remote credentials, and added package weight belong only to `knowledge-server`. [VERIFIED: codebase grep — `18-CONTEXT.md`, `knowledge-server/package.json`, `snapshotStore.ts`]

## Neo4j Vector Index

### Required Neo4j version

- Node vector indexes entered public beta in Neo4j 5.11 and became generally available in 5.13. `db.index.vector.queryNodes` exists in this line, but 5.13 fixed single-neighbor and same-transaction query defects. [CITED: https://neo4j.com/docs/cypher-manual/5/indexes/semantic-indexes/vector-indexes/]
- Native `CREATE VECTOR INDEX` Cypher syntax arrived in Neo4j 5.15. Therefore **5.15 is hard minimum for syntax below**, not 5.11 or 5.13. [CITED: https://neo4j.com/docs/cypher-manual/5/indexes/semantic-indexes/vector-indexes/]
- **Pin Neo4j 5.26.x for this phase**. Existing project stack research already specifies Neo4j 5.26+, and 5.26 supports declared dimensions through 4096, cosine similarity, parameterized vector queries, and current index-management commands. [VERIFIED: codebase grep — `.planning/research/STACK.md`] [CITED: https://neo4j.com/docs/cypher-manual/current/indexes/semantic-indexes/vector-indexes/]
- `neo4j-driver@6.2.0` needs no vector-specific client API: it sends parameterized Cypher and reads `record.get('node')` / `record.get('score')`. Registry metadata declares Node `>=18.0.0`. [VERIFIED: npm registry] [CITED: https://neo4j.com/docs/javascript-manual/current/query-simple/]

### Exact creation syntax

Neo4j's documented shape is: [CITED: https://neo4j.com/docs/cypher-manual/current/indexes/semantic-indexes/vector-indexes/]

```cypher
CREATE VECTOR INDEX moviePlots IF NOT EXISTS
FOR (m:Movie)
ON m.embedding
OPTIONS { indexConfig: {
  `vector.dimensions`: 1536,
  `vector.similarity_function`: 'cosine'
}}
```

Phase 18 should create one generation-specific schema and index per candidate snapshot. Example for recommended 384-dimensional E5 model: [CITED: https://neo4j.com/docs/cypher-manual/current/indexes/semantic-indexes/vector-indexes/]

```cypher
CREATE VECTOR INDEX `chunk_vector_7f35a2c1` IF NOT EXISTS
FOR (c:`ChunkSnapshot_7f35a2c1`)
ON c.embedding
OPTIONS { indexConfig: {
  `vector.dimensions`: 384,
  `vector.similarity_function`: 'cosine'
}}
```

`vector.dimensions` accepts 1–4096 on current Neo4j; declaring it makes Neo4j check indexed vectors against configured width. Keep explicit dimensions even though newer Neo4j can omit them, because D-09 requires model/index mismatch detection. [CITED: https://neo4j.com/docs/cypher-manual/current/indexes/semantic-indexes/vector-indexes/]

Use default HNSW settings initially: `vector.hnsw.m = 16`, `vector.hnsw.ef_construction = 100`. No tuning is justified for pilot/single-user corpus. [CITED: https://neo4j.com/docs/cypher-manual/current/indexes/semantic-indexes/vector-indexes/]

Index creation starts population in background. Index cannot serve queries while `POPULATING`; verify with `SHOW VECTOR INDEXES` and wait with exact procedure shape `CALL db.awaitIndex(indexName [, timeOutSeconds])`. [CITED: https://neo4j.com/docs/cypher-manual/current/indexes/semantic-indexes/vector-indexes/] [CITED: https://neo4j.com/docs/operations-manual/current/procedures/#procedure_db_awaitindex]

```cypher
CALL db.awaitIndex('chunk_vector_7f35a2c1', 120)
```

### Exact query shape and driver call

Neo4j documents this signature and output: `db.index.vector.queryNodes(indexName :: STRING, numberOfNearestNeighbours :: INTEGER, query :: ANY) :: (node :: NODE, score :: FLOAT)`. Results are approximate nearest neighbors, sorted by descending score; score lies from 0.0 to 1.0, with 1.0 most similar. [CITED: https://neo4j.com/docs/cypher-manual/current/indexes/semantic-indexes/vector-indexes/#vector-index-query]

```cypher
CALL db.index.vector.queryNodes($indexName, $k, $queryEmbedding)
YIELD node, score
WHERE node.graphSnapshotId = $snapshotId
RETURN node.chunkKey AS chunkId,
       node.documentId AS sourceDocumentId,
       node.headingPath AS headingPath,
       node.startLine AS lineStart,
       node.endLine AS lineEnd,
       score
ORDER BY score DESC
LIMIT $k
```

```ts
// Source: https://neo4j.com/docs/javascript-manual/current/query-simple/
const result = await driver.executeQuery(
  CYPHER_QUERIES.QUERY_CHUNK_VECTOR,
  {
    indexName: pinned.vectorIndexName,
    k: topK,
    queryEmbedding,
    snapshotId: pinned.graphSnapshotId,
  },
  { database, routing: neo4j.routing.READ },
);

const hits = result.records.map((record) => ({
  chunkId: record.get('chunkId') as string,
  score: record.get('score') as number,
}));
```

Index name, `k`, vector, and snapshot are procedure/value parameters. DDL identifiers such as generated label and index names are not ordinary Cypher values; generate them only from a fixed prefix plus validated lowercase hex snapshot digest, never from request text. [CITED: https://neo4j.com/docs/cypher-manual/current/indexes/syntax/] [VERIFIED: codebase grep — `neo4jRepository.ts` static-query policy]

ANN may return fewer than `k` near corpus cardinality and does not promise exact top-k neighbors. Treat it as a ranked candidate source, not exact similarity computation. [CITED: https://neo4j.com/docs/cypher-manual/current/indexes/semantic-indexes/vector-indexes/#vector-index-query]

### Single-user performance envelope

- Neo4j loads vector indexes in OS memory, outside page cache. Reserve OS RAM separately from Neo4j heap/page cache. [CITED: https://neo4j.com/docs/operations-manual/current/performance/memory-configuration/]
- Raw float storage lower bound is `nodeCount × dimensions × 4 bytes`; 10,000 E5 vectors at 384 dimensions hold about 15.4 MB of float payload, while 100,000 hold about 153.6 MB, before HNSW and store overhead. [VERIFIED: arithmetic from declared float dimensions]
- For pilot-to-personal corpora up to roughly 10,000 chunks, default HNSW settings and D-25's 1.5-second vector timeout should be ample on a commodity local PC; exact p50/p95 depends on CPU, disk, Neo4j memory, and corpus shape and must be measured on target Windows hardware. [ASSUMED]
- Commit vector writes before query/validation: changes made in same transaction are not visible to vector index. [CITED: https://neo4j.com/docs/cypher-manual/current/indexes/semantic-indexes/vector-indexes/#vector-index-limitations]

## Neo4j Full-Text Index

### Exact creation and query syntax

Neo4j's documented node full-text syntax is: [CITED: https://neo4j.com/docs/cypher-manual/current/indexes/semantic-indexes/full-text-indexes/]

```cypher
CREATE FULLTEXT INDEX namesAndTeams IF NOT EXISTS
FOR (n:Employee|Manager) ON EACH [n.name, n.team]
```

Use candidate-generation label plus raw chunk text: [CITED: https://neo4j.com/docs/cypher-manual/current/indexes/semantic-indexes/full-text-indexes/]

```cypher
CREATE FULLTEXT INDEX `chunk_fulltext_7f35a2c1` IF NOT EXISTS
FOR (c:`ChunkSnapshot_7f35a2c1`) ON EACH [c.text]
OPTIONS { indexConfig: {
  `fulltext.analyzer`: 'standard-folding'
}}
```

Existing nodes populate automatically. Full-text indexes are transactionally updated by default; do **not** enable `fulltext.eventually_consistent` for snapshot validation, because candidate readiness must reflect committed candidate content before activation. [CITED: https://neo4j.com/docs/cypher-manual/current/indexes/semantic-indexes/full-text-indexes/#indexes-fulltext-create]

```cypher
CALL db.index.fulltext.queryNodes($indexName, $luceneQuery)
YIELD node, score
WHERE node.graphSnapshotId = $snapshotId
RETURN node.chunkKey AS chunkId,
       node.documentId AS sourceDocumentId,
       node.headingPath AS headingPath,
       node.startLine AS lineStart,
       node.endLine AS lineEnd,
       score
ORDER BY score DESC
LIMIT $k
```

`db.index.fulltext.queryNodes` returns matching nodes and Lucene relevance score in descending score order. Query text uses Lucene query syntax, so escape or quote user special characters before calling it; never splice request text into Cypher. [CITED: https://neo4j.com/docs/cypher-manual/current/indexes/semantic-indexes/full-text-indexes/#indexes-fulltext-query]

### Vietnamese analyzer choice

**Use `standard-folding`.** Neo4j source describes it exactly as: “Analyzer that uses ASCIIFoldingFilter to remove accents (diacritics). Otherwise behaves as standard english analyzer.” Its implementation applies `StandardTokenizer`, `ASCIIFoldingFilter`, then `LowerCaseFilter`. This lets diacritic and unaccented forms share terms without shipping a custom Neo4j analyzer plugin. [VERIFIED: official Neo4j source — https://github.com/neo4j/neo4j/blob/5.26.0/community/fulltext-index/src/main/java/org/neo4j/kernel/api/impl/fulltext/analyzer/providers/StandardFolding.java] [VERIFIED: official Neo4j source — https://github.com/neo4j/neo4j/blob/5.26.0/community/fulltext-index/src/main/java/org/neo4j/kernel/api/impl/fulltext/analyzer/StandardFoldingAnalyzer.java]

Analyzer tradeoffs: [VERIFIED: official Neo4j source — https://github.com/neo4j/neo4j/tree/5.26.0/community/fulltext-index/src/main/java/org/neo4j/kernel/api/impl/fulltext/analyzer/providers]

| Analyzer | Behavior | Decision |
|---|---|---|
| `standard` | Standard tokenization, English stop-word removal, no accent folding. | Reject: accented/unaccented Vietnamese query variants diverge. |
| `standard-no-stop-words` | Default analyzer; no stop-word removal, no accent folding. | Use only if server persists a separately normalized search property. |
| `standard-folding` | Accent folding plus lowercasing and standard-style tokenization. | **Use now:** smallest deployment and matches Vietnamese diacritic-tolerant requirement. |
| Custom analyzer | Neo4j supports custom analyzer providers. | Do not add plugin lifecycle for pilot. Revisit only if benchmark shows Vietnamese tokenization failures. |

`standard-folding` warns about unexpected handling of non-ASCII numbers/symbols. Preserve exact identifiers through raw-text query terms and acceptance cases such as `MAIN1.FCL_CYCLE_COUNTER`; do not assume analyzer behavior without benchmark evidence. [VERIFIED: official Neo4j source — https://github.com/neo4j/neo4j/blob/5.26.0/community/fulltext-index/src/main/java/org/neo4j/kernel/api/impl/fulltext/analyzer/providers/StandardFolding.java]

### Scoring and client BM25 boundary

Neo4j calls returned value a Lucene relevance score. Neo4j 5.26 pins Lucene 9.11.1, and Lucene `IndexSearcher` uses `new BM25Similarity()` as default similarity; therefore Neo4j 5.26's untuned full-text ranking is Lucene BM25. Neo4j's public API promises relevance ordering, not a stable numeric BM25 scale, so Phase 18 should consume rank only, which aligns with D-17 RRF. [VERIFIED: official Neo4j source — https://github.com/neo4j/neo4j/blob/5.26.0/pom.xml] [VERIFIED: official Lucene source — https://github.com/apache/lucene/blob/releases/lucene/9.11.1/lucene/core/src/java/org/apache/lucene/search/IndexSearcher.java] [CITED: https://neo4j.com/docs/cypher-manual/current/indexes/semantic-indexes/full-text-indexes/]

**No second server-side BM25 implementation is needed.** Neo4j full-text already supplies lexical candidate ranking co-located with pinned graph/vector generation. Keep `src/utils/bm25.ts` unchanged as PlannerMate's offline client fallback; server retrieval must not import or displace it. [VERIFIED: codebase grep — `src/utils/bm25.ts`, `18-CONTEXT.md`]

## Local Embedding Adapter (@xenova/transformers)

### Package and runtime decision

Use exact direct dependency `@xenova/transformers@2.17.2`, matching locked D-07. This is latest and final npm release under old Xenova package name, published 2024-05-29; current Transformers.js documentation now uses successor package `@huggingface/transformers`, but changing package family would re-litigate locked scope. [VERIFIED: npm registry] [CITED: https://huggingface.co/docs/transformers.js/main/en/installation]

On Node, 2.17.2 imports optional `onnxruntime-node@1.14.0` before `onnxruntime-web@1.14.0`, selecting native ONNX runtime when available; browser builds use WASM. Therefore knowledge-server should use Node native CPU execution, not force WASM. The npm tarball still includes WASM assets, but it is installed only in isolated `knowledge-server`, not PlannerMate PWA bundle. [VERIFIED: npm registry] [VERIFIED: official package source — `@xenova/transformers@2.17.2/src/backends/onnx.js`] [VERIFIED: codebase grep — separate package manifests]

### Primary model: multilingual E5 small

**Recommend `Xenova/multilingual-e5-small` at immutable revision `761b726dd34fb83930e26aab4e9ac3899aa1fa78`, quantized ONNX, 384 dimensions.** Base model metadata explicitly includes Vietnamese (`vi`), and retrieval usage requires `query: ` / `passage: ` prefixes even for non-English text. It uses mean pooling and normalized embeddings. Base model license is MIT. [VERIFIED: Hugging Face model API] [CITED: https://huggingface.co/intfloat/multilingual-e5-small] [CITED: https://huggingface.co/intfloat/multilingual-e5-small/raw/main/config.json]

Artifact sizes from official Hugging Face API with blob metadata: `model_quantized.onnx` 118,308,185 bytes, tokenizer JSON 17,082,730 bytes, and SentencePiece model 5,069,051 bytes, about 140.5 MB before small config files/cache overhead. Full-float ONNX is 470,268,533 bytes. [VERIFIED: Hugging Face model API — https://huggingface.co/api/models/Xenova/multilingual-e5-small?blobs=true]

This model fits D-07's local artifact range and gives smallest rebuild/cold-start cost among researched multilingual choices. Its short model context requires deterministic truncation at tokenizer/model maximum; Phase 16 chunks can reach 6,000 characters, so embedding adapter must record truncation count and policy in `embeddingPolicyVersion`. [CITED: https://huggingface.co/intfloat/multilingual-e5-small] [VERIFIED: codebase grep — `TARGET_CHUNK_SIZE = 6000`, D-09]

### Alternatives

| Model | Dimensions | Vietnamese / multilingual evidence | Quantized core artifact | License | Decision |
|---|---:|---|---:|---|---|
| `Xenova/multilingual-e5-small` | 384 | Base metadata explicitly lists `vi`; cross-language bitext tasks include Vietnamese pairs. | 118.3 MB | MIT | **Default.** Best local size/quality balance. [CITED: https://huggingface.co/intfloat/multilingual-e5-small] |
| `Xenova/bge-m3` | 1024 | More than 100 languages; no explicit Vietnamese line found in fetched model card. 8192-token context. | 569.7 MB | MIT | Upgrade when long-chunk benchmark gain justifies about 4.8× model bytes and 2.7× vector width. [CITED: https://huggingface.co/BAAI/bge-m3] [VERIFIED: Hugging Face model API] |
| `Xenova/paraphrase-multilingual-mpnet-base-v2` | 768 | Model metadata explicitly lists `vi` among 50 languages. Maximum sequence length 128; mean pooling. | 278.6 MB | Apache-2.0 | Not default: shorter context and larger artifact than E5. [CITED: https://huggingface.co/sentence-transformers/paraphrase-multilingual-mpnet-base-v2] [VERIFIED: Hugging Face model API] |

BGE-M3's `model_quantized.onnx` is 569,694,530 bytes plus about 22.2 MB tokenizer assets; MPNet's is 278,647,663 bytes plus about 22.2 MB tokenizer assets. [VERIFIED: Hugging Face model API — https://huggingface.co/api/models/Xenova/bge-m3?blobs=true] [VERIFIED: Hugging Face model API — https://huggingface.co/api/models/Xenova/paraphrase-multilingual-mpnet-base-v2?blobs=true]

### Minimal adapter pattern

```ts
// Sources:
// https://huggingface.co/docs/transformers.js/v2.17.2/en/api/pipelines
// @xenova/transformers@2.17.2 types/pipelines.d.ts and src/utils/hub.js
import { env, pipeline } from '@xenova/transformers';

const MODEL = 'Xenova/multilingual-e5-small';
const REVISION = '761b726dd34fb83930e26aab4e9ac3899aa1fa78';
const DIMENSIONS = 384;

env.cacheDir = process.env.EMBEDDING_CACHE_DIR ?? './.cache/transformers';

const extractorPromise = pipeline('feature-extraction', MODEL, {
  revision: REVISION,
  quantized: true,
});

export async function embedQuery(text: string): Promise<number[]> {
  const extractor = await extractorPromise;
  const tensor = await extractor(`query: ${text}`, {
    pooling: 'mean',
    normalize: true,
  });
  const vector = Array.from(tensor.data as Float32Array);
  if (vector.length !== DIMENSIONS) throw new Error('EMBEDDING_DIMENSION_MISMATCH');
  return vector;
}

export async function embedDocuments(texts: string[]): Promise<number[][]> {
  const extractor = await extractorPromise;
  const tensor = await extractor(
    texts.map((text) => `passage: ${text}`),
    { pooling: 'mean', normalize: true },
  );
  const flat = Array.from(tensor.data as Float32Array);
  return texts.map((_, i) => flat.slice(i * DIMENSIONS, (i + 1) * DIMENSIONS));
}
```

`pipeline` accepts a string or array of strings; feature-extraction options include `pooling: 'mean' | 'cls' | 'none'` and `normalize`. `revision` accepts branch, tag, or commit ID and defaults to mutable `main`; always pass commit SHA and persist it with provider/model/dimensions/policy metadata. [CITED: https://huggingface.co/docs/transformers.js/v2.17.2/en/api/pipelines] [VERIFIED: official package source — `@xenova/transformers@2.17.2/src/utils/hub.js`]

For controlled offline deployment, prefetch/cache artifacts during setup, set `env.localModelPath`, then set `env.allowRemoteModels = false`; otherwise first startup downloads model files from Hugging Face and caches them. [CITED: https://huggingface.co/docs/transformers.js/main/en/tutorials/node]

### Latency, throughput, memory, and cold start

No authoritative Transformers.js CPU benchmark was found for these exact models on commodity Windows hardware. Do not lock fabricated latency numbers. [ASSUMED]

Planning envelope only, pending target-machine spike: [ASSUMED]

| Model | Warm single-query target | Batch rebuild target | Expected process RAM | Cold-start driver |
|---|---:|---:|---:|---|
| multilingual-E5-small int8 | 50–300 ms | 5–30 chunks/s at batch 8–32 | 300–700 MB | ~140 MB initial download plus model initialization |
| paraphrase-multilingual-MPNet int8 | 150–700 ms | 2–10 chunks/s | 0.7–1.5 GB | ~301 MB core assets plus initialization |
| BGE-M3 int8 | 300–1500 ms | 1–6 chunks/s | 1.2–3 GB | ~592 MB core assets plus initialization |

These ranges are LOW confidence and must remain acceptance budgets, not claims. Local benchmark attempt on this machine was blocked before inference because transitive `sharp@0.32.x` download failed against an enterprise self-signed TLS certificate; current host also runs Node 20.19.5 while project target is Node 24. This makes a Node-24 Windows install/load spike mandatory before implementation locks local adapter viability. [VERIFIED: local environment probe]

## Remote Embedding Adapter (OpenAI-compatible)

### Common wire contract

Use native Node `fetch`; add no SDK. OpenAI-compatible request: [CITED: https://developers.openai.com/api/reference/resources/embeddings/methods/create]

```http
POST /v1/embeddings
Authorization: Bearer <server-only-secret>
Content-Type: application/json

{
  "model": "text-embedding-3-small",
  "input": ["query text", "document text"],
  "encoding_format": "float"
}
```

```json
{
  "object": "list",
  "data": [
    { "object": "embedding", "index": 0, "embedding": [0.0123, -0.0456] }
  ],
  "model": "text-embedding-3-small",
  "usage": { "prompt_tokens": 12, "total_tokens": 12 }
}
```

Validate response with existing Zod, reorder by `data[].index`, require exactly one output per input, require finite numbers, and require configured dimensions before writing Neo4j. [VERIFIED: codebase grep — Zod boundary convention] [CITED: https://developers.openai.com/api/reference/resources/embeddings/methods/create]

OpenAI request limits currently documented: each input at most 8192 tokens, at most 2048 input items, and at most 300,000 tokens summed across one request. Batch by both item count and provider token budget; provider config must override defaults because compatible vendors differ. [CITED: https://developers.openai.com/api/reference/resources/embeddings/methods/create]

### Provider notes

| Provider/model | Dimensions and batching | Vietnamese/multilingual evidence | Adapter note |
|---|---|---|---|
| OpenAI `text-embedding-3-small` | 1536 default; dimensions may be shortened. 8192-token input. | Official guide reports multilingual MIRACL improvement but no Vietnamese-specific score found in reviewed docs. | Default remote baseline; normalized vectors make cosine appropriate. [CITED: https://developers.openai.com/api/docs/guides/embeddings] |
| OpenAI `text-embedding-3-large` | 3072 default; dimensions may be shortened. 8192-token input. | Higher official aggregate MTEB score than small; no Vietnamese-specific score found in reviewed docs. | Use only if benchmark gain justifies doubled vector width/cost. [CITED: https://developers.openai.com/api/docs/guides/embeddings] |
| Voyage `voyage-4` / `voyage-4-large` | 1024 default; supports 256/512/2048. Up to 1000 inputs; aggregate token cap 320K for `voyage-4`, 120K for `voyage-4-large`. | Vendor describes both as multilingual; reviewed docs do not publish Vietnamese-specific result. | Endpoint and response resemble OpenAI, but retrieval quality expects provider extension `input_type: 'query' | 'document'`; expose capability flag rather than sending it to every compatible endpoint. [CITED: https://docs.voyageai.com/docs/embeddings] [CITED: https://docs.voyageai.com/reference/embeddings-api] |
| Jina `jina-embeddings-v3` | 1024, Matryoshka reductions down to 32, 8192-token context. | Official announcement explicitly names Vietnamese among supported/high-performing languages. | Uses task modes such as `retrieval.query` / `retrieval.passage`; model weights are CC BY-NC 4.0, so commercial local deployment needs license review. Remote API terms require separate review. [CITED: https://jina.ai/news/jina-embeddings-v3-a-frontier-multilingual-embedding-model/] [CITED: https://huggingface.co/jinaai/jina-embeddings-v3] |

Do not assume “OpenAI-compatible” means identical limits or optional fields. Keep common core `{model,input,encoding_format}` and provider capability settings for `dimensions`, Voyage `input_type`, or Jina `task`; bind all of them into D-09 index metadata/policy version. [CITED: https://developers.openai.com/api/reference/resources/embeddings/methods/create] [CITED: https://docs.voyageai.com/reference/embeddings-api]

### DLP and secret boundary

Remote mode stays off unless `EMBEDDING_REMOTE_ENABLED=true` and endpoint/model are configured. API key comes only from knowledge-server environment/secret store, is sent only in `Authorization`, and never enters PlannerMate source, Vite env, IndexedDB, Neo4j nodes, snapshot files, logs, or response payload. [VERIFIED: codebase grep — Phase 18 D-10 and `CLAUDE.md`]

Only manually published Markdown that already passed client preview/DLP approval may be sent for document embedding. Query text also leaves local machine when remote mode is enabled, so startup must show provider/model/endpoint-host banner and operational docs must state this data-egress boundary. Logs should contain provider, model, batch count, duration, and error code—not query, chunk text, authorization header, or returned vectors. [VERIFIED: codebase grep — Phase 18 D-10, project runtime constraint]

Remote failure, timeout, malformed output, or dimension mismatch marks semantic modality unavailable; it must not block full-text/graph results and must never activate candidate vector metadata. [VERIFIED: codebase grep — Phase 18 D-09/D-11]

## Dependency Additions

| Package | Exact version | Purpose | Compatibility / bundle impact | Confidence |
|---|---:|---|---|---|
| `@xenova/transformers` | `2.17.2` | Locked local ONNX feature-extraction adapter. | ESM package; depends on `onnxruntime-web@1.14.0`, optional `onnxruntime-node@1.14.0`, and `sharp@^0.32.0`. Install only under `knowledge-server`; no PlannerMate PWA bundle impact. Package has no declared Node engine; Node 24 install/load remains unverified. | MEDIUM for API, LOW for Node 24 install. [VERIFIED: npm registry] |

**Only one new direct dependency is needed.** Keep existing exact `neo4j-driver@6.2.0`; native Node `fetch`, `AbortSignal.timeout`, and existing `zod@^4.6.5` cover remote HTTP, timeout, and response validation. Do not add OpenAI/Voyage/Jina SDKs, Axios, ONNX Runtime, tokenizer, or vector libraries directly. [VERIFIED: codebase grep — `knowledge-server/package.json`] [CITED: https://developers.openai.com/api/reference/resources/embeddings/methods/create]

Install command: [VERIFIED: npm registry]

```bash
cd knowledge-server
npm install --save-exact @xenova/transformers@2.17.2
```

Package legitimacy gate could not complete because `slopcheck` was unavailable after best-effort install. Per project research policy, package remains `[ASSUMED]` for legitimacy despite official Hugging Face documentation and npm registry confirmation; planner must add human verification before install. Direct package has no `postinstall` script, but transitive `sharp` performs native artifact installation. [ASSUMED] [VERIFIED: npm registry] [VERIFIED: local environment probe]

## Snapshot-Pinned Index Swap

### Use generation-specific labels and names, not index rename

Neo4j documentation exposes create/show/drop index management but no supported index-rename operation was found. Vector schema also permits only one vector index over a given schema. Therefore `CandidateChunk` plus “rename index on activation” is not safe or available; use unique generation labels and unique index names, then atomically switch metadata pointer. [CITED: https://neo4j.com/docs/cypher-manual/current/indexes/search-performance-indexes/managing-indexes/] [CITED: https://neo4j.com/docs/cypher-manual/current/indexes/semantic-indexes/vector-indexes/#vector-index-limitations]

Concrete lifecycle: [VERIFIED: codebase grep — `snapshotStore.ts`, `neo4jRepository.ts`] [CITED: https://neo4j.com/docs/cypher-manual/current/indexes/semantic-indexes/vector-indexes/]

1. Derive fixed lowercase hex generation token from candidate `graphSnapshotId`, for example `7f35a2c1`; reject any token outside `^[a-f0-9]{8,64}$` before constructing DDL identifiers. [VERIFIED: codebase grep — static Cypher/no interpolation convention]
2. Write every candidate chunk as both generic `:Chunk` and unique `:ChunkSnapshot_7f35a2c1`, with `graphSnapshotId`, citation fields, raw `text`, and embedding. Generic label supports lifecycle/inspection; unique label isolates index schema. [ASSUMED]
3. Create `chunk_fulltext_7f35a2c1` and `chunk_vector_7f35a2c1` over unique label. DDL runs before activation, not inside active-pointer transaction. [CITED: https://neo4j.com/docs/cypher-manual/current/indexes/semantic-indexes/full-text-indexes/] [CITED: https://neo4j.com/docs/cypher-manual/current/indexes/semantic-indexes/vector-indexes/]
4. Wait for both indexes `ONLINE`; validate node count, non-null embedding count, exact dimension, provider/model/revision/dimensions/`embeddingPolicyVersion`, and smoke-query candidate index. Candidate remains `READY`, never visible through active pointer, during this work. [CITED: https://neo4j.com/docs/operations-manual/current/procedures/#procedure_db_awaitindex] [VERIFIED: codebase grep — Phase 17 candidate lifecycle, Phase 18 D-09]
5. In same transaction as existing `ACTIVE_GRAPH` switch, persist candidate index metadata on `GraphSnapshot` and move `ACTIVE_GRAPH` pointer. Logical activation is atomic because requests resolve index names from pinned snapshot metadata, not mutable global names. [VERIFIED: codebase grep — `CYPHER_QUERIES.ACTIVATE_CANDIDATE`, Phase 18 D-24]
6. At request start, resolve one active `GraphSnapshot` and capture `{graphSnapshotId, fulltextIndexName, vectorIndexName, embedding metadata}`. Pass these immutable values to all modality calls. [VERIFIED: codebase grep — Phase 18 D-24]
7. Keep superseded nodes and indexes while in-flight requests may still hold old pinned metadata. Drop them only after an explicit grace/lease rule proves no request can reference them; cleanup failure must not affect new active snapshot. [ASSUMED]

Suggested snapshot metadata: [VERIFIED: codebase grep — Phase 18 D-09]

```text
GraphSnapshot {
  graphSnapshotId,
  fulltextIndexName,
  vectorIndexName,
  embeddingProvider,
  embeddingModel,
  embeddingRevision,
  embeddingDimensions,
  embeddingPolicyVersion,
  state
}
```

Activation query extension: [VERIFIED: codebase grep — existing `ACTIVATE_CANDIDATE`]

```cypher
MERGE (set:GraphSet {setId: $setId})
WITH set
MATCH (candidate:GraphSnapshot {
  graphSnapshotId: $graphSnapshotId,
  setId: $setId,
  state: 'READY'
})
WHERE candidate.fulltextIndexName IS NOT NULL
  AND candidate.vectorIndexName IS NOT NULL
  AND candidate.embeddingDimensions = $embeddingDimensions
OPTIONAL MATCH (set)-[old:ACTIVE_GRAPH]->(previous:GraphSnapshot)
DELETE old
FOREACH (_ IN CASE WHEN previous IS NULL THEN [] ELSE [1] END |
  SET previous.state = 'SUPERSEDED'
)
MERGE (set)-[:ACTIVE_GRAPH]->(candidate)
SET candidate.state = 'ACTIVE',
    candidate.activatedAt = $activatedAt
RETURN candidate.graphSnapshotId AS id,
       candidate.fulltextIndexName AS fulltextIndexName,
       candidate.vectorIndexName AS vectorIndexName
```

Critical failure rule: if embedding, either index build, online wait, metadata validation, or candidate smoke query fails, mark candidate failed and leave previous `ACTIVE_GRAPH` plus its indexes untouched. [VERIFIED: codebase grep — Phase 17 D-21, Phase 18 D-08/D-09]

## Open Questions

1. **Does `@xenova/transformers@2.17.2` install and run under project-target Node 24 on target Windows machine?** Local install was blocked by enterprise TLS during transitive `sharp` download, not by confirmed API incompatibility. Planner needs pre-install human verification and a Node-24 load/one-vector spike before deeper implementation. [VERIFIED: local environment probe]
2. **What measured local performance should become acceptance threshold?** No authoritative exact-model Windows benchmark was found. Capture cold download, cached initialization, warm query p50/p95, batch throughput, and peak RSS for E5 before deciding whether BGE-M3 is viable. [ASSUMED]
3. **Does `standard-folding` meet pilot identifier and Vietnamese recall without harming precision?** Source confirms diacritic folding but warns about non-ASCII token behavior; benchmark accented/unaccented Vietnamese and exact Oracle identifiers before considering normalized shadow property or custom analyzer. [VERIFIED: official Neo4j source]
4. **What superseded-generation retention period covers longest retrieval request?** Use request lease/refcount if available; otherwise define grace greater than overall request timeout before dropping old indexes/nodes. [ASSUMED]

## RESEARCH COMPLETE
