# Phase 24: Graph Retrieval Optimization - Pattern Map

**Mapped:** 2026-10-24
**Files analyzed:** 22 new/modified files
**Analogs found:** 21 / 22

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `knowledge-server/src/retrieval/queryPlanning.ts` | service | request-response, transform | same file: `resolveQueryEntities()` and planner repair loop | exact |
| `knowledge-server/src/retrieval/graphTraversal.ts` | service | request-response, transform | same file: `runBoundedGraphTraversal()` | exact |
| `knowledge-server/src/graph/neo4jRepository.ts` | service/repository | CRUD, request-response | same file: `resolveEntities()` plus `traverse()` | exact |
| `knowledge-server/src/retrieval/fusion.ts` | utility | transform | same file: RRF, conflict tagging, path closure | exact |
| `knowledge-server/src/services/retrievalService.ts` | service | request-response | same file: parallel modalities and outcome assembly | exact |
| `knowledge-server/src/services/federatedRetrievalService.ts` | service | batch, request-response | same file: per-set aggregation | exact |
| `knowledge-server/src/types/retrievalProtocol.ts` | model | transform | same file: strict Zod protocol schemas | exact |
| `src/services/knowledge/retrievalProtocol.ts` | model | transform | `knowledge-server/src/types/retrievalProtocol.ts` | exact mirror |
| `src/services/ai/groundedTurn.ts` | service | request-response | same file: server/local fallback routing | exact |
| `src/services/ai/evidencePack.ts` | utility | transform | same file: citation/path packing | exact |
| `src/services/ai/groundedAnswerSchemas.ts` | model | transform | same file: optional persisted provenance | exact |
| `src/components/ai/AIChatDrawer.tsx` | component | event-driven | `src/components/ai/grounded/GroundedAnswerCard.tsx` | role-match |
| `src/components/ai/grounded/GroundedAnswerCard.tsx` | component | event-driven | same file: outcome switch and CTA slots | exact |
| `src/components/ai/grounded/EntityCard.tsx` (new, if split out) | component | event-driven | `src/components/ai/grounded/GroundedAnswerCard.tsx` | role-match |
| `src/components/ai/grounded/DiagnosticsPanel.tsx` | component | transform | same file: content-free collapse/details UI | exact |
| `knowledge-server/tests/retrievalPlanning.test.ts` | test | request-response | same file: mocked gateway/planner coordinator tests | exact |
| `knowledge-server/tests/graphTraversal.test.ts` | test | request-response | `knowledge-server/tests/retrievalPlanning.test.ts` | role-match |
| `knowledge-server/tests/retrievalFusion.test.ts` | test | transform | same file: deterministic fusion/closure tests | exact |
| `knowledge-server/tests/federatedRetrieval.test.ts` | test | batch | `knowledge-server/tests/retrievalFusion.test.ts` | role-match |
| `knowledge-server/tests/fixtures/pilotGoldEntities.ts` | test fixture | transform | same file existing pilot constants | exact |
| `src/services/ai/groundedTurn.test.ts` and UI/schema parity tests | test | request-response, event-driven | `knowledge-server/tests/retrievalPlanning.test.ts` | role-match |
| `tests/fixtures/ai/graph-retrieval-reference.json` (new) | test fixture | batch | `tests/fixtures/ai/grounded-assistant-reference.json` | role-match |

`knowledge-server/src/graph/ontology.ts` remains authority and should normally be read, not changed. Phase behavior derives from `RETRIEVAL_ONTOLOGY_REGISTRY` rather than adding another ontology table.

## Pattern Assignments

### `knowledge-server/src/retrieval/queryPlanning.ts` (service, request-response/transform)

**Analog:** same file. Preserve bounded resolution, injected gateway/planner, one repair call, and deterministic fallback. Replace kind switches and free-text validation issues with registry-derived per-seed plans and stable codes.

**Imports pattern** (`queryPlanning.ts:0-20`):
```typescript
import {
  ClarificationCandidate,
  ConversationTurn,
  LogicalQueryPlan,
  LogicalQueryPlanSchema,
  PlanTrace,
  RetrievalRequest,
  TraversalStep,
} from '../types/retrievalProtocol.js';
import {
  NODE_KINDS,
  RELATION_TYPES,
  RETRIEVAL_ONTOLOGY_REGISTRY,
} from '../graph/ontology.js';
import { randomUUID } from 'node:crypto';
```

