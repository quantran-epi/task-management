# Project Roadmap

## Active Phase

- Phase 23: Knowledge Graph Build Reliability & Entity Fidelity

## Milestone: Knowledge System Implementation

### Phase 18: Multi-Modal Hybrid Retrieval Engine

- Fulltext BM25 search
- Dense vector retrieval
- Hybrid reciprocal rank fusion (RRF)
- Fallback strategies for offline/local environments

### Phase 19: Local Knowledge Base Infrastructure

- Fastify Knowledge Server
- IndexedDB local document storage
- Bi-directional sync with background daemon
- Document sets and metadata tagging

### Phase 19.1: Production Neo4j Integration & Live Retrieval Validation

- Neo4j schema & constraints
- Production bolt connection pool
- Cypher graph query builders
- Live entity resolution pipeline

### Phase 20: Knowledge Graph Extraction & Graphiti Pipeline

- Entity and relationship extraction from Markdown notes
- Graphiti memory integration
- Temporal graph representations
- Automated community detection

### Phase 21: Ontology & Graph Alignment Hardening

- Ontology constraints and entity schema validation
- Step-by-step extraction pipeline
- Grounded synthesis with graph seeds
- Local/server hybrid fallback

### Phase 22: Federated MCP Knowledge & Hybrid Tool Grounding

**Goal:** Provide generic, server-agnostic MCP integration for AI Chat Drawer and Telegram assistant across ALL currently enabled MCP servers (not hardcoded to Graphiti). Dynamically discover capabilities and instructions from all active MCP endpoints, determine MCP relevance via intentRouter, execute parallel retrieval (Knowledge Docs + dynamic MCP tools), and synthesize unified evidence-grounded answers.
**Requirements**: MCP-ROUTE-01, MCP-FEDERATED-01, MCP-SYNTH-01, MCP-TELE-01
**Depends on:** Phase 21
**Success Criteria** (what must be TRUE):

  1. System discovers and aggregates tools and instructions dynamically from ALL enabled MCP servers in Dexie settings (generic/agnostic, zero hardcoded server IDs).
  2. `intentRouter` inspects the dynamic catalog of enabled MCP servers (name, instruction, tool summaries) and flags `require_mcp` plus matching `target_mcp_servers` for any relevant query.
  3. Grounded Turn pipeline executes parallel multi-source retrieval: Knowledge Docs (Fulltext/Vector/Graph) alongside dynamic MCP tool execution for all selected MCP servers.
  4. Evidence from any MCP tool response is packed into `EvidencePack` using a generic MCP citation format (`[MCP:serverName/toolName]`, provenance timestamp, server authority).
  5. Final synthesis combines internal docs and live MCP tool findings into a coherent, non-hallucinated response with distinct MCP citation badges.
  6. Telegram AI gateway dynamically loads all enabled MCP servers and supports MCP tool execution for authorized users.

**Plans:** 4 plans in 4 waves

Plans:

**Wave 1**

- [x] 22-01-PLAN.md — Dynamic MCP capability discovery & IntentRouter extension (Wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 22-02-PLAN.md — MCP Retrieval Runner, parallel grounded turn orchestration & evidence packing (Wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 22-03-PLAN.md — Unified Grounded UI rendering with [M*] citation chips and source exploration (Wave 3)

**Wave 4** *(blocked on Wave 2 completion)*

- [x] 22-04-PLAN.md — Telegram AI Gateway MCP tool integration and access control parity (Wave 4)

### Phase 23: Knowledge Graph Build Reliability & Entity Fidelity

**Goal:** Eliminate OOM crashes during vector embedding and Neo4j writing, introduce durable incremental extraction caching on disk, and ensure high-fidelity Vietnamese entity naming and URN slugification.
**Requirements**: BUILD-OOM-01, BUILD-CACHE-01, ENTITY-FIDELITY-01
**Depends on:** Phase 22
**Success Criteria** (what must be TRUE):

  1. Rebuilding large document sets (>200 chunks) processes embeddings and writes in bounded batches with event-loop yield, keeping RAM consumption under 1.5Gi with zero OOM/Exit Code 137 kills.
  2. Chunk extraction results are cached persistently on disk keyed by `chunkContentHash` + model + promptVersion; subsequent builds or retries load cached extractions in < 3s without redundant LLM calls.
  3. Entity URN generation uses Unicode NFD-to-ASCII slugification rather than replacing Vietnamese accented characters with underscore chains.
  4. Fact queries (`GET_FACTS_BY_SNAPSHOT`) and FactSummaryDTO return and render original `canonicalName` from Neo4j nodes rather than string-splitting sanitized URN segments.
  5. LLM extraction prompts include entity naming constraints ensuring concise, noun-centric entity names without whole-sentence bloat.

**Plans:** 3 plans in 3 waves

Plans:

**Wave 1**

- [x] 23-01-PLAN.md — Vietnamese Entity Fidelity, Unicode NFD Slugification & Canonical Name Joins (Wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 23-02-PLAN.md — Persistent Disk-Backed Chunk Extraction Cache (Wave 2)

**Wave 3** *(blocked on Wave 1 and Wave 2 completion)*

- [ ] 23-03-PLAN.md — Stream Batching for Vector Embedding & Neo4j Insertion (Wave 3)
