# Requirements: Hybrid GraphRAG Knowledge Assistant MVP

**Milestone:** v1.2
**Defined:** 2026-10-07
**Core Value:** Make planned work realistically fit available time while giving the personal user evidence-grounded access to their local banking IT knowledge.

## v1.2 Requirements

### Document Ingestion

- [ ] **INGEST-01**: User can publish selected normalized Markdown documents from PlannerMate to an optional knowledge server without changing local canonical copies.
- [ ] **INGEST-02**: User receives clear rejection details when pre-ingestion checks detect PAN, CVV, PIN data, HSM keys, credentials, or customer PII.
- [ ] **INGEST-03**: Published documents preserve headings, tables, code blocks, SQL, ASCII diagrams, and exact source ranges as retrievable evidence chunks.
- [ ] **INGEST-04**: Republish processes only changed documents or sections using stable IDs and SHA-256 hashes.
- [ ] **INGEST-05**: User can inspect publish and indexing status for each document set.

### Knowledge Graph

- [ ] **GRAPH-01**: User can build a controlled graph projection for process `60000006` covering scheduled processes, container steps, software components, database objects, cycle types, statuses, and source documents.
- [ ] **GRAPH-02**: Graph keeps identically numbered domain objects distinct through namespaced composite identities.
- [ ] **GRAPH-03**: Structured Markdown tables and explicit identifiers are extracted deterministically before LLM extraction is used for prose-only relationships.
- [ ] **GRAPH-04**: Every graph relation retains source document, section, source range, extraction method, and evidence classification.
- [ ] **GRAPH-05**: User can distinguish `OBSERVED`, `INFERRED`, and `BUSINESS_APPROVED` knowledge in graph-backed results.
- [ ] **GRAPH-06**: User can rebuild graph and indexes from published Markdown without treating Neo4j as canonical storage.

### Hybrid Retrieval

- [ ] **RETR-01**: User can find exact technical identifiers such as process IDs, package names, table names, cycle codes, and status codes through full-text search.
- [ ] **RETR-02**: User can find relevant English technical documentation using semantically equivalent Vietnamese or English questions.
- [ ] **RETR-03**: User can query process flow and runtime call chains through bounded graph traversal.
- [ ] **RETR-04**: User can run dependency and impact queries across one to three graph hops with bounded result counts.
- [ ] **RETR-05**: Hybrid results combine full-text, semantic, and graph evidence into one ranked evidence set without duplicate sources.

### Grounded Answers

- [ ] **ANSWER-01**: User receives AI answers whose material claims cite exact source documents, sections, and ranges.
- [ ] **ANSWER-02**: User can inspect a step-by-step graph path for flow, dependency, and impact answers.
- [ ] **ANSWER-03**: User sees evidence classification on facts and clear labeling when a conclusion is inferred.
- [ ] **ANSWER-04**: User is warned when indexed sources conflict by version, environment, or behavior.
- [ ] **ANSWER-05**: Assistant explicitly reports missing evidence instead of inventing an answer.
- [ ] **ANSWER-06**: When knowledge server is unavailable, user can continue searching local Markdown through existing BM25 retrieval.
- [ ] **ANSWER-07**: Citations and graph paths open the corresponding PlannerMate document context.

### Quality and Safety

- [ ] **QUAL-01**: Maintainer can run a 30–50 question benchmark covering exact lookup, semantic retrieval, process flow, call chain, three-hop impact, conflict, and abstention cases.
- [ ] **QUAL-02**: Benchmark verifies expected sources, required graph paths, required facts, and forbidden unsupported claims.
- [ ] **QUAL-03**: Milestone meets an agreed accuracy threshold for three-hop pilot queries and reports failures rather than masking them.
- [ ] **QUAL-04**: Automated checks prove indexes are rebuildable, sensitive-data checks run before external calls, and local search remains available offline.
- [ ] **QUAL-05**: Claude and Neo4j credentials remain server-side and never enter PlannerMate source, IndexedDB, logs, or published bundles.

## Future Requirements

### Expanded Knowledge Coverage

- **FUTR-01**: Ingest card-system domains beyond scheduled process `60000006`.
- **FUTR-02**: Support full temporal queries across historical document versions and effective dates.
- **FUTR-03**: Provide a review and approval queue for inferred graph relationships.
- **FUTR-04**: Support additional embedding backends after benchmark evidence shows a need.

### Advanced Graph Experience

- **FUTR-05**: Provide an interactive graph canvas and manual graph editing.
- **FUTR-06**: Automate technical source acquisition such as EAR decompilation and Oracle dictionary extraction.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Entire card-system corpus | Pilot must prove quality on one bounded scheduled process first. |
| Production banking or customer data | MVP corpus must contain no PAN, CVV, PIN/PIN block, HSM keys, credentials, or customer PII. |
| Graph as canonical source | Markdown must remain human-reviewable source of truth; graph is rebuildable projection. |
| Separate vector database | Neo4j can host graph, vector, and full-text indexes for MVP. |
| Python/LangChain service | Existing TypeScript stack handles required server and Claude SDK capabilities with less operational overhead. |
| Kafka or distributed job infrastructure | Pilot ingestion volume does not justify message-broker complexity. |
| Autonomous knowledge-editing agent | Unreviewed graph or document mutation would weaken evidence integrity. |
| Interactive graph editor | Citation and path cards satisfy MVP inspection needs with lower UI complexity. |

## Traceability

Roadmap creation populates phase assignments.

| Requirement | Phase | Status |
|-------------|-------|--------|
| INGEST-01 | TBD | Pending |
| INGEST-02 | TBD | Pending |
| INGEST-03 | TBD | Pending |
| INGEST-04 | TBD | Pending |
| INGEST-05 | TBD | Pending |
| GRAPH-01 | TBD | Pending |
| GRAPH-02 | TBD | Pending |
| GRAPH-03 | TBD | Pending |
| GRAPH-04 | TBD | Pending |
| GRAPH-05 | TBD | Pending |
| GRAPH-06 | TBD | Pending |
| RETR-01 | TBD | Pending |
| RETR-02 | TBD | Pending |
| RETR-03 | TBD | Pending |
| RETR-04 | TBD | Pending |
| RETR-05 | TBD | Pending |
| ANSWER-01 | TBD | Pending |
| ANSWER-02 | TBD | Pending |
| ANSWER-03 | TBD | Pending |
| ANSWER-04 | TBD | Pending |
| ANSWER-05 | TBD | Pending |
| ANSWER-06 | TBD | Pending |
| ANSWER-07 | TBD | Pending |
| QUAL-01 | TBD | Pending |
| QUAL-02 | TBD | Pending |
| QUAL-03 | TBD | Pending |
| QUAL-04 | TBD | Pending |
| QUAL-05 | TBD | Pending |

**Coverage:**
- v1.2 requirements: 28 total
- Mapped to phases: 0
- Unmapped: 28

---
*Requirements defined: 2026-10-07*
*Last updated: 2026-10-07 after v1.2 scope approval*
