# Feature Research

**Domain:** Hybrid GraphRAG Knowledge Assistant (Scheduled Process 60000006 Pilot)
**Researched:** 2026-10-07
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = system feels incomplete, untrustworthy, or broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Publish/Index Markdown to Knowledge Server | App docs live locally; server needs normalized content for graph/vector ingestion without corrupting local files | MEDIUM | HTTP PUT/POST endpoint sends file path + markdown content + SHA256; server parses sections, updates vector index + graph; Markdown in repo remains canonical source of truth |
| Citation-Grounded Answer Generation | Enterprise technical assistant cannot hallucinate; answers without file/section pointers are unverifiable | MEDIUM | Every factual assertion cites source file (e.g., `01-wiring.md`), heading/section (`## Process parameters`), and line range or snippet anchor; AI assistant displays clickable citations |
| Controlled KG Entity & Relationship Extraction | Graph traversal requires structured nodes and edges, not vague unstructured text blobs | HIGH | Deterministic/controlled extraction using canonical schema: `Process`, `Container`, `CycleType`, `Table`, `Package`, `Session`, `RuleSet`. Composite keys prevent collisions (e.g., `PRC_PROCESS:60000006` vs `PRC_CONTAINER:60000006`) |
| Process & Call-Chain Querying | Primary user need: understand execution ordering, hierarchy, parameters, and invocation paths | MEDIUM | Answers questions like "What runs in container 60000006?", "In what order?", "What parameters are overridden?"; traverses `HAS_CHILD`, `EXECUTES_ORDER`, `CALLS`, `BINDS_PARAM` |
| Bounded Multi-Hop Impact Analysis (>= 3 hops) | Core value of GraphRAG over flat RAG: trace upstream triggers to downstream side-effects across 3+ hops | HIGH | Traverse paths: `PRC_CONTAINER (60000006)` -> `exec_order 70 (CYTP1001)` -> `registers EVT_EVENT_OBJECT` -> `drained by CRD_PRC_BILLING_PKG` -> `inserts CRD_INVOICE` -> `spawns OPR_OPERATION (OPTP0119)` -> `posted by child 210`. Traversals hard-bounded to max depth (3-5 hops) to prevent graph explosion |
| Explicit Abstention on Missing Evidence | In banking IT operations, guessing causes production outages; system must say "Information not found in corpus" | LOW | Prompting + post-retrieval threshold: if retrieval scores below cutoff or graph path empty, return explicit abstention stating what is missing rather than fabricating answers |
| Offline Graceful Degradation | Core constraint in PROJECT.md: PlannerMate is a local-first PWA; knowledge server is optional | LOW | If knowledge server offline/unreachable, AI drawer falls back to local BM25 search over IndexedDB docs with UI badge "Knowledge Server Offline — Local Search Only" |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but provide high operational leverage for banking system analysis.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Conflict & Ambiguity Detection | Resolves real-world contradictions in corpus (e.g., 2024 unconstrained volume vs 2025/2026 `IVN_OBJECT` filter; parent `PROCESSED=0` vs child counts) | MEDIUM | Assistant detects diverging facts across sections/dates, tags them as "Historical / Unconstrained" vs "Current Filtered State", and presents both with context |
| Evidence Classification (Observed vs Inferred vs Approved) | Strict regulatory/engineering boundary: distinguishes facts backed by decompiled bytecode / SQL from inferred architectural deductions | MEDIUM | Extracted facts and graph edges tag `evidence_class`: `OBSERVED` (bytecode, SQL, live session log), `INFERRED` (deduced logic without direct bytecode line), or `APPROVED` (signed off by domain owner) |
| Visual Graph Path Subgraph Display | Visualizing the dependency path builds immediate trust and explains multi-hop reasoning faster than dense text | MEDIUM | Returns compact graph path payload (nodes + edges) alongside text response; AI Chat Drawer renders lightweight Ant Design / SVG flow diagram showing traversal steps |
| Disambiguation of Colliding Identifiers | Prevents severe confusion between identical ID values in different database catalogs | LOW | System-level prompt and entity resolver automatically disambiguates `PRC_PROCESS.ID=60000006` (the container process) from `PRC_CONTAINER.ID=60000006` (bind of child 20 `CYTP1002`) |
| Incremental Delta Indexing | Fast re-indexing when user updates a single markdown file in docs workspace without re-parsing entire corpus | MEDIUM | Uses file content hash (SHA-256) per document; only re-extracts and updates graph entities and vector chunks for changed markdown files/sections |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems. Explicitly rejected for this milestone.

