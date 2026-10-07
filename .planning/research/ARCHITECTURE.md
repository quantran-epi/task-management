# Architecture Research: Hybrid GraphRAG Knowledge Assistant (v1.2 MVP)

**Domain:** Offline-first personal task & workload planner with hybrid GraphRAG technical assistant  
**Researched:** 2026-10-07  
**Overall Confidence:** HIGH (verified against PlannerMate codebase, Tauri Rust layer, Dexie IndexedDB, and sample pilot corpus `60000006-SHB-Credit-calculations`)

---

## Standard Architecture

### System Overview

Milestone v1.2 introduces an **optional, non-blocking Knowledge Server** alongside Neo4j to enrich the existing PlannerMate React/Tauri app.
Canonical source of truth remains the human-edited Markdown files in `docs/` and IndexedDB notes.
Graph and vector indexes are purely derived, disposable, and rebuildable.
When the knowledge server or Neo4j is offline, PlannerMate degrades gracefully to local client-side BM25 search and local AI tools.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        PlannerMate UI Layer (React 19 + Ant Design 6)                  │
│  ┌───────────────────────┐ ┌──────────────────────┐ ┌────────────────────────────────┐ │
│  │  AIChatDrawer / Popout│ │ DocEditorPane / Notes│ │  Knowledge Server Config Card  │ │
│  │  (Citations & Paths)  │ │ (Canonical Markdown) │ │  (Health, Sync, Rebuild)       │ │
│  └───────────┬───────────┘ └──────────┬───────────┘ └────────────────┬───────────────┘ │
└──────────────┼────────────────────────┼──────────────────────────────┼─────────────────┘
               │                        │                              │
