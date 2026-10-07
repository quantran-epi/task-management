# Stack Research

**Domain:** Hybrid GraphRAG, Knowledge Graph extraction, and semantic search over banking workflow docs
**Researched:** 2026-10-07
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Fastify | 5.12.5 | Knowledge Server HTTP runtime | Node 24 native ESM, low memory footprint (<15MB), built-in JSON schema validation, official CORS plugin, straightforward streaming. |
| neo4j-driver | 6.2.0 | Neo4j official bolt client | Official driver with TypeScript types, connection pooling, and full Neo4j 5.x Cypher, full-text, and vector index support. |
| Neo4j Community / Desktop / Aura | 5.26+ | Unified graph, vector, and full-text database | Unifies multi-hop Cypher traversal, native vector indexes (`db.index.vector.*`), and full-text search (`db.index.fulltext.*`) in one engine. Eliminates separate vector DB. |
| unified | 11.0.5 | Markdown syntax tree ecosystem | De-facto standard AST pipeline. Strictly typed, composable. |
| remark-parse | 11.0.0 | Markdown parser to MDAST | Converts raw Markdown to AST with exact source coordinates (lines, offsets) for evidence provenance. |
| remark-gfm | 4.0.1 | GitHub Flavored Markdown support | Parses technical tables, task lists, and strikethroughs in banking flow documents without custom regex. |
| mdast-util-to-string | 4.0.0 | String extraction from AST nodes | Safely serializes MDAST nodes to raw text for embedding and indexing without markup noise. |
| @anthropic-ai/sdk | 0.131.0 | Structured extraction & evidence synthesis | Official SDK with native tool-use schema enforcement for deterministic entity/relation extraction and synthesis. |
| @modelcontextprotocol/sdk | 1.32.1 | Model Context Protocol server/tools | Exposes graph tools (`search_graph_nodes`, `traverse_pipeline`) via standard MCP protocol matching existing desktop harness. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | 4.6.5 (Installed) | Boundary validation & graph schemas | Validate incoming ingestion payloads, node composite IDs, and extraction output before writing to Neo4j. |
| @fastify/cors | 11.0.0 | Cross-Origin Resource Sharing | Allow browser PWA and Tauri webviews to query the local knowledge server (`http://localhost:3001`). |
| dotenv | 18.0.6 | Environment variable configuration | Load Neo4j connection URI, bolt credentials, and API keys into the knowledge server daemon. |
| @huggingface/transformers | 4.3.1 | Local on-device embeddings | Use when remote API / 9router is unreachable or air-gapped banking network blocks external calls. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| tsx | 4.23.15 | Zero-config TypeScript ESM runner | Run knowledge server dev daemon and one-off benchmark/ingestion scripts. |
| Node.js | 24 LTS | Runtime environment | Matches PlannerMate toolchain; native Web Crypto, fetch, and ESM support. |
| Vitest | 5.0.2 (Installed) | Unit and integration testing | Test AST chunking, composite ID collision safety, Cypher builders, and benchmark assertions. |
| Docker / Docker Compose | Local Neo4j instance orchestration | Reproducible `neo4j:5.26.0-community` container with APOC plugin for local development. |

## Installation

