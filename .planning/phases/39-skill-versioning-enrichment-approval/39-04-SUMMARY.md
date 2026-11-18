---
phase: 39-skill-versioning-enrichment-approval
plan: 04
subsystem: ai-office / skill-versioning / proposal-tool
tags: [skill-version, team-tool, prompt-injection, d-01..d-06, d-11, d-20, d-21]
requires:
  - "39-01 createSkillVersion (pending-only) + getLatestApprovedVersionNumber"
  - "src/utils/lineDiff.ts createUnifiedLineDiff + MAX_DIFF_CELLS"
provides:
  - "prepareSkillVersionDiff(input): ArtifactPatchProposal | ArtifactToolRefusal (sync)"
  - "TEAM_TOOL_DEFINITIONS[9] = propose_skill_version + proposeSkillVersion handler"
  - "executeTeamTool case 'propose_skill_version'"
  - "amended [CHÍNH SÁCH CHỈ ĐỌC] copy naming the one permitted write"
  - "wrapUntrusted('MÔ TẢ KỸ NĂNG …', skill.description) in buildEmployeeTurnRequest"
affects:
  - "39-05/39-06 (approval UI renders the three-field diffText this plan builds)"
tech-stack:
  added: []
  patterns:
    - "refusal is a returned value, never a throw — even for schema violations"
    - "the gate is isMutationTool; a non-mutation tool never reaches onMutationCheck"
key-files:
  created: []
  modified:
    - src/services/ai/patchProposal.ts
    - src/services/ai/office/teamTools.ts
    - src/services/ai/office/teamPrompts.ts
    - tests/services/ai/patchProposal.test.ts
    - tests/services/ai/office/teamTools.test.ts
    - tests/services/ai/office/teamPrompts.test.ts
    - tests/ai/aiTools.test.ts
    - tests/ai/chatTurnRuntime.test.ts
    - tests/services/ai/aiOrchestratorLoop.test.ts
decisions:
  - "D-01: the agent proposes in-turn via a team tool — no post-turn automation, no user button"
  - "D-02: the proposal is always for ctx.skillId, so no leader guard is needed"
  - "D-04: the row is written immediately as pending and the diff returned; nothing parks"
  - "D-05: the tool is absent from MUTATION_TOOLS; isMutationTool is false for bare and _ide"
  - "D-06: the tool is in the employee payload, not LEAD_ONLY_TEAM_TOOLS"
  - "D-11: one hunk per changed field, fixed name → description → body order"
  - "D-21: the description is wrapped as untrusted data in the prompt"
metrics:
  duration: "~18 min"
  completed: "2026-11-14"
---

# Phase 39 Plan 04: `propose_skill_version` tool + prompt boundary Summary

An employee can now make exactly one write — a `propose_skill_version` call that stores an inert `pending` row and returns a three-field diff — and the employee prompt says so instead of claiming every write is refused.

## What changed

**`src/services/ai/patchProposal.ts`**
- `SkillVersionDiffInput` and sync `prepareSkillVersionDiff`. Sync because `createUnifiedLineDiff` is sync; an `async` signature would force both render sites into `useState` + `useEffect` for nothing.
- Fields iterate in the fixed `name` → `description` → `body` order, each hunk included only when that field's base and next values differ. Labels are `a/skill:{id}/{field} ({baseLabel})` / `b/skill:{id}/{field} (đề xuất)`, `baseLabel` being `bản {n}` or `bản hiện tại` at the implicit baseline. Hunks join with one blank line; `addedLines`/`removedLines` are the sums.
- Refusals reuse the existing codes only: `NO_CHANGES` (no field changed), `PATCH_TOO_LARGE` (a single field over `PATCH_LINE_CAP`, or the summed diff over it), `DIFF_BUDGET_EXCEEDED` (a `DiffBudgetRefusal` from the LCS budget).
- The returned `ArtifactPatchProposal` uses `sectionId: 'skill'`, `sectionTitle: base.name`, `baseHash: ''` (unused on this path — a hash would imply drift detection this path does not perform).