**Bounded entity-resolution pattern** (`queryPlanning.ts:261-287`):
```typescript
export async function resolveQueryEntities(
  gateway: GraphRetrievalGateway,
  pinnedSnapshotId: string,
  query: string,
  recentTurns: readonly ConversationTurn[] = [],
  options?: OperationOptions
): Promise<EntityResolutionResult> {
  const boundedTurns = recentTurns.slice(-3);
  const contextUrns: string[] = [];
  for (const turn of boundedTurns) {
    const urns = (turn.resolvedUrns || []).slice(0, 5);
    contextUrns.push(...urns);
  }
```

**One-repair pattern to retain, but sanitize** (`queryPlanning.ts:723-767`): first plan is parsed and semantically checked; exactly one second `planner.plan(...)` call is permitted. Replace the current query mutation containing joined free-text issues with a structured, content-free stable reason code. Repair input must exclude raw query, source content, Cypher, secrets, and unrestricted errors.

**Fallback shape** (`queryPlanning.ts:502-542`):
```typescript
export function buildDeterministicFallbackPlan(
  rawQuery: string,
  resolvedSeeds: readonly ClarificationCandidate[],
  reasonCode: string = 'PLANNER_SCHEMA_FAILURE'
): { plan: LogicalQueryPlan; planTrace: PlanTrace } {
  const seedUrns = resolvedSeeds.slice(0, 5).map((c) => c.urn);
  // ... static plan + content-free PlanTrace
  return { plan: fallbackPlan, planTrace };
}
```

**Required change:** derive valid relation/direction/endpoint tuples from `RETRIEVAL_ONTOLOGY_REGISTRY` for each seed. Do not copy `defaultTraversalStepsForKind()` (`queryPlanning.ts:468-497`) or first-seed selection (`:512-516`); those are defects being removed.

**Test analog:** `knowledge-server/tests/retrievalPlanning.test.ts:325-767`. Reuse `MockGraphGateway`, planner call counters, and `expect(result.status).toBe('executable')` narrowing. Add mixed-kind, all-valid-relations, exact one-repair, stable-code, and one-hop fallback cases.

---

### `knowledge-server/src/retrieval/graphTraversal.ts` and `knowledge-server/src/graph/neo4jRepository.ts` (service/repository, request-response)

**Analog:** `runBoundedGraphTraversal()` plus repository `resolveEntities()`/`traverse()`.

**Static query allowlist pattern** (`graphTraversal.ts:99-117`):
```typescript
export const STATIC_TRAVERSAL_QUERIES: Readonly<Record<string, string>> = Object.freeze(
  (() => {
    const catalog: Record<string, string> = {};
    const directions: readonly TraversalDirection[] = ['OUTGOING', 'INCOMING', 'BOTH'];
    for (const rel of RELATION_TYPES) {
      const entry = RETRIEVAL_ONTOLOGY_REGISTRY[rel];
      if (!entry) continue;
      for (const dir of directions) {
        for (let hop = 1; hop <= entry.maxHops; hop++) {
          const key: TraversalQueryKey = `${rel}:${dir}:${hop}`;
          catalog[key] = buildStaticTemplate(rel, dir, hop);
        }
      }
    }
    return catalog;
  })()
);
```

**Validation boundary pattern** (`graphTraversal.ts:151-181`): validate missing seeds and server allowlist before gateway invocation. Return enum reason codes only. Replace depth/hop clamping at `:192-226` with rejection using `HOP_LIMIT_EXCEEDED`; validate relation, direction, seed endpoint, and target endpoint against registry before selecting static template.

**Fail-soft error mapping** (`graphTraversal.ts:408-462`): retain modality-local `try/catch`, preserve abort/timeout and stale snapshot mapping, never return exception text, stack, query, or Cypher.

**Mapping/dedup pattern** (`graphTraversal.ts:468-535`): use `Map` keyed by chunk ID, entity URN, and edge fact key; enforce pinned snapshot and evidence-class checks; cap after deterministic encounter order.

