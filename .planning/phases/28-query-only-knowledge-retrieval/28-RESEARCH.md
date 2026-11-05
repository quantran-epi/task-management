# Phase 28: Query-Only Knowledge Retrieval - Research

**Researched:** 2026-11-05
**Domain:** Federated knowledge retrieval over published Markdown snapshots; client/server protocol evolution; evidence attribution and source inspection; cross-surface empty/unavailable outcomes
**Confidence:** MEDIUM-HIGH for codebase facts, MEDIUM for design recommendations, LOW for live-runtime readiness claims (no running Neo4j/Docker)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Published set discovery and incomplete coverage
- **D-01:** Default retrieval considers all published server sets, not the local catalog and not a relevance-selected subset that silently excludes sets. On a fresh device, ordinary AI Chat, Analysis Mode, SDLC step chat and Telegram search the server immediately for knowledge requests. An empty local catalog must not trigger a request to select a set or clarify document scope.
- **D-02:** A successfully published set whose graph is building, unavailable or failed remains eligible for whatever retrieval modalities are available. Use available fulltext/vector evidence and disclose missing graph capability; do not discard the whole set just because graph is not ready. Research must verify the actual modality prerequisites and report unavailable modalities truthfully rather than inventing readiness.
- **D-03:** Budgets remain finite. If published sets exceed the budget, return bounded partial evidence and an explicit incomplete-coverage warning. Do not claim every set was searched or that evidence is complete. An unsearched set is not a set with no matches.
- **D-04:** If some sets timeout/fail while others return evidence, continue with available evidence and disclose the failed/timed-out coverage. Never infer that missing information does not exist when retrieval coverage is incomplete. If nothing is usable, report the corresponding unavailable/degraded state, not successful empty coverage.

#### Request scope and personal-app simplicity
- **D-05:** Query-only is the default. An explicit restriction stays optional for callers that already know their sets. Preserve that restriction exactly: unavailable/unpublished/unknown requested sets must not silently broaden retrieval to unrelated sets; report actionable unavailability.
- **D-06:** Project/CR document links provide context, not an implicit set filter. SDLC also searches all published server sets by default. Only a caller's explicit restriction narrows scope.
- **D-07:** This is a personal app with no old clients to support. Upgrade app and daemon together; do not build backward-compatibility branches, old-protocol fallback, version negotiation or an extra compatibility endpoint. This supersedes the user's earlier tentative compatibility selection. Explicit set requests remain supported because SDLC-RET-05 requires them, not for old-client compatibility.

#### Set/snapshot attribution and source inspection
- **D-08:** Include set/snapshot attribution in the model-readable tool result and existing expandable source/tool details. Do not add an always-visible badge or repeat snapshot IDs in every answer by default. Preserve existing evidence, entities, paths, warnings and citation IDs.
- **D-09:** Source details distinguish sets contributing evidence, sets searched with no evidence, failed/timed-out sets and sets not searched because of budgets. Do not label all selected or searched sets as having answered. Snapshot attribution must describe the snapshot actually used; do not invent a snapshot for an unsearched/failed set when none is known.
- **D-10:** A citation must remain useful without its document existing locally: display the returned excerpt, section and set/snapshot identifiers through source details, and clearly state that the local document is absent. Do not automatically download/import documents or make retrieval depend on opening a local editor.
- **D-11:** When evidence from two sets conflicts, retain separately attributable citations for both sets/snapshots and disclose the conflict and unresolved conclusion. Do not silently choose one source as authoritative or concatenate graph paths across snapshots.

#### Empty server, fallback and cross-surface messages
- **D-12:** Use this canonical message verbatim when the server has no published sets:

  > Knowledge Server chưa có bộ tài liệu nào được publish. Hãy publish ít nhất một bộ tài liệu từ thiết bị có tài liệu, rồi thử lại.

  The device asking the question does not need local documents. The remedy is publishing from a device that has them, not importing documents onto every client.
- **D-13:** The application renders that canonical notice directly across AI Chat, SDLC step chat and Telegram, including tool-driven paths; do not rely on the model to paraphrase it. The tool/model also receives a structured code/status so it cannot interpret the outcome as evidence. Rendering/chrome may differ by surface, but the notice text must be identical.
- **D-14:** If the server is empty and local documents are available, retain the canonical server-empty notice, then use the existing local fallback with an explicit local-only evidence label. Do not imply the server returned those results. If no local evidence exists, leave the actionable notice; never invent an answer.
- **D-15:** Keep three cases distinct: no published sets (guide publishing), published sets searched but no evidence (guide query refinement), and server unreachable/unavailable (report unavailability and use labeled local fallback where available). None may become a generic exception or be mislabeled as another case.

### Claude's Discretion
- Discover published sets from authoritative server state; researcher determines how active Markdown snapshots, retrieval indexes and active graphs relate. Never require the client to supply a local catalog for discovery.
- Prefer extending the existing `/api/v1/retrieve` path if sufficient. Exact optional-field schema, internal resolved-request types, outcome codes and response attribution shape are implementation choices, not user-locked API syntax. No extra endpoint/discriminator without a demonstrated need.
- Choose finite default budgets, deterministic enumeration/selection under caps and bounded attribution representation, while preserving honest coverage and the existing trust invariants.
- Reuse current source/tool detail and citation components. Exact Ant Design layout and local-document-absent copy are discretionary; the canonical empty-server notice above is not.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within Phase 28. Repository execution, conventions, external research and prompt transparency remain later roadmap phases. Automatic remote-document import and new set-management UI are not needed for this phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SDLC-RET-01 | `retrieve_knowledge` accepts a query and `limit` only and no longer requires a locally derived set ID list; a machine with no local documents still retrieves. | Wire request schema becomes `{query, limit?}`; server resolves published sets. Every client default path that calls `fetchSetCatalog` before retrieval must be removed: `knowledgeRetrievalTool.ts`, `AIChatDrawer` grounded path, Telegram grounded setup, plus the `groundedTurn` scope gate. |
| SDLC-RET-02 | The knowledge server federates a query-only request across every published set and returns which sets and snapshots answered, alongside existing evidence, entities, paths, and warnings. | Add server-authoritative enumeration over `SnapshotStore`; resolve per-set capability (published Markdown, lexical index, vectors, graph); extend federated response with bounded per-set attribution. Existing `runFederatedRetrieval`, per-set `RetrievalService` and evidence wrappers are reused. |
| SDLC-RET-03 | Query-only requests keep the existing trust guarantees: bounded budgets, single-snapshot path closure, citation IDs, and degraded/unavailable outcomes reported truthfully. | Fix per-set/per-task deadline enforcement, first-item character-cap bypass, federated orphan-path acceptance, evidence-pack snapshot collapsing, and all-failed reporting. Add regression tests for closure, attribution, budgets and truthfulness. |
| SDLC-RET-04 | When no published set exists the response is a clear, actionable message (not a generic exception), and the client surfaces it in AI Chat, SDLC step chat, and Telegram identically. | Add a structured server-empty code; export one canonical message constant; render application-side in Drawer, SDLC widget and Telegram, including tool-driven paths. Keep no-published, searched-no-evidence and unreachable distinct. |
| SDLC-RET-05 | An explicit set restriction remains available for callers that already know their sets (for example project-scoped SDLC evidence), but it is optional and never the default. | Optional `setIds` on the wire request; exact-match validation; unknown/unpublished requested sets produce per-set unavailable attribution, never broaden to all sets. SDLC wizard `resolveSetIds` remains an explicit caller restriction only where deliberately passed, not an implicit link filter. |
</phase_requirements>

## Summary

The phase's central premise needs one correction before planning: **fulltext and vector retrieval are not independent of graph construction in the current server.** The published Markdown snapshot is created by `AttemptService`, but the full-text index, vector index and graph are all produced by the graph-build path (`buildRetrievalGeneration` runs only inside `GraphBuildService.prepareCandidate`, after LLM prose extraction). Production retrieval then acquires a lease only from the **active graph snapshot** (`acquirePinnedSnapshot` returns `null` without `active.retrievalGeneration`), and the retrieval service is registered at all only when Neo4j is enabled. Therefore D-02's "use available fulltext/vector evidence when graph is not ready" cannot be satisfied by the current code path: when graph is not ready, fulltext/vector are usually not ready either. The grounded solution is to give the server a **snapshot-lexical retrieval modality over the active published `ProjectionSnapshot`** (chunks, headings, line and offset ranges are already in memory), keep graph/vector available only when a generation is active and ONLINE, and report each modality's true state. That is a new server module, not a new endpoint and not a new dependency.

