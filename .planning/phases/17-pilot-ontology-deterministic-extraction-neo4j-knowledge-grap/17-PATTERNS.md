# Phase 17: Pilot Ontology, Deterministic Extraction & Neo4j Knowledge Graph - Pattern Map

**Mapped:** 2026-10-10
**Files analyzed:** 20 likely new/modified files
**Analogs found:** 20 / 20 (grouped by shared role patterns)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `knowledge-server/src/types/graphProtocol.ts` | model/config | request-response, transform | `knowledge-server/src/types/protocol.ts` | exact |
| `knowledge-server/src/graph/ontology.ts` | config/model | transform | `knowledge-server/src/types/protocol.ts` | role-match |
| `knowledge-server/src/graph/identity.ts` | utility | transform | `knowledge-server/src/indexing/chunkHashPolicy.ts` | role-match |
| `knowledge-server/src/graph/candidate.ts` | model/service | batch, transform | `knowledge-server/src/indexing/incrementalProjector.ts` | exact |
| `knowledge-server/src/graph/extraction.ts` | service | batch, transform | `knowledge-server/src/indexing/incrementalProjector.ts` | exact |
| `knowledge-server/src/graph/graphRepository.ts` | service | CRUD | `knowledge-server/src/indexing/snapshotStore.ts` | role-match |
| `knowledge-server/src/graph/neo4jRepository.ts` | service | CRUD, batch | `knowledge-server/src/indexing/snapshotStore.ts` | role/data-flow partial |
| `knowledge-server/src/ai/proseExtraction.ts` | service | request-response, transform | `src/services/knowledge/knowledgeClient.ts` | data-flow match |
| `knowledge-server/src/services/graphBuildService.ts` | service | batch, event-driven | `knowledge-server/src/services/attemptService.ts` | exact |
| `knowledge-server/src/routes/graph.ts` | route/controller | request-response | `knowledge-server/src/routes/snapshots.ts` | exact |
| `knowledge-server/src/indexing/snapshotStore.ts` | service | CRUD | same file | exact modification |
| `knowledge-server/src/services/attemptService.ts` | service | batch, event-driven | same file | exact modification |
| `knowledge-server/src/server.ts` | config | request-response | same file / `knowledge-server/tests/server.test.ts` | exact modification |
| `src/services/knowledge/knowledgeClient.ts` | service | request-response | same file | exact modification |
| `src/validation/knowledgeSchemas.ts` | model/config | request-response, transform | schemas in `src/services/knowledge/knowledgeClient.ts` | exact extraction |
| `src/components/knowledge/DocumentSetDrawer.tsx` | component | event-driven, request-response | same file | exact modification |
| `src/components/knowledge/GraphEvidenceDrawer.tsx` | component | request-response | `src/components/knowledge/DocumentSetDrawer.tsx` | role-match |
| `knowledge-server/tests/{graphIdentity,deterministicExtraction,graphCandidate,proseFallback,neo4jRepository,graphRoutes,graphRebuild}.test.ts` | test | transform, batch, request-response, CRUD | `knowledge-server/tests/pilotAcceptance.test.ts`, `server.test.ts` | exact grouped |
| `src/components/knowledge/GraphEvidenceDrawer.test.tsx` | test | event-driven | existing component-test conventions; component analog above | role-match |
| `tests/knowledge/offlineIsolation.test.ts` | test | request-response | `knowledge-server/tests/server.test.ts` | data-flow match |

Planner may collapse ontology/identity/candidate/extraction files where size stays small. Do not collapse repository interface into Neo4j adapter: fake repository enables no-Neo4j unit tests.

## Pattern Assignments

### Graph contracts and ontology (`graphProtocol.ts`, `ontology.ts`)

**Analog:** `knowledge-server/src/types/protocol.ts`