**Seed preservation assignment:** fetch valid seeds snapshot-scoped through existing repository `resolveEntities(snapshotId, seedUrns)`, map them to `EntityItem`, then union by URN with traversal entities. Do not gate entity inclusion on completed paths or edge count. Remove repository special-case relation expansion and zero-edge dropping; planning owns relation selection.

**Result/status shape:** extend `BoundedGraphTraversalResult` near `graphTraversal.ts:279-285` with `seedEntities` and separate `entityCount`, `edgeCount`, `pathCount`. Keep `itemCount` for compatibility. `SEED_FOUND_NO_RELATION` applies when entity count is positive and edge/path counts are zero.

---

### `knowledge-server/src/retrieval/fusion.ts` (utility, transform)

**Analog:** same file's identity, RRF, citation closure, and deterministic ordering.

**Stable identity** (`fusion.ts:28-33`):
```typescript
export function getCompositeKey(item: RetrievalItem): string {
  return `${item.type}:${item.id}`;
}
```

**Integrity guard** (`fusion.ts:108-145`): preserve cross-modality snapshot and immutable-field checks. Mismatches throw only `CANDIDATE_INTEGRITY_MISMATCH`, not content-bearing details.

**Deterministic ordering** (`fusion.ts:239-267`):
```typescript
candidateArray.sort((a, b) => {
  if (Math.abs(b.score - a.score) > 1e-12) return b.score - a.score;
  const countDiff = b.seenModalities.size - a.seenModalities.size;
  if (countDiff !== 0) return countDiff;
  const priorityDiff = a.highestPriorityModalityIndex - b.highestPriorityModalityIndex;
  if (priorityDiff !== 0) return priorityDiff;
  return a.compositeKey.localeCompare(b.compositeKey);
});
```
Extend comparator/package admission with Phase 24 ordering: intent relevance, answerability, evidence strength, appropriate path length, stable identity. Never depend on Neo4j row order.

**Closure pattern** (`fusion.ts:311-367`): gather every selected edge's `supportingChunkIds`; pull missing supporting chunks from candidate pool or emit `MISSING_SUPPORTING_CHUNK`. Phase 24 should make seed + targets + edge/path + chunks atomic before final limit, not repair only after individual-item slicing.

**Test pattern:** `knowledge-server/tests/retrievalFusion.test.ts:107-235` covers dedup, composite types, deterministic ties, limits, repeated byte-equivalent output, and integrity errors. Closure fixture pattern at `:475-523` builds edge, selected items, candidate pool, and explicit expected replacement/diagnostic.

---

### Retrieval services (service, request-response/batch)

**Files:**
- `knowledge-server/src/services/retrievalService.ts`
- `knowledge-server/src/services/federatedRetrievalService.ts`

**Analog:** existing parallel modality execution, fail-soft statuses, RRF call, and per-set aggregation in same files.

**Assignment:** preserve pinned snapshot lease and modality-local timeout behavior. Pass validated per-seed graph plans into traversal. Exempt only valid, snapshot-consistent, bounded, citation-closed graph packages from text relevance blanking. Select `SEED_ONLY` before `NO_EVIDENCE` when entity count > 0 and edge/path counts are zero. Aggregate entity/edge/path counts additively across sets; retain severe status/reason and per-stage metadata rather than overwriting with later `ok` status.

**Do not change:** optional daemon isolation. Knowledge-server failure still returns client to local BM25; `SEED_ONLY` is successful server evidence and must not trigger fallback.

---

### Server/client retrieval protocol mirrors (model, transform)

**Files:**
- `knowledge-server/src/types/retrievalProtocol.ts`
- `src/services/knowledge/retrievalProtocol.ts`

**Analog:** strict Zod schemas in server file. Change both mirrors in same task.

**Outcome/reason enum pattern** (`knowledge-server/src/types/retrievalProtocol.ts:12-60`): use `as const`, `z.enum(...)`, and inferred type. Add `SEED_ONLY` and stable validation/result codes to both mirrors.

