---
phase: 35-shared-primitive-extraction-sdlc-behavior-removal
plan: 05
type: execute
subsystem: tests
tags: [sdlc-removal, test-deletion, structural-gate]
requires: [35-01, 35-02, 35-03, 35-04]
provides:
  - "SDLC-free test tree for wave 5 leaf deletions"
  - "structural safety gate over surviving chat and backup boundaries"
affects: [35-06, 35-08, 35-10]
tech-stack:
  added: []
  patterns: [structural-gate-over-source-text]
key-files:
  created: []
  modified:
    - tests/phase25_1SafetyGates.test.ts
  deleted:
    - tests/unit/sdlc (26 files)
    - tests/ai (20 files)
    - tests/services (7 files)
    - tests/export (3 files)
    - tests/components/sdlc (3 files)
    - tests/views/ChangeRequestSdlcViewMultiSystem.test.tsx
    - tests/fixtures/ai/wizard-reference.json
    - tests/backup/wizardBackup.test.ts
    - src/components/sdlc/__tests__ (1 file)
    - src/components/sdlc/steps/__tests__ (3 files)
    - src/components/ai/wizard/__tests__ (5 files)
    - src/services/wizard/__tests__ (5 files)
    - src/services/__tests__/changePackPackager.test.ts
    - src/services/ai/__tests__/researchService.test.ts
    - e2e/sdlcFlowHardening.spec.ts
    - e2e/sdlcHubFlow.spec.ts
    - e2e/helpers/sdlcFixtures.ts
decisions:
  - "Pruned eight deleted paths from phaseTestFiles; kept the ten surviving entries"
  - "Replaced the SDLC prompt-isolation test with a drawer-only AI-core wiring test"
  - "Corrected a stale localStorage-key expectation exposed once ENOENT masking was gone"
metrics:
  duration: ~12m
  completed: 2026-11-10
  tasks: 2
  files: 82
  commits: 3
  plan_head_before: 170f13f5cdf3c0c599bda2bba51f1cbbc601a2e5
  plan_head_after: 2f274b20a12fa6f8930e26702f987c9ca91e335f
  deletions: 20336
actuals:
  tasks: 2
  commits: 3
status: complete
---

# Phase 35 Plan 05: Delete SDLC-only tests and rewrite the structural safety gate Summary

81 SDLC-only test/fixture/e2e files removed in one commit, then `tests/phase25_1SafetyGates.test.ts` rewritten to guard only surviving chat and backup boundaries — green in 10 tests with no `ENOENT`.

## What Was Built

**Task 1 — SDLC test surface removed (81 files, 20,335 lines):**

- `tests/unit/sdlc/` (26), `tests/components/sdlc/` (3), `tests/export/` (3), `tests/services/wizard/` (1)
- co-located suites: `src/components/sdlc/__tests__/` (1), `src/components/sdlc/steps/__tests__/` (3), `src/components/ai/wizard/__tests__/` (5), `src/services/wizard/__tests__/` (5)
- 20 individual files under `tests/ai/` including `AIChatDrawerCheckpoint.test.tsx` and `artifactToolAccess.test.ts` (both recreated by plan 08)
- 5 under `tests/services/ai/`, `tests/services/sdlc/groundingBuilder.test.ts`, `tests/backup/wizardBackup.test.ts`, `tests/views/ChangeRequestSdlcViewMultiSystem.test.tsx`, `tests/fixtures/ai/wizard-reference.json`
- `src/services/__tests__/changePackPackager.test.ts`, `src/services/ai/__tests__/researchService.test.ts`
- e2e: two SDLC specs plus `e2e/helpers/sdlcFixtures.ts`; `e2e/` now holds only `aiChat.spec.ts`

Preserved per plan: `tests/services/sdlc/markdownSections.test.ts`, `tests/utils/lineDiff.test.ts`, `tests/backup/tabCheckpointBackup.test.ts`, `tests/services/backup/*`, `tests/ai/chatTurnRuntime.test.ts`, `tests/ai/aiTools.test.ts`, `tests/ai/PatchDiffApprovalCard.test.tsx`, `tests/ai/conventionsSegment.test.ts`, `tests/services/ai/patchProposal.test.ts`.

