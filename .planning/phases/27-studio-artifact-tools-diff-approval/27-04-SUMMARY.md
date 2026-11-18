---
phase: 27-studio-artifact-tools-diff-approval
plan: "04"
subsystem: ai
tags: [sdlc, artifact-patch, intent-routing, tool-policy, few-shot, vitest]
requires:
  - phase: 27-studio-artifact-tools-diff-approval
    plan: "03"
    provides: production host patch adapter, draft staleness, live artifact context
  - phase: 27-studio-artifact-tools-diff-approval
    plan: "05"
    provides: studio-only artifact advertisement and validated refusal boundaries
provides:
  - Bounded patch intent detection for Vietnamese and English add/edit requests
  - Explicit target selection with a no-default TECH_DOCS clarification
  - Pure patch intent and policy built from the actual payload's tool names
  - Step-specific get-then-patch few-shots that never become evidence
  - No full-document extraction for patch or ordinary Q&A turns
affects: [phase-27-verification]
tech-stack:
  added: []
  patterns:
    - Intent detection before composition; the composer stays pure
    - Prompt policy derived from actual payload names, never from capabilities withheld by mode
    - Patch turns carry no full-document output contract
key-files:
  created:
    - tests/unit/sdlc/ArtifactPatchIntent.test.tsx
  modified:
    - src/components/sdlc/chat/StepChatPanel.tsx
    - src/components/sdlc/chat/useStepChatToolbox.ts
    - src/services/ai/sdlcPromptComposer.ts
    - tests/unit/sdlc/StepChatPanelArtifactQueue.test.tsx
    - tests/unit/sdlc/StepChatPanelToolPolicy.test.tsx
    - tests/ai/sdlcPromptComposer.test.ts
key-decisions:
  - "Generation verbs (soạn/tạo/sinh/viết) always win over bounded-edit verbs, so an explicit full-generation request keeps its complete-document contract."
  - "An ambiguous TECH_DOCS edit asks which document and retains the original text; clicking a target resubmits that same text as a patch turn."
  - "A bounded edit naming a document this step does not own is refused with navigation, never silently downgraded to Q&A or retargeted."
  - "Only an explicit full-generation turn may run final-text extraction; patch and Q&A answers cannot reach the editor."
requirements-completed: [SDLC-ART-05, SDLC-ART-01, SDLC-ART-02]
actuals:
  tokens: 17369
  tasks: 2
  commits: 3
plan_head_before: edc360edbece96a66e5707f56a1b71d0f333d2ff
plan_head_after: d2c908be56e2d8acd58cd36409139e64e33b4e7a
coverage:
  - id: D1
    description: "A small add-to-SOLUTION request runs real get_artifact then patch_artifact_section and shows a bounded +1/−0 card"
    requirement: SDLC-ART-05
    verification:
      - kind: integration
        ref: "tests/unit/sdlc/ArtifactPatchIntent.test.tsx#calls real get then patch, shows a +1/−0 card and changes the editor only after approve"
        status: pass
    human_judgment: false
  - id: D2
    description: "The editor changes only after explicit approval and a complete assistant document cannot bypass the card"
    requirement: SDLC-ART-05
    verification:
      - kind: integration
        ref: "tests/unit/sdlc/ArtifactPatchIntent.test.tsx#never lets a complete # SOLUTION assistant answer bypass patch approval"
        status: pass
    human_judgment: false
  - id: D3
    description: "Patch intent detection covers accented Vietnamese and English while full-generation requests keep their contract"
    requirement: SDLC-ART-05
    verification:
      - kind: unit
        ref: "tests/unit/sdlc/ArtifactPatchIntent.test.tsx#patch intent routing (SDLC-ART-05)"
        status: pass
      - kind: integration
        ref: "tests/unit/sdlc/StepChatPanelArtifactQueue.test.tsx#keeps explicit full generation"
        status: pass
    human_judgment: false
  - id: D4
    description: "Ambiguous TECH_DOCS edits ask for a document and preserve the original text; foreign-step targets are refused with navigation"
    requirement: SDLC-ART-05
    verification:
      - kind: integration
        ref: "tests/unit/sdlc/StepChatPanelArtifactQueue.test.tsx#asks which TECH_DOCS document before dispatching an ambiguous edit, then keeps the original text"
        status: pass
    human_judgment: false
  - id: D5
    description: "Prompt policy names exactly the payload tools; Analysis Mode omits patch and explains how to enable edits"
    requirement: SDLC-ART-05
    verification:
      - kind: integration
        ref: "tests/unit/sdlc/StepChatPanelToolPolicy.test.tsx"
        status: pass
      - kind: integration
        ref: "tests/unit/sdlc/ArtifactPatchIntent.test.tsx#omits patch from the payload in Analysis Mode and keeps get_artifact"
        status: pass
    human_judgment: false
  - id: D6
    description: "A proposal carrying a pre-approval base is never applied, and rejecting the first card leaves the second independent card fresh"
    requirement: SDLC-ART-02
    verification:
      - kind: integration
        ref: "tests/unit/sdlc/ArtifactPatchIntent.test.tsx#re-reads after a prior approval invalidated the second call base, instead of applying it"
        status: pass
      - kind: integration
        ref: "tests/unit/sdlc/ArtifactPatchIntent.test.tsx#keeps an independent second patch fresh after rejecting the first"
        status: pass
    human_judgment: false
  - id: D7
    description: "Native Tauri check of the end-to-end edit flow and refusal navigation"
    verification: []
    human_judgment: true
    rationale: "Phase-level UAT owns native desktop confirmation; jsdom asserts plumbing, diff stats and payload parity only."