**Optional diagnostics extension pattern** (`retrievalProtocol.ts:65-74`):
```typescript
export const ModalityStatusDetailSchema = z
  .object({
    status: ModalityStatusValueSchema,
    latencyMs: z.number().int().nonnegative(),
    itemCount: z.number().int().nonnegative(),
    reason: z.string().optional(),
  })
  .strict();
```
Add nonnegative optional count fields and bounded stage diagnostics. Replace exposed free-form reason acceptance where Phase 24 reason codes apply.

**Response invariant pattern** (`retrievalProtocol.ts:435-461`): use `.superRefine()` for cross-field closure. Add `SEED_ONLY` invariant: at least one entity, zero edge/path counts, empty paths, reason `SEED_FOUND_NO_RELATION`.

**Compatibility:** new fields optional/defaulted where older responses or persisted records must parse. Add parity test comparing server/client outcomes, reason codes, and count keys.

---

### `src/services/ai/groundedTurn.ts`, `evidencePack.ts`, and `groundedAnswerSchemas.ts` (service/model/utility)

**Analog:** existing server/local branch in `groundedTurn.ts`, citation packing in `evidencePack.ts`, and v1-compatible strict persistence schema.

**Evidence-pack import/shape pattern** (`evidencePack.ts:0-66`): import protocol types with `import type`; keep immutable readonly evidence interfaces. Add bounded entity references/counts to `EvidencePack`, not a second retrieval model.

**Server normalization pattern** (`evidencePack.ts:161-213`): iterate federated items, unwrap `fedItem.item`, discriminate on `type`. Existing code packs only chunks; add an entity branch that preserves URN, canonical name, kind, snapshot, and set identity without turning entities into citations.

**Path closure pattern** (`evidencePack.ts:310-359`): keep chunk-ID-to-citation-ID mapping and drop any path whose hop lacks a surviving citation.

**Persistence compatibility pattern** (`groundedAnswerSchemas.ts:300-377`): retain `schemaVersion: z.literal(1)`, strict provenance checks, and add Phase 24 fields as optional. Do not require new fields from historical records.

**Routing assignment:** in `groundedTurn.ts`, branch on `serverResponse.outcome === 'SEED_ONLY'` before `isGraphNonProductive` and local fallback/refinement logic. Build limited non-relational answer data; never infer writer/reader/relation from entity existence.

---

### AI Chat components (component, event-driven/transform)

**Files:**
- `src/components/ai/AIChatDrawer.tsx`
- `src/components/ai/grounded/GroundedAnswerCard.tsx`
- optional new `src/components/ai/grounded/EntityCard.tsx`
- `src/components/ai/grounded/DiagnosticsPanel.tsx`

**Analog:** `GroundedAnswerCard.tsx` outcome switch and callback slots.

**Outcome branch pattern** (`GroundedAnswerCard.tsx:121-193`): add explicit `case 'SEED_ONLY'` beside `NO_EVIDENCE`, returning limited text plus entity card. Avoid falling into READY/default synthesis branch.

**Explicit action pattern** (`GroundedAnswerCard.tsx:105-118`):
```tsx
<Button
  size="small"
  icon={<ReloadOutlined />}
  onClick={onFreshLookup}
  loading={isFreshLookingUp}
>
  Tra cứu lại
</Button>
```
Copy callback-driven action shape for “find related.” Action submits a new broader query; original query remains unchanged. If entity UI is small, keep it in `GroundedAnswerCard.tsx`; split `EntityCard.tsx` only if reused.

**Diagnostics pattern** (`DiagnosticsPanel.tsx:0-16,45-112`): Ant Design `Collapse`, `Descriptions`, `Tag`, `Typography`; typed props from protocol/persistence; concise default summary and expandable detail. Show timings, counts, statuses, stable codes, truncation/fallback, before/after fusion. Never show query, excerpts, credentials, URLs, stacks, or Cypher.

---

### Tests and fixtures (test, request-response/batch/event-driven)

**Primary analog:** `knowledge-server/tests/retrievalPlanning.test.ts`.

