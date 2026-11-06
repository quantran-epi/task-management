# Phase 27: Studio Artifact Tools & Diff Approval - Research

**Researched:** 2026-11-04
**Domain:** SDLC studio chat tool registry extension, unified-diff approval UX, editor-draft write path
**Confidence:** HIGH (all findings from in-repo source reads this session; no external questions required web providers)

## Summary

Phase 27 adds two artifact tools (`get_artifact`, `patch_artifact_section`) to the SDLC step chat, an artifact-diff approval card in `AiChatWidget`, and an approve path that writes the editor draft through the existing draft handlers. The codebase already contains every structural seam this phase needs: a tool registry with per-step allowlists and mutation interception, an approval-parking turn runtime (`awaiting-approval`), a draft write path (`onArtifactDraft`/`saveDraft`), a hash-based staleness detector, and a diff *rendering* stack (`parseGitDiff` + `DiffHunkView` palette). What does not exist is the diff *generation* side and a way for a tool executing inside the chat runtime to read the SDLC workflow state and the editor drafts.

Two findings dominate the plan:

1. **The mutation-approval path is pre-execution, not post-computation.** `runAiOrchestratorLoop` checks `isMutationTool` and calls `onMutationCheck` *before* dispatching the tool [VERIFIED: src/services/ai/aiOrchestratorLoop.ts:355-376]. The existing approval flow therefore confirms a *described* mutation, then executes. For `patch_artifact_section`, the diff the user approves must be computed at describe-time (inside `describeToolMutationWithContext`, which is async and receives `db`), cached on the pending card, and the tool execution after approve returns the same cached/structured result. This maps 1:1 onto D-07's "cards resolved one at a time in order", because the loop's `for (const tc of toolCallsToRun)` already serializes tool calls including their awaited mutation checks [VERIFIED: src/services/ai/aiOrchestratorLoop.ts:343-441].

2. **Tools cannot reach the artifacts they operate on without a scope bridge.** Tool execution inside `chatTurnRuntime` is hardwired to `dispatchAiToolCall(name, args, db, signal, { allowMutation })` [VERIFIED: src/components/ai/runtime/chatTurnRuntime.ts:265-270]; `executeAiTool` only receives `(name, args, db, signal)` — no host context. Meanwhile the committed artifact content lives in `db.settings` under `workflowStorageKey(projectId, crId)` [VERIFIED: src/services/wizard/workflowCoordinator.ts:34], the SOLUTION *draft* lives in `db.settings` under `draftSettingKey(projectId, crId)` [VERIFIED: src/views/ProjectSdlcView.tsx:46, 439-446], but the **PL03B/PL07/CAB drafts live only in React state** in `ProjectSdlcView` (`setDraftPl03b` etc., [VERIFIED: src/views/ProjectSdlcView.tsx:471-479]) and are never persisted. A tool that reads only `db` will see stale or empty PL03B/PL07/CAB text. The plan needs a small per-scope artifact-tool context (set by the host when a turn starts, carrying `projectId/crId/stepId` and draft getters) — or, equivalently, persisting those drafts like SOLUTION's.

Third finding (RESOLVED by authorized planning defaults): **the existing staleness detector cannot mark a step stale from a draft-only edit.** `detectWorkflowStaleness` compares committed artifact hashes in `sourceHashes` [VERIFIED: src/services/wizard/stalenessDetector.ts:19-97]; approving a patch changes no committed hash. SDLC-ART-04 uses a pure, read-only draft-hash divergence report beside that detector, merged into the existing stale banner without workflow-state mutation. Hash inputs use `markdown.trim()` consistently with coordinator call sites; editor source text remains unchanged by normalization. See resolved Q1.

**Primary recommendation:** Register `get_artifact` (read-only) and `patch_artifact_section` (in `MUTATION_TOOLS`) in `aiTools.ts`; compute the section diff inside a new async `describeToolMutationWithContext` case fed by a per-scope tool context; render the diff card via an extended `ChatTurnApprovalInfo` snapshot; on approve, the host applies the cached patched Markdown through the existing `saveDraft`/`setDraftPl03b`-family handlers and a draft-hash divergence check provides the staleness marker. Generate diffs with a small hand-rolled LCS line-diff utility emitting unified-diff-shaped text — no new npm dependency.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Implementation Decisions (locked — copy governs the plan)

- **D-01:** The patch approval card renders the unified diff verbatim: added lines on green background, removed lines on red background, monospace. The diff area inside the card has a max-height with its own scrollbar, so a long diff does not stretch the chat.
- **D-02:** The card contains everything needed to decide without opening the editor: patched section title, artifact kind/version, added/removed line counts (+N/-N), and Approve/Reject buttons.
- **D-03:** When the artifact has changed since a patch was proposed (stale card), the card keeps showing the old diff with a clear warning that the artifact changed; the Approve button is disabled. The user re-requests the patch via chat; no silent merge.
- **D-04:** Reject records only the decision in the transcript. The user types their next feedback in chat as a normal message; no forced reason dialog, no automatic retry turn.
- **D-05:** The stable section index is derived from the artifact's Markdown headings: hierarchical dotted numbering (e.g., `2.1`) plus heading text, stable across unrelated edits. `get_artifact` returns this index so the model targets sections by ID.
- **D-06:** `patch_artifact_section` targets a section by its index ID. If the target heading no longer matches (drift), the tool returns a structured error with the current index so the model re-reads via `get_artifact` and re-proposes. No fuzzy heading matching, no auto-merge into a renamed section.
- **D-07:** The model may call `patch_artifact_section` multiple times per turn. Each call produces one approval card; cards are resolved one at a time in order. While a card is pending, the turn parks in the existing awaiting-approval state (25.3 D-22 pattern — no spinner).
- **D-08:** Each diff is computed against the draft as of the tool call. If an earlier patch is rejected and a later card's diff no longer matches the current draft, the later card is treated as stale under D-03 (warning + disabled approve).
- **D-09:** A patch is bounded: the tool refuses replacement/addition text exceeding a fixed line-change cap and tells the model to split the edit into multiple section patches. Exact cap number is implementation discretion, chosen so a "small addition" stays well inside it.
- **D-10:** All refusals (preview/historical read-only, missing prerequisite artifact, oversized patch) return a structured tool result that the UI surfaces as a clear, actionable message stating what is refused and why — consistent with 25.3 D-20 prerequisite-guard UX — not a generic exception.

