---
phase: quick
plan: 261006-nog
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/src/agent_manager.rs
  - src/utils/ghostDevPrompt.ts
  - src/components/agents/AgentTerminalLog.tsx
  - src/views/AgentControlView.tsx
  - src/components/ai/ChatMessageBubble.tsx
  - tests/agents/promptBuilder.test.ts
autonomous: true
requirements: [QUICK-GHOSTDEV-FIXES]
must_haves:
  truths:
    - "Ghost Dev tracks and displays subagents in the terminal switcher when spawned via Task, Agent, or dispatch_subtask"
    - "Terminal human-friendly tab parses nested tool use/result and hides noisy internal JSON hooks instead of dumping raw JSON"
    - "Terminal UI controls and segmented buttons have high contrast with no black text on dark background"
    - "Claude Code in worktree has write permission via bypassPermissions mode and add-dir configured for worktree and repo root"
    - "Active loading indicator displays when AI is streaming or running without completed response"
  artifacts:
    - src-tauri/src/agent_manager.rs
    - src/utils/ghostDevPrompt.ts
    - src/components/agents/AgentTerminalLog.tsx
    - src/views/AgentControlView.tsx
    - src/components/ai/ChatMessageBubble.tsx
  key_links:
    - "agent_manager.rs stream processor maps parent_tool_use_id and Task tool calls to worker sessions"
    - "AgentTerminalLog wraps dark theme ConfigProvider and parses nested assistant/user tool envelopes"
---

<objective>
Fix Ghost Dev subagent tracking, terminal log filtering, UI dark contrast, worktree write permissions, and add AI running loading indicators.

Purpose: Ensure Ghost Dev multi-agent sessions function smoothly without permission failures, provide readable human logs without raw JSON clutter, properly track spawned subagents in the terminal UI, and give clear visual feedback while AI is generating responses.
Output: Fixed backend process management and prompt builder, enhanced terminal log viewer with dark theme contrast and loading indicators, and updated targeted tests.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@src-tauri/src/agent_manager.rs
@src/utils/ghostDevPrompt.ts
@src/components/agents/AgentTerminalLog.tsx
@src/views/AgentControlView.tsx
@src/components/ai/ChatMessageBubble.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix worktree write permissions and subagent detection in agent_manager & prompt builder</name>
  <files>src-tauri/src/agent_manager.rs, src/utils/ghostDevPrompt.ts, tests/agents/promptBuilder.test.ts</files>
  <action>
    1. In src-tauri/src/agent_manager.rs:
       - Update master and worker CLI arguments: pass both "--permission-mode", "bypassPermissions", "--dangerously-skip-permissions", and add both worktree_path and repo_path via "--add-dir".
       - In stdout line processor: inspect stream-json events for parent_tool_use_id. When parent_tool_use_id is present, attribute StreamEventChunk to worker_id: Some(parent_id) and source: "worker".
       - Intercept tool calls embedded in assistant messages (val.message.content or val.content array) for tool names "Task", "Agent", or "dispatch_subtask". Record spawned subagent into session.state.active_workers and emit ghost-dev:session-updated.
       - When tool_result for that subagent id arrives, mark worker status as done or error.
    2. In src/utils/ghostDevPrompt.ts:
       - Update generateGhostDevMasterPrompt to specify the worktree directory as current working directory and instruct writing files within this worktree.
       - Instruct using native tool `Task(description, prompt, subagent_type)` or `dispatch_subtask` when delegating parallel tasks to subagents.
    3. Update tests/agents/promptBuilder.test.ts to verify the aligned prompt instructions.
  </action>
  <verify>
    <automated>npx vitest run tests/agents/promptBuilder.test.ts</automated>
  </verify>
  <done>Worktree permissions configured with bypassPermissions and add-dir, subagents tracked in agent_manager via parent_tool_use_id and Task tool interception, prompt builder tests pass.</done>
</task>