**Task 2 — structural gate rewritten (`tests/phase25_1SafetyGates.test.ts`):**

- Removed the `sourceMerge` import, the `sourceFixture` helper, and the whole `Phase 25.1 source merge invariant fixture (D-19)` describe block.
- `phaseTestFiles` pruned from 18 to 10 entries; every remaining path verified present on disk.
- `keeps backup boundaries closed to unsafe identifiers and fields` keeps every `exportSource`, `backupSchemas`, and `isSafeBackupSetting` assertion verbatim; only the three `sourceMerge` assertions dropped.
- Deleted `keeps normal and SDLC prompt isolation explicit...`; its two drawer assertions moved into a new `keeps the AI core entry points wired in the chat drawer` test reading only `src/components/ai/AIChatDrawer.tsx`.
- `useEffect` brace-matching gate, console gate, and the no-`.skip`/`.todo`/`.fixme` loop untouched.

## Verification

- `npx vitest run tests/phase25_1SafetyGates.test.ts` → 10 passed, 0 failed, no `ENOENT`.
- `npx vitest run tests/phase25_1SafetyGates.test.ts tests/services/sdlc/markdownSections.test.ts tests/utils/lineDiff.test.ts` → 27 passed.
- `grep -rln "services/wizard\|components/sdlc\|sdlcArtifactTools\|sdlcPromptComposer\|wizardSchemas" tests src --include="*.test.ts" --include="*.test.tsx"` → 0 hits.
- `npx tsc --noEmit` does **not** exit 0 in this worktree — 152 errors, all pre-existing and unrelated to this plan: the worktree has an empty `node_modules` (no `@dnd-kit/*`, no `react-resizable-panels`) and TS 7 reports implicit-`any` on `.map((t) =>` callbacks throughout. Zero errors point at `tests/phase25_1SafetyGates.test.ts` or any file this plan touched. The plan's `tsc` acceptance criterion is unmeetable in this environment; it is not a regression introduced here.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stale `AI_AUTO_APPROVE_MUTATIONS_KEY` expectation in the structural gate**
- **Found during:** Task 2 verification
- **Issue:** `tests/phase25_1SafetyGates.test.ts:201` asserted the drawer's localStorage key set was `{AI_CHAT_WIDTH_KEY, AI_AUTO_APPROVE_MUTATIONS_KEY, AI_ANALYSIS_MODE_KEY}`, but `AIChatDrawer.tsx` only declares `AI_AUTO_APPROVE_MUTATIONS_KEY` at `:149` and never reads or writes it. The failure had been masked by the `ENOENT` thrown earlier in `phaseTestFiles`.
- **Fix:** Narrowed the expected set to `{AI_CHAT_WIDTH_KEY, AI_ANALYSIS_MODE_KEY}`.
- **Files modified:** `tests/phase25_1SafetyGates.test.ts`
- **Commit:** 2f274b20

### Out-of-scope observations (not fixed)

- `src/components/sdlc/chat/StepChatPanel.tsx:606,609,1129` still fails to typecheck against `patchProposal.ArtifactPatchProposal`; the file is deleted in plan 06.
- Worktree `node_modules` is empty, so `tsc`/`vitest` both lean on the parent repo's partial install. `react-resizable-panels` and `@dnd-kit/*` resolve to `TS2307` in unrelated files.

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, or trust-boundary surface. T-35-13 (stale `phaseTestFiles` → `ENOENT`) and T-35-14 (weakened gate coverage) both mitigated: the list was pruned in the same commit as the deletions and every remaining entry was verified to exist, while the `isSafeBackupSetting` loop and `useEffect` brace gate were preserved verbatim.

## Self-Check: PASSED

- `tests/phase25_1SafetyGates.test.ts` exists and contains 3 `isSafeBackupSetting` references.
- Commits `a149d91a` and `2f274b20` are ancestors of HEAD.