### Claude's Discretion
- Exact diff line cap, section-ID encoding details, and diff computation utility choice, provided diffs are stable, bounded, and testable.
- Exact card copy and Ant Design treatment, provided added/removed coloring, stale warning, and disabled approve are visually unambiguous.
- Internal representation of pending patch cards in runtime state, provided cards survive re-render and record decisions in the transcript.

### Specifics (locked)
- The whole point of the phase is bounded, reviewable edits: a small "add this content" request must produce a small diff, not a regenerated document. This consciously amends 25.3 D-18 ("complete artifact on update") for the chat-patch path.
- Approve must not claim "document approved/saved" anywhere in UI copy — it updates the draft and marks staleness only.
- Stale cards are dead ends by design: disable approve, force re-proposal through chat; never auto-merge an old diff into a changed document.

### UI-SPEC (approved — reference, do not re-decide)
`.planning/phases/27-studio-artifact-tools-diff-approval/27-UI-SPEC.md` locks the card visuals, Vietnamese copy table, diff palette (reuse `DiffHunkView` 15-UI-SPEC values), 240px diff scroll cap, refusal alert treatment, and interaction contracts UI-27-01..10.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. Query-only retrieval, fs-gw, conventions, external research, and prompt transparency remain separate roadmap phases.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SDLC-ART-01 | `get_artifact` returns kind, version, approval state, full Markdown, stable section index | New tool in `AI_DATABASE_TOOLS` + `executeAiTool` case; section index from new Markdown-heading util (D-05); data from per-scope tool context + `db.settings` workflow/draft keys; approval state from `SdlcArtifactRef.approvedAt` [VERIFIED: src/services/wizard/workflowSchemas.ts:48] |
| SDLC-ART-02 | `patch_artifact_section` takes target section + text, returns unified diff + resulting Markdown, no editor write | Diff computed in `describeToolMutationWithContext` case (pre-execution approval model); hand-rolled LCS diff generator; tool never writes editor — approve path in host applies draft |
| SDLC-ART-03 | Approval card per patch result; approve/reject; decision recorded in transcript | Extend `ChatTurnApprovalInfo`/`pendingApproval` snapshot with patch payload; new `ArtifactDiffApprovalCard` (UI-SPEC §1); pending proposal kept in host runtime state; explicit approve/reject decision persisted as metadata-only transcript row, excluded from LLM history (resolved Q3) |
| SDLC-ART-04 | Approve writes editor draft, marks step stale via existing rules, never commits | Approve interception in `StepChatPanel` wraps `turn.resolveApproval` and calls existing handlers (`saveDraft` [VERIFIED: src/views/ProjectSdlcView.tsx:439-446], `setDraftPl03b/Pl07/Cab` [VERIFIED: src/views/ProjectSdlcView.tsx:471-479]); staleness uses the authorized pure draft-hash divergence report beside the existing detector (resolved Q1) — never `commitRevision`/`commitSolution` |
| SDLC-ART-05 | "Add this content" routes to get + patch with bounded diff | `looksLikeArtifactRequest` interception in `sendMessage` [VERIFIED: src/components/sdlc/chat/StepChatPanel.tsx:338-347] must distinguish add/patch requests from full-generation requests; composer tool policy advertises artifact tools; D-09 line cap enforced in tool; regression test with scripted tool calls |
| SDLC-ART-06 | Refused in preview/historical, allowed in active CR, blocked without prerequisite | `readOnly` prop already flows ProjectSdlcView → SdlcWorkspace → StepChatPanel [VERIFIED: src/views/ProjectSdlcView.tsx:761]; tool-level structured refusals per D-10; prerequisite markers via existing `ARTIFACT_PREREQUISITES` + `hasGroundingSource` pattern [VERIFIED: src/components/sdlc/chat/StepChatPanel.tsx:77-81, 319-324] |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `get_artifact` / `patch_artifact_section` tool definitions + execution | API/Backend (services: `aiTools.ts`, new `sdlcArtifactTools.ts`) | — | Tool dispatch boundary already lives in the service layer; widget never sees tool internals (D-25) |
| Section index derivation + LCS diff generation | Pure utils (`src/utils/`) | — | Pure functions; unit-testable in isolation; no React, no db |
| Approval parking + mutation interception | Runtime (`chatTurnRuntime.ts`, `aiOrchestratorLoop.ts`) | — | `awaiting-approval` status and `onMutationCheck` already owned here; widget is presentational |
| Artifact-diff approval card rendering | Frontend (`AiChatWidget` + new `widget/ArtifactDiffApprovalCard.tsx`) | — | Widget renders from host-provided snapshot; never owns state transitions (D-25) |
| Approve → draft write + staleness marking | Host (`StepChatPanel` + `ProjectSdlcView`) | Coordinator/stalenessDetector | Hosts own runtime and artifact state; draft handlers and staleness inputs live here |
| Refusal surfacing (alerts, navigate action) | Host (`StepChatPanel` statusExtensions pattern) | — | Existing `artifactNotice` Alert pattern is host-owned [VERIFIED: src/components/sdlc/chat/StepChatPanel.tsx:434-467] |
| Intent routing ("add this content") | Host (`StepChatPanel.sendMessage`) | Composer (tool policy layer) | Host decides intent before composition (26 D-09: composer stays pure) |

## Standard Stack

### Core
No new npm packages. Everything builds on what is installed and verified in-repo.

