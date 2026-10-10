# Phase 18 Research — Part B: Query Planning, Traversal, RRF Fusion, Response Protocol & Verification

**Researched:** 2026-10-10  
**Domain:** LLM Logical Query Planning, Static Cypher Traversal, Reciprocal Rank Fusion, Response Protocol, and Verification  
**Confidence:** HIGH (locked constraints D-01..D-25; codebase schemas and Cypher repositories verified)

## Summary

Part B specifies the execution architecture for Phase 18:
1. Pure-identifier fast-path classifier vs LLM logical planner.
2. Provider-neutral structured output adapter (OpenAI function calling, tool use, JSON schema mode) with exactly one repair round, deterministic degraded fallback, and remote-planner DLP opt-in.
3. Snapshot-scoped entity resolution handling alias collisions, qualified Oracle names, and bounded recent-turn URNs.
4. Static parameterized Cypher traversal templates covering the 10 ontology relation types without string interpolation, honoring DISTINCT paths, evidence filtering (`OBSERVED`, `BUSINESS_APPROVED`, optional `INFERRED`), max 3 hops, maxNodes 100, maxEdges 200, and max 5 entries.
5. Reciprocal Rank Fusion ($k=60$) with stable composite key `(type, id)` deduplication, candidate retention, and response-local conflict grouping for divergent targets and contradictory evidence.
6. Request-start snapshot pinning with promotion race detection, lease/grace/stale semantics, and per-modality timeout orchestration (full-text 500 ms, vector 1500 ms, graph 2000 ms).
7. Strict Zod response envelope and DTOs mapping semantic outcomes (`READY`, `NEEDS_CLARIFICATION`, `NO_EVIDENCE`, `UNSUPPORTED`, `DEGRADED`) to HTTP 200 responses.
8. Validation suite and Acceptance Test Matrix using exact pilot process `60000006` fixtures.

---

## 1. Query Intent & Planning Pipeline

### 1.1 Fast-Path Pure-Identifier Classifier (D-03)

If the entire user query is a pure technical identifier, qualified database object, package procedure, container ID, or cycle code, retrieval bypasses LLM planning.

**Classifier Rules:**
- Strip leading/trailing whitespace.
- Match regex against candidate token:
  1. `Qualified Oracle / PLSQL identifier`: `^[A-Za-z0-9_#$]+(\.[A-Za-z0-9_#$]+)+$` (e.g. `MAIN1.FCL_CYCLE_COUNTER`, `crd_prc_billing_pkg.process`, `ru.bpc.sv2.scheduler.process.InternalProcessExecutor`).
  2. `Single technical uppercase token / source code`: `^[A-Z0-9_]{3,}$` (e.g. `AML_RISK`, `60000006`, `CRD_INVOICE`, `EVST0001`, `CYTP1001`).
- **Exclusion criteria:** Query contains whitespace, question particles (`gì`, `nào`, `sao`, `đâu`, `what`, `how`, `why`), relational verbs (`đổi tên`, `ảnh hưởng`, `gọi`, `tạo`, `reads`, `writes`), punctuation, or pronouns.
- If classifier matches: run entity resolution against active snapshot. If exactly 1 URN matches, fast-path emits a default 1-hop impact/detail plan. If 0 or >1 match, pass query to the LLM planner or ambiguity check.

### 1.2 Snapshot-Scoped Entity Resolution (D-04, D-05)

Resolution runs **server-side** against the pinned `graphSnapshotId` before calling the LLM planner.

1. **Resolution Inputs:**
   - Raw user query tokens.
   - Bounded recent conversation turns (last 2–3 turns max, extracting previously resolved URNs).
2. **Resolution Mechanics against Neo4j / In-Memory Graph:**
   - Match by `canonicalName` (case-insensitive).
   - Match by `aliases` array.
   - Match by `normalizedKey` or partial URN suffix.
