# Phase 17: Pilot Ontology, Deterministic Extraction & Neo4j Knowledge Graph - Research

**Researched:** 2026-10-10
**Domain:** Deterministic Markdown extraction, evidence provenance, Neo4j projection, bounded prose fallback
**Confidence:** HIGH for locked rules/codebase integration; MEDIUM for Neo4j operations without live instance

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

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

### Deferred Ideas (OUT OF SCOPE)
- Interactive graph canvas or manual graph editor — deferred beyond v1.2.
- Full SmartVista/card-system corpus beyond process `60000006` — deferred beyond pilot validation.
- Hybrid keyword/vector/Cypher retrieval and rank fusion — Phase 18.
- Assistant citations, conflict presentation, graph-path cards, and abstention UI — Phase 19.
- Full benchmark, graph integrity hardening, and credential isolation verification — Phase 20.
</user_constraints>

<phase_requirements>
## Phase Requirements

Current worktree `.planning/REQUIREMENTS.md` lacks GRAPH entries, while roadmap and supplied phase scope define them. Planner should use wording below, then synchronize requirement source before verification. `[VERIFIED: codebase grep]`

| ID | Description | Research Support |
|----|-------------|------------------|
| GRAPH-01 | Controlled graph for process `60000006`, covering seven locked node kinds. | Closed ontology, pilot rule map, repository shape. `[CITED: .planning/ROADMAP.md]` |
| GRAPH-02 | Namespaced composite identities prevent numeric collisions. | URN grammar and collision/rekey gold tests. `[CITED: .planning/ROADMAP.md]` |
| GRAPH-03 | Deterministic structured extraction precedes prose LLM fallback. | MDAST rules, consumed ranges, zero/one fallback call. `[CITED: 17-AI-SPEC.md]` |
| GRAPH-04 | Every relation retains exact provenance, method, and classification. | Fact/evidence model and exact-range validation. `[CITED: 17-CONTEXT.md D-04]` |
| GRAPH-05 | User distinguishes three evidence classifications. | Classification algorithm, status/evidence APIs, UI contract. `[CITED: 17-UI-SPEC.md]` |
| GRAPH-06 | Rebuild from published Markdown; Neo4j never canonical. | Durable source snapshot, isolated candidate, atomic pointer, hash. `[CITED: 17-CONTEXT.md D-21]` |
</phase_requirements>

## Summary

Extend independent `knowledge-server`, not local PlannerMate persistence/search. Existing server provides immutable projected documents/chunks, exact UTF-16 ranges, deterministic hashes, per-set serialization, and candidate promotion patterns. Graph pipeline consumes those objects behind repository/service boundaries. Client receives authenticated operational DTOs only; Neo4j/model credentials and Cypher stay server-side. `[VERIFIED: knowledge-server/src; src/services/knowledge]`

Use direct typed domain relationships for traversal plus `Fact` nodes for provenance joins and separate `Evidence` nodes per occurrence. Neo4j cannot store nested maps as properties, so direct edges repeat only stable scalar summary: `factKey`, snapshot key, effective classification, conflict, traversal eligibility. `[CITED: https://neo4j.com/docs/cypher-manual/current/values-and-types/property-structural-constructed/]`

Build complete snapshot-scoped candidate, validate/hash it, write it inactive, then switch one `ACTIVE_GRAPH` pointer in one Neo4j transaction. Never mutate active records while assembling candidate. Published Markdown and separate approval ledger remain rebuild inputs; Neo4j stays disposable. `[CITED: 17-CONTEXT.md D-19–D-21; https://neo4j.com/docs/javascript-manual/current/transactions/]`

**Primary recommendation:** Plan waves: contracts/gold fixtures; identity+deterministic extraction; candidate/conflict/classification; durable source+Neo4j atomic projection; bounded LLM fallback; APIs; existing-drawer UI; live rebuild/offline checks. `[VERIFIED: dependency analysis]`

## Project Constraints (from CLAUDE.md)

