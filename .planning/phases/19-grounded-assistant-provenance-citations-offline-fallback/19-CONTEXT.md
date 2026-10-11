# Phase 19: Grounded Assistant, Provenance Citations & Offline Fallback - Context

**Gathered:** 2026-10-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 19 connects the existing AI Chat Drawer to Phase 18 hybrid retrieval and turns retrieval evidence into verifiable assistant responses. It owns automatic knowledge-intent and corpus-scope routing, federated retrieval across independently pinned document-set snapshots, evidence-constrained answer synthesis, claim-level citations, inspectable 1–3 hop graph paths, conflict and scope-variation presentation, abstention/clarification behavior, exact document-context navigation, and automatic scoped local BM25 fallback when the optional knowledge server is unavailable.

Users ask ordinary natural-language questions. Internal `setId` and `snapshotId` boundaries must preserve provenance without becoming mandatory user selections. Federated retrieval may compare evidence across snapshots, but it must never fabricate a graph path by joining hops from different snapshots.

This phase does not change canonical Markdown, broaden the pilot corpus beyond the milestone boundary, add graph editing, replace existing PlannerMate operational tools, or build the Phase 20 benchmark and hardening suite.

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
- **D-10:** Clicking a server citation opens `QuickPreviewDrawer` at the exact cited section and source range. Show a focused, line-numbered raw Markdown excerpt and highlight the cited lines; retain the rendered document below. If the current local document differs from the immutable cited snapshot, display a clear snapshot-mismatch warning rather than implying the current text is identical.
- **D-11:** Use compact numbered inline citation chips such as `[1]` and `[2]`. Hover/focus and the expandable Sources section show document, section, line range, evidence classification, document-set scope, and snapshot metadata. Deduplicate the same exact source reference within one answer.
- **D-12:** Render graph paths as responsive vertical step cards. Every hop displays source node, relation, target node, evidence classification, and its citation(s); do not rely on color alone.
- **D-13:** When multiple non-conflicting paths from the same snapshot support the same conclusion, open one primary path and collapse alternatives with hop count and classification summary. If paths conflict, designate no primary path.
- **D-14:** A graph path is valid only within one pinned snapshot. Federated retrieval may present paths from different snapshots side by side, but it must never concatenate edges from different snapshots into a synthetic path.

### Federated retrieval and natural-language scope routing
- **D-15:** Do not require a document-set dropdown before a question. Users ask normal-language questions; the system resolves relevant corpus scope and queries document sets internally. Chat may show the resolved scope as editable chips after routing, but this is an optional correction surface, not a prerequisite.
- **D-16:** Federated retrieval queries each selected document set through its own independently pinned active snapshot, then combines evidence while retaining `setId`, `snapshotId`, scope metadata, and source identity on every item. Never remove snapshot scoping and query Neo4j as one unpartitioned graph.
- **D-17:** Model document-set scope with flexible built-in facets such as domain, module, environment, and version, plus tags and a small relation vocabulary such as `EXTENDS`, `SUPPLEMENTS`, and `SUPERSEDES`. Do not hard-code the model to only Common/SIT/UAT/PROD.
- **D-18:** Document-set creation uses friendly presets such as general knowledge, environment-specific, module-specific, version-specific, supplemental, and custom. Basic scope classification is required for every newly created set; advanced facets and relations remain collapsed unless needed.
- **D-19:** Use a small structured LLM semantic-router call as the primary natural-language scope interpreter. It may return only canonical intent, domain/facet values, exclusions, comparison mode, and bounded subqueries from the supplied catalog. It must never invent or directly choose `setId`; application code validates router output and deterministically resolves canonical scope to sets.
- **D-20:** If the semantic router is unavailable, use deterministic canonical-name and configured-alias matching as a degraded fallback. For a general question with no explicit scope, search a clearly related BASE/general set; if several domains are plausible, ask concise clarification chips. Do not make the model a hard dependency for retrieval.
- **D-21:** General questions search relevant BASE/general knowledge first. Questions naming a scope such as PROD search the relevant BASE plus matching scoped sets. Multi-environment comparisons show BASE, SIT/UAT/PROD paths separately. Do not merge paths across snapshots.
- **D-22:** Rank federated evidence by question role—such as baseline and scoped difference—while preserving ranking inside each snapshot. Do not compare raw BM25/vector scores from different corpus sizes as if they shared one absolute scale.
- **D-23:** Select sets progressively using `REQUIRED`, `LIKELY`, then `OPTIONAL` tiers. Always search explicit user scope within a safety cap; expand when evidence is insufficient for a requested part. Bound concurrency, elapsed time, total sets, item count, and evidence size. There is no fixed “Top 3” product rule. Report any coverage limit when a budget stops expansion.
- **D-24:** If some federated sources fail while others return valid evidence, answer only supported portions and show a persistent coverage warning naming unavailable scopes. Do not silently replace a failed published scope with local drafts, and do not discard valid evidence from successful scopes.