**Mock gateway pattern** (`retrievalPlanning.test.ts:25-40`):
```typescript
class MockGraphGateway implements GraphRetrievalGateway {
  constructor(private readonly candidates: ClarificationCandidate[] = []) {}
  async resolveEntities(
    snapshotId: string,
    queryTokens: readonly string[],
    options?: OperationOptions
  ): Promise<ClarificationCandidate[]> {
    if (options?.signal?.aborted) throw new Error('Aborted');
    return this.candidates;
  }
  async traverse(): Promise<any> {
    throw new Error('Not implemented in mock');
  }
}
```

**Assertions pattern** (`retrievalPlanning.test.ts:345-369`): invoke public coordinator, assert call count and status, then narrow union before asserting plan/trace.

**Required focused cases:**
- `MAIN1.EVT_EVENT` plus incoming `WRITES_TO` writer and supporting chunk.
- Resolved zero-edge seed survives and maps to `SEED_ONLY`, counts `1/0/0`.
- Mixed seed kinds each receive valid endpoint-specific steps.
- Broad fallback includes all ontology-valid one-hop relations.
- Invalid relation/direction/endpoint/depth emit exact stable codes; one repair only; then fallback.
- Fusion package survives limit with all entities/edge/path/chunks.
- Repeated runs produce byte-equivalent ordering.
- Federated normalization preserves counts/reasons.
- Client protocol parity and old `ChatMessageGrounding` parse.
- `SEED_ONLY` does not invoke BM25 fallback and renders entity card/action.
- Diagnostics reject or omit unsafe fields.

**Reference fixture:** copy top-level JSON case-array/schema conventions from `tests/fixtures/ai/grounded-assistant-reference.json`; create `tests/fixtures/ai/graph-retrieval-reference.json` for direct lookup, read/write, seed-only, missing seed, mixed kinds, multiple relations, flow, and impact. Reuse `scripts/run-benchmark.ts` and evaluator/release-gate code; no new harness.

## Shared Patterns

### Ontology Authority
**Source:** `knowledge-server/src/graph/ontology.ts` and imports at `queryPlanning.ts:15-19`, `graphTraversal.ts:5-9`  
**Apply to:** planning, validation, traversal, tests.  
Single registry controls relation, legal source/target kinds, default direction, and hop ceiling. No relation switch, keyword intent router, repository special case, or model-generated Cypher.

### Snapshot Isolation
**Source:** `graphTraversal.ts:468-475,537-558`  
**Apply to:** repository output, fusion packages, protocol response, evidence pack.  
Reject mixed snapshots; every retained graph item/path uses pinned snapshot.

### Content-Free Errors and Diagnostics
**Source:** `graphTraversal.ts:408-462`, `DiagnosticsPanel.tsx:28-32`  
**Apply to:** planner repair, modality statuses, stage diagnostics, UI.  
Expose controlled code, status, latency, counts, booleans. Never expose exception message, stack, raw query, source text, URL credentials, or Cypher.

### Deterministic Identity and Ordering
**Source:** `fusion.ts:28-33,236-267`  
**Apply to:** traversal merging, fusion, federation, reference evaluation.  
Use `type:id`, URN, fact key, chunk ID, then stable lexical tie-break. Sort before limits when source order may vary.

### Backward-Compatible Zod Boundaries
**Source:** `retrievalProtocol.ts:416-461`, `groundedAnswerSchemas.ts:300-377`  
**Apply to:** server/client protocol and persisted grounding.  
Strict schemas at trust boundaries; optional/defaulted additions; cross-field invariants in `.superRefine()`; protocol mirrors updated together.

### Fail-Soft Optional Server
**Source:** existing `groundedTurn.ts` server/local routing and `graphTraversal.ts:408-462`  
**Apply to:** all client delivery changes.  
Server absence/error preserves local BM25. Valid `SEED_ONLY` remains server result, not fallback trigger.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `tests/fixtures/ai/graph-retrieval-reference.json` | test fixture | batch | No graph-specific reference fixture exists; copy envelope style from grounded assistant reference and use research categories. |

## Metadata

**Analog search scope:** `knowledge-server/src/{graph,retrieval,services,types}`, `knowledge-server/tests`, `src/services/{ai,knowledge}`, `src/components/ai`, `tests/fixtures/ai`  
**Strong analog files read:** 10  
**Pattern extraction date:** 2026-10-24
