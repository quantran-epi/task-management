# Phase 19: Grounded Assistant, Provenance Citations & Offline Fallback - Research

**Researched:** 2026-10-11
**Domain:** Evidence-constrained RAG synthesis, provenance UI, graph-path presentation, and offline lexical fallback
**Confidence:** HIGH for existing architecture and safety boundaries; MEDIUM for provider capability and unresolved set selection

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Grounded answer contract
- **D-01:** Every material factual claim must have an inline citation immediately after the claim. Multiple sources supporting the same claim may share one citation group. A sources list only at the end is insufficient.
- **D-02:** A derived claim is allowed only when a valid graph path proves the derivation. Label the claim `INFERRED` and cite every hop. The assistant must not infer a new factual claim by freely combining unrelated text chunks.
- **D-03:** When evidence covers only part of a question, answer the supported portions with citations and separately identify each unsupported portion. Never fill evidence gaps with guesses.
- **D-04:** For `NEEDS_CLARIFICATION`, do not synthesize an answer. Show safe server-resolved candidate chips with canonical name and entity kind; keep long URNs in tooltip/details. Selecting a chip retries the query with that resolved URN.
- **D-05:** Default response layout is answer-first: concise conclusion with inline citations, then expandable graph paths, evidence details, sources, and diagnostics. This progressive disclosure must remain readable in the existing 320–650 px Chat Drawer.
- **D-06:** Respond in the language of the user's query. Preserve technical identifiers and source quotes exactly; translated explanation may accompany but must not replace or alter source quotes.
- **D-07:** For `NO_EVIDENCE` or `UNSUPPORTED`, do not fall back to general model knowledge. Explain the outcome and show one to three safe refinement chips from server suggestions or deterministic rules.
- **D-08:** Route automatically by intent. Knowledge intents use the grounded retrieval pipeline; operational PlannerMate intents retain the current local database/tool flow. Mixed requests may use both, but every knowledge claim remains subject to this grounded contract.
- **D-09:** If intent routing is uncertain, ask the user to choose between concise options such as “Tra cứu tài liệu” and “Thao tác PlannerMate” before retrieval or mutation. Do not guess the route.

### Citations and graph paths
- **D-10:** Clicking a server citation opens `QuickPreviewDrawer` at the exact cited section and source range, scrolls to it, and highlights it. If the current local document differs from the immutable cited snapshot, display a clear snapshot-mismatch warning rather than implying the current text is identical.
- **D-11:** Use compact numbered inline citation chips such as `[1]` and `[2]`. Hover/focus and the expandable Sources section show document, section, line range, evidence classification, and snapshot metadata. Deduplicate the same source reference within one answer.
- **D-12:** Render graph paths as responsive vertical step cards. Every hop displays source node, relation, target node, evidence classification, and its citation(s); do not rely on color alone.
- **D-13:** When multiple non-conflicting paths support the same conclusion, open one primary path and collapse alternatives with hop count and classification summary. If paths conflict, designate no primary path and apply the conflict policy below.

### Conflicts, inference, and degraded retrieval
- **D-14:** Never select a winning conflict branch. Show a warning before the affected answer, present every branch with its citations and known version/environment scope, and ask the user to verify. Do not produce a primary conclusion from conflicted evidence.
- **D-15:** Classify conflict dimension as `Version`, `Environment`, `Behavior`, or `Unknown` only when structured metadata or evidence proves it. The model must not invent the dimension.
- **D-16:** Derived claims show a visible `INFERRED` badge. Graph path cards always show the classification of each hop. A mixed-classification claim uses the weakest supporting classification; direct-claim classification remains visible in citation metadata.
- **D-17:** For `DEGRADED` retrieval with usable evidence, answer from the remaining evidence and show a compact banner naming unavailable, timed-out, stale, or truncated modalities and the resulting coverage limit. Put full modality diagnostics in an expandable section. Degradation indicates incomplete coverage, not that returned evidence is false.

### Offline fallback
- **D-18:** For knowledge intents, automatically run existing local BM25 when the knowledge server is disabled, absent, unreachable, or times out. Do not require the user to resend the question. Show a persistent answer-level banner that local lexical search is active and graph/vector capabilities are unavailable.
- **D-19:** Local grounded synthesis is allowed only from bounded BM25 snippets supplied to the model. It retains claim-level citations but may not create graph/path claims, resolve conflicts, or state facts outside those snippets. If snippet evidence is too weak, show ranked local search results instead of prose synthesis.
- **D-20:** Automatic fallback applies only to disabled/absent server state and transport/network/timeout failures. Authentication, configuration, and invalid-response errors remain visible for repair. Valid server outcomes such as `READY`, `NO_EVIDENCE`, and `UNSUPPORTED` remain authoritative and must not be mixed with unpublished local drafts.
- **D-21:** Distinguish local citations with `[L1]`, `[L2]`, and a visible `Local` badge. Show unpublished or locally changed status when known. Clicking opens the current local document range; never claim immutable server snapshot provenance for local citations.

### Claude's Discretion
- Exact visual styling, accessible colors, icons, animation, and spacing, provided labels remain readable without color and fit the existing Ant Design Chat Drawer.
- Exact deterministic intent-routing rules and confidence threshold, provided low-confidence cases follow D-09 and never trigger an unintended mutation.
- Exact primary-path ordering and limits for collapsed alternatives, provided conflicts never receive a primary path.
- Exact thresholds for “weak” local BM25 evidence and snippet/count budgets, provided D-19's provenance ceiling is enforced.
- Exact refinement-chip wording and ordering, capped at three and constrained by D-07.

