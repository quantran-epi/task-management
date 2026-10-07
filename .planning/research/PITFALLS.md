# Pitfalls Research: Hybrid GraphRAG Knowledge Assistant MVP

**Domain:** Technical Banking IT System Documentation & Local-First Hybrid GraphRAG
**Researched:** 2026-10-07
**Confidence:** HIGH (verified against pilot corpus `docs/sample-markdown-flow/60000006-SHB-Credit-calculations/`, existing PlannerMate architecture, and GraphRAG/Neo4j production patterns)

## Critical Pitfalls

### Pitfall 1: Entity Resolution & Namespace Collision (`PRC_PROCESS` vs `PRC_CONTAINER`)

**What goes wrong:**
Graph builder merges nodes sharing numeric identifier `60000006`. Container process `60000006` (*SHB - Credit calculations*) conflated with container bind `60000006` (exec order 20, binding child process `10000304` *Switch cycle* for `CYTP1002` Grace period length). Graph traversal links child binds to container bind instead of container process, corrupting call-chain execution order and dependency analysis.

**Why it happens:**
Naive entity extraction treats raw numeric strings or regex `\b\d{8}\b` as global primary keys across relational tables. Relational database uses table-scoped surrogate sequences where `PRC_PROCESS.ID = 60000006` and `PRC_CONTAINER.ID = 60000006` represent completely different architectural entities.

**How to avoid:**
Enforce composite URN identifiers at ingestion boundary:
- Format: `urn:bpc:entity:<table_name>:<id>` (e.g., `urn:bpc:entity:prc_process:60000006` vs `urn:bpc:entity:prc_container:60000006`).
- Define distinct node labels in Neo4j schema: `:Process`, `:ContainerBind`, `:ProcessSession`, `:CycleType`, `:DatabaseObject`.
- Require explicit relation `(:Process {id: '60000006'})-[:HAS_BIND]->(:ContainerBind {id: '60000006', exec_order: 20})`.

**Warning signs:**
- Self-referencing loops in graph query results where container points to itself as child.
- Queries for process 60000006 returning cycle type `CYTP1002` as top-level process attribute rather than child bind attribute.
- Graph node count for IDs matching `60000006` equals 1 instead of 2.

**Phase to address:**
Phase 15 (Graph Schema & Ontology Ingestion).

---

### Pitfall 2: Epistemological Collapse (Conflating Observed Facts with Inferred Rationale)

**What goes wrong:**
LLM extracts deduced architectural rationales as verified source-code facts. For example, pilot note states "Order gap 80 -> 200 is intentional: all cycle events land before billing drains them". LLM marks this ordering intent as verified PL/SQL logic rather than reverse-engineered operational inference. Downstream auditing rejects system outputs for presenting assumptions as verified implementation truth.

**Why it happens:**
Markdown technical notes combine decompiled bytecode (CFR 0.152), Oracle data dictionary (`USER_SOURCE`, `ALL_TAB_COLUMNS`), SQL audit queries, and reverse-engineer commentary without explicit separation in unstructured text. Single-prompt extraction flattens epistemic status.

**How to avoid:**
Implement strict epistemic labeling in graph schema and chunk metadata:
- Attribute `evidence_type`: `OBSERVED_CODE` (CFR bytecode / `USER_SOURCE`), `OBSERVED_DATA` (table query / session snapshot), `OPERATIONAL_INFERENCE` (reverse-engineered deduction), or `BUSINESS_DOCUMENTATION`.
- LLM extraction prompt must enforce dual extraction channels:
  1. Structural assertions: direct mappings (package name, bind order, parameter values, table names).
  2. Inferred rationale: labeled with `confidence: LOW` and `epistemic_status: INFERRED`.
- Response synthesizer must disclaim inferred edges in answers: prefix explanations with "Inferred from configuration order: ..." unless backed by `USER_SOURCE` comments.

**Warning signs:**
- Assistant answers claiming "The PL/SQL package contains code verifying gap 80 to 200" when the gap is purely config in `PRC_CONTAINER`.
- Citations linking reverse-engineering commentary to source line numbers in `USER_SOURCE`.

**Phase to address:**
Phase 14 (Markdown Parsing & Extraction Pipeline) and Phase 17 (Grounded Response Synthesis).

---

### Pitfall 3: Syntax-Destructive Chunking (Slicing Markdown Tables & ASCII Call Chains)

