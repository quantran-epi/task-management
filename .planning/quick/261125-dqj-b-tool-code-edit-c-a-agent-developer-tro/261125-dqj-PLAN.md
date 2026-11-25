---
phase: quick
plan: 261125-dqj
type: execute
wave: 1
depends_on: []
files_modified:
  - src/services/ai/office/teamTools.ts
  - src/services/ai/office/__tests__/teamTools.codeEdit.test.ts
  - src/services/ai/office/__tests__/teamTools.fileGeneration.test.ts
  - src/services/ai/aiOrchestratorLoop.ts
  - src/services/ai/office/teamPrompts.ts
  - .planning/AI-STAFF-SDLC-TEAM.json
  - src/components/ai/office/TeamWorkspace.tsx
  - tests/services/ai/office/teamPrompts.test.ts
  - tests/components/ai/office/TeamWorkspaceWorktreeTarget.test.tsx
  - src/services/ai/office/teamRunCoordinator.ts
  - tests/services/ai/office/teamRunCoordinator.test.ts
autonomous: true
requirements:
  - CED-REMOVE
  - CED-FILEGEN
  - CED-NO-BLOCK
  - CED-PROMPT
  - CED-REGRESS
user_setup: []
must_haves:
  truths:
    - "Team chat no longer advertises or dispatches any SSH-worktree code-editing tool; Agent Developer produces code in its report instead"
    - "Agent Developer can create a downloadable file from model-supplied filename/format/content; the generated-file card appears on its team chat message"
    - "File generation never executes model-supplied JavaScript and is unreachable from the lead and from ordinary employees"
    - "A developer turn no longer depends on a provisioned worktree, so a team with no SSH/repo configuration still runs its developer normally"
    - "Lead and employee prompts, the AI-staff seed personas, and the team workbench no longer instruct or surface worktree editing"
    - "Targeted Vitest files and tsc --noEmit pass; the full suite is not run"
  artifacts:
    - path: "src/services/ai/office/teamTools.ts"
      provides: "Restricted developer-only file-generation team tool and capability gate"
      contains: "generate_code_file"
    - path: "src/services/ai/aiOrchestratorLoop.ts"
      provides: "Generated-file detection for the new team tool"
      contains: "generate_code_file"
    - path: "src/services/ai/office/teamPrompts.ts"
      provides: "Repurposed third exception and lead delegation line for code generation"
      contains: "FILE_GENERATION_EXCEPTION_LINE"
    - path: "src/components/ai/office/TeamWorkspace.tsx"
      provides: "Team chat with no Coding Zone trigger and no worktree picker"
      contains: "AiChatWidget"
    - path: "src/services/ai/office/teamRunCoordinator.ts"
      provides: "Developer turns without worktree provisioning; file-generation capability grant"
      contains: "fileGenerationAllowed"
  key_links:
    - from: "src/services/ai/office/teamRunCoordinator.ts"
      to: "src/services/ai/office/teamTools.ts"
      via: "toolContext sets fileGenerationAllowed for the stable developer id; AGENT_DEVELOPER_ONLY_TEAM_TOOLS limits the payload"
    - from: "src/services/ai/office/teamTools.ts"
      to: "src/services/ai/aiOrchestratorLoop.ts"
      via: "generate_code_file result JSON -> onFileGenerated -> ChatGeneratedFile"
    - from: "src/services/ai/aiOrchestratorLoop.ts"
      to: "src/components/ai/ChatMessageBubble.tsx"
      via: "generatedFiles persisted on the report row -> existing download card"
---

<objective>
Remove the worktree code-editing tool from Agent Developer in team AI chat and replace it with code generation plus a downloadable-file capability.

Purpose: Sếp wants the developer to produce code and hand it to the user as a file, not mutate an SSH worktree from the chat. Removing the tool also removes the worktree prerequisite that currently blocks developer turns on teams with no remote repo configured.

Output: Developer-only restricted file-generation tool, generated-file download cards on team reports, clean prompts/seed/UI, and targeted regression tests. No new dependency, no schema or backup change, no PWA/GitHub Pages work.

