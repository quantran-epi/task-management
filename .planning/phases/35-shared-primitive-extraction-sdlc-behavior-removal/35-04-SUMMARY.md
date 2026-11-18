---
phase: 35-shared-primitive-extraction-sdlc-behavior-removal
plan: "04"
subsystem: ai
status: complete
tags: [ai-tools, tool-schema, approval-gate, note-skill, deletion]
requires: [35-01]
provides:
  - get_artifact and patch_artifact_section scoped to { target: 'note' | 'skill', id }
  - Two-case artifact dispatch through patchProposal.readPatchTarget / preparePatch
  - propose_subsystems and propose_research removed from definitions, dispatch, payload gating
  - artifactContext plumbing removed from the orchestrator loop and turn runtime
affects: [35-05, 35-06, 35-12]
tech-stack:
  added: []
  patterns: [target-id-addressing, approval-gated-mutation]
key-files:
  created: []
  modified:
    - src/services/ai/aiTools.ts
    - src/services/ai/chatTurnTools.ts
    - src/services/ai/aiOrchestratorLoop.ts
    - src/components/ai/runtime/chatTurnRuntime.ts
    - tests/ai/aiTools.test.ts
    - tests/ai/chatTurnRuntime.test.ts
key-decisions:
  - Kept patch_artifact_section in MUTATION_TOOLS so the approval gate keeps firing even though dispatch no longer goes through sdlcArtifactTools.
  - Rewrote all SDLC wording in the touched files rather than only stripping the word "artifact", so plan 12 Gate C can grep all of src without an exclusion.
  - Rewrote the turn-runtime artifact tests against { target, id } args instead of deleting them wholesale, so the approval-gate coverage survives.
requirements-completed: [AIO-REMOVE-01, AIO-REMOVE-02]
actuals:
  tokens: 7343
  tasks: 2
  commits: 2
commits: 2
plan_head_before: 750d04b85207bf3509bab7f4ecc9f8ff4e0801cf
plan_head_after: c7f61ab00f78b49cbd99a4ff6a83dd43244fa771
duration: 8min
completed: 2026-11-10
---

# Phase 35 Plan 04: Artifact tool rescope and proposal-tool removal Summary

**get_artifact and patch_artifact_section now read/patch a note or skill by `{ target, id }` through patchProposal.ts; propose_subsystems and propose_research are gone, and the approval gate still parks every patch.**

## Performance

- Started: 2026-11-10T13:47:00Z (approx)
- Completed: 2026-11-10T13:52:00Z (approx)
- Tasks: 2/2
- Files: 6 modified
- Actual tokens: 7,343, calculated as ceil(29,371 diff characters / 4), not a harness token count.
- Commit count: 2 task commits, measured from the plan ledger (`git rev-list --count 750d04b8..HEAD`).

## Accomplishments

- `get_artifact` reads the current Markdown of a note or skill plus `baseHash` and the stable section index via `readPatchTarget(db, args)`.
- `patch_artifact_section` keeps `sectionId` / `expectedHeading` / `baseHash` / `operation` / `newContent` and adds `target` / `id`; dispatched through `preparePatch(db, args)`.
- Deleted both `propose_subsystems` and `propose_research` definitions, the shared four-case dispatch branch, and both names from the chat-turn payload exclusion list (T-35-11: no dangling `case` left).
- Dropped `artifactContext` from `ExecuteAiToolOptions`, `DispatchAiToolCallOptions`, `AiOrchestratorLoopOptions`, and `ChatTurnRequest`, including the option spread and the two-branch dispatch.
- Turn runtime approval branch is now a single `preparePatchFn(deps.db, args)` call; the `isCurrent` guard, refusal early return, `preparedPatches` cache, `describeMutation`, `awaiting-approval` publish, and reject JSON are unchanged (T-35-09).
- `'patch_artifact_section'` remains in `MUTATION_TOOLS` (3 occurrences in `aiTools.ts`: definition, dispatch, mutation set).
- Rewrote all SDLC wording in the touched files so plan 12 Gate C can grep `src` without exclusion.
- Removed the `sdlcArtifactTools` type import and the `ARTIFACT_CONTEXT` fixture from `tests/ai/chatTurnRuntime.test.ts`; rewrote the artifact-patch `it` blocks against `{ target: 'note', id: 'note-1', sectionId }` args.

## Task Commits

1. Task 1 — `303ed2a3`: feat(35-04): rescope artifact tools to note/skill and drop proposal tools
2. Task 2 — `c7f61ab0`: refactor(35-04): drop artifactContext plumbing from loop and turn runtime

## Files Created/Modified