**What goes wrong:**
Fixed-token sliding-window chunkers (e.g., 512 tokens with 50-token overlap) cut through middle of Markdown tables in `01-wiring.md` / `04-cycles.md` or split ASCII tree diagrams in `03-call-chain.md`. Split table loses header row; split ASCII diagram turns into unparseable character fragments. Embeddings generate low-similarity vectors; entity extractors produce malformed triplets or fail silently.

**Why it happens:**
Standard RAG frameworks apply character-count or token-count chunking without structural awareness of Markdown AST.

**How to avoid:**
Use AST-aware semantic chunking:
- Parse documents into AST (via `remark` or `unified` parser).
- Keep semantic units atomic:
  - Code blocks (` ``` `) and ASCII call-chain diagrams are never split.
  - Markdown tables are kept intact with headers preserved; if table exceeds chunk budget, replicate table header on sub-chunks or treat table as distinct data node.
  - Heading sections (H1/H2/H3) define primary chunk boundaries.
- Attach breadcrumb metadata to every chunk: `file_path`, `heading_hierarchy`, `line_start`, `line_end`.

**Warning signs:**
- Chunks starting with `|---|---|---|` or orphaned table rows missing column definitions.
- Truncated ASCII lines (e.g., `ContainerLauncher.launch()` isolated from child `InternalProcessExecutor.execute()`).
- Retrieval queries for child binds 60000012 or 60000110 returning incomplete parameter tables.

**Phase to address:**
Phase 14 (Markdown Parsing & Ingestion).

---

### Pitfall 4: Unbounded Multi-Hop Traversal on High-Degree Hub Nodes

**What goes wrong:**
Graph traversal for multi-hop queries (e.g., "Find all dependencies impacted by `FCL_PRC_CYCLE_COUNTER_PKG`") hits generic hub nodes like `ENTTACCT` (account entity), `CYDT0001` (date type), `IS_PARALLEL=1`, or status `PRSR0002`. Neo4j executes variable-length path expansion `(n)-[*1..4]-(m)`, traversing tens of thousands of edges, causing query timeout (30s+), out-of-memory errors, and hallucinated relevance.

**Why it happens:**
Ontology treats generic system enum codes, entity types, and common flags as first-class entity nodes without relationship directionality or type-filtering during Cypher generation.

**How to avoid:**
- Model high-cardinality enums and primitive types as node properties, not graph nodes (e.g., `date_type: 'CYDT0001'` stored on edge or bind node, not as independent `:DateType` node).
- If modeled as nodes, classify them as `:Taxonomy` / `:Dictionary` and exclude them from open multi-hop graph traversals.
- Bound Cypher traversal patterns:
  - Limit path length: `[*1..3]`.
  - Filter edge labels explicitly: `[:CONTAINS_BIND|CALLS_PACKAGE|SUBSCRIBES_TO|WRITES_TABLE*1..3]`.
  - Cap query results with `LIMIT 50`.
  - Set transaction timeout on Neo4j driver (e.g., 5000ms).

**Warning signs:**
- Cypher queries running longer than 500ms on a tiny pilot corpus.
- Traversal jumping from process 60000006 to unrelated process 60000024 simply because both reference dictionary code `CYTP1001` or entity type `ENTTACCT`.

**Phase to address:**
Phase 15 (Graph Schema Design) and Phase 16 (Graph Retrieval & Cypher Tooling).

---

### Pitfall 5: Hard-Coupled Optional-Server Integration (Breaking Local-First Offline PWA)

**What goes wrong:**
Adding Neo4j and backend GraphRAG server introduces mandatory network calls into PlannerMate's frontend. When user is offline, on GitHub Pages without local server running, or working in airplane mode, task management, document browsing, or existing AI chat drawer fails with unhandled fetch errors, blank screens, or blocked UI interactions.

**Why it happens:**
Developer assumes backend knowledge server is always-on infrastructure rather than an optional enhancement to a local-first static PWA.

**How to avoid:**
Maintain strict architectural decoupling:
- Local IndexedDB (Dexie) remains canonical application store.
- Knowledge server is purely optional (`KnowledgeServerClient` with health-check ping and circuit breaker).
- Graceful degradation contract:
  - If server online (`http://127.0.0.1:8787/health` responds OK): enable Hybrid GraphRAG mode in AI Drawer with graph badge.
  - If server offline / unreachable: degrade seamlessly to local keyword/regex search over IndexedDB Markdown notes; display subtle "Knowledge Server Offline — using local notes" indicator; never block task planning or document editing.
- Knowledge server operations must run asynchronously and never block React UI main thread.

**Warning signs:**
- Frontend throwing uncaught `TypeError: Failed to fetch` when server is down.
- PWA Lighthouse offline audit failing after milestone changes.
- UI spinners hanging indefinitely on AI Drawer open when backend port 8787 is closed.

**Phase to address:**
Phase 14 (Optional Knowledge Server Protocol & Client Architecture).

---

### Pitfall 6: Lexical Drowning & Identifier Washout in Vector Retrieval

**What goes wrong:**
User queries specific technical identifier: "What does bind 60000017 do?" or "Which process produces OPST0400?". Dense vector retrieval (embeddings) ranks general descriptive sections ("Overview of batch processing", "General call chain") higher than the exact line containing `60000017` or `OPST0400` because embedding models blur fine-grained alphanumeric tokens into general semantic neighborhood.

**Why it happens:**
BPE tokenizers split technical tokens (e.g., `CYTP1002`, `2607050000820362`, `PRSR0004`, `FETP1003`) into multiple subwords, dispersing semantic mass. Cosine similarity favors generic descriptive prose over dense tabular identifiers.

**How to avoid:**
Implement true Hybrid Retrieval with Reciprocal Rank Fusion (RRF):
1. Sparse lexical index (BM25 or Lucene / Neo4j fulltext) with exact token indexing on identifiers (`CYTP*`, `PRSR*`, numeric IDs, procedure names).
2. Dense semantic index (vector search) for concept queries ("how do statements get generated?", "interest calculation failure modes").
3. Direct Graph entity lookup: regex extractor detects recognized patterns (`\b60\d{6}\b`, `CYTP\d{4}`) and queries Neo4j exact primary keys first.
4. RRF merge formula: `Score(d) = sum(1 / (k + rank_i(d)))` with `k = 60`. Give boost to exact entity matches.

**Warning signs:**
- Queries containing exact bind IDs (`60000017`) returning chunks for bind `60000006` or `60000012` before `60000017`.
- Searching for `OPST0100` returning `01-wiring.md` overview instead of `02-data-objects.md` operations section.

**Phase to address:**
Phase 16 (Hybrid Search & RRF Ranking).

---

### Pitfall 7: Temporal & Filter Blindness Across Corpus Runs

**What goes wrong:**
Assistant combines run statistics from disparate historical runs without temporal context. For instance, asserting: "Process 60000006 processes 123,963 events in 13 seconds". In reality:
- Fat run 2024-06-18: 123,963 events, ran ~54 minutes, before `IVN_OBJECT` filter was introduced.
- Live run 2026-08-11: 8 events, ran 13 seconds, with `IVN_OBJECT` filter active (`HUYENLE` predicate added after 2025-03-24).
Answers give contradictory operational advice and incorrect performance profiles.

**Why it happens:**
Markdown documents contain multiple historical snapshots (`01-wiring.md` lines 210–245 vs `04-cycles.md` lines 62–84). Without temporal tagging, graph links all runs into a single unversioned summary.

**How to avoid:**
- Model execution sessions as distinct temporal instances: `(:RunSession {id: '2607050000820362', date: '2026-08-11', duration_s: 13, processed: 8})` and `(:RunSession {id: '2407050000076621', date: '2024-06-18', duration_m: 54, processed: 123963})`.
- Attach filter regime attribute: `has_ivn_object_filter: true` for post-2025-03 runs.
- Extraction rules must tag metrics with their parent session ID and timestamp.
- Prompts must instruct synthesizer: "When answering volume or duration queries, specify the session run date and state whether the `IVN_OBJECT` filter applied".

**Warning signs:**
- Answers quoting 120,000+ event volumes for recent production questions.
- Hallucinated claim that modern runs process all 35,138 due cycle counters instead of the 3 filtered counters.

**Phase to address:**
Phase 15 (Graph Schema Ingestion) and Phase 17 (Grounded Prompting).

---

### Pitfall 8: Coarse-Grained Citation & Source Hallucination

**What goes wrong:**
Assistant provides high-level answers with generic citations like `[Source: 01-wiring.md]`. User cannot verify specific claims. Worse, assistant hallucinates line numbers or attributes PL/SQL logic to Java classes (e.g., claiming `InternalProcessExecutor` calculates interest rates).

**Why it happens:**
Chunk metadata only records file name; LLM generates citations from memory rather than passing explicit chunk ID and line spans through retrieval context.

**How to avoid:**
- Retain exact line offsets in chunk metadata: `{file: "03-call-chain.md", start_line: 102, end_line: 131, section: "process (Credits calculation)"}`.
- Enforce structured context injection: each context block tagged with unique anchor `[ref:03-call-chain.md:L102-L131]`.
- System prompt rule: "Every factual claim must cite exact `[ref:...]` tag. Claims without citation will be rejected."
- Post-processing validator parses citations in LLM output, verifies that referenced line spans actually contain claimed entities, and strips unverifiable citations.

**Warning signs:**
- Citations pointing to non-existent sections or line numbers past end of file.
- Statements about `CRD_INVOICE_PKG` cited to `05-breadcrumbs.md` instead of `03-call-chain.md` or `02-data-objects.md`.

**Phase to address:**
Phase 17 (Citations & Evidence Verification).

---

### Pitfall 9: Sensitive Financial & Cardholder Data Leakage

**What goes wrong:**
Ingesting card system notes inadvertently captures real Primary Account Numbers (PAN), CVVs, PIN blocks, customer names, or production database credentials into local Markdown, knowledge server logs, or sends them in plain text prompts to external LLM APIs (e.g., 9router/OpenAI/Anthropic).

**Why it happens:**
Developers copy production log snippets or raw SQL query dumps (`05-breadcrumbs.md`) into Markdown documentation without pre-commit scrubbing.

**How to avoid:**
- Implement pre-ingestion DLP scanner on Knowledge Server:
  - Regex checks for Luhn-valid 16-digit card numbers, 3-4 digit CVVs, and database connection strings with passwords (`jdbc:oracle:thin:...`).
  - Pilot corpus verification: verify sample IDs (`700001980854`, `5350252`) are synthetic test accounts or masked account IDs, never raw PANs.
- Never store DB credentials or API keys in `.env` files checked into git or in knowledge graph attributes.
- Local scrubbing middleware replaces detected card patterns with `[MASKED_PAN]` before vector indexing or LLM API dispatch.

**Warning signs:**
- Ingestion logs displaying strings matching `^4[0-9]{12}(?:[0-9]{3})?$` or `^5[1-5][0-9]{14}$`.
- Database connection strings containing cleartext passwords appearing in `00-sources.md` or breadcrumbs.

**Phase to address:**
Phase 14 (Ingestion Pipeline Security Gate) and Phase 18 (Security Audit & Benchmark).

---

### Pitfall 10: Shallow 1-Hop Evaluation Failing Multi-Hop Operational Reality

**What goes wrong:**
Evaluation benchmark tests only simple 1-hop lookups ("What is the procedure name for process 10000304?", "What does CYTP1002 stand for?"). Benchmark achieves 95% pass rate. In production, users ask 3-hop operational diagnostic questions: "If Switch cycle for CYTP1001 fails on step 70, will child 210 still post penalty operations?" The system fails completely because multi-hop reasoning, event queuing dependencies, and session tree filters were never tested.

**Why it happens:**
Evaluating GraphRAG with automated synthetic QA generators that produce trivial factoid pairs rather than multi-hop topological questions.

**How to avoid:**
Curate ground-truth benchmark suite specifically covering multi-hop pilot relationships:
1. Call chain traversals (Container 60000006 -> Bind 60000017 -> Process 10000303 -> `I_PROCESS_CONTAINER=1` -> Filters ops by container session tree).
2. Data lifecycle hops (Counter `CYTP1001` -> Event `EVT_EVENT_OBJECT` `EVST0001` -> Billing Drain -> Invoice `CRD_INVOICE` -> Re-planted counters `CYTP1002`).
3. Failure impact queries (`STOP_ON_FATAL` on bind 80 vs binds 10-70).
4. Sibling disambiguation (Difference between process 60000004 global drain vs bind 60000017 tree-local drain).
Require minimum 3-hop benchmark pass rate >= 85% before release.

**Warning signs:**
- Test suite passing 100% on questions answered by vector search alone without touching Neo4j.
- Evaluation queries lacking graph path validation in expected answers.

**Phase to address:**
Phase 18 (Benchmark Corpus & Multi-Hop Evaluation).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Regex string chunking without Markdown AST parser | Fast implementation in few lines of JS | Breaks tables, diagrams, and splits code blocks | Never. Markdown AST parser (`unified`/`remark`) is fast and native. |
| Storing graph nodes with raw numeric IDs | Simpler Cypher queries | Fatal namespace collisions between `PRC_PROCESS` and `PRC_CONTAINER` | Never. Composite IDs required from day 1. |
| In-memory naive vector search without sparse BM25 | Skips setting up hybrid index | Alphanumeric DB identifiers (`CYTP1002`, `OPST0100`) lost in vector space | MVP demo only; unacceptable for release. |
| Single prompt extracting graph and text summary together | Fewer LLM calls | High hallucination rate, drops parameter details | Never. Separate structural extraction from inference. |
| Hardcoding `localhost:8787` in frontend client | Zero config UI | Fails when server runs in Docker, custom ports, or static host | MVP dev only; require configurable base URL with fallback. |
| Storing full Markdown chunks in Neo4j node properties | Avoids secondary document store | Graph database bloat, slow graph traversals, high memory footprint | Acceptable for small pilot corpus (<1MB); migrate to content hash pointers later. |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Neo4j Cypher Traversal | Using undirected paths `(a)--(b)` in queries | Specify explicit direction and labels: `(a:Process)-[:HAS_BIND]->(b:ContainerBind)` to prevent cyclical explosions. |
| 9router / Remote LLM API | Sending unbounded graph dumps into context | Bounded graph serialization: convert only subgraph paths within k-hops to formatted markdown tables or indented trees. |
| Browser PWA / Knowledge Server | Making knowledge server synchronous dependency | Use `AbortController` with 3-second timeout; fallback to IndexedDB local cache if fetch rejects. |
| Markdown Ingestion / Git Sync | Ingesting unparsed raw git diffs | Ingest canonical normalized markdown files; re-index on file content hash change. |
| Dexie / IndexedDB Integration | Storing Neo4j graph data inside IndexedDB directly | IndexedDB holds user documents and metadata; Neo4j server handles graph topologies. Don't build ad-hoc graph engine in Dexie. |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Cypher Cartesian Product on Unbound Multi-hop | Query freeze, 100% CPU on Neo4j | Always bind start node with index lookup; constrain hop depth `[*1..3]`; avoid unbound `MATCH (a), (b)`. | At >500 nodes or paths with branching factor >5. |
| Full-text Vector Embedding Batching | Ingestion script rate-limited or OOM | Batch chunk embeddings in chunks of 16-32 with exponential backoff. | At >100 document chunks. |
| Frontend RRF Ranking Calculation | UI jank/lag during search result display | Perform reciprocal rank fusion on knowledge server before returning JSON to frontend. | At >50 candidate search results. |
| Large AST Parse on Every Keystroke | Text input latency in Markdown editor | Debounce AST parsing and indexing (minimum 2000ms idle or explicit save action). | In documents >1,000 lines. |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Ingesting production PAN / account data | PCI-DSS violation, severe data leak | Regex-based DLP filter before indexing; enforce masking `700001980854` -> `7000****0854` if treated as PAN. |
| Hardcoding Knowledge Server API tokens in Vite build | Token visible in GitHub Pages static bundle | Session-only token in browser memory or local proxy without credentials for local-only server. |
| Prompt Injection via Markdown Comments | Malicious instructions in ingested documents override system prompt | Wrap retrieved context in strict XML boundary tags (`<context>...</context>`); instruct LLM to treat context as passive data only. |
| Exposing Oracle DB connection strings in sample SQL | Unauthorized network access if credentials valid | Scrub DB connection strings from `00-sources.md` / `05-breadcrumbs.md`; substitute dummy hostnames (`main1.internal`). |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Silent Server Disconnection | User asks technical question, gets generic ungrounded hallucination without warning | Clear badge in AI Chat Drawer: "Knowledge Server: Connected (GraphRAG active)" vs "Knowledge Server: Offline (Local notes only)". |
| Unformatted Cypher Path Dumps | User presented with raw JSON graph structures | Render call-chain paths as visual sequence cards or clean step lists (e.g., `Container 60000006 -> Bind 10 -> Switch Cycle (CYTP1003)`). |
| Missing Evidence Concealment | AI answers speculative question without stating source absence | Explicit fallback phrase: "Evidence not found in pilot corpus for [X]. Observed facts cover only [Y]." |
| Overwhelming Citation Clutter | Every second word decorated with citation badge | Group citations at paragraph or claim level with collapsible source preview drawer. |

---

## "Looks Done But Isn't" Checklist

- [ ] **Entity Resolution:** Often missing composite namespace handling — verify `PRC_PROCESS:60000006` and `PRC_CONTAINER:60000006` exist as two separate distinct nodes with distinct labels.
- [ ] **Table Preservation:** Often missing table integrity — verify `01-wiring.md` child bind table is not split across chunks without column headers intact.
- [ ] **ASCII Call Chain:** Often missing diagram continuity — verify `03-call-chain.md` ASCII flow is ingested as a single atomic code block chunk.
- [ ] **Cycle Re-plant Logic:** Often missing dynamic cycle mutation — verify graph distinguishes Switch-cycle nulled `NEXT_DATE` (`IS_REPEATING=0`) from billing `create_invoice` re-planting.
- [ ] **Parameter Override Logic:** Often missing bind-level overrides — verify bind 60000017 has `I_PROCESS_CONTAINER=1` overriding process 10000303 default `FALSE`.
- [ ] **Session Tree Filter:** Often missing operational scope — verify graph documents that child 210 posts only operations with `SESSION_ID` rooted in container 60000006 tree.
- [ ] **Offline PWA Smoke Test:** Often fails when server disconnected — verify full PWA workflow in browser with knowledge server completely stopped.
- [ ] **Multi-Hop Evaluation:** Often tests only 1-hop — verify benchmark contains verified 3-hop dependency questions with automated assertion checks.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Corrupted Graph from Namespace Collision | MEDIUM | Drop Neo4j database (`MATCH (n) DETACH DELETE n`); update ingestion pipeline with URN prefix; re-ingest pilot corpus from scratch (takes <10s on pilot dataset). |
| Malformed AST Chunks in Vector DB | LOW | Clear vector collection / table; fix AST chunking boundaries in tokenizer; trigger full document re-index. |
| Inadvertent Card/Credential Ingestion | HIGH | Purge affected documents from git history if pushed; drop and rebuild Neo4j database and vector index; rotate any exposed passwords/tokens. |
| Grounded Synthesizer Hallucinating Sources | MEDIUM | Tighten system prompt constraints; enforce strict JSON response schema with explicit citation ID arrays; add citation validation regex pass. |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Epistemic Collapse & AST Chunking (Pitfalls 2, 3) | Phase 14 (Parsing & Ingestion) | Automated unit tests asserting atomic table/diagram chunks and metadata `evidence_type` tags. |
| Namespace Collision & Hub Traversal (Pitfalls 1, 4) | Phase 15 (Graph Schema & Neo4j) | Cypher test verifying distinct nodes for `prc_process:60000006` and `prc_container:60000006`; benchmark query latency <200ms. |
| Lexical Washout & Hybrid RRF (Pitfall 6) | Phase 16 (Hybrid Search & Retrieval) | Retrieval test confirming exact identifier query (`60000017`, `OPST0400`) ranks target chunk in position 1. |
| Coarse Citations & Grounding (Pitfalls 7, 8) | Phase 17 (Grounded AI Assistant) | Synthetic response test checking all citations match valid document line ranges and temporal run sessions. |
| Multi-Hop Benchmark & Security (Pitfalls 5, 9, 10) | Phase 18 (Evaluation & Hardening) | Full benchmark run achieving >=85% 3-hop accuracy; zero DLP scanner findings; PWA passes offline test. |

---

## Sources

- Pilot Corpus: `docs/sample-markdown-flow/60000006-SHB-Credit-calculations/00-sources.md`
- Pilot Wiring: `docs/sample-markdown-flow/60000006-SHB-Credit-calculations/01-wiring.md`
- Pilot Data Objects: `docs/sample-markdown-flow/60000006-SHB-Credit-calculations/02-data-objects.md`
- Pilot Call Chain: `docs/sample-markdown-flow/60000006-SHB-Credit-calculations/03-call-chain.md`
- Pilot Cycles: `docs/sample-markdown-flow/60000006-SHB-Credit-calculations/04-cycles.md`
- Pilot Breadcrumbs: `docs/sample-markdown-flow/60000006-SHB-Credit-calculations/05-breadcrumbs.md`
- Project Milestone Plan: `.planning/PROJECT.md` (v1.2 Hybrid GraphRAG Knowledge Assistant MVP)
- Neo4j GraphRAG Official Best Practices & Graph Modeling Guidelines

---
*Pitfalls research for: Hybrid GraphRAG Knowledge Assistant MVP (Scheduled Process 60000006 Pilot)*
*Researched: 2026-10-07*