Naming choice (Claude's discretion): the team tool is named `generate_code_file`, distinct from the existing `generate_file` DB tool. The DB tool is mutation-classified because it accepts a `script` argument executed in the page realm; the team tool accepts content only, so it stays legal on a structurally read-only employee turn without weakening the mutation gate.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/STATE.md
@src/services/ai/office/teamTools.ts
@src/services/ai/aiOrchestratorLoop.ts
@src/services/ai/office/teamPrompts.ts
@src/services/ai/office/teamRunCoordinator.ts
@src/components/ai/office/TeamWorkspace.tsx
@src/components/ai/runtime/chatTurnRuntime.ts
@src/utils/fileExport.ts

Observed at planning time: `code_edit` lives only in the team layer — definition near teamTools.ts:459, handler near 1918, dispatch case near 2010, and the developer-only set near 130. The coordinator provisions a worktree before every developer turn (teamRunCoordinator.ts:2594), so a team without SSH/repo config refuses the turn before any model call. `generate_file` is in `MUTATION_TOOLS` (aiTools.ts:5156) and would be refused by the read-only policy in chatTurnRuntime.ts:440. `aiOrchestratorLoop.ts:553` turns a successful generate result into a `ChatGeneratedFile`; chatTurnRuntime.ts:432/578 persists it; ChatMessageBubble.tsx:1354 already renders the download card, so no new UI component is needed. `executeAiTool` is already imported in teamTools.ts and `exportContentAsFile` already sanitizes filenames (fileExport.ts:760). Coding Zone entry points exist only in TeamWorkspace.tsx (trigger near 744/1202/1383); its components and `sshWorktreeService.ts` stay on disk untouched, mirroring the hide-not-delete precedent of quick 261125-dax.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Replace the team worktree edit tool with a restricted developer file-generation tool</name>
  <files>src/services/ai/office/teamTools.ts, src/services/ai/aiOrchestratorLoop.ts, src/services/ai/office/__tests__/teamTools.codeEdit.test.ts, src/services/ai/office/__tests__/teamTools.fileGeneration.test.ts</files>
  <behavior>
    - TEAM_TOOL_DEFINITIONS contains exactly one `generate_code_file` entry with required filename and content, a closed format enum, and no script property; the retired worktree edit name is absent.
    - A context without fileGenerationAllowed refuses the call before any blob work; the lead-shaped and ordinary-employee-shaped contexts are refused.
    - Empty filename or empty content returns an INVALID_ARGUMENT refusal; valid content returns a success payload carrying filename, format, sizeBytes, and content.
    - A model-supplied `script` argument is dropped — executeAiTool is called with filename/format/content only.
    - aiOrchestratorLoop reports a generated file when the tool result carries success and filename.
  </behavior>
  <action>Write the replacement test file before touching production code, run it to see it fail, then implement. In src/services/ai/office/teamTools.ts remove the worktree edit definition, its handler, its dispatch case, its three refusal codes, the `worktreeDescriptor` context field, and the imports of `parseGitDiff`, `DiffHunk`, `CodeEditResult`, `WorktreeDescriptor`, `applyHunk`, `revertHunk`, `requireProvisionedWorktree` — keep `CODE_EDIT_AGENT_NAME` exported for legacy roster resolution. Add an exported `agentDeveloperFileToolName = 'generate_code_file'`, an optional `fileGenerationAllowed?: boolean` on TeamToolContext, and a TeamToolRefusalCode for the missing capability. Register a definition whose parameters are filename + format + content with `additionalProperties: false` and no script property; set `AGENT_DEVELOPER_ONLY_TEAM_TOOLS` to the new tool name so both payload filters follow automatically. The handler must first refuse without `ctx.fileGenerationAllowed`, then require non-empty filename and content, then call the already-imported `executeAiTool('generate_file', { filename, ...(format ? { format } : {}), content }, ctx.db, ctx.signal)` and return its JSON verbatim — never forward a `script` or any host/repo/path argument. In src/services/ai/aiOrchestratorLoop.ts add the new tool name to the generated-file detection condition at the site that currently checks generate_file/generate_pptx. Delete src/services/ai/office/__tests__/teamTools.codeEdit.test.ts and put the new cases in src/services/ai/office/__tests__/teamTools.fileGeneration.test.ts using the existing vi.mock style for executeAiTool. No new package, no approval-card change, no change to executeAiTool itself.</action>
  <verify>
    <automated>npx vitest run src/services/ai/office/__tests__/teamTools.fileGeneration.test.ts tests/services/ai/aiOrchestratorLoop.test.ts --bail=1 && npx tsc --noEmit</automated>
  </verify>
  <done>Only the restricted file-generation tool remains in the team layer; capability gate and argument stripping are test-proven; tsc clean; no other production file changed in this task.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Rewrite prompts, staff seed, and team workbench around generated files</name>
  <files>src/services/ai/office/teamPrompts.ts, .planning/AI-STAFF-SDLC-TEAM.json, src/components/ai/office/TeamWorkspace.tsx, tests/services/ai/office/teamPrompts.test.ts, tests/components/ai/office/TeamWorkspaceWorktreeTarget.test.tsx</files>
  <behavior>
    - The employee prompt keeps two exceptions for ordinary members and a third, repurposed exception for the developer that names file generation and forbids worktree/repo writes.
    - The lead prompt tells the lead to delegate code creation to Agent Developer and that the developer hands the user a downloadable file; it no longer asks the user to name a system for a worktree.
    - The AI-staff seed carries no worktree-editing instruction in any persona or capability.
    - TeamWorkspace renders no Coding Zone trigger and no worktree system picker; the composer and transcript behave identically otherwise.
  </behavior>
  <action>Start with the prompt assertions, confirm they fail, then implement. In src/services/ai/office/teamPrompts.ts export `FILE_GENERATION_EXCEPTION_LINE` in place of the worktree exception line and `LEAD_CODE_GENERATION_LINE` in place of the worktree delegation line; keep the existing "hai ngoại lệ / ba ngoại lệ" shape and the exact-text test convention. Remove `WORKTREE_AMBIGUITY_LINE` and the `worktreeAmbiguitySegment` input field and its render site. Keep the `codeEditAllowed` input field declared but unused in this task — Task 3 removes it together with its last caller, which keeps the tree compiling between tasks. Update tests/services/ai/office/teamPrompts.test.ts to import and assert the new constants, including that the developer-only exception is gated and the ambiguity line never appears. In .planning/AI-STAFF-SDLC-TEAM.json replace only the "Giới hạn" sentences in the five shared personas and the Agent Developer persona/capability so they say the developer creates code and a downloadable file for the user and nobody edits a worktree; do not touch skill bodies, ids, keys, or JSON structure. In src/components/ai/office/TeamWorkspace.tsx remove the codingZoneActive/descriptor/messages/trigger block, the worktree override and ambiguity effects, the picker callback, the codingZoneSlot prop, and the now-unused imports and local constant — leave AiChatWidget, transcript, composer, and activity rail untouched. Delete tests/components/ai/office/TeamWorkspaceWorktreeTarget.test.tsx since it covers removed UI. Do not delete or edit Coding Zone components, codingZonePopout utilities, or sshWorktreeService.ts.</action>
  <verify>
    <automated>npx vitest run tests/services/ai/office/teamPrompts.test.ts tests/views/TeamWorkspaceView.test.tsx --bail=1 && npx tsc --noEmit</automated>
  </verify>
  <done>Prompts and seed describe code generation only; team chat has no worktree affordance; tsc clean; standalone Coding Zone and SSH worktree modules remain byte-unchanged.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Drop worktree provisioning from the coordinator and grant the developer file capability</name>
  <files>src/services/ai/office/teamRunCoordinator.ts, tests/services/ai/office/teamRunCoordinator.test.ts, src/services/ai/office/teamPrompts.ts</files>
  <behavior>
    - A developer turn runs to completion with no worktree target, no SSH config, and no repository configured.
    - The developer request advertises generate_code_file and its tool context carries fileGenerationAllowed; the lead payload and an ordinary employee payload advertise no such tool.
    - The removed coordinator methods are absent from the public interface, and a message mentioning a system name no longer resolves or clears a worktree target.
    - Removing the worktree exception does not resurrect provider-error leakage: provider text still gets the sanitized bubble.
  </behavior>
  <action>Update the coordinator tests first, then the implementation. In src/services/ai/office/teamRunCoordinator.ts remove the worktree target state, ambiguity state, provisioned map, hydrate/settled helpers, provisioning call at the developer turn, ambiguity resolution in send(), their option fields and interface methods, and the now-unused imports of getSshConfigById, getSshSecret, LocalWorktreeError, provisionWorktree, requireProvisionedWorktree, WorktreeDescriptor, listLinkedSystems, extractRepoHintsFromText, repoPathTail, WORKTREE_AMBIGUITY_LINE, CODE_EDIT_AGENT_NAME. Keep `developerAgentId()` but simplify it to the stable `agentKind === 'developer'` marker with the legacy display-name fallback, now used only for tool capability. Remove the truthful-local-error branch tied to worktree provisioning and its exported helper; keep the sanitized provider path intact. In `toolContext`, grant `fileGenerationAllowed: true` only when the caller is that developer id, and stop populating the old worktree capability and worktree-scoped remoteTarget. In the employee prompt call drop the stale flag and remove the deprecated field from src/services/ai/office/teamPrompts.ts. In tests/services/ai/office/teamRunCoordinator.test.ts delete the provisioning-failure and ambiguity test block, strip the removed harness seams, and add payload assertions for the new tool plus one end-to-end developer turn with no worktree configuration. Do not touch budget, ledger, retry, or approval logic.</action>
  <verify>
    <automated>npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts --bail=1 && npx tsc --noEmit</automated>
  </verify>
  <done>Developer turns are worktree-independent; capability follows the stable developer id; lead and ordinary employees cannot generate files; tsc clean.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| model tool args → generate_code_file handler | filename, format, and content are model-authored and untrusted. |
| team roster → capability grant | The mutable display name and a model-supplied id must never grant the developer-only tool. |
| generated file → persisted chat message | Generated content is stored and rendered for download in the team transcript. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-dqj-01 | T (Tampering) | generate_code_file handler | medium | mitigate | Accept only filename/format/content with additionalProperties false; strip any script argument; delegate to executeAiTool so the existing sanitizeFilename and format inference apply. |
| T-dqj-02 | E (Elevation of privilege) | toolContext capability grant | high | mitigate | Grant fileGenerationAllowed only to the stable developer id on a non-lead turn; add the tool to AGENT_DEVELOPER_ONLY_TEAM_TOOLS so lead and employee payloads exclude it; handler refuses when the flag is absent. |
| T-dqj-03 | I (Information disclosure) | generate_code_file result | low | accept | Generated content is exactly what the model wrote and is already visible in the same turn's report; no new cross-team data path. |
| T-dqj-04 | T (Tampering) | removed worktree edit path | high | mitigate | Remove definition, dispatch case, and capability flag together; assert a non-developer and lead context cannot reach any file or blob verb. |
| T-dqj-SC | Tampering | npm/pip/cargo installs | high | accept | No package-manager install in this plan; only existing React, Dexie, and Vitest code is edited. |
</threat_model>

<verification>
1. `npx vitest run src/services/ai/office/__tests__/teamTools.fileGeneration.test.ts tests/services/ai/aiOrchestratorLoop.test.ts tests/services/ai/office/teamPrompts.test.ts tests/views/TeamWorkspaceView.test.tsx tests/services/ai/office/teamRunCoordinator.test.ts --bail=1` — pass (targeted files only; full suite takes over an hour and is not run).
2. `npx tsc --noEmit` — clean with strict settings; no unused imports left after the removals.
3. `git diff --name-only` — exactly the files in `files_modified`; no edits to `sshWorktreeService.ts`, Coding Zone components, Dexie schema, backup schemas, or PWA/GitHub Pages config.
4. Grep the team chat layer for the retired worktree edit tool name — zero hits in src/services/ai/office and src/components/ai/office; the seed JSON carries no worktree editing instruction.
</verification>

<success_criteria>
- Team chat advertises and dispatches no worktree code-editing tool.
- Agent Developer can emit a downloadable file from content, and the existing chat download card renders it on the report.
- File generation never runs model-supplied JavaScript and is unreachable from lead or ordinary employees.
- Developer turns run with no SSH worktree configured.
- Prompts, staff seed, and team workbench contain no worktree-editing instruction or control.
- Targeted Vitest files and tsc --noEmit pass; no full-suite run; no commit or push inside this plan.
</success_criteria>

<output>
Create `.planning/quick/261125-dqj-b-tool-code-edit-c-a-agent-developer-tro/261125-dqj-SUMMARY.md` when done
</output>
