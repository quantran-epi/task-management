# Phase 27: Studio Artifact Tools & Diff Approval - Context

**Gathered:** 2026-11-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 27 adds two artifact tools to the SDLC studio chat — `get_artifact` (read current artifact: kind, version, approval state, full Markdown, stable section index) and `patch_artifact_section` (propose a section edit as a unified diff + resulting Markdown, without writing the editor). Every patch result renders an approval card in `AiChatWidget`; approve writes the editor draft and marks the step stale via existing revision/staleness rules; reject leaves the editor untouched. Approving never commits a version and never claims approval/saving. "Add this content to the solution" style requests route to `get_artifact` + `patch_artifact_section` producing a bounded diff. Artifact tools are refused in preview/historical versions and when the prerequisite artifact is missing.

This phase does not add query-only server retrieval (28), fs-gw repository execution (29–30), conventions (31), external research (32), or prompt transparency (33). It does not rewrite `AiChatWidget` core or the orchestrator loop; it extends the existing tool registry, host adapter, and widget card surface.

</domain>

<decisions>
## Implementation Decisions

### Approval card & diff rendering
- **D-01:** The patch approval card renders the unified diff verbatim: added lines on green background, removed lines on red background, monospace. The diff area inside the card has a max-height with its own scrollbar, so a long diff does not stretch the chat.
- **D-02:** The card contains everything needed to decide without opening the editor: patched section title, artifact kind/version, added/removed line counts (+N/-N), and Approve/Reject buttons.
- **D-03:** When the artifact has changed since a patch was proposed (stale card), the card keeps showing the old diff with a clear warning that the artifact changed; the Approve button is disabled. The user re-requests the patch via chat; no silent merge.
- **D-04:** Reject records only the decision in the transcript. The user types their next feedback in chat as a normal message; no forced reason dialog, no automatic retry turn.

### Section index & targeting
- **D-05:** The stable section index is derived from the artifact's Markdown headings: hierarchical dotted numbering (e.g., `2.1`) plus heading text, stable across unrelated edits. `get_artifact` returns this index so the model targets sections by ID.
- **D-06:** `patch_artifact_section` targets a section by its index ID. If the target heading no longer matches (drift), the tool returns a structured error with the current index so the model re-reads via `get_artifact` and re-proposes. No fuzzy heading matching, no auto-merge into a renamed section.

### Multiple patches & turn flow
- **D-07:** The model may call `patch_artifact_section` multiple times per turn. Each call produces one approval card; cards are resolved one at a time in order. While a card is pending, the turn parks in the existing awaiting-approval state (25.3 D-22 pattern — no spinner).
- **D-08:** Each diff is computed against the draft as of the tool call. If an earlier patch is rejected and a later card's diff no longer matches the current draft, the later card is treated as stale under D-03 (warning + disabled approve).

### Bounded diff & refusals
- **D-09:** A patch is bounded: the tool refuses replacement/addition text exceeding a fixed line-change cap and tells the model to split the edit into multiple section patches. Exact cap number is implementation discretion, chosen so a "small addition" stays well inside it.
- **D-10:** All refusals (preview/historical read-only, missing prerequisite artifact, oversized patch) return a structured tool result that the UI surfaces as a clear, actionable message stating what is refused and why — consistent with 25.3 D-20 prerequisite-guard UX — not a generic exception.