### Deferred Ideas (OUT OF SCOPE)
- 30–50 question benchmark, claim/path scoring, index rebuild verification, and credential-isolation hardening — Phase 20.
- Interactive graph canvas and manual graph editing — beyond v1.2.
- Full card-system corpus beyond process `60000006` — beyond pilot validation.
- General model-knowledge fallback when grounded evidence is absent — explicitly excluded by D-07.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ANSWER-01 | Material answer claims cite exact source documents, sections, and ranges. | Structured answer schema, app-owned citation IDs, provenance closure, range-bearing source records, and exact preview navigation. [CITED: .planning/ROADMAP.md#Phase-19] |
| ANSWER-02 | Flow, dependency, and impact answers expose inspectable step-by-step graph paths. | Explicit ordered path protocol extension, deterministic topology validation, and vertical hop cards. [CITED: .planning/ROADMAP.md#Phase-19] |
| ANSWER-03 | Facts retain evidence classification and inferred conclusions are visibly labeled. | Per-hop `evidenceClass`, weakest-class calculation, and `INFERRED` claim/path invariant. [CITED: .planning/ROADMAP.md#Phase-19] |
| ANSWER-04 | Conflicting indexed sources produce warnings by version, environment, or behavior. | Conflict-group preservation, no-winning-branch rendering, and proof-bound conflict dimension. [CITED: .planning/ROADMAP.md#Phase-19] |
| ANSWER-05 | Missing evidence causes explicit abstention, not invention. | Deterministic branching for `NEEDS_CLARIFICATION`, `NO_EVIDENCE`, and `UNSUPPORTED`; no synthesis on these outcomes. [CITED: .planning/ROADMAP.md#Phase-19] |
| ANSWER-06 | Local Markdown remains searchable through BM25 when daemon is unavailable. | Strict fallback allowlist, range-bearing local snippets, strong/weak threshold, and zero-daemon tests. [CITED: .planning/ROADMAP.md#Phase-19] |
| ANSWER-07 | Citation and path interactions open corresponding PlannerMate document context. | Stable document UUID navigation, section/range focus, hash mismatch warning, and keyboard activation. [CITED: .planning/ROADMAP.md#Phase-19] |
</phase_requirements>

> Requirement definitions currently appear in `ROADMAP.md` and supplied phase scope, but `REQUIREMENTS.md` stops at `RETR-05`; planner should include a documentation-sync task for `ANSWER-01` through `ANSWER-07`. [VERIFIED: codebase grep]

## Summary

Build Phase 19 as a native orchestration layer over existing Phase 18 retrieval, current 9router model client, Dexie chat persistence, and local BM25. Do not add a RAG framework, vector store, citation package, graph UI library, or second retrieval implementation. Retrieval decides evidence authority; application code builds IDs, paths, conflict groups, and fallback state; model only selects and phrases supported claims; Zod plus deterministic closure checks decide whether output may render. [VERIFIED: codebase inspection] [CITED: https://zod.dev/json-schema]

Two Phase 18 contract gaps must close before trustworthy synthesis UI: current response flattens entities and edges, losing ordered traversal-path identity, and its citation records omit immutable document title/content hash plus structured conflict scope. A flat edge set cannot prove which connected 1–3 hop route retrieval actually traversed, while snapshot mismatch cannot be computed from `snapshotId` alone. Extend server response additively with explicit ordered paths and source metadata; do not ask model or client heuristics to reconstruct missing provenance. [VERIFIED: `knowledge-server/src/types/retrievalProtocol.ts`, `knowledge-server/src/retrieval/graphTraversal.ts`] [HIGH]

Grounded turns should not use current streamed tool loop. Add a separate non-streaming structured-completion path, validate whole response atomically, and send no tools. Keep current streaming/tool flow untouched for operational intents. If configured endpoint/model cannot honor strict JSON Schema, use JSON text plus Zod and at most two bounded repair attempts; never expose partial or malformed output. Native Claude document citations are not this phase's citation mechanism: retrieval already owns source ranges, and Anthropic citations cannot be combined with structured outputs. [CITED: https://developers.openai.com/api/docs/guides/structured-outputs] [CITED: https://platform.claude.com/docs/en/build-with-claude/citations] [VERIFIED: `src/services/ai/nineRouterClient.ts`]

**Primary recommendation:** First extend retrieval protocol for ordered paths and immutable source identity; then build deterministic route/retrieve/fallback/evidence-pack/validate pipeline; persist one structured `grounding` object per assistant message; finally render progressive provenance UI and exact document navigation. [HIGH]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Intent routing | Browser / Client | Model provider only for unresolved classification | Must run before retrieval or mutation; deterministic rules protect existing operational flow. [CITED: 19-CONTEXT.md D-08/D-09] |
| Hybrid evidence retrieval | API / Backend knowledge daemon | Neo4j / index storage | Phase 18 already pins snapshot and fuses modalities; client must consume rather than duplicate it. [VERIFIED: `knowledge-server/src/services/retrievalService.ts`] |
| Ordered graph-path capture | API / Backend knowledge daemon | Database / Storage | Only traversal execution knows actual path order; flattening then reconstructing is not provenance-safe. [VERIFIED: `knowledge-server/src/retrieval/graphTraversal.ts`] |
| Evidence packing and provenance closure | Browser / Client | Model provider | Client assigns short IDs, applies budgets, blocks unknown citations, and owns display metadata. [CITED: 19-AI-SPEC.md §3-4] |
| Grounded wording | Model provider through existing 9router | Browser / Client validator | Model phrases only supplied evidence; application accepts output only after schema and reference validation. [CITED: https://developers.openai.com/api/docs/guides/structured-outputs] |
| Conflict detection | API / Backend knowledge daemon | Browser / Client presentation | Phase 18 tags conflicts; client preserves all branches and refuses winner selection. [VERIFIED: `knowledge-server/src/retrieval/fusion.ts`] |
| Offline BM25 fallback | Browser / Client | IndexedDB | Existing `rankBM25` reads canonical local Notes without daemon. [VERIFIED: `src/utils/bm25.ts`, `tests/knowledge/offlineIsolation.test.ts`] |
| Chat persistence | Database / Storage (IndexedDB) | Browser / Client | `chatMessages` already persists unindexed objects; structured grounding can be additive without index change. [VERIFIED: `src/db/schema.ts`, `src/db/repositories/chatRepo.ts`] |
| Citation/path UI and preview | Browser / Client | IndexedDB | Stable local document UUID resolves preview; UI owns scrolling, highlighting, and mismatch warning. [VERIFIED: `src/components/notes/QuickPreviewDrawer.tsx`] |
| API keys and tokens | Existing session/native credential boundary | API / Backend if direct provider added later | Static browser bundle must not gain provider secrets; current knowledge token is session-only. [VERIFIED: `src/services/knowledge/knowledgeConfig.tsx`] [CITED: https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/typescript] |

## Project Constraints (from CLAUDE.md)

- PlannerMate core remains 100% local and usable without application server; optional knowledge daemon may receive only manually selected Markdown after client DLP approval. [CITED: CLAUDE.md]
- IndexedDB remains canonical working storage; GitHub Pages repository-subpath/static routing and PWA offline behavior must remain intact. [CITED: CLAUDE.md]
- Use Ant Design; preserve simple, responsive, accessible interaction. [CITED: CLAUDE.md]
- Never expose secrets through Vite environment variables, source, config, bundle, IndexedDB, or backup. [CITED: CLAUDE.md]
- Use Zod at trust boundaries, Dexie transactions for multi-table writes, native `crypto.randomUUID()`, and existing local BM25 rather than a server-state cache library. [CITED: CLAUDE.md]
- Keep Markdown canonical; knowledge-server graph and indexes remain rebuildable projections. [CITED: CLAUDE.md]
- Use targeted tests only during execution. [CITED: project memory `targeted-tests-only.md`]
- No project skills exist under `.claude/skills/` or `.agents/skills/` in this worktree. [VERIFIED: codebase glob]

## Standard Stack

### Core

| Library / Platform | Version | Purpose | Why Standard Here |
|--------------------|---------|---------|-------------------|
| React | 19.3.0 | Existing Chat Drawer and structured answer rendering | Already installed and fixed project UI stack; no new view framework. [VERIFIED: npm registry; `package.json`] |
| Ant Design | 6.6.5 | Cards, Alert, Collapse, Tag, Tooltip, Drawer, responsive UI | Already installed and locked by project; UI-SPEC requires semantic theme tokens and accessible labels. [VERIFIED: npm registry; `19-UI-SPEC.md`] |
| Zod | 4.6.5 | Retrieval DTOs, grounded answer schema, backup validation, JSON Schema conversion | Existing dependency; `z.strictObject`, discriminated unions, `safeParse`, and `z.toJSONSchema` cover contract and provider schema needs. [VERIFIED: npm registry] [CITED: https://zod.dev/json-schema] |
| Dexie | 4.4.6 | Persist chat messages and grounding metadata | Existing `chatMessages` table stores object fields not listed as indexes; no DB version bump needed for additive unindexed property. [VERIFIED: npm registry; `src/db/schema.ts`] |
| Native fetch / AbortController | Browser API | Knowledge retrieval and current 9router-compatible requests | Existing clients already use fetch and `AbortSignal`; no HTTP package needed. [VERIFIED: codebase inspection] [CITED: https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static] |
| Existing Phase 18 retrieval service | In-repo | Snapshot-scoped full-text/vector/graph evidence | Already supplies strict outcomes, modality status, conflicts, and citations; must be extended, not replaced. [VERIFIED: `knowledge-server/src/services/retrievalService.ts`] |
| Existing local BM25 | In-repo | Offline lexical fallback | Already implements Title ×3, Tags ×2, Body ×1 and Vietnamese diacritic normalization. [VERIFIED: `src/utils/bm25.ts`] |
| Vitest + Testing Library | 5.0.2 installed | Contract, orchestration, persistence, and UI tests | Existing root and daemon test infrastructure; target files can run independently. [VERIFIED: `package.json`, `vite.config.ts`] |

### Supporting

| Library / Module | Version | Purpose | When to Use |
|------------------|---------|---------|-------------|
| `knowledgeClient` | In-repo | Authenticated strict daemon boundary | Add `retrieve(setId, request, signal)` and retain `NETWORK_ERROR` / `INVALID_RESPONSE` / `REMOTE_ERROR` taxonomy. [VERIFIED: `src/services/knowledge/knowledgeClient.ts`] |
| `nineRouterClient` | In-repo | Existing OpenAI-compatible model endpoint | Add dedicated non-streaming JSON completion and capability probe; do not feed grounded synthesis through SSE tool parser. [VERIFIED: `src/services/ai/nineRouterClient.ts`] |
| Web Crypto SHA-256 | Browser native | Compare current normalized Markdown with published citation hash | Reuse `normalizeMarkdownForHash` and `computeSha256`; do not add hashing package. [VERIFIED: `src/db/repositories/documentSetRepo.ts`] |
| `CitationChip` / `QuickPreviewDrawer` | In-repo | Accessible citation activation and document preview | Extend existing controls rather than create parallel navigation primitives. [VERIFIED: codebase inspection] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native orchestration | LlamaIndex.TS / LangChain / LangGraph | Adds duplicate retrieval/orchestration abstractions without fixing project-specific path, conflict, snapshot, and offline authority rules. Use native pipeline. [CITED: 19-AI-SPEC.md §2] |
| Existing 9router-compatible endpoint | Direct Claude API | Direct API would require official `@anthropic-ai/sdk`, server-side credential isolation, Claude-specific output handling, and a new provider boundary. Not needed for locked architecture. [CITED: https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/typescript] |
| App-owned citation IDs | Claude native document citations | Native citations cannot combine with structured outputs and would duplicate Phase 18 exact retrieval provenance. [CITED: https://platform.claude.com/docs/en/build-with-claude/citations] |
| Structured atomic completion | Render streamed JSON fragments | Partial JSON cannot satisfy provenance validation and may expose unsupported claims before closure checks. [CITED: https://developers.openai.com/api/docs/guides/structured-outputs] |
| Existing BM25 | New local search package | Current implementation already satisfies offline lexical and Vietnamese normalization needs; new package adds no required capability. [VERIFIED: `src/utils/bm25.ts`] |

**Installation:** No Phase 19 runtime package installation recommended. [HIGH]

```bash
# Reproduce existing lockfiles only
npm ci
npm --prefix knowledge-server ci
```

### Package Legitimacy Audit

No new external package is recommended, so Package Legitimacy Gate does not block this phase. Existing required packages were confirmed in project manifests and official documentation. `slopcheck` was unavailable after best-effort install; this does not create a planner checkpoint because no install task is proposed. [VERIFIED: environment audit]

| Package | Registry | Current / Installed | Official confirmation | postinstall | Disposition |
|---------|----------|---------------------|-----------------------|-------------|-------------|
| `zod` | npm | 4.6.5 / 4.6.5 | Official Zod docs [CITED: https://zod.dev/json-schema] | none reported | Existing, approved |
| `antd` | npm | 6.6.5 / 6.6.5 | Project-locked UI stack [CITED: CLAUDE.md] | none reported | Existing, approved |
| `dexie` | npm | 4.4.6 / 4.4.6 | Project-locked persistence stack [CITED: CLAUDE.md] | none reported | Existing, approved |
| `vitest` | npm | 5.0.3 current / 5.0.2 installed | Existing test stack; no upgrade needed [VERIFIED: npm registry; `package.json`] | none reported | Keep lockfile version |
| `fastify` | npm | 5.12.5 / 5.12.5 | Existing daemon stack [VERIFIED: npm registry; `knowledge-server/package.json`] | none reported | Existing, approved |

**Packages removed due to slopcheck [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none; slopcheck unavailable, but no package installation occurs.

## Architecture Patterns

### System Architecture Diagram

```text
User submits Chat Drawer turn
          |
          v
Deterministic intent router
  | knowledge      | operational        | uncertain
  v                v                    v
Resolve one set    Existing tool loop   Route-choice chips
  |
  v
Authenticated POST /sets/:setId/retrieve
  | valid outcome                    | disabled/network/timeout
  v                                  v
Phase 18 evidence envelope           IndexedDB Notes -> local BM25
  | READY/DEGRADED                   | strong snippets | weak snippets/model down
  |                                  v                 v
  +------> Evidence-pack builder <----+             Ranked local results
              |
              | removes conflicts from conclusion input
              | assigns S#/L#/P# IDs
              | validates ordered paths + citation closure
              v
       Structured model completion (no tools)
              |
              v
   Zod parse + deterministic provenance closure
      | valid                    | refusal/truncated/invalid
      v                          v
Persist ChatMessage.grounding    <=2 bounded repairs -> safe error
      |
      v
GroundedAnswerCard
  | inline citations | graph paths | conflicts | sources | diagnostics
  v                  v
QuickPreviewDrawer at exact local document range
  |
  +-- current hash differs from cited published hash -> mismatch warning
```

This preserves three service boundaries: canonical current Markdown in client IndexedDB, immutable published retrieval authority in daemon snapshot, and model as untrusted wording service. [CITED: 19-CONTEXT.md D-10/D-18-D-21] [VERIFIED: codebase inspection]

### Recommended Project Structure

```text
knowledge-server/src/
├── types/retrievalProtocol.ts          # add SourceRef and explicit OrderedGraphPath DTOs
├── retrieval/graphTraversal.ts         # preserve returned path sequence, not only flat sets
├── retrieval/fusion.ts                 # keep citation/conflict closure when cutoff applies
└── services/retrievalService.ts        # include paths/source metadata in response

src/
├── services/knowledge/
│   ├── retrievalProtocol.ts            # browser-safe strict mirror of server envelope
│   └── knowledgeClient.ts              # add retrieve()
├── services/ai/
│   ├── groundedAnswerSchemas.ts        # persisted answer + model output schemas
│   ├── groundedTurn.ts                 # route/retrieve/fallback/outcome state machine
│   ├── evidencePack.ts                 # budgets, IDs, path/conflict/citation closure
│   ├── groundedSynthesis.ts            # no-tool completion + bounded repairs
│   ├── intentRouter.ts                 # deterministic-first routing
│   └── nineRouterClient.ts             # non-streaming JSON completion
├── services/search/
│   └── localGroundedRetrieval.ts       # BM25 ranges + strength decision
├── components/ai/grounded/
│   ├── GroundedAnswerCard.tsx
│   ├── ClaimBlock.tsx
│   ├── GraphPathCard.tsx
│   ├── SourcesPanel.tsx
│   ├── CandidateChipList.tsx
│   └── DiagnosticsPanel.tsx
├── components/ai/
│   ├── AIChatDrawer.tsx                # thin route selection and turn ownership
│   ├── ChatMessageBubble.tsx           # structured-vs-operational branch
│   └── CitationChip.tsx                # extend existing control
└── components/notes/QuickPreviewDrawer.tsx
```

Keep orchestration logic out of `AIChatDrawer.tsx`; file already owns a large operational tool loop. Extract one `runGroundedTurn` service and leave component responsible for state, persistence, and callbacks. [VERIFIED: `src/components/ai/AIChatDrawer.tsx`] [HIGH]

### Component Responsibilities and Exact Extension Points

| File | Change | Why |
|------|--------|-----|
| `knowledge-server/src/types/retrievalProtocol.ts` | Add ordered `paths[]`, source content hash/title, and proof-bearing conflict scope fields. | Current flat DTO cannot satisfy path fidelity or mismatch metadata. [VERIFIED: codebase inspection] |
| `knowledge-server/src/retrieval/graphTraversal.ts` | Return each actual simple path as ordered edges/nodes before dedup flattening. | Path proof belongs where Cypher path still exists. [VERIFIED: codebase inspection] |
| `knowledge-server/src/graph/neo4jRepository.ts` | Map path records and source metadata. | Current gateway returns flattened entities/edges. [VERIFIED: codebase inspection] |
| `knowledge-server/src/services/retrievalService.ts` | Preserve paths through fusion/cutoff and include closure diagnostics. | Answer layer must consume authoritative path envelope. [VERIFIED: codebase inspection] |
| `knowledge-server/tests/retrievalProtocol.test.ts`, `graphTraversal.test.ts`, `retrievalService.test.ts` | Prove path order/direction/hop limit and source metadata. | Server contract is first wave gate. [VERIFIED: existing tests] |
| `src/services/knowledge/retrievalProtocol.ts` | Mirror strict response schema. | Browser cannot import Node server source safely; boundary requires runtime validation. [VERIFIED: existing client pattern] |
| `src/services/knowledge/knowledgeClient.ts` | Add POST retrieval with JSON body and signal; preserve error taxonomy. | Enables exact D-20 fallback decisions. [VERIFIED: existing client pattern] |
| `src/services/search/localGroundedRetrieval.ts` | Add `extractRelevantRange` returning line/offset/heading/hash/state. | Existing snippet helper returns text only. [VERIFIED: `src/utils/bm25.ts`] |
| `src/types/models.ts`, `src/db/repositories/chatRepo.ts`, `src/validation/backupSchemas.ts` | Add versioned `grounding` metadata and backup validation. | Interactive provenance must survive reload/backup. [VERIFIED: current persistence flow] |
| `src/components/ai/AIChatDrawer.tsx` | Route before API-key gate and before current tool loop; invoke extracted grounded flow. | Offline ranked search and authoritative no-answer states must work even if model key is absent. [VERIFIED: current API-key check at line 497 precedes all model work] |
| `src/components/ai/ChatMessageBubble.tsx` | Render structured card when `message.grounding` exists. | Do not encode trusted provenance only in Markdown. [CITED: 19-CONTEXT.md code insights] |
| `src/components/notes/QuickPreviewDrawer.tsx` | Accept range/hash metadata, line-aware focus/highlight, mismatch alert. | Current drawer renders whole Markdown and has no range mapping. [VERIFIED: codebase inspection] |
| `tests/ai/*`, `tests/knowledge/*` | Add targeted contract, fallback, closure, persistence, and interaction suites. | Existing Vitest setup already covers jsdom and fake IndexedDB. [VERIFIED: `vite.config.ts`] |

### Pattern 1: Additive Retrieval Contract Before UI

**What:** Server returns both ranked flat `items[]` and proof objects referencing those items. Keep Phase 18 fields stable; add ordered paths instead of deriving path sequence from ranking order. [HIGH]

**When to use:** Every graph-backed answer and every inferred claim.

```typescript
// Source: codebase-derived extension of knowledge-server/src/types/retrievalProtocol.ts
const OrderedPathSchema = z.strictObject({
  pathId: z.string().min(1),
  snapshotId: z.string().min(1),
  nodeUrns: z.array(UrnSchema).min(2).max(4),
  edgeFactKeys: z.array(FactKeySchema).min(1).max(3),
  classification: EvidenceClassificationSchema,
  hasConflict: z.boolean(),
});

// Closure invariant checked server and client:
// nodeUrns.length === edgeFactKeys.length + 1
```

Do not infer path from `items[]` adjacency after fusion. RRF ordering is evidence ranking, not traversal sequence. [VERIFIED: `knowledge-server/src/retrieval/fusion.ts`] [HIGH]

### Pattern 2: Application-Owned Evidence IDs

**What:** Convert raw retrieval records into bounded immutable `S#`, `L#`, and `P#` entries. Model sees only short IDs and evidence text; it never emits filenames, line numbers, URNs, hashes, or graph edges as authority. [CITED: 19-AI-SPEC.md §3-4]

**When to use:** Before every grounded synthesis call.

```typescript
// Source: 19-AI-SPEC.md, adapted to current contracts
interface EvidencePack {
  authority: 'server' | 'local';
  citations: Readonly<Record<`S${number}` | `L${number}`, SourceRecord>>;
  paths: Readonly<Record<`P${number}`, ValidatedPath>>;
  conflicts: readonly ConflictGroup[];
  promptEvidence: readonly { id: string; text: string }[];
  contextTruncated: boolean;
}
```

Packing order: complete conflict branches, exact identifier hits, complete path support, then remaining RRF-ranked chunks. Drop whole evidence units when over budget; never truncate text while retaining original exact range. [CITED: 19-AI-SPEC.md §4b]

### Pattern 3: Outcome-First State Machine

**What:** Branch before model synthesis. Only `READY`, usable `DEGRADED`, and strong local snippets may call synthesis. [CITED: 19-CONTEXT.md D-04/D-07/D-17-D-20]

```typescript
// Source: 19-CONTEXT.md and 19-AI-SPEC.md
switch (retrieval.outcome) {
  case 'NEEDS_CLARIFICATION':
    return clarificationCard(retrieval.candidates);
  case 'NO_EVIDENCE':
  case 'UNSUPPORTED':
    return abstentionCard(retrieval.outcome, retrieval.suggestedRefinements);
  case 'READY':
  case 'DEGRADED':
    return synthesizeValidated(buildEvidencePack(retrieval));
}
```

Valid daemon semantic outcomes never trigger local fallback. Only disabled/absent daemon and typed transport/timeout failures do. [CITED: 19-CONTEXT.md D-20]

### Pattern 4: Atomic Structured Completion

**What:** Add non-streaming completion for grounded answer JSON, then validate syntax, schema, references, topology, authority, conflict exclusion, and snapshot consistency before persistence. [CITED: https://developers.openai.com/api/docs/guides/structured-outputs] [CITED: https://zod.dev/json-schema]

**When to use:** Final answer synthesis only; operational chat retains current stream.

```typescript
// Source: 19-AI-SPEC.md §4
const GroundedClaimSchema = z.strictObject({
  id: z.string().regex(/^C[1-9][0-9]*$/),
  text: z.string().min(1).max(800),
  classification: z.enum(['DIRECT', 'INFERRED']),
  citationIds: z.array(z.string().regex(/^(S|L)[1-9][0-9]*$/)).min(1).max(8),
  pathId: z.string().regex(/^P[1-9][0-9]*$/).nullable(),
});
```

Strict provider output shape does not prove citation correctness. Always run application closure after Zod parsing. Provider refusal, content filtering, empty output, and token truncation are non-answers. [CITED: https://developers.openai.com/api/docs/guides/structured-outputs]

### Pattern 5: Exact Local Range Extraction

**What:** Preserve source line indices while scoring. Return heading, 1-based line range, offsets, raw snippet, normalized content hash, BM25 score, and matched terms. [VERIFIED: existing `extractRelevantSnippet` lacks range]

**When to use:** Every local `[L#]` citation and weak-evidence decision.

```typescript
// Source: codebase-derived extension of src/utils/bm25.ts
interface LocalEvidenceRange {
  documentId: string;
  sectionAnchor: string;
  lineStart: number;
  lineEnd: number;
  startOffset: number;
  endOffset: number;
  rawSnippet: string;
  contentHash: string;
  score: number;
  matchedTerms: readonly string[];
}
```

Recommended initial strong threshold: at least two distinct query terms matched, or exact normalized identifier/title match, and positive BM25 score; otherwise render up to five ranked results without prose. This threshold is `[ASSUMED]` because project has no labeled Phase 19 local-answer fixtures yet.

### Pattern 6: Persist Structured Grounding, Not Reparsed Markdown

**What:** Add optional schema-versioned `grounding` property to `ChatMessage` and `SaveMessageInput`; validate it in backup schema. Existing Dexie index string need not change because field is unindexed. [VERIFIED: `src/db/schema.ts`, `src/db/repositories/chatRepo.ts`] [CITED: https://dexie.org/docs/Version/Version.stores()]

**When to use:** Every knowledge response, including no-answer/error/local-results cards.

Persist source references, selected raw snippets required for historical citation inspection, snapshot/content hashes, paths, conflicts, diagnostics, and prompt/model/schema versions. Do not persist API keys, headers, system prompts, unrestricted request/response bodies, or retrieved instructions beyond bounded cited snippets. [CITED: 19-AI-SPEC.md §4/§7]

### Pattern 7: Turn Ownership and Cancellation

**What:** One `AbortController` per submitted turn. Abort prior turn on drawer close, scope change, retry, or stop. Check turn ID and `signal.aborted` before saving. Distinguish timeout (`TimeoutError`) from manual abort (`AbortError`); manual abort must not activate local fallback. [CITED: https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static]

**When to use:** Retrieval, local fallback transition, and synthesis.

### Anti-Patterns to Avoid

- **Model-built citations:** Never trust model-emitted document names, ranges, hashes, path edges, or conflict scope; resolve app-owned IDs only. [CITED: 19-AI-SPEC.md §3]
- **Path reconstruction from flat fusion:** Ranked edge order is not path order; preserve path during traversal. [VERIFIED: codebase inspection]
- **Fallback on `NO_EVIDENCE`:** This mixes unpublished local drafts with authoritative published result. [CITED: 19-CONTEXT.md D-20]
- **Grounded synthesis with tools:** Retrieved Markdown may contain prompt injection; zero tools removes authority escalation. [CITED: https://genai.owasp.org/llmrisk/llm01-prompt-injection/]
- **Streaming trusted claims before validation:** A later parse failure cannot retract already displayed unsupported text. [CITED: https://developers.openai.com/api/docs/guides/structured-outputs]
- **API key check before intent/fallback:** Current ordering blocks local result-only fallback when 9router is absent; route and retrieve first. [VERIFIED: `AIChatDrawer.tsx`]
- **Hashing current text with different normalization:** Reuse Phase 16 CRLF/CR-to-LF-only policy or mismatch warnings become false. [VERIFIED: `normalizeMarkdownForHash`]
- **Hard-coded UI colors:** Use Ant Design theme tokens and visible labels; UI-SPEC requires light/dark and non-color status cues. [CITED: 19-UI-SPEC.md]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Hybrid retrieval | New browser RAG/index stack | Phase 18 `/retrieve` endpoint | Existing snapshot pinning, modality status, conflict tags, and citation closure. [VERIFIED: Phase 18 implementation] |
| Runtime validation | Type assertions/manual property checks | Existing Zod 4 | Strict boundary schemas and JSON Schema conversion already installed. [CITED: https://zod.dev/json-schema] |
| Local search | New tokenizer/search dependency | Existing `rankBM25` plus range-bearing sibling | Existing field weights and Vietnamese normalization satisfy fallback base. [VERIFIED: `src/utils/bm25.ts`] |
| Cryptographic hash | JS SHA-256 implementation | Native Web Crypto and existing `computeSha256` | Existing normalization and browser/Node fallback prevent policy drift. [VERIFIED: codebase inspection] |
| Citation rendering | Markdown regex replacing `[1]` | Structured `ClaimBlock` plus extended `CitationChip` | Regex cannot enforce reference membership or keyboard metadata. [VERIFIED: current component pattern] |
| Graph visualization | Canvas/D3 graph | Vertical Ant Design path cards | Interactive graph canvas is deferred; path is max three hops. [CITED: 19-CONTEXT.md Deferred Ideas] |
| Provider SDK for existing route | New OpenAI/Anthropic SDK | Existing 9router-compatible client | Current endpoint and credential flow already exist; add one non-streaming method. [VERIFIED: `nineRouterClient.ts`] |
| Retry framework | Generic resilience package | Two bounded validation repairs plus typed request timeout | Requirements need narrow deterministic policy, not general retry machinery. [CITED: 19-AI-SPEC.md §4b] |
| Hosted tracing/evals | Langfuse/Phoenix/Promptfoo runtime | Existing local `aiDebugService` plus Vitest fixtures | Phase 20 owns broad benchmark; Phase 19 must avoid evidence export. [CITED: 19-AI-SPEC.md §5/§7] |

**Key insight:** Hard part is preserving authority through transformations, not generating prose. Keep model role narrow and deterministic structures authoritative. [HIGH]

## Critical Contract Gaps Found

### Gap 1: Ordered paths are absent

`GraphTraversalResult` returns only `entities`, `edges`, and `truncated`; `runBoundedGraphTraversal` deduplicates those records; final retrieval response exposes flat `items[]`. Actual path grouping and order disappear before Phase 19. Client-side path search could create routes not actually returned by traversal and cannot distinguish alternatives. [VERIFIED: `knowledge-server/src/retrieval/contracts.ts`, `graphTraversal.ts`, `retrievalProtocol.ts`] [HIGH]

**Plan requirement:** Wave 1 must add authoritative ordered path records and tests before any inferred answer or `GraphPathCard` work.

### Gap 2: Snapshot mismatch lacks source hash

Chunk citations contain document UUID, anchor, line range, raw snippet, and snapshot ID, but no cited document content hash. Client has `PublishedDocumentMetadata.publishedContentHash`, yet retrieval does not identify set-specific hash in each source record and historical message must remain self-contained. [VERIFIED: `retrievalProtocol.ts`, `src/types/models.ts`] [HIGH]

**Plan requirement:** Include cited normalized document hash in source record or provide immutable lookup by snapshot/document. Persist hash with grounded message. Compare using existing normalization/hash function.

### Gap 3: Conflict dimension proof is absent

Current retrieval conflict item has `conflictGroupId` and `hasConflict`; `EdgeItem` omits relation qualifiers and evidence environment/version fields. Therefore UI can truthfully label most conflicts only `Unknown` unless protocol adds structured proof. [VERIFIED: `retrievalProtocol.ts`, `fusion.ts`] [HIGH]

**Plan requirement:** Either enrich conflict branch metadata from Phase 17 evidence or render `Unknown`. Never let model infer `Version`, `Environment`, or `Behavior` from prose alone.

### Gap 4: Source title is absent from retrieval chunks

Server chunk response exposes `sourceDocumentId` but no document title. Current client can resolve current local title by UUID, but that title may differ from cited snapshot. [VERIFIED: `retrievalProtocol.ts`] [HIGH]

**Plan requirement:** Add immutable `sourceDocumentTitle` to source metadata and persist it; current local title may be secondary display only.

### Gap 5: Knowledge set selection is undefined

Retrieval route requires `setId`; Chat Drawer has no active knowledge-set selector or persisted active-set setting in inspected code/contracts. Multiple document sets are allowed. [VERIFIED: endpoint path, `DocumentSet` model, phase context] [HIGH]

**Plan requirement:** Resolve before implementation. Recommended minimal behavior: add explicit Chat Drawer knowledge-set selection persisted as non-secret UI setting, auto-select only when exactly one set exists, and ask when zero/multiple eligible sets. Do not query every set and merge snapshots in Phase 19. This recommendation is `[ASSUMED]` because CONTEXT.md does not lock corpus-selection UX.

### Gap 6: Existing QuickPreview cannot highlight source lines

`QuickPreviewDrawer` renders sanitized Markdown HTML as one block and has no mapping from source lines to rendered DOM. A section anchor alone cannot reliably identify duplicate text occurrences. [VERIFIED: `QuickPreviewDrawer.tsx`] [HIGH]

**Plan requirement:** Add a source-range panel with line-numbered exact raw Markdown around cited lines and focus/highlight that panel; keep rendered document below/alongside. This meets exact range without attempting brittle HTML-to-source mapping. If UI insists on highlighting rendered HTML itself, add source-position metadata during Markdown rendering—a larger change not recommended.

## Common Pitfalls

### Pitfall 1: Treating structured output as grounding proof
**What goes wrong:** JSON validates but claim cites unrelated `S1` or references a disconnected `P1`.
**Why it happens:** JSON Schema validates shape, not semantic membership/topology.
**How to avoid:** Run deterministic closure against evidence pack; reject unknown IDs, incomplete hop citations, conflict claims, authority mismatch, and invalid direct/inferred pairings. [CITED: https://developers.openai.com/api/docs/guides/structured-outputs] [HIGH]
**Warning signs:** Renderer accepts model-provided filenames/ranges or no `validateReferences` function exists.

### Pitfall 2: Losing path provenance at RRF cutoff
**What goes wrong:** Edge survives but one supporting chunk/path hop is cut, then UI shows incomplete proof.
**Why it happens:** Fusion ranks items individually and citation closure currently receives selected items as its default candidate pool in service call.
**How to avoid:** Preserve full pre-cutoff candidate pool and explicit paths; include all supporting chunks for included path or omit path and mark unsupported. [VERIFIED: `retrievalService.ts` passes no separate `candidatePool` to `tagRetrievalConflicts`] [HIGH]
**Warning signs:** `supportingChunkIds` refer to absent items or path card has hop with no source.

### Pitfall 3: Silent fallback on authentication/configuration errors
**What goes wrong:** Bad token appears as harmless offline mode, masking repair need and changing evidence authority.
**Why it happens:** All fetch errors are collapsed into one catch.
**How to avoid:** Preserve typed client error and HTTP status: fallback only disabled/absent, `NETWORK_ERROR`, or explicit timeout; no fallback for `INVALID_RESPONSE`, `REMOTE_ERROR`, manual abort, or valid outcomes. [CITED: 19-CONTEXT.md D-20] [HIGH]
**Warning signs:** `catch { localSearch() }` around retrieval.

### Pitfall 4: Existing client conflates network failure and timeout
**What goes wrong:** Abort reason becomes generic `NETWORK_ERROR`; manual stop may accidentally trigger BM25.
**Why it happens:** `knowledgeClient.request` catches every fetch rejection and maps it to `NETWORK_ERROR`.
**How to avoid:** Add `TIMEOUT` and `ABORTED` codes or preserve `signal.reason`; map `TimeoutError` separately from `AbortError`. [VERIFIED: `knowledgeClient.ts`] [CITED: MDN AbortSignal.timeout]
**Warning signs:** Fallback after user presses Stop.

### Pitfall 5: Current API-key gate blocks offline behavior
**What goes wrong:** Knowledge turn fails before BM25 because no 9router key exists.
**Why it happens:** `AIChatDrawer` checks key immediately after saving user message.
**How to avoid:** Route first; retrieval/fallback and result-only states work without model. Require model key only before synthesis. [VERIFIED: `AIChatDrawer.tsx`] [HIGH]
**Warning signs:** Local search tests need fake API key.

### Pitfall 6: Prompt injection from Markdown
**What goes wrong:** Source text instructs model to ignore evidence, call tools, or mutate PlannerMate.
**Why it happens:** Retrieved text is treated as instructions or grounded flow reuses operational tool payload.
**How to avoid:** JSON-encode evidence in user payload, explicitly label it untrusted data, send zero tools, validate output, and retain human confirmation for later mixed-intent mutation. [CITED: https://genai.owasp.org/llmrisk/llm01-prompt-injection/] [HIGH]
**Warning signs:** Evidence inserted into system prompt or grounded completion receives `tools`.

### Pitfall 7: History becomes evidence
**What goes wrong:** Assistant repeats a prior unsupported claim and cites current sources as veneer.
**Why it happens:** Full persisted chat history is mixed into evidence prompt.
**How to avoid:** Send at most three bounded turns only for reference resolution; label history non-evidence and require all factual claims to cite current evidence IDs. [CITED: Phase 18 D-05; 19-AI-SPEC.md §4b]
**Warning signs:** Citation-free claim copied from prior assistant message.

### Pitfall 8: Snapshot mismatch uses timestamp
**What goes wrong:** Harmless timestamp change warns, or content edit with preserved timestamp does not warn.
**Why it happens:** Comparing `updatedAt` instead of normalized content hash.
**How to avoid:** Compare SHA-256 over Phase 16 newline normalization. [VERIFIED: `documentSetRepo.ts`] [HIGH]
**Warning signs:** mismatch code never calls `computeSha256(normalizeMarkdownForHash(body))`.

### Pitfall 9: Backup silently strips grounding
**What goes wrong:** IndexedDB keeps metadata, but export/import schema removes it, so restored citations become plain text.
**Why it happens:** `BackupChatMessageRecordSchema` currently enumerates fields and omits grounding.
**How to avoid:** Extend model, save input, backup schema, export/restore tests together. [VERIFIED: `src/validation/backupSchemas.ts`] [HIGH]
**Warning signs:** reload works but restored backup loses citation controls.

### Pitfall 10: Native provider assumptions
**What goes wrong:** 9router/model rejects `response_format`, sampling fields, or strict schema and raw JSON leaks to UI.
**Why it happens:** OpenAI-compatible routing does not guarantee capability parity for every model.
**How to avoid:** Capability probe keyed by endpoint host + model; strict path when supported; fallback JSON parse/repair otherwise. Do not hard-code direct Claude request parameters into 9router payload. [CITED: 19-AI-SPEC.md §3] [MEDIUM]
**Warning signs:** Capability inferred only from model name.

### Pitfall 11: Using native Claude citations with structured output
**What goes wrong:** Direct Anthropic request returns HTTP 400.
**Why it happens:** Citations interleave citation blocks with text while structured output requires one JSON grammar.
**How to avoid:** Phase 19 uses retrieval-owned `S#` provenance, not Claude document citation blocks. If direct Claude API is introduced later, use official SDK and keep citations disabled for structured synthesis. [CITED: https://platform.claude.com/docs/en/build-with-claude/citations]
**Warning signs:** Same request includes citation-enabled documents and `output_config.format`.

## Code Examples

Verified or contract-derived patterns:

### Strict browser retrieval boundary

```typescript
// Source pattern: src/services/knowledge/knowledgeClient.ts
async function retrieve(
  setId: string,
  body: RetrievalRequest,
  signal?: AbortSignal,
): Promise<RetrievalResponse> {
  return request(
    `/sets/${encodeURIComponent(setId)}/retrieve`,
    RetrievalResponseSchema,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(RetrievalRequestSchema.parse(body)),
      ...(signal ? { signal } : {}),
    },
  );
}
```

### Fallback allowlist

```typescript
// Source: 19-CONTEXT.md D-18/D-20 + MDN abort semantics
function mayUseLocalFallback(
  configEnabled: boolean,
  error: unknown,
): boolean {
  if (!configEnabled) return true;
  return error instanceof KnowledgeClientError &&
    (error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT');
}
```

Manual abort should have distinct `ABORTED` code and return no fallback. [CITED: https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static]

### Provenance closure

```typescript
// Source: 19-AI-SPEC.md §4, project-specific deterministic check
function validateGroundedReferences(answer: GroundedAnswer, pack: EvidencePack): boolean {
  return answer.claims.every((claim) => {
    if (!claim.citationIds.every((id) => id in pack.citations)) return false;
    if (claim.classification === 'INFERRED') {
      if (!claim.pathId || !(claim.pathId in pack.paths)) return false;
      const path = pack.paths[claim.pathId];
      if (path.hasConflict || path.hops.length < 1 || path.hops.length > 3) return false;
      return path.hops.every((hop) => hop.citationIds.every((id) => claim.citationIds.includes(id)));
    }
    return claim.pathId === null;
  });
}
```

### Direct Claude API guard, only if architecture changes later

```typescript
// Source: https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const stream = client.messages.stream({
  model: 'claude-opus-4-8',
  max_tokens: 1800,
  thinking: { type: 'adaptive' },
  messages,
});
const final = await stream.finalMessage();
```

This is not recommended for current Phase 19. If selected later, run outside browser, preserve complete content blocks in history, handle typed `Anthropic.APIError`, and branch on refusal/max-token/pause stop reasons. Do not add `budget_tokens` or sampling parameters to Opus 4.8 adaptive-thinking requests per supplied current API constraints. [CITED: user-supplied current Claude API constraints] [CITED: https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/typescript]

## State of the Art

| Old / Existing Approach | Required Phase 19 Approach | Impact |
|-------------------------|----------------------------|--------|
| Free-form streamed Markdown assistant text | Atomically validated structured grounded answer | Trusted claims appear only after schema and provenance closure. [CITED: OpenAI structured output docs] |
| Citation label contains document title | Compact `[N]` / `[LN]` backed by structured source metadata | Dedupe, keyboard access, reload persistence, and exact navigation. [CITED: 19-CONTEXT.md D-11/D-21] |
| Flat ranked graph items | Explicit ordered 1–3 hop proof paths plus flat evidence | Prevents model/client path invention. [VERIFIED: contract gap] |
| Generic catch and error message | Typed availability/auth/config/invalid/abort taxonomy | Local fallback activates only under allowed states. [CITED: 19-CONTEXT.md D-20] |
| Text-only chat persistence | Versioned structured grounding alongside content | Historical citations/paths remain interactive. [VERIFIED: persistence gap] |
| Local snippet text only | Range-bearing local evidence with hash and strength decision | `[L#]` can open exact current source and weak evidence can abstain. [VERIFIED: BM25 gap] |
| Model sees tools during all chat | Grounded synthesis receives no tools | Retrieved instructions cannot trigger actions. [CITED: OWASP prompt injection guidance] |

**Deprecated/outdated for this phase:**
- Sources list without inline claim citations: insufficient under D-01. [CITED: 19-CONTEXT.md]
- Raw Markdown citation markers parsed after generation: insufficient for provenance closure. [CITED: 19-AI-SPEC.md]
- Client-generated graph routes from unordered edges: insufficient for D-02/D-12. [VERIFIED: contract analysis]
- General model answer after no evidence: explicitly forbidden. [CITED: 19-CONTEXT.md D-07]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Strong local synthesis threshold starts at exact title/identifier match or at least two distinct matched query terms plus positive BM25 score. | Architecture Pattern 5 | Too strict yields result lists; too loose yields weakly grounded prose. Calibrate with Phase 19 fixtures. |
| A2 | Add explicit active knowledge-set selection, auto-selecting only a sole set. | Critical Contract Gap 5 | UX may conflict with intended corpus selection; retrieval cannot proceed safely without resolution. |
| A3 | One source-range raw Markdown panel inside QuickPreview is acceptable fulfillment of exact highlight, instead of mapping lines into rendered HTML. | Critical Contract Gap 6 | UI owner may require rendered-text highlighting, expanding Markdown renderer work. |
| A4 | Existing 9router endpoint can provide either strict JSON Schema or ordinary JSON text suitable for bounded repair. | Standard Stack / Pitfall 10 | Unsupported endpoints must fall back to ranked evidence/result cards, not raw prose. |

## Open Questions

1. **Which document set does a global knowledge question query?**
   - What we know: daemon endpoint requires one `setId`; app supports multiple explicit document sets. [VERIFIED: endpoint/model]
   - What's unclear: no active-set selection or deterministic global rule is locked.
   - Recommendation: add a visible selected-set control; auto-select only when exactly one eligible set exists; otherwise ask. `[ASSUMED]`

2. **Must exact citation navigation highlight rendered Markdown or exact raw source lines?**
   - What we know: current renderer has no source-position DOM mapping, while retrieval lines refer to immutable raw Markdown. [VERIFIED: codebase]
   - What's unclear: UI-SPEC says range scroll/highlight but not representation.
   - Recommendation: highlight line-numbered raw source excerpt and focus it; preserve normal rendered document below. `[ASSUMED]`

3. **What should server `READY` do when model endpoint/API key is unavailable?**
   - What we know: evidence itself is valid; current API-key check would block before retrieval; local weak mode already permits ranked results. [VERIFIED: codebase/context]
   - What's unclear: locked decisions do not specify server-evidence-only rendering.
   - Recommendation: show ranked server evidence with citations and no prose rather than lose access or use general knowledge. Needs user confirmation. `[ASSUMED]`

4. **Where does conflict version/environment metadata come from?**
   - What we know: Phase 17 evidence has optional `environment` and qualifiers; Phase 18 response omits them. [VERIFIED: graph and retrieval protocols]
   - What's unclear: version metadata may not exist for every source.
   - Recommendation: enrich only fields with structured provenance; default to `Unknown` for all others.

5. **Provider capability profile scope?**
   - What we know: configured endpoint/model is user-selectable and OpenAI-compatible behavior varies. [VERIFIED: app settings; 19-AI-SPEC]
   - What's unclear: no existing storage contract for strict-output capability.
   - Recommendation: cache probe result by sanitized endpoint host + exact model in non-secret settings; invalidate on either change. [MEDIUM]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Root/daemon build and Vitest | Yes, below project target | v20.19.5 | Upgrade to Node 24 LTS before full build; targeted existing tests may still run. [VERIFIED: environment] |
| npm | Dependency reproduction | Yes, below project target | 10.8.2 | Use project lockfiles; target npm 12 with Node 24. [VERIFIED: environment] |
| 9router CLI | Live configured synthesis check | Yes | 0.5.91 | Deterministic mocked completion tests; ranked results when model unavailable. [VERIFIED: environment] |
| Docker | Optional daemon/Neo4j environment | Yes | 28.3.2 | In-memory graph/retrieval fixtures for targeted tests. [VERIFIED: environment] |
| Neo4j CLI / `cypher-shell` | Live graph integration | No | — | Existing `InMemoryGraphRepository`; live gate remains environment-conditional. [VERIFIED: environment; Phase 18 summary] |
| Context7 CLI | Documentation lookup | No | — | Official docs fetched directly. [VERIFIED: environment] |
| slopcheck | Package legitimacy | No after best-effort install | — | No new packages recommended. [VERIFIED: environment] |

**Missing dependencies with no fallback:** Node 24/npm 12 are needed to match documented project build target; current Node 20 host is below project policy even though Phase 18 tests previously ran there. [CITED: CLAUDE.md] [VERIFIED: environment]

**Missing dependencies with fallback:** Neo4j live tools absent; use existing deterministic in-memory tests and keep a conditional live integration gate. [VERIFIED: Phase 18 summary]

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.2 + Testing Library + fake-indexeddb [VERIFIED: package.json] |
| Config file | `vite.config.ts` (`jsdom`, `tests/setup.ts`, file parallelism off) [VERIFIED: codebase] |
| Quick run command | `npm test -- tests/ai/groundedAssistantEval.test.ts` |
| Full phase suite command | `npm test -- tests/ai/groundedAssistantEval.test.ts tests/ai/groundedTurn.test.ts tests/ai/GroundedAnswerCard.test.tsx tests/ai/CitationChipAndQuickPreview.test.tsx tests/knowledge/knowledgeClient.test.ts tests/knowledge/offlineIsolation.test.ts tests/backup/backupChatGrounding.test.ts` plus `npm --prefix knowledge-server test -- tests/retrievalProtocol.test.ts tests/graphTraversal.test.ts tests/retrievalService.test.ts tests/retrievalRoutes.test.ts` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ANSWER-01 | Every material claim maps to exact existing source/range; unknown IDs block render | unit/eval | `npm test -- tests/ai/groundedAssistantEval.test.ts -t "citation closure"` | No — Wave 0 |
| ANSWER-02 | Ordered 1–3 hop paths preserve endpoint adjacency, direction, and citations | daemon unit + client unit | `npm --prefix knowledge-server test -- tests/graphTraversal.test.ts` and `npm test -- tests/ai/groundedAssistantEval.test.ts -t "path"` | Partial existing / extend |
| ANSWER-03 | Inferred claim requires path and weakest classification; labels are textual | unit/component | `npm test -- tests/ai/GroundedAnswerCard.test.tsx -t "classification"` | No — Wave 0 |
| ANSWER-04 | All conflict branches render, no winner/primary path, dimension proof defaults Unknown | unit/component | `npm test -- tests/ai/groundedAssistantEval.test.ts -t "conflict"` | No — Wave 0 |
| ANSWER-05 | Clarification/no-evidence/unsupported make zero synthesis calls | orchestration unit | `npm test -- tests/ai/groundedTurn.test.ts -t "abstains"` | No — Wave 0 |
| ANSWER-06 | Disabled/network/timeout falls back automatically; auth/invalid/manual abort does not | integration unit | `npm test -- tests/knowledge/offlineIsolation.test.ts tests/ai/groundedTurn.test.ts -t "fallback"` | Partial existing / extend |
| ANSWER-07 | Keyboard citation opens exact range, focuses excerpt, warns on hash mismatch | component/integration | `npm test -- tests/ai/CitationChipAndQuickPreview.test.tsx` | Exists / extend |

### Sampling Rate

- **Per task commit:** Run smallest named test file or `-t` case for changed module. [CITED: project memory]
- **Per wave merge:** Run all Phase 19 root tests or all changed daemon retrieval tests, not unrelated full repository suite. [CITED: project memory]
- **Phase gate:** Both targeted root Phase 19 suite and targeted daemon retrieval suite green; root and daemon TypeScript build on Node 24 target; manual 320 px / 650 px interaction check. [CITED: 19-UI-SPEC.md]

### Wave 0 Gaps

- [ ] `knowledge-server/tests/retrievalPathProtocol.test.ts` — ordered path/source hash/title/conflict metadata contract.
- [ ] `tests/ai/groundedAssistantEval.test.ts` — 20-case deterministic Phase 19 reference fixture harness defined by AI-SPEC.
- [ ] `tests/fixtures/ai/grounded-assistant-reference.json` — synthetic approved lookup/path/conflict/abstention/fallback/injection cases.
- [ ] `tests/ai/groundedTurn.test.ts` — route/outcome/error taxonomy and zero-model-call gates.
- [ ] `tests/ai/evidencePack.test.ts` — budget, dedupe, citation/path/conflict closure.
- [ ] `tests/ai/GroundedAnswerCard.test.tsx` — outcome matrix, progressive disclosure, labels, narrow layout.
- [ ] `tests/backup/backupChatGrounding.test.ts` or extension of existing backup tests — metadata survives export/restore.
- [ ] Extend `tests/ai/CitationChipAndQuickPreview.test.tsx` — numeric/local variants, Enter/Space, exact range, focus, mismatch.
- [ ] Extend `tests/knowledge/knowledgeClient.test.ts` — retrieve body/schema and typed timeout/abort/auth/invalid errors.
- [ ] Extend `tests/knowledge/offlineIsolation.test.ts` — automatic BM25 turn with zero daemon/model egress when weak.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes, daemon and model credentials | Reuse session-only knowledge token and existing 9router credential service; no browser direct Anthropic secret. [VERIFIED: project code] |
| V3 Session Management | Limited | Abort controllers and turn ownership; credentials remain session/native controlled. [VERIFIED: architecture] |
| V4 Access Control | Yes | Grounded synthesis gets no tools; mixed mutations retain existing confirmation and least privilege. [CITED: OWASP prompt injection guidance] |
| V5 Input Validation | Yes | Strict Zod at daemon request/response, model output, persisted grounding, and backup boundaries. [CITED: https://zod.dev/api] |
| V6 Cryptography | Yes for source identity comparison | Native SHA-256 via existing Web Crypto helper; no hand-rolled crypto. [VERIFIED: project code] |
| V7 Error Handling and Logging | Yes | Content-free enums, redaction, no raw evidence/query/system prompt in traces. [CITED: 19-AI-SPEC.md §7] |
| V8 Data Protection | Yes | Never store tokens/provider payloads in chat grounding; distinguish immutable server and local authority. [CITED: CLAUDE.md; 19-CONTEXT.md] |
| V10 Malicious Code | Yes for retrieved instructions | Treat Markdown as inert data, no tools in synthesis, deterministic output validation. [CITED: OWASP LLM01] |
| V13 API and Web Service | Yes | Fixed derived routes, bearer auth, HTTPS/loopback policy, strict JSON, bounded request/response. [VERIFIED: `knowledgeClient.ts`] |

### Known Threat Patterns for Grounded RAG

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Indirect prompt injection in retrieved Markdown | Elevation / Tampering | Evidence in user/data block, explicit inert-data instruction, zero tools, structured output, deterministic closure. [CITED: OWASP LLM01] |
| Citation spoofing | Spoofing | App-assigned IDs resolved against immutable evidence map; model never supplies metadata. [CITED: 19-AI-SPEC.md] |
| Cross-snapshot evidence mixing | Tampering | One pinned snapshot per retrieval; every source/path carries same snapshot ID. [VERIFIED: Phase 18 contract] |
| Conflict branch suppression | Tampering | Preserve branch-set equality and exclude conflicted facts from conclusion synthesis. [CITED: 19-CONTEXT.md D-14] |
| Local/published authority confusion | Spoofing | `S#` versus `L#`, visible Local badge, source hash/state, no fallback on valid server outcome. [CITED: 19-CONTEXT.md D-20/D-21] |
| Secret leakage through logs/debug | Information Disclosure | Allowlisted content-free trace fields; never log query/evidence/system prompt/key/header. [CITED: 19-AI-SPEC.md §7] |
| Resource exhaustion from evidence/model output | Denial of Service | Existing retrieval caps; evidence 8,000 chars; local max five × 1,200 chars; max 12 claims; request timeout; two repairs. [CITED: 19-AI-SPEC.md §4] |
| Unintended mutation from mixed request | Elevation | Retrieval first; operational tool flow separate; retain confirmation policy. [CITED: 19-CONTEXT.md D-08/D-09] |
| Stale turn overwrites newer scope | Tampering | Per-turn ID/controller; abort and discard stale completion before persistence. [CITED: 19-AI-SPEC.md §4b] |

### Direct Anthropic Constraint Check

Current plan does not use direct Anthropic calls, so do not install `@anthropic-ai/sdk`. If architecture changes, use official SDK, never raw fetch; keep secret outside browser; use `stream.finalMessage()` when streaming and preserve full content blocks in multi-turn history; handle typed SDK errors and stop reasons including refusal, max tokens, and pause-turn cases. Retrieval-owned citation IDs remain necessary because native Claude citations cannot combine with structured outputs. [CITED: user-supplied current Claude API constraints] [CITED: https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/typescript] [CITED: https://platform.claude.com/docs/en/build-with-claude/citations]

## Planning Sequence Recommendation

1. **Wave 0 — Contracts and fixtures:** Add Phase 19 reference fixture, grounded schemas, browser retrieval schema, and failing tests. Decide active knowledge-set selection and preview representation. [HIGH]
2. **Wave 1 — Server provenance closure:** Add ordered paths, source title/hash, conflict proof metadata, and daemon tests. No client synthesis before this passes. [HIGH]
3. **Wave 2 — Client retrieval and fallback:** Extend `knowledgeClient`, timeout/abort taxonomy, local range extraction, and strong/weak fallback tests. [HIGH]
4. **Wave 3 — Evidence pack and synthesis:** Build deterministic router, packer, non-streaming completion, bounded repair, and closure validator with zero tools. [HIGH]
5. **Wave 4 — Persistence safety:** Add `ChatMessage.grounding`, repository writes, backup validation/export/restore tests. No Dexie schema bump unless indexing grounding fields. [HIGH]
6. **Wave 5 — UI:** Grounded cards, compact citations, conflicts, paths, diagnostics, candidate/refinement chips, exact preview navigation. [HIGH]
7. **Wave 6 — Drawer integration and acceptance:** Route before model key/tool loop, mixed-intent confirmation, cancellation ownership, offline isolation, narrow drawer/manual accessibility. [HIGH]

This order prevents UI and prompts from hardening around an insufficient Phase 18 contract. [HIGH]

## Sources

### Primary (HIGH confidence)
- `19-CONTEXT.md` on branch `phase-19-grounded-assistant` — locked decisions and code integration points.
- `19-AI-SPEC.md` on branch `phase-19-grounded-assistant` — native pipeline, schemas, budgets, evaluation, and guardrails.
- `19-UI-SPEC.md` on branch `phase-19-grounded-assistant` — Ant Design component, copy, accessibility, and state contracts.
- `knowledge-server/src/types/retrievalProtocol.ts` — current response fields and missing path/hash/title/scope metadata.
- `knowledge-server/src/retrieval/graphTraversal.ts` — flattened traversal implementation and caps.
- `knowledge-server/src/retrieval/fusion.ts` — RRF, conflict grouping, and citation closure behavior.
- `knowledge-server/src/services/retrievalService.ts` — outcome, modality, cutoff, and degradation orchestration.
- `src/services/knowledge/knowledgeClient.ts` — strict boundary and current error taxonomy.
- `src/components/ai/AIChatDrawer.tsx` — current tool loop, API-key gate, persistence, and abort behavior.
- `src/utils/bm25.ts` — local ranking and snippet behavior.
- `src/components/notes/QuickPreviewDrawer.tsx` — current preview limits.
- `src/validation/backupSchemas.ts` — chat backup contract.
- https://zod.dev/json-schema — JSON Schema conversion and strict object behavior.
- https://developers.openai.com/api/docs/guides/structured-outputs — strict schema, refusal, and incomplete output behavior.
- https://platform.claude.com/docs/en/build-with-claude/citations — native citations and structured-output incompatibility.
- https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/typescript — official SDK, browser secret warning, streaming, errors, retries.
- https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static — timeout versus abort semantics.
- https://genai.owasp.org/llmrisk/llm01-prompt-injection/ — untrusted-content separation, least privilege, validation, and human approval.

### Secondary (MEDIUM confidence)
- Phase 18 summaries `18-02-SUMMARY.md`, `18-05-SUMMARY.md`, `18-09-SUMMARY.md` — completed embedding, traversal, acceptance, and offline-isolation evidence.
- npm registry lookups dated 2026-10-11 — existing package versions and publish metadata.

### Tertiary (LOW confidence)
- None. Assumed product decisions are isolated in Assumptions Log and Open Questions.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all recommended runtime pieces already installed and inspected; no new dependency.
- Architecture: HIGH — based on locked context, AI/UI specs, and direct code inspection; set-selection UX remains unresolved.
- Retrieval contract gaps: HIGH — verified from concrete Zod and traversal types.
- Provider capability: MEDIUM — endpoint/model is user-configurable; capability must be probed.
- Local evidence threshold: LOW until calibrated against Phase 19 fixtures.
- Pitfalls/security: HIGH — verified against implementation plus official Zod, provider, MDN, and OWASP documentation.

**Research date:** 2026-10-11
**Valid until:** 2026-11-10 for codebase architecture; recheck provider model/structured-output behavior before live release.
