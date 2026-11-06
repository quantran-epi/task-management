# Phase 28: Query-Only Knowledge Retrieval - Pattern Map

**Mapped:** 2026-11-05
**Files analyzed:** 25 source files + 11 test files
**Analogs found:** 24 / 25 (2 new modules have partial analogs; see "No Exact Analog Found")

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `knowledge-server/src/types/retrievalProtocol.ts` | config/schema | transform | same file (extend in place) | exact |
| `knowledge-server/src/routes/retrieval.ts` | route | request-response | same file (extend `/api/v1/retrieve` handler) | exact |
| `knowledge-server/src/services/federatedRetrievalService.ts` | service | batch | same file (deadline + ledger) | exact |
| `knowledge-server/src/services/publishedSetDiscovery.ts` | service | CRUD (read) | `knowledge-server/src/services/federatedRetrievalService.ts` (dependency-injected service + typed result) | role-match |
| `knowledge-server/src/services/snapshotLexicalRetrieval.ts` | service | transform | `src/utils/bm25.ts` + `src/services/search/localGroundedRetrieval.ts` | partial (algorithm analog; must be server-local copy) |
| `knowledge-server/src/indexing/snapshotStore.ts` | model/store | CRUD | same file (`getActiveSnapshot`, `registerActiveSnapshot`) | exact |
| `knowledge-server/src/services/retrievalService.ts` | service | request-response | same file (`retrieve` lease path) | exact |
| `knowledge-server/src/graph/neo4jRepository.ts` | model/gateway | CRUD | same file (`getActiveGraph`, `acquirePinnedSnapshot`) | exact |
| `knowledge-server/src/server.ts` | config/wiring | request-response | same file (`registerRetrievalRoutes` guard) | exact |
| `knowledge-server/src/main.ts` | config/wiring | event-driven (startup) | same file (`retrievalService` construction) | exact |
| `src/services/knowledge/retrievalProtocol.ts` | config/schema | transform | same file (mirror of server schema) | exact |
| `src/services/knowledge/knowledgeClient.ts` | service | request-response | same file (`retrieveFederated`) | exact |
| `src/services/ai/knowledgeOutcome.ts` | utility | transform | `src/services/wizard/workflowGuards.ts` (code → canonical message map) | role-match |
| `src/services/ai/knowledgeRetrievalTool.ts` | service/tool | request-response | same file (`executeKnowledgeRetrievalTool`) | exact |
| `src/services/ai/groundedTurn.ts` | service/orchestrator | request-response | same file (`runGroundedTurn` scope gate) | exact |
| `src/services/ai/evidencePack.ts` | utility | transform | same file (`packEvidence` dedupe/paths/conflicts) | exact |
| `src/services/ai/aiTools.ts` | config/schema | transform | same file (`retrieve_knowledge` definition + dispatch) | exact |
| `src/services/ai/groundedTurnDeps.ts` | config/wiring | request-response | same file (`createDefaultGroundedTurnDeps`) | exact |
| `src/services/ai/semanticScopeRouter.ts` | service | transform | same file (`routeScope`) — audit only | exact |
| `src/components/ai/AIChatDrawer.tsx` | component | request-response | same file (grounded prelude) | exact |
| `src/components/ai/grounded/SourcesPanel.tsx` | component | request-response (render) | same file (Ant Design `Table`) | exact |
| `src/components/notes/QuickPreviewDrawer.tsx` | component | file-I/O (read) | same file (`cited-excerpt-panel` branch) | exact |
| `src/components/sdlc/chat/StepChatPanel.tsx` | component | event-driven (tool events) | same file (`onToolEvent`) | exact |
| `src/services/telegram/telegramHeadlessWorker.ts` | service/worker | request-response | same file (`runTelegramGroundedTurn`, `formatGroundedNonAnswer`) | exact |
| `src/services/wizard/sdlcWizardRuntime.ts` | service | request-response | same file (`resolveSetIds`) — audit only | exact |

## Pattern Assignments

### `knowledge-server/src/types/retrievalProtocol.ts` (schema, transform)

**Analog:** same file.

**Import pattern** (lines 1-8):
```typescript
import { z } from 'zod';
import {
  UrnSchema,
  FactKeySchema,
  NodeKindSchema,
  RelationTypeSchema,
  EvidenceClassificationSchema,
} from './graphProtocol.js';
```