The second correction is that query-only is blocked in three independent places, not one. The wire schema rejects requests without `setTierAssignments`, `comparisonMode` and `budgets` (verified by a runtime parse probe). `groundedTurn` resolves scope from the local catalog and returns `clarify_intent` when the resolved assignment list is empty. `knowledgeRetrievalTool`, the Drawer and Telegram each call `fetchSetCatalog` and derive set IDs before dispatch. SDLC wizard/hub evidence collection also derives `resolvedSetIds` from local sets. Fixing only the tool leaves ordinary chat, SDLC chat and Telegram broken.

The third correction is that attribution is currently lossy after federation. The server response wrapper carries `setId`/`snapshotId`, but `packEvidence` deduplicates chunks by document/range/hash without snapshot identity; a probe with identical document/range in two sets at different snapshots produced **one citation retaining only the first snapshot and two set memberships**. Federated schema validation also accepts a path whose hop citation references no returned chunk (probe accepted it), relying on the client packer to drop the path. Conflict wrappers lose `setId`/`snapshotId` when flattened. All three violate D-09/D-11 and need explicit fixes plus tests.

**Primary recommendation:** Extend `/api/v1/retrieve` with a thin `{query, limit?, setIds?}` wire request; resolve all published sets server-side from `SnapshotStore`; build per-set capability from published snapshot + optional index/graph state; add a deterministic, deadline-bounded, snapshot-lexical fallback modality; return a bounded per-set coverage ledger; and fix client scope gating, evidence packing and source inspection. Add no endpoint, no package, no set picker and no import path.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Published-set discovery | API / Backend | — | Only the server knows which Markdown snapshots are active. `SnapshotStore` is server state; the client catalog is device-local and may be empty. |
| Query-only request acceptance and defaults | API / Backend | Browser / Client | Client sends `{query, limit?}`; server owns budgets, set enumeration, tier resolution and validation. Client validates the same wire contract before dispatch. |
| Per-set modality readiness (lexical / vector / graph) | API / Backend | — | Index and graph state are server/Neo4j facts. Client must consume reported states, never infer readiness. |
| Federation, dedupe, budgets, coverage ledger | API / Backend | — | Existing `runFederatedRetrieval` owns bounded fan-out; extend it with attribution and deadline-safe scheduling. |
| Citation identity and path closure | API / Backend | Browser / Client | Server guarantees per-set single-snapshot closure; client must preserve it through packing, persisting and rendering. |
| Explicit set restriction | Browser / Client (caller intent) | API / Backend (validation) | The caller chooses restriction; the server validates exactly and never broadens. |
| Empty/unavailable outcome classification | API / Backend (code) | Browser / Client (render) | Server returns a structured code; application surfaces render the canonical notice, never the model. |
| Local fallback evidence | Browser / Client | — | Local BM25 is a client capability and must remain labeled local. |
| Source inspection without local document | Browser / Client | API / Backend (excerpt/provenance payload) | Citation excerpt and provenance must already be in the response; UI must render them absent a local note. |
| Local docs, autosave, IndexedDB, PWA/Tauri behavior | Browser / Client | — | Unchanged and must not depend on daemon availability. |

## Standard Stack

### Core
| Library / API | Installed version | Purpose | Why Standard |
|---------------|-------------------|---------|--------------|
| TypeScript | 7.0.2 `[VERIFIED: package.json:45]` (`"typescript": "^7.0.2"`) | Server/client types and strict protocol evolution | Already the project language; no alternative. |
| zod | 4.6.5 `[VERIFIED: package.json:43]` (`"zod": "^4.6.5"`); server `^4.6.5` `[VERIFIED: knowledge-server/package.json:23]` | Wire request/response validation both sides | Existing strict schemas are the trust boundary; extending them keeps one validation system. `z.strictObject` rejects unknown keys and `.default()` makes input optional while output stays guaranteed `[CITED: zod.dev/api]`. |
| Fastify | `^5.12.5` `[VERIFIED: knowledge-server/package.json:16]` | HTTP server and route registration | Existing `/api/v1/retrieve` route; no new server framework. |
| neo4j-driver | `6.2.0` `[VERIFIED: knowledge-server/package.json:18]` (`"neo4j-driver": "6.2.0"`) | Optional graph/vector/fulltext index access | Existing; use only when active generation exists. |
| Vitest | 5.0.2 `[VERIFIED: package.json:62]`; server `^5.0.2` `[VERIFIED: knowledge-server/package.json:29]` | Focused unit/route tests | Existing root and server configs; explicit file filters supported `[CITED: vitest.dev/guide/cli]`. |
| Existing BM25 utility pattern | Source at `src/utils/bm25.ts:22-43`, `:51-135` | Deterministic lexical ranking | Reuse the algorithm and normalization behavior; do not add a search package. |
| Snapshot `ProjectionSnapshot` | `knowledge-server/src/indexing/incrementalProjector.ts:33-38` | Published Markdown chunks with heading/line/offset provenance | Already the server's authoritative published content; supports a lexical fallback with no index build. |

### Supporting
| Library / API | Installed version | Purpose | When to Use |
|---------------|-------------------|---------|-------------|
| `crypto.randomUUID()` | Native | Stable IDs | Existing server projection and lease IDs; do not add `uuid`. |
| `AbortController` / `AbortSignal` | Native | Per-task deadlines and cancellation | Use for per-set fan-out and queued-work cancellation. |
| `SnapshotStore` | Existing `knowledge-server/src/indexing/snapshotStore.ts:43-231` | Active published snapshot state | Add enumeration; do not create a second registry. |
| `AttemptService.listAttempts()` | Existing `knowledge-server/src/services/attemptService.ts:134-136` | Attempt-level state | Use only if attempt metadata is needed; active snapshot enumeration belongs in `SnapshotStore`. |
| `packEvidence` / `SourcesPanel` / `QuickPreviewDrawer` | Existing client modules | Citation and source detail surfacing | Extend rather than replace. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Snapshot-lexical fallback in server | Require graph build before any retrieval | Violates D-02 and leaves published-but-unbuilt sets unsearchable. Rejected. |
| Snapshot-lexical fallback in server | Add an external search engine (Elastic/Lucene service) | New dependency, ops burden, violates optional-daemon simplicity. Rejected. |
| Extend `/api/v1/retrieve` | New `/api/v1/retrieve/query-only` endpoint | Adds a second semantic path and discriminator without demonstrated need; D-07/CONTEXT discretion says no extra endpoint. Rejected. |
| New `setIds` wire field | Keep `setTierAssignments` as wire contract | Forces every client to know sets and tier semantics; query-only impossible. Rejected. |
| Per-set attribution array | Encode coverage only in warning messages | Warnings are unstructured strings and cannot distinguish "searched, no evidence" from "not searched" reliably. Rejected for model-readable attribution; warnings remain supplemental. |
| Preserve local catalog routing | Reuse catalog only when local docs exist | Empty catalog on fresh device is precisely the failure. Catalog may remain for local fallback/explicit features but not default remote scope. |

**Installation:** None. Do not add dependencies. `knowledge-server/node_modules` is currently absent, so server tests require installing the existing `package.json` dependency set (`npm --prefix knowledge-server install`) as an environment step, not a product dependency change.

**Version verification:** Installed versions verified from both `package.json` files. Registry latest observed via `npm view` on 2026-11-05: zod 4.6.7, fastify 5.12.8, neo4j-driver 6.3.0, vitest 5.1.0 `[VERIFIED: npm registry]`. Do not upgrade in this phase; upgrades are unrelated churn and the client/server protocol parity is already the risk surface.

## Package Legitimacy Audit

> No external package is added by this phase. The audit below covers only packages the existing server/client already use, because Wave 0 may install the server's existing dependencies to run focused tests.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| zod | npm | Inconclusive — seam returned `publishedAt: null` | Inconclusive — `weeklyDownloads: null` | Inconclusive — `repoUrl: null` | SUS (metadata unavailable) | Existing pinned dependency; no new install. Wave-0 server dependency install should be human-confirmed. |
| fastify | npm | Inconclusive | Inconclusive | Inconclusive | SUS (metadata unavailable) | Existing pinned dependency; no new install. |
| neo4j-driver | npm | Inconclusive | Inconclusive | Inconclusive | SUS (metadata unavailable) | Existing pinned dependency; no new install. |
| vitest | npm | Inconclusive | Inconclusive | Inconclusive | SUS (metadata unavailable) | Existing pinned dependency; no new install. |

**Packages removed due to SLOP verdict:** none.
**Packages flagged as suspicious:** none substantively — the seam could not retrieve registry metadata (all signals `null`), so verdicts are inconclusive rather than evidence of slopsquatting. `npm view` confirmed the packages exist and returned versions; `npm view <pkg> scripts.postinstall` returned nothing. The planner must not add packages and must gate any `knowledge-server` dependency install behind `checkpoint:human-verify`.

## Architecture Patterns

### System Architecture Diagram