**`src/services/ai/office/teamTools.ts`**
- Ninth `TEAM_TOOL_DEFINITIONS` entry `propose_skill_version` (Vietnamese description stating it changes nothing until approval and wants full content, not a patch). Not added to `LEAD_ONLY_TEAM_TOOLS`; `EMPLOYEE_TEAM_TOOLS` derives from the array, so `employeeTools()` needed no edit.
- `proposeSkillVersion(args, ctx)`: refuses `SKILL_NOT_ASSIGNED` for a missing `ctx.skillId` or a missing `aiSkills` row; trims the three required strings and refuses `INVALID_ARGUMENT` when any is empty; refuses `INVALID_ARGUMENT` for `evidence` over 2000 chars (the repo schema would throw, and a throw is not the team-tool convention); then validates the whole draft with `AiSkillVersionInputSchema.safeParse` so an over-long `name`/`description` also becomes a refusal rather than a throw. Builds the diff, returns it unchanged on refusal (writing no row), then calls `createSkillVersion` **without** a `status` field.
- `executeTeamTool` gained the `case`. `resolveTeamToolName`/`TEAM_TOOL_NAMES` derive from the definitions array, so nothing else changed.

**`src/services/ai/office/teamPrompts.ts`**
- The `[CHÍNH SÁCH CHỈ ĐỌC]` second line split into two: the blanket claim now carries "trừ một ngoại lệ duy nhất bên dưới", and a new line names `propose_skill_version` as the sole permitted write and states the proposal changes nothing until the user approves.
- The skill block interpolates `wrapUntrusted(\`MÔ TẢ KỸ NĂNG ${skill.name}\`, skill.description)` instead of the bare description. `wrapUntrusted` neutralizes delimiters internally, so no second `neutralizeDelimiters` call. The body still never enters the prompt.

**Tests**
- `patchProposal.test.ts`: five new cases — three-field hunk order with summed line counts, hunk omission for an unchanged field, `NO_CHANGES`, both base labels, and `PATCH_TOO_LARGE` above the shared cap.
- `teamTools.test.ts`: `toHaveLength(8)` → `toHaveLength(9)` with the name added to `arrayContaining`; a new `propose_skill_version` describe with six cases (pending row with no `version` key and `baseVersion === 0`; approved count and `aiSkills` unchanged; `SKILL_NOT_ASSIGNED` with zero rows; `NO_CHANGES` with zero rows; `INVALID_ARGUMENT` for an empty body and for 2001-char evidence; evidence stored when supplied and absent when not).
- `aiTools.test.ts`: `isMutationTool('propose_skill_version')` and the `_ide` form both `false`.
- `aiOrchestratorLoop.test.ts`: a new case proving `onMutationCheck` is **never called** for `propose_skill_version` and the tool reaches `executeToolFn`.
- `chatTurnRuntime.test.ts`: a new case driving the **real** loop under `mutationPolicy: 'read-only'` — the tool result is not `READ_ONLY_EMPLOYEE` and no `awaiting-approval` status or approval event fires. The runtime's `onMutationCheck` refuses unconditionally under read-only, so calling the hook directly would have asserted a shape the code cannot produce; the honest proof is that the loop's `isMutationTool` gate never routes the tool to it.
- `teamPrompts.test.ts`: three new cases — the description is wrapped and the body sentinel still absent, the amended copy names the tool and the old sentence is gone, and a forged closing delimiter yields `[redacted-tag]`.

## Verification

