# Phase 26: SDLC Prompt Grounding & Tool-Use Policy - Context

**Gathered:** 2026-11-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 26 makes every production SDLC chat turn evidence-grounded and tool-policy-driven. The production `ProjectSdlcView` must build non-empty grounding from the current step's own artifacts and CR metadata, plus bounded retrieved evidence. The SDLC composer must emit a fixed layered prompt with shared policy first, step contract, per-step tool policy, few-shot examples, grounding, intent-selected output contract, and language rule. `StepChatPanel` must select the real artifact intent instead of hardcoding `SOLUTION`. The existing shared `runAiOrchestratorLoop` remains the only execution engine; its multi-round tool loop becomes explicitly bounded and observable in the shared widget.

This phase does not add artifact read/patch tools, query-only server retrieval, fs-gw repository execution, external research, conventions, or prompt transparency documentation. Those belong to later roadmap phases. It does not replace `AiChatWidget`, create a second AI engine, or change ordinary chat behavior outside the SDLC host adapter.

</domain>

<decisions>
## Implementation Decisions

### Grounding theo step
- **D-01:** Grounding uses the minimum relevant evidence set for each step, not the entire workflow chain and not only the active artifact. The step mapping is: INTAKE gets PL01/PL02 and CR metadata; SOLUTION gets PL01/PL02 plus pinned SOLUTION; CODE_GUIDE gets SOLUTION plus PL02/acceptance context; CHANGE_PACK gets SOLUTION plus change-pack manifest/evidence; TECH_DOCS gets change-pack evidence and applicable PL03B/PL07 inputs; CAB gets prior technical documents plus CR metadata and implementation evidence.
- **D-02:** `ProjectSdlcView` owns construction of this grounding and passes it to `StepChatPanel`; production path cannot send empty grounding. Missing artifacts are represented as explicit labeled missing evidence, not silently omitted.
- **D-03:** Grounding is formatted as labeled sections with stable source markers such as `[CR_METADATA]`, `[PL01]`, `[PL02]`, `[SOLUTION vN]`, `[CHANGE_PACK]`, and `[TECH_DOCS]`. It remains untrusted data inside the existing grounding delimiters and never becomes prompt instruction.
- **D-04:** Retrieved evidence is bounded by a fixed implementation budget. Grounding states when evidence was limited or insufficient; it does not send unbounded content. Tool policy tells the model to re-query with a narrower query when evidence is thin.

### Tool policy and few-shot behavior
- **D-05:** Tool availability is an explicit allowlist per SDLC step. The composer emits the policy and the caller passes only tools permitted for that step; a model cannot expand the set by prompt instruction.
- **D-06:** Every step policy names available tools and call conditions, including `query_notes`, `search_knowledge_base`, `retrieve_knowledge`, `read_file`, read-only MCP tools, and the applicable artifact tools where available. Artifact tools are listed only when the current phase/runtime supports them; Phase 26 does not implement those tools.
- **D-07:** Policy explicitly says: do not answer from memory when a tool could resolve the question; call again with a narrower query when evidence is thin; if narrower retrieval still cannot establish the claim, abstain and state the missing evidence or conflict.
- **D-08:** Each step has at least two few-shot exemplars: one tool-calling turn followed by an evidence-based answer, and one insufficient-evidence turn showing narrower re-query then abstention. Examples must remain step-specific and be included after the tool-policy layer.

### Intent-driven artifact contracts
- **D-09:** Artifact intent is explicit before composition. UI actions/host handlers pass the artifact kind; the pure composer does not infer artifact kind from natural-language text. Ordinary Q&A remains `qa` and receives no artifact contract.
- **D-10:** TECH_DOCS uses separate explicit actions/intents for `PL03B` and `PL07`. SOLUTION, PL03B, PL07, and CAB each select their own output contract. `StepChatPanel` must remove the unconditional `artifact: 'SOLUTION'` path.
- **D-11:** If a natural-language request clearly asks to create/revise an artifact but omits or ambiguously identifies its kind, the host asks the user to select a valid artifact and does not compose an artifact turn. It must not silently pick a step default.
- **D-12:** If an explicit artifact intent is invalid for the current step or a prerequisite is missing, the host refuses before calling the model, explains the missing prerequisite/valid target, and offers direct guidance/navigation. It does not downgrade silently to Q&A or produce a mismatched draft.

### Bounded and observable tool loop
- **D-13:** Tool loop limit is measured in model/tool rounds, where one round is one model response and its tool batch. Default ceiling is an explicit high constant (target around 50 rounds, subject to implementation validation) to prioritize complete and accurate evidence gathering while remaining bounded. Runtime accepts an override for tests/controlled callers; no user-facing limit setting is needed.
- **D-14:** When the next model response would exceed the ceiling, do not dispatch its pending tool batch. End with a visible terminal status equivalent to “Đã dừng thu thập bằng chứng sau N vòng / evidence gathering stopped”; never silently truncate.
- **D-15:** Tool call and result activity remains in runtime state for the widget, including after limit termination, so the user can audit what was attempted. Do not persist partial text, tool-limit output, or error response as a valid assistant chat message.
- **D-16:** The existing `AiChatWidget` remains the display surface for tool activity. The host/runtime exposes the terminal status through the existing status callback/snapshot; the widget renders it distinctly from normal streaming/synthesis states.

