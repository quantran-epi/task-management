# Phase 26: SDLC Prompt Grounding & Tool-Use Policy - Pattern Map

**Mapped:** 2026-11-03
**Decision status:** resolved
**Files analyzed:** 11 (9 modified + 2 new candidates/tests), plus 6 test files
**Analogs found:** 11 / 11 (modified files are their own best analog; new files map to existing modules)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/views/ProjectSdlcView.tsx` (26-01) | view / host | request-response (async state → prop) | itself `src/views/ProjectSdlcView.tsx` + `src/services/wizard/sdlcWizardRuntime.ts` | exact (self) |
| `src/services/sdlc/groundingBuilder.ts` (26-01) | service | transform (pure) | `src/services/wizard/sdlcWizardRuntime.ts` (budget wiring) + `src/services/ai/contextGrounding.ts` (serialize+clamp) | role-match |
| `src/services/ai/sdlcPromptComposer.ts` (26-02) | service | transform (pure) | itself | exact (self) |
| `src/components/sdlc/chat/StepChatPanel.tsx` (26-02/26-03/26-04) | component / host adapter | request-response | itself + `src/components/ai/AIChatDrawer.tsx` (tool payload parity) | exact (self) |
| `src/components/sdlc/SdlcWorkspace.tsx` (26-03) | component | pass-through | itself | exact (self, contract unchanged) |
| `src/services/ai/aiOrchestratorLoop.ts` (26-04) | service | streaming / event-driven | itself | exact (self) |
| `src/components/ai/runtime/chatTurnRuntime.ts` (26-04) | runtime adapter | event-driven | itself | exact (self) |
| `src/components/ai/runtime/useChatTurn.ts` (26-04) | hook | transform | itself | exact (self) |
| `src/components/ai/AiChatWidget.tsx` (26-04) | component | presentational | itself | exact (self) |
| `src/services/ai/chatTurnTools.ts` (26-02) | utility | filter | itself + `tests/ai/sdlcPromptIsolation.test.ts` | exact (self) |
| `tests/services/sdlc/groundingBuilder.test.ts` (new) | test | unit | `tests/ai/contextGrounding.test.ts` | role-match |
| `tests/unit/sdlc/ProjectSdlcGrounding.test.tsx` (new) | test | integration | `tests/unit/sdlc/ProjectSdlcView.test.tsx` | role-match |
| `tests/unit/sdlc/StepChatPanelToolPolicy.test.tsx` (new) | test | host integration | `tests/unit/sdlc/StepChatPanelArtifactQueue.test.tsx` + `tests/ai/sdlcPromptIsolation.test.ts` | role-match |
| `tests/ai/AIChatDrawer.test.tsx` (extended) | test | component | `tests/ai/AIChatDrawerTabs.test.tsx` + `tests/ai/AIChatDrawerRetry.test.tsx` | role-match |

## Pattern Assignments

### `src/views/ProjectSdlcView.tsx` — 26-01

**Analog:** itself. Already owns `workflowState`, `activeCrId`, `selectedStep`, `viewedVersion`, `crList`, `wizardRuntime`, `knowledgeConfig`.

Reuse state/derived-value pattern in `src/views/ProjectSdlcView.tsx` and bounded retrieval wiring pattern in `src/services/wizard/sdlcWizardRuntime.ts`. Use effect cleanup with `AbortController` and cancelled flag; never create a second retrieval runtime.

### `src/services/sdlc/groundingBuilder.ts` — 26-01

**Decision:** separate pure module. Logic owns marker mapping, derived source projections, missing labels, section budgets, total budget, and evidence status; isolated tests are required.

**Analogs:** `src/services/wizard/sdlcWizardRuntime.ts` for bounded retrieval and `src/services/ai/contextGrounding.ts` for serialize/clamp. Test analog: `tests/ai/contextGrounding.test.ts`.

**Target shape:** `GroundingSection = { marker: string; body: string | null }`; null renders `[MISSING: ...]`; `CR_METADATA` always exists; `[EVIDENCE_STATUS]` always final; builder never emits composer delimiters.

### `src/services/ai/sdlcPromptComposer.ts` — 26-02

**Analog:** itself. Use existing `ComposedSdlcTurn.segments`, table-of-record maps, `buildFewShot`, and one system message. Insert `toolPolicy` after `stepContract`, before `fewShot`.

Static names come from `SDLC_STEP_ALLOWED_TOOLS`. Dynamic read-only names come from the exact host catalog passed into both composer and payload filtering. Never hand-write a second dynamic policy list.

### `src/components/sdlc/chat/StepChatPanel.tsx` — 26-02/26-03/26-04

**Analogs:** itself and `src/components/ai/AIChatDrawer.tsx` for payload parity. Preserve scope/teardown pattern, `requestArtifactAnalysis()` compatibility, `useStepChatToolbox(db, stepId)`, and dynamic-name handoff.

Use `src/services/wizard/workflowGuards.ts` codes/formatter for pre-model refusal. Use Unicode normalization plus `\p{L}`/`\p{N}` boundaries for detector; never use JavaScript `\b` for Vietnamese text.

### `src/components/sdlc/SdlcWorkspace.tsx` — 26-03

**Analog:** itself. Preserve existing `stepGroundingContext` pass-through; add only `onNavigateToStep` and `readOnly` forwarding.

### `src/services/ai/aiOrchestratorLoop.ts` — 26-04

**Analog:** itself. At loop boundary, retain existing callbacks; set `loopLimitReached` before dispatch at ceiling; suppress synthesis. Use explicit `DEFAULT_MAX_TOOL_ROUNDS`.

### `src/components/ai/runtime/chatTurnRuntime.ts` — 26-04

**Analog:** itself. Extend existing persistence gate: limit/truncation/error remain runtime-only. Status callback owns terminal state; tool event host state stays intact.

### `src/components/ai/runtime/useChatTurn.ts` — 26-04

**Analog:** itself. Add explicit terminal stage mapping returning null so loader disappears.

### `src/components/ai/AiChatWidget.tsx` — 26-04

**Analog:** itself. Reuse header tag, merged tool-event, and inline alert slots. Keep terminal out of active stages. Keep all Phase 26 touch-point typography at 12px minimum.

### `src/services/ai/chatTurnTools.ts` — 26-02

**Analog:** itself plus `tests/ai/sdlcPromptIsolation.test.ts`. Keep one filter point. Optional allowlist preserves old two-argument behavior. Dynamic read-only tools require explicit host-supplied names and Analysis Mode filtering.

## Shared Patterns

### Prompt trust boundary
**Source:** `src/services/ai/sdlcPromptComposer.ts` and existing `tests/ai/sdlcPromptComposer.test.ts`.

Grounding builder emits no prompt delimiters; composer owns fixed open/close data block. Preserve policy-first ordering and injection containment tests.

### Guard/refusal
**Source:** `src/services/wizard/workflowGuards.ts` and `tests/unit/sdlc/StepChatPanelArtifactQueue.test.tsx`.

Use existing guard codes and `formatGuardMessage`; notices are UI-only and never transcript data.

### Complete-turn persistence
**Source:** `src/components/ai/runtime/chatTurnRuntime.ts` and `tests/ai/chatTurnRuntime.test.ts`.

Only validated complete assistant output reaches Dexie. Limit, partial, error, and abort remain runtime-only.

### Bounded retrieval
**Source:** `src/services/wizard/sdlcWizardRuntime.ts` and `src/services/ai/wizardService.ts`.

`collectEvidence` returns bounded items with coverage/degraded status. Builder renders marker, source status, and clamp status.

### Test contract preservation
**Sources:** `tests/ai/sdlcPromptComposer.test.ts`, `tests/ai/chatTurnRuntime.test.ts`, `tests/services/ai/aiOrchestratorLoop.test.ts`, `tests/ai/AiChatWidget.test.tsx`, `tests/ai/AIChatDrawer.test.tsx`, `tests/unit/sdlc/StepChatPanelArtifactQueue.test.tsx`, `tests/unit/sdlc/ProjectSdlcView.test.tsx`.

Extend assertions deliberately. Do not delete locked layer-order, lifecycle, SOLUTION compatibility, widget, or view assertions. Add host integration tests where utility-only tests cannot prove policy/payload parity.

## No Analog Found

None after resolved decisions. New builder, host parity, and drawer cases map to existing pure-transform, host-adapter, and drawer lifecycle tests above.

## Anti-Patterns to Avoid

- Hardcode `artifact: 'SOLUTION'`.
- Infer artifact kind in composer.
- Use static MCP policy text that claims dynamic tools exist when payload lacks them.
- Filter payload and render policy from separate handwritten lists.
- Use `\b` for Vietnamese detector.
- Synthesize/persist after loop limit.
- Clear tool events on terminal limit.
- Add a second AI engine or a second retrieval runtime.
- Add package dependencies.

## Metadata

**Analog search scope:** `src/views`, `src/components/sdlc`, `src/components/ai`, `src/services/ai`, `src/services/wizard`, `src/services/knowledge`, `tests/ai`, `tests/unit/sdlc`, `tests/services/ai`
**Pattern extraction date:** 2026-11-03
**Decision status:** resolved