duration: 24min
completed: 2026-11-05
status: complete
---

# Phase 27 Plan 04: Bounded Edit Intent and Payload-Aware Tool Policy Summary

**Concrete add/edit requests now route through real get_artifact then patch_artifact_section and park an explicit approval card, while full-generation actions keep their complete-document contracts and the prompt can only name tools that are actually in the payload.**

## Performance

- Started: 2026-11-05T04:01:48Z.
- Completed: 2026-11-05T04:25:29Z.
- Duration: 24 min.
- Tasks: 2/2.
- Files changed: 7 (1 new test, 6 modified).
- Commits: 3 measured from the persisted ledger `edc360ed..HEAD`.

## Accomplishments

- `looksLikeArtifactPatchRequest` recognizes Vietnamese (thêm/bổ sung/chèn/sửa/cập nhật) and English (add/append/insert/edit/replace/update) bounded edits with an explicit artifact term, using the existing accent-normalized token boundaries.
- Generation verbs win: "soạn/tạo/sinh/viết … SOLUTION" stays an explicit artifact turn with its full-document output contract.
- `explicitPatchKind` returns only the one document the user named in the current step; TECH_DOCS ambiguity raises a warning with `Chỉnh sửa PL03B` / `Chỉnh sửa PL07` actions that resubmit the retained original text as a patch turn.
- A bounded edit naming a document another step owns is refused with copy and `Chuyển đến Bước {N}` navigation rather than falling through to Q&A.
- `composeSdlcTurn` accepts `intent: 'patch'`, emits `SDLC_PATCH_TOOL_POLICY` (get → patch argument shape, 120-line cap and split guidance, explicit approval, drift re-read) and no output contract, plus one patch few-shot per artifact kind labelled as untrusted illustration.
- `buildToolPolicy` renders the local capability list from the supplied actual payload names. Steps that own no document keep the exact Phase 26 policy text.
- `StepChatPanel` builds one discovery snapshot, host-gates only the artifact pair (trusted scope, active CR, non-historical, prerequisites, live target), and passes the resulting names to the composer so prompt and payload agree.
- Final-text extraction is restricted to explicit full-generation turns; patch and Q&A answers cannot reach the editor.

## Task Commits

1. Task 1 RED — `64930cbe` `test(27-04): require bounded patch routing from chat intent`
2. Task 1 GREEN — `d1d06212` `feat(27-04): route concrete edits to bounded artifact proposals`
3. Task 2 — `d2c908be` `feat(27-04): keep ambiguous and repeated edits bounded`

Metadata commit follows this SUMMARY; actuals use the persisted plan ledger.

## TDD Gate Compliance

- `query phase.tdd-applicable` returned `applicable: true`, source `task_attribute`, despite global `config_tdd_mode: false`.
- Task 1 RED: `check tdd-red-evidence` returned `RED_EVIDENCE_OK` (`target_test_failed`); the failure was the missing `looksLikeArtifactPatchRequest` predicate after real modules loaded.
- Task 1 GREEN: intent suite 19/19, composer 22/22, tool-policy/queue/approval cluster 94/94, TypeScript exit 0; tracer re-run after commit passed.
- Task 2: the new ambiguity/prior-base/reject-first cases were written against already-landed host code, so there is no separate RED record for them. Their first failures were assertion-shaped (duplicate render target, clarification path) and were fixed in tests, not by weakening production behavior. Recorded rather than claimed as red-first.

## Verification