**Strict schema/version pattern** (lines 1-21, 92-107):
```typescript
import { z } from 'zod';

export const CHUNKING_POLICY_VERSION = '2026.10.1';
const sha256HexSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{64}$/, 'Must be 64-character hex SHA-256 hash');

export const EvidenceChunkSchema = z
  .object({
    occurrenceId: uuidSchema,
    chunkIndex: z.number().int().nonnegative(),
    headingPath: z.array(z.string()),
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().nonnegative(),
    rawContent: z.string(),
    contentHash: sha256HexSchema,
    chunkKey: sha256HexSchema,
  })
  .strict();
```

Copy conventions: exported `as const` vocabularies plus inferred union types; `.strict()` at every object boundary; bounded strings/arrays; version constants colocated with contracts. Extend existing exact provenance fields rather than creating alternate ranges.

Graph DTOs should cover build status/stage, counts, fact rows, evidence occurrences, conflicts, quarantine, ontology/extractor versions, active source/graph snapshot IDs. Never return source body, model prompt/output, Neo4j parameters, or credentials.

---

### Identity and fact keys (`identity.ts`)

**Analogs:** `knowledge-server/src/indexing/chunkHashPolicy.ts`; `incrementalProjector.ts` lines 124-203.

Use existing SHA-256 utility. Canonical tuple from research contract:
```typescript
sha256Hex(JSON.stringify([
  ontologyVersion,
  subjectUrn,
  relation,
  objectUrn,
  Object.entries(normalizedQualifiers).sort(([a], [b]) => a.localeCompare(b)),
]));
```

Identity must namespace source system + native type + normalized key. Keep environment, `exec_order`, evidence range, confidence, method, classification outside URN/fact key. Percent-encode separator-bearing source values. Normalize Oracle qualification without guessing `MAIN1`.

---

### Deterministic extraction and graph candidate (`candidate.ts`, `extraction.ts`)

**Analog:** `knowledge-server/src/indexing/incrementalProjector.ts`

**Immutable input/output model** (lines 6-38, 58-63):
```typescript
export interface ProjectionDocumentInput {
  documentId: string;
  title: string;
  body: string;
  tags?: readonly string[] | undefined;
}

export interface ProjectionSnapshot {
  snapshotId: string;
  setId: string;
  chunkingPolicyVersion: string;
  documents: ProjectedDocument[];
}

export interface ProjectionResult {
  candidate: ProjectionSnapshot;
  documentDeltas: ProjectionDelta<ProjectedDocument>[];
  chunkDeltas: ProjectionDelta<ProjectedChunk>[];
  summary: ProjectionSummary;
}
```

**Stable source-order transform** (lines 124-169):
```typescript
for (const source of input.documents) {
  const chunks: ProjectedChunk[] = chunkMarkdownSnapshot(source.documentId, source.body).map(
    (chunk) => ({
      occurrenceId: chunk.occurrenceId,
      contentHash: hashChunk(chunk.rawContent),
      headingPath: [...chunk.headingPath],
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      startOffset: chunk.startOffset,
      endOffset: chunk.endOffset,
      rawContent: chunk.rawContent,
    })
  );
}
```

Copy source-order iteration and explicit construction. Add deterministic sorting before normalized hash. Exact evidence check must use absolute offsets and `document.body.slice(startOffset, endOffset) === quote`. Structured nodes become consumed or quarantined; never send them to prose fallback.

Candidate merge order: deterministic nodes/`OBSERVED`; validate inferred independently; recompute key; attach duplicate evidence; retain functional-slot contradictions as conflicts; overlay only exact-key approvals; compute classification without hiding conflict; exclude quarantine from active traversal.

---

### Repository and atomic candidate lifecycle (`graphRepository.ts`, `neo4jRepository.ts`, `snapshotStore.ts`)

**Analog:** `knowledge-server/src/indexing/snapshotStore.ts`

