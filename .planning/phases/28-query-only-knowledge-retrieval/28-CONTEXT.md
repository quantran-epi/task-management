# Phase 28: Query-Only Knowledge Retrieval - Context

**Gathered:** 2026-11-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Make knowledge retrieval work on a fresh device with no local documents. A client sends `{query, limit}`; the server discovers published sets and federates retrieval across them within bounded budgets. Return set/snapshot attribution alongside existing evidence, entities, paths and warnings. Preserve single-snapshot path closure, citation identities, truthful degraded/unavailable states and optional explicit set restrictions. Normalize the server-empty outcome across ordinary AI Chat, Analysis Mode, SDLC step chat and Telegram.

Tauri remains the app runtime for this work. The optional knowledge daemon must not become a dependency for local document editing, persistence or local search. No repository execution, external research, conventions, new set-picker UI, automatic document import, PWA work or backward-compatibility subsystem is added here.

</domain>

<decisions>
## Implementation Decisions

### Published set discovery and incomplete coverage
- **D-01:** Default retrieval considers all published server sets, not the local catalog and not a relevance-selected subset that silently excludes sets. On a fresh device, ordinary AI Chat, Analysis Mode, SDLC step chat and Telegram search the server immediately for knowledge requests. An empty local catalog must not trigger a request to select a set or clarify document scope.
- **D-02:** A successfully published set whose graph is building, unavailable or failed remains eligible for whatever retrieval modalities are available. Use available fulltext/vector evidence and disclose missing graph capability; do not discard the whole set just because graph is not ready. Research must verify the actual modality prerequisites and report unavailable modalities truthfully rather than inventing readiness.
- **D-03:** Budgets remain finite. If published sets exceed the budget, return bounded partial evidence and an explicit incomplete-coverage warning. Do not claim every set was searched or that evidence is complete. An unsearched set is not a set with no matches.
- **D-04:** If some sets timeout/fail while others return evidence, continue with available evidence and disclose the failed/timed-out coverage. Never infer that missing information does not exist when retrieval coverage is incomplete. If nothing is usable, report the corresponding unavailable/degraded state, not successful empty coverage.

### Request scope and personal-app simplicity
- **D-05:** Query-only is the default. An explicit restriction stays optional for callers that already know their sets. Preserve that restriction exactly: unavailable/unpublished/unknown requested sets must not silently broaden retrieval to unrelated sets; report actionable unavailability.
- **D-06:** Project/CR document links provide context, not an implicit set filter. SDLC also searches all published server sets by default. Only a caller's explicit restriction narrows scope.
- **D-07:** This is a personal app with no old clients to support. Upgrade app and daemon together; do not build backward-compatibility branches, old-protocol fallback, version negotiation or an extra compatibility endpoint. This supersedes the user's earlier tentative compatibility selection. Explicit set requests remain supported because SDLC-RET-05 requires them, not for old-client compatibility.

### Set/snapshot attribution and source inspection
- **D-08:** Include set/snapshot attribution in the model-readable tool result and existing expandable source/tool details. Do not add an always-visible badge or repeat snapshot IDs in every answer by default. Preserve existing evidence, entities, paths, warnings and citation IDs.
- **D-09:** Source details distinguish sets contributing evidence, sets searched with no evidence, failed/timed-out sets and sets not searched because of budgets. Do not label all selected or searched sets as having answered. Snapshot attribution must describe the snapshot actually used; do not invent a snapshot for an unsearched/failed set when none is known.
- **D-10:** A citation must remain useful without its document existing locally: display the returned excerpt, section and set/snapshot identifiers through source details, and clearly state that the local document is absent. Do not automatically download/import documents or make retrieval depend on opening a local editor.
- **D-11:** When evidence from two sets conflicts, retain separately attributable citations for both sets/snapshots and disclose the conflict and unresolved conclusion. Do not silently choose one source as authoritative or concatenate graph paths across snapshots.

### Empty server, fallback and cross-surface messages
- **D-12:** Use this canonical message verbatim when the server has no published sets:

  > Knowledge Server chưa có bộ tài liệu nào được publish. Hãy publish ít nhất một bộ tài liệu từ thiết bị có tài liệu, rồi thử lại.

  The device asking the question does not need local documents. The remedy is publishing from a device that has them, not importing documents onto every client.