**Outcome enum extension pattern** (lines 13-23) — add exactly one wire-visible code; keep order and mirror it in the client:
```typescript
export const RETRIEVAL_OUTCOMES = [
  'READY',
  'NEEDS_CLARIFICATION',
  'NO_EVIDENCE',
  'UNSUPPORTED',
  'DEGRADED',
  'SEED_ONLY',
] as const;

export const RetrievalOutcomeSchema = z.enum(RETRIEVAL_OUTCOMES);
export type RetrievalOutcome = z.infer<typeof RetrievalOutcomeSchema>;
```

**Strict request pattern to replace on the wire** (lines 680-689). Keep this type as the internal resolved request; add a separate thin wire schema:
```typescript
export const FederatedRetrievalRequestSchema = z.strictObject({
  query: z.string().trim().min(1).max(4000),
  setTierAssignments: z.array(FederatedSetTierAssignmentSchema).min(1).max(50),
  comparisonMode: z.enum(['single', 'baseline_vs_scope']).nullable(),
  budgets: FederatedRetrievalBudgetsSchema,
  limit: z.number().int().min(10).max(50).default(20),
  includeInferred: z.boolean().default(false),
  recentTurns: z.array(ConversationTurnSchema).max(3).default([]),
  contextHints: RetrievalContextHintsSchema.optional(),
});
```

**Attribution wrapper pattern to imitate** (lines 693-718). New coverage ledger entries must be `strictObject`, bounded with `.max(...)`, and carry `setId` (nullable only where genuinely set-independent):
```typescript
export const FederatedRetrievalItemSchema = z.strictObject({
  setId: z.string().uuid(),
  snapshotId: SnapshotIdSchema,
  roleGroup: z.enum(['baseline', 'scope_diff']),
  item: RetrievalItemSchema,
});

export const FederatedCoverageWarningSchema = z.strictObject({
  code: z.enum(['TIMEOUT', 'STALE', 'ERROR', 'BUDGET_SETS', 'BUDGET_ITEMS', 'BUDGET_EVIDENCE', 'BUDGET_ELAPSED']),
  setId: z.string().uuid().nullable(),
  message: z.string().min(1).max(300),
});
```

**Closure superRefine pattern** (lines 735-757) — extend, do not duplicate. Current rule enforces one snapshot per set across items/paths/conflicts:
```typescript
.superRefine((response, ctx) => {
  const snapshotsBySet = new Map<string, string>();
  const entries = [...response.items, ...response.paths, ...response.conflictGroups];
  entries.forEach((entry, index) => {
    const pinned = snapshotsBySet.get(entry.setId);
    if (pinned && pinned !== entry.snapshotId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['items', index, 'snapshotId'],
        message: 'One setId must not contain multiple snapshotIds' });
    } else {
      snapshotsBySet.set(entry.setId, entry.snapshotId);
    }
  });
  ...
});
```

**Gap to close here:** the per-set closure check at lines 524-549 validates `hopCitationIds ⊆ returned chunk ids`; the federated schema has no equivalent. Add the same hop-membership check per `setId`, or drop orphan paths before parse.

---

### `knowledge-server/src/routes/retrieval.ts` (route, request-response)

**Analog:** same file.

**Validation + generic-400 pattern** (lines 16-23, 135-140):
```typescript
function invalid(reply: FastifyReply) {
  return reply.code(400).send({
    error: { code: 'INVALID_REQUEST', message: 'Request could not be processed.' },
  });
}

// POST /api/v1/retrieve
app.post('/api/v1/retrieve', async (request, reply) => {
  const body = FederatedRetrievalRequestSchema.safeParse(request.body);
  if (!body.success) {
    return invalid(reply);
  }
  ...
});
```

**Dependency-injection pattern** (lines 142-145) — the resolver can be injected the same way, so route tests need no Neo4j:
```typescript
const deps: FederatedRetrievalDependencies = federatedDeps ?? {
  retrievePerSet: (setId, req, signal) =>
    retrievalService.retrieve(setId, req, signal ? { signal } : undefined),
};
```

**Error envelope pattern** (lines 149-162): parse response before send, log content-free, generic 500:
```typescript
try {
  const response = await runFederatedRetrieval(body.data, deps, requestSignal ? { signal: requestSignal } : undefined);
  const validated = FederatedRetrievalResponseSchema.parse(response);
  return reply.code(200).send(validated);
} catch {
  request.log.error({ code: 'INTERNAL_ERROR' }, 'Federated retrieval failed');
  return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Request could not be processed.' } });
}
```