<task type="auto">
  <name>Task 2: Fix terminal log filtering, UI contrast, subagent tabs, and AI running indicators</name>
  <files>src/components/agents/AgentTerminalLog.tsx, src/views/AgentControlView.tsx, src/components/ai/ChatMessageBubble.tsx</files>
  <action>
    1. In src/components/agents/AgentTerminalLog.tsx:
       - Wrap component root in Ant Design `ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}` to resolve black-on-black contrast in Segmented, Collapse, Button, and Input.
       - Enhance parseStreamChunk to unpack nested tool_use inside assistant messages into kind "tool_call", and tool_result inside user messages into kind "tool_result".
       - Filter out internal system hooks (hook_started, hook_response, init, telemetry) from human-friendly view so they do not render as raw JSON dumps (raw log mode retains all entries).
       - In subagent tab discovery: parse Task/Agent tool calls from logs to register subagent tab items dynamically alongside activeWorkers prop.
       - Add `isRunning?: boolean` prop. When isRunning is true or sending is true, render a clean spinner loading indicator ("Claude AI đang xử lý / suy nghĩ...") at the bottom of the log stream.
    2. In src/views/AgentControlView.tsx:
       - Pass `isRunning={activeSession?.status === 'running'}` to AgentTerminalLog.
    3. In src/components/ai/ChatMessageBubble.tsx:
       - When isStreaming is true, ensure an active loading/processing badge or indicator remains visible while the AI turn is in progress.
  </action>
  <verify>
    <automated>npx vitest run tests/agents/AgentControlView.test.tsx</automated>
  </verify>
  <done>AgentTerminalLog renders with dark theme contrast, hides raw system JSON from human tab, exposes subagents in switcher tab, and shows active loading indicator while AI is running.</done>
</task>

<task type="auto">
  <name>Task 3: Run targeted tests and verify regression safety</name>
  <files>tests/agents/promptBuilder.test.ts, tests/agents/AgentControlView.test.tsx</files>
  <action>
    Run targeted test suite covering agent prompt builder and AgentControlView to confirm all touched components function properly with no TypeScript or runtime errors. Do not run unrelated test suites.
  </action>
  <verify>
    <automated>npx vitest run tests/agents/promptBuilder.test.ts tests/agents/AgentControlView.test.tsx</automated>
  </verify>
  <done>All targeted unit tests pass without regressions.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Ghost Dev worktree -> Main repo | Agent processes execute inside isolated git worktree branch |
| Claude Code process -> System | Bypassing permissions scoped to designated repository and worktree paths |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-Q-01 | Elevation of Privilege | agent_manager.rs | medium | mitigate | Worktree creation strictly scoped under .plannermate/worktrees and excluded in git |
| T-Q-02 | Tampering | AgentTerminalLog.tsx | low | mitigate | Sanitize rendered markdown and tool input formatting before display |
| T-Q-SC | Tampering | npm packages | low | accept | No new npm dependencies introduced |
</threat_model>

<verification>
Run targeted unit tests:
`npx vitest run tests/agents/promptBuilder.test.ts tests/agents/AgentControlView.test.tsx`
Verify clean TypeScript compilation:
`npm run build` or targeted tsc check on modified files.
</verification>

<success_criteria>
1. Subagents spawned by Claude Code via Task or Agent tools are detected and displayed in terminal switcher.
2. Human-friendly log tab parses tool calls/results and hides internal system hook JSON.
3. Dark theme contrast in AgentTerminalLog is fixed via ConfigProvider darkAlgorithm.
4. Worktree write permissions enabled via bypassPermissions and dual add-dir.
5. AI running loading indicator displays when session or chat turn is active.
6. Only targeted unit tests are executed and pass cleanly.
</success_criteria>

<output>
Create `.planning/quick/261006-nog-fix-ghost-dev-subagent-tracking-log-filt/261006-nog-SUMMARY.md` when done.
</output>
