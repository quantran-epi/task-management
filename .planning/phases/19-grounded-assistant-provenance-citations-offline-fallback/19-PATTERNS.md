# Phase 19: Grounded Assistant, Provenance Citations & Offline Fallback - Pattern Map

**Mapped:** 2026-10-11
**Files analyzed:** 32 new/modified
**Analogs found:** 29 / 32

Scope note: Phase 19 locks federated retrieval, LLM semantic router with alias fallback, snapshot-scoped graph paths, evidence-only model-degraded state, historical excerpt persistence, scoped local BM25 fallback, and no legacy document-set migration. All patterns below honor those invariants and reuse Phase 17/18 primitives.

---

## File Classification

### Server (knowledge-server)

| File | Role | Data Flow | Closest Analog | Match |
|------|------|-----------|----------------|-------|
| `knowledge-server/src/types/retrievalProtocol.ts` (extend) | type/schema | request-response | self (Phase 18) | exact |
| `knowledge-server/src/retrieval/graphTraversal.ts` (extend) | service | transform | self | exact |
| `knowledge-server/src/graph/neo4jRepository.ts` (extend) | repository | request-response | self | exact |
| `knowledge-server/src/retrieval/fusion.ts` (extend) | service | transform | self | exact |
| `knowledge-server/src/services/retrievalService.ts` (extend) | service | request-response | self | exact |
| `knowledge-server/src/services/federatedRetrievalService.ts` (new) | service | fan-out orchestration | `knowledge-server/src/services/retrievalService.ts` | role-match |
| `knowledge-server/src/routes/retrieval.ts` (extend; add `POST /retrieve` without `:setId`) | route | request-response | self | exact |
| `knowledge-server/tests/retrievalPathProtocol.test.ts` (new) | test | contract | `knowledge-server/tests/retrievalProtocol.test.ts` | role-match |
| `knowledge-server/tests/federatedRetrieval.test.ts` (new) | test | contract | `knowledge-server/tests/retrievalService.test.ts` | role-match |

### Browser services

| File | Role | Data Flow | Closest Analog | Match |
|------|------|-----------|----------------|-------|
| `src/services/knowledge/retrievalProtocol.ts` (new) | type/schema | boundary validation | `knowledge-server/src/types/retrievalProtocol.ts` | mirror |
| `src/services/knowledge/knowledgeClient.ts` (extend `retrieve` + typed `TIMEOUT`/`ABORTED`) | service | request-response | self | exact |
| `src/services/knowledge/federatedRetrieval.ts` (new; progressive REQUIRED/LIKELY/OPTIONAL fan-out) | service | fan-out orchestration | `knowledge-server/src/services/retrievalService.ts` (Promise.allSettled) | role-match |
| `src/services/ai/groundedAnswerSchemas.ts` (new) | type/schema | boundary validation | `src/services/knowledge/knowledgeClient.ts` schema block | role-match |
| `src/services/ai/evidencePack.ts` (new) | service | transform | `knowledge-server/src/retrieval/fusion.ts` (closure/dedup) | role-match |
| `src/services/ai/intentRouter.ts` (new; deterministic-first + LLM semantic router + alias fallback) | service | transform | `src/services/ai/contextGrounding.ts` | role-match |
| `src/services/ai/semanticScopeRouter.ts` (new; structured LLM call, validated against set catalog) | service | request-response | `src/services/ai/nineRouterClient.ts` | role-match |
| `src/services/ai/groundedSynthesis.ts` (new; non-streaming + bounded repair) | service | request-response | `src/services/ai/nineRouterClient.ts::streamChatEvents` | role-match |
| `src/services/ai/groundedTurn.ts` (new; state machine, AbortController ownership) | service | event-driven | `src/components/ai/AIChatDrawer.tsx` tool loop | role-match |
| `src/services/ai/nineRouterClient.ts` (extend: `completeJson()` non-streaming + capability probe) | service | request-response | self (`streamChatEvents`) | exact |
| `src/services/search/localGroundedRetrieval.ts` (new; range-bearing BM25 restricted to resolved set members) | service | transform | `src/utils/bm25.ts::extractRelevantSnippet` | role-match |

### Persistence / validation

