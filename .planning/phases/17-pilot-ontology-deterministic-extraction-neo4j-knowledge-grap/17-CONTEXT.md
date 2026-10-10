# Phase 17: Pilot Ontology, Deterministic Extraction & Neo4j Knowledge Graph - Context

**Gathered:** 2026-10-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 17 builds a rebuildable Neo4j projection for the bounded process `60000006` pilot corpus. It defines a controlled ontology, collision-safe identities, deterministic structured extraction, bounded LLM fallback for prose-only relations, exact evidence provenance and classification, conflict handling, and atomic graph rebuild behavior. Published Markdown remains canonical. Retrieval fusion, assistant answer synthesis, interactive graph editing, and corpus expansion belong to later phases.

</domain>

<decisions>
## Implementation Decisions

### Ontology vocabulary
- **D-01:** Use a typed core ontology with a controlled `kind` property. Core node types cover `ScheduledProcess`, `ProcessStep`, `SoftwareComponent`, `DatabaseObject`, `CycleType`, `Status`, and `SourceDocument`. Technology-specific detail remains controlled metadata, such as `SoftwareComponent.kind = PLSQL_PROCEDURE` or `DatabaseObject.kind = ORACLE_TABLE`, unless later benchmark evidence justifies promoting a subtype.
- **D-02:** Use a controlled core relation vocabulary suitable for flow, dependency, and impact traversal, including concepts such as `CONTAINS_STEP`, `PRECEDES`, `CALLS`/`INVOKES`, `READS_FROM`, `WRITES_TO`, `EMITS`, `CONSUMES`, `USES_TYPE`, and `HAS_STATUS`. Preserve domain-specific verbs such as “replants cycle counter” in a controlled `operation` qualifier instead of creating an unbounded relation type for each verb.
- **D-03:** Runtime examples such as `PRC_SESSION` IDs, invoice IDs, operation IDs, and observed counts remain evidence attributes. Do not create runtime-instance nodes by default; the active domain graph represents stable topology and knowledge rather than sample rows.
- **D-04:** Keep direct domain edges for simple Cypher traversal. Give every semantic edge a stable `factKey`; store each supporting source occurrence as a separate evidence record linked to that fact. Do not duplicate domain edges per source and do not put nested provenance arrays directly on an edge.

### Collision-safe identity rules
- **D-05:** URNs identify logical source objects using application namespace, source system, source-native entity type, and normalized source key. Environment is evidence metadata, not part of logical identity. Examples: `urn:plannermate:smartvista:PRC_PROCESS:60000006` and `urn:plannermate:smartvista:PRC_CONTAINER:60000006` remain distinct despite the numeric collision.
- **D-06:** `MAIN1` is an Oracle schema qualifier, not an environment. Include it where needed for schema-qualified database and PL/SQL identities, for example `urn:plannermate:oracle:MAIN1:FCL_CYCLE_COUNTER` and `urn:plannermate:plsql:MAIN1:FCL_PRC_CYCLE_COUNTER_PKG.PROCESS`. Keep SIT/UAT/PROD on evidence records.
- **D-07:** Identify each `ProcessStep` by its source-native `PRC_CONTAINER.ID`. Parent process, `exec_order`, bind parameters, and invoked process/component are properties or relations. Reordering a step must not change its identity.
- **D-08:** Apply strict canonical normalization to technical identifiers: remove Markdown formatting, trim whitespace, uppercase unquoted Oracle identifiers, and preserve qualification boundaries. Add default schema `MAIN1` only when explicit document or section context proves it; otherwise quarantine the identifier as unresolved rather than guessing.
- **D-09:** Source-native keys control source identity. `canonicalName` is the current display name; prior or alternate names become aliases only when explicit evidence establishes equivalence. Fuzzy or semantic similarity may suggest review candidates but must never merge identities.
- **D-10:** A changed SmartVista source ID creates a new source identity even when its display name is similar. Continuity such as `REPLACES`, `SAME_LOGICAL_OBJECT`, or membership under a separate `LogicalProcess` requires explicit evidence and `BUSINESS_APPROVED` classification. Never rewrite historical URNs to make a rekey appear continuous.

### Deterministic extraction and conflicts
- **D-11:** Run deterministic extraction before LLM extraction. Structured Markdown tables, code/SQL blocks, and explicit identifiers create `OBSERVED` assertions through versioned rules.
- **D-12:** When structured evidence and prose disagree, retain both evidence assertions and create a conflict record. Do not silently overwrite the structured fact, discard the contradictory prose, or let “newest source wins” resolve different authority domains automatically.
- **D-13:** LLM fallback is limited to prose not handled by deterministic rules. It must use the closed ontology vocabulary, reference already resolved endpoints, cite an exact source range, record extraction method `LLM_PROSE`, and create an `INFERRED` candidate. Model confidence never upgrades an assertion to `OBSERVED`.
- **D-14:** Deduplicate repeated statements with a semantic `factKey` derived from ontology version, subject URN, relation type, object URN, and normalized semantic qualifiers. Document, range, extraction method, confidence, and classification do not change fact identity; each occurrence remains separate evidence.
- **D-15:** Qualifiers that change semantic meaning, such as `operation`, `condition`, or another relation-specific controlled qualifier, participate in `factKey`. Planner must define an allow-list per controlled relation so `WRITES_TO(operation=create)` does not collapse into `WRITES_TO(operation=update)`.
- **D-16:** Quarantine identifiers that lack enough qualification to resolve exactly one endpoint. Preserve raw identifier, document, section, exact range, extraction method, and possible matches. Quarantined candidates do not enter the active graph or traversal and are retried on rebuild when new deterministic context exists.