- **D-13:** The application renders that canonical notice directly across AI Chat, SDLC step chat and Telegram, including tool-driven paths; do not rely on the model to paraphrase it. The tool/model also receives a structured code/status so it cannot interpret the outcome as evidence. Rendering/chrome may differ by surface, but the notice text must be identical.
- **D-14:** If the server is empty and local documents are available, retain the canonical server-empty notice, then use the existing local fallback with an explicit local-only evidence label. Do not imply the server returned those results. If no local evidence exists, leave the actionable notice; never invent an answer.
- **D-15:** Keep three cases distinct: no published sets (guide publishing), published sets searched but no evidence (guide query refinement), and server unreachable/unavailable (report unavailability and use labeled local fallback where available). None may become a generic exception or be mislabeled as another case.

### Implementation discretion
- Discover published sets from authoritative server state; researcher determines how active Markdown snapshots, retrieval indexes and active graphs relate. Never require the client to supply a local catalog for discovery.
- Prefer extending the existing `/api/v1/retrieve` path if sufficient. Exact optional-field schema, internal resolved-request types, outcome codes and response attribution shape are implementation choices, not user-locked API syntax. No extra endpoint/discriminator without a demonstrated need.
- Choose finite default budgets, deterministic enumeration/selection under caps and bounded attribution representation, while preserving honest coverage and the existing trust invariants.
- Reuse current source/tool detail and citation components. Exact Ant Design layout and local-document-absent copy are discretionary; the canonical empty-server notice above is not.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read the relevant contracts and integration paths before planning or implementing.** No separate Phase 28 SPEC.md or external spec/ADR was provided.

### Scope and carried-forward contracts
- `.planning/ROADMAP.md` § Phase 28 — SDLC-RET scope, success criteria and intended four-wave breakdown.
- `.planning/REQUIREMENTS.md` § Knowledge Retrieval — SDLC-RET-01 through SDLC-RET-05.
- `.planning/PROJECT.md` § Current Milestone, Constraints and Key Decisions — query-only coupling, optional daemon, canonical Markdown and evidence integrity.
- `CLAUDE.md` — Tauri-only current runtime work, offline isolation, trust boundaries and focused-test workflow.
- `.planning/phases/26-sdlc-prompt-grounding-tool-use-policy/26-CONTEXT.md` — bounded evidence, per-step tool policy, insufficient-evidence behavior and existing tool loop.
- `.planning/phases/27-studio-artifact-tools-diff-approval/27-CONTEXT.md` — structured actionable refusals and current shared-widget/host boundaries.
- `.planning/phases/25.3-sdlc-workflow-hardening-common-ai-chat-widget/25.3-CONTEXT.md` — D-04 expandable tool feedback, D-08 source conflicts, D-21 safe failures and D-25 runtime ownership.

### Server retrieval and published state
- `knowledge-server/src/routes/retrieval.ts` — existing per-set and federated routes and request/response validation.
- `knowledge-server/src/types/retrievalProtocol.ts` — strict schemas, budgets, set/snapshot response wrappers and one-snapshot-per-set validation.
- `knowledge-server/src/services/federatedRetrievalService.ts` — bounded fan-out, deduplication, evidence packing, warnings and outcome aggregation.
- `knowledge-server/src/services/retrievalService.ts` — per-set hybrid retrieval, pinned snapshots and modality behavior.
- `knowledge-server/src/indexing/snapshotStore.ts` — server active published Markdown snapshots; currently keyed by set ID.
- `knowledge-server/src/indexing/incrementalProjector.ts` — `ProjectionSnapshot` identity and published document projection.
- `knowledge-server/src/server.ts` — authenticated route registration and service injection.
- `knowledge-server/src/main.ts` — production snapshot store, graph/index and retrieval service wiring.