```
Client surface (Drawer / SDLC step / Telegram / Analysis tool)
        │
        │ 1. {query, limit?, setIds?}          (no local catalog required)
        ▼
POST /api/v1/retrieve  ── auth + exact Origin + strict schema
        │
        ▼
Resolve scope
  ├─ explicit setIds? ── exact match; unknown/unpublished → per-set UNAVAILABLE, never broaden
  └─ default ── SnapshotStore.listActiveSnapshots() (server-authoritative)
        │
        ▼
Per-set capability probe
  ├─ published snapshot exists? ── no → not published (excluded from default; UNAVAILABLE if explicit)
  ├─ graph + retrieval generation active and index ONLINE? ── yes → graph/vector/fulltext(index)
  ├─ published snapshot but no active generation? ── snapshot-lexical fallback; graph/vector unavailable
  ├─ rebuild in progress? ── prior active generation may serve evidence; disclose snapshot staleness
  └─ read/lease failure? ── set failed/unavailable; no invented snapshot
        │
        ▼
Bounded fan-out (deterministic set order, per-task deadline, concurrency cap)
        │
        ▼
Per-set RetrievalResponse (existing per-set closure guarantees)
        │
        ▼
Federated pack (dedupe, budgets, per-set coverage ledger)
        │
        ▼
Federated response: evidence + paths + conflicts + modality status + set attribution + outcome code
        │
        ▼
Client schema validation
        ├─ NO_PUBLISHED_SETS → app renders canonical notice; optional labeled local fallback
        ├─ NO_EVIDENCE → refinement guidance
        ├─ DEGRADED / inaccessible → disclose, labeled local fallback where available
        └─ READY → evidence pack → synthesis/tool JSON → source details
        │
        ▼
Source inspection: excerpt + section + set/snapshot shown even when local note is absent
```

### Recommended Project Structure

No new directories are required. Changes concentrate in:

```
knowledge-server/src/
├── types/retrievalProtocol.ts          # wire request, outcomes, attribution schema
├── routes/retrieval.ts                 # resolve query-only into internal request
├── services/
│   ├── federatedRetrievalService.ts    # deadline-safe fan-out, coverage ledger
│   ├── retrievalService.ts             # modality planning per set
│   ├── snapshotLexicalRetrieval.ts     # NEW: BM25 over published ProjectionSnapshot
│   └── publishedSetDiscovery.ts        # NEW: enumerate + resolve per-set readiness
├── indexing/snapshotStore.ts           # add active-snapshot enumeration (no second registry)
└── graph/neo4jRepository.ts            # readiness probe / generation metadata (no new storage)

src/services/
├── knowledge/retrievalProtocol.ts      # mirror wire schema + attribution
├── knowledge/knowledgeClient.ts        # unchanged dispatch, new schema
├── ai/knowledgeRetrievalTool.ts        # query-only default + attribution in tool JSON
├── ai/groundedTurn.ts                  # remove catalog gate; canonical outcomes
├── ai/evidencePack.ts                  # snapshot-aware dedupe, per-set conflict attribution
├── ai/knowledgeOutcome.ts              # NEW: canonical code/message constants + mapping
├── telegram/telegramHeadlessWorker.ts  # canonical notice in grounded and tool paths
├── wizard/sdlcWizardRuntime.ts         # explicit restriction audit only
└── components/
    ├── ai/grounded/SourcesPanel.tsx    # set/snapshot columns/details
    ├── notes/QuickPreviewDrawer.tsx    # excerpt-first absent-local state
    └── sdlc/chat/StepChatPanel.tsx     # tool-driven notice surface
```

### Pattern 1: Thin wire request, server-resolved internal request

**What:** The wire accepts only user intent; the server derives tiering, budgets and comparison mode.
**When to use:** Every `/api/v1/retrieve` call.
**Example:**
```typescript
// Source: knowledge-server/src/types/retrievalProtocol.ts:679-688 (current contract)
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
```typescript
// Recommended wire shape (illustrative; exact optional-field syntax is planner discretion)
const WireRetrievalRequestSchema = z.strictObject({
  query: z.string().trim().min(1).max(4000),
  limit: z.number().int().min(10).max(50).default(20),
  setIds: z.array(z.string().uuid()).min(1).max(50).optional(),
  includeInferred: z.boolean().default(false),
  recentTurns: z.array(ConversationTurnSchema).max(3).default([]),
  contextHints: RetrievalContextHintsSchema.optional(),
});
```
Server then constructs the existing internal `FederatedRetrievalRequest` with resolved assignments (`REQUIRED`/`baseline` for explicit/simple query-only) and finite default budgets. Do not delete the internal type; it is the fan-out contract.

### Pattern 2: Server-authoritative discovery

**What:** Enumerate active published snapshots from `SnapshotStore`.
**When to use:** Default query-only requests and validation of explicit IDs.
**Grounded fact:** `SnapshotStore` keeps `readonly #activeBySet = new Map<string, ProjectionSnapshot>();` and exposes only `getActiveSnapshot(setId)`, `registerActiveSnapshot`, `purgeSet` `[VERIFIED: knowledge-server/src/indexing/snapshotStore.ts:43-47, :144-156, :182-224]`. There is no all-set enumeration today. Add a read-only method returning cloned `{setId, snapshotId}` pairs, or clones of active snapshots, sorted deterministically by `setId`. Do not read `#activeBySet` from another module.

### Pattern 3: Per-set capability plan, not a global assumption

**What:** Resolve each published set's available modalities before fan-out.
**When to use:** Every query-only request; also explicit restrictions.
**Grounded prerequisites:**
- Published Markdown snapshot exists → `SnapshotStore.getActiveSnapshot(setId)`.
- Retrieval generation exists only after graph build: `prepareCandidate` reads the active snapshot, runs prose extraction, then `buildRetrievalGeneration(candidate, sourceSnapshot, embeddingProvider)` before validation/activation `[VERIFIED: knowledge-server/src/services/graphBuildService.ts:202-207, :243-255, :303-321, :349-383]`.
- Lease acquisition requires an active graph with generation: `const active = await this.getActiveGraph(setId); if (!active || !active.retrievalGeneration) return null;` `[VERIFIED: knowledge-server/src/graph/neo4jRepository.ts:1093-1097]`.
- Full-text and vector indexes are created only inside `buildRetrievalGeneration`, with awaited ONLINE state `[VERIFIED: knowledge-server/src/graph/neo4jRepository.ts:858-884]`. Neo4j requires `ONLINE` before query and cannot query `POPULATING` `[CITED: neo4j.com/docs/cypher-manual/current/indexes/semantic-indexes/full-text-indexes/]`; vector indexes likewise must be `ONLINE` `[CITED: neo4j.com/docs/cypher-manual/current/indexes/semantic-indexes/vector-indexes/]`.
- Production registers retrieval only when Neo4j is enabled: `if (options.neo4j.enabled && options.neo4j.uri) { ... retrievalService = new RetrievalService(...) }` `[VERIFIED: knowledge-server/src/main.ts:405-499]`; the route is registered only if a retrieval service exists `[VERIFIED: knowledge-server/src/server.ts:148-150]`.

**Recommended readiness states per set:** `PUBLISHED_ONLY` (lexical snapshot available; vector/graph unavailable), `INDEXED` (lexical index + optional vector; graph may be unavailable), `GRAPH_READY` (all available), `FAILED`, `NOT_SEARCHED_BUDGET`, `UNPUBLISHED` (explicit request only). Report modality status separately: `lexical: ok`, `vector: unavailable|ok|stale`, `graph: unavailable|ok|timeout|stale`.

### Pattern 4: Snapshot-lexical fallback with real provenance

**What:** Rank chunks directly from the active `ProjectionSnapshot` using a server-side BM25 implementation and emit the same `ChunkItem` shape.
**When to use:** Published set has no active retrieval generation, or its graph/index is unavailable while Markdown is published.
**Grounded inputs:** `ProjectedChunk` already carries `occurrenceId`, `contentHash`, `chunkIndex`, `headingPath`, `startLine`, `endLine`, `startOffset`, `endOffset`, `rawContent`; `ProjectedDocument` carries `documentId`, `title`, `contentHash` `[VERIFIED: knowledge-server/src/indexing/incrementalProjector.ts:13-31]`.
**Implementation constraint:** `knowledge-server/tsconfig.json` sets `"rootDir": "src"` and `"include": ["src/**/*"]` `[VERIFIED: knowledge-server/tsconfig.json:14-17]`, so importing `src/utils/bm25.ts` from the client tree would break the server build. Implement a small server-local ranker with the same normalization/tokenization/scoring behavior, or move the algorithm to a shared module inside `knowledge-server/src` and keep client behavior unchanged. Do not add a dependency.
**Provenance:** set `snapshotId` to the published `ProjectionSnapshot.snapshotId`, `publishedContentHash` to the document content hash (existing full-text/vector paths use document hash as `publishedContentHash` `[VERIFIED: knowledge-server/src/graph/neo4jRepository.ts:1146-1160]`), `modalitiesContributed: ['fulltext']` (lexical family) and a diagnostic reason indicating snapshot-lexical service so the client does not claim index-backed fulltext.