### Evidence classification and lifecycle
- **D-17:** Store classification on each evidence assertion. `OBSERVED` means the source directly states the fact through structured data or an explicit assertion; `INFERRED` means interpretation or multi-evidence reasoning was required; `BUSINESS_APPROVED` means an authorized person approved the exact semantic fact.
- **D-18:** Compute a direct edge's effective classification using `BUSINESS_APPROVED > OBSERVED > INFERRED`, while preserving the full per-evidence breakdown and conflict state. Effective classification must not hide contradictory evidence.
- **D-19:** Bind an approval record to the exact semantic `factKey`, including approver identity/name, timestamp, optional rationale, and ontology version. Carry approval through rebuild only when `factKey` is unchanged. Any change to subject, relation, object, or semantic qualifiers requires new approval.
- **D-20:** If source evidence disappears but exact approved `factKey` remains, the approved fact may stay active with `sourceMissing = true`. It must not retain a false `OBSERVED` claim after observed evidence disappears.
- **D-21:** Build a complete candidate graph from the candidate Markdown snapshot and promote it atomically only after extraction and validation succeed. An unsupported, unapproved fact is removed from the active graph. Retain only content-free removal audit/tombstone metadata such as `factKey`, removal snapshot, timestamp, and reason.
- **D-22:** Use evidence-gated traversal. `BUSINESS_APPROVED` and clean `OBSERVED` edges participate by default. Conflicted `OBSERVED` edges may be returned only with a mandatory conflict warning and both evidence branches. `INFERRED` edges require explicit query opt-in and visible labeling. Conflicted or unresolved inferred candidates never participate in default traversal.

### Claude's Discretion
- Exact URN grammar separators, escaping, and version prefix, provided identities follow D-05 through D-10 and are covered by golden tests.
- Final minimal controlled node/relation enumerations and relation-specific semantic qualifier allow-lists, provided they support Phase 18 flow, dependency, and impact queries without unbounded domain verbs.
- Storage shape for evidence records, conflict records, approvals, and content-free tombstones, provided direct domain edges remain traversable and all lifecycle rules above hold.
- Exact authority matrix by fact domain, provided conflicts are retained and surfaced rather than silently resolved.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone and phase scope
- `.planning/PROJECT.md` — Markdown-canonical constraint, optional-server isolation, pilot boundary, evidence integrity, collision-safe identity decision, and deferred full-corpus/graph-editor scope.
- `.planning/REQUIREMENTS.md` — Completed Phase 16 ingestion contracts that Phase 17 must extend without breaking local/offline behavior.
- `.planning/ROADMAP.md` — Phase 17 goal, `GRAPH-01` through `GRAPH-06`, success criteria, and boundaries from Phases 18–20.
- `.planning/phases/16-knowledge-server-foundation-dlp-checks-ast-ingestion/16-CONTEXT.md` — Immutable snapshot, AST chunk, content/occurrence identity, atomic candidate activation, and knowledge-server authority decisions inherited by graph projection.

### Pilot corpus
- `docs/sample-markdown-flow/60000006-SHB-Credit-calculations/README.md` — Pilot overview, required process/container ID collision, flow summary, and bounded corpus index.
- `docs/sample-markdown-flow/60000006-SHB-Credit-calculations/00-sources.md` — Source hierarchy and authoritative Java/PLSQL inspection references.
- `docs/sample-markdown-flow/60000006-SHB-Credit-calculations/01-wiring.md` — Deterministic tables for `PRC_PROCESS`, `PRC_CONTAINER`, binds, parameters, parent flow, cycle types, subscribers, and runtime examples.
- `docs/sample-markdown-flow/60000006-SHB-Credit-calculations/02-data-objects.md` — Database object roles, grains, read/write behavior, source IDs, and exact cross-object relationships.
- `docs/sample-markdown-flow/60000006-SHB-Credit-calculations/03-call-chain.md` — Scheduler-to-JDBC-to-PL/SQL call chain and prose relationships suitable for bounded fallback extraction.
- `docs/sample-markdown-flow/60000006-SHB-Credit-calculations/04-cycles.md` — Structured cycle bind order, dispatch behavior, status transitions, and domain-specific operation examples.
- `docs/sample-markdown-flow/60000006-SHB-Credit-calculations/05-breadcrumbs.md` — Collision warnings, statuses, logs, SQL, source line locators, and evidence authority breadcrumbs.