- Local Docs, autosave, IndexedDB, BM25, and PWA remain usable without daemon/Neo4j. `[CITED: CLAUDE.md]`
- Canonical app data remains local; daemon stores only rebuildable published projections. `[CITED: CLAUDE.md]`
- UI uses Ant Design, responsive and accessible. `[CITED: CLAUDE.md]`
- Use Node 24, TypeScript strict, Zod boundaries, targeted Vitest. `[CITED: CLAUDE.md; VERIFIED: server config]`
- No client Neo4j secrets or Vite secret env vars. `[CITED: CLAUDE.md]`
- No project skill directories found. `[VERIFIED: filesystem]`

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Selection/DLP/local status | Browser / Client | IndexedDB | Existing Phase 16 boundary; graph rebuild cannot bypass publish/DLP. `[VERIFIED: codebase]` |
| Rebuild/status/evidence UI | Browser / Client | API | Fixed operations and safe DTOs, no credentials/Cypher. `[CITED: UI spec]` |
| Ontology, extraction, conflicts/classification | API / Backend | — | Trusted versioned rules over immutable snapshots. `[CITED: CONTEXT]` |
| Prose fallback | API / Backend | 9router-compatible model | Bounded untrusted output, no mutation authority. `[CITED: AI spec]` |
| Candidate/active graph | Neo4j | API | Disposable projection with backend-controlled pointer. `[CITED: D-21]` |
| Approval records | Backend durable store | Neo4j projection | Human authority is not reconstructable from Markdown and must survive graph wipe. `[CITED: D-19/D-20]` |
| Local BM25 | Browser / Client | IndexedDB | Independent fallback. `[CITED: CLAUDE.md]` |

## Standard Stack

### Core

| Library / Service | Version | Purpose | Why Standard |
|-------------------|---------|---------|--------------|
| Node.js | 24 LTS | Daemon runtime | Project lock; machine currently `v20.19.5`, so upgrade needed. `[CITED: CLAUDE.md; VERIFIED: probe]` |
| TypeScript | Existing `^7.0.2` | Strict contracts | Existing strict server config. `[VERIFIED: package/config]` |
| Zod | Existing `^4.6.5` | Strict API/model/config validation | Existing boundary pattern. `[VERIFIED: codebase]` |
| unified/remark | Existing 11/4 | MDAST tables/code/positions | Already supplies lossless Phase 16 AST; no second parser. `[VERIFIED: codebase]` |
| Neo4j Community | `2026.09.0` reference image | Graph projection | Official image exposes Bolt 7687, Browser 7474, `/data`; Community tag has no suffix. `[CITED: https://neo4j.com/docs/operations-manual/current/docker/introduction/]` |
| `neo4j-driver` | `6.2.0` `[ASSUMED: slopcheck unavailable]` | Official Bolt driver | Official docs confirm package/6.x compatibility; registry confirms version and Node >=18. `[CITED: https://neo4j.com/docs/javascript-manual/current/install/; VERIFIED: npm registry]` |

### Supporting

| Library / Feature | Version | Purpose | When to Use |
|-------------------|---------|---------|-------------|
| Node crypto/fetch/filesystem | Native | hashes, one fallback call, durable JSON | Avoid added packages. `[CITED: AI spec]` |
| Vitest | Existing `^5.0.2` | Gold/unit/adapter tests | Existing serial Node runner. `[VERIFIED: codebase]` |
| Ant Design | Existing `^6.6.5` | Status/evidence UI | UI contract bans canvas package. `[CITED: UI spec]` |

Locked decisions exclude alternate graph DBs, AI frameworks, provider SDKs, vector stores, canvas libraries, and eval platforms. `[CITED: CONTEXT; AI/UI specs]`

**Installation:**
```bash
npm --prefix knowledge-server install --save-exact neo4j-driver@6.2.0
```

## Package Legitimacy Audit

`slopcheck` install/run attempted but unavailable. Package remains `[ASSUMED]`; planner must add `checkpoint:human-verify`. `[VERIFIED: command output]`

| Package | Registry | Age | Downloads | Source Repo | postinstall | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-------------|-----------|-------------|
| `neo4j-driver` `[ASSUMED]` | npm | Since 2015-04-03 | 892,008/week (2026-10-02..08) | `github.com/neo4j/neo4j-javascript-driver` | none reported | unavailable | Conditional approval after human gate. `[VERIFIED: npm/APIs; CITED: official docs/repo]` |

**Packages removed [SLOP]:** none; no verdict.  
**Packages flagged [SUS]:** none; no verdict.

## Architecture Patterns

### System Architecture Diagram