| Library/Module | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| (existing) `aiTools.ts` registry | in-repo | Add tool definitions, `executeAiTool` cases, `describeToolMutationWithContext` case, `MUTATION_TOOLS` entry | Single registry + single dispatch already used by every tool [VERIFIED: src/services/ai/aiTools.ts:92, 2001, 5031, 4749] |
| (existing) `chatTurnRuntime.ts` approval flow | in-repo | `awaiting-approval` parking, `resolveApproval` boolean resolver | Reuse verbatim; only extend `ChatTurnApprovalInfo` payload [VERIFIED: src/components/ai/runtime/chatTurnRuntime.ts:315-335] |
| (existing) `parseGitDiff` + `DiffHunkView` palette | in-repo | Optional unified-diff parsing; diff color values | UI-SPEC mandates reusing the 15-UI-SPEC palette from `DiffHunkView` [VERIFIED: src/components/agents/DiffHunkView.tsx:24-27] |
| (new) `src/utils/markdownSections.ts` | new in-repo util | Dotted hierarchical section index from headings (D-05) | ~40 lines; fence-aware (skip `#` inside code fences, same concern `sdlcSolutionParser` already handles) |
| (new) `src/utils/lineDiff.ts` (or inside `sdlcArtifactTools.ts`) | new in-repo util | LCS line diff producing unified-diff-shaped text | Bounded per-section diffs make naive LCS correct and fast; zero-dependency; fully testable |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod (installed) | — | Validate tool args and structured tool results at the trust boundary | Patch args (`sectionId`, `newContent`), refusal payloads |
| Ant Design tokens (installed) | — | Card container, warning strip, buttons | Per UI-SPEC; no new hex values |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled LCS diff util | `diff` npm package (jsdiff) v9.0.0 [VERIFIED: npm view diff → 9.0.0] | jsdiff is battle-tested but adds a dependency and its registry legitimacy check failed in this environment's seam (network-blocked lookup, verdict SUS — see Package Legitimacy Audit). Section-scoped diffs are small; ~60-line LCS with tests is lower risk and matches the zero-new-deps posture of this milestone. CONTEXT gives discretion here. |
| Reusing `MutationApprovalCard` directly | New `ArtifactDiffApprovalCard` | UI-SPEC §1 explicitly separates them: diff card uses a neutral container (semantic green/red lives in the diff body; warning treatment must stay available for stale state). Do not merge. |
| Pre-execution mutation-check approval (recommended) | Tool awaits user decision inside `executeToolFn` | Tool-side await would need the runtime to know the turn is parked (status would show `tool`, not `awaiting-approval`, breaking D-07/25.3 D-22) and would bypass `MUTATION_TOOLS`/analysis-mode refusal machinery. The describe-time compute reuses everything. |
| Persisting PL03B/PL07/CAB drafts to `db.settings` | Per-scope tool context carrying draft getters | Persisting is more robust across reloads but expands scope (draft lifecycle changes); the context bridge is the shortest diff. Planner may choose; context bridge is the recommendation. |

**Installation:**
```bash
# none — no new dependencies in Phase 27
```

## Package Legitimacy Audit

> Run because the diff-utility alternative touches the npm registry. No install is recommended.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `diff` (jsdiff) | npm | unknown (seam lookup failed) | unknown (seam lookup failed) | none returned | [SUS] | Not used — hand-rolled LCS util instead. If the planner prefers jsdiff, add a `checkpoint:human-verify` task before install and re-run the legitimacy check on a network-capable machine. |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** `diff` — only relevant if the alternative is chosen; recommended path installs nothing.

*The seam verdict (`unknown-age`, `unknown-downloads`, `no-repository`) reflects a failed metadata lookup in this sandbox, not evidence against jsdiff — but per the absent-evidence rule it cannot earn a clean verdict here.*

## Architecture Patterns

### System Architecture Diagram

```
 User types "thêm mục X vào solution"
        │
        ▼
 StepChatPanel.sendMessage ── looksLikeArtifactRequest?
        │ (patch-intent → proceed as qa turn with artifact tools advertised)
        ▼
 useChatTurn.start ──► createChatTurnRuntime ──► runAiOrchestratorLoop
        │                                              │
        │                              model emits tool_calls (get_artifact,
        │                              patch_artifact_section × N)
        │                                              │
        │                                    for each call (in order):
        │                              isMutationTool? ──► onMutationCheck
        │                                              │
        │                        describeToolMutationWithContext(patch args)
        │                              │ reads: per-scope tool context
        │                              │         (projectId/crId/stepId/kind,
        │                              │          draft getters from ProjectSdlcView)
        │                              │ reads: db.settings[workflowStorageKey]   (committed state)
        │                              │ reads: db.settings[draftSettingKey]      (SOLUTION draft)
        │                              │ computes: section slice + LCS unified diff
        │                              │ guards: readOnly / prerequisite / D-09 cap
        │                              ▼
        │              publish('awaiting-approval') + onAwaitingApproval(patch payload)
        │                              │
        ▼                              ▼
 AiChatWidget renders ArtifactDiffApprovalCard (diff verbatim, +N/−N, buttons)
        │
   Approve │ Reject
        ▼  │
 StepChatPanel approve interception:
   stale check (current draft hash vs card baseHash) ──► stale? disable + warning
   apply cached patched Markdown via onArtifactDraft / onSolutionExtracted
   turn.resolveApproval(true|false)
        │                              │
        │              loop proceeds → tool executes → returns structured result
        │              (model sees approval outcome; synthesis continues)
        ▼
 Draft updated in editor (Step2SolutionView via incomingDraft / Step5 via draft props)
 Staleness marker shown (Q1 mechanism) — NO version commit anywhere
```

### Recommended Project Structure
```
src/
├── services/ai/
│   ├── aiTools.ts                  # + tool defs, executeAiTool cases, describe case, MUTATION_TOOLS
│   └── sdlcArtifactTools.ts        # NEW: tool execution, guards, section targeting, result shapes
├── utils/
│   ├── markdownSections.ts         # NEW: heading → dotted-ID section index (D-05)
│   └── lineDiff.ts                 # NEW: LCS line diff → unified-diff text (discretion)
├── components/ai/
│   ├── AiChatWidget.tsx            # + ArtifactDiffApprovalCard mount (pendingApproval snapshot)
│   ├── runtime/chatTurnRuntime.ts  # + ChatTurnApprovalInfo.patch payload
│   └── widget/ArtifactDiffApprovalCard.tsx  # NEW (UI-SPEC §1)
├── components/sdlc/chat/
│   └── StepChatPanel.tsx           # + scope context, approve interception, refusal alerts, intent routing
└── views/
    └── ProjectSdlcView.tsx         # + draft getters down-pass, apply handlers, staleness marker
```