### Client requests, source packing and surfaces
- `src/services/knowledge/retrievalProtocol.ts` — client request/response validation; evolve with server schema.
- `src/services/knowledge/knowledgeClient.ts` — `retrieveFederated` validates requests before network dispatch.
- `src/services/ai/knowledgeRetrievalTool.ts` — shared tool currently derives set IDs from `fetchSetCatalog` and rejects empty local catalogs.
- `src/services/ai/aiTools.ts` — `retrieve_knowledge` already advertises optional `setIds`; dispatches to the shared retrieval tool.
- `src/services/ai/evidencePack.ts` — existing bounded evidence/citation packing; preserve set/snapshot attribution through packing.
- `src/services/ai/groundedTurn.ts` — scope resolution and empty-local-scope gate, server/local/MCP routing and grounded outcomes.
- `src/services/ai/groundedTurnDeps.ts` — production knowledge client and local fallback dependencies.
- `src/services/ai/semanticScopeRouter.ts` — existing client catalog-derived set assignments; must not gate default server requests.
- `src/components/ai/AIChatDrawer.tsx` — ordinary grounded chat currently loads `fetchSetCatalog`; Analysis Mode uses the tool loop.
- `src/components/sdlc/chat/StepChatPanel.tsx` — SDLC host adapter and shared tool-result presentation.
- `src/services/telegram/telegramHeadlessWorker.ts` — grounded Telegram catalog dependency and non-answer formatting.
- `src/services/wizard/sdlcWizardRuntime.ts` — existing explicit SDLC set-based request construction; audit against D-05/D-06.
- `src/db/repositories/documentSetRepo.ts` — local `fetchSetCatalog`; remove default retrieval coupling, not unrelated catalog functionality blindly.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `/api/v1/retrieve`, `runFederatedRetrieval` and the per-set retrieval service already provide federation, bounded concurrency, per-set timeouts, warning aggregation and source wrappers. Extend rather than replace them.
- `SnapshotStore` tracks active published snapshots in `#activeBySet` and supports per-set reads, but the inspected public API has no all-active-set enumeration. Research server-authoritative discovery and actual index/graph readiness instead of reintroducing a client catalog.
- `createKnowledgeClient().retrieveFederated` validates with a strict client schema before sending. Updating only the server cannot enable `{query, limit}` requests.
- `executeKnowledgeRetrievalTool` already centralizes the AI tool path and uses `packEvidence`. It currently discards set/snapshot metadata in its compact JSON output; preserve attribution there.
- Existing grounded-turn local BM25 fallback and Telegram `formatGroundedNonAnswer` are integration points for normalized actionable states.

### Established Patterns
- Server and client both have strict protocol schemas. Current federated requests require nonempty `setTierAssignments`, `comparisonMode` and budgets; query-only needs validation/default resolution on both sides.
- Existing response entries carry setId/snapshotId and forbid multiple snapshots for one set. Preserve closure and citation correctness after packing; schema validation alone is not the entire trust guarantee.
- Ordinary Drawer/Telegram grounded paths use a catalog-derived scope gate separately from the analysis/tool path. Fixing `knowledgeRetrievalTool.ts` alone will not fix fresh-device retrieval across surfaces.
- Local-first behavior and independent MCP evidence must survive request-scope changes. Do not rewrite the shared orchestrator or introduce a second chat engine.

### Integration Points
- Authoritative server discovery → resolved bounded federation → response validation/attribution → client validation → evidence pack/tool JSON → existing source details.
- Drawer and Telegram grounded routing must stop requiring `fetchSetCatalog` before default remote retrieval. SDLC explicit callers require deliberate scope handling, not automatic linkage-based filtering.
- Canonical structured empty-server handling belongs in shared client outcome/formatting logic, consumed consistently by grounded and tool-driven paths rather than three separately authored messages.
- Add focused checks for fresh-device query-only requests, explicit restriction, missing graph, budgets/timeouts, snapshot/citation integrity, attribution and identical cross-surface notice. Do not run the full Vitest suite.

</code_context>

<specifics>
## Specific Ideas

- User correction: “khong có client cũ, app cá nhân mà”. Keep protocol work small; no old-version compatibility machinery.
- Source inspection should work from the evidence already returned, even when the querying device owns no documents.
- Finite budgets and partial answers are acceptable only with truthful disclosure. “No published sets”, “searched but no evidence” and “could not search” are distinct facts.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within Phase 28. Repository execution, conventions, external research and prompt transparency remain later roadmap phases. Automatic remote-document import and new set-management UI are not needed for this phase.

</deferred>

---

*Phase: 28-Query-Only Knowledge Retrieval*
*Context gathered: 2026-11-05*