```text
PlannerMate DocumentSetDrawer
  │ authenticated rebuild/status/facts/evidence API
  ▼
Knowledge Server
  ├─ load active immutable published snapshot
  ├─ MDAST deterministic rules
  │    ├─ supported tables/code/IDs → OBSERVED + consumed ranges
  │    └─ unsupported structure → quarantine
  ├─ uncovered prose only → zero/one 9router call
  │    ├─ strict schema/endpoint/range/domain valid → INFERRED
  │    └─ invalid/error/overflow → quarantine + warning
  ├─ merge/dedupe/conflicts + exact approval overlay
  ├─ validate + normalizedProjectionHash
  ▼
Neo4j inactive GraphSnapshot candidate
  ├─ failure → prior ACTIVE_GRAPH unchanged
  └─ success → atomic ACTIVE_GRAPH pointer switch
  ▼
Read-only safe DTOs → status/table/provenance UI

Local Docs/autosave/IndexedDB/BM25 ── independent path
```

Managed transaction callbacks can retry; keep model calls, filesystem writes, telemetry, and notifications outside callbacks. `[CITED: Neo4j transaction docs]`

### Recommended Project Structure

```text
knowledge-server/src/
├── graph/{ontology,identity,candidate,graphRepository,neo4jRepository,extraction}.ts
├── ai/proseExtraction.ts
├── services/graphBuildService.ts
├── routes/graph.ts
└── types/graphProtocol.ts
src/
├── services/knowledge/knowledgeClient.ts
├── validation/knowledgeSchemas.ts
└── components/knowledge/{DocumentSetDrawer,GraphEvidenceDrawer}.tsx
```

Repository boundary is justified for no-Neo4j unit tests and driver isolation. Collapse files if implementation stays small. `[VERIFIED: existing layout]`

### Pattern 1: Snapshot-Scoped Physical Graph

Every candidate gets `graphSnapshotId`. Physical `Entity.instanceKey = graphSnapshotId + urn`; `Fact.instanceKey = graphSnapshotId + factKey`; evidence/conflict/quarantine keys are snapshot-scoped. Reads anchor through `(:GraphSet)-[:ACTIVE_GRAPH]->(:GraphSnapshot)` before matching records. Reusing physical nodes across candidates leaks candidate metadata into active results. `[ASSUMED: recommended design from D-21]`

```text
(GraphSet)-[:ACTIVE_GRAPH]->(GraphSnapshot)-[:HAS_ENTITY]->(Entity)
(Entity)-[:CONTROLLED_RELATION {factKey,...}]->(Entity)
(GraphSnapshot)-[:HAS_FACT]->(Fact)<-[:SUPPORTS]-(Evidence)
(Evidence)-[:FROM_SOURCE]->(Entity:SourceDocument)
(Conflict)-[:HAS_BRANCH]->(Fact)
(Approval)-[:APPROVES]->(Fact)
(GraphSnapshot)-[:HAS_QUARANTINE]->(Quarantine)
```

Use named `IF NOT EXISTS` uniqueness constraints for set/snapshot/entity/fact/evidence/conflict/approval/quarantine keys. Add indexes on `(graphSnapshotId, urn)` and `(graphSnapshotId, factKey)`. Community supports property uniqueness; existence/type/key constraints are Enterprise-only, so enforce required fields in Zod/candidate validator. `[CITED: https://neo4j.com/docs/cypher-manual/current/constraints/; /constraints/managing-constraints/]`

### Pattern 2: Direct Edge + Fact Node

One typed direct edge supports traversal; one Fact node receives evidence/conflict/approval links. Validate one-to-one equality by `(graphSnapshotId,factKey)`. Evidence never becomes duplicate domain edges. Qualifiers persist as canonical JSON string plus query-relevant allow-listed scalar properties because nested maps cannot be properties. `[CITED: D-04/D-14; Neo4j property docs]`

### Pattern 3: Versioned Deterministic Rules and Consumed Ranges

Rules match exact heading/table signatures and emit in source order. Each handled MDAST node records absolute consumed range. Unsupported structured nodes quarantine; only uncovered paragraphs reach fallback. `[CITED: AI spec]`