**Required change:** resolve `{query, limit?, setIds?}` → internal `FederatedRetrievalRequest` here (or in a small resolver called from here). Do not add a route. Do not let an unknown explicit `setIds` fall through to the published-set default (D-05).

---

### `knowledge-server/src/services/federatedRetrievalService.ts` (service, batch)

**Analog:** same file.

**Bounded fan-out primitives** (lines 80-143): `runWithTimeout` composes parent signal + per-task deadline; `mapConcurrent` is a worker pool. Extend `mapConcurrent` with a deadline predicate (queued items must be skipped and reported, not started).

**Dependency interface pattern** (lines 57-64):
```typescript
export interface FederatedRetrievalDependencies {
  retrievePerSet(
    setId: string,
    request: { query: string; limit: number; includeInferred: boolean; recentTurns: any[] },
    signal?: AbortSignal
  ): Promise<RetrievalResponse>;
  now?(): number;
}
```

**Modality severity merge** (lines 17-31, 448-492): keep; use it to make all-failed truthful. Note the existing bug — statuses initialize to `ok` (lines 449-453) and are only overwritten by successful responses, so `allTimedOut` is the sole failure branch (lines 456-468).

**Packing budget pattern** (lines 181-277) — dedupe key at 248 uses `setId:type:id`; char check at 253:
```typescript
const key = `${assignment.setId}:${it.type}:${it.id}`;
if (retainedNonGraphKeys.has(key)) continue;
retainedNonGraphKeys.add(key);
...
const itemChars = computeEvidenceChars(it);
if (totalCharsIncluded + itemChars > budgets.maxEvidenceChars && items.length > 0) {
  truncated = 'evidence';
  break;
}
```
Apply the cap to the first item too (skip + `BUDGET_EVIDENCE`/`BUDGET_ITEMS` ledger entry). Keep paths/conflict wrappers per set (lines 209-232) — never concatenate `nodeUrns` across sets/snapshots.

**Coverage ledger pattern to add:** build from `perSetResults` alongside `coverageWarnings`; classify each set as `CONTRIBUTED | SEARCHED_NO_EVIDENCE | FAILED | TIMED_OUT | NOT_SEARCHED_BUDGET | UNAVAILABLE`. `contributingSets` at line 531 already distinguishes responses; extend that predicate instead of adding a parallel loop.

---

### `knowledge-server/src/services/publishedSetDiscovery.ts` (NEW — service, read)

**Analog:** `knowledge-server/src/services/federatedRetrievalService.ts` (deps-injected service returning a typed result) and `knowledge-server/src/indexing/snapshotStore.ts` (state source).

**Pattern to copy — constructor dependency + plain result type** (federatedRetrievalService lines 57-64), plus the store's clone-on-read discipline (snapshotStore lines 145-148):
```typescript
getActiveSnapshot(setId: string): ProjectionSnapshot | null {
  const snapshot = this.#activeBySet.get(setId);
  return snapshot ? clone(snapshot) : null;
}
```

**Contract:** `listActiveSnapshots(): Array<{setId, snapshotId}>` sorted by `setId`; resolve explicit `setIds` by exact match; unknown/unpublished → `UNAVAILABLE`/`UNPUBLISHED` attribution, never broaden. Readiness comes from `neo4jRepository.getActiveGraph` (`retrievalGeneration` present?) — see next section.

**Do not** create a second registry, a client catalog sync, or a DB table. `SnapshotStore.#activeBySet` is private; add the enumeration method inside `snapshotStore.ts`.

---

### `knowledge-server/src/services/snapshotLexicalRetrieval.ts` (NEW — service, transform)

**Algorithm analog:** `src/utils/bm25.ts` (whole file, 214 lines) — reuse behavior, do not import (server `rootDir: src`).

**Normalization + tokenization** (lines 23-44):
```typescript
export function normalizeVietnamese(text: string): string {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

export function tokenize(text: string): string[] {
  if (!text) return [];
  const normalized = normalizeVietnamese(text);
  return normalized.split(/[^a-z0-9_]+/i).filter((token) => token.length > 1);
}
```