### Pattern 5: Deadline-safe bounded fan-out and coverage ledger

**What:** Enforce a global deadline that includes queued work and produce a per-set ledger.
**Why:** Current `mapConcurrent` starts at most `concurrency` workers but queued items wait with no deadline awareness; a probe with `elapsedMs: 100`, concurrency 1, three sets each taking 70 ms returned after **226 ms** and still called all three sets. The elapsed check happens per tier, not per queued task `[VERIFIED: knowledge-server/src/services/federatedRetrievalService.ts:302-437]`. Also `packFederatedEvidence` retains an oversized first item because the character check is `totalCharsIncluded + itemChars > budgets.maxEvidenceChars && items.length > 0` `[VERIFIED: knowledge-server/src/services/federatedRetrievalService.ts:251-255]`; a probe with a 10-character budget retained a 100-character first chunk and returned `READY`.
**Recommended:** deterministic set order (sorted `setId`), cap sets before fan-out, check deadline before each task starts, abort queued tasks, and emit `BUDGET_ELAPSED`/`NOT_SEARCHED_BUDGET` ledger entries. Character cap must apply to the first item too (skip/truncate with explicit warning) or the budget is not a real cap.

### Pattern 6: Attribution and closure are separate guarantees

**What:** Preserve per-set/per-snapshot identity from server response through evidence packing to source details.
**Grounded failure:** `packEvidence` dedup key is `${chunk.sourceDocumentId}:${chunk.lineStart}:${chunk.lineEnd}:${chunk.publishedContentHash}` `[VERIFIED: src/services/ai/evidencePack.ts:218-219]`; a probe with identical doc/range/hash in two sets at different snapshots produced one citation with the first snapshot and two set memberships. Citation schema permits one `snapshotId` per citation `[VERIFIED: src/services/ai/groundedAnswerSchemas.ts:138-164]`, so merging snapshots is a correctness bug.
**Recommended:** dedup key includes `snapshotId` (and set membership is merged only within the same snapshot); preserve conflict wrappers (`setId`, `snapshotId`) rather than flattening; keep path closure per set and never concatenate `nodeUrns` across snapshots. Add tests that assert two snapshots produce two citation IDs and that an orphan federated path never yields a persisted path.

### Pattern 7: One canonical outcome vocabulary, rendered by the app

**What:** Server returns a structured code; application maps it to one exported message.
**Grounded gap:** Current outcomes are `READY`, `NEEDS_CLARIFICATION`, `NO_EVIDENCE`, `UNSUPPORTED`, `DEGRADED`, `SEED_ONLY` `[VERIFIED: knowledge-server/src/types/retrievalProtocol.ts:12-21]`. There is no "no published sets" code. The current all-sets-failed path yields `DEGRADED` while all modality statuses remain `ok` in a probe, because aggregation initializes them to `ok` and only overwrites on successful responses `[VERIFIED: knowledge-server/src/services/federatedRetrievalService.ts:448-491, :542-549]`. That is not truthful unavailable coverage.
**Recommended:** add a wire-visible outcome (for example `NO_PUBLISHED_SETS`) and ensure no-successful-coverage is never `READY`/plain `NO_EVIDENCE`. Export a single client constant for the canonical Vietnamese message and render it in Drawer/SDLC/Telegram, never via model paraphrase. The model/tool receives `{code, status, message}`.

### Anti-Patterns to Avoid
- **Client-catalog discovery:** deriving set IDs from `fetchSetCatalog` or `resolveSetIds` for the default path. Fresh device has no sets; this is the bug.
- **Published means ready:** treating `SnapshotStore.getActiveSnapshot` success as fulltext/vector/graph readiness.
- **Graph unavailable = set discarded:** dropping all evidence because graph is building/failed.
- **All selected sets answered:** labeling searched sets as contributors without evidence.
- **Invented snapshots:** filling a snapshot ID for a failed/unsearched set.
- **Cross-snapshot path merge:** concatenating graph paths from different snapshots/sets.
- **Flattened conflicts:** discarding `setId`/`snapshotId` from conflict wrappers.
- **Empty catalog clarification:** asking the user to choose a set on a fresh device.
- **Generic exceptions for empty server:** 404/500 or model text.
- **Auto-import/download:** making citations depend on a local document or editing flow.
- **New endpoint/discriminator:** adding a second retrieve route for query-only.
- **New package:** adding a search/BM25 library or HTTP client.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Set discovery registry | New published-set table or client catalog sync | `SnapshotStore` active map + new read-only enumeration | Already authoritative, persisted to disk, and updated on publish. |
| Lexical ranking | Custom substring scan presented as full-text | Server-local BM25 matching existing `src/utils/bm25.ts` behavior over `ProjectionSnapshot` chunks | Deterministic ranking, Vietnamese normalization, tested algorithm. |
| Federation | New parallel fan-out service | Existing `runFederatedRetrieval` + per-set `RetrievalService` | Already handles dedupe, warnings, modality aggregation and schema validation; extend it. |
| Citation closure | New validation layer | Existing per-set `BaseRetrievalResponseSchema` superRefine + federated one-snapshot-per-set rule; add missing federated hop check | Two closure checks already exist; fix the gap rather than duplicate. |
| Source UI | New document reader | `SourcesPanel` + `QuickPreviewDrawer` | Existing expandable details and citation components. |
| Local search | Server call to answer locally | Existing `runLocalGroundedRetrieval` / BM25 | Offline behavior must remain independent of daemon. |
| Auth/crypto | New token or crypto scheme | Existing bearer + exact Origin; existing Web Crypto if ever needed | No new secret surface; single-user app. |
| Rich text/HTML sanitization | New sanitizer | Existing safe Markdown rendering and structured React rendering | Keep untrusted excerpts as data, not HTML instructions. |

**Key insight:** The only genuinely new algorithm is server-side lexical ranking over an already-published snapshot. Everything else is extension of existing services and schemas.

## Common Pitfalls

### Pitfall 1: Assuming fulltext/vector survive graph failure
**What goes wrong:** A published set with failed/never-run graph build is treated as having searchable indexes; retrieval returns "no evidence" rather than "not indexed".
**Why it happens:** Index creation lives inside `buildRetrievalGeneration`, invoked only during `prepareCandidate`; activation is separate.
**How to avoid:** Per-set capability probe + snapshot-lexical fallback + truthful modality status.
**Warning signs:** Tests that mock `RetrievalResponse` directly never exercise publication/index state; only live or integration tests reveal the gap.

### Pitfall 2: Query-only blocked by strict schema
**What goes wrong:** Client sends `{query, limit}` and gets HTTP 400 before any server logic.
**Why it happens:** `setTierAssignments.min(1)`, required `comparisonMode`, required `budgets` in both mirrored schemas.
**How to avoid:** Change both schemas and parity tests together. Runtime probe confirmed rejection paths `setTierAssignments`, `comparisonMode`, `budgets`.
**Warning signs:** Root `knowledgeRetrievalTool` test still passes because it mocks `retrieveFederated`; only schema/route tests catch it.

### Pitfall 3: Empty local catalog still reaches `clarify_intent`
**What goes wrong:** Drawer/Telegram/SDLC ask the user to choose a set instead of querying the server.
**Why it happens:** `groundedTurn` checks `hasDocsScope = resolvedScope.setTierAssignments.length > 0` and returns `clarify_intent` when false `[VERIFIED: src/services/ai/groundedTurn.ts:312-326]`.
**How to avoid:** Default server path must not require a resolved local scope; only explicit restrictions use scope resolution.
**Warning signs:** Unit tests call `runGroundedTurn` with a nonempty catalog, masking the fresh-device case.

### Pitfall 4: Budget is not actually finite
**What goes wrong:** A request can exceed `elapsedMs` substantially while queued sets still run; first oversized evidence item bypasses `maxEvidenceChars`.
**Why it happens:** Worker pool queues without deadline gating; first-item exception in packer.
**How to avoid:** Deadline check before each queued task, abort pending work, deterministic truncation/warning; apply character cap to first item.
**Warning signs:** Timing tests with slow mocked per-set calls; no assertions on retained character count.

### Pitfall 5: Evidence pack collapses snapshots
**What goes wrong:** Two sets with the same document range at different snapshots become one citation; conflict attribution disappears.
**Why it happens:** Dedup key omits `snapshotId`; conflict wrapper is flattened.
**How to avoid:** Snapshot-aware dedup key; preserve wrapper metadata; tests with identical doc/range across snapshots.
**Warning signs:** `citations.length` assertions only use one set; cross-set tests reuse one snapshot.