**Candidate isolation/promotion** (lines 31-67):
```typescript
createCandidate(candidateId: string, attemptId: string, setId: string): SnapshotCandidate {
  const candidate: SnapshotCandidate = { candidateId, attemptId, setId, state: 'Building' };
  this.#candidates.set(candidateId, candidate);
  return clone(candidate);
}

promoteCandidate(candidateId: string): ProjectionSnapshot {
  const candidate = this.#requireCandidate(candidateId);
  if (candidate.state !== 'Ready' || !candidate.snapshot) {
    throw new Error('Only a complete candidate can be promoted');
  }
  const active = clone(candidate.snapshot);
  this.#activeBySet.set(candidate.setId, active);
  candidate.state = 'Active';
  return clone(active);
}
```

Keep candidate records snapshot-scoped. Neo4j adapter uses official driver, named database, constraints, parameterized static relation writers, `UNWIND` batches, sessions closed in `finally`. Model/filesystem/telemetry work stays outside retryable transaction callbacks. Activation transaction only switches `ACTIVE_GRAPH` after candidate is `READY`; stale source snapshot blocks switch.

Durable source snapshot and approval ledger cannot remain only in current Maps. Follow repository boundary and native atomic filesystem writes unless checkpoint selects approved storage.

---

### Bounded prose fallback (`ai/proseExtraction.ts`)

**Analog:** `src/services/knowledge/knowledgeClient.ts`

**Native fetch + strict parse + stable errors** (lines 184-235):
```typescript
async function request<T>(path: string, schema: z.ZodType<T>, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetcher(`${baseUrl}/api/v1${path}`, { ...init });
  } catch (error: unknown) {
    throw new KnowledgeClientError('NETWORK_ERROR', 'Network request failed');
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new KnowledgeClientError('INVALID_RESPONSE', 'Knowledge server returned invalid JSON');
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new KnowledgeClientError('INVALID_RESPONSE', 'Knowledge server returned an invalid response');
  return parsed.data;
}
```

Server adapter differences: one non-streaming `/v1/chat/completions` request; `AbortSignal.timeout(30_000)`; at most 12,000 UTF-16 input units, 1,200 output tokens, 40 candidates, 100,000 response chars; zero retries; raw JSON only; strict Zod; server assigns `LLM_PROSE` and `INFERRED`; unknown endpoint/relation/qualifier/range quarantines output. Do not log prose, prompt, raw response, token, or response body.

---

### Build orchestration (`graphBuildService.ts`, `attemptService.ts`)

**Analog:** `knowledge-server/src/services/attemptService.ts`

**Per-set serialization/idempotency** (lines 98-126):
```typescript
const key = `${setId}:${attemptKey}`;
const replayId = this.#attemptIdByKey.get(key);
if (replayId) return this.#response(this.#requireAttempt(replayId));
if (this.#activeAttemptBySet.has(setId)) throw new SetPublishInProgressError(setId);
// create candidate
const completion = Promise.resolve()
  .then(() => this.hooks.beforeProject?.())
  .then(() => this.#process(attempt))
  .catch((error: unknown) => this.#fail(attempt, error))
  .finally(() => this.#activeAttemptBySet.delete(setId));
```

**Safe failure metadata** (lines 57-75, 178-188):
```typescript
return immutableCopy({
  code: 'DOCUMENT_PROJECTION_FAILED',
  message: 'Document projection failed.',
  remedy: 'Review the indicated document and publish again.',
});
```

Graph build stages remain separate from publish states. Rebuild reads server-side active published snapshot only. Pipeline: deterministic extraction, uncovered prose fallback, merge, validate/hash, inactive Neo4j write, atomic activation. Any deterministic/repository failure keeps prior graph active. Fallback failure may promote deterministic candidate with warning and quarantines.

---

### Graph routes (`routes/graph.ts`, `server.ts`)

**Analog:** `knowledge-server/src/routes/snapshots.ts`

**Route validation and content-free errors** (lines 5-7, 38-42, 66-77):
```typescript
const SetParamsSchema = z.object({ setId: uuid }).strict();

function invalid(reply: FastifyReply) {
  return reply.code(400).send({
    error: { code: 'INVALID_REQUEST', message: 'Request could not be processed.' },
  });
}

app.get('/api/v1/sets/:setId/snapshot', async (request, reply) => {
  const params = SetParamsSchema.safeParse(request.params);
  if (!params.success) return invalid(reply);
  const snapshot = attemptService.getActiveSnapshot(params.data.setId);
  if (!snapshot) return reply.code(404).send({
    error: { code: 'SNAPSHOT_NOT_FOUND', message: 'Active snapshot was not found.' },
  });
  return serializeSnapshot(snapshot);
});
```