```bash
# In knowledge-server/
# Core
npm install fastify@^5.12.5 @fastify/cors@^11.0.0 neo4j-driver@^6.2.0 @anthropic-ai/sdk@^0.131.0 @modelcontextprotocol/sdk@^1.32.1 unified@^11.0.5 remark-parse@^11.0.0 remark-gfm@^4.0.1 mdast-util-to-string@^4.0.0 zod@^4.6.5 dotenv@^18.0.6

# Supporting (Optional local embeddings)
npm install @huggingface/transformers@^4.3.1

# Dev dependencies
npm install -D typescript@^7.0.2 tsx@^4.23.15 @types/node@^24.0.0 vitest@^5.0.2
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Neo4j 5 (Unified Graph + Vector + FullText) | Neo4j + Qdrant / Pinecone / Milvus | Only if vector corpus exceeds millions of vectors requiring distributed vector sharding. Pilot corpus is small; single engine avoids dual-write sync bugs. |
| Neo4j 5 (Unified) | Graphiti MCP Service Only | Use Graphiti for dynamic conversational memory. Use Neo4j for deterministic domain graph traversal, custom schemas, and multi-hop process flow paths. |
| Fastify 5 | Express 4 / 5 | Only if legacy Express middleware is strictly required. Fastify is faster, has native TS, and built-in schema validation. |
| Fastify 5 | NestJS | Only in large multi-team enterprise services. NestJS introduces unnecessary decorators and boilerplate for a companion daemon. |
| unified + remark-parse | RegEx / custom string splitting | Never. RegEx breaks on Markdown tables, nested code blocks, and escaped characters. |
| TypeScript Pipeline | Python (LangChain / LlamaIndex) | Only if using Python-exclusive ML models. TS keeps single language across browser, Tauri, and server. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Python / LangChain / LlamaIndex | Heavy second runtime, venv overhead, breaks single Node/Tauri ecosystem. | Pure TypeScript with Fastify, `neo4j-driver`, and `@anthropic-ai/sdk`. |
| Standalone Vector Database (Pinecone, Chroma, Qdrant) | Adds unnecessary cluster, dual-write synchronization complexity, split queries. | Neo4j 5 native vector indexes (`db.index.vector.*`). |
| In-browser Graph Engine (Graphology in IndexedDB) | Graph traversals of 3+ hops over thousands of edges plus vector similarity search block the browser UI thread and exceed WebAssembly memory limits. | Dedicated local/remote Neo4j instance accessed via Knowledge Server. |
| Raw/Numeric PL/SQL IDs | Container ID 60000006 collides with Bind ID 60000006. Numeric IDs corrupt graph edges. | Composite prefixed IDs (`PRC_PROCESS:60000006` vs `PRC_CONTAINER:60000006`). |
| Ingesting Real Banking Data | Real PAN, CVV, PIN blocks, HSM keys violate banking privacy and security. | Strict sanitizer pass during ingestion; corpus contains only technical process metadata. |

## Stack Patterns by Variant

**If Remote LLM Gateway (9router) is Available:**
- Route embeddings and extraction to 9router `/v1/embeddings` and `/v1/chat/completions`.
- Because zero server-side RAM footprint, instant execution, leverages existing user token.

**If Air-Gapped / Intranet / Offline:**
- Use `@huggingface/transformers` (`Xenova/all-MiniLM-L6-v2`) and local Ollama instance.
- Because keeps all embedding generation and graph indexing inside local machine boundaries.

**If Desktop Tauri Shell:**
- Call Knowledge Server via localhost fetch or Tauri IPC proxy (`src-tauri/src/ai_proxy.rs`).
- Because bypasses browser CORS and leverages native desktop networking.

**If Browser PWA on GitHub Pages:**
- Connect via direct HTTPS/HTTP fetch with `@fastify/cors` enabled on Knowledge Server, fallback to IndexedDB + client-side BM25 if server offline.
- Because Markdown remains canonical and PWA offline capability remains intact.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| fastify@5.12.5 | Node.js 24 LTS | Engine requires Node >=20. |
| neo4j-driver@6.2.0 | Neo4j 5.26+ | Bolt protocol v5.4. Supports vector & fulltext indexes. |
| unified@11.0.5 | remark-parse@11.0.0, remark-gfm@4.0.1 | ESM unified 11 ecosystem. |
| @anthropic-ai/sdk@0.131.0 | Node.js 24 LTS | Native fetch in Node 24. |
| @modelcontextprotocol/sdk@1.32.1 | Node.js 24 LTS | Standard MCP protocol types and server. |
| zod@4.6.5 | TypeScript 7.0.2 | Reuses root project's existing Zod version. |

## Sources

- https://registry.npmjs.org/fastify/latest — Fastify 5.12.5 registry and Node engine requirement (`>=20`).
- https://registry.npmjs.org/neo4j-driver/latest — neo4j-driver 6.2.0 release and Bolt protocol compatibility.
- https://registry.npmjs.org/unified/latest — unified 11.0.5 release.
- https://registry.npmjs.org/remark-parse/latest — remark-parse 11.0.0 release.
- https://registry.npmjs.org/remark-gfm/latest — remark-gfm 4.0.1 release.
- https://registry.npmjs.org/@anthropic-ai/sdk/latest — @anthropic-ai/sdk 0.131.0 release.
- https://registry.npmjs.org/@modelcontextprotocol/sdk/latest — @modelcontextprotocol/sdk 1.32.1 release.
- https://neo4j.com/docs/cypher-manual/current/indexes/semantic-indexes/vector-indexes/ — Neo4j 5 Vector Search.
- https://neo4j.com/docs/cypher-manual/current/indexes/semantic-indexes/full-text-indexes/ — Neo4j 5 Full-text Search.

---
*Stack research for: Milestone v1.2 Hybrid GraphRAG Knowledge Assistant MVP*
*Researched: 2026-10-07*