| Pilot shape | Output | Guard |
|-------------|--------|-------|
| `PRC_PROCESS` table | ScheduledProcess, component, INVOKES | Live counts excluded. `[VERIFIED: corpus]` |
| `PRC_CONTAINER` table | ProcessStep by bind ID, CONTAINS_STEP, PRECEDES, invoked process | `exec_order` never enters URN. `[CITED: D-07]` |
| Bind/cycle tables | CycleType, USES_TYPE | Runtime counts remain evidence. `[CITED: D-03]` |
| Billing dispatch | CALLS/WRITES_TO with controlled operation | Unknown “Writes” phrases quarantine. `[VERIFIED: corpus]` |
| Status tables | Status/HAS_STATUS when subject/context explicit | Environment stays evidence. `[VERIFIED: corpus]` |
| Data-object headings | MAIN1-qualified DatabaseObject, read/write assertions | Sample session/invoice/op IDs excluded. `[CITED: D-03]` |

Do not build generic uppercase-token entity extraction. Use signatures, heading context, inline-code node types, and strict identifier grammar. `[VERIFIED: corpus ambiguity]`

### Pattern 4: Identity and Canonical Keys

Recommended URN grammar, no ontology version in URN:
```text
urn:plannermate:<source-system>:<source-native-type>:<normalized-key>[:<segment>...]
```
Percent-encode separator-bearing source data; preserve Oracle qualification; environment never enters URN. Exact escaping is `[ASSUMED]`; golden tests lock it.

Build `factKey` from SHA-256 of canonical JSON tuple, avoiding delimiter ambiguity:
```typescript
sha256Hex(JSON.stringify([
  ontologyVersion, subjectUrn, relation, objectUrn,
  Object.entries(normalizedQualifiers).sort(([a], [b]) => a.localeCompare(b)),
]));
```
Evidence fields never enter key. `[CITED: D-14/D-15; ASSUMED: serialization]`

### Pattern 5: Relation Metadata and Conflict Slots

Central relation registry defines subject/object kinds, qualifier allow-list, and additive versus functional semantics. `READS_FROM`, `WRITES_TO`, `CALLS` are additive. `USES_TYPE` per step+parameter, contextual `HAS_STATUS`, and single invoked target are functional conflict slots. Different targets conflict only in functional slots. `[ASSUMED: recommended algorithm]`

Start operation enum only with pilot evidence: `READ`, `INSERT`, `UPDATE`, `QUEUE`, `DRAIN`, `REGISTER`, `PROCESS`, `POST`, `REPLANT`, `MARK_PROCESSED`, `NO_OP`; unknown verbs quarantine and require ontology version bump/review. `[VERIFIED: corpus; ASSUMED: exact enum]`

### Pattern 6: Approval Outside Disposable Graph

Approval is human authority, not Markdown derivation. Durable approval ledger stores exact semantic payload, `factKey`, ontology version, approver, timestamp, rationale. Rebuild overlays exact matches only. No approval-authoring UI in Phase 17; never fabricate approval. Tests inject fixture approvals; production may show zero approved count. `[CITED: D-17–D-20; deferred scope]`

### Pattern 7: Separate Build Lifecycle

Graph states: Never built, Building, Active, Active with warnings, Failed. Stages: Preparing, Structured extraction, Prose extraction, Validation, Activation. Keep separate from publish's six primary states. Rebuild consumes active server snapshot only—no republish, DLP rerun, or local unsaved content. Before activation, ensure frozen `sourceSnapshotId` still equals active source; stale candidate must not replace newer graph. `[CITED: UI spec; ASSUMED: stale guard]`

### Anti-Patterns