**Ranking** (lines 52-136): Okapi BM25, `k1=1.2`, `b=0.75`, title ×3 / tags ×2 / body ×1 weighting, Robertson-Spärck Jones IDF with smoothing, `results.sort((a,b) => b.score - a.score)`.

**Input shape** — `ProjectionSnapshot` from `knowledge-server/src/indexing/incrementalProjector.ts` lines 14-39 (`ProjectedChunk` has `occurrenceId`, `headingPath`, `startLine`, `endLine`, `startOffset`, `endOffset`, `rawContent`; `ProjectedDocument` has `documentId`, `title`, `contentHash`; snapshot has `snapshotId`, `setId`).

**Output shape:** emit existing `ChunkItem` (`retrievalProtocol.ts` lines 339-356) with `snapshotId = ProjectionSnapshot.snapshotId`, `publishedContentHash = document.contentHash`, `modalitiesContributed: ['fulltext']`, `id = occurrenceId`. Set `modalityStatus.fulltext.reason` to a snapshot-lexical code so clients don't claim index-backed fulltext.

**Local snippet window analog** (snippet extraction with line/offset windows): `src/services/search/localGroundedRetrieval.ts` lines ~140-175 — `rawSnippet = body.slice(startOffset, endOffset)`, 1-based line numbers.

**Test analog:** `knowledge-server/tests/incrementalProjector.test.ts` (pure projector tests, no Fastify) + `tests/utils/bm25.test.ts` behavior cases.

---

### `knowledge-server/src/indexing/snapshotStore.ts` (store, CRUD)

**Analog:** same file.

**Clone-on-read + private map** (lines 30-32, 145-157):
```typescript
function clone<T>(value: T): T {
  return structuredClone(value);
}
...
getActiveSnapshot(setId: string): ProjectionSnapshot | null { ... }
registerActiveSnapshot(setId: string, snapshot: ProjectionSnapshot): void { ... }
```

**Add** a read-only enumeration method returning deterministic order (`[...this.#activeBySet.keys()].sort()`), cloned entries. No persistence change; `#loadPersistedState` (lines 58-103) already restores the map on startup.

---

### `knowledge-server/src/services/retrievalService.ts` (service, request-response)

**Analog:** same file.

**Lease acquisition + typed unavailability** (lines 257-303):
```typescript
async retrieve(setId, rawRequest, options?): Promise<RetrievalResponse> {
  const request = RetrievalRequestSchema.parse(rawRequest);
  const lease = await this.deps.indexGateway.acquirePinnedSnapshot(setId);
  if (!lease) {
    return RetrievalResponseSchema.parse({
      outcome: 'NO_EVIDENCE',
      snapshotId: 'gsnap_00000000',
      ...
      modalityStatus: {
        fulltext: { status: 'unavailable', latencyMs: 0, itemCount: 0, reason: 'PINNED_SNAPSHOT_UNAVAILABLE' },
        ...
      },
      reason: 'PINNED_SNAPSHOT_UNAVAILABLE',
      suggestedRefinements: ['Activate or rebuild a valid knowledge graph snapshot before querying.'],
    });
  }
  try { return await this.executeUnderLease(setId, lease, request, options); }
  finally { try { await lease.release(); } catch { /* swallowed */ } }
}
```
The `snapshotId: 'gsnap_00000000'` fallback is a placeholder — for Phase 28 route to snapshot-lexical before this branch when an active published snapshot exists, and never report a fabricated snapshot when none does.

**Graph readiness prerequisite** — `knowledge-server/src/graph/neo4jRepository.ts` lines 1093-1098:
```typescript
async acquirePinnedSnapshot(setId: string): Promise<PinnedRetrievalSnapshot | null> {
  const active = await this.getActiveGraph(setId);
  if (!active || !active.retrievalGeneration) {
    return null;
  }
  ...
}
```
Use `getActiveGraph` (lines 975-1013) as the readiness probe: `retrievalGeneration` present → graph/vector/index available; absent → `PUBLISHED_ONLY` lexical only.

---

### `knowledge-server/src/server.ts` + `knowledge-server/src/main.ts` (wiring)

**Analog:** same files.