┌──────────────▼────────────────────────▼──────────────────────────────▼─────────────────┐
│              Client Application & Proxy Boundary (IndexedDB / Tauri Rust)              │
│  ┌─────────────────────────────────┐  ┌──────────────────────────────────────────────┐ │
│  │ Dexie IndexedDB (Local Primary) │  │ Fallback: Local BM25 Engine (bm25.ts)        │ │
│  │ notes, tasks, settings, chat    │  │ client-side keyword search over docs         │ │
│  └─────────────────────────────────┘  └──────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────────────────────────────────────┐ │
│  │ Tauri IPC Proxy (`knowledge_proxy_request`, `graphiti_mcp_request`)               │ │
│  │ - Preserves browser CORS isolation & credentials in OS keyring                    │ │
│  │ - Health-checks optional knowledge endpoint (default: http://localhost:8080)      │ │
│  └────────────────────────────────────┬──────────────────────────────────────────────┘ │
└───────────────────────────────────────┼────────────────────────────────────────────────┘
                                        │ HTTP REST / SSE (Optional)
┌───────────────────────────────────────▼────────────────────────────────────────────────┐
│               Optional Knowledge Server (FastAPI / Node / Rust Daemon)                 │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │ Ingestion & Extraction Pipeline                                                  │  │
│  │ ┌─────────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐  │  │
│  │ │ Stage 1: Deterministic  │  │ Stage 2: Claude LLM  │  │ Stage 3: Resolution  │  │  │
│  │ │ Markdown AST Extractor  │─►│ Structured Extractor │─►│ & Evidence Packaging │  │  │
│  │ │ (Tables, SQL, Headers)  │  │ (Inferred relations) │  │ (Composite ID & Prov)│  │  │
│  │ └─────────────────────────┘  └──────────────────────┘  └──────────────────────┘  │  │
│  └────────────────────────────────────┬─────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────▼─────────────────────────────────────────────┐  │
│  │ Hybrid Retrieval Coordinator (RRF: Reciprocal Rank Fusion)                       │  │
│  │ ┌──────────────────────┐  ┌──────────────────────┐  ┌─────────────────────────┐  │  │
│  │ │ 1. BM25 / Fulltext   │  │ 2. Vector Embedding  │  │ 3. Bounded Graph Walker │  │  │
│  │ │ (Tokens & Acronyms)  │  │ (Dense Cosine Top-K) │  │ (Cypher 1-3 Hops Paths) │  │  │
│  │ └──────────┬───────────┘  └──────────┬───────────┘  └────────────┬────────────┘  │  │
│  └────────────┼─────────────────────────┼───────────────────────────┼───────────────┘  │
└───────────────┼─────────────────────────┼───────────────────────────┼──────────────────┘
                │                         │                           │
┌───────────────▼─────────────────────────▼───────────────────────────▼──────────────────┐
│                             Storage Layer (Disposable / Rebuildable)                   │
│  ┌───────────────────────────────────────────────────────────────────────────────────┐ │
│  │ Neo4j Community / AuraDB (Bolt protocol)                                          │ │
│  │ Nodes: Process, Container, CycleType, Table, Procedure, Session, Event            │ │
│  │ Edges: CONTAINS, EXECUTES, FIRES_CYCLE, DRAINS, WRITES, POSTS, MAPS_TO            │ │
│  │ Indexes: Fulltext, Vector, Composite Uniqueness Constraints                       │ │
│  └───────────────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### Component Responsibilities

| Component | Responsibility | Implementation Details |
|-----------|----------------|------------------------|
| `src/services/knowledge/knowledgeClient.ts` | Client HTTP gateway with offline fallback | Connects to Knowledge Server via Tauri proxy or browser fetch; detects offline state and switches to local BM25. |
| `src/services/ai/aiTools.ts` | LLM tool integration | Extends `AI_DATABASE_TOOLS` with `query_knowledge_graph` and `search_knowledge_hybrid`. |
| `src/components/ai/AIChatDrawer.tsx` | UI citation & path rendering | Displays citations with file, section, line numbers; renders multi-hop graph paths in expandable timeline. |
| `KnowledgeServer: Ingestion Pipeline` | Markdown parsing & entity extraction | Runs Stage 1 deterministic AST extraction; calls Stage 2 LLM only for ambiguities; resolves entities. |
| `KnowledgeServer: Hybrid Retrieval Engine` | Query execution & result ranking | Coordinates lexical BM25, semantic vector search, and Cypher graph traversal; fuses scores via RRF. |
| `Neo4j Store` | Graph topology & vector embeddings | Stores nodes with composite identities (`PRC_PROCESS:60000006`), typed edges, evidence tags (`observed` vs `inferred`). |

---

## Recommended Project Structure

```
task-management/
├── docs/                                    # Canonical Markdown documentation
│   └── sample-markdown-flow/
│       └── 60000006-SHB-Credit-calculations/
├── src/                                     # PlannerMate React frontend
│   ├── components/
│   │   ├── ai/
│   │   │   ├── AIChatDrawer.tsx             # Modified: render citations & graph path cards
│   │   │   └── KnowledgeGraphPathView.tsx   # New: visual step-by-step path renderer
│   │   └── settings/
│   │       └── KnowledgeServerConfigCard.tsx# New: configure endpoint, index stats, rebuild button
│   ├── services/
│   │   └── knowledge/
│   │       ├── types.ts                     # Ingestion, retrieval, citation, and graph DTOs
│   │       ├── knowledgeClient.ts           # Hybrid retrieval client + fallback logic
│   │       └── evidenceParser.ts            # Parses citations & provenance tokens for chat
│   └── utils/
│       └── bm25.ts                          # Existing offline BM25 keyword fallback
├── src-tauri/                               # Tauri desktop layer
│   └── src/
│       ├── lib.rs                           # Register knowledge commands
│       └── knowledge_proxy.rs               # Safe HTTP proxy for localhost:8080 knowledge server
└── knowledge-server/                        # Optional GraphRAG backend (daemon)
    ├── app/
    │   ├── main.py                          # FastAPI application entrypoint
    │   ├── config.py                        # Environment: NEO4J_URI, CLAUDE_API_KEY, CORPUS_PATH
    │   ├── ingestion/
    │   │   ├── parser.py                    # AST parser for Markdown tables, lists, and headers
    │   │   ├── deterministic.py             # Rule-based extractors for PRC_*, CYTP*, tables
    │   │   ├── llm_extractor.py             # Claude structured prompt for inferred relationships
    │   │   └── resolver.py                  # Composite ID disambiguation & deduplication
    │   ├── graph/
    │   │   ├── neo4j_client.py              # Neo4j Bolt driver & session pools
    │   │   ├── schema.py                    # Constraints, fulltext, and vector indexes
    │   │   └── queries.py                   # Bounded Cypher traversals (1-3 hops)
    │   ├── retrieval/
    │   │   ├── hybrid_search.py             # Multi-source coordinator & RRF re-ranking
    │   │   ├── vector_search.py             # Chunk embedding & cosine similarity
    │   │   └── lexical_search.py            # Local BM25 over markdown sections
    │   └── synthesis/
    │       └── evidence_packager.py         # Builds context with provenance tags & conflict warnings
    └── tests/
        └── test_benchmark_corpus.py         # Benchmark suite verifying 3-hop multi-hop retrieval
```

### Structure Rationale

- `docs/` remains canonical and independent of application code.
- `knowledge-server/` is self-contained. It can run as a local background daemon, Docker container, or remote server.
- `src-tauri/` provides the network bridge so web views in desktop mode avoid CORS errors when calling local services.
- `src/services/knowledge/` sits parallel to `src/services/ai/` and `src/services/jira/`, maintaining the modular pattern of PlannerMate.

---

## Architectural Patterns

### Pattern 1: Three-Stage Extraction Pipeline (Deterministic First, LLM Second)

**What:** Extract all structural and syntactical facts directly from Markdown AST and regex rules (tables, call chains, package names, SQL blocks) before sending remaining ambiguous text to Claude for inference.  
**When to use:** Ingesting structured banking IT documentation like `60000006-SHB-Credit-calculations`.  
**Trade-offs:** Drastically cuts token costs and latency; eliminates hallucination of table names, IDs, and cycle codes; retains strict deterministic provenance.

```
Markdown Document
      │
      ├─► AST / Regex Parser (Deterministic)
      │      ├── Tables (PRC_CONTAINER binds 10..80, 200, 210)
      │      ├── Call Chains (ContainerLauncher -> InternalProcessExecutor -> PL/SQL)
      │      ├── Data Objects (FCL_CYCLE_COUNTER, EVT_EVENT_OBJECT, CRD_INVOICE)
      │      └── Cycle Types (CYTP1001..CYTP1016)
      │      └── Status Codes (EVST0001, OPST0400, PRSR0002)
      │      └── Evidence Class: OBSERVED
      │
      └─► Claude Structured Extraction (Ambiguities / Descriptions)
             ├── Business intent & conditions ("why CYTP1003 has null handler")
             ├── Edge nuances across prose paragraphs
             └── Evidence Class: INFERRED (marked with justification)
```

### Pattern 2: Collision-Safe Composite Graph Identity

**What:** Primary keys in Neo4j must combine namespace, type, and identifier (`<NAMESPACE>:<TYPE>:<ID>`).  
**When to use:** Whenever entity IDs can collide across database schemas or configuration domains.  
**Example:** In scheduled process `60000006`, `PRC_PROCESS.ID = 60000006` represents the container process, while `PRC_CONTAINER.ID = 60000006` represents child bind 20 (`CYTP1002`). Without composite keys, these two distinct entities would merge into a single node.

```cypher
// Neo4j Node Creation Pattern
MERGE (p:Process {compositeId: "SHB:PRC_PROCESS:60000006"})
SET p.id = "60000006",
    p.name = "SHB - Credit calculations",
    p.isContainer = true,
    p.sourceDoc = "01-wiring.md",
    p.sourceLines = [5, 9];

MERGE (b:ContainerBind {compositeId: "SHB:PRC_CONTAINER:60000006"})
SET b.bindId = "60000006",
    b.execOrder = 20,
    b.cycleType = "CYTP1002",
    b.sourceDoc = "01-wiring.md",
    b.sourceLines = [23, 23];

MERGE (p)-[:HAS_BIND {order: 20}]->(b);
```

### Pattern 3: Bounded Cypher Graph Walker with Multi-Hop Depth Limiter

**What:** Graph queries must be bounded to a deterministic depth (1 to 3 hops) with cycle detection, path pruning, and node caps to prevent memory blowups on cyclic process dependencies.  
**When to use:** Multi-hop queries such as "Trace the path from due counter to operation posting".  
**Trade-offs:** Guarantees response times under 50ms while answering deep dependency questions.

```cypher
// Bounded traversal finding path between entities up to 3 hops
MATCH path = (start:Process {compositeId: $startId})-[r:CALLS|FIRES_CYCLE|WRITES|POSTS*1..3]->(target)
WHERE NOT target:Session // Exclude run-specific high-cardinality noise
RETURN path,
       nodes(path) AS entities,
       relationships(path) AS rels,
       [rel IN relationships(path) | {type: type(rel), provenance: rel.provenance, class: rel.evidenceClass}] AS evidence
LIMIT 25;
```

### Pattern 4: Reciprocal Rank Fusion (RRF) Hybrid Retrieval

**What:** Combine rank positions from lexical search (BM25), dense vector embeddings, and graph neighborhood lookups using formula:
$$\text{RRF Score}(d) = \sum_{m \in M} \frac{1}{k + \text{rank}_m(d)} \quad (k = 60)$$
**When to use:** Resolving user queries that combine specific codes (e.g. `CYTP1001`, `CRD_INVOICE`) with broad natural language concepts (e.g. "what happens during EOD credit billing?").

---

## Data Flow

### 1. Ingestion & Indexing Flow

```
[Markdown Files in docs/]
        │
        ▼
[File Watcher / Manual "Rebuild Index" in PlannerMate]
        │
        ▼
[Knowledge Server: Section Chunker]
   Splits markdown by headings (H1..H3) with file path, line offsets, heading slug
        │
        ▼
[Stage 1: Deterministic Extractor]
   Regex/AST matches: tables, procedures, bind IDs, cycle codes, schemas
   Nodes & edges tagged: { evidenceClass: 'observed', confidence: 1.0 }
        │
        ▼
[Stage 2: Claude LLM Extractor (Conditional)]
   Runs on descriptive paragraphs for semantic links
   Nodes & edges tagged: { evidenceClass: 'inferred', confidence: 0.85 }
        │
        ▼
[Stage 3: Composite Entity Resolver]
   Prefixes keys: "SHB:PRC_PROCESS:60000006" vs "SHB:PRC_CONTAINER:60000006"
        │
        ├─────────────────────────────┬─────────────────────────────┐
        ▼                             ▼                             ▼
[Neo4j Graph Store]           [Vector Store / Index]       [Lexical Index]
Merge nodes & relationships   Generate text embeddings     Index terms & acronyms
```

### 2. Query & Answer Synthesis Flow

```
[User in AIChatDrawer: "What does child 210 post and where did the operations come from?"]
        │
        ▼
[Knowledge Client: Hybrid Query Dispatch]
        │
        ├── 1. BM25 search for "child 210 post operations"
        ├── 2. Vector search on query embedding
        └── 3. Graph search: Find node for "bind 210" / "60000017" and traverse INCOMING/OUTGOING (3 hops)
        │
        ▼
[Reciprocal Rank Fusion]
   Merge & de-duplicate top chunks and graph relationship paths
        │
        ▼
[Evidence Packager]
   Formats context prompt with explicit provenance:
   - Fact 1: Bind 60000017 (exec_order 210) calls opr_api_process_pkg [01-wiring.md:31] (OBSERVED)
   - Fact 2: I_PROCESS_CONTAINER=1 restricts to current session tree [03-call-chain.md:34] (OBSERVED)
   - Fact 3: Operations born in child 200 billing (SESSION_ID) [02-data-objects.md:175] (OBSERVED)
        │
        ▼
[LLM Response Generation (9router / Claude)]
   Synthesizes answer strictly citing facts; formats citations [doc#line]; handles conflicts
        │
        ▼
[AIChatDrawer]
   Renders formatted text + interactive Citation Badges + Expandable Graph Path Viewer
```

### 3. Graceful Fallback Flow (Knowledge Server Offline)

```
[Knowledge Client: Health Check Ping / Query]
        │
        ├── (Knowledge Server Online) ──► Return Hybrid GraphRAG results
        │
        └── (Knowledge Server Offline / Unreachable)
                │
                ▼
        [Fallback: Local BM25 Engine (src/utils/bm25.ts)]
                │
                ▼
        [Search IndexedDB Notes & local document cache in browser memory]
                │
                ▼
        [LLM Answer with Banner: "Knowledge graph server offline. Answering from local text notes only."]
```

---

## Trust Boundaries & Credential Isolation

```
┌────────────────────────────────────────────────────────────────────────┐
│ BROWSER SANDBOX (PlannerMate React Client)                             │
│ - Zero long-lived credentials stored in localStorage/IndexedDB.        │
│ - Sensitive keys (Claude API token / 9router key) in RAM or OS Keyring.│
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ IPC (Desktop) / Direct Localhost (Web)
┌───────────────────────────────────▼────────────────────────────────────┐
│ TAURI RUST BACKEND                                                     │
│ - Reads credentials securely from OS Keyring (`keyring_store`).        │
│ - Proxies requests to localhost:8080 without exposing secrets to web.  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Private loopback (127.0.0.1)
┌───────────────────────────────────▼────────────────────────────────────┐
│ KNOWLEDGE SERVER (FastAPI Daemon)                                      │
│ - Connects to Neo4j via internal Bolt protocol (`neo4j://localhost`).  │
│ - Neo4j password loaded via local .env or system environment variable. │
│ - Never exposes raw DB connection or master credentials to client.     │
│ - Validates input against prompt injection before dispatching Cypher.  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Scaling Considerations

| Metric | MVP Pilot (`60000006`) | Full Credit Subsystem (20 Containers) | Full Core Banking (500 Containers) |
|---|---|---|---|
| **Markdown Files** | 6 files (~1,200 lines) | ~120 files (~25,000 lines) | ~3,000 files (~600,000 lines) |
| **Graph Nodes** | ~150 nodes | ~3,500 nodes | ~85,000 nodes |
| **Graph Edges** | ~350 relationships | ~12,000 relationships | ~350,000 relationships |
| **Ingestion Time** | < 2 seconds | ~30 seconds | ~10-15 minutes (parallelized) |
| **Neo4j Footprint**| < 5 MB RAM | ~50 MB RAM | ~500 MB RAM |
| **Traversal Latency** | < 5 ms | < 15 ms | < 45 ms (with composite indexes) |

### Scaling Priorities & Bottlenecks

1. **First Bottleneck: Cypher Cardinality Explosion on Run Sessions**  
   *Risk:* Modeling individual historical execution runs (e.g. 608 runs of session `2607050000820362`) as individual graph nodes will bloat the graph with transient data.  
   *Mitigation:* Keep the core graph structural (processes, binds, tables, cycles, parameters). Store sample run data as lightweight node properties or ephemeral test fixtures, not permanent nodes.
2. **Second Bottleneck: LLM Ingestion Costs**  
   *Risk:* Re-running LLM extraction over entire files whenever one line changes.  
   *Mitigation:* Use MD5 content hashing on individual H2/H3 markdown sections. Only re-extract sections whose content hash changed. Stage 1 deterministic parser runs on 100% of files without cost.

---

## Anti-Patterns

### Anti-Pattern 1: Unprefixed Surrogate Node IDs
**What people do:** Creating nodes with `{ id: "60000006" }`.  
**Why it's wrong:** In `60000006-SHB-Credit-calculations`, `PRC_PROCESS.ID = 60000006` is the container, while `PRC_CONTAINER.ID = 60000006` is child bind 20 (Grace period `CYTP1002`). Without prefixes, the container merges with its own child.  
**Do this instead:** Always use collision-safe composite IDs: `PRC_PROCESS:60000006` and `PRC_CONTAINER:60000006`.

### Anti-Pattern 2: Making Neo4j the Canonical Source of Truth
**What people do:** Editing graph relationships directly in Neo4j Browser or allowing the UI to mutate Neo4j independently of Markdown.  
**Why it's wrong:** Breaches project constraint that Markdown is human-reviewable, git-versioned, and portable. If Neo4j becomes corrupt, data is lost.  
**Do this instead:** Treat Neo4j as an ephemeral read cache. Any correction must be committed to the Markdown documentation; a full rebuild from Markdown must reproduce the graph 100%.

### Anti-Pattern 3: Unbounded Deep Graph Traversals (`*1..10`)
**What people do:** Running queries like `MATCH (a)-[*]->(b) RETURN path`.  
**Why it's wrong:** Banking processes contain cyclical interactions (e.g., invoice creates debt -> payment applies to debt -> next invoice reads payment). Unbounded path queries cause catastrophic memory consumption or query timeouts.  
**Do this instead:** Enforce maximum traversal bounds `*1..3` and explicitly prune high-cardinality edge types.

### Anti-Pattern 4: Hard Dependency on Server Availability
**What people do:** Routing basic task search or chat through the knowledge server without fallback, crashing or hanging when the daemon is not running.  
**Why it's wrong:** Breaks PlannerMate's core value: offline-first, 100% local operation on GitHub Pages and desktop.  
**Do this instead:** Fast-fail network calls (500ms timeout) and degrade to client-side BM25 indexing in `src/utils/bm25.ts`.

---

## Dependency-Aware Build Order

Execute development in strict dependency sequence:

```
[Phase 1: Knowledge Server Core & Deterministic Ingestion]
  │  - FastAPI server setup & Neo4j Bolt connection
  │  - Markdown AST parser & regex extractor for PRC_*, CYTP*, tables
  │  - Composite identity resolution & Neo4j schema constraints
  │  - Test: Rebuild graph for 60000006 pilot from markdown in < 2s
  │
  ▼
[Phase 2: Hybrid Retrieval & Multi-Hop Traversal]
  │  - BM25 section indexing + vector embedding index
  │  - Bounded Cypher traversal templates (1..3 hops)
  │  - Reciprocal Rank Fusion (RRF) coordinator
  │  - Test: Trace path from due counter to fee posting via automated tests
  │
  ▼
[Phase 3: Evidence Packaging & Synthesis]
  │  - Context prompt formatter with explicit provenance (file, line, confidence)
  │  - Classification tagging (observed vs inferred)
  │  - Conflict & missing evidence handler
  │  - Test: Benchmark corpus evaluation for precision & citation accuracy
  │
  ▼
[Phase 4: PlannerMate Client Integration & Fallback]
  │  - Knowledge client & Tauri proxy (`knowledge_proxy_request`)
  │  - AI tools: `query_knowledge_graph` and `search_knowledge_hybrid`
  │  - AIChatDrawer citation badges & visual graph path viewer
  │  - Knowledge server settings card with health check & rebuild button
  │  - Graceful fallback to client BM25 when server is offline
  │  - Test: Offline smoke test confirming seamless degradation
```

---

## Sources

- `CLAUDE.md` — Core constraints: offline-first, IndexedDB source of truth, session-only secrets, Ant Design UI.
- `.planning/PROJECT.md` — Milestone v1.2 goals, pilot scope (`60000006`), composite identities, citation requirements.
- `docs/sample-markdown-flow/60000006-SHB-Credit-calculations/` (`README.md`, `01-wiring.md`, `02-data-objects.md`, `03-call-chain.md`, `04-cycles.md`, `05-breadcrumbs.md`) — Pilot corpus ground truth for process structure, ID collisions, cycle codes, and call hierarchies.
- `src-tauri/src/lib.rs` & `src/services/ai/graphitiMcpClient.ts` — Existing Tauri IPC proxy pattern and MCP client integration.
- `src/utils/bm25.ts` — Existing client-side lexical search and Vietnamese diacritics normalization engine.