- Shared mutable nodes across candidates. `[ASSUMED]`
- Nested evidence arrays/maps or one edge per occurrence. `[CITED: D-04; property docs]`
- `MERGE` without uniqueness constraints; docs say MERGE alone does not guarantee uniqueness. `[CITED: https://neo4j.com/docs/cypher-manual/current/clauses/merge/]`
- Neo4j internal IDs as identity; numeric identity deprecated and JS integers risk precision loss. `[CITED: https://neo4j.com/docs/javascript-manual/current/data-types/]`
- HTTP/model/filesystem effects inside retryable transaction callback. `[CITED: transaction docs]`
- `CALL ... IN TRANSACTIONS` for activation; successful earlier batches remain committed after failure. `[CITED: https://neo4j.com/docs/cypher-manual/current/subqueries/subqueries-in-transactions/]`
- Fuzzy merge, fallback over structured ranges, malformed-output retries, free Cypher API. `[CITED: CONTEXT; AI/UI specs]`

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Bolt/pooling/retries/Int64 | Custom protocol client | Official `neo4j-driver` after gate | Driver owns these semantics. `[CITED: Neo4j docs]` |
| Markdown/table positions | Regex parser | Existing unified/remark MDAST | Exact GFM positions already available. `[VERIFIED: codebase]` |
| Hash/UUID dependency | New package | Existing SHA-256/native UUID | Already sufficient. `[VERIFIED: codebase]` |
| Agent/AI framework | LangChain/LlamaIndex/SDK | Native fetch + Zod | One bounded call. `[CITED: AI spec]` |
| Graph canvas | D3/Cytoscape | Ant Design Table/Drawer | Explicitly out of scope. `[CITED: UI spec]` |
| LLM repair loop | Retry/JSON repair | Zero retries + quarantine | Preserves call ceiling and safety. `[CITED: AI spec]` |
| Distributed transaction | Homemade 2PC | Neo4j-contained active pointer | Atomicity cannot span unrelated stores. `[ASSUMED]` |

## Common Pitfalls

### 1. Active source is in-memory only
Current `SnapshotStore` uses Maps; after daemon restart, rebuild has no published Markdown. Plan durable `PublishedSnapshotRepository` before GRAPH-06, using native atomic file writes unless deployment supplies approved storage. `[VERIFIED: snapshotStore.ts; ASSUMED: storage choice]`

### 2. Cross-store “atomic” promotion
Do not pretend source-store and Neo4j pointers commit together. Pin already-active `sourceSnapshotId`; Neo4j transaction alone switches graph pointer. Show both IDs. `[ASSUMED]`

### 3. Relative provenance persisted as absolute
MDAST offsets parsed from chunk require `chunk.startOffset + node.position.offset`. Verify `documentBody.slice(absStart,absEnd) === quote` before persistence. `[VERIFIED: chunk model; CITED: AI spec]`

### 4. Nondeterministic ordering
Sort by frozen document order, URN, factKey, and evidence document/range/method. Exclude build IDs/timestamps from normalized hash. `[CITED: AI spec rebuild rubric]`

### 5. Runtime examples become topology
Live sessions, invoices, operations, counts are abundant in corpus but must remain evidence attributes. Rule registry marks those sections explicitly. `[VERIFIED: corpus; CITED: D-03]`

### 6. Every differing target called conflict
Only functional relation slots conflict; additive dependencies do not. `[ASSUMED]`

### 7. Approval lost with graph or survives changed fact
Use external exact-key ledger. Changed endpoint/relation/qualifier/ontology requires new approval. Source loss can retain approved fact but removes false OBSERVED status. `[CITED: D-19/D-20]`

### 8. Community/Enterprise mismatch
Community supports uniqueness, not existence/type/key constraints; multiple database management and advanced roles are Enterprise. Baseline uses one DB, snapshot keys, application validation. `[CITED: official constraints/database/roles docs]`

### 9. One query per record
Batch with parameterized `UNWIND`; group by static relation query. For bounded pilot, one candidate transaction may fit; measure. Activation always one transaction. `[CITED: https://neo4j.com/docs/javascript-manual/current/performance/]`

### 10. LLM drift breaks rebuild
Use exact-input cache outside Neo4j keyed by model, prompt, ontology, segment hashes/IDs, endpoints. Cache only validated normalized output. Missing model/cache yields deterministic graph with warning, not false equivalence. `[CITED: AI spec]`

### 11. Synthetic Phase 16 pilot fixture mistaken for truth
Existing `pilotAcceptance.test.ts` contains placeholder Spring Batch/loan-table content unlike checked-in SmartVista corpus. Phase 17 gold fixtures must use frozen real corpus and human labels. `[VERIFIED: codebase comparison]`

## Code Examples

### Driver Lifecycle
```typescript
// Source: https://neo4j.com/docs/javascript-manual/current/connect/
const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
await driver.verifyConnectivity();
try {
  return await driver.executeQuery(query, params, { database });
} finally {
  await driver.close();
}
```
Always name database; close driver on daemon shutdown and sessions in `finally`. `[CITED: connect/query-simple docs]`