### Pitfall 6: Federated schema accepts orphan paths
**What goes wrong:** Path references a chunk not returned after budget truncation; client silently drops the path or renders an unclosed path.
**Why it happens:** `FederatedRetrievalResponseSchema` validates one snapshot per set but not hop citation membership. Probe accepted an orphan path.
**How to avoid:** Validate hop citations against returned chunk IDs per set/snapshot; drop or mark path before response; add regression.
**Warning signs:** Tests only validate paths in per-set responses.

### Pitfall 7: All sets failed looks like empty success
**What goes wrong:** User sees "no evidence" or a DEGRADED result with all modalities `ok`, implying documents were searched.
**Why it happens:** Modality aggregation starts at `ok`; coverage warnings exist but modality status is not overwritten for total failure unless every failure is TIMEOUT.
**How to avoid:** Coverage ledger with `SEARCHED_NO_EVIDENCE` vs `FAILED`; no-success outcome cannot be `READY`/plain `NO_EVIDENCE`; modality unavailable/degraded.
**Warning signs:** Assertions check only `outcome`, not modality/attribution.

### Pitfall 8: Local-absent source inspection hides the excerpt
**What goes wrong:** On a fresh device, clicking a citation opens an empty modal; the returned excerpt is not shown because it is rendered inside the `doc` branch.
**Why it happens:** `QuickPreviewDrawer` renders `Empty description="Không tìm thấy tài liệu hoặc đã bị xóa"` when `!doc` and only renders the cited excerpt panel after a local note exists `[VERIFIED: src/components/notes/QuickPreviewDrawer.tsx:395-407]`.
**How to avoid:** Render excerpt + section + set/snapshot + "local document absent" before/independent of note loading.
**Warning signs:** Tests always seed a local note.

### Pitfall 9: Model paraphrase replaces canonical notice
**What goes wrong:** Empty-server state reaches the model as tool output and the model says something else.
**Why it happens:** Tool result is plain JSON and rendering is model-driven; no app-level interception.
**How to avoid:** Structured code + host detection + application-rendered notice; model receives code but cannot own the copy.
**Warning signs:** Tests assert tool JSON, not rendered notice.

### Pitfall 10: Telegram tool-driven path bypasses grounded formatter
**What goes wrong:** Telegram's grounded formatter handles `runGroundedTurn`, but the tool loop path has no `onToolResult`, so a tool-driven empty-server result is never rendered canonically.
**Why it happens:** Telegram calls `runAiOrchestratorLoop` without tool-result callbacks `[VERIFIED: src/services/telegram/telegramHeadlessWorker.ts:1417-1447]`.
**How to avoid:** Pass an `onToolResult` detector or centralize outcome rendering in the Telegram tool path; test both grounded and tool-driven.
**Warning signs:** Only the grounded path has tests.

### Pitfall 11: Explicit restriction broadens silently
**What goes wrong:** Caller requests one set; it is unpublished; server searches all sets.
**Why it happens:** Query-only default and explicit restriction share one resolution path; unknown IDs are ignored.
**How to avoid:** Branch on presence of `setIds`; exact validation; per-set `UNAVAILABLE`/`UNKNOWN` attribution; never fall back to all sets.
**Warning signs:** Tests assert total evidence but not which sets were queried.

### Pitfall 12: Client/server protocol drift
**What goes wrong:** Valid server response is rejected by strict client schema, degrading to local BM25.
**Why it happens:** Two mirrored schemas; existing parity test only compares selected shape keys, not new attribution fields or outcomes.
**How to avoid:** Update both schemas and extend `tests/knowledge/retrievalProtocolParity.test.ts`; validate route response end to end.
**Warning signs:** Parity test passes while a new field is missing from one side.

### Pitfall 13: Optional daemon becomes required
**What goes wrong:** Local docs/autosave/BM25 stop when server is absent because scope resolution or UI depends on server state.
**Why it happens:** Moving discovery server-side can accidentally remove local fallback scope.
**How to avoid:** Keep local fallback independent; do not gate Drawer/SDLC/tool availability on server; test daemon absent.
**Warning signs:** Fresh-device tests mock server success only; no offline test after changes.

### Pitfall 14: Stale active generation is reported as current
**What goes wrong:** A set is republished; the active graph/index still points at the previous source snapshot; evidence is from an older Markdown state.
**Why it happens:** Publish promotes the Markdown snapshot immediately; graph activation happens only after a successful rebuild. Retrieval uses the active graph snapshot.
**How to avoid:** Attribution carries both published snapshot ID and retrieval snapshot ID; if different, status `STALE_INDEX`/warning. Do not claim the new published snapshot was searched.
**Warning signs:** Tests assume published snapshot ID equals retrieval `snapshotId`.

### Pitfall 15: Live readiness claims without a running stack
**What goes wrong:** Research or verification claims indexes are ready based on unit mocks.
**Why it happens:** No Docker CLI in WSL, no Neo4j on 7474/7687, no server on 3001, and `knowledge-server/node_modules` absent in this environment.
**How to avoid:** Mark live checks as manual/blocked; rely on mocked readiness tests; run `npm run test:knowledge:live` only when the stack is up.
**Warning signs:** "Verified live" claims without probe output.

## Code Examples

### Current strict wire contract (the query-only blocker)
```typescript
// Source: knowledge-server/src/types/retrievalProtocol.ts:679-688
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
Probe result (this session): `{query:"EVT_EVENT",limit:20}` → `query-only accepted: false`, issues at `setTierAssignments` (`invalid_type`), `comparisonMode` (`invalid_value`), `budgets` (`invalid_type`). `[VERIFIED: runtime parse probe]`

### Current catalog gate in grounded routing
```typescript
// Source: src/services/ai/groundedTurn.ts:312-326
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
This must not apply to the default server-enabled query-only path. `[VERIFIED: src/services/ai/groundedTurn.ts:312-326]`

### Current tool derives sets from local catalog
```typescript
// Source: src/services/ai/knowledgeRetrievalTool.ts:47-53
const requestedSetIds = Array.isArray(args.setIds) ? args.setIds.filter(Boolean) : [];
const catalog = requestedSetIds.length > 0 ? [] : await fetchSetCatalog(db);
const setIdList =
  requestedSetIds.length > 0 ? requestedSetIds : catalog.map((entry) => entry.setId);
if (setIdList.length === 0) {
  return JSON.stringify({ error: 'Chưa có bộ tài liệu nào để tra cứu.' });
}
```
`[VERIFIED: src/services/ai/knowledgeRetrievalTool.ts:47-53]`

### Current tool output discards attribution
```typescript
// Source: src/services/ai/knowledgeRetrievalTool.ts:81-101
const pack = packEvidence({ authority: 'server', serverResponse: response });
return JSON.stringify({
  outcome: response.outcome,
  excerpts: pack.promptEvidence.map((item) => ({
    id: item.id,
    title: item.documentTitle,
    section: item.sectionAnchor ?? null,
    text: item.text,
  })),
  entities: (pack.entities ?? []).map((entity) => ({
    urn: entity.urn,
    name: entity.canonicalName,
    kind: entity.kind,
  })),
  paths: Object.values(pack.paths).map((path) => ({
    pathId: path.pathId,
    nodes: path.nodeUrns,
    classification: path.classification,
  })),
  warnings: [...new Set(pack.coverageWarnings)],
});
```
No `setId`, `snapshotId`, per-set coverage, or outcome code reaches the model. `[VERIFIED: src/services/ai/knowledgeRetrievalTool.ts:81-101]`

### Current snapshot-aware source record shape (dedupe must respect snapshot)
```typescript
// Source: src/services/ai/evidencePack.ts:9-30
export interface SourceRecord {
  readonly citationId: string;
  readonly documentId: string;
  readonly documentTitle: string;
  readonly sectionAnchor: string | null;
  readonly lineStart: number;
  readonly lineEnd: number;
  readonly authority: 'server' | 'local';
  readonly evidenceClass: 'OBSERVED' | 'INFERRED' | 'BUSINESS_APPROVED' | 'LOCAL';
  readonly snapshotId: string | null;
  readonly publishedContentHash: string | null;
  readonly citedExcerpt: string;
  readonly relevanceReason?: string | undefined;
  readonly setMemberships: readonly { readonly setId: string; readonly setName: string }[];
  readonly evidenceKind?: 'policy_change' | 'release_note' | 'migration_record' | 'mcp_tool' | 'other' | undefined;
  readonly conflictGroupId?: string | undefined;
  readonly mcpMetadata?: {
    readonly serverId: string;
    readonly serverName: string;
    readonly toolName: string;
  } | undefined;
}
```
`[VERIFIED: src/services/ai/evidencePack.ts:9-30]` — `snapshotId` exists but is not in the dedup key at `:218-219`.