| Anti-Feature | Why Requested | Why Problematic | Alternative |
|--------------|---------------|-----------------|-------------|
| Autonomous / Open-Ended LLM Graph Extraction | "Let LLM freely extract all entities and predicates" | Produces noisy schema, predicate synonym explosion (`runs`, `executes`, `triggers`, `launches`), breaks deterministic Cypher traversal | Controlled schema with fixed node types (`Process`, `Container`, `Cycle`, `Table`, `Package`) and canonical relationship types (`EXECUTES`, `CALLS`, `WRITES`, `DRAINS`) |
| Full Live DB Connection / Direct Production SQL Execution | "Query live Oracle DB directly for real-time state" | Breaches personal offline-first constraints, security boundaries, read-replica locks, credential management | Markdown documentation + diagnostic logs remain authoritative canonical source; ingest snapshots via docs |
| Global Real-Time Bi-Directional Graph Sync | "Edit graph visually and write back to Markdown automatically" | High conflict surface, cyclic sync bugs, corrupts human-authored markdown docs | Markdown is strictly unidirectional canonical source: Markdown -> Server Parse -> Vector/Graph Rebuild |
| Generic Unconstrained Multi-Hop Traversal (Unlimited Hops) | "Find all connections between any two entities" | Exponential branching in dense relational graphs; latency timeouts; noisy irrelevant context stuffing | Bounded paths (depth 1 to 4 max), typed relationship whitelisting, center-node ego-network queries |
| Storing Sensitive Banking Data (PAN, CVV, PII) in Graph/Embeddings | "Need real customer examples for realistic testing" | Massive compliance/security breach (PCI-DSS); violates PROJECT.md constraints | Strictly scrubbed synthetic or surrogate accounts/invoices in pilot corpus; zero PAN/CVV/PIN or HSM keys |

## Feature Dependencies

```
[Markdown Canonical Source]
    └──requires──> [Publish/Sync Endpoint]
                       └──requires──> [Markdown Section Chunker & Normalizer]
                                          ├──feeds──> [Vector & Keyword Hybrid Index]
                                          └──feeds──> [Controlled Schema Graph Extractor]
                                                          └──requires──> [Collision-Safe Entity Resolver]
                                                                             └──feeds──> [Neo4j Graph Store]

[Neo4j Graph Store] + [Vector & Keyword Hybrid Index]
    └──requires──> [Hybrid Retrieval & Bounded Path Traverser]
                       └──requires──> [Citation & Evidence Classifier (Observed/Inferred)]
                                          └──feeds──> [AI Assistant Chat Drawer]
                                                          ├──enhances──> [Visual Path Subgraph Display]
                                                          └──requires──> [Abstention & Conflict Handler]

[Knowledge Server Health Check]
    └──triggers──> [Offline Local Fallback (IndexedDB BM25)]
```

### Dependency Notes

- **[Controlled Schema Graph Extractor] requires [Collision-Safe Entity Resolver]:** Extraction cannot create bare IDs like `60000006`. It must qualify IDs into composite keys (`PRC_PROCESS:60000006` vs `PRC_CONTAINER:60000006`) before writing to Neo4j.
- **[Hybrid Retrieval & Bounded Path Traverser] requires both [Neo4j Graph Store] and [Vector & Keyword Hybrid Index]:** Hybrid retrieval queries vector similarity for entry entities/chunks, then expands 1-3 hops via Cypher in Neo4j, then re-ranks combined context.
- **[Citation & Evidence Classifier] requires [Markdown Section Chunker & Normalizer]:** Citations must point to exact document relative paths and section headers preserved during ingestion.
- **[Offline Local Fallback] triggers on [Knowledge Server Health Check]:** When server ping fails or times out, UI seamlessly shifts query to existing local Dexie/IndexedDB BM25 index.

## MVP Definition

### Launch With (v1.2 MVP)

Minimum viable product — what is needed to validate scheduled process 60000006 GraphRAG assistance.

- [ ] HTTP endpoint on knowledge server to publish/index Markdown flow docs (`docs/sample-markdown-flow/60000006-SHB-Credit-calculations/`).
- [ ] Controlled entity extraction into Neo4j for 7 pilot entity types (`Process`, `Container`, `CycleType`, `Table`, `Package`, `Session`, `RuleSet`) and 8 relationship types (`HAS_CHILD`, `BINDS_PARAM`, `CALLS`, `REGISTERS_EVENT`, `DRAINS_EVENT`, `WRITES_TABLE`, `READS_TABLE`, `POSTS_OP`).
- [ ] Collision-safe ID prefixing (`PRC_PROCESS:60000006` vs `PRC_CONTAINER:60000006`).
- [ ] Hybrid retrieval pipeline: keyword/vector search to find entry points + bounded Cypher traversal (max 3-4 hops).
- [ ] Citation-grounded answer generation in existing AI Chat Drawer with source file links and section anchors.
- [ ] Explicit missing-evidence abstention ("Corpus contains no record of X").
- [ ] Evidence tagging: distinguish `OBSERVED` facts (code/SQL/logs) from `INFERRED` facts.
- [ ] Conflict detection for volume/filter differences (2024 unconstrained vs post-2025 `IVN_OBJECT` filter).
- [ ] UI status indicator for knowledge server connectivity with graceful fallback to offline local search.
- [ ] Benchmark test suite verifying retrieval, call chain, and 3-hop impact queries.

