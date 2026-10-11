# Phase 19: Grounded Assistant, Provenance Citations & Offline Fallback - Context

**Gathered:** 2026-10-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 19 connects the existing AI Chat Drawer to Phase 18 hybrid retrieval and turns retrieval evidence into verifiable assistant responses. It owns automatic knowledge-intent routing, evidence-constrained answer synthesis, claim-level citations, inspectable 1–3 hop graph paths, conflict and inference presentation, abstention/clarification behavior, exact document-context navigation, and automatic local BM25 fallback when the optional knowledge server is unavailable. It does not change canonical Markdown, broaden the pilot corpus, add graph editing, replace existing PlannerMate operational tools, or build the Phase 20 benchmark and hardening suite.

</domain>

<decisions>
## Implementation Decisions

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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone and inherited phase contracts
- `.planning/PROJECT.md` — Markdown-canonical constraint, optional knowledge-server isolation, offline behavior, pilot corpus, and evidence integrity.
- `.planning/REQUIREMENTS.md` — Active answer/citation/classification/offline requirements inherited by Phase 19.
- `.planning/ROADMAP.md` — Phase 19 goal, `ANSWER-01` through `ANSWER-07`, seven success criteria, and Phase 20 boundary.
- `.planning/phases/18-multi-modal-hybrid-retrieval-engine/18-CONTEXT.md` — Locked retrieval outcomes, flat citation-bearing item envelope, conflict grouping, modality diagnostics, snapshot pinning, evidence-gated traversal, and degraded behavior that Phase 19 must consume without reinterpreting.
- `.planning/phases/17-pilot-ontology-deterministic-extraction-neo4j-knowledge-grap/17-CONTEXT.md` — Evidence classifications, graph path semantics, conflict preservation, fact identity, and exact provenance rules.
- `.planning/phases/16-knowledge-server-foundation-dlp-checks-ast-ingestion/16-CONTEXT.md` — Immutable published snapshot, local/offline isolation, exact source ranges, and local-versus-remote authority boundaries.

### Knowledge-server retrieval contracts
- `knowledge-server/src/types/retrievalProtocol.ts` — Authoritative request/response schemas for outcomes, chunks, entities, edges, citations, conflicts, candidates, modality status, diagnostics, and plan trace.
- `knowledge-server/src/routes/retrieval.ts` — Existing authenticated `POST /api/v1/sets/:setId/retrieve` integration endpoint and error boundary.
- `knowledge-server/src/services/retrievalService.ts` — Existing retrieval orchestration semantics that answer synthesis must consume rather than duplicate.