### Static Batched Relation Writer
```typescript
const RELATION_WRITERS = {
  CONTAINS_STEP: `
    UNWIND $rows AS row
    MATCH (s:Entity {instanceKey: row.subjectInstanceKey})
    MATCH (o:Entity {instanceKey: row.objectInstanceKey})
    MERGE (s)-[r:CONTAINS_STEP {edgeInstanceKey: row.edgeInstanceKey}]->(o)
    SET r.factKey = row.factKey,
        r.graphSnapshotId = $graphSnapshotId,
        r.defaultTraversable = row.defaultTraversable`,
} as const;
```
Closed static query map avoids relation-type interpolation; bind endpoints before relationship merge. `[CITED: MERGE/performance docs]`

### Atomic Pointer
```typescript
await session.executeWrite(async (tx) => {
  const result = await tx.run(`
    MERGE (set:GraphSet {setId: $setId})
    MATCH (candidate:GraphSnapshot {
      graphSnapshotId: $graphSnapshotId, setId: $setId, state: 'READY'
    })
    OPTIONAL MATCH (set)-[old:ACTIVE_GRAPH]->(previous)
    DELETE old
    FOREACH (_ IN CASE WHEN previous IS NULL THEN [] ELSE [1] END |
      SET previous.state = 'SUPERSEDED')
    MERGE (set)-[:ACTIVE_GRAPH]->(candidate)
    SET candidate.state = 'ACTIVE', candidate.activatedAt = $activatedAt
    RETURN candidate.graphSnapshotId AS id`, params);
  if (result.records.length !== 1) throw new Error('GRAPH_CANDIDATE_NOT_READY');
});
```
Callback contains database-only idempotent work because driver may retry. `[CITED: transaction docs; ASSUMED: project query]`

### Exact Evidence
```typescript
const startOffset = chunk.startOffset + relativeStart;
const endOffset = chunk.startOffset + relativeEnd;
const quote = chunk.rawContent.slice(relativeStart, relativeEnd);
if (document.body.slice(startOffset, endOffset) !== quote) {
  throw new Error('EVIDENCE_RANGE_MISMATCH');
}
```
Persist document/occurrence/heading/line/UTF-16 offsets, quote hash, method, environment, classification. `[CITED: AI/UI specs]`

## State of the Art

| Old approach | Current approach | Impact |
|--------------|------------------|--------|
| Internal numeric IDs | Application URNs; internal element IDs transient only | Avoid precision/identity drift. `[CITED: data-types docs]` |
| Concatenated Cypher | Parameters + static type writers | Injection defense/plan reuse. `[CITED: query docs]` |
| One query per item | `UNWIND` batches | Fewer round trips. `[CITED: performance docs]` |
| MERGE assumed unique | Constraints + endpoint binding | Concurrency-safe identity. `[CITED: MERGE docs]` |
| Nested provenance property | Fact/Evidence nodes | Valid/queryable property graph. `[CITED: property docs]` |
| Temperature 0 means deterministic | Exact cache + normalized hash | Drift becomes detectable. `[CITED: AI spec]` |

## Assumptions Log

| # | Claim | Risk if Wrong |
|---|-------|---------------|
| A1 | Snapshot-scoped copies are minimum safe candidate isolation. | Alternate model must prove no active leakage. |
| A2 | Native filesystem is acceptable durable source/approval/cache store. | Deployment may require SQLite/object storage. |
| A3 | Proposed qualifier/operation enums cover pilot. | Missing semantics quarantine or ontology bump. |
| A4 | Pilot candidate fits one managed write transaction. | Use inactive idempotent batches if measured otherwise. |
| A5 | No real approval seed exists. | Existing authority records need migration. |
| A6 | `neo4j-driver` package is legitimate. | Human gate mandatory because slopcheck unavailable. |
| A7 | Community edition is baseline. | Enterprise requirements alter schema/security plan. |
| A8 | Publish and rebuild may overlap with stale-source guard. | Serialization decision would change state machine. |

## Open Questions