Add fixed endpoints for rebuild acceptance, build status, semantic fact list/evidence, and quarantine list. Reuse existing server-wide exact-origin + bearer guard; no Cypher endpoint. POST uses UUID idempotency header and `202`; concurrent different key returns `409`; GETs return strict safe DTOs.

---

### Browser schemas/client (`knowledgeSchemas.ts`, `knowledgeClient.ts`)

**Analog:** `src/services/knowledge/knowledgeClient.ts`

**Auth and response boundary** (lines 184-235):
```typescript
response = await fetcher(`${baseUrl}/api/v1${path}`, {
  ...init,
  headers: {
    Accept: 'application/json',
    Authorization: `Bearer ${options.token}`,
    ...init.headers,
  },
});
// parse JSON, check response.ok, then schema.safeParse(json)
```

**Uncertain polling** (lines 374-435): preserve last known status, use bounded exponential delay, mark uncertainty on network/abort, and do not convert connectivity loss into graph failure. Extract graph schemas into `src/validation/knowledgeSchemas.ts` only if shared by UI/client/tests; otherwise keep beside client to avoid needless file.

---

### Operational UI (`DocumentSetDrawer.tsx`, `GraphEvidenceDrawer.tsx`)

**Analog:** `src/components/knowledge/DocumentSetDrawer.tsx`

**Ant Design/state map** (lines 1-27):
```tsx
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  CloudOutlined,
  LoadingOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Alert, Button, Drawer, Space, Tag, Tooltip, Typography, theme } from 'antd';

const STATE_UI = {
  'Never published': { label: 'Chưa xuất bản', icon: <CloudOutlined />, color: 'default' },
  'In sync': { label: 'Đã đồng bộ', icon: <CheckCircleOutlined />, color: 'success' },
  Publishing: { label: 'Đang xuất bản', icon: <LoadingOutlined spin />, color: 'processing' },
  Warning: { label: 'Cảnh báo', icon: <WarningOutlined />, color: 'warning' },
  Failed: { label: 'Thất bại', icon: <CloseCircleOutlined />, color: 'error' },
} as const;
```

**Placement/fallback** (lines 159-189): add `Đồ thị tri thức` after publish actions and before history. Reuse `Space`, `Alert`, semantic `Tag`, token spacing. Parent remains 520px. Nested evidence drawer is 680px desktop/full viewport below 768px; parent selection remains mounted.

Fact rows represent one `factKey`; expansion shows all evidence. Use table horizontal scroll, stacked mobile cards, ellipsized URNs with tooltip/copy, text plus icon/color, semantic section headings, `aria-expanded`, 44px mobile icon targets. UI copy must remain Vietnamese while enums/URNs stay exact. No graph canvas, approval editing, Neo4j settings, or new route.

Rebuild confirmation explicitly says active published Markdown is input and prior graph remains until atomic success. Disable rebuild without active source snapshot, reachable configuration, or while build active. Docs CRUD/search never blocked.

---

### Tests and gold fixtures

**Analogs:** `knowledge-server/tests/pilotAcceptance.test.ts`; `knowledge-server/tests/server.test.ts`

**Exact provenance assertion** (`pilotAcceptance.test.ts` lines 202-219):
```typescript
for (const entry of FILE_ENTRIES) {
  const chunks = chunkMarkdownSnapshot(entry.docId, entry.body);
  for (const chunk of chunks) {
    const slice = entry.body.slice(chunk.startOffset, chunk.endOffset);
    expect(slice).toBe(chunk.rawContent);
    expect(chunk.contentHash).toMatch(/^[0-9a-f]{64}$/);
  }
}
```