### Scope variation, override, and conflict
- **D-25:** A difference may be labeled an environment or other scope variation only when structured set/evidence metadata proves that scope and the selected set relation is compatible. Otherwise present both assertions with scope `Unknown`; the model must not infer scope from prose alone.
- **D-26:** Do not say one scoped assertion overrides or supersedes another unless explicit `SUPERSEDES`/override metadata or cited source evidence proves that relationship. Otherwise say, for example, “PROD records B while the baseline records A.”
- **D-27:** When structured metadata proves a scoped difference without direct contradiction, label it neutrally as `Environment variation` or equivalent, not as a conflict or winner.
- **D-28:** Directly contradictory evidence within the same scope, or branches with no proven ordering/override relation, is a conflict with no winner. Show every branch and citation and ask the user to verify. Evidence classification, publish time, document order, or snapshot recency must not silently select a winner.
- **D-29:** Conflict dimensions remain `Version`, `Environment`, `Behavior`, or `Unknown`, and may be assigned only from structured metadata or direct evidence. The model must not invent a dimension.
- **D-30:** Derived claims show a visible `INFERRED` badge. Graph path cards always show each hop’s evidence classification. A mixed-classification claim uses the weakest supporting classification; direct-claim classification remains visible in citation metadata.
- **D-31:** For `DEGRADED` retrieval with usable evidence, answer from remaining evidence and show a compact banner naming unavailable, timed-out, stale, truncated, or unsearched modalities/scopes and the resulting coverage limit. Put full diagnostics in an expandable section. Degradation indicates incomplete coverage, not that returned evidence is false.

### Document order, snapshot identity, and provenance
- **D-32:** Document order inside a set is presentation order only. Reordering must not affect retrieval ranking, source authority, conflict resolution, entity identity, evidence classification, or graph meaning.
- **D-33:** Reordering documents without membership or content changes must not rebuild the graph/content snapshot. Store display order separately and record a presentation-metadata revision plus a content-free `Document order changed` event while preserving the graph/content snapshot ID.
- **D-34:** `firstSeenInDoc` is not authority and must not be used as an answer citation. When an entity or fact appears in multiple documents, retain all supporting source occurrences. If UI needs one representative source, select by evidence quality and then stable document ID, never display order.
- **D-35:** No legacy document-set migration or compatibility path is required for current test data. Existing test sets may be deleted and rebuilt from canonical documents. Deleting sets must not delete or alter canonical local documents.

### Offline and model-degraded behavior
- **D-36:** For knowledge intents, automatically run existing local BM25 when the knowledge server is disabled, absent, unreachable, or times out. Do not require the user to resend the question. Show a persistent answer-level banner that local lexical search is active and graph/vector/published-snapshot capabilities are unavailable.
- **D-37:** Local BM25 preserves resolved scope. For a BASE + PROD question, search only current local document members of the resolved BASE and PROD sets, not every local document. If scope cannot be resolved safely, ask clarification chips instead of searching all local drafts.
- **D-38:** Local grounded synthesis is allowed only from bounded BM25 snippets supplied to the model. It retains claim-level citations but may not create graph/path claims, resolve conflicts, or state facts outside those snippets. If snippet evidence is too weak, show ranked local results instead of prose.
- **D-39:** Deduplicate local evidence by document UUID plus exact range even when the document belongs to multiple selected sets. Show one `[L#]` citation whose metadata lists all relevant memberships/scopes.
- **D-40:** If local evidence supports BASE but not an explicitly requested PROD portion, answer the supported BASE portion and abstain for PROD. Never infer that PROD matches BASE merely because no local PROD difference was found.
- **D-41:** Automatic local fallback applies only to disabled/absent server state and transport/network/timeout failures. Authentication, configuration, invalid-response, and manual-abort errors remain visible for repair. Valid server outcomes such as `READY`, `NO_EVIDENCE`, and `UNSUPPORTED` remain authoritative and must not be mixed silently with unpublished local drafts.
- **D-42:** Distinguish local citations with `[L1]`, `[L2]`, and a visible `Local` badge. Show unpublished or locally changed status when known. Clicking opens the current local document range; never claim immutable server snapshot provenance for local citations.
- **D-43:** If server evidence is valid but the answer model/API key is unavailable, show ranked server evidence, source metadata, and interactive citations without synthesized prose. Do not hide evidence and do not switch to local BM25.
- **D-44:** When the model later becomes available, offer `Tạo câu trả lời từ bằng chứng`. This action uses the exact stored evidence and snapshots already shown. A separate `Tra cứu lại` action retrieves current snapshots and creates a new answer.
- **D-45:** If structured model output remains invalid or fails citation/path closure after bounded repair, never render raw or partially validated prose. Show the validated ranked evidence, a safe synthesis-error state, and a retry action.