```sh
npx vitest run tests/unit/sdlc/ArtifactPatchIntent.test.tsx tests/unit/sdlc/StepChatPanelArtifactQueue.test.tsx tests/unit/sdlc/StepChatPanelToolPolicy.test.tsx tests/unit/sdlc/ArtifactPatchApproval.test.tsx tests/ai/sdlcPromptComposer.test.ts
npx vitest run tests/ai/sdlcPromptComposer.test.ts tests/unit/sdlc/StepChatPanelArtifactQueue.test.tsx tests/unit/sdlc/StepChatPanelToolPolicy.test.tsx tests/unit/sdlc/ArtifactPatchApproval.test.tsx
npx tsc --noEmit
```

- Combined plan cluster: **5 files / 109 tests passed**, exit 0.
- Reused verify command: **4 files / 88 tests passed**, exit 0.
- TypeScript: exit 0.
- `check evaluation-scope --plan 27-04 --commits-only` resolved all three commits on this branch.
- No live model, network or paid API call: the provider is a deterministic scripted generator.

**Full-suite gate remains inconclusive/red by coordinator report.** No full-suite rerun, no green claim, no unrelated baseline fix.

## Files Created/Modified

- `src/services/ai/sdlcPromptComposer.ts` — `patch` intent, payload-derived policy, `SDLC_PATCH_TOOL_POLICY`, `SDLC_PATCH_FEW_SHOTS`, artifact tools on owning steps.
- `src/components/sdlc/chat/StepChatPanel.tsx` — patch intent routing, explicit/ambiguous/foreign target handling, host-gated payload, extraction only for full generation.
- `src/components/sdlc/chat/useStepChatToolbox.ts` — `toolsForTurn(availableToolNames?)` narrowing one discovery snapshot.
- `tests/unit/sdlc/ArtifactPatchIntent.test.tsx` — new deterministic end-to-end intent/patch/approval regression (21 tests).
- `tests/unit/sdlc/StepChatPanelArtifactQueue.test.tsx` — ambiguity, cross-step refusal, patch vs generation policy cases.
- `tests/unit/sdlc/StepChatPanelToolPolicy.test.tsx` — parity under host gating.
- `tests/ai/sdlcPromptComposer.test.ts` — artifact-owning step expectations.

## Decisions Made

- Never infer a TECH_DOCS target from prompt order or step defaults; require a click.
- Keep the composer pure: intent is decided in the host and passed in.
- Patch turns carry no output contract at all, so no code path can treat a narrative answer as a document.
- Foreign-step edit mentions are refused rather than treated as ordinary Q&A, because silently answering would look like a successful edit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Regression] Stricter host gate hid discovered MCP tools**
- Found during Task 1 cluster verification.
- Issue: the first implementation narrowed the entire payload to the static allowlist, dropping dynamic MCP read tools and breaking parity tests.
- Fix: filter only `get_artifact` / `patch_artifact_section`; every other tool flows through unchanged.
- Files: `src/components/sdlc/chat/StepChatPanel.tsx`.
- Verification: 94/94 cluster pass, parity assertions compare policy and payload names.
- Commit: `d1d06212`.

**2. [Rule 1 - Regression] Phase 26 policy text changed for non-artifact steps**
- Found during composer suite.
- Issue: an unconditional "Công cụ đề xuất chỉnh sửa" line altered BYTE-identical policy for INTAKE/CODE_GUIDE/CHANGE_PACK.
- Fix: keep the original list shape for steps without artifact ownership; only owning steps add the proposal line.
- Files: `src/services/ai/sdlcPromptComposer.ts`, `tests/ai/sdlcPromptComposer.test.ts`.
- Verification: composer 22/22 with existing layer/order assertions untouched.
- Commit: `d1d06212`.

**3. [Rule 1 - Bug] Test fixtures lacked real prerequisite markers**
- Found during Task 1 scripted harness.
- Issue: the panel correctly refused the edit with the missing-PL01 guard, so no provider call occurred.
- Fix: supply the real `PL01`/`PL02` marker set and wait for the bound step thread instead of weakening the guard.
- Files: `tests/unit/sdlc/ArtifactPatchIntent.test.tsx`.
- Verification: 19/19 then 21/21.
- Commit: `d1d06212`, `d2c908be`.

---

**Total deviations:** 3 auto-fixed (2 regressions, 1 test-fixture bug)
**Impact:** Required for prompt/payload parity and for keeping Phase 26 contracts intact. No scope creep.

## Issues Encountered