### Current canonical outcome vocabulary
```typescript
// Source: knowledge-server/src/types/retrievalProtocol.ts:12-21
export const RETRIEVAL_OUTCOMES = [
  'READY',
  'NEEDS_CLARIFICATION',
  'NO_EVIDENCE',
  'UNSUPPORTED',
  'DEGRADED',
  'SEED_ONLY',
] as const;
```
`[VERIFIED: knowledge-server/src/types/retrievalProtocol.ts:12-19]` — no server-empty code.

### Current per-set persistence hook
```typescript
// Source: knowledge-server/src/indexing/snapshotStore.ts:43-47
export class SnapshotStore {
  readonly #candidates = new Map<string, SnapshotCandidate>();
  readonly #candidateIdsBySet = new Map<string, string[]>();
  readonly #activeBySet = new Map<string, ProjectionSnapshot>();
  readonly #approvalsBySet = new Map<string, Map<string, GraphApprovalRecord>>();
```
Enumeration must be added through a method; the map is private. `[VERIFIED: knowledge-server/src/indexing/snapshotStore.ts:43-47]`

### Current server registration is conditional on Neo4j
```typescript
// Source: knowledge-server/src/main.ts:405, :488-498
if (options.neo4j.enabled && options.neo4j.uri) {
...
  retrievalService = new RetrievalService(
    { indexGateway, embeddingProvider, queryPlanner, graphGateway },
    { timeouts: options.timeouts },
  );
}
```
`[VERIFIED: knowledge-server/src/main.ts:405-499]`; route registration is guarded by `if (options.retrievalService)` `[VERIFIED: knowledge-server/src/server.ts:148-150]`. Query-only lexical retrieval therefore needs a retrieval service path that does not require Neo4j, or an explicitly reported unavailable state when Neo4j is disabled.

### Current local-absent preview branch
```tsx
// Source: src/components/notes/QuickPreviewDrawer.tsx:395-397
) : !doc ? (
  <Empty description="Không tìm thấy tài liệu hoặc đã bị xóa" />
) : (
```
The excerpt panel starts later inside the `doc` branch at `:407-477`. `[VERIFIED: src/components/notes/QuickPreviewDrawer.tsx:395-407]`

### Current Telegram grounded setup derives a local catalog
```typescript
// Source: src/services/telegram/telegramHeadlessWorker.ts:521-546
const catalog = await fetchSetCatalog(db);
const deps = createDefaultGroundedTurnDeps({
  knowledgeBaseUrl: knowledgeConfig.baseUrl,
  knowledgeToken: knowledgeConfig.token,
  db,
});

return runGroundedTurn(
  { query, recentTurns: chatHistory, signal: new AbortController().signal, capabilities,
    config: { endpoint: aiConfig.endpoint, apiKey, model: aiConfig.defaultModel,
      promptVersion: 'grounded-v1', routerVersion: 'router-v1' },
    catalog, recentSessionId: `telegram-${chatId}`,
    ...(routedIntent ? { preRoutedIntent: routedIntent } : {}) },
  deps
);
```
`[VERIFIED: src/services/telegram/telegramHeadlessWorker.ts:521-546]`; `formatGroundedNonAnswer` returns `null` for all non-terminal kinds other than clarify/error `[VERIFIED: src/services/telegram/telegramHeadlessWorker.ts:553-582]`.

### Current explicit SDLC restriction
```typescript
// Source: src/services/wizard/sdlcWizardRuntime.ts:181-192
resolveSetIds: async (projectId) => {
  const sets = await listDocumentSets(db);
  const projectSets = sets.filter(
    (set) => set.sdlc?.projectId === projectId && set.sdlc.purpose === 'sdlc');
  if (projectSets.length > 1) throw new Error('DUPLICATE_PROJECT_SDLC_SET');
  const baseSetIds = sets
    .filter((set) => set.isBase && set.sdlc === undefined)
    .map((set) => set.id);
  return Array.from(new Set([...projectSets.map((set) => set.id), ...baseSetIds]));
}
```
This is a local-set-derived restriction. D-06 says SDLC chat default searches all published sets; audit whether hub tech-doc/CAB evidence collection should keep this explicit restriction (they generate project-scoped artifacts) or become query-only. `[VERIFIED: src/services/wizard/sdlcWizardRuntime.ts:181-192]`

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Client sends locally derived `setTierAssignments` | Server resolves published sets from authoritative state | Phase 28 | Enables fresh-device retrieval; removes catalog coupling from default paths. |
| Fulltext/vector assumed available per published set | Per-set capability probe; snapshot-lexical fallback | Phase 28 (research finding) | Avoids inventing readiness and makes published-but-unbuilt sets searchable. |
| Budget enforcement per tier only | Per-task deadline aware of queued work | Phase 28 | Makes `elapsedMs` real; avoids silent overrun. |
| Coverage implied by warnings | Per-set coverage ledger (contributed / searched-no-evidence / failed / not searched) | Phase 28 | Honest incomplete-coverage disclosure. |
| Evidence pack dedupe by document/range/hash | Snapshot-aware dedupe | Phase 28 | Preserves D-11 separate attribution. |
| Generic no-evidence/error text | Structured outcomes + canonical app-rendered notice | Phase 28 | Cross-surface identical, actionable empty state. |
| Source inspection depends on local note | Excerpt-first citation inspection with local-absent notice | Phase 28 | Citations remain useful on a fresh device. |

**Deprecated/outdated:**
- `FederatedRetrievalRequest.setTierAssignments` as a **wire requirement** — keep only as internal resolved request.
- Client catalog as the default remote scope source — retain for local fallback/explicit features only.
- Presenting `DEGRADED` with all-`ok` modalities for total failure — replace with truthful unavailable coverage.
- "Graph not ready means no retrieval" — replace with explicit modality states.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Default budgets should be finite around concurrency 4, elapsed 15–30 s, maxSets 10–20, maxItems 50–100, maxEvidenceChars 56,000–80,000. | Architecture Patterns / Pattern 5 | Too low truncates useful evidence; too high hurts latency. Planner/discuss should confirm exact values. |
| A2 | Adding `NO_PUBLISHED_SETS` to the shared outcome enum is preferable to a diagnostics-only code. | Pattern 7 | If rejected, client mapping must use a structured diagnostic field consistently across grounded and tool paths. |
| A3 | A server-local BM25 implementation over `ProjectionSnapshot` is acceptable (not importing client `src/utils/bm25.ts`). | Pattern 4 | If a shared module is preferred, server `rootDir`/build config must change; otherwise server build breaks. |
| A4 | Per-set attribution should carry published snapshot ID and retrieval snapshot ID separately, with `STALE_INDEX` when different. | Pattern 3 / Pitfall 14 | Without it, a republished set's older evidence is mislabeled as current. |
| A5 | SDLC hub tech-doc/CAB evidence collection may keep an explicit project-scoped restriction, while SDLC chat default goes query-only. | Pattern 3 / code examples | If the user wants hub generation to also search all published sets, artifact grounding changes. |
| A6 | Local fallback may use all local document sets when the server is empty and local documents exist. | Summary / D-14 | If restricted to prior scope, local fallback may return nothing on a fresh session with local docs but no resolved set. |
| A7 | No new endpoint and no new package are required. | Standard Stack | If the planner adds either, it contradicts D-07/CONTEXT discretion and needs a demonstrated need. |
| A8 | Live Neo4j/index verification is not possible in this environment; readiness tests will be mocked. | Validation Architecture | A live regression could still exist; manual `test:knowledge:live` is required when Docker/Neo4j are available. |

## Open Questions (RESOLVED)

> **Resolved by plans 28-01..28-04:** (1) budgets fixed in 28-01 as `DEFAULT_QUERY_ONLY_BUDGETS`; (2) outcome adds one `NO_PUBLISHED_SETS` code plus a coverage ledger (28-01/28-02); (3) source details show published vs retrieval snapshot with `STALE_INDEX` (28-03); (4) lexical ranking logic duplicated into `knowledge-server/src` (28-01); (5) SDLC artifact generation keeps its project-scoped restriction while SDLC chat goes query-only (28-02); (6) the canonical notice is an app-rendered outcome/banner, never model text, with the local fallback as a separate labeled row (28-04). Each entry below is retained as the rationale record.

1. **Exact default budget values**
   - What we know: Existing grounded path uses `elapsedMs: 300000`, `maxSets: 10`, `maxItems: 200`, `maxEvidenceChars: 56000` `[VERIFIED: src/services/ai/groundedTurn.ts:503-512]`; tool path uses `elapsedMs: 60000`, `maxSets: 10`, `maxItems: 50`, `maxEvidenceChars: 80000` `[VERIFIED: src/services/ai/knowledgeRetrievalTool.ts:69-75]`.
   - What's unclear: Which values keep ordinary chat responsive when many sets are published.
   - Recommendation: Choose one server default (query-only) and let callers optionally lower item/char caps; assert deadline behavior with slow mocks.