3. **Disambiguation & Collision Handling (D-04):**
   - If a name matches multiple URNs across kinds (e.g. `60000006` matches both `urn:plannermate:smartvista:PRC_PROCESS:60000006` and `urn:plannermate:smartvista:PRC_CONTAINER:60000006`):
     - Check query context for keyword discrimination (e.g. `process`, `quy trình`, `container`, `bước`).
     - If context does not resolve the conflict with 100% certainty, emit `NEEDS_CLARIFICATION` with `candidates: [{ urn, canonicalName, kind }]`.
   - If a pronoun (`nó`, `cái này`, `đó`, `it`, `this`) appears without prior turn URNs: emit `NEEDS_CLARIFICATION` with safe candidate URNs or request clarification.

### 1.3 Strict Logical Query Plan Schema (Zod)

The LLM emits a strictly typed JSON object conforming to `LogicalQueryPlanSchema`:

```ts
import { z } from 'zod';
import { UrnSchema, RelationTypeSchema } from './graphProtocol.js';

export const TraversalDirectionSchema = z.enum(['OUTGOING', 'INCOMING', 'BOTH']);
export type TraversalDirection = z.infer<typeof TraversalDirectionSchema>;

export const TraversalStepSchema = z.object({
  relationType: RelationTypeSchema,
  direction: TraversalDirectionSchema.default('OUTGOING'),
  maxHops: z.number().int().min(1).max(3).default(1),
  targetKind: z.string().optional(),
}).strict();

export const LogicalQueryPlanSchema = z.object({
  planId: z.string().uuid(),
  queryIntent: z.enum(['LOOKUP', 'FLOW_TRAVERSAL', 'IMPACT_ANALYSIS', 'DEPENDENCY_CHECK']),
  seedUrns: z.array(UrnSchema).min(1).max(5),
  traversalSteps: z.array(TraversalStepSchema).max(5),
  overallMaxDepth: z.number().int().min(1).max(3).default(3),
  includeInferred: z.boolean().default(false),
  fulltextKeywords: z.array(z.string()).min(1),
  semanticQuery: z.string().min(1),
}).strict();

export type LogicalQueryPlan = z.infer<typeof LogicalQueryPlanSchema>;
```

### 1.4 Provider-Neutral Structured Output Adapter & Repair (Discretion)

- **Adapter Protocol:**
  - Support OpenAI-compatible `response_format: { type: "json_schema", json_schema: { ... } }` or function calling / tool calling (`execute_retrieval_plan`).
  - Provider configurations: Local Ollama/vLLM, Azure OpenAI, 9router, or Anthropic Claude API.
  - Zero raw Cypher accepted from LLM.
- **DLP Boundary (D-10):**
  - Planner queries send only the user query text, resolved candidate URNs, and closed ontology definition.
  - Remote planner is **off by default** (`PLANNER_REMOTE_ENABLED=false`). Enabling requires explicit configuration.
- **Repair Cycle:**
  - If output fails `LogicalQueryPlanSchema.safeParse()`:
    1. Send validation error details back to the LLM in a single repair prompt:
       `"Your query plan failed schema validation: <zod_error>. Fix the JSON to strictly conform to the schema."`
    2. Exactly 1 repair retry allowed.
    3. If repair fails: trigger **Deterministic Degraded Fallback Plan**.
- **Deterministic Degraded Fallback Plan:**
  - Runs if LLM planner times out, errors, or fails schema validation:
  - Seeds: all entity URNs resolved in Step 1.2 (if any).
  - Traversal: default 1-hop `BOTH` direction across all 10 relation types for resolved seeds. If no seed, graph modality returns `status: 'unavailable', reason: 'NO_GRAPH_SEED'`.
  - Fulltext/Semantic: use raw query string directly.
  - Response tagged with `planTrace: { fallback: true, reason: 'PLANNER_SCHEMA_FAILURE' }`.

---

## 2. Ontology Registry & Graph Traversal Architecture

### 2.1 Complete Ontology Registry (7 Node Kinds, 10 Relation Types)

Shared registry defining endpoint kinds, default directions, and traversal hop bounds:

