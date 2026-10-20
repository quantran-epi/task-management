# Project Roadmap

## Active Phase

- Phase 22: Federated MCP Knowledge & Hybrid Tool Grounding

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

- [ ] 22-02-PLAN.md — MCP Retrieval Runner, parallel grounded turn orchestration & evidence packing (Wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 22-03-PLAN.md — Unified Grounded UI rendering with [M*] citation chips and source exploration (Wave 3)

**Wave 4** *(blocked on Wave 2 completion)*

- [ ] 22-04-PLAN.md — Telegram AI Gateway MCP tool integration and access control parity (Wave 4)
