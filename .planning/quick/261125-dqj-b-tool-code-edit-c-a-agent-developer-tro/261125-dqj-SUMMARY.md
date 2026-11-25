---
phase: quick
plan: 261125-dqj
subsystem: ai-office-team-chat
tags: [ai-team, code-generation, file-download, worktree-removal, capability-gate]
dependency_graph:
  requires: []
  provides:
    - "developer-only generate_code_file team tool"
    - "generated-file download cards on team reports"
    - "worktree-independent developer turns"
  affects:
    - "src/services/ai/office/teamTools.ts"
    - "src/services/ai/office/teamRunCoordinator.ts"
    - "src/services/ai/office/teamPrompts.ts"
    - "src/components/ai/office/TeamWorkspace.tsx"
tech_stack:
  added: []
  patterns:
    - "developer-only capability granted from stable agentKind marker"
    - "content-only tool delegation to existing executeAiTool('generate_file')"
key_files:
  created:
    - "src/services/ai/office/__tests__/teamTools.fileGeneration.test.ts"
  modified:
    - "src/services/ai/office/teamTools.ts"
    - "src/services/ai/aiOrchestratorLoop.ts"
    - "src/services/ai/office/teamPrompts.ts"
    - "src/services/ai/office/teamRunCoordinator.ts"
    - "src/components/ai/office/TeamWorkspace.tsx"
    - ".planning/AI-STAFF-SDLC-TEAM.json"
    - "tests/services/ai/office/teamPrompts.test.ts"
    - "tests/services/ai/office/teamRunCoordinator.test.ts"
  deleted:
    - "src/services/ai/office/__tests__/teamTools.codeEdit.test.ts"
    - "tests/components/ai/office/TeamWorkspaceWorktreeTarget.test.tsx"
decisions:
  - "Tool named generate_code_file, distinct from the mutation-classified generate_file DB tool; it forwards only filename/format/content so no model-supplied script can execute."
  - "Capability follows stable agentKind='developer' with legacy display-name fallback; lead and ordinary employees are excluded at both payload and handler layers."
  - "Worktree editing code (Coding Zone components, codingZonePopout, sshWorktreeService) stays on disk byte-unchanged; only team-chat entry points were removed, mirroring quick 261125-dax."
  - "codeEditAllowed input name kept on the prompt builder until Task 3 removed its last caller, keeping the tree compiling between task commits."
metrics:
  duration: "31m"
  completed_date: "2026-11-25T03:44:46Z"
  tasks: 3
  commits: 3
  plan_head_before: "16f3f43b3fbc113f30237880c51393e65ee248ed"
  plan_head_after: "831cbc5c59ae10c0bb065685769a5da9196e65e8"
status: complete
---

# Phase quick Plan 261125-dqj: Developer file generation instead of worktree editing Summary

Team chat no longer advertises or dispatches a worktree code-editing tool. Agent Developer now creates code in its report and hands the user a downloadable file via a restricted, content-only `generate_code_file` tool; developer turns no longer depend on a provisioned SSH worktree.

## What changed

- **Team tool layer** (`src/services/ai/office/teamTools.ts`): removed the `code_edit` definition, handler, dispatch case and three refusal codes plus the worktree descriptor/gate imports. Added `agentDeveloperFileToolName = 'generate_code_file'`, a `fileGenerationAllowed` context flag, and a definition with `filename`/`format`/`content`, closed format enum, and `additionalProperties: false`. The handler refuses without capability, validates non-empty filename/content, drops any `script`/host/repo argument, and delegates to the already-imported `executeAiTool('generate_file', …)`. `CODE_EDIT_AGENT_NAME` stays exported for legacy roster resolution only. `AGENT_DEVELOPER_ONLY_TEAM_TOOLS` now holds the new tool, so lead and employee payload filters follow automatically.
- **Generated-file detection** (`src/services/ai/aiOrchestratorLoop.ts`): `generate_code_file` joins `generate_file`/`generate_pptx` as a source of `ChatGeneratedFile`; the existing download card in `ChatMessageBubble.tsx` renders it with no new UI.
- **Prompts and seed**: exported `FILE_GENERATION_EXCEPTION_LINE` and `LEAD_CODE_GENERATION_LINE` in place of the worktree lines; removed `WORKTREE_AMBIGUITY_LINE` and its lead input field. The five shared personas and the Agent Developer persona/capability in `.planning/AI-STAFF-SDLC-TEAM.json` now describe code creation and a downloadable file, with no worktree-edit instruction.
- **Team workbench** (`src/components/ai/office/TeamWorkspace.tsx`): removed the Coding Zone trigger, worktree system picker, override/ambiguity effects and their imports, leaving `AiChatWidget`, transcript, composer and activity rail intact.
- **Coordinator** (`src/services/ai/office/teamRunCoordinator.ts`): removed worktree target/ambiguity state, provisioning helpers, the provisioning call, the setter interface methods and options, and the truthful-local-error branch. `developerAgentId()` remains for capability only; `toolContext` grants `fileGenerationAllowed: true` only to that stable id on a non-lead turn. Provider errors keep the sanitized bubble.
- **Tests**: replaced the code-edit test with file-generation tests (definition shape, capability gate, argument stripping, verbatim result); deleted the obsolete worktree-target UI test; rewrote prompt assertions; deleted provisioning/ambiguity coordinator tests and added developer tool-payload, capability, no-worktree end-to-end, and sanitized-provider-error regressions.