| File | Role | Data Flow | Closest Analog | Match |
|------|------|-----------|----------------|-------|
| `src/types/models.ts` (extend `ChatMessage.grounding`) | model | — | self (`ChatMessage`) | exact |
| `src/db/repositories/chatRepo.ts` (extend `SaveMessageInput`) | repository | CRUD | self (`saveMessage`) | exact |
| `src/validation/backupSchemas.ts` (extend `BackupChatMessageRecordSchema`) | validation | boundary validation | self | exact |

### UI components

| File | Role | Data Flow | Closest Analog | Match |
|------|------|-----------|----------------|-------|
| `src/components/ai/grounded/GroundedAnswerCard.tsx` (new) | component | event-driven | `src/components/ai/ChatMessageBubble.tsx` | role-match |
| `src/components/ai/grounded/GroundedBanner.tsx` (new; variants: local/degraded/conflict/mismatch/auth/invalid/model-unavailable) | component | render | `src/components/knowledge/DlpWarningPanel.tsx` | role-match |
| `src/components/ai/grounded/ClaimBlock.tsx` (new) | component | render | `src/components/ai/ChatMessageBubble.tsx` | partial |
| `src/components/ai/grounded/CitationGroup.tsx` (new) | component | render | `src/components/ai/CitationChip.tsx` | role-match |
| `src/components/ai/grounded/GraphPathCard.tsx` (new; one snapshot per card) | component | render | `src/components/knowledge/GraphEvidenceDrawer.tsx` | role-match |
| `src/components/ai/grounded/SourcesPanel.tsx` (new) | component | render | `src/components/knowledge/AttemptHistoryList.tsx` | role-match |
| `src/components/ai/grounded/CandidateChipList.tsx` (new; `NEEDS_CLARIFICATION` + refinement chips) | component | event-driven | `src/components/ai/CitationChip.tsx` (Tag+keyboard) | partial |
| `src/components/ai/grounded/IntentRoutingPrompt.tsx` (new) | component | event-driven | `src/components/ai/CitationChip.tsx` | partial |
| `src/components/ai/grounded/DiagnosticsPanel.tsx` (new) | component | render | Ant `Collapse` + `AttemptHistoryList.tsx` | partial |
| `src/components/ai/grounded/EvidenceOnlyCard.tsx` (new; model-unavailable; `Tạo câu trả lời từ bằng chứng` button) | component | event-driven | `GroundedAnswerCard` | partial |
| `src/components/ai/grounded/ScopeChipsBar.tsx` (new; editable resolved-scope chips after routing) | component | event-driven | `src/components/ai/ScopePickerModal.tsx` | partial |
| `src/components/ai/CitationChip.tsx` (extend `index`, `source`, `evidenceClass`, `range`, `snapshotId`) | component | event-driven | self | exact |
| `src/components/ai/ChatMessageBubble.tsx` (branch on `grounding`) | component | render | self | exact |
| `src/components/ai/ChatMessageList.tsx` (rehydrate `grounding`) | component | render | self | exact |
| `src/components/ai/AIChatDrawer.tsx` (route-before-key, invoke `runGroundedTurn`) | component | event-driven | self | exact |
| `src/components/notes/QuickPreviewDrawer.tsx` (extend: `sectionAnchor`, `lineRange`, `citedSnapshotId`, snapshot-first excerpt, mismatch alert) | component | request-response | self | exact |
| `src/components/knowledge/DocumentSetForm.tsx` (extend: scope presets, facets, aliases) | component | event-driven | self | exact |

### Tests