### Historical citation durability
- **D-46:** Historical answers retain their original snapshot IDs, source metadata, and citations after republish. Never retarget an old citation to a newer snapshot automatically.
- **D-47:** Opening a historical citation shows the exact stored/published snapshot excerpt first. The current local document may appear below with a mismatch/diff warning, but must not be presented as the original evidence.
- **D-48:** Persist the bounded cited excerpt and required provenance metadata with the assistant message. If daemon retention has removed the old snapshot, the stored excerpt remains inspectable with a clear `snapshot no longer available` status; do not claim live verification.
- **D-49:** `Tra cứu lại` creates a new turn/answer against current snapshots and preserves the old answer unchanged for comparison and audit.

### Claude's Discretion
- Exact visual styling, accessible colors, icons, animation, and spacing, provided labels remain readable without color and fit the existing Ant Design Chat Drawer.
- Exact semantic-router prompt and confidence thresholds, provided output is schema-bound, canonical values are validated, and low-confidence routing asks rather than guesses.
- Exact initial concurrency, timeout, set-count, item-count, and evidence-size budgets for progressive federated retrieval; Phase 20 will calibrate them.
- Exact primary-path ordering within one snapshot and limits for collapsed alternatives, provided conflicts never receive a primary path.
- Exact thresholds for weak local BM25 evidence and snippet/count budgets, provided D-38’s provenance ceiling is enforced.
- Exact refinement-chip wording and ordering, capped at three for answer refinement and constrained by D-07.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase contracts
- `.planning/PROJECT.md` — Markdown-canonical constraint, optional knowledge-server isolation, offline behavior, pilot corpus, and evidence integrity.
- `.planning/REQUIREMENTS.md` — Inherited ingestion, graph, retrieval, and local-search requirements.
- `.planning/ROADMAP.md` — Phase 19 goal, `ANSWER-01` through `ANSWER-07`, success criteria, and Phase 20 boundary.
- `.planning/phases/19-grounded-assistant-provenance-citations-offline-fallback/19-AI-SPEC.md` — Native grounded pipeline, answer schemas, evidence budgets, eval strategy, and safety guardrails. Where it assumes one set, this CONTEXT.md’s federated-routing decisions supersede that assumption.
- `.planning/phases/19-grounded-assistant-provenance-citations-offline-fallback/19-UI-SPEC.md` — Chat Drawer visual, responsive, accessibility, and interaction contract. This CONTEXT.md adds automatic scope chips and removes any implication that set selection is mandatory before asking.
- `.planning/phases/18-multi-modal-hybrid-retrieval-engine/18-CONTEXT.md` — Per-set retrieval outcomes, citation-bearing item envelope, conflict grouping, modality diagnostics, snapshot pinning, evidence-gated traversal, and degraded behavior.
- `.planning/phases/17-pilot-ontology-deterministic-extraction-neo4j-knowledge-grap/17-CONTEXT.md` — Evidence classifications, graph path semantics, conflict preservation, fact identity, and exact provenance rules.
- `.planning/phases/16-knowledge-server-foundation-dlp-checks-ast-ingestion/16-CONTEXT.md` — Immutable published snapshots, ordered membership, local/offline isolation, exact source ranges, and local-versus-remote authority boundaries.