2. **Outcome representation**
   - What we know: Shared enum has no server-empty code; both client and server schemas are strict.
   - What's unclear: Whether adding an enum value is preferable to a structured `diagnostics.coverage` object.
   - Recommendation: Add one outcome code and one coverage ledger; update parity tests. Avoid free-text-only signaling.

3. **Snapshot identity semantics**
   - What we know: Published `ProjectionSnapshot.snapshotId` and retrieval `graphSnapshotId` are different identities; active graph may lag publication.
   - What's unclear: Which ID users should see in source details when both exist.
   - Recommendation: Show published snapshot and retrieval snapshot distinctly; label stale when they differ. Do not invent a snapshot for failed/unsearched sets.

4. **Server lexical fallback placement**
   - What we know: Server `rootDir` prevents importing client utility; `ProjectionSnapshot` has raw chunks.
   - What's unclear: Whether to duplicate the BM25 algorithm or extract a shared package/module.
   - Recommendation: Duplicate minimal ranking logic inside `knowledge-server/src` with tests mirroring `tests/utils/bm25.test.ts`; avoid build-config churn.

5. **SDLC hub explicit restriction**
   - What we know: `resolveSetIds` derives project/base sets; `collectWizardEvidence` returns `EMPTY_SCOPE` when no sets `[VERIFIED: src/services/ai/wizardService.ts:160-168]`.
   - What's unclear: Whether hub PL03B/CAB generation should remain project-scoped or use query-only defaults.
   - Recommendation: Keep explicit restriction only for artifact generation where project scope is a real requirement; make SDLC chat default query-only per D-06. Confirm in planning.

6. **Where the canonical notice is persisted/rendered**
   - What we know: Grounded messages persist `grounding`; tool results are runtime events.
   - What's unclear: Whether the notice should be a persisted assistant row, a system notice row, or a transient host banner, especially when local fallback follows.
   - Recommendation: Persist a system-visible notice row or a grounding outcome with null answer, then a separate labeled local fallback row; do not let the model own the text.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Tooling/tests | ✓ | v26.13.0 | Project stack recommends Node 24 LTS; behavior verified on 26.13.0 this session. |
| npm | Install/tests | ✓ | 11.20.0 | — |
| Root `node_modules` / Vitest | Client tests | ✓ | vitest 5.0.2 | — |
| `knowledge-server/node_modules` | Server tests | ✗ | — | Install existing `knowledge-server/package.json` deps; server suites currently fail on `Cannot find package '@fastify/cors'`. |
| Docker CLI | Live Neo4j stack | ✗ | — | Docker Desktop WSL integration not enabled; use unit mocks. |
| Neo4j (`localhost:7474`, `7687`) | Live graph/index verification | ✗ | — | No response on either port; live tests blocked. |
| Knowledge server (`127.0.0.1:3001`) | Live retrieval verification | ✗ | — | Connection refused; use route injection/mocks. |
| `cargo` / `rustc` | Tauri build (not this phase) | ✓ | 1.93.1 / 1.93.1 | Not needed for Phase 28. |
| `ctx7` | Documentation lookup | ✗ | — | Official docs fetched via WebFetch; no install. |

**Missing dependencies with no fallback:**
- Docker/Neo4j/knowledge-server for live readiness verification. Phase validation must be mock-based; live verification is a manual follow-up when the stack is running.

**Missing dependencies with fallback:**
- `knowledge-server/node_modules`: install existing pinned dependencies to run focused server tests. This is an environment action, not a product dependency addition.
- Context7: official Neo4j/Zod/Vitest docs fetched directly.

## Validation Architecture

> `workflow.nyquist_validation` is `true` in `.planning/config.json` `[VERIFIED: .planning/config.json:19]`; this section is required.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.2 root `[VERIFIED: package.json:62]`; server Vitest 5.0.2 `[VERIFIED: knowledge-server/package.json:29]` |
| Root config | `vite.config.ts` — jsdom, `setupFiles: ['./tests/setup.ts']`, excludes `knowledge-server/**` `[VERIFIED: vite.config.ts:65-80]` |
| Server config | `knowledge-server/vitest.config.ts` — node, includes `tests/**/*.test.ts`, `fileParallelism: false` `[VERIFIED: knowledge-server/vitest.config.ts:1-9]` |
| Quick run command (root) | `npx vitest run tests/ai/groundedTurn.test.ts tests/ai/evidencePack.test.ts tests/ai/knowledgeRetrievalTool.test.ts tests/knowledge/retrievalProtocolParity.test.ts` |
| Quick run command (server, after install) | `npm --prefix knowledge-server test -- tests/retrievalProtocol.test.ts tests/federatedRetrieval.test.ts tests/retrievalRoutes.test.ts` |
| Focused source-inspection command | `npx vitest run tests/ai/SourcesPanel.test.tsx tests/ai/CitationChipAndQuickPreview.test.tsx tests/ai/AiChatWidget.test.tsx` |
| Focused Telegram command | `npx vitest run tests/telegram/telegramHeadlessWorker.test.ts` |
| Full suite command | **Not used in this phase.** Do not run the full Vitest suite (project memory: full suite takes about an hour). |

Baseline observed this session:
- Root: `tests/knowledge/retrievalProtocolParity.test.ts`, `tests/ai/knowledgeRetrievalTool.test.ts`, `tests/ai/evidencePack.test.ts` → **3 files, 44 tests passed**.
- Root: `tests/ai/groundedTurn.test.ts`, `tests/ai/sdlcWizardRuntime.test.ts` → **2 files, 58 tests passed**.
- Server: `tests/retrievalProtocol.test.ts` → **29 tests passed**; `tests/federatedRetrieval.test.ts` and `tests/retrievalRoutes.test.ts` failed at import with `Cannot find package '@fastify/cors'` because server dependencies are not installed. This is an environment failure, not a code failure.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SDLC-RET-01 | Query-only request accepted; tool sends no catalog; fresh-device grounded path does not clarify | Unit + route | `npx vitest run tests/ai/knowledgeRetrievalTool.test.ts tests/ai/groundedTurn.test.ts`; `npm --prefix knowledge-server test -- tests/retrievalRoutes.test.ts tests/retrievalProtocol.test.ts` | ✅ existing; ❌ new cases in Wave 0 |
| SDLC-RET-02 | Server enumerates all published sets; returns per-set/snapshot attribution | Unit | `npm --prefix knowledge-server test -- tests/publishedSetDiscovery.test.ts tests/federatedRetrieval.test.ts` | ❌ Wave 0 |
| SDLC-RET-03 | Finite deadline, first-item cap, one-snapshot closure, citation integrity, truthful degraded/unavailable | Unit + component | `npm --prefix knowledge-server test -- tests/federatedRetrieval.test.ts tests/retrievalProtocol.test.ts`; `npx vitest run tests/ai/evidencePack.test.ts` | ✅ partial; ❌ new cases |
| SDLC-RET-04 | Canonical notice rendered identically in Drawer, SDLC, Telegram, and tool paths | Unit + component | `npx vitest run tests/ai/AIChatDrawerGroundedWiring.test.tsx tests/ai/AiChatWidget.test.tsx tests/unit/sdlc/StepChatPanelToolPolicy.test.tsx tests/telegram/telegramHeadlessWorker.test.ts` | ✅ existing harness; ❌ new cases |
| SDLC-RET-05 | Explicit restriction exact; unknown/unpublished does not broaden | Unit + route | `npm --prefix knowledge-server test -- tests/retrievalRoutes.test.ts tests/federatedRetrieval.test.ts`; `npx vitest run tests/ai/knowledgeRetrievalTool.test.ts` | ❌ new cases |

### Sampling Rate
- **Per task commit:** the narrowest focused command for the touched seam (one or two test files).
- **Per wave merge:** union of the focused commands for files touched in that wave; no full suite.
- **Phase gate:** all focused commands listed above green, plus a manual live check only if Docker/Neo4j/knowledge-server are available.