| File | Role | Data Flow | Closest Analog | Match |
|------|------|-----------|----------------|-------|
| `tests/ai/groundedAssistantEval.test.ts` (new; 20-case reference) | test | fixture replay | `tests/knowledge/offlineIsolation.test.ts` | role-match |
| `tests/fixtures/ai/grounded-assistant-reference.json` (new) | fixture | — | — | no analog |
| `tests/ai/groundedTurn.test.ts` (new; state machine, zero-model-call gates) | test | behavior | `tests/ai/nineRouterClient.test.ts` | role-match |
| `tests/ai/evidencePack.test.ts` (new) | test | pure | `tests/ai/historyPruning.test.ts` | role-match |
| `tests/ai/semanticScopeRouter.test.ts` (new) | test | behavior | `tests/ai/nineRouterClient.test.ts` | role-match |
| `tests/ai/federatedRetrieval.test.ts` (new) | test | behavior | `tests/knowledge/knowledgeClient.test.ts` | role-match |
| `tests/ai/GroundedAnswerCard.test.tsx` (new; outcome matrix + 320/650 px) | test | component | `tests/ai/ChatMessageBubble.test.tsx` | role-match |
| `tests/ai/CitationChipAndQuickPreview.test.tsx` (extend; `[L#]`, exact range focus, mismatch) | test | component | self | exact |
| `tests/knowledge/knowledgeClient.test.ts` (extend; retrieve + timeout/abort/auth taxonomy) | test | behavior | self | exact |
| `tests/knowledge/offlineIsolation.test.ts` (extend; scoped BM25 fallback turn with zero egress) | test | behavior | self | exact |
| `tests/backup/backupChatGrounding.test.ts` (new; export/restore preserves grounding) | test | behavior | `tests/validation/*` (schema tests) | role-match |

---

## Pattern Assignments

### Server contract extension (ordered paths, source hash/title, scope proof)

**File:** `knowledge-server/src/types/retrievalProtocol.ts` (extend)
**Analog:** self

Reuse the existing `z.strictObject` + `superRefine` style around `BaseRetrievalResponseSchema` (lines 308–380). Add:

- `OrderedPathSchema` with closure invariant `nodeUrns.length === edgeFactKeys.length + 1`, `snapshotId`, `classification`, `hasConflict`.
- `SourceRefSchema` adding `documentTitle`, `publishedContentHash` (reuse `hash` 64-hex regex style from `src/services/knowledge/knowledgeClient.ts:19`), `scope` (domain/environment/version from D-17).
- Append `paths: z.array(OrderedPathSchema).max(20)` and expand `ChunkItemSchema` with `sourceDocumentTitle` and `publishedContentHash`.
- Expand conflict proof: optional structured `{dimension, environment?, version?, overrideRelation?}` resolved only from Phase 17 metadata (D-15, D-25, D-29); never model-inferred.

Add new outcome values are **not** required — keep the existing `RETRIEVAL_OUTCOMES` enum.

### Snapshot-scoped graph path preservation

**File:** `knowledge-server/src/retrieval/graphTraversal.ts` (extend)
**Analog:** self

The current Cypher `UNWIND relationships(path) AS rel` (line 56) deduplicates away path identity. Replace the projection to also collect per-path ordered arrays:

```
WITH path, [n IN nodes(path) | n.urn] AS nodeUrns,
          [r IN relationships(path) | r.factKey] AS edgeFactKeys,
          [r IN relationships(path) | r.effectiveClassification] AS hopClasses
RETURN nodeUrns, edgeFactKeys, hopClasses, ...
```

Pass each path through `BoundedGraphTraversalResult.paths` (new readonly array) alongside existing `entities`/`edges`. Keep `GRAPH_CAP_MAX_NODES`/`EDGES` sentinels (lines 256–257) and reuse the error taxonomy at lines 371–415 for `timeout`/`stale`/`error`.

Enforce single-snapshot invariant: every edge in a path must carry same `graphSnapshotId` as `pinnedSnapshotId`; drop path otherwise. Federated layer never concatenates across snapshots (D-14, D-16).

### Federated retrieval orchestration (server)

**File:** `knowledge-server/src/services/federatedRetrievalService.ts` (new)
**Analog:** `knowledge-server/src/services/retrievalService.ts` lines 230–252 (`Promise.allSettled` fan-out) + 95–128 (`runWithTimeout`)

Copy the `runWithTimeout` and `Promise.allSettled` pattern but fan out across *sets* instead of modalities. Progressive tiers (D-23):

```ts
// REQUIRED tier first; if coverage insufficient, expand to LIKELY, then OPTIONAL.
// Each set runs its own retrievalService.retrieve(setId, request) under its pinned snapshot.
// Bound: concurrency, elapsed time, total sets, item count, evidence size.
// Report coverage limit via diagnostics.degradedReasons when a budget stops expansion.
```