### Claude's Discretion
- Exact grounding budget numbers, source-section delimiter spelling, and typed representation, provided labels are stable, bounded, and tests can prove non-empty production grounding.
- Exact per-step allowlist contents and tool registry filtering, provided policy and actual `tools` payload match and unsupported artifact tools are not advertised as available.
- Exact Vietnamese terminal copy and Ant Design status treatment, provided it is visible, actionable/auditable, and distinguishable from an ordinary model response.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase and milestone contracts
- `.planning/ROADMAP.md` § Phase 26 — goal, success criteria, plan waves, and file ownership.
- `.planning/REQUIREMENTS.md` § SDLC Prompt Architecture — SDLC-PR-01 through SDLC-PR-06.
- `.planning/PROJECT.md` § Current Milestone, Constraints, and Key Decisions — local-first runtime, evidence integrity, and v1.3 boundaries.
- `.planning/phases/25.3-sdlc-workflow-hardening-common-ai-chat-widget/25.3-CONTEXT.md` — shared widget ownership, prompt layering, artifact draft rules, and carried-forward runtime contracts.
- `.planning/phases/25.2-fix-taskmate-mutation-flow-standardize-ai-core-engine-for-sdlc-studio/25.2-CONTEXT.md` — shared orchestrator, SDLC host parity, explicit analysis trigger, and tool behavior.
- `.planning/phases/25.1-sdlc-flow-hardening-multi-tab-ai-chat-isolation/25.1-CONTEXT.md` — isolated step threads, persistence, and SDLC state boundaries.

### Production SDLC host and composer
- `src/views/ProjectSdlcView.tsx` — production SDLC state, artifacts, CR metadata, step selection, and `StepChatPanel` integration point for grounding.
- `src/components/sdlc/SdlcWorkspace.tsx` — current grounding prop path from project view to step chat.
- `src/components/sdlc/chat/StepChatPanel.tsx` — host adapter currently composing turns and hardcoding `artifact: 'SOLUTION'`.
- `src/services/ai/sdlcPromptComposer.ts` — existing layered policy/contracts/few-shot composer and layer-order test target.
- `src/services/ai/aiOrchestratorLoop.ts` — existing multi-round loop, `maxLoops`, callbacks, and tool dispatch boundary.
- `src/components/ai/AiChatWidget.tsx` — shared tool activity and status rendering surface.
- `src/components/ai/runtime/chatTurnRuntime.ts` — host runtime adapter, callbacks, and current `maxLoops` forwarding.

### Tool and evidence integration
- `src/services/ai/aiTools.ts` — local tool definitions, mutation/read classification, and registry filtering.
- `src/services/ai/mcpClient.ts` — dynamic MCP execution and read-only tool behavior.
- `src/services/knowledge/` — existing knowledge retrieval client/config and bounded evidence patterns.
- `src/services/wizard/workflowSchemas.ts` — `SdlcStepId`, artifact kinds, versions, and workflow state types.
- `src/services/wizard/workflowCoordinator.ts` — active artifact/version state and workflow persistence.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `composeSdlcTurn` already emits shared policy, step contracts, few-shot, grounding, artifact contract, and language rule in a fixed order; extend its typed input/segments instead of creating another composer.
- `runAiOrchestratorLoop` already supports `maxLoops`, `onStatusChange`, `onToolCall`, and `onToolResult`; add explicit limit terminal semantics without duplicating the loop.
- `AiChatWidget` already merges tool call/result events and renders a bounded expandable activity area; reuse it for limit visibility.
- `ProjectSdlcView` already owns `workflowState`, artifact versions, CR metadata, and selected step; it is the correct grounding builder location.
- `SdlcWorkspace` already forwards `stepGroundingContext`; preserve adapter boundary while enriching the value.

### Established Patterns
- Dexie/IndexedDB is canonical local persistence; workflow artifacts are immutable versioned records with active pointers.
- SDLC chat scopes remain `sdlc:${projectId}:${crId}:${stepId}` and must not leak into ordinary chat.
- `AiChatWidget` is presentational; host `StepChatPanel` owns `useChatTurn` and composition.
- Prompt data is untrusted and delimited; shared evidence policy must precede all step and grounding text.
- Partial/error AI responses are runtime-only and must not be persisted as assistant history.

### Integration Points
- `ProjectSdlcView.tsx` → `SdlcWorkspace.tsx` → `StepChatPanel.tsx` for per-step grounding.
- `StepChatPanel.tsx` → `composeSdlcTurn` for explicit intent and artifact selection.
- `StepChatPanel.tsx`/`chatTurnRuntime.ts` → `runAiOrchestratorLoop` for high bounded round ceiling and terminal status.
- `AiChatWidget.tsx` → status snapshot/tool activity list for visible evidence-gathering stop.
- Composer/tool registry tests must prove policy/tool payload alignment, required few-shots, contract selection, and policy-first ordering.

</code_context>

<specifics>
## Specific Ideas

- User explicitly prefers a high round ceiling: prioritize solving the question accurately and completely over saving tokens, while retaining a real bounded stop.
- “Evidence insufficient” must be an intentional behavior: narrower re-query first, then abstention, not a guess from model memory.
- Artifact intent must be explicit. Ambiguous artifact requests ask the user rather than silently generating the wrong document.
- Production view must make empty grounding impossible; tests should use real step state/fixtures rather than only testing an isolated string helper.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. Artifact read/patch tools, query-only retrieval, fs-gw, conventions, external research, and prompt transparency remain separate roadmap phases, not additions to Phase 26.

</deferred>

---

*Phase: 26-SDLC Prompt Grounding & Tool-Use Policy*
*Context gathered: 2026-11-03*