### Pattern 1: Pre-execution mutation approval with describe-time computation
**What:** Mutation tools are intercepted *before* execution; an async `describeToolMutationWithContext` produces the human-readable summary; approve lets the loop dispatch the real tool; reject injects a cancellation result as the tool message.
**When to use:** Every Phase 27 patch card. Compute the diff inside the describe case, cache the full payload (diff text, sectionId, baseHash, patchedMarkdown) on the pending-approval info, and have the post-approve tool execution return the structured result the model needs.
**Evidence:** `onMutationCheck` runs before dispatch [VERIFIED: src/services/ai/aiOrchestratorLoop.ts:355-376]; describe is async with db access [VERIFIED: src/services/ai/aiTools.ts:5031]; approval parks via `publish('awaiting-approval')` and a single boolean resolver [VERIFIED: src/components/ai/runtime/chatTurnRuntime.ts:315-335].

### Pattern 2: Per-scope tool context bridge
**What:** A module-level registry (`setArtifactToolContext(scopeKey, ctx)` / `clearArtifactToolContext(scopeKey)`) that `StepChatPanel` populates at send time with `{ projectId, crId, stepId, readOnly, getDraft(kind), listSections? }`, and `executeAiTool`/describe consult when handling artifact tools. Cleared on turn completion/abort and scope change (the panel already resets per-scope refs on unmount [VERIFIED: src/components/sdlc/chat/StepChatPanel.tsx:161-168]).
**When to use:** Because `executeToolFn` is hardwired in the runtime [VERIFIED: src/components/ai/runtime/chatTurnRuntime.ts:265-270] and tool args from the model cannot be trusted to carry UUIDs.
**Why safe:** Exactly one turn per scope is enforced at send [VERIFIED: src/components/sdlc/chat/StepChatPanel.tsx:214] (`preludeTokenRef` + `turn.runtime?.isRunning()` + `awaiting-approval` guard), so the context cannot interleave.

### Pattern 3: Structured refusals (D-10)
**What:** Every guard (read-only version, missing prerequisite, oversized patch, section drift) returns a JSON tool result `{ refused: true, code: string, message: string, ... }` with Vietnamese actionable copy; the host parses `code` from the tool event result and renders an `Alert type="warning" showIcon` at the tool's transcript position (UI-SPEC §3), never a thrown error or raw JSON.
**Evidence:** Existing prerequisite copy is centralized in `formatGuardMessage` [VERIFIED: src/services/wizard/workflowGuards.ts:44-48]; the missing-prerequisite alert with `Chuyển đến Bước {N}` action already exists in the statusExtensions pattern [VERIFIED: src/components/sdlc/chat/StepChatPanel.tsx:443-449].

### Anti-Patterns to Avoid
- **Auto-merging stale diffs:** D-03/D-08 forbid it. Stale = disabled approve + warning, always.
- **Writing the editor from the tool:** The tool never touches editor state; only the host approve handler writes via `onArtifactDraft`/`onSolutionExtracted` (UI-SPEC §5: "the editor never receives patch text directly from the tool").
- **`dangerouslySetInnerHTML` on diff text:** Model-produced diff lines must render as text nodes (like `DiffHunkView`), never as HTML — prompt-injection/XSS boundary.
- **Fuzzy heading matching:** D-06 forbids auto-merge into renamed sections; drift = structured error + current index.
- **Naming tools with `_ide`/`_cc`/`_tool` suffixes or `proxy_`/`tool_` prefixes:** `normalizeToolName` strips these [VERIFIED: src/services/ai/aiTools.ts:4798-4804].

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Approval parking / turn serialization | Custom pending-card queue in the widget | Existing `onMutationCheck` + `awaiting-approval` + single `approvalResolver` | Already handles one-decision-at-a-time, abort-during-park (`resolveApproval(false)` on abort [VERIFIED: src/components/ai/runtime/chatTurnRuntime.ts:186-191]), analysis-mode refusal, auto-approve |
| Staleness detection rules | New staleness engine | `detectWorkflowStaleness` (banner already consumes it [VERIFIED: src/components/sdlc/common/SdlcStaleBanner.tsx:30-32]) | Hash-based rules are the existing contract; only a draft-divergence supplement is needed (Q1) |
| Diff line rendering/colors | New palette | `DiffHunkView` palette values + `parseGitDiff` if structured hunks are wanted | UI-SPEC mandates the reuse |
| Prerequisite guard copy | New message strings | `formatGuardMessage` + `WORKFLOW_GUARD_MESSAGES` | Single source of truth for guard copy |
| Draft persistence (SOLUTION) | New storage key | `draftSettingKey(projectId, crId)` in `db.settings` | Already the SOLUTION draft store, loaded on view mount [VERIFIED: src/views/ProjectSdlcView.tsx:250-269] |
| Version commit | Anything calling `commitRevision`/`commitSolution` on approve | — | SDLC-ART-04 forbids commits from approve; those paths stay user-explicit only |

**Key insight:** The phase is mostly *wiring* — the risk is not in any single algorithm but in the describe-time vs execute-time split (Pitfall 1) and the ephemeral PL03B/PL07/CAB drafts (Pitfall 2). Get those two right and the rest follows existing patterns.

## Common Pitfalls