**Conditional registration** (`server.ts` lines 149-151; `main.ts` lines 405, 488-498):
```typescript
if (options.retrievalService) {
  registerRetrievalRoutes(app, options.retrievalService);
}
```
```typescript
if (options.neo4j.enabled && options.neo4j.uri) {
  ...
  retrievalService = new RetrievalService({ indexGateway, embeddingProvider, queryPlanner, graphGateway }, { timeouts: options.timeouts });
}
```
This is why query-only retrieval fails without Neo4j. Add a snapshot-lexical-capable dependency (e.g. `federatedDeps`) constructed from `snapshotStore` regardless of Neo4j, and register the route when either is present. Keep auth/origin hooks untouched (`server.ts` lines 104-121).

---

### `src/services/knowledge/retrievalProtocol.ts` (schema, transform)

**Analog:** same file — it is a byte-for-byte mirror of the server schema for the shared sections.

Mirror every change made to `knowledge-server/src/types/retrievalProtocol.ts`: outcome list (lines 51-61), request wire schema (lines 717-728), attribution/coverage schemas (lines 730-796). Drift silently degrades to BM25 (Pitfall 12). Update `tests/knowledge/retrievalProtocolParity.test.ts` in the same commit — it compares `RETRIEVAL_OUTCOMES`, `REASON_CODES`, and `Object.keys(schema.shape)` sets, not full shapes.

---

### `src/services/knowledge/knowledgeClient.ts` (service, request-response)

**Analog:** same file.

**Validate-before-dispatch** (lines 761-772):
```typescript
async retrieveFederated(body: unknown, signal?: AbortSignal): Promise<FederatedRetrievalResponse> {
  const validatedBody = FederatedRetrievalRequestSchema.parse(body);
  return request('/retrieve', FederatedRetrievalResponseSchema, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validatedBody),
    ...(signal ? { signal } : {}),
  });
}
```
Only the schema changes; dispatch and error mapping stay. Do not add a second method or endpoint.

---

### `src/services/ai/knowledgeOutcome.ts` (NEW — utility, transform)

**Analog:** `src/services/wizard/workflowGuards.ts`.

**Canonical-code → message map pattern** (lines 30-49):
```typescript
export const WORKFLOW_GUARD_MESSAGES: Record<WorkflowGuardCode, WorkflowGuardMessage> = {
  WORKFLOW_NOT_INITIALIZED: { missingArtifact: 'Hồ sơ quy trình SDLC', supplyingStep: 'INTAKE' },
  ...
};

export function formatGuardMessage(code: WorkflowGuardCode): string {
  const { missingArtifact, supplyingStep } = WORKFLOW_GUARD_MESSAGES[code];
  const stepNumber = WORKFLOW_GUARD_STEP_NUMBER[supplyingStep];
  return `Chưa đủ điều kiện: Thiếu ${missingArtifact} từ Bước ${stepNumber}. Vui lòng hoàn thành bước trước để tiếp tục.`;
}
```

**Contract for Phase 28:** one exported constant holding the exact D-12 text, plus a narrow mapper from structured retrieval outcome/coverage (`NO_PUBLISHED_SETS`, `NO_EVIDENCE`, `DEGRADED`/unreachable) to render decision. No new dependency, no React import (must be usable from Drawer, SDLC widget, and Telegram).

Exact text, verbatim:
```
Knowledge Server chưa có bộ tài liệu nào được publish. Hãy publish ít nhất một bộ tài liệu từ thiết bị có tài liệu, rồi thử lại.
```

---

### `src/services/ai/knowledgeRetrievalTool.ts` (service/tool, request-response)

**Analog:** same file.

**Config read + abort guard** (lines 29-44) — keep as-is.

**Catalog derivation to remove** (lines 46-54):
```typescript
const limit = Math.min(Math.max(10, Number(args.limit) || 20), 50);
const requestedSetIds = Array.isArray(args.setIds) ? args.setIds.filter(Boolean) : [];
const catalog = requestedSetIds.length > 0 ? [] : await fetchSetCatalog(db);
const setIdList = requestedSetIds.length > 0 ? requestedSetIds : catalog.map((entry) => entry.setId);
if (setIdList.length === 0) {
  return JSON.stringify({ error: 'Chưa có bộ tài liệu nào để tra cứu.' });
}
```

**Request/budget construction to replace with query-only** (lines 62-80). `elapsedMs: 60_000` is the tool budget to keep as a ceiling.

**Attribution-discarding output to extend** (lines 82-102) — add `setId`/`snapshotId` per excerpt, per-set coverage ledger, structured `{code, status, message}` for empty/unavailable; keep `outcome`, `entities`, `paths`, `warnings` keys.