Preserve per-item `setId`+`snapshotId`+scope metadata. Rank by role group (baseline vs scoped-diff per D-22), not raw score comparison across sets. Never merge paths across snapshots.

New route: `POST /api/v1/retrieve` accepting `setIds: string[]` (resolved by caller) and optional `expansionTier` — route file mirrors existing `routes/retrieval.ts` auth boundary.

### Browser retrieval client extension

**File:** `src/services/knowledge/knowledgeClient.ts` (extend)
**Analog:** self

Copy `request<T>` pattern (lines 338–389). Add typed error codes:

```ts
export type KnowledgeClientErrorCode =
  | 'NETWORK_ERROR' | 'INVALID_RESPONSE' | 'REMOTE_ERROR'
  | 'TIMEOUT' | 'ABORTED';
```

Distinguish `AbortSignal.timeout` reason (`TimeoutError`) from manual `AbortError` in the `catch` at line 353 (Pitfall 4). Add:

```ts
async retrieve(setId: string, body: RetrievalRequest, signal?: AbortSignal): Promise<RetrievalResponse> {
  return request(
    `/sets/${encodeURIComponent(setId)}/retrieve`,
    RetrievalResponseSchema,
    { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(RetrievalRequestSchema.parse(body)),
      ...(signal ? { signal } : {}) },
  );
}

async retrieveFederated(body: FederatedRetrievalRequest, signal?: AbortSignal): Promise<FederatedRetrievalResponse> { /* same shape */ }
```

Keep `redact(message, options.token)` (line 287) for all error paths.

### Grounded answer schemas

**File:** `src/services/ai/groundedAnswerSchemas.ts` (new)
**Analog:** `knowledge-server/src/types/retrievalProtocol.ts` (strict + superRefine) + 19-AI-SPEC.md §4

Use `z.strictObject` + `superRefine` (same style as retrieval protocol lines 333–380) for `GroundedClaimSchema`, `GroundedAnswerSchema`. Export `GroundedAnswerJsonSchema = z.toJSONSchema(GroundedAnswerSchema)`. Persisted shape (`ChatMessage.grounding`) adds authority (`'server' | 'local'`), outcome, per-citation stored excerpt (bounded), source refs with `publishedContentHash`, paths, conflict groups, scope metadata, modality diagnostics, prompt/model/schema versions.

### Non-streaming structured completion + capability probe

**File:** `src/services/ai/nineRouterClient.ts` (extend)
**Analog:** self (`streamChatEvents` lines 136–401)

Add a dedicated `completeJson(options)` that does **not** stream and does not accumulate tool_calls. Reuse `sanitizeEndpoint` (line 26), `redactApiKey` (line 21), `isTauriApp()` branch, and `AbortSignal` plumbing from the existing streaming path. Request body:

```ts
{
  model, temperature: 0, max_tokens: 1800, stream: false,
  response_format: { type: 'json_schema',
    json_schema: { name: 'taskmate_grounded_answer_v1', strict: true, schema } },
  messages: [systemMsg, { role: 'user', content: JSON.stringify({ query, evidence }) }],
}
```

Capability probe keyed by sanitized endpoint host + exact model id, stored in non-secret settings. If probe fails strict JSON Schema, fall back to JSON text + Zod + at most 2 bounded repairs.

### Semantic scope router

**File:** `src/services/ai/semanticScopeRouter.ts` (new)
**Analog:** `src/services/ai/nineRouterClient.ts` (reuse `completeJson` from above)

Structured LLM call returning only `{ intent, domain/facet values, exclusions, comparisonMode, subqueries[] }` from supplied catalog. Validate output against resolved set catalog in app code (D-19). Alias-match deterministic fallback when LLM unavailable (D-20): canonical-name + configured-alias matching against `DocumentSet.scope`/`aliases`. For general question with no explicit scope, search BASE/general set first (D-21).

### Intent router (deterministic-first)

**File:** `src/services/ai/intentRouter.ts` (new)
**Analog:** `src/services/ai/contextGrounding.ts` (deterministic token/entity resolution)