### Pitfall 1: Mutation check runs BEFORE tool execution
**What goes wrong:** Implementing the diff computation inside the tool body and expecting the approval card to show it — the card is rendered from the *describe* step, which runs before the tool ever executes [VERIFIED: src/services/ai/aiOrchestratorLoop.ts:355-376].
**Why it happens:** The existing mutation flow confirms intent pre-execution; the artifact flow needs a *computed artifact* at confirm time.
**How to avoid:** Compute section slice + diff in the `describeToolMutationWithContext` case; cache the payload; post-approve execution returns the cached/verified result. If the draft changed between describe and execute (impossible while parked — composer disabled — but possible after reject of an earlier card in the same batch), the stale check at resolve time (D-08) covers it.
**Warning signs:** Card renders "no diff" or the approve path recomputes a different diff than shown.

### Pitfall 2: PL03B/PL07/CAB drafts are ephemeral React state
**What goes wrong:** `get_artifact` reads `db.settings` and finds no PL03B draft (only the last committed artifact content) while the editor shows an unsaved draft — the model patches against the wrong base.
**Why it happens:** Only the SOLUTION draft is persisted (`draftSettingKey`); PL03B/PL07/CAB drafts live in `useState` in `ProjectSdlcView` [VERIFIED: src/views/ProjectSdlcView.tsx:74, 471-479].
**How to avoid:** The per-scope tool context carries `getDraft(kind)` closures from `ProjectSdlcView` (down-pass via `SdlcWorkspace` → `StepChatPanel`), falling back to committed `artifacts[kind].content` when no draft exists. Alternatively persist these drafts like SOLUTION (larger diff, more robust).
**Warning signs:** Patch diffs that revert user's unsaved editor edits.

### Pitfall 3: Analysis Mode (default ON) hides the patch tool
**What goes wrong:** `useStepChatToolbox` defaults `analysisMode` to `true` [VERIFIED: src/components/sdlc/chat/useStepChatToolbox.ts:35], and `getToolsForTurn` filters mutation tools out of the payload in analysis mode [VERIFIED: src/services/ai/chatTurnTools.ts:14-31]. With `patch_artifact_section` in `MUTATION_TOOLS`, the model never sees it in a default step chat.
**Why it happens:** Analysis mode is a deliberate read-only default for step chats.
**How to avoid (RESOLVED Q2):** Keep mutation classification and existing structured `ANALYSIS_MODE_CANCELLATION` [VERIFIED: src/components/ai/runtime/chatTurnRuntime.ts:126-129, 317-320]. Analysis Mode ON filters patch_artifact_section from payload; unsolicited patch calls are cancelled. Prompt/refusal copy tells the user to disable Analysis Mode for edits. User authorized this choice; do not exempt the patch tool or request confirmation again. `get_artifact` remains read-only.
**Warning signs:** "Tool not found in payload" behavior; model apologizing it cannot edit.

### Pitfall 4: Draft-only edit does not trip the existing staleness detector
**What goes wrong:** SDLC-ART-04 expects "marks the step stale", but `detectWorkflowStaleness` only compares *committed* artifact hashes in `sourceHashes` [VERIFIED: src/services/wizard/stalenessDetector.ts:19-97]; a draft edit changes no committed hash, so no step goes stale and the banner never shows.
**How to avoid (RESOLVED Q1):** Compute a pure draft-hash divergence report beside detectWorkflowStaleness and merge it into the existing stale banner. Preserve all committed workflow state; do not add a coordinator write hook or assume draft-only changes trigger committed-hash detection.
**Warning signs:** Approve works but no stale indication anywhere; requirement 4 of the phase success criteria fails UAT.

### Pitfall 5: `#` inside code fences counted as a heading
**What goes wrong:** Section index (D-05) splits on `/^#{1,6} /` and a fenced `# comment` inside a code block corrupts section boundaries and IDs.
**How to avoid:** Fence-aware scanning — the codebase already models fence state in `sdlcSolutionParser` [VERIFIED: src/utils/sdlcSolutionParser.ts:8-27]. Mirror that pattern in `markdownSections.ts`; unit-test fenced content.
**Warning signs:** Section IDs shift after an edit inside a code block; drift errors on unchanged sections (violates D-05 stability).

### Pitfall 6: Diff base normalization vs hash normalization
**What goes wrong:** The patch diff is computed against draft text but staleness/staleness-check hashes are computed with `hashText(markdown.trim())` [VERIFIED: src/services/wizard/workflowCoordinator.ts:39-45]; a trailing-newline mismatch makes a visually identical draft hash-differ and a fresh card goes stale immediately (D-03 false positive).
**How to avoid:** Normalize identically everywhere: `.trim()` (or a single shared normalizer) before both diff-base capture and hash.
**Warning signs:** Card flagged stale the moment it opens.

### Pitfall 7: Oversized `get_artifact` output in the transcript path
**What goes wrong:** `get_artifact` returns full Markdown; `ToolEventBadge` expanded detail renders the raw result [VERIFIED: src/components/ai/AiChatWidget.tsx:180-210] — a 20k-token artifact floods the chat; also tool-output pruning keeps only 2 recent outputs intact (`keepRecentToolOutputs = 2`, `maxOldToolChars = 500` [VERIFIED: src/services/ai/aiOrchestratorLoop.ts:157-158]).
**How to avoid:** UI: cap badge detail display (UI-SPEC §4 — cap like other tools). Loop: acceptable as-is — the model needs the full artifact in the *recent* result, and D-06 already defines re-read after drift/pruning.
**Warning signs:** Chat lane stretching; model proposing patches against pruned-away content.

### Pitfall 8: Multiple patch calls in one model round
**What goes wrong:** Assuming parallel tool calls need a queue — they don't, but each card's baseHash must be its own call's base, not the latest.
**How to avoid:** The loop already serializes `toolCallsToRun` with awaited mutation checks [VERIFIED: src/services/ai/aiOrchestratorLoop.ts:343-376] — D-07 holds for free. Store `baseHash` per card at describe time; D-08 staleness = current draft hash ≠ that card's baseHash at resolve time.
**Warning signs:** Second card approving the wrong content after the first was approved.

## Code Examples