**Error contract** (lines 103-110): rethrow `AbortError`, otherwise return JSON `{ error }` — do not throw into the model loop.

Also update `aiTools.ts` `retrieve_knowledge` description (lines 1770-1793); the `setIds` property already documents "Omit to search every published set" — that wording now matches behavior. Dispatch at lines 4584-4586 needs no change.

---

### `src/services/ai/groundedTurn.ts` (orchestrator, request-response)

**Analog:** same file.

**Catalog-derived gate to remove for default path** (lines 313-327):
```typescript
// Retrieval routing contract: document scope and MCP are independent evidence sources.
// Clarify only when neither can serve the turn; never send setTierAssignments: [].
const hasDocsScope = resolvedScope.setTierAssignments.length > 0;
...
if (!hasDocsScope && !hasConfiguredMcp) {
  return {
    kind: 'clarify_intent',
    clarifyQuestion:
      'Không xác định được phạm vi tài liệu để tra cứu. Vui lòng chỉ rõ bộ tài liệu hoặc phạm vi cần tìm.',
  };
}
```
Default server-enabled query → `docsEnabled = serverEnabled` (line 483 currently ANDs `hasDocsScope`); only explicit `setIds` uses scope resolution.

**Request construction** (lines 494-527) — replace `setTierAssignments`/`budgets` with the thin wire fields, keep `recentTurns` mapping and `contextHints`.

**Local fallback signature** (lines 354-367) — local BM25 takes `resolvedSetIds`; when the server is empty and local docs exist (D-14), local scope must be derived locally, not from the removed server scope gate. `runLocalGroundedRetrieval` returns empty when `resolvedSetIds.length === 0` (`localGroundedRetrieval.ts` lines 181-190), so a fresh session with local docs but no resolved sets gets nothing — decide the local scope source explicitly.

**Error taxonomy** (lines 582-660) — `KnowledgeClientError` codes `NETWORK_ERROR`/`TIMEOUT`/`INVALID_RESPONSE`/`REMOTE_ERROR` already map to distinct outcomes; add the server-empty code as its own branch, not a generic `DEGRADED`.

---

### `src/services/ai/evidencePack.ts` (utility, transform)

**Analog:** same file.

**Snapshot-blind dedupe key to fix** (line 219):
```typescript
const dedupKey = `${chunk.sourceDocumentId}:${chunk.lineStart}:${chunk.lineEnd}:${chunk.publishedContentHash}`;
```
Add `snapshotId`. Merge `setMemberships` only within the same snapshot (merge loop at lines 282-320 already merges memberships; scope it by snapshot).

**Conflict wrappers flattened** (lines 397-404):
```typescript
if (isServer && input.serverResponse?.conflictGroups) {
  for (const fedConflict of input.serverResponse.conflictGroups) {
    conflicts.push(fedConflict.conflictGroup);
  }
}
```
Preserve `setId`/`snapshotId` for attribution (typed extension of `EvidencePack.conflicts` or a parallel map; do not lose D-11 separate attribution).

**Path closure** (lines 350-395) maps chunk ids → citation ids and drops unclosed paths; keep, and add server-side pre-response validation so the client never receives an orphan.

**SourceRecord already carries `snapshotId` and `setMemberships`** (lines 9-31) — surface them; do not add new record types for attribution.

---

### `src/services/ai/groundedTurnDeps.ts` (wiring)

**Analog:** same file, lines 59-105. Keep `createDefaultGroundedTurnDeps` shape; the `retrieveFederated` closure only needs the new wire type (`client.retrieveFederated(req, signal)` stays). No signature change expected.

### `src/services/ai/semanticScopeRouter.ts` (audit)

**Analog:** same file, lines 20-30 (`ResolvedScope`) and `catalog`-driven assignment logic. Leave the router intact for explicit/local use; ensure `runGroundedTurn` no longer treats an empty result as a hard stop. Do not delete catalog-based explicit restriction support.

---

### `src/components/ai/AIChatDrawer.tsx` (component, request-response)

**Analog:** same file.