### Add After Validation (v1.3)

Features to add once core pilot is verified.

- [ ] Visual graph path rendering (SVG/Ant Design graph flow) in AI Chat Drawer.
- [ ] Incremental per-file delta sync using SHA-256 hashes without full graph wipe.
- [ ] Ingestion of sibling scheduled processes (`60000004` global op drain, `60000024` Event Notification, `70000001` EOD parent).

### Future Consideration (v2+)

Features to defer until multi-process architecture is mature.

- [ ] Full card-system enterprise catalogue ingestion across hundreds of jobs.
- [ ] Interactive graph canvas workspace with drag-and-drop relationship exploration.
- [ ] Automatic code decompilation pipeline ingestion from raw EAR/WAR/JAR binaries.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Citation-Grounded Answer Generation | HIGH | MEDIUM | P1 |
| Controlled Schema Neo4j Extraction | HIGH | HIGH | P1 |
| Bounded 3-Hop Traversal (Call Chain & Impact) | HIGH | MEDIUM | P1 |
| Collision-Safe Identity Resolution | HIGH | LOW | P1 |
| Explicit Missing-Evidence Abstention | HIGH | LOW | P1 |
| Offline Graceful Degradation (Local Fallback) | HIGH | LOW | P1 |
| Markdown Publish / Index Endpoint | HIGH | MEDIUM | P1 |
| Benchmark Verification Suite | HIGH | MEDIUM | P1 |
| Evidence Classification (Observed vs Inferred) | MEDIUM | MEDIUM | P2 |
| Conflict & Ambiguity Detection (Filter Changes) | MEDIUM | MEDIUM | P2 |
| Visual Graph Path Subgraph Display | MEDIUM | MEDIUM | P2 |
| Incremental Delta Hashing | MEDIUM | MEDIUM | P2 |
| Sibling Job Ingestion (60000004, 60000024) | MEDIUM | HIGH | P3 |
| Interactive Graph Canvas UI | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for v1.2 pilot milestone
- P2: Polish and differentiators to include during v1.2 execution
- P3: Post-pilot future expansion

## Domain Competitor / Pattern Analysis

| Capability | Generic Vector RAG (LangChain / LlamaIndex naive) | Unstructured GraphRAG (Microsoft GraphRAG default) | PlannerMate Hybrid GraphRAG |
|------------|---------------------------------------------------|-----------------------------------------------------|-----------------------------|
| Multi-Hop Execution Tracing | Fails; chunks lose ordering across 5 files; cannot trace step 10 to 200 to 210 | High cost; creates loose entity summaries without exact schema constraints | Exact Cypher traversal on `EXECUTES_ORDER` and `CALLS` edges with 100% path precision |
| ID Collision Handling | Fails completely; mixes `60000006` container with `60000006` bind | Inconsistent; depends on LLM entity resolution prompt | Hard schema namespacing (`PRC_PROCESS:60000006` vs `PRC_CONTAINER:60000006`) |
| Hallucination & Evidence Provenance | High risk; synthesizes plausibly sounding parameters | Moderate risk; relies on community summaries | Strict citation with line anchors + explicit missing-evidence abstention |
| Offline & Runtime Architecture | Requires cloud API / backend always | Requires heavy server infrastructure and massive LLM extraction compute | Local-first PWA intact; server is optional helper; offline local BM25 fallback |
| Ground Truth Authority | Vector DB is opaque index | Graph DB is primary truth | Local Markdown files remain 100% canonical source of truth; graph is ephemeral/rebuildable |

## Sources

- `docs/sample-markdown-flow/60000006-SHB-Credit-calculations/README.md` — Core architecture, container 60000006 child breakdown, ID collision definition.
- `docs/sample-markdown-flow/60000006-SHB-Credit-calculations/01-wiring.md` — Parameter bindings, `PRC_*` schema, cycle types, sibling jobs, `IVN_OBJECT` filter.
- `docs/sample-markdown-flow/60000006-SHB-Credit-calculations/02-data-objects.md` — Data objects, layer diagram, ID mapping, table grain and mutation patterns.
- `docs/sample-markdown-flow/60000006-SHB-Credit-calculations/03-call-chain.md` — Call chain, scheduler to JDBC to switch to billing to ops posting, PL/SQL package bodies.
- `docs/sample-markdown-flow/60000006-SHB-Credit-calculations/04-cycles.md` — Cycle order rationale, dispatch logic, historical volume vs filtered volume differences.
- `docs/sample-markdown-flow/60000006-SHB-Credit-calculations/05-breadcrumbs.md` — Diagnostic queries, `trc_log` patterns, result codes, sibling disambiguation.
- `.planning/PROJECT.md` — v1.2 milestone goals, offline-first constraints, canonical Markdown requirement, sensitive data exclusion rules.

---
*Feature research for: Hybrid GraphRAG Knowledge Assistant (Scheduled Process 60000006 Pilot)*
*Researched: 2026-10-07*