### Tool definition shape (registry pattern)
```typescript
// Source: src/services/ai/aiTools.ts:79-90 (AiToolDefinition, verbatim shape)
export interface AiToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  };
}
// Register `get_artifact` and `patch_artifact_section` in AI_DATABASE_TOOLS (line 92)
// and dispatch in executeAiTool's switch (line 2001+). Add 'patch_artifact_section'
// to MUTATION_TOOLS (line 4749). Leave 'get_artifact' out — it is read-only.
```

### Approval parking (existing flow to extend)
```typescript
// Source: src/components/ai/runtime/chatTurnRuntime.ts:315-335 (verbatim flow)
onMutationCheck: async (toolName, args) => {
  // Fixed guard order (T-25.3-21): read-only cancel, auto-approve, explicit wait.
  if (request.analysisMode) {
    cancellationResult = ANALYSIS_MODE_CANCELLATION;
    return { proceed: false, cancellationResult: ANALYSIS_MODE_CANCELLATION };
  }
  if (request.autoApprove) {
    return { proceed: true };
  }
  const summary = await deps.describeMutation(toolName, args, deps.db);
  if (!isCurrent(turnId, turnController)) return { proceed: false, cancellationResult: DECLINED_CANCELLATION };
  publish('awaiting-approval');
  deps.onAwaitingApproval?.({ toolName, summary });
  const approved = await new Promise<boolean>((resolve) => {
    approvalResolver = resolve;
  });
  // ...
}
// Extension: ChatTurnApprovalInfo gains an optional patch payload
// { kind, sectionId, sectionTitle, version, diffText, addedLines, removedLines,
//   baseHash, patchedMarkdown, refusal? } produced by the describe case.
```

### Approve interception in the host
```typescript
// Pattern: wrap the widget's resolve callback in StepChatPanel
// Source basis: src/components/ai/AiChatWidget.tsx:446-455 (card mount) and
// src/components/sdlc/chat/StepChatPanel.tsx:430 (onResolveApproval={turn.resolveApproval})
const handleResolveApproval = (approved: boolean) => {
  const pending = pendingPatchRef.current;          // set from onAwaitingApproval payload
  if (approved && pending && !isStale(pending)) {
    applyDraft(pending.kind, pending.patchedMarkdown); // existing handlers:
    //   SOLUTION → onSolutionExtracted path / saveDraft (ProjectSdlcView.tsx:439-446)
    //   PL03B/PL07/CAB → onArtifactDraft → setDraftPl03b etc. (ProjectSdlcView.tsx:471-479)
    recordDecision(pending, 'approved');               // runtime-state transcript record
  } else if (!approved) {
    recordDecision(pending, 'rejected');               // D-04: decision only
  }
  turn.resolveApproval(approved);
};
```

### Section index (D-05) sketch
```typescript
// New util; fence-aware like src/utils/sdlcSolutionParser.ts:8-27
export interface ArtifactSection { id: string; level: number; title: string; start: number; end: number; }
export function buildSectionIndex(markdown: string): ArtifactSection[] {
  // walk lines; toggle fence state on /^(```|~~~)/; match /^#{1,6}\s+(.*)$/
  // only outside fences; number hierarchically (h2→"1", h3 under it→"1.1", …)
}
```

### Diff stat (+N/−N) and cap (D-09)
```typescript
const added = diffLines.filter((l) => l.startsWith('+')).length;
const removed = diffLines.filter((l) => l.startsWith('-')).length;
if (added + removed > PATCH_LINE_CAP) {
  return { refused: true, code: 'PATCH_TOO_LARGE', added, removed, cap: PATCH_LINE_CAP,
    message: `Đề xuất quá lớn (${added + removed} dòng thay đổi, giới hạn ${PATCH_LINE_CAP}). Yêu cầu AI chia nhỏ thành nhiều chỉnh sửa theo từng mục.` };
}
// PATCH_LINE_CAP: discretion — propose 120 (a "small addition" is typically < 30 lines)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Full-document regeneration per artifact turn (25.3 D-18) | Bounded section patch + approval card | Phase 27 (this phase, per CONTEXT Specifics) | Chat edits become reviewable diffs; D-18 still governs explicit "soạn tài liệu" actions |
| `AiChatWidget` renders only `MutationApprovalCard` for approvals | Two distinct approval card components | This phase (UI-SPEC §1, §5) | Diff card is separate; MutationApprovalCard untouched |
| Tool policy = read-only tools only (Phase 26) | Artifact read/patch tools advertised per step | This phase | `SDLC_STEP_ALLOWED_TOOLS` gains artifact tools only for artifact-owning steps |

**Deprecated/outdated for this phase:** none — no API or library deprecations involved.

## Runtime State Inventory

No stored-name changes or new persisted schema. Pending patch cards, diff bodies, and proposal state live only in scoped host runtime state. Explicit approve/reject decisions are durable metadata-only transcript rows using existing ChatMessage shape; they survive completed turns and remount and are excluded from LLM history. Existing draft persistence stays unchanged except atomic SOLUTION draft-plus-decision application. This supersedes the earlier runtime-only decision recommendation.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `diff` (jsdiff) is the well-known package but is unverified in this environment (seam lookup failed); recommended path avoids it entirely | Standard Stack / Package Audit | If planner chooses jsdiff and it installs fine, no harm — but the checkpoint must run first |
| A2 — RESOLVED | Pending proposals remain runtime-only; approve/reject decisions are durable metadata-only transcript rows, not pending state | Architecture / SDLC-ART-03 | Earlier runtime-only decision recommendation is superseded. Existing ChatMessage system rows retain decisions through completed turns and remount; filter these records from LLM history and ordinary assistant rendering. No pending diff bodies persist. |
| A3 | `PATCH_LINE_CAP = 120` is "well inside" for a small addition | Code Examples / D-09 | Purely discretionary; too low frustrates legitimate section rewrites |
| A4 | Model-under-test reliably emits `get_artifact` then `patch_artifact_section` for add-requests given the tool-policy + few-shot layers (SDLC-ART-05) | Intent routing | If routing is unreliable, the 27-04 regression test needs a scripted-model harness rather than a live-model assertion — plan the test as scripted tool calls, not live model behavior |
| A5 | Extending `ChatTurnApprovalInfo` / `AiChatTurnSnapshot.pendingApproval` with an optional patch payload is a compatible, additive change to both hosts (drawer host ignores it) | Architecture Patterns | If the drawer host type-checks against the exact shape, additive optional fields are safe; verify with `tests/ai/AIChatDrawer.test.tsx` |