Deterministic rules first (keyword matching, PlannerMate operational verbs); low confidence returns `clarify` with the Vietnamese chips `Tra cứu tài liệu` / `Thao tác PlannerMate` (D-09, UI-SPEC copy). Never calls model for the operational-vs-knowledge decision — model only runs inside `semanticScopeRouter`.

### Evidence pack

**File:** `src/services/ai/evidencePack.ts` (new)
**Analog:** `knowledge-server/src/retrieval/fusion.ts::tagRetrievalConflicts` and `src/utils/bm25.ts` dedup patterns

Immutable readonly map:

```ts
interface EvidencePack {
  authority: 'server' | 'local';
  citations: Readonly<Record<`S${number}` | `L${number}`, SourceRecord>>;
  paths: Readonly<Record<`P${number}`, ValidatedPath>>;
  conflicts: readonly ConflictGroup[];
  promptEvidence: readonly { id: string; text: string }[];
  contextTruncated: boolean;
}
```

Packing order (AI-SPEC §4b): conflict branches → exact identifier hits → complete path support → remaining RRF. Drop whole units when over budget (8,000 chars server / 5×1,200 local). Dedupe local `[L#]` by `documentId + range` (D-39). Closure validator rejects unknown IDs, bad path adjacency, hops with missing citations, conflicted facts in conclusion claims.

### Grounded turn state machine

**File:** `src/services/ai/groundedTurn.ts` (new)
**Analog:** `src/components/ai/AIChatDrawer.tsx` existing tool loop (abort controller + persistence) and AI-SPEC §3 `runGroundedTurn` example

One `AbortController` per turn. Fallback allowlist (local BM25 only on disabled/absent/`NETWORK_ERROR`/`TIMEOUT`; never on `ABORTED`, `INVALID_RESPONSE`, `REMOTE_ERROR`, or valid semantic outcomes). Branch:

- `NEEDS_CLARIFICATION` → `CandidateChipList`.
- `NO_EVIDENCE`/`UNSUPPORTED` → refinement chips, no synthesis.
- `READY`/`DEGRADED` → pack → `completeJson` → closure → persist.
- Model unavailable but server `READY` → `EvidenceOnlyCard` with `Tạo câu trả lời từ bằng chứng` (D-43/D-44).
- `INVALID_GROUNDED_OUTPUT` after 2 repairs → safe error + retry (D-45).

Check `signal.aborted` + turn ID before `saveMessage`. Keep `tools: []` for synthesis.

### Local range-bearing BM25

**File:** `src/services/search/localGroundedRetrieval.ts` (new)
**Analog:** `src/utils/bm25.ts::extractRelevantSnippet` (lines 141–211)

Keep current heading-boosted line-selection logic but return `LocalEvidenceRange { documentId, sectionAnchor, lineStart, lineEnd, startOffset, endOffset, rawSnippet, contentHash, score, matchedTerms }`. Line indices come from the same `trimmed.split('\n')` traversal used today; offsets via running character sum. Reuse `tokenize` and `rankBM25`. Restrict corpus to current local document members of **resolved sets only** (D-37); never scan all drafts.

Strong-evidence threshold (deterministic, A1 assumption): at least 2 distinct query terms matched OR exact normalized identifier/title match, plus positive BM25. Weak → `LOCAL_FALLBACK_RESULTS` (ranked list, no prose).

### Persistence (ChatMessage.grounding)

**Files:** `src/types/models.ts`, `src/db/repositories/chatRepo.ts`, `src/validation/backupSchemas.ts`
**Analog:** self (lines above)

`ChatMessage` already stores unindexed object fields (`tokenUsage`, `generatedFiles`). Add optional `grounding?: ChatMessageGrounding`. Dexie `stores()` in `src/db/schema.ts:65` need **no bump** — unindexed. In `chatRepo.ts::saveMessage` (lines 67–92), extend the trailing conditional spread:

```ts
...(input.grounding ? { grounding: input.grounding } : {}),
```

Validate at backup boundary via extension to `BackupChatMessageRecordSchema` (`src/validation/backupSchemas.ts:223`) using `GroundedAnswerSchema` + bounded excerpt cap (per-citation ≤ 1,200 chars; per-answer ≤ 20 excerpts).

### Historical citation durability