**Eager catalog load to stop gating retrieval** (lines 1419-1467):
```typescript
const catalog = await fetchSetCatalog(db);
const groundedDeps = createDefaultGroundedTurnDeps({ ... });
...
const groundedResult = await runGroundedTurn({ ..., catalog, recentSessionId: threadId }, groundedDeps);
```
Keep the `catalog` input only for explicit/local scope; pass an empty catalog on a fresh device without blocking. Keep the `clarify_intent` transient branch (lines 1475-1487) — it still applies to genuine intent clarification, not empty-catalog detection.

---

### `src/components/ai/grounded/SourcesPanel.tsx` (component, render)

**Analog:** same file.

**Ant Design table + a11y row pattern** (lines 243-271):
```tsx
<Table<PersistedCitation>
  dataSource={docCitations}
  columns={docColumns}
  rowKey={(r) => `${r.citationId}-${r.documentId}-${r.lineStart}`}
  size="small"
  pagination={false}
  onRow={(record) => ({
    onClick: () => onOpenCitation(record),
    onKeyDown: (e) => { if (e.key === 'Enter') { e.preventDefault(); onOpenCitation(record); } },
    tabIndex: 0,
    role: 'button',
    'aria-label': `${record.documentTitle} L${record.lineStart}-${record.lineEnd} ${record.evidenceClass}`,
    style: { cursor: 'pointer' },
  })}
/>
```

**Snapshot column pattern** (lines 145-172) — reuse for set/snapshot attribution. **Fix needed:** the local dedupe at lines 30-38 repeats the snapshot-blind key; add `snapshotId`, otherwise two snapshots of the same range still collapse in the UI even after `packEvidence` is fixed.

Add a compact coverage section distinguishing contributed / searched-no-evidence / failed / not-searched; do not add an always-visible snapshot badge per answer (D-08).

---

### `src/components/notes/QuickPreviewDrawer.tsx` (component, render)

**Analog:** same file.

**Current local-absent branch hides the excerpt** (lines 392-398):
```tsx
{loading ? (
  <div ...><Spin tip="Đang tải tài liệu..." /></div>
) : !doc ? (
  <Empty description="Không tìm thấy tài liệu hoặc đã bị xóa" />
) : (
```
**Target pattern already present inside the doc branch** (lines 407-478): `data-testid="cited-excerpt-panel"` renders header + relevance reason + snapshot, independent of body load. Move/duplicate that panel ahead of the `!doc` check and add an explicit "local document absent" line; keep the `Open in Docs` button disabled when `!doc` (lines 369-377).

---

### `src/components/sdlc/chat/StepChatPanel.tsx` (component, event-driven)

**Analog:** same file.

**Tool event interception pattern** (lines 243-269):
```typescript
onToolEvent: (event) => {
  setToolEvents((prev) => [...prev, event]);
  const toolName = normalizeToolName(event.name);
  if (event.phase !== 'result' || (toolName !== 'patch_artifact_section' && toolName !== 'get_artifact')) return;
  let parsed: { refused?: boolean; code?: string; ... } | undefined;
  try { parsed = JSON.parse(event.result ?? '{}'); } catch { parsed = undefined; }
  if (parsed?.refused !== true) return;
  ...
}
```
Mirror this for `retrieve_knowledge`: parse the structured `{code, status, message}`, and render the canonical notice as an app-owned system row/banner — never send it back through the model. `ChatTurnToolEvent` shape is at `src/components/ai/runtime/chatTurnRuntime.ts` lines 35-43.

---

### `src/services/telegram/telegramHeadlessWorker.ts` (worker, request-response)

**Analog:** same file.

**Grounded setup requiring catalog** (lines 521-546) — stop `fetchSetCatalog` gating remote retrieval; still pass catalog for explicit/local use.

**Canonical non-answer formatter** (lines 553-582) — extend this switch with the server-empty code so the text is application-owned:
```typescript
export function formatGroundedNonAnswer(result: GroundedTurnResult): string | null {
  if (result.kind === 'clarify_intent') { ... }
  if (result.kind === 'error') {
    switch (result.code) {
      case 'ERROR_AUTH': return '⚠️ ...';
      ...
    }
  }
  return null;
}
```
Callers already short-circuit on non-null (lines 1179-1195, 1262). **Tool-driven path gap:** `runAiOrchestratorLoop` at lines 1418-1447 is called without `onToolResult` (signature in `src/services/ai/aiOrchestratorLoop.ts` lines 68, 411) — pass an `onToolResult` detector so a tool-driven empty-server result renders the same notice.