## Open Questions — RESOLVED

User authorized the chosen defaults; no further confirmation required. No unresolved questions remain.

1. **RESOLVED — Draft-only staleness (SDLC-ART-04).** Add a pure draft-hash divergence check beside `detectWorkflowStaleness`, returning its report shape and merged into the existing banner. Hash with `defaultSha256(markdown.trim())`, matching coordinator call-site normalization. Mark the owning step without changing workflow state, committed content/hash, versions, sourceHashes, or approvedAt. Do not call commitRevision/commitSolution to create a stale signal. Planned in 27-03.

2. **RESOLVED — Analysis Mode and patch availability.** Keep `patch_artifact_section` classified as mutation. Analysis Mode ON filters it from the payload; unsolicited calls retain the existing structured read-only cancellation. Prompt/refusal copy explains that the user must disable Analysis Mode to request edits. Do not exempt artifact patches from the guard. Planned in 27-01 runtime guard, 27-04 payload-aware policy, and 27-05 payload filtering tests.

3. **RESOLVED — Pending proposals versus decisions (corrects A2).** Pending proposals, diff bodies, and per-card runtime state remain runtime-only and are never persisted. Explicit approve/reject decisions MUST be durable transcript records that survive completed turns, re-render, and remount. Use existing ChatMessage system rows with stable decision identity and metadata-only content; exclude them from assistant output and LLM history. SOLUTION draft and approved decision are written atomically; reject records only its decision. No new persisted schema or pending-body storage. Planned in 27-02 and 27-03.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | vitest runtime | ✓ | 26.13.0 | — (CLAUDE.md targets Node 24 LTS but vitest peer range allows `>=26.0.0`; observed working) |
| Vitest | all tests | ✓ | 5.0.2 | — |
| jsdom (vitest env) | component tests | ✓ | 29.1.1 (`vite.config.ts:74 environment: 'jsdom'`) | — |
| npm registry access | only if jsdiff alternative chosen | ✗ (seam lookup failed this session) | — | Hand-rolled diff util (recommended — no install needed) |

**Missing dependencies with no fallback:** none
**Missing dependencies with fallback:** npm registry lookups (affects only the jsdiff alternative; recommended path needs nothing).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.2 + @testing-library/react, jsdom environment |
| Config file | `vite.config.ts` (line 74: `environment: 'jsdom'`) |
| Quick run command | `npx vitest run <file>` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SDLC-ART-01 | `get_artifact` returns kind/version/approval/full Markdown/section index | unit (service) | `npx vitest run tests/services/ai/sdlcArtifactTools.test.ts` | ❌ Wave 0 |
| SDLC-ART-01/05 | Section index: dotted IDs, stable across unrelated edits, fence-safe | unit (util) | `npx vitest run tests/utils/markdownSections.test.ts` | ❌ Wave 0 |
| SDLC-ART-02 | Patch returns unified diff + resulting Markdown; no editor write; D-09 cap refusal; D-06 drift error | unit (util + service) | `npx vitest run tests/utils/lineDiff.test.ts tests/services/ai/sdlcArtifactTools.test.ts` | ❌ Wave 0 |
| SDLC-ART-03 | Card renders per patch result; buttons; decision record survives re-render | component | `npx vitest run tests/ai/AiChatWidget.test.tsx` (extend) + new `tests/ai/ArtifactDiffApprovalCard.test.tsx` | ❌ Wave 0 (new card test) |
| SDLC-ART-04 | Approve writes draft via existing handlers; never commits; no "saved/approved" copy | component/host | `npx vitest run tests/unit/sdlc/StepChatPanelArtifactQueue.test.tsx tests/unit/sdlc/ProjectSdlcView.test.tsx` (extend) | ✅ (extend) |
| SDLC-ART-05 | Add-request routes to get+patch; bounded diff regression (scripted tool calls) | unit/integration | `npx vitest run tests/ai/sdlcPromptComposer.test.ts tests/services/ai/aiOrchestratorLoop.test.ts` (extend) | ✅ (extend) |
| SDLC-ART-06 | Refusals: preview/historical, missing prerequisite, analysis mode | unit + component | `npx vitest run tests/services/ai/sdlcArtifactTools.test.ts tests/unit/sdlc/StepChatPanelArtifactQueue.test.tsx` | ❌/✅ mixed |
| — | Runtime parking, decline, abort during park | runtime | `npx vitest run tests/ai/chatTurnRuntime.test.ts` (extend) | ✅ (extend) |
| — | Multiple cards one-at-a-time, stale-after-reject (D-07/D-08) | component/host | `npx vitest run tests/unit/sdlc/StepChatPanelArtifactQueue.test.tsx` (extend) | ✅ (extend) |