- `npx tsc --noEmit -p tsconfig.json` — 0 `error TS` lines
- `npx vitest run tests/services/ai/patchProposal.test.ts` — 21 passed
- `npx vitest run tests/services/ai/office/teamTools.test.ts` — 38 passed
- `npx vitest run tests/services/ai/office/teamPrompts.test.ts` — 19 passed
- `npx vitest run tests/ai/aiTools.test.ts tests/ai/chatTurnRuntime.test.ts tests/services/ai/aiOrchestratorLoop.test.ts` — 150 passed
- All six suites together — 228 passed
- `bash .planning/scripts/verify-team-chat-architecture.sh` — exit 0, including the dead-module check (no new office module)
- Acceptance greps: `export function prepareSkillVersionDiff` present; `PATCH_LINE_CAP` 13 occurrences; `bản hiện tại` present; no `skillVersion*` file in `src/services/ai/office/`; `name: 'propose_skill_version'` present; `toHaveLength(9)` present; zero `propose_skill_version` matches in `src/services/ai/aiTools.ts`; `LEAD_ONLY_TEAM_TOOLS` still only `delegate_batch` + `amend_assignments`; two matches in `tests/ai/aiTools.test.ts`; old policy sentence gone from `teamPrompts.ts`; `MÔ TẢ KỸ NĂNG` present; no bare `skill.description,` interpolation

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The evidence test assumed `toArray()` ordering**
- **Found during:** Task 2
- **Issue:** the plan's test (e) read `rows[0]` / `rows[1]` from `db.aiSkillVersions.toArray()`, but Dexie gives no order guarantee for a full-table read — the evidence row landed second and the assertion failed on `undefined`.
- **Fix:** located the two rows by shape (`rows.find((row) => 'evidence' in row)` and its complement) and asserted each row's own content, which also makes the "key absent" half explicit.
- **Files modified:** `tests/services/ai/office/teamTools.test.ts`
- **Commit:** 078c960a

**2. [Rule 2 - Missing critical coverage] The plan's schema-violation path was a throw, not a refusal**
- **Found during:** Task 2
- **Issue:** the plan only specified a length check for `evidence`. `AiSkillVersionInputSchema` also caps `name` at 60 and `description` at 300, so an over-long name would have thrown out of `createSkillVersion` — a throw is not the team-tool convention and the model would see a generic tool error instead of a code it can act on.
- **Fix:** validate the whole draft with `AiSkillVersionInputSchema.safeParse` before the diff, mapping any issue to `refuse('INVALID_ARGUMENT', …)`. The explicit `evidence` length check stays so the message is specific.
- **Files modified:** `src/services/ai/office/teamTools.ts`
- **Commit:** 078c960a

**3. [Rule 3 - Blocking] The runtime-level test needed the real loop, not the hook**
- **Found during:** Task 2
- **Issue:** the plan offered two assertions for `chatTurnRuntime.test.ts`, both of which call `options.onMutationCheck?.('propose_skill_version', {})` directly. The runtime's hook returns `READ_ONLY_REFUSAL` for *any* name under `mutationPolicy: 'read-only'` — it never consults `isMutationTool` — so calling it directly proves nothing about D-05 and would have asserted `proceed === true`, a shape the code cannot produce.
- **Fix:** drive the real `runAiOrchestratorLoop` with a mocked provider stream, assert the tool result is not `READ_ONLY_EMPLOYEE`, and assert no `awaiting-approval` status or approval event. Added the same proof at the loop level (`onMutationCheck` never called) in `aiOrchestratorLoop.test.ts`, which is where `isMutationTool` actually gates.
- **Files modified:** `tests/ai/chatTurnRuntime.test.ts`, `tests/services/ai/aiOrchestratorLoop.test.ts`
- **Commit:** 078c960a

No architectural changes, no auth gates, no package installs.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. T-39-13 (pending-only write) is covered by the row-shape test; T-39-14 (not mutation-classified) by the `isMutationTool` pair plus the loop-level "hook never called" test; T-39-15 (prompt injection via description) by the wrapped-description and forged-delimiter tests; T-39-16 (oversized proposal) by the cap refusals; T-39-17 (evidence never in the prompt) holds because `evidence` is only stored on the row and returned in its own result.

## Self-Check: PASSED

- FOUND: src/services/ai/patchProposal.ts
- FOUND: src/services/ai/office/teamTools.ts
- FOUND: src/services/ai/office/teamPrompts.ts
- FOUND: tests/services/ai/patchProposal.test.ts
- FOUND: tests/services/ai/office/teamTools.test.ts
- FOUND: tests/services/ai/office/teamPrompts.test.ts
- FOUND: 973960c4
- FOUND: 078c960a
- FOUND: ab54e556