### PlannerMate assistant and document UI
- `src/components/ai/AIChatDrawer.tsx` — Existing streaming/tool harness, scoped chat, system prompt, operational tool routing, and Chat Drawer integration surface.
- `src/components/ai/ChatMessageList.tsx` — Existing persisted and streaming message rendering integration point for grounded answer cards and banners.
- `src/components/ai/ChatMessageBubble.tsx` — Existing Markdown/message bubble behavior that structured grounded-answer rendering must preserve or extend.
- `src/components/ai/CitationChip.tsx` — Existing keyboard-accessible citation chip to extend with compact numbering, metadata, source type, and exact-range navigation.
- `src/components/notes/QuickPreviewDrawer.tsx` — Existing document preview surface to extend with section/range scrolling, highlighting, and snapshot mismatch state.
- `src/services/knowledge/knowledgeClient.ts` — Existing authenticated knowledge-server client, strict Zod validation pattern, and transport/error taxonomy to extend with retrieval.
- `src/utils/bm25.ts` — Existing local BM25, Vietnamese normalization, ranking, and snippet extraction used for automatic offline fallback.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AIChatDrawer` already performs message persistence, scoped context building, streaming, tool execution, and final synthesis. Phase 19 should add a knowledge-intent path without replacing operational PlannerMate tools.
- `ChatMessageList` and `ChatMessageBubble` already support persisted and streaming assistant content. Structured provenance metadata should render alongside message content rather than being encoded only as model-generated Markdown.
- `CitationChip` already supports keyboard activation and document-opening callbacks. Extend it instead of creating a second citation control.
- `QuickPreviewDrawer` already loads local documents by stable UUID. Extend its input to accept section/range and snapshot metadata.
- `createKnowledgeClient` already centralizes bearer auth, URL validation, strict Zod response parsing, token redaction, and network/remote/invalid-response distinctions.
- `rankBM25` and `extractRelevantSnippet` already provide client-local lexical fallback with Vietnamese diacritic normalization and bounded snippets.

### Established Patterns
- PlannerMate local IndexedDB remains canonical for current documents; server snapshots and graph/indexes are optional rebuildable projections.
- User-facing app copy is primarily Vietnamese, but Phase 19 responses follow query language while preserving source quotes and identifiers.
- Network protocol boundaries use strict Zod validation; invalid server responses fail visibly rather than being accepted as evidence.
- The AI harness currently stores assistant responses as text. Claim/citation/path metadata must be persisted or deterministically reconstructable so historical messages retain interactive provenance after reload.
- The knowledge server returns a flat evidence set, not a synthesized answer. Phase 19 owns evidence-constrained synthesis and client presentation.

### Integration Points
- Add retrieval request/response schemas or shared types to the PlannerMate client and expose `retrieve(setId, request)` through `knowledgeClient`.
- Add deterministic knowledge-intent routing before the current general model/tool loop; retain the operational path unchanged for task/project/worklog mutations and queries.
- Add an evidence-constrained synthesis input that gives the model only approved retrieval evidence and a strict output contract mapping claims to citation/path IDs; validate model output before rendering.
- Persist structured grounded-answer metadata with assistant chat messages so citations, paths, conflicts, classifications, outcomes, and local/server provenance survive reload.
- Extend message rendering with answer-level banners, candidate/refinement chips, compact citations, Sources details, conflict branches, and vertical path cards.
- Extend document preview navigation to accept document UUID, section anchor, line range, and cited snapshot identity.
- Invoke local BM25 directly against current IndexedDB notes only for D-20 fallback states; keep it independent of server availability and never mix local and server evidence silently.

</code_context>

<specifics>
## Specific Ideas

- Server citation example: inline `[1]`; expanded source `01-wiring.md · Container flow · L42–48 · snapshot abc…`.
- Local citation example: `[L1] 01-wiring.md · Local · chưa xuất bản` or `đã thay đổi cục bộ` when that state is known.
- Derived claim example: if evidence proves `A CALLS B` and `B READS_FROM C`, “A phụ thuộc gián tiếp vào C” may be stated only with an `INFERRED` badge and a two-hop path citing both relations.
- Clarification example: distinguish `PRC_PROCESS:60000006` from `PRC_CONTAINER:60000006` using name/kind chips instead of guessing from the shared numeric ID.
- Conflict example: structured evidence states `CYTP1002` while prose states `CYTP1003`; present both branches and no primary conclusion.
- Degraded example: vector unavailable while full-text and graph succeed; answer from those sources with a banner explaining semantic coverage is unavailable.
- Mixed intent example: “AML_RISK ảnh hưởng process nào, rồi tạo task kiểm tra” may use grounded retrieval for the impact claim and existing mutation confirmation for task creation.

</specifics>

<deferred>
## Deferred Ideas

- 30–50 question benchmark, claim/path scoring, index rebuild verification, and credential-isolation hardening — Phase 20.
- Interactive graph canvas and manual graph editing — beyond v1.2.
- Full card-system corpus beyond process `60000006` — beyond pilot validation.
- General model-knowledge fallback when grounded evidence is absent — explicitly excluded by D-07.

</deferred>

---

*Phase: 19-Grounded Assistant, Provenance Citations & Offline Fallback*
*Context gathered: 2026-10-11*