| Relation Type | Source Kinds | Target Kinds | Default Direction | Semantic Slot | Max Hops Allowed |
|---|---|---|---|---|---|
| `CONTAINS_STEP` | `ScheduledProcess` | `ProcessStep` | `OUTGOING` | ADDITIVE | 1 |
| `PRECEDES` | `ProcessStep` | `ProcessStep` | `OUTGOING` | ADDITIVE | 2 |
| `CALLS` | `SoftwareComponent` | `SoftwareComponent` | `OUTGOING` | ADDITIVE | 3 |
| `INVOKES` | `ProcessStep` | `SoftwareComponent` | `OUTGOING` | ADDITIVE | 2 |
| `READS_FROM` | `SoftwareComponent` | `DatabaseObject` | `OUTGOING` | ADDITIVE | 3 (reverse 3) |
| `WRITES_TO` | `SoftwareComponent` | `DatabaseObject` | `OUTGOING` | ADDITIVE | 3 (reverse 3) |
| `EMITS` | `ProcessStep`, `SoftwareComponent` | `CycleType` | `OUTGOING` | ADDITIVE | 2 |
| `CONSUMES` | `ProcessStep`, `SoftwareComponent` | `CycleType` | `OUTGOING` | ADDITIVE | 2 |
| `USES_TYPE` | `SoftwareComponent`, `ProcessStep` | `CycleType` | `OUTGOING` | ADDITIVE | 2 |
| `HAS_STATUS` | `ProcessStep`, `SoftwareComponent` | `Status` | `OUTGOING` | FUNCTIONAL | 1 |

### 2.2 Static Parameterized Cypher Traversal Templates (D-15, D-16)

Zero string concatenation. All variable values (`$snapshotId`, `$seedUrns`, `$evidenceClasses`, `$limitNodes`, `$limitEdges`) are passed via Neo4j parameters.

#### Template 1: Outgoing Typed Traversal (Depth 1–3)
```cypher
UNWIND $seedUrns AS seedUrn
MATCH (s:Entity {urn: seedUrn, graphSnapshotId: $snapshotId})
MATCH path = (s)-[relList:CONTAINS_STEP|PRECEDES|CALLS|INVOKES|READS_FROM|WRITES_TO|EMITS|CONSUMES|USES_TYPE|HAS_STATUS*1..3]->(target:Entity {graphSnapshotId: $snapshotId})
WHERE ALL(r IN relationships(path) WHERE r.effectiveClassification IN $evidenceClasses)
  AND ALL(n IN nodes(path) WHERE n.graphSnapshotId = $snapshotId)
WITH path, relationships(path) AS rels, nodes(path) AS nds
LIMIT $pathLimit
UNWIND rels AS rel
UNWIND nds AS node
RETURN DISTINCT
  node.urn AS nodeUrn,
  node.canonicalName AS nodeName,
  node.kind AS nodeKind,
  rel.factKey AS factKey,
  rel.subjectUrn AS subjectUrn,
  type(rel) AS relationType,
  rel.objectUrn AS objectUrn,
  rel.effectiveClassification AS evidenceClass,
  rel.hasConflict AS hasConflict
LIMIT $maxEdges
```

#### Template 2: Incoming Reverse Traversal (Impact Analysis, e.g. "Who reads/writes AML_RISK")
```cypher
UNWIND $seedUrns AS seedUrn
MATCH (target:Entity {urn: seedUrn, graphSnapshotId: $snapshotId})
MATCH path = (source:Entity {graphSnapshotId: $snapshotId})-[relList:READS_FROM|WRITES_TO|INVOKES|CALLS*1..3]->(target)
WHERE ALL(r IN relationships(path) WHERE r.effectiveClassification IN $evidenceClasses)
  AND ALL(n IN nodes(path) WHERE n.graphSnapshotId = $snapshotId)
WITH path, relationships(path) AS rels, nodes(path) AS nds
LIMIT $pathLimit
UNWIND rels AS rel
UNWIND nds AS node
RETURN DISTINCT
  node.urn AS nodeUrn,
  node.canonicalName AS nodeName,
  node.kind AS nodeKind,
  rel.factKey AS factKey,
  rel.subjectUrn AS subjectUrn,
  type(rel) AS relationType,
  rel.objectUrn AS objectUrn,
  rel.effectiveClassification AS evidenceClass,
  rel.hasConflict AS hasConflict
LIMIT $maxEdges
```

