---
status: diagnosed
trigger: "fail, có chắc là đang dùng runAiOrchestratorLoop không thế, chỉ thấy 1 request LLM, và khi request xong, màn hình trắng xoá, thấy console có lôix này TypeError: undefined is not an object (evaluating 'solution.sourceHashes.includes')"
created: 2026-11-01T00:00:00Z
updated: 2026-11-01T00:00:00Z
---

## Current Focus

hypothesis: Malformed solution object constructed in ProjectSdlcView.tsx during auto-extraction and draft typing lacks sourceHashes (and SdlcArtifactRef fields), causing detectWorkflowStaleness in SdlcStaleBanner to throw TypeError during re-render; runAiOrchestratorLoop is genuinely executed but only runs 1 turn because LLM generates markdown directly without tool calls.
test: Confirmed via codebase inspection of StepChatPanel.tsx, ProjectSdlcView.tsx, and stalenessDetector.ts.
expecting: Diagnosis complete.
next_action: Report root cause to caller.

## Symptoms

expected: Clicking 'Bắt đầu phân tích Solution' on Step 1 switches to Step 2, sends structured prompt into right panel, shows live streaming text/status, and populates extracted SOLUTION.md into editor upon completion.
actual: fail, có chắc là đang dùng runAiOrchestratorLoop không thế, chỉ thấy 1 request LLM, và khi request xong, màn hình trắng xoá, thấy console có lôix này TypeError: undefined is not an object (evaluating 'solution.sourceHashes.includes')
errors: TypeError: undefined is not an object (evaluating 'solution.sourceHashes.includes')
reproduction: Test 2 in 25.2 UAT
started: Discovered during 25.2 UAT

## Eliminated

- hypothesis: runAiOrchestratorLoop is not wired or bypassed.
  evidence: StepChatPanel.tsx line 259 explicitly calls runAiOrchestratorLoop. It stops after 1 loop because LLM generated solution markdown directly without invoking tools (0 tool calls).
  timestamp: 2026-11-01T00:00:00Z

## Evidence

- timestamp: 2026-11-01T00:00:00Z
  checked: src/components/sdlc/chat/StepChatPanel.tsx lines 259-338
  found: runAiOrchestratorLoop is imported and executed on message send. After loop finishes, line 333-338 extracts solution markdown via extractSolutionMarkdown(cleanCommittedResponse) and calls onSolutionExtracted(solutionMarkdown).
  implication: runAiOrchestratorLoop is indeed running. Single LLM request occurs because the prompt supplies full PL01 and PL02 context, prompting the model to generate the markdown output immediately without tool calls.

- timestamp: 2026-11-01T00:00:00Z
  checked: src/views/ProjectSdlcView.tsx lines 164-187 and 206-228
  found: Both handleSolutionExtracted and handleDraftChange construct an ad-hoc dummy object into workflowState.artifacts.solution when it was previously undefined: `{ type: 'solution', version: 1, createdAt: ..., updatedAt: ..., stale: false, content: draftMarkdown }`.
  implication: This object violates SdlcArtifactRefSchema. Specifically, it has no `sourceHashes` property (also missing `hash`, `kind: 'SOLUTION'`, `title`).

- timestamp: 2026-11-01T00:00:00Z
  checked: src/services/wizard/stalenessDetector.ts lines 36-39
  found: detectWorkflowStaleness checks `if (solution)` and then `const isPl01MissingInSource = currentPl01Hash ? !solution.sourceHashes.includes(currentPl01Hash) : false;`.
  implication: Because PL01 exists from Step 1, currentPl01Hash is a defined string. solution.sourceHashes is undefined. Evaluating undefined.includes(currentPl01Hash) throws TypeError: undefined is not an object (evaluating 'solution.sourceHashes.includes').

- timestamp: 2026-11-01T00:00:00Z
  checked: src/components/sdlc/common/SdlcStaleBanner.tsx line 30 and SdlcWorkspace.tsx lines 60-64
  found: SdlcStaleBanner runs detectWorkflowStaleness(workflowState) synchronously in render. When setWorkflowState is called with the malformed solution artifact, React re-renders, throws during render, unmounts the component tree without an error boundary, causing a white screen.

## Resolution

root_cause: In ProjectSdlcView.tsx, handleSolutionExtracted (lines 168-180) and handleDraftChange (lines 210-221) construct an invalid pseudo-artifact in workflowState.artifacts.solution without sourceHashes (and missing hash, kind, title). When PL01/PL02 are present, SdlcStaleBanner calls detectWorkflowStaleness(workflowState), which attempts to evaluate solution.sourceHashes.includes(currentPl01Hash), throwing TypeError: undefined is not an object (evaluating 'solution.sourceHashes.includes') and crashing the React render tree into a blank screen. Additionally, runAiOrchestratorLoop was indeed called, but because the model generated markdown directly without tool calls, the orchestrator loop naturally completed in 1 turn.
fix: 
verification: 
files_changed: []