### Wave 0 Gaps
- [ ] `knowledge-server/tests/publishedSetDiscovery.test.ts` — enumeration, deterministic order, empty store, explicit unknown/unpublished, readiness states.
- [ ] `knowledge-server/tests/snapshotLexicalRetrieval.test.ts` — Vietnamese normalization, heading/line/offset provenance, empty corpus, deterministic ranking.
- [ ] Extend `knowledge-server/tests/federatedRetrieval.test.ts` — query-only resolution, per-set coverage ledger, deadline with queued work, first-item char cap, all-failed truthfulness, orphan path rejection.
- [ ] Extend `knowledge-server/tests/retrievalRoutes.test.ts` — `{query, limit}` accepted, explicit `setIds` exact, malformed/unknown sets, no-published outcome, auth/origin preserved.
- [ ] Extend `tests/knowledge/retrievalProtocolParity.test.ts` — new outcome, attribution, request shape.
- [ ] Extend `tests/ai/groundedTurn.test.ts` — empty catalog + server enabled → server request, not clarify; server empty + local docs → notice then local fallback; unreachable distinct.
- [ ] Extend `tests/ai/evidencePack.test.ts` — same doc/range across snapshots yields separate citations; conflict wrappers retain set/snapshot; orphan path dropped.
- [ ] Extend `tests/ai/knowledgeRetrievalTool.test.ts` — no catalog call, query-only payload, attribution/outcome in JSON, explicit restriction exact.
- [ ] Extend `tests/ai/SourcesPanel.test.tsx` / `tests/ai/CitationChipAndQuickPreview.test.tsx` — set/snapshot details; local-absent excerpt rendered.
- [ ] Extend `tests/telegram/telegramHeadlessWorker.test.ts` — grounded empty notice and tool-driven notice.
- [ ] Environment: `npm --prefix knowledge-server install` (existing pinned deps) before server tests; gate behind `checkpoint:human-verify`.
- [ ] Framework install: none.

## Security Domain

> `workflow.security_enforcement` is `true`, `security_asvs_level` is `1` `[VERIFIED: .planning/config.json:41-42]`. ASVS v5 chapter names below are from the official repository `[CITED: github.com/OWASP/ASVS/tree/v5.0.0/5.0/en]`.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Validation and Business Logic | yes | Strict Zod wire schema: query trim 1–4000, limit 10–50, optional setIds UUID array max 50, unknown keys rejected; server enforces same bounds and rejects malformed requests with generic 400. |
| V4 API and Web Service | yes | Existing exact-Origin allowlist, bearer token comparison with `timingSafeEqual`, body limit, generic error envelope; no new endpoint. |
| V6 Authentication | yes (existing) | Bearer token unchanged; do not add token persistence or query-string tokens. |
| V7 Session Management | no | No sessions or cookies introduced. |
| V8 Authorization | no | Single-user app; no roles/resources beyond existing token/origin. |
| V11 Cryptography | no | No new crypto in this phase; do not hand-roll any. |
| V13 Configuration | yes | Server secrets remain env-only; never log token, query, excerpts or set contents; error responses do not echo input. |
| V16 Security Logging and Error Handling | yes | Content-free logs: safe IDs/counts/outcome/reason codes only; no set names, excerpts, URNs, Cypher, or query text. |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt injection in retrieved Markdown or set metadata | Tampering / Elevation | Treat all retrieved text as untrusted data; keep existing delimited evidence policy; never let excerpts become instructions; preserve "data not instructions" framing in synthesis. |
| Unbounded fan-out / DoS by publishing many sets | Denial of Service | Fixed `maxSets`, concurrency, elapsed deadline, per-set modality timeouts, item/character caps, bounded attribution array. |
| Cross-tenant/scope leakage via explicit set restriction | Information Disclosure | Exact-match restriction only; never broaden; per-set unavailable attribution; no local document auto-import. |
| Citation forgery / unattributable evidence | Tampering | Server-side closure per set/snapshot; citation IDs must reference returned chunks; client preserves snapshot identity through packing. |
| Snapshot/staleness misrepresentation | Repudiation / Tampering | Report published vs retrieval snapshot; `STALE_INDEX` when different; never invent snapshots for failed/unsearched sets. |
| Error/log leakage | Information Disclosure | Generic 400/500 envelopes; existing redaction; content-free retrieval diagnostics. |
| Token leakage in browser bundle/logs | Information Disclosure | No new token storage; existing session/config path; never include token in URL or logs. |

## Sources

### Primary (HIGH confidence — code read this session)
- `knowledge-server/src/types/retrievalProtocol.ts:12-19, :242-251, :679-688, :719-758` — outcomes, per-set request/response, strict federated request and attribution wrappers.
- `knowledge-server/src/services/federatedRetrievalService.ts:180-276, :302-445, :448-549` — packing, budget loop, modality aggregation, outcome calculation.
- `knowledge-server/src/services/retrievalService.ts:253-303, :840-946` — lease acquisition, fulltext/vector modality behavior.
- `knowledge-server/src/indexing/snapshotStore.ts:43-47, :144-156, :182-224` — private active map and public API (no enumeration).
- `knowledge-server/src/services/graphBuildService.ts:170-191, :202-207, :243-255, :303-321, :349-383, :440-448` — build/activation coupling.
- `knowledge-server/src/graph/neo4jRepository.ts:712-914, :916-954, :1093-1120, :1131-1198` — generation/index build, ONLINE validation, lease, queries.
- `knowledge-server/src/main.ts:405-499`; `knowledge-server/src/server.ts:148-150` — retrieval service and route registration conditional on Neo4j.
- `knowledge-server/src/indexing/incrementalProjector.ts:13-38` — published chunk provenance.
- `src/services/ai/knowledgeRetrievalTool.ts:45-110`; `src/services/ai/groundedTurn.ts:312-326, :482-525`; `src/services/ai/evidencePack.ts:9-30, :181-250, :276-343, :349-426`; `src/services/ai/groundedAnswerSchemas.ts:138-215, :297-350` — client scope, request, packing and persistence.
- `src/components/notes/QuickPreviewDrawer.tsx:395-407`; `src/components/ai/grounded/SourcesPanel.tsx:242-307`; `src/components/ai/AIChatDrawer.tsx:1419-1467, :1985, :2446` — source inspection.
- `src/services/telegram/telegramHeadlessWorker.ts:521-582, :1246-1361, :1417-1473` — Telegram grounded and tool paths.
- `src/services/wizard/sdlcWizardRuntime.ts:181-192`; `src/services/ai/wizardService.ts:160-168`; `src/services/wizard/hubTechDocs.ts:228-236`; `src/services/wizard/hubCab.ts:194-202` — explicit SDLC restrictions.
- `src/utils/bm25.ts:22-135`; `src/services/search/localGroundedRetrieval.ts:177-202, :228-244` — reusable lexical behavior and local scoping.
- `package.json:5-22, :45, :62`; `knowledge-server/package.json:5-30`; `vite.config.ts:65-80`; `knowledge-server/vitest.config.ts:1-9`; `knowledge-server/tsconfig.json:14-17`; `docker-compose.yml:1-71`; `.planning/config.json:19, :41-42` — environment and validation.
- `.planning/REQUIREMENTS.md:27-33`; `.planning/ROADMAP.md:540-572`; `.planning/PROJECT.md:92-99, :120-121`; `.planning/phases/28-query-only-knowledge-retrieval/28-CONTEXT.md` — scope and carried contracts.
- Runtime probes this session: query-only schema rejection; federated orphan path accepted; cross-snapshot pack collapse; deadline overrun (100 ms budget → 226 ms); first-item char cap bypass; all-failed `DEGRADED` with all modalities `ok`.

### Secondary (MEDIUM confidence — official docs)
- `[CITED: neo4j.com/docs/cypher-manual/current/indexes/semantic-indexes/full-text-indexes/]` — `ONLINE` required; `POPULATING` cannot be queried.
- `[CITED: neo4j.com/docs/cypher-manual/current/indexes/semantic-indexes/vector-indexes/]` — vector index must be `ONLINE`; dimensions must match; index readiness differs from graph availability.
- `[CITED: zod.dev/api]` — `strictObject` rejects unknown keys; defaults make input optional and output guaranteed.
- `[CITED: vitest.dev/guide/cli]` — explicit file filters with `--root`/`--config`.
- `[CITED: github.com/OWASP/ASVS/tree/v5.0.0/5.0/en]` — ASVS v5 chapter names used above.

### Tertiary (LOW confidence)
- Registry latest versions observed via `npm view` on 2026-11-05 (zod 4.6.7, fastify 5.12.8, neo4j-driver 6.3.0, vitest 5.1.0); not a recommendation to upgrade.
- Default budget values and attribution shape are recommendations, not verified requirements.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions read from both package manifests; no new dependency.
- Architecture (current behavior): HIGH — grounded in source reads and runtime probes.
- Architecture (readiness coupling): HIGH for the code path; MEDIUM for the recommendation to add snapshot-lexical fallback.
- Attribution/closure defects: HIGH — reproduced by probes and source reads.
- Empty/unavailable outcome design: MEDIUM — outcome representation is an open choice.
- Pitfalls: HIGH — each maps to a source location or probe.
- Live environment readiness: LOW — no running Neo4j/knowledge-server and no Docker CLI.
- Budget numbers: LOW/ASSUMED — need user/planner confirmation.

**Research date:** 2026-11-05
**Valid until:** 2026-12-05 for stable code facts; re-verify immediately if Phase 28 changes protocol or index-build code. Live readiness claims expire as soon as the local stack changes.