#### Template 3: Directed Step-by-Step Traversal Template
When the plan specifies exact `(relationType, direction)` pairs, the engine dispatches to pre-registered static queries in `CYPHER_QUERIES`:
- `TRAVERSE_OUTGOING_STEP`: single-hop outgoing on specific relation.
- `TRAVERSE_INCOMING_STEP`: single-hop incoming on specific relation.
- `TRAVERSE_BOUNDED_IMPACT_3HOP`: pre-compiled 3-hop reverse path from `DatabaseObject` up through `SoftwareComponent`, `ProcessStep`, to `ScheduledProcess`.

**Hard Limits Enforced (D-15):**
- Parameters: `limitNodes: 100`, `maxEdges: 200`, `pathLimit: 100`.
- If result reaches cap: response sets `graphStatus = 'truncated'`, `truncationReason = 'RESULT_LIMIT_REACHED'`.

---

## 3. Reciprocal Rank Fusion & Deduplication Engine (D-17..D-20)

### 3.1 RRF Formula ($k = 60$)
For each item $d$ returned by one or more modalities:
$$\text{RRF\_Score}(d) = \sum_{m \in M(d)} \frac{1}{60 + \text{rank}_m(d)}$$
where:
- $\text{rank}_m(d)$ is 1-based index (1, 2, ...) of item $d$ in modality $m$.
- Modalities $M \subseteq \{\text{'fulltext'}, \text{'vector'}, \text{'graph'}\}$.
- Chunks appearing in both fulltext and vector rank higher naturally.

### 3.2 Cross-Modality Deduplication Key: `(type, id)` (D-18)
Items belong to one of 3 distinct types. No cross-type collapsing:
1. `chunk`: ID is `chunkId` (normalized SHA-256 chunkKey).
2. `entity`: ID is `urn`.
3. `edge`: ID is `factKey` (SHA-256).

**Tie-Breaking Rule:**
When RRF scores tie:
1. Higher number of `modalitiesContributed.length`.
2. Modality priority: `vector` > `fulltext` > `graph`.
3. Lexicographical comparison of item ID.
Ensures deterministic ordering across runs.

### 3.3 Response Item Array & Top-K Cutoff (D-19, D-20)
- Calculate total candidates across all modalities ($N_{\text{total}}$).
- Default top-K: 20 (overridable 10–50 via query parameter `limit`).
- Output is a single flat `items[]` array.

---

## 4. Conflict Surfacing Heuristics (D-21)

The server detects contradictory evidence heuristically and retains both sides:

### Heuristic 1: Divergent Functional Targets
For `FUNCTIONAL` relations (`HAS_STATUS` or single-valued steps):
- Same `subjectUrn` + same `relationType` + different `objectUrn` within active graph view.
- Flag both edges with `hasConflict: true`, assign a deterministic response-local UUID `conflictGroupId = sha256("CONFLICT:" + subjectUrn + ":" + relationType)`.

### Heuristic 2: Contradictory In-Memory / Evidence Assertions
- Edges carrying identical `(subjectUrn, relationType, objectUrn)` but conflicting qualifiers or contradictory prose assertions (detected via Phase 17 `GraphConflictRecord`).
- Both records included in `items[]` with shared `conflictGroupId`.
- Server never discards an assertion or picks a winner.

---

## 5. Snapshot Pinning, Concurrency & Leases (D-24)

### 5.1 Request-Start Snapshot Pinning
1. At the arrival of `POST /api/v1/sets/:setId/retrieve`:
   - Resolve active `snapshotId = snapshotStore.getActiveSnapshot(setId)?.snapshotId` (or Neo4j active pointer).
   - If no active snapshot exists: return `outcome: 'NO_EVIDENCE'`, reason: `'NO_ACTIVE_SNAPSHOT'`.
2. Pin this `pinnedSnapshotId` for the entire lifetime of the request.
3. Pass `pinnedSnapshotId` into fulltext query, vector query, and graph Cypher query.