### Document-set and publication model
- `src/types/models.ts` — Current `DocumentSet` and chat-message persistence types to extend with scope metadata, relations, presentation revision, and structured grounding.
- `src/components/knowledge/DocumentSetForm.tsx` — Existing creation/edit/reorder UI to extend with friendly scope presets and collapsed advanced facets/relations.
- `src/db/repositories/documentSetRepo.ts` — Current ordered membership and publish metadata persistence boundary.
- `src/services/knowledge/changePreview.ts` — Frozen publish snapshot and document-order binding behavior that must separate presentation revision from graph/content identity.
- `src/services/knowledge/publishOrchestrator.ts` — Two-phase publish binding and content-free attempt history.

### Knowledge-server graph and retrieval contracts
- `knowledge-server/src/types/retrievalProtocol.ts` — Authoritative per-set request/response schemas for outcomes, citations, conflicts, candidates, modality status, diagnostics, and plan trace.
- `knowledge-server/src/routes/retrieval.ts` — Existing authenticated `POST /api/v1/sets/:setId/retrieve` primitive; Phase 19 federated orchestration composes this behavior without weakening per-set scope.
- `knowledge-server/src/services/retrievalService.ts` — Pinned-snapshot retrieval, candidate sanitation, fusion, and partial/degraded semantics.
- `knowledge-server/src/graph/graphRepository.ts` — `setId` to active snapshot resolution, leases, and snapshot-scoped full-text/vector queries.
- `knowledge-server/src/graph/neo4jRepository.ts` — `GraphSet` active pointer and `graphSnapshotId` isolation in Neo4j.
- `knowledge-server/src/retrieval/graphTraversal.ts` — Snapshot-scoped bounded traversal; cross-snapshot path concatenation is forbidden.
- `knowledge-server/src/graph/extraction.ts` — Current document iteration and `firstSeenInDoc` behavior; Phase 19 must not treat first-seen as authority.
- `knowledge-server/src/retrieval/fusion.ts` — Existing per-snapshot RRF and deterministic tie-breaking to preserve inside federated role groups.