## Verification

- `npx tsc --noEmit` — clean after all three tasks.
- `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts --bail=1` — 206/206 pass.
- `npx vitest run tests/services/ai/office/teamPrompts.test.ts` — 62/62 pass.
- `npx vitest run src/services/ai/office/__tests__/teamTools.fileGeneration.test.ts` — 5/5 pass.
- Combined plan verification set (5 files): 338 pass, 18 fail — all 18 failures are pre-existing at baseline (5 in `aiOrchestratorLoop.test.ts` from an extra tool-call id argument; 13 in `TeamWorkspaceView.test.tsx` from stale budget/roster expectations). Each file was independently confirmed failing identically with this plan's changes reverted. See `deferred-items.md`.
- `git diff --name-only HEAD~3 HEAD` — exactly the plan's `files_modified`; `sshWorktreeService.ts`, Coding Zone components, schema/backup and PWA config untouched.
- Grep for retired tool names in team chat layers — zero production hits; only the negative test assertion `expect(names).not.toContain('code_edit')` remains.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Vitest mock path in the new test**
- **Found during:** Task 1
- **Issue:** `vi.mock('../../../aiTools')` resolved from `src/services/ai/office/__tests__` to the wrong directory, so the real `executeAiTool` wrote a file instead of returning the stubbed payload.
- **Fix:** Changed the mock path to `../../aiTools` and replaced the `importOriginal` spread with a minimal stub.
- **Files modified:** `src/services/ai/office/__tests__/teamTools.fileGeneration.test.ts`
- **Commit:** `3db8bfee`

**2. [Rule 3 - Blocking] Seed JSON developer fields initially not persisted**
- **Found during:** Task 2
- **Issue:** The first seed edit mutated the parsed object but wrote the pre-edit raw string, leaving role/capability/persona with worktree instructions.
- **Fix:** Replaced the exact string lines directly and validated the parsed JSON no longer contains `code_edit` in any employee.
- **Files modified:** `.planning/AI-STAFF-SDLC-TEAM.json`
- **Commit:** `5cc5888f`

**3. [Rule 1 - Bug] Orphan closing brace after deleting the coordinator test block**
- **Found during:** Task 3
- **Issue:** Deleting the worktree provisioning/ambiguity describe block left one extra `});`, breaking TypeScript parsing.
- **Fix:** Removed the orphan brace; `tsc --noEmit` clean.
- **Files modified:** `tests/services/ai/office/teamRunCoordinator.test.ts`
- **Commit:** `831cbc5c`

### Pre-existing failures left untouched

- `tests/services/ai/aiOrchestratorLoop.test.ts` — 5 failures at baseline (extra call-id argument to `executeToolFn`).
- `tests/views/TeamWorkspaceView.test.tsx` — 13 failures at baseline (budget formatting, missing settings affordance, stale roster/ledger expectations).
- One scheduler test (`lowers the limit mid-batch`) is timing-flaky under full-file runs; it passes in isolation and on a clean full-file rerun. Not caused by this plan; no fix applied.

## Auth gates

None.

## Known Stubs

None.

## Threat Flags

None new. Model-supplied `script` is dropped before delegation; capability and payload filters both exclude lead/ordinary employees; no new endpoint, auth path, file-access pattern or schema boundary was introduced.

## Self-Check: PASSED