### Claude's Discretion
- Exact diff line cap, section-ID encoding details, and diff computation utility choice, provided diffs are stable, bounded, and testable.
- Exact card copy and Ant Design treatment, provided added/removed coloring, stale warning, and disabled approve are visually unambiguous.
- Internal representation of pending patch cards in runtime state, provided cards survive re-render and record decisions in the transcript.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase and milestone contracts
- `.planning/ROADMAP.md` § Phase 27 — goal, success criteria, plan waves, and file ownership.
- `.planning/REQUIREMENTS.md` § Studio Artifact Tools (SDLC-ART-01..06).
- `.planning/PROJECT.md` § Current Milestone, Constraints, and Key Decisions.
- `.planning/phases/26-sdlc-prompt-grounding-tool-use-policy/26-CONTEXT.md` — tool allowlist policy (D-05/D-06), artifact intent rules (D-09..D-12), bounded tool loop (D-13..D-16).
- `.planning/phases/25.3-sdlc-workflow-hardening-common-ai-chat-widget/25.3-CONTEXT.md` — widget/runtime ownership (D-25), approval-wait state (D-22), artifact draft rules (D-16..D-18), prerequisite-guard UX (D-20).

### Production SDLC host, tools, and widget
- `src/components/sdlc/chat/StepChatPanel.tsx` — host adapter; artifact draft extraction (`extractArtifactDraft`), intent wiring, and where artifact tool results enter the turn.
- `src/components/ai/AiChatWidget.tsx` — approval-wait rendering, `MutationApprovalCard` mount point, tool activity list.
- `src/components/ai/widget/MutationApprovalCard.tsx` — existing approval card pattern to extend/mirror for artifact-diff cards.
- `src/services/ai/aiTools.ts` — tool registry, definitions, and per-step allowlist filtering.
- `src/services/ai/aiOrchestratorLoop.ts` — tool dispatch boundary and approval parking.
- `src/services/ai/sdlcPromptComposer.ts` — per-step tool policy layer where artifact tools get advertised.
- `src/services/wizard/workflowCoordinator.ts` — draft persistence and automatic staleness detection hook.
- `src/services/wizard/stalenessDetector.ts` — existing staleness rules that approve must trigger via the normal path.
- `src/services/wizard/workflowSchemas.ts` — artifact kinds, versions, and workflow state types.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `MutationApprovalCard` — existing approval card component with resolve callbacks; the artifact-diff card extends this pattern (diff body + +N/-N + stale warning).
- `detectWorkflowStaleness` + `workflowCoordinator` staleness hook — approve writes the draft through the normal coordinator path and staleness follows automatically; do not invent a parallel staleness mechanism.
- `extractArtifactDraft` in `StepChatPanel` — existing draft write path (`onArtifactDraft`/`onSolutionExtracted`) that approve reuses.
- Tool registry allowlist filtering in `aiTools.ts` (Phase 26) — register `get_artifact`/`patch_artifact_section` there and gate advertisement per step.
- `runAiOrchestratorLoop` approval parking (`awaiting-approval`) — patch cards park the turn the same way mutation approvals already do.

### Established Patterns
- Draft before commit: chat edits produce drafts only; version commits stay explicit user actions (25.3 D-17).
- Widget is presentational; host owns runtime and orchestration (25.3 D-25).
- Refusals are structured and actionable, never silent downgrades (26 D-11/D-12, 25.3 D-20).
- Partial/error AI output is runtime-only and never persisted as assistant history.

### Integration Points
- `aiTools.ts` (registry + guards) → `StepChatPanel` (host wiring, intent routing "add this content") → `AiChatWidget`/new diff card (approval UI) → `workflowCoordinator` (draft write + staleness).
- Composer tool policy layer advertises artifact tools only for steps where the prerequisite artifact exists and the version is active.

</code_context>

<specifics>
## Specific Ideas

- The whole point of the phase is bounded, reviewable edits: a small "add this content" request must produce a small diff, not a regenerated document. This consciously amends 25.3 D-18 ("complete artifact on update") for the chat-patch path.
- Approve must not claim "document approved/saved" anywhere in UI copy — it updates the draft and marks staleness only.
- Stale cards are dead ends by design: disable approve, force re-proposal through chat; never auto-merge an old diff into a changed document.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. Query-only retrieval, fs-gw, conventions, external research, and prompt transparency remain separate roadmap phases.

</deferred>

---

*Phase: 27-Studio Artifact Tools & Diff Approval*
*Context gathered: 2026-11-04*