### Sampling Rate
- **Per task commit:** `npx vitest run <touched test files>` (each under ~30s per prior-phase experience)
- **Per wave merge:** the relevant prior-phase suite cluster (e.g., widget + runtime + panel suites together)
- **Phase gate:** full `npx vitest run` green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/services/ai/sdlcArtifactTools.ts` + `tests/services/ai/sdlcArtifactTools.test.ts` — tool execution, guards, result shapes (SDLC-ART-01/02/06)
- [ ] `src/utils/markdownSections.ts` + `tests/utils/markdownSections.test.ts` — section index (D-05, Pitfall 5)
- [ ] `src/utils/lineDiff.ts` + `tests/utils/lineDiff.test.ts` — LCS diff generation, stability, cap counting (SDLC-ART-02, D-09)
- [ ] `tests/ai/ArtifactDiffApprovalCard.test.tsx` — card rendering contract (UI-27-01..10)
- Existing suites to extend (no new files): `tests/ai/chatTurnRuntime.test.ts`, `tests/ai/AiChatWidget.test.tsx`, `tests/ai/sdlcPromptComposer.test.ts`, `tests/services/ai/aiOrchestratorLoop.test.ts`, `tests/unit/sdlc/StepChatPanelArtifactQueue.test.tsx`, `tests/unit/sdlc/ProjectSdlcView.test.tsx`

## Security Domain

### Applicable ASVS Categories (Level 1, per config `security_asvs_level: 1`)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Local single-user app; no auth surface in this phase |
| V3 Session Management | no | No sessions involved |
| V4 Access Control | yes | Read-only guards: preview/historical refusal, active-CR check, prerequisite markers (D-10, SDLC-ART-06); analysis-mode read-only cancellation preserved |
| V5 Input Validation | yes | Zod-validate tool args at the tool boundary; validate section IDs against the derived index (no fuzzy match, D-06); D-09 line cap bounds model-controlled text volume |
| V6 Cryptography | no | Hash-only (existing SHA-256 `hashText`); no new crypto |
| V14/HTML injection | yes | Diff lines rendered as React text nodes (DiffHunkView pattern) — never `dangerouslySetInnerHTML` on model-produced diff text |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt injection via artifact/diff text instructing silent edits | Tampering / Elevation | `SHARED_EVIDENCE_POLICY` item 2 already frames document/diff text as untrusted data [VERIFIED: src/services/ai/sdlcPromptComposer.ts:12]; every change still requires explicit user approval on a card showing the verbatim diff — approval is the trust boundary |
| Model claims "document approved/saved" | Repudiation | Locked copy rules: approve copy is "bản nháp … đã được cập nhật" only (UI-SPEC hard copy rules; policy item 5) |
| Oversized tool output exhausting context/UI | DoS | D-09 line cap on patches; badge detail display cap; existing loop pruning bounds history growth |
| XSS via diff content | Tampering | Text-node rendering (above); no markdown/HTML rendering of diff lines |

## Sources

### Primary (HIGH confidence — in-repo files read this session)
- `src/services/ai/aiOrchestratorLoop.ts` — dispatch, mutation-check position (355-376), serialized tool loop (343-441), pruning defaults (157-158)
- `src/components/ai/runtime/chatTurnRuntime.ts` — statuses (13-25), approval flow (315-335), decline/abort handling (150-191), hardwired `executeToolFn` (265-270)
- `src/services/ai/aiTools.ts` — `AiToolDefinition` (79-90), registry (92+), `executeAiTool` (2001+), `MUTATION_TOOLS` (4749-4792), `normalizeToolName` (4798-4804), `isMutationTool` (4806-4814), `describeToolMutationWithContext` (5031+)
- `src/components/sdlc/chat/StepChatPanel.tsx` — full file: draft extraction (184-206), send guard (214), intent routing (338-347), prerequisites (77-81, 319-324), statusExtensions alerts (434-467)
- `src/components/ai/AiChatWidget.tsx` — full file: approval card mount (446-455), `awaiting-approval` handling (278, 511), tool badge detail (180-210)
- `src/components/ai/widget/MutationApprovalCard.tsx` — full file (card DNA to extend)
- `src/services/wizard/workflowSchemas.ts` — full file: kinds (28-38), `SdlcArtifactRef` (40-51), versions (128-129)
- `src/services/wizard/workflowCoordinator.ts` — `workflowStorageKey` (34), `hashText` (39-45), emit+staleness (53-58), `previewRevision`/`commitRevision` (143-163), public API (449-467)
- `src/services/wizard/stalenessDetector.ts` — full file (hash-chain rules)
- `src/services/wizard/workflowGuards.ts` — guard copy (30-48)
- `src/views/ProjectSdlcView.tsx` — drafts (74, 250-269, 439-479), artifactEvents/readOnly (93-133), viewedVersion pinning, coordinator wiring (283-306), panel props (756-774)
- `src/components/sdlc/chat/useStepChatToolbox.ts` — full file (analysisMode default line 35; toolsForTurn 87-97)
- `src/services/ai/chatTurnTools.ts` — full file (analysis/allowlist filtering)
- `src/services/ai/sdlcPromptComposer.ts` — full file (policy layers, allowlists 59-100, artifact kinds 111-138, composition 263-358)
- `src/utils/gitDiffParser.ts` — parse side (1-120+); `src/components/agents/DiffHunkView.tsx` — diff palette (24-27)
- `src/components/sdlc/common/SdlcStaleBanner.tsx` — staleness consumption (30-41)
- `src/components/sdlc/steps/Step2SolutionView.tsx` — draft sync/approve-save flow (94-155)
- `src/types/models.ts` — `ChatRole` (258), `ChatMessage`/`ChatArtifactEvent` (276-303)
- Planning docs: `27-CONTEXT.md`, `27-UI-SPEC.md`, `.planning/REQUIREMENTS.md` (SDLC-ART-01..06), `.planning/ROADMAP.md` § Phase 27 (503-553), Phase 26/25.3 CONTEXT decisions

### Secondary (MEDIUM confidence)
- `npm view diff` → 9.0.0 (registry reachable; legitimacy seam metadata lookup failed in sandbox)

### Tertiary (LOW confidence)
- none

## Metadata

**Confidence breakdown:**
- Standard stack / no-new-deps: HIGH — every seam verified by direct file read; diff generation is a new pure util
- Architecture (describe-time approval + scope bridge): HIGH for mechanics (verified code paths); the *choice* of bridge is a recommendation, flagged for planner
- Pitfalls: HIGH — each is grounded in a specific verified code constraint
- ART-04 staleness mechanism: HIGH for selected contract — user authorized pure read-only draft divergence (resolved Q1); implementation remains subject to owning-step banner and unchanged-workflow tests.

**Research date:** 2026-11-04
**Valid until:** 2026-12-04 (stable — internal code seams; re-verify if `chatTurnRuntime.ts`/`aiTools.ts` are refactored before planning)