### PlannerMate assistant and document UI
- `src/components/ai/AIChatDrawer.tsx` — Existing streaming/tool harness, scoped chat, operational routing, model-key gate, and grounded-turn integration surface.
- `src/components/ai/ChatMessageList.tsx` — Persisted and streaming message rendering integration point.
- `src/components/ai/ChatMessageBubble.tsx` — Existing Markdown/message bubble behavior to extend with structured grounded answers and evidence-only states.
- `src/components/ai/CitationChip.tsx` — Existing keyboard-accessible citation control to extend with compact numbering, local/server identity, scope metadata, and exact-range navigation.
- `src/components/notes/QuickPreviewDrawer.tsx` — Existing document preview to extend with snapshot-first raw excerpt, line focus, current-local comparison, and missing-snapshot state.
- `src/services/knowledge/knowledgeClient.ts` — Authenticated client, strict Zod boundary, and transport/error taxonomy to extend for retrieval and typed timeout/abort handling.
- `src/utils/bm25.ts` — Existing local BM25, Vietnamese normalization, ranking, and snippet extraction used for scoped automatic fallback.
- `src/validation/backupSchemas.ts` — Backup trust boundary that must preserve structured grounding and historical excerpts.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AIChatDrawer` already performs message persistence, scoped context building, streaming, tool execution, and final synthesis. Phase 19 should add a separate structured knowledge path without replacing operational PlannerMate tools.
- `ChatMessageList` and `ChatMessageBubble` already support persisted and streaming assistant content. Structured provenance metadata should render alongside message content rather than being encoded only as model-generated Markdown.
- `CitationChip` already supports keyboard activation and document-opening callbacks. Extend it instead of creating a second citation control.
- `QuickPreviewDrawer` already loads local documents by stable UUID. Extend it with snapshot excerpt, exact line range, mismatch, and missing-snapshot states.
- `createKnowledgeClient` already centralizes bearer auth, URL validation, strict Zod response parsing, token redaction, and network/remote/invalid-response distinctions.
- `rankBM25` and `extractRelevantSnippet` already provide client-local lexical fallback with Vietnamese diacritic normalization and bounded snippets.
- Phase 18 per-set retrieval already pins one active snapshot and rejects cross-snapshot candidates. Federated orchestration should compose this primitive, not remove its isolation.

### Established Patterns
- PlannerMate local IndexedDB remains canonical for current documents; server snapshots and graph/indexes are optional rebuildable projections.
- User-facing app copy is primarily Vietnamese, but Phase 19 responses follow query language while preserving source quotes and identifiers.
- Network protocol boundaries use strict Zod validation; invalid server or model responses fail visibly rather than being accepted as evidence.
- The AI harness currently stores assistant responses as text. Claim/citation/path metadata and bounded cited excerpts must be persisted so historical messages retain interactive provenance after reload and snapshot cleanup.
- Neo4j graph paths are valid only inside one `graphSnapshotId`. Federated comparison occurs above traversal through evidence grouping, not by querying an unpartitioned cross-snapshot graph.
- Document order currently influences frozen bindings and `firstSeenInDoc`; Phase 19 must separate display order from knowledge semantics.

### Integration Points
- Extend `DocumentSet` creation/persistence with required basic scope, optional facets/relations, aliases, and separate presentation revision.
- Add a server or client orchestration boundary that lists eligible sets, invokes per-set retrieval with independently pinned snapshots, and returns one federated envelope retaining per-item provenance and per-scope diagnostics.
- Add a structured LLM semantic router before retrieval; validate canonical scope output and resolve it to sets in application code.
- Preserve existing per-set retrieval for each selected snapshot; add role-group fusion and progressive expansion above it.
- Add ordered graph paths, source title/hash, structured scope/conflict proof, and all source occurrences to the retrieval contract before answer synthesis.
- Add a non-streaming, no-tool evidence-constrained synthesis input and deterministic citation/path closure validation before rendering.
- Persist structured grounded-answer metadata, evidence-only/model-error states, historical excerpts, and routing/snapshot diagnostics with assistant messages and backups.
- Extend message rendering with scope chips, answer-level banners, candidate/refinement chips, compact citations, Sources details, environment variations, conflicts, and parallel snapshot path cards.
- Invoke local BM25 only against current local members of the resolved sets for allowed fallback states; keep local and published authority visibly distinct.

</code_context>

<specifics>
## Specific Ideas

- Natural question example: “Process XXX chạy flow như thế nào? Trên môi trường thật flow có gì đặc biệt không?” The semantic router maps “môi trường thật” to canonical `PROD`, then application code resolves relevant BASE and PROD sets.
- Server citation example: inline `[1]`; expanded source `Card System Core · 01-wiring.md · Container flow · L42–48 · snapshot abc…`.
- Local citation example: `[L1] 01-wiring.md · Local · chưa xuất bản` or `đã thay đổi cục bộ` when that state is known.
- Cross-snapshot presentation example: show `Common baseline` path and `PROD variation` path side by side; never synthesize a path containing hops from both.
- Scope UI example: `Đang tra cứu: Card System · Kiến thức chung · PROD`, editable after automatic routing rather than selected before asking.
- Scope creation example: friendly `Theo môi trường` preset shows Domain, Environment, and “Bổ sung cho tập kiến thức”; internal relation identifiers remain hidden in normal flow.
- Derived claim example: if one snapshot proves `A CALLS B` and `B READS_FROM C`, “A phụ thuộc gián tiếp vào C” may be stated only with an `INFERRED` badge and a two-hop path citing both relations.
- Conflict example: two PROD sources assert different cycle codes without proven ordering; show both branches and no winner.
- Variation example: structured metadata proves a PROD-specific extra reconciliation step; label `Khác biệt theo môi trường`, not conflict or override.
- Evidence-only example: model endpoint unavailable after successful server retrieval; show ranked citations and `Tạo câu trả lời từ bằng chứng` rather than hiding results.
- Historical citation example: old answer opens its stored snapshot excerpt first; current local text appears separately with mismatch warning.

</specifics>

<deferred>
## Deferred Ideas

- Phase 20 calibrates federated set-selection budgets, semantic-router accuracy, claim/path scoring, index rebuild verification, and credential-isolation hardening against the benchmark corpus.
- Interactive graph canvas and manual graph editing — beyond v1.2.
- Full card-system corpus beyond process `60000006` — beyond pilot validation, although Phase 19 scope metadata and routing must not hard-code the pilot shape.
- General model-knowledge fallback when grounded evidence is absent — explicitly excluded by D-07.
- Automatic alias learning from user language without explicit confirmation — deferred to avoid silent scope-routing drift.

</deferred>

---

*Phase: 19-Grounded Assistant, Provenance Citations & Offline Fallback*
*Context gathered: 2026-10-11*