### 5.2 Promotion Race Detection & Grace Semantics
- If a background publish rebuild executes `ACTIVATE_CANDIDATE` during request execution:
  - Old snapshot becomes `SUPERSEDED`.
  - Queries querying with `pinnedSnapshotId` continue safely because snapshot-specific labels and properties (`:ChunkSnapshot_<hex>`, `graphSnapshotId`) remain intact.
  - Snapshot drop/cleanup enforces a minimum **10-minute grace period** or active request lease counter before dropping old indexes/nodes.
  - If a modality detects its index was dropped mid-flight: returns `status: 'stale'`. Response flags `modalityStatus[m].status = 'stale'`.

---

## 6. Timeout & Degraded Orchestration (D-11, D-25)

### 6.1 Parallel Fan-Out Architecture

```ts
// Orchestration using AbortController and Promise.allSettled
const TIMEOUT_FT = parseInt(process.env.RETRIEVAL_TIMEOUT_FULLTEXT_MS ?? '500', 10);
const TIMEOUT_VEC = parseInt(process.env.RETRIEVAL_TIMEOUT_VECTOR_MS ?? '1500', 10);
const TIMEOUT_GRAPH = parseInt(process.env.RETRIEVAL_TIMEOUT_GRAPH_MS ?? '2000', 10);

const fulltextAbort = new AbortController();
const vectorAbort = new AbortController();
const graphAbort = new AbortController();

const [ftResult, vecResult, graphResult] = await Promise.allSettled([
  runFulltextModality(query, pinned, { signal: fulltextAbort.signal, timeoutMs: TIMEOUT_FT }),
  runVectorModality(query, pinned, { signal: vectorAbort.signal, timeoutMs: TIMEOUT_VEC }),
  runGraphModality(plan, pinned, { signal: graphAbort.signal, timeoutMs: TIMEOUT_GRAPH }),
]);
```

### 6.2 Modality Cancellation & Caveats
- **Neo4j Cypher:** Can be cancelled via driver query cancellation or transaction timeout `txConfig: { timeout: TIMEOUT_GRAPH }`.
- **Fetch (Remote Embeddings):** Fully aborted via native `signal: vectorAbort.signal`.
- **Local ONNX CPU inference:** Once execution enters the C++ native layer of ONNX Runtime, execution cannot be interrupted synchronously mid-tensor.
  - *Mitigation:* Wrap local inference with `Promise.race([inferencePromise, timeoutPromise])`. If timeout fires first, discard result immediately and mark `status: 'timeout'`.

---

## 7. Retrieval Request / Response Protocol (Zod DTOs)

### 7.1 Uniform Response Envelope Schema (D-23)