- `src/services/ai/aiTools.ts`: import swap to `patchProposal`, two rescoped definitions, two deleted proposal definitions, two-case dispatch, `artifactContext` field removed.
- `src/services/ai/chatTurnTools.ts`: exclusion list reduced to the two surviving artifact tools; two comments reworded.
- `src/services/ai/aiOrchestratorLoop.ts`: `artifactContext` removed from options/destructure/dispatch; single un-optioned `executeToolFn` / `dispatchAiToolCall` call.
- `src/components/ai/runtime/chatTurnRuntime.ts`: imports from `patchProposal.ts`, deps type/default point at `preparePatch`, approval branch context ternary collapsed, two SDLC comments removed/reworded.
- `tests/ai/aiTools.test.ts`: count 75 → 73, assertions that both proposal tools are absent.
- `tests/ai/chatTurnRuntime.test.ts`: artifact-context fixture and type import removed, args rewritten to `{ target, id }`.

## Tests and Verification

- `npx vitest run tests/ai/aiTools.test.ts tests/ai/chatTurnRuntime.test.ts tests/ai/chatTurnTools.test.ts`: **PASS — 110/110**.
- `npx vitest run tests/ai/aiTools.test.ts`: 58/58 pass.
- `npx vitest run tests/ai/chatTurnRuntime.test.ts`: 46/46 pass.
- `npx tsc --noEmit`: **FAIL outside scope**. The worktree installation is missing declared dependencies (`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`) and has pre-existing TS7006 errors in unrelated files. No diagnostic points at any of the six files this plan touched (grep for `aiTools|chatTurnTools|aiOrchestratorLoop|chatTurnRuntime` returns 0). Not claiming a green whole-repo typecheck.
- Structural gates: `propose_subsystems|propose_research` count 0 in both touched service files; `executeSdlcArtifactTool|ArtifactToolContext|artifactContext` count 0 in `aiTools.ts`; `SDLC|Sdlc|sdlc` count 0 in `aiTools.ts`, `chatTurnTools.ts`, `aiOrchestratorLoop.ts`, `chatTurnRuntime.ts`; `artifactContext` count 0 in `tests/ai/chatTurnRuntime.test.ts`; `grep -rn artifactContext src | grep -v StepChatPanel` returns 0 lines.
- Stub/TODO/FIXME scan: none added.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] AI_DATABASE_TOOLS length assertion after the two deletions**
- Found during: Task 1.
- Issue: `tests/ai/aiTools.test.ts:320` asserted 75 tools; deleting two definitions left 73 and failed the test.
- Fix: updated the expected count to 73 and added assertions that the two removed names are absent.
- Files: `tests/ai/aiTools.test.ts`.
- Commit: `303ed2a3`.

**2. [Rule 2 - Missing critical coverage] Artifact-patch tests could not compile against the removed field**
- Found during: Task 2.
- Issue: the plan allowed deleting the eight `it` blocks that used `artifactContext`. Deleting them would also delete the only coverage proving the approval gate still parks a patch.
- Fix: removed the fixture and type import, rewrote the `onMutationCheck` args to `{ target: 'note', id: 'note-1', sectionId }`, and kept every approval-gate assertion (park, auto-approve bypass refusal, refusal short-circuit, two-patch ordering, abort, cached proposal, analysis mode, read-only precedence).
- Files: `tests/ai/chatTurnRuntime.test.ts`.
- Commit: `c7f61ab0`.

## Issues Encountered

- Whole-repo `tsc` is red from a pre-existing incomplete worktree installation and unrelated files; scoped to the plan's files there are zero diagnostics. Orchestrator should resolve the environment before phase-wide verification.
- `StepChatPanel.tsx:102` still carries `artifactContext`; it is inside plan 06's delete set, which is why the plan's gate filters that file out.

## Deferred Issues

- Global `npx tsc --noEmit` failure outside the six files. Not fixed: out of scope, missing third-party dependencies.

## User Setup Required

None.

## Next Phase Readiness

- 35-05 can delete `sdlcArtifactTools.ts` and its tests: no source file in scope imports it anymore, and the turn-runtime test import is already gone.
- 35-06 can delete the step chat panel: `artifactContext` there is the last string hit in `src`.
- STATE.md, ROADMAP.md, and REQUIREMENTS.md untouched; orchestrator owns those updates.

## Self-Check: PASSED

- All six modified files exist.
- Both task commits (`303ed2a3`, `c7f61ab0`) are ancestors of HEAD.
- No tracked file deleted by either commit.
- Focused suite 110/110 pass; global typecheck failure documented, not counted as passed.