1. **Durable active published snapshot location?** Current store is memory-only. Add early decision/checkpoint; native filesystem is minimum recommendation. `[VERIFIED; ASSUMED]`
2. **Which facts are truly BUSINESS_APPROVED?** Never fabricate. Support zero count; require authorized curated manifest if acceptance needs real example. `[CITED: D-19]`
3. **Neo4j deployment/edition?** Docker CLI exists, daemon/CLI/env do not. Recommend pinned Community image unless secured remote supplied. `[VERIFIED; ASSUMED]`
4. **Auto-build after publish?** Not locked. Recommend explicit manual rebuild to preserve optional-server isolation. `[ASSUMED]`
5. **Requirements source sync?** Root file lacks GRAPH entries. Owning workflow should synchronize before phase verification. `[VERIFIED]`

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node 24 | build/test | ✗ wrong | `v20.19.5` | Upgrade. `[VERIFIED]` |
| npm | install | ✓ | `10.8.2` | Node 24 bundled npm. `[VERIFIED]` |
| Docker CLI | local Neo4j | ✓ | `28.3.2` | Remote Neo4j. `[VERIFIED]` |
| Docker daemon | local Neo4j | ✗ | — | Start Desktop/remote. `[VERIFIED]` |
| Neo4j CLI/server/env | integration | ✗ | — | Official image/remote. `[VERIFIED]` |
| 9router env | fallback | ✗ | — | Deterministic-only warning/quarantine. `[CITED: AI spec]` |
| Context7 | docs | ✗ | — | Official docs via WebFetch. `[VERIFIED]` |
| slopcheck | package gate | ✗ | — | Human checkpoint. `[VERIFIED]` |

**Blocking:** Node 24; live Neo4j for release integration.  
**Fallback available:** model configuration and Docker daemon.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `^5.0.2` `[VERIFIED: codebase]` |
| Config | `knowledge-server/vitest.config.ts` |
| Quick | `npm --prefix knowledge-server test -- tests/graphIdentity.test.ts tests/deterministicExtraction.test.ts` |
| Phase | targeted graph files listed below; no unrelated full suite. `[CITED: user memory]` |

### Phase Requirements → Test Map
| Req | Behavior | Type | Command | Exists? |
|-----|----------|------|---------|---------|
| GRAPH-01 | Seven node kinds + representative edges | gold/unit | `npm --prefix knowledge-server test -- tests/deterministicExtraction.test.ts tests/pilotAcceptance.test.ts` | ❌ Wave 0 |
| GRAPH-02 | collision/schema/reorder/rekey | unit | `npm --prefix knowledge-server test -- tests/graphIdentity.test.ts` | ❌ |
| GRAPH-03 | deterministic first, zero/one fallback | unit | `npm --prefix knowledge-server test -- tests/deterministicExtraction.test.ts tests/proseFallback.test.ts` | ❌ |
| GRAPH-04 | one fact, many exact evidence occurrences | integration | `npm --prefix knowledge-server test -- tests/graphCandidate.test.ts tests/neo4jRepository.test.ts` | ❌ |
| GRAPH-05 | classes/conflicts/approval/UI | unit/component | `npm --prefix knowledge-server test -- tests/graphCandidate.test.ts tests/graphRoutes.test.ts` | ❌ |
| GRAPH-06 | hash/removal/failure/rebuild | integration | `npm --prefix knowledge-server test -- tests/graphRebuild.test.ts tests/neo4jRepository.test.ts` | ❌ |

### Sampling Rate
- Per commit: smallest changed-module test.
- Per wave: graph files for that wave.
- Phase gate: phase suite, live Neo4j atomic-failure test, server build, one offline-isolation test.

### Wave 0 Gaps
- [ ] Real frozen pilot gold fixtures with 15–20 labeled examples. `[CITED: AI spec]`
- [ ] `graphIdentity`, `deterministicExtraction`, `graphCandidate`, `proseFallback`, `neo4jRepository`, `graphRoutes`, `graphRebuild` tests.
- [ ] `GraphEvidenceDrawer.test.tsx` and local offline-isolation test.
- [ ] Opt-in official-image Neo4j integration setup; no test-container package.

## Security Domain

### Applicable ASVS Categories
| Category | Applies | Control |
|----------|---------|---------|
| V2 Authentication | yes | Existing exact-origin, memory-only bearer auth on all graph routes. `[VERIFIED: server.ts]` |
| V3 Session | yes | No tokens/Neo4j credentials in IndexedDB/logs/backups/bundle. `[CITED: Phase 16]` |
| V4 Access Control | yes | Fixed set-scoped APIs; no direct Cypher; least DB permission where edition supports. `[CITED: UI/Neo4j role docs]` |
| V5 Validation | yes | Strict Zod, closed enums, ceilings, semantic checks, parameterized Cypher. `[CITED: AI/Neo4j docs]` |
| V6 Cryptography | yes | HTTPS and certificate-validated `neo4j+s`/`bolt+s`; no homemade crypto. `[CITED: https://neo4j.com/docs/operations-manual/current/security/ssl-framework/]` |

