# Phase 26: SDLC Prompt Grounding & Tool-Use Policy - Research

**Researched:** 2026-11-03  
**Status:** resolved for planning  
**Confidence:** HIGH

## Scope and fixed decisions

Phase 26 uses existing React/TypeScript/Vitest/Ant Design code. No package additions. It keeps `ProjectSdlcView` as grounding host, `sdlcPromptComposer.ts` as pure prompt composer, `StepChatPanel` as intent host, `runAiOrchestratorLoop` as the only loop engine, `chatTurnRuntime` as status/persistence gate, and `AiChatWidget` as display surface.

Locked decisions from `26-CONTEXT.md`:

- D-01–D-04: per-step minimum source sets, non-empty labeled grounding, delimiter ownership by composer, bounded retrieval/status.
- D-05–D-08: per-step tool policy, truthful payload alignment, no memory answer when tools can resolve, narrower re-query then abstention, two exemplars per step.
- D-09–D-12: explicit artifact intent, separate TECH_DOCS targets, ambiguous request clarification, pre-model prerequisite refusal.
- D-13–D-16: explicit high loop ceiling, no final pending batch dispatch, retained tool activity, runtime-only partial/limit/error output.

## Resolved implementation questions

### 1. Grounding builder location

**Decision:** Use separate pure module `src/services/sdlc/groundingBuilder.ts`.

Reason: source mapping, labeled serialization, missing-source handling, and four budget clamps exceed a small inline expression and need isolated unit tests. `ProjectSdlcView` remains owner of orchestration and passes in-memory workflow state plus bounded `WizardEvidence`; builder performs no DB/network access.

Analogs: `src/services/wizard/sdlcWizardRuntime.ts` for retrieval budgets and `src/services/ai/contextGrounding.ts` for labeled serialization/clamping. Test analog: `tests/ai/contextGrounding.test.ts`.

### 2. Grounding markers and source mapping

`SdlcGroundingMarker` includes `CR_METADATA`, `PL01`, `PL02`, `SOLUTION`, `CHANGE_PACK`, `ACCEPTANCE_CONTEXT`, `IMPLEMENTATION_EVIDENCE`, `TECH_DOCS`, `PL03B`, and `PL07`.

`SDLC_STEP_GROUNDING_SOURCES` is explicit:

- INTAKE: `CR_METADATA`, `PL01`, `PL02`.
- SOLUTION: `CR_METADATA`, `PL01`, `PL02`, `SOLUTION`.
- CODE_GUIDE: `CR_METADATA`, `SOLUTION`, `PL02`, `ACCEPTANCE_CONTEXT`.
- CHANGE_PACK: `CR_METADATA`, `SOLUTION`, `CHANGE_PACK`, `IMPLEMENTATION_EVIDENCE`.
- TECH_DOCS: `CR_METADATA`, `CHANGE_PACK`, `IMPLEMENTATION_EVIDENCE`, `TECH_DOCS`, `PL03B`, `PL07`.
- CAB: `CR_METADATA`, `TECH_DOCS`, `IMPLEMENTATION_EVIDENCE`, `PL03B`, `PL07`.

Source rules are deterministic and visible in the plan:

- `ACCEPTANCE_CONTEXT` is a bounded projection of `workflowState.artifacts.pl02` content, labeled as acceptance context; missing PL02 yields an explicit missing marker.
- `TECH_DOCS` is bounded concatenation of present prior technical artifact refs `codeGuide`, `pl03b`, and `pl07`; no new repository query occurs. Missing prior docs yields an explicit missing marker.
- `IMPLEMENTATION_EVIDENCE` is bounded content from `artifacts.changePack` plus serialized `artifacts.driftResult` when present; missing both yields an explicit missing marker.
- `PL03B` and `PL07` remain individual artifact sections so TECH_DOCS/CAB provenance is not collapsed.
- `CR_METADATA` always renders first. `[EVIDENCE_STATUS]` always renders last.

This resolves D-01 while keeping all acceptance context, prior technical documents, and implementation evidence traceable by marker.

### 3. Terminal round source

**Decision:** `src/services/ai/aiOrchestratorLoop.ts` exports `DEFAULT_MAX_TOOL_ROUNDS = 50`. The engine normalizes `maxLoops` to a positive integer and returns `loopLimitReached`. `chatTurnRuntime.ts` computes the effective per-request ceiling from `maxToolRounds ?? DEFAULT_MAX_TOOL_ROUNDS`, passes that value to the engine, stores it as `toolLimitRounds`, and uses it for terminal copy `{N}`. The widget never invents N.

At the ceiling, the engine sets `loopLimitReached` before dispatching the pending batch, skips synthesis, and returns. Runtime publishes `'tool-limit'`, skips assistant persistence and completion callbacks, while retaining already emitted tool events. Tests cover default 50, override, no dispatch, no synthesis, no persistence, and visible round count.