### Existing server contracts
- `knowledge-server/src/types/protocol.ts` — Current immutable published-document, exact chunk provenance, hash, and active-snapshot protocol contracts.
- `knowledge-server/src/parser/sectionChunker.ts` — Exact heading paths, lines, UTF-16 offsets, raw source slices, occurrence IDs, and content hashes available to extraction.
- `knowledge-server/src/indexing/incrementalProjector.ts` — Current candidate projection and four-way incremental document/chunk classification.
- `knowledge-server/src/indexing/snapshotStore.ts` — Existing building/ready/failed/active candidate lifecycle and atomic promotion boundary.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `knowledge-server/src/types/protocol.ts` — Reuse `EvidenceChunk` provenance fields, `CHUNKING_POLICY_VERSION`, and strict Zod protocol patterns; extend with versioned graph contracts rather than inventing a parallel source-range model.
- `knowledge-server/src/parser/sectionChunker.ts` — Supplies exact document occurrence identity, heading path, line/offset range, raw source slice, and content hash needed by deterministic extractors and evidence records.
- `knowledge-server/src/indexing/incrementalProjector.ts` — Supplies immutable candidate documents/chunks and added/changed/removed/unchanged deltas; graph extraction can consume its candidate snapshot and avoid reparsing client data.
- `knowledge-server/src/indexing/snapshotStore.ts` — Supplies candidate completion, failure isolation, and atomic active-snapshot promotion pattern that graph projection must preserve.
- `knowledge-server/tests/pilotAcceptance.test.ts` and parser/projector tests — Existing targeted fixture and determinism test locations can be extended with ontology, collision, rebuild, conflict, and provenance checks.

### Established Patterns
- Knowledge-server package is an independent Node/TypeScript/Fastify service; PlannerMate remains operational without it.
- Published Markdown snapshots are immutable inputs. Markdown stays canonical; derived indexes and graph data are disposable projections.
- Chunking is deterministic and versioned, with exact raw ranges and separate reusable content identity versus occurrence identity.
- Candidate state is built separately and promoted only when complete, preserving the prior active snapshot on failure.
- Protocol boundaries use strict Zod schemas and content-free status/error metadata.
- No Neo4j driver or LLM provider dependency exists in `knowledge-server/package.json`; research must select the minimum necessary integration without coupling it to the static PWA.

### Integration Points
- Extend the knowledge-server projection pipeline after Phase 16 chunk creation and before candidate promotion so graph extraction failure cannot partially mutate active graph state.
- Add a versioned ontology/URN/fact-key module shared by deterministic rules, bounded LLM validation, Neo4j writes, and tests.
- Add deterministic extractors for representative Markdown tables and explicit identifiers in `01-wiring.md`, `02-data-objects.md`, and `04-cycles.md` before any prose fallback stage.
- Add a graph repository/adapter behind the knowledge-server boundary; PlannerMate client must not acquire direct Neo4j credentials or treat graph availability as required for local Docs/BM25 behavior.
- Add active-candidate validation for URN uniqueness, resolved endpoints, controlled node/relation kinds, exact provenance, classification, conflict state, and absence of quarantined edges from traversal.
- Keep retrieval query APIs and UI presentation outside this phase except for contracts strictly needed to prove classification and rebuild behavior; Phase 18 owns hybrid retrieval.

</code_context>

<specifics>
## Specific Ideas

- Required collision example: `PRC_PROCESS.ID = 60000006` and `PRC_CONTAINER.ID = 60000006` must produce distinct URNs and nodes.
- Required shared-component example: `PRC_CONTAINER.ID = 60000006` is a step that invokes reusable process definition `PRC_PROCESS.ID = 10000304`; they are not one node.
- Required schema-qualified examples: `MAIN1.FCL_CYCLE_COUNTER` and `MAIN1.FCL_PRC_CYCLE_COUNTER_PKG.PROCESS` use `MAIN1` as schema, while environment remains separate evidence metadata.
- Required rekey example: if SmartVista changes process ID `60000006` to `70000006`, create a new source identity. Only explicit, business-approved evidence may connect them with `REPLACES`, `SAME_LOGICAL_OBJECT`, or a shared `LogicalProcess`.
- Required conflict example: a structured bind table stating `CYTP1002` and contradictory prose stating `CYTP1003` must remain visible as conflicting evidence rather than silently selecting one.
- Required provenance example: the same call relation found in `01-wiring.md` and `03-call-chain.md` produces one direct domain edge with multiple exact evidence records.

</specifics>

<deferred>
## Deferred Ideas

- Interactive graph canvas or manual graph editor — deferred beyond v1.2.
- Full SmartVista/card-system corpus beyond process `60000006` — deferred beyond pilot validation.
- Hybrid keyword/vector/Cypher retrieval and rank fusion — Phase 18.
- Assistant citations, conflict presentation, graph-path cards, and abstention UI — Phase 19.
- Full benchmark, graph integrity hardening, and credential isolation verification — Phase 20.

</deferred>

---

*Phase: 17-Pilot Ontology, Deterministic Extraction & Neo4j Knowledge Graph*
*Context gathered: 2026-10-10*