- `tests/unit/sdlc/ArtifactPatchApproval.test.tsx` carried a pre-existing uncommitted delta from 27-03 (a rerender with a fresh context closure). This plan neither staged nor reverted it; the file was already dirty on entry.
- The flaky `ProjectSdlcView` file was not part of this plan's verification set; no rerun.
- `git show --numstat` on the Task 1 commit shows whole-file rewrites for `useStepChatToolbox.ts` and `StepChatPanelToolPolicy.test.tsx` because both had mixed line endings; the space-insensitive diff is +7/−3 and +5/−2 respectively, i.e. real content only. Content was normalized to LF for those two files.
- `roadmap.update-plan-progress` is expected to decline with `missing_phase_details` in this repository; close-out reports the actual return and updates only the existing checklist line and progress count.

## User Setup Required

None.

## Next Phase Readiness

- All five Phase 27 plans now have implementation commits; SDLC-ART-05/01/02 returned `ready` from `requirements.ready-ids`.
- Phase verification remains with the coordinator: full-suite gate is still inconclusive, and native Tauri UAT has not been performed.
- Requirement state after close-out is recorded in STATE/REQUIREMENTS by the metadata commit.

## Self-Check: PASSED

- Created file exists: `tests/unit/sdlc/ArtifactPatchIntent.test.tsx`.
- Commits are ancestors of HEAD: `64930cbe`, `d1d06212`, `d2c908be`.
- Targeted clusters and TypeScript pass after the commits (109 and 88 tests).
- Tool order `get_artifact` then `patch_artifact_section` is asserted from real dispatched results, with +1/−0 stats and untouched neighbouring sections.
- No full-document extraction path remains for patch or Q&A turns.

## Post-Gate Regression Fix (2026-11-05)

Wave-4 focused gate reported two confirmed regressions. Both were fixed in production code; no test expectation in the two gate files was changed.

1. **`tests/ai/sdlcPromptIsolation.test.ts` parity.**
   - Root cause: for non-artifact steps `buildToolPolicy` emitted "Không có công cụ ghi hoặc tạo tài liệu." as its own line. The test parses policy lines `slice(1, 3)` and treats them as the capability name list, so the stray prose entered that list.
   - Fix: non-owning steps now keep the exact Phase 26 joined line `Chỉ gọi công cụ trong payload của turn này. Không có công cụ ghi hoặc tạo tài liệu.` The artifact proposal line is emitted by owning steps only, and `patch_artifact_section` is named only in the patch-guidance line, never in the read-capability list (it is a proposal tool).
   - The single test edit is in `tests/unit/sdlc/ArtifactPatchIntent.test.tsx`, an assertion about the Analysis-Mode policy copy written by 27-04 itself — updated to the still-present `Analysis Mode đang bật` sentence, not a loosening of the gate files.

2. **`tests/unit/sdlc/ProjectSdlcView.test.tsx > Test 9` disabled approve.**
   - Root cause: the SOLUTION editor mounted while this CR's `coordinator.restore()` was still in flight. `workflowState` was transiently `undefined`, so `hasIntakeBaseline` was `false` and `baselineReady` blocked the approve button; a click or assertion in that window stayed blocked. The error banner in the failing DOM was `Chưa đủ điều kiện: Thiếu Hồ sơ quy trình SDLC từ Bước 1` (`WORKFLOW_NOT_INITIALIZED`).
   - Fix: `ProjectSdlcView` tracks `workflowRestored` per coordinator/CR and renders a neutral loading node instead of a step editor until restore settles, including the failure path (which still renders the existing guards). No assertion was modified.
   - Evidence: file passes 19/19 in five consecutive full-file runs after the fix; the gate command passes 27/27.

Focused verification after the fix commit (`4e36bfb3`):

- `npx vitest run tests/ai/sdlcPromptIsolation.test.ts tests/unit/sdlc/ProjectSdlcView.test.tsx` → 2 files, 27 tests passed, exit 0.
- `npx vitest run tests/ai/sdlcPromptComposer.test.ts tests/ai/AiChatWidget.test.tsx tests/unit/sdlc/StepChatPanelToolPolicy.test.tsx tests/unit/sdlc/ArtifactPatchApproval.test.tsx` → 4 files, 59 tests passed, exit 0.
- `npx tsc --noEmit` → exit 0.

TDD note: no genuine RED was produced for these two fixes. The policy regression was visible only after a first wrong repair (separate line), and the editor race is timing-dependent; neither was captured as an intentional failing target before the production edit. No INVALID_RED claim is made.

Unrelated note: three quick-task commits (`fa9f87a2`, `d22446ce`, `100c9c7a`, quick `261105-g84`) landed on this branch during the fix window from outside this executor. This fix commit touches only the three intended paths; pre-existing dirty entries remain untouched (count changed only because that quick task committed its own files).