```ts
import { z } from 'zod';
import {
  UrnSchema,
  FactKeySchema,
  EvidenceClassificationSchema,
  GraphEvidenceRecordSchema,
} from './graphProtocol.js';

export const RetrievalOutcomeSchema = z.enum([
  'READY',
  'NEEDS_CLARIFICATION',
  'NO_EVIDENCE',
  'UNSUPPORTED',
  'DEGRADED',
]);
export type RetrievalOutcome = z.infer<typeof RetrievalOutcomeSchema>;

export const ModalityStatusEnum = z.enum(['ready', 'timeout', 'unavailable', 'stale', 'error']);

export const ModalityDiagnosticSchema = z.object({
  status: ModalityStatusEnum,
  itemCount: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  reason: z.string().optional(),
}).strict();

export const RetrievalChunkItemSchema = z.object({
  type: z.literal('chunk'),
  id: z.string(), // chunkId / content hash
  score: z.number().positive(),
  modalitiesContributed: z.array(z.string()),
  documentId: z.string().uuid(),
  documentTitle: z.string(),
  headingPath: z.array(z.string()),
  lineStart: z.number().int().positive(),
  lineEnd: z.number().int().positive(),
  rawSnippet: z.string(),
  snapshotId: z.string(),
  conflictGroupId: z.string().optional(),
  hasConflict: z.boolean().default(false),
}).strict();

export const RetrievalEntityItemSchema = z.object({
  type: z.literal('entity'),
  id: UrnSchema,
  score: z.number().positive(),
  modalitiesContributed: z.array(z.string()),
  urn: UrnSchema,
  canonicalName: z.string(),
  kind: z.string(),
  snapshotId: z.string(),
  conflictGroupId: z.string().optional(),
  hasConflict: z.boolean().default(false),
}).strict();

export const RetrievalEdgeItemSchema = z.object({
  type: z.literal('edge'),
  id: FactKeySchema,
  score: z.number().positive(),
  modalitiesContributed: z.array(z.string()),
  factKey: FactKeySchema,
  subjectUrn: UrnSchema,
  relationType: z.string(),
  objectUrn: UrnSchema,
  evidenceClass: EvidenceClassificationSchema,
  supportingChunkIds: z.array(z.string()), // Reference-based dedup (D-22)
  snapshotId: z.string(),
  conflictGroupId: z.string().optional(),
  hasConflict: z.boolean().default(false),
}).strict();

export const RetrievalItemSchema = z.discriminatedUnion('type', [
  RetrievalChunkItemSchema,
  RetrievalEntityItemSchema,
  RetrievalEdgeItemSchema,
]);

export const RetrievalResponseSchema = z.object({
  outcome: RetrievalOutcomeSchema,
  snapshotId: z.string(),
  embeddingProvider: z.string(),
  items: z.array(RetrievalItemSchema),
  totalCandidates: z.number().int().nonnegative(),
  modalityStatus: z.object({
    fulltext: ModalityDiagnosticSchema,
    vector: ModalityDiagnosticSchema,
    graph: ModalityDiagnosticSchema,
  }).strict(),
  planTrace: z.object({
    fastPath: z.boolean(),
    intent: z.string().optional(),
    seeds: z.array(UrnSchema).optional(),
    depth: z.number().optional(),
    degradedFallback: z.boolean().default(false),
  }).strict(),
  candidates: z.array(z.object({
    urn: UrnSchema,
    canonicalName: z.string(),
    kind: z.string(),
  })).optional(), // For NEEDS_CLARIFICATION
  refinements: z.array(z.string()).optional(), // For NO_EVIDENCE
  unsupportedConstructs: z.array(z.string()).optional(), // For UNSUPPORTED
}).strict();

export type RetrievalResponse = z.infer<typeof RetrievalResponseSchema>;
```

---

## 8. Pilot Test Fixture Architecture & Acceptance Cases

Tests reside in `knowledge-server/tests/retrievalAcceptance.test.ts` extending the checked-in corpus `docs/sample-markdown-flow/60000006-SHB-Credit-calculations/`:

| Case ID | Query Text | Plan Type | Expected Outcome | Expected Items / Assertions |
|---|---|---|---|---|
| TC-01 | `"MAIN1.FCL_CYCLE_COUNTER"` | FAST_PATH | `READY` | Full-text matches exact table; Entity resolved; 1-hop relations returned. |
| TC-02 | `"AML_RISK đổi tên ảnh hưởng gì"` | PLANNER (Impact) | `READY` | Multilingual retrieval finds English docs; 3-hop reverse path from `AML_RISK` to `ScheduledProcess:60000006`. |
| TC-03 | `"cái này đổi có ảnh hưởng gì"` | AMBIGUOUS | `NEEDS_CLARIFICATION` | Pronoun without seed URN returns safe candidate entities; no best-guessing. |
| TC-04 | 3-hop traversal query | PLANNER (Flow) | `READY` | Distinct path verified; `ScheduledProcess` -> `ProcessStep` -> `SoftwareComponent` -> `DatabaseObject`. |
| TC-05 | Conflicting relation query | PLANNER | `READY` | Both conflicting statements returned with matching `conflictGroupId` and `hasConflict: true`. |
| TC-06 | Promotion race condition | ANY | `READY` | In-flight query finishes referencing pinned snapshot; response tags pinned ID. |
| TC-07 | Vector offline / unconfigured | DEGRADED | `DEGRADED` | Vector status `unavailable`, fulltext + graph fused; response marked `outcome: 'DEGRADED'`. |
| TC-08 | High-depth runaway query | RUNAWAY | `READY` (Truncated) | Depth capped at 3, `graphStatus: 'truncated'`, max nodes <= 100, max edges <= 200. |