### Known Threat Patterns
| Pattern | STRIDE | Mitigation |
|---------|--------|------------|
| Cypher injection | Tampering/Elevation | Static relation queries, parameters, no Cypher API. `[CITED: query docs]` |
| Prompt injection | Tampering | Source as data, no tools, strict endpoint/range validation. `[CITED: AI spec]` |
| Partial candidate exposure | Tampering | Snapshot isolation + pointer-anchored reads. `[ASSUMED]` |
| Secret/source logging | Disclosure | Existing redaction + allow-listed content-free telemetry. `[VERIFIED: server.ts; CITED: AI spec]` |
| Payload/model DoS | DoS | 1 MiB body, one call, bounds, timeout, per-set serialization. `[VERIFIED; CITED]` |
| Duplicate rebuild | DoS/Tampering | Idempotency key + one active build/set. `[CITED: Phase 16/UI spec]` |
| Int64 precision loss | Tampering | Source IDs are strings; no unsafe number conversion. `[CITED: data-types docs]` |
| TLS downgrade | Spoofing/Disclosure | Remote `+s`; `+ssc` only explicit controlled exception. `[CITED: TLS docs]` |

## Planning Sequence

1. Contracts, real gold data, version constants, strict DTOs.
2. Ontology/URN/fact-key and deterministic rules with exact provenance.
3. Dedupe, relation-aware conflicts, classification, approvals, traversal, hash.
4. Durable source gap and Neo4j constraints/repository/candidate pointer.
5. Bounded prose adapter/cache only after deterministic core.
6. Idempotent rebuild/status/evidence APIs and stale-source guard.
7. Existing `DocumentSetDrawer` graph section/nested evidence drawer per UI spec.
8. End-to-end collision/conflict/quarantine/delete-rebuild/hash/offline gate.

## Sources

### Primary (HIGH)
- `17-CONTEXT.md`, `17-AI-SPEC.md`, `17-UI-SPEC.md`, `.planning/ROADMAP.md`.
- Existing `knowledge-server/src/**`, tests, client knowledge services/components.
- Pilot corpus `docs/sample-markdown-flow/60000006-SHB-Credit-calculations/*.md`.
- [Neo4j driver install](https://neo4j.com/docs/javascript-manual/current/install/)
- [Transactions](https://neo4j.com/docs/javascript-manual/current/transactions/)
- [Query parameters](https://neo4j.com/docs/javascript-manual/current/query-simple/)
- [Performance](https://neo4j.com/docs/javascript-manual/current/performance/)
- [MERGE](https://neo4j.com/docs/cypher-manual/current/clauses/merge/)
- [Constraints](https://neo4j.com/docs/cypher-manual/current/constraints/)
- [Constraint management](https://neo4j.com/docs/cypher-manual/current/constraints/managing-constraints/)
- [Property values](https://neo4j.com/docs/cypher-manual/current/values-and-types/property-structural-constructed/)
- [Docker](https://neo4j.com/docs/operations-manual/current/docker/introduction/)
- [TLS](https://neo4j.com/docs/operations-manual/current/security/ssl-framework/)
- [Driver data types](https://neo4j.com/docs/javascript-manual/current/data-types/)

### Secondary (MEDIUM)
- [Official driver GitHub](https://github.com/neo4j/neo4j-javascript-driver)
- npm registry/download APIs for version/date/repository/downloads; legitimacy still assumed due absent slopcheck.

### Tertiary (LOW)
- None; unsupported architecture choices appear in Assumptions Log.

## Metadata

**Confidence breakdown:**
- Stack: HIGH existing/native/docs; MEDIUM package approval.
- Architecture: HIGH locked boundaries; MEDIUM durable storage/snapshot physical shape.
- Extraction: HIGH source shapes/precedence; MEDIUM final qualifier enum.
- Neo4j operations: MEDIUM; docs verified, live instance absent.

**Research date:** 2026-10-10  
**Valid until:** 2026-11-09; recheck driver/image versions at execution.