**File:** `src/components/notes/QuickPreviewDrawer.tsx` (extend)
**Analog:** self (lines 29–245)

Accept new props: `sectionAnchor?`, `lineRange?: { start; end }`, `citedSnapshotId?`, `citedExcerpt?`, `citedContentHash?`. Add a top panel showing line-numbered raw cited Markdown (snapshot-first per D-47). Below, keep existing `renderSafeMarkdown` of current local body. Compare current normalized hash via existing `computeSha256(normalizeMarkdownForHash(body))` from `src/db/repositories/documentSetRepo.ts`; mismatch → red `GroundedBanner variant="snapshot-mismatch"` using Vietnamese copy from UI-SPEC. When daemon has removed the snapshot, show `citedExcerpt` with `snapshot no longer available` status (D-48).

Focus/highlight pattern on the raw panel:

```tsx
const ref = useRef<HTMLDivElement | null>(null);
useEffect(() => {
  if (!open || !lineRange) return;
  ref.current?.focus({ preventScroll: false });
  ref.current?.scrollIntoView({ block: 'center' });
}, [open, lineRange]);
```

Respect `prefers-reduced-motion` for highlight fade (UI-SPEC Accessibility).

### UI — grounded card family

**Analog composition:**

- `GroundedAnswerCard.tsx` — Ant `Card` + `Collapse` wrapping sections (Answer, Paths, Sources, Diagnostics) per UI-SPEC §State Matrix. Branch on 9 outcome variants.
- `GroundedBanner.tsx` — single component with `variant` prop; map to Ant `Alert` type (`info`/`warning`/`error`/`success`) using `theme.useToken()` semantic colors. Copy exactly from UI-SPEC Copywriting table.
- `CitationGroup.tsx` + extended `CitationChip.tsx` — reuse existing `Tag` + `Tooltip` pattern (lines 27–72). Add `index`, `source: 'server' | 'local'`, `evidenceClass`, `range`, `snapshotId`. Server variant `[N]` uses `colorPrimary`; local `[LN]` uses `colorFillSecondary` + `Local` tag (D-21/D-42). Keep `role="button" tabIndex={0}` keyboard activation at lines 47–54.
- `GraphPathCard.tsx` — one card per snapshot, hop rows show source → relation → target with classification badge. Never concatenate hops across snapshots (D-14).
- `ScopeChipsBar.tsx` — editable chips after routing (not before), matches UI-SPEC §Specifics example `Đang tra cứu: Card System · Kiến thức chung · PROD` (D-15).
- `EvidenceOnlyCard.tsx` — shows ranked citations + button `Tạo câu trả lời từ bằng chứng` triggering stored-evidence synthesis using exact persisted pack (D-44).

### Chat drawer wiring

**File:** `src/components/ai/AIChatDrawer.tsx` (modify)
**Analog:** self

Move API-key check from pre-retrieval to pre-synthesis (Pitfall 5). Route first → retrieve → if `READY`/`DEGRADED` + model present → synthesize; otherwise render `EvidenceOnlyCard` or `LOCAL_FALLBACK_*`. One `AbortController` per turn; abort on drawer close, scope change, retry.

### DocumentSetForm scope extension

**File:** `src/components/knowledge/DocumentSetForm.tsx` (extend)
**Analog:** self (lines 27–80)

Keep `empty`/`folder`/`manual` radio. Add friendly presets (D-18): `Chung`, `Theo môi trường`, `Theo module`, `Theo phiên bản`, `Bổ sung`, `Tùy chỉnh`. Required basic scope (domain + one facet) stays visible; `advanced` collapsed `Collapse` exposes relation (`EXTENDS`/`SUPPLEMENTS`/`SUPERSEDES`) and aliases. Persist on `DocumentSet.scope`, `DocumentSet.aliases`, `DocumentSet.relations[]` additions in `src/types/models.ts:251`.

No legacy migration (D-35) — existing test sets may be deleted and rebuilt.

### Tests