### 4. Ambiguous artifact detector

**Decision:** Detection lives only in `StepChatPanel` host, never in the pure composer. It is Unicode-safe:

1. Normalize input with `text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('vi-VN')`.
2. Match action words using Unicode letter/number boundaries, not JavaScript `\b`: `(?:^|[^\p{L}\p{N}])(?:tao|soan|sinh|viet|cap\s+nhat|sua)(?=$|[^\p{L}\p{N}])`.
3. Match artifact terms with the same boundaries: `tai\s+lieu`, `solution`, `pl03b`, `pl07`, `cab`.
4. If both match, show clarification and make zero model calls. Exact target terms may narrow the displayed buttons only when that target is valid for the current step; no detector result silently starts an artifact turn.

Tests include precomposed Vietnamese (`TẠO TÀI LIỆU`), decomposed Unicode (`Tạo tài liệu`), punctuation/hyphen variants, uppercase ASCII artifact IDs, and ordinary Q&A false positives. This resolves D-11 without artifact-kind inference in the composer.

### 5. Dynamic read-only MCP policy/payload alignment

**Decision:** Static tool names and runtime dynamic names share one explicit set per composed turn. `SDLC_STEP_ALLOWED_TOOLS` remains the static per-step local set. `composeSdlcTurn` accepts `dynamicReadOnlyToolNames?: readonly string[]`; `buildToolPolicy` renders the de-duplicated union of the step static set and this explicit dynamic set. The static exported policy is labeled as the static baseline and never claims that dynamic MCP names are present when no dynamic set was supplied.

`useStepChatToolbox` derives dynamic read-only names from the same `dynamicMcpTools` array used to build the payload. It passes the combined normalized allowlist to `getToolsForTurn`; read-only dynamic tools not in that explicit set are removed, mutation dynamic tools remain removed in Analysis Mode. `StepChatPanel` passes the names from that exact computed payload into `composeSdlcTurn`, so policy names and actual payload are the same source, not two handwritten lists.

Tests prove:

- static policy contains only static names when dynamic set is empty;
- composed policy contains every supplied dynamic read-only name;
- payload contains every rendered name and no unrendered allowlisted dynamic name;
- dynamic mutation tools never survive Analysis Mode;
- old two-argument `getToolsForTurn` behavior stays unchanged.

## Architecture and security

Trust boundaries: workflow/artifact text and retrieved evidence enter grounding; grounding enters one composer-owned data delimiter; model-selected tool names enter the runtime payload; loop results enter persistence.

Mitigations: fixed markers and delimiter containment, no secrets in builder inputs, per-step allowlist filtering, read-only MCP filtering, bounded evidence and tool rounds, sanitized terminal copy, retained audit events, and no assistant persistence for partial/limit/error outcomes. Phase 26 adds no package, so package legitimacy audit is empty by design.

## Validation references

- Grounding unit: `tests/services/sdlc/groundingBuilder.test.ts`.
- Production grounding: `tests/unit/sdlc/ProjectSdlcGrounding.test.tsx` and existing `tests/unit/sdlc/ProjectSdlcView.test.tsx`.
- Composer/payload: `tests/ai/sdlcPromptComposer.test.ts`, `tests/ai/sdlcPromptIsolation.test.ts`.
- Artifact host: `tests/unit/sdlc/StepChatPanelArtifactQueue.test.tsx`.
- Loop/runtime: `tests/services/ai/aiOrchestratorLoop.test.ts`, `tests/ai/chatTurnRuntime.test.ts`.
- Widget: `tests/ai/AiChatWidget.test.tsx`.

## Package Legitimacy Audit

Phase 26 adds no dependency. No install or registry checkpoint required.

| Package | Disposition |
|---|---|
| — | No package additions |

## Sources

- `.planning/phases/26-sdlc-prompt-grounding-tool-use-policy/26-CONTEXT.md` — D-01–D-16 and phase boundary.
- `.planning/phases/26-sdlc-prompt-grounding-tool-use-policy/26-PATTERNS.md` — analog paths and existing contracts.
- `.planning/ROADMAP.md` — Phase 26 goal, requirements, and four-wave order.
- `src/views/ProjectSdlcView.tsx` — production host seam.
- `src/services/ai/sdlcPromptComposer.ts` — layered composer and artifact contracts.
- `src/services/ai/chatTurnTools.ts` — single tool payload filter.
- `src/services/wizard/sdlcWizardRuntime.ts` — bounded retrieval analog.
- `src/services/ai/contextGrounding.ts` — serialization/clamp analog.
- `src/services/ai/aiOrchestratorLoop.ts` — loop boundary and synthesis seam.
- `src/components/ai/runtime/chatTurnRuntime.ts` — persistence gate/status seam.
- `src/components/ai/AiChatWidget.tsx` — retained tool activity surface.