---

## 9. Validation Architecture

### Test Commands
- Quick test suite: `npm test` in `knowledge-server/` (`vitest run`).
- Targeted retrieval acceptance: `npx vitest run tests/retrievalAcceptance.test.ts`.

### Mapping Roadmap & RETR Requirements to Automated Checks

| Requirement | Behavior | Automated Check | Expected Output |
|---|---|---|---|
| **RETR-01** | Full-text technical identifier search | `test('RETR-01: exact lookup')` | `items.some(i => i.rawSnippet.includes('MAIN1.FCL_CYCLE_COUNTER'))` |
| **RETR-02** | Vietnamese ↔ English semantic query | `test('RETR-02: multilingual search')` | `items.some(i => i.id.includes('AML_RISK'))` |
| **RETR-03** | Bounded graph process flow | `test('RETR-03: flow traversal')` | `items.filter(i => i.type === 'edge').length > 0` |
| **RETR-04** | 1–3 hop impact query | `test('RETR-04: 3-hop impact')` | Path from `DatabaseObject` to `ScheduledProcess` validated |
| **RETR-05** | Ranked deduplicated RRF fusion | `test('RETR-05: RRF fusion')` | Single sorted `items[]`, RRF scores descending, `modalitiesContributed` populated |

---

## 10. Risks & Mitigations

1. **Path Blow-Up in Cyclic Graphs:**
   - *Risk:* Graph loops cause exponential path combinations.
   - *Mitigation:* Cypher DISTINCT path semantics + `LIMIT $pathLimit` + hard caps `maxNodes=100`, `maxEdges=200` (D-15).
2. **Hallucinated URNs by LLM:**
   - *Risk:* LLM invents nonexistent entities.
   - *Mitigation:* Server resolves all URNs before LLM invocation. Planner JSON schema validates seed URNs against server-provided candidates (D-02, D-05).
3. **Timeout Leakage:**
   - *Risk:* One hung modality blocks client response.
   - *Mitigation:* Strict `Promise.allSettled` + `AbortController` with per-modality timeouts (D-25).
4. **ONNX Cold-Start Stalling:**
   - *Risk:* First local model load blocks event loop.
   - *Mitigation:* Pre-warm model in background at server start; return degraded fallback if query arrives during warm-up.
5. **Snapshot Pointer Inconsistency:**
   - *Risk:* Chunks from Snapshot B cite nodes from Snapshot A.
   - *Mitigation:* Request-start snapshot pinning (D-24). All modalities bind to `pinnedSnapshotId`.
6. **Tie-Break Flapping in RRF:**
   - *Risk:* Flapping item order across identical requests.
   - *Mitigation:* Strict multi-key tie-breaker (modality count -> priority -> ID string compare).

---

## 11. Plan Decomposition Guidance

To avoid file conflicts across plans, decompose Phase 18 into distinct waves:
- **Wave 1:** Core types, Zod schemas, ontology registry, and RRF engine (`src/types/retrievalProtocol.ts`, `src/retrieval/rrf.ts`).
- **Wave 2:** Neo4j Full-Text and Vector index creation & queries (`src/graph/neo4jRepository.ts`, `src/retrieval/vectorStore.ts`).
- **Wave 3:** Embedding adapters (Local ONNX `@xenova/transformers` + Remote `/v1/embeddings`) (`src/embedding/*`).
- **Wave 4:** Query Planner (Fast-path classifier, LLM adapter, schema repair, degraded fallback) (`src/retrieval/planner.ts`).
- **Wave 5:** Graph Traversal Engine (Static Cypher templates, conflict grouping) (`src/retrieval/graphTraversal.ts`).
- **Wave 6:** Retrieval Orchestrator service & Fastify route (`src/services/retrievalService.ts`, `src/routes/retrieval.ts`).
- **Wave 7:** Acceptance test suite (`tests/retrievalAcceptance.test.ts`).

## RESEARCH COMPLETE