---

### `src/services/wizard/sdlcWizardRuntime.ts` (audit)

**Analog:** same file, lines 181-192 (`resolveSetIds`). Keep as an explicit caller restriction only where project scope is a real requirement (artifact generation). SDLC chat default must be query-only (D-06). Do not convert links into an implicit filter.

## Shared Patterns

### Strict Zod trust boundary
**Source:** `knowledge-server/src/types/retrievalProtocol.ts` (lines 680-757) + `src/services/knowledge/retrievalProtocol.ts` (mirror).
**Apply to:** every wire request/response change and both test suites.
```typescript
z.strictObject({ ... })   // rejects unknown keys
z.array(...).max(N)       // bounds every collection
.default(...)             // optional input, guaranteed output
.superRefine((v, ctx) => ... ) // cross-field invariants
```
Update both files in one commit; parity test compares declaration order and key sets.

### Generic error envelope, content-free logs
**Source:** `knowledge-server/src/routes/retrieval.ts` lines 19-23, 46-66, 149-162; `knowledge-server/src/server.ts` lines 122-147.
**Apply to:** route changes, new services.
```typescript
return reply.code(400).send({
  error: { code: 'INVALID_REQUEST', message: 'Request could not be processed.' },
});
```
Never log query text, excerpts, set names, URNs, or Cypher (ASVS V16).

### Death-by-timeout fan-out
**Source:** `knowledge-server/src/services/federatedRetrievalService.ts` `runWithTimeout` (lines 80-120) and `mapConcurrent` (lines 125-143).
**Apply to:** published-set enumeration fan-out and lexical fallback.
```typescript
const outcome = await runWithTimeout(
  perSetTimeoutMs,
  async (signal) => deps.retrievePerSet(setId, req, signal),
  now,
  options?.signal
);
```
Add a deadline check before each queued worker starts; abort pending work; emit `BUDGET_ELAPSED`/`NOT_SEARCHED_BUDGET`.

### Code → canonical Vietnamese message map
**Source:** `src/services/wizard/workflowGuards.ts` lines 30-49.
**Apply to:** new `src/services/ai/knowledgeOutcome.ts`, consumed by Drawer, SDLC widget, Telegram. One exported constant; no per-surface copy.

### App-owned notices, model-owned prose
**Source:** `src/components/ai/grounded/GroundedBanner.tsx` (Ant Design `Alert`, `role="alert"` for error states) and `StepChatPanel` tool-event interception.
**Apply to:** server-empty rendering on all surfaces. Structured code in tool JSON + host detection; the model receives the code but never owns the text (D-13).

### Snapshot-aware identity
**Source:** `src/services/ai/evidencePack.ts` `SourceRecord` (lines 9-31), `SourcesPanel` snapshot column (lines 145-172), server wrappers (lines 693-712).
**Apply to:** dedupe keys, path closure, conflict attribution, UI dedupe. Key must include `snapshotId` everywhere; `setMemberships` merge only within a snapshot.

## No Exact Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `knowledge-server/src/services/snapshotLexicalRetrieval.ts` | service | transform | No server-side lexical ranker exists; the only BM25 lives in the client tree (`src/utils/bm25.ts`) and cannot be imported across `rootDir`. Copy the algorithm into `knowledge-server/src` with its own tests. |
| `knowledge-server/src/services/publishedSetDiscovery.ts` | service | CRUD (read) | No server-side published-set enumeration exists; `SnapshotStore` exposes only per-set reads. Uses the injected-service/result-type shape from `federatedRetrievalService.ts`. |
| `src/services/ai/knowledgeOutcome.ts` | utility | transform | No shared AI-outcome message module; nearest is the SDLC `workflowGuards` code→message map. |

## Metadata

**Analog search scope:** `knowledge-server/src/{types,routes,services,indexing,graph}`, `src/services/{ai,knowledge,telegram,wizard,search}`, `src/components/{ai,notes,sdlc}`, `src/utils`, `tests/{ai,knowledge,telegram,unit,sdlc}`, `knowledge-server/tests`.
**Files scanned:** ~40 (tracked-source verified with `git ls-files`).
**Excluded from scope:** `.gsd/capabilities/**` mirrors, `node_modules`, `knowledge-server/node_modules` (absent), PWA/daemon config.
**Pattern extraction date:** 2026-11-05.