- `tests/ai/groundedAssistantEval.test.ts` — fixture replay harness; load JSON reference, mock retrieval + model, assert closure/outcome/paths/conflicts. Pattern: `tests/knowledge/offlineIsolation.test.ts` `fetch` stubbing (lines 17–51).
- `tests/ai/groundedTurn.test.ts` — assert zero model calls for `NO_EVIDENCE`/`UNSUPPORTED`/`NEEDS_CLARIFICATION`; assert fallback allowlist by error code.
- `tests/ai/CitationChipAndQuickPreview.test.tsx` — extend existing (file lines 1–60) with `[L#]` variant, Enter/Space, exact-range focus, snapshot-mismatch banner render.
- `tests/knowledge/offlineIsolation.test.ts` — add turn: scoped BM25 fallback with zero daemon egress (reuse `fetcher.mockRejectedValue` + `expect(fetcher).not.toHaveBeenCalled()` pattern).
- `tests/backup/backupChatGrounding.test.ts` — round-trip export/import preserves `grounding`; forbidden-field redaction.

---

## Shared Patterns

### Strict Zod boundary with safeParse + redaction

**Source:** `src/services/knowledge/knowledgeClient.ts:338–389`
**Apply to:** every new boundary (`retrievalProtocol.ts` mirror, `groundedAnswerSchemas`, backup extension, semantic router output).

```ts
const parsed = schema.safeParse(json);
if (!parsed.success) {
  throw new KnowledgeClientError('INVALID_RESPONSE', '...invalid response', response.status);
}
```

Never cast; always `safeParse`; always redact token/apiKey through existing `redact()`/`redactApiKey()` helpers.

### Zod `strictObject` + `superRefine` for semantic invariants

**Source:** `knowledge-server/src/types/retrievalProtocol.ts:308–380`
**Apply to:** grounded answer schema, ordered path schema, federated request/response.

### Promise.allSettled fan-out with per-task timeout

**Source:** `knowledge-server/src/services/retrievalService.ts:95–252`
**Apply to:** federated retrieval orchestrator, bounded repair retries (serial, not parallel).

### Dexie unindexed object property + transactional save

**Source:** `src/db/repositories/chatRepo.ts:67–92`
**Apply to:** `ChatMessage.grounding` persistence — no `stores()` bump needed.

### Ant Design Tag + Tooltip + role="button" keyboard activation

**Source:** `src/components/ai/CitationChip.tsx:18–75`
**Apply to:** every new chip-shaped control (`CitationGroup`, `CandidateChipList`, `IntentRoutingPrompt`, `ScopeChipsBar`).

### Content-free retry/timeout taxonomy

**Source:** `knowledge-server/src/services/retrievalService.ts:95–128` and `src/services/knowledge/knowledgeClient.ts:338–389`
**Apply to:** `knowledgeClient.retrieve`, `completeJson`, federated client.

### Normalized SHA-256 hash comparison (snapshot mismatch)

**Source:** `src/db/repositories/documentSetRepo.ts::computeSha256 + normalizeMarkdownForHash`
**Apply to:** `QuickPreviewDrawer` mismatch warning, local grounded retrieval `contentHash`.

### fake-indexeddb + global fetch stub test pattern

**Source:** `tests/knowledge/offlineIsolation.test.ts:1–51`
**Apply to:** every new DB-touching test; `vi.stubGlobal('fetch', ...)` for daemon absence/network failure cases.

---

## No Analog Found

| File | Role | Reason |
|------|------|--------|
| `tests/fixtures/ai/grounded-assistant-reference.json` | fixture | No prior Phase-19-shape fixture exists; schema defined by AI-SPEC §5. |
| `src/components/ai/grounded/GraphPathCard.tsx` | component | Closest is `GraphEvidenceDrawer.tsx` but that's a drawer, not an inline step card; use UI-SPEC vertical-step contract directly. |
| `src/services/ai/semanticScopeRouter.ts` | service | No existing structured-LLM-tool call in repo; compose from `nineRouterClient.completeJson` once added. |

---

## Metadata

**Analog search scope:** `knowledge-server/src/{types,retrieval,services,routes,graph}`, `src/{components/ai,components/knowledge,components/notes,services/ai,services/knowledge,services/search,db/repositories,types,utils,validation}`, `tests/{ai,knowledge,backup}`.
**Files scanned:** ~60.
**Pattern extraction date:** 2026-10-11.