**Atomic failure assertion** (`pilotAcceptance.test.ts` lines 379-423):
```typescript
const serializedActiveBefore = JSON.stringify(activeBeforeFailure);
// submit failing candidate
const activeAfterFailure = store.getActiveSnapshot(SET_ID);
expect(activeAfterFailure?.snapshotId).toBe(baselineSnapshotId);
expect(JSON.stringify(activeAfterFailure)).toBe(serializedActiveBefore);
```

**Authenticated route tests** (`server.test.ts` lines 11-17, 44-68):
```typescript
function requestHeaders(overrides: Record<string, string> = {}) {
  return {
    origin: ORIGIN,
    authorization: `Bearer ${TOKEN}`,
    'x-attempt-key': randomUUID(),
    ...overrides,
  };
}
```

Replace synthetic Phase 16 pilot fixture with frozen checked-in SmartVista corpus/gold labels. Required focused tests: process/container collision, schema normalization, reorder/rekey, deterministic zero-call, one-call ceiling, strict unknown keys, UTF-16 surrogate offsets, unknown endpoints, qualifier/domain guards, conflict retention, repeated evidence dedupe, exact approval carryover, evidence removal, normalized hash stability, Neo4j rollback/pointer safety, route auth/idempotency, UI labels/expansion, daemon-offline local isolation.

## Shared Patterns

### Authentication and API isolation
**Source:** `knowledge-server/tests/server.test.ts` lines 27-85; `src/services/knowledge/knowledgeClient.ts` lines 184-225.

Apply existing exact configured origin and bearer auth to every graph route. Keep token memory/runtime-only. Browser calls safe graph API only; never expose Neo4j credentials or Cypher.

### Error handling and telemetry
**Source:** `knowledge-server/src/services/attemptService.ts` lines 57-75; `src/services/knowledge/knowledgeClient.ts` lines 199-234.

Map internal errors to stable content-free codes/messages. Never persist/log source text, titles, quotes, prompts, raw model output, credentials, HTTP bodies, Neo4j parameters, or stack. UI error copy: failure, prior active graph safety, one next action.

### Exact provenance
**Source:** `knowledge-server/src/types/protocol.ts` lines 83-107; `incrementalProjector.ts` lines 137-149.

Reuse `documentId`, `occurrenceId`, `headingPath`, line range, UTF-16 offsets, raw source slice, content hash. Evidence gets separate occurrence identity; semantic duplicates share one fact.

### Candidate-before-active
**Source:** `knowledge-server/src/indexing/snapshotStore.ts` lines 31-67; `attemptService.ts` lines 164-175.

Build full candidate separately; complete, validate, then promote. Failure never mutates previous active projection. Graph pointer anchored reads prevent inactive candidate exposure.

### Deterministic ordering
**Source:** `incrementalProjector.ts` source-order loops, lines 135-179.

Sort normalized nodes by URN, facts by `factKey`, evidence by document/range/method, conflicts/quarantines by stable key. Exclude generated build IDs/timestamps from normalized projection hash.

## No Analog Found

| File/Concern | Role | Data Flow | Reason / fallback |
|---|---|---|---|
| Neo4j Bolt implementation internals | service | CRUD, batch | No current graph adapter. Use `17-RESEARCH.md` static `UNWIND` writer and atomic pointer examples plus official driver docs. |
| Durable published snapshot/approval/cache repository | service | file-I/O | Current store is memory-only. Use native filesystem atomic-write pattern selected at planning checkpoint. |
| LLM prose extraction semantics | service | request-response, transform | No server-side LLM client. Copy native fetch/Zod/error shape, then apply `17-AI-SPEC.md` ceilings and zero-retry contract. |

## Metadata

**Analog search scope:** `knowledge-server/src`, `knowledge-server/tests`, `src/services/knowledge`, `src/components/knowledge`
**Strong analogs read:** 10
**Pattern extraction date:** 2026-10-10
**Mandatory planning gates:** verify `neo4j-driver@6.2.0` legitimacy; choose durable source/approval storage; require Node 24 and live Neo4j for release integration.
