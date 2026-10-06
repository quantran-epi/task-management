---
phase: quick
plan: 261006-fxm
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/agents/RunGhostDevModal.tsx
  - src/utils/ghostDevPrompt.ts
  - src/services/agents/ghostDevConfig.ts
  - src/components/agents/AgentTerminalLog.tsx
  - src-tauri/src/agent_manager.rs
  - src/hooks/useGhostDevDiff.ts
  - tests/agents/promptBuilder.test.ts
autonomous: true
requirements: [QUICK-GHOSTDEV-MODAL-TERMINAL-LOCK]
must_haves:
  truths:
    - "Ghost Dev trigger modal uses editable text inputs for master and worker models accepting arbitrary model names"
    - "Ghost Dev trigger modal supports switching prompt language between Vietnamese and English and dynamically updates default prompt"
    - "Terminal log viewer unpacks type: 'result' events and array tool_results cleanly without dumping raw JSON"
    - "Terminal loading indicator stops displaying thinking spinner once AI finishes and shows completion duration text"
    - "Windows worktree creation strips read-only attributes, and diff hook avoids concurrent file locking during execution"
  artifacts:
    - src/components/agents/RunGhostDevModal.tsx
    - src/utils/ghostDevPrompt.ts
    - src/services/agents/ghostDevConfig.ts
    - src/components/agents/AgentTerminalLog.tsx
    - src-tauri/src/agent_manager.rs
    - src/hooks/useGhostDevDiff.ts
    - tests/agents/promptBuilder.test.ts
---

<objective>
Fix Ghost Dev trigger modal (editable model input + EN/VI prompt toggle), terminal result JSON parsing & completion indicator, and Windows file lock defense.
</objective>

<tasks>

<task type="auto">
  <name>Task 1: Modal editable model inputs, arbitrary model ID support, and VI/EN prompt language switcher</name>
  <files>src/components/agents/RunGhostDevModal.tsx, src/utils/ghostDevPrompt.ts, src/services/agents/ghostDevConfig.ts, tests/agents/promptBuilder.test.ts</files>
  <action>
    1. In src/services/agents/ghostDevConfig.ts: relax MODEL_ID_REGEX and sanitizeModelId to allow arbitrary non-empty trimmed strings.
    2. In src/utils/ghostDevPrompt.ts: update generateGhostDevMasterPrompt to accept optional language ('vi' | 'en', default 'vi'), implementing both Vietnamese and English master prompt templates.
    3. In src/components/agents/RunGhostDevModal.tsx:
       - Replace masterModel and workerModel Select controls with Input.
       - Add language selector (Segmented or Radio: 'vi' | 'en') in prompt section.
       - When language changes and prompt is not manually edited, regenerate prompt in chosen language.
       - Adjust extra instructions header to match selected language.
    4. In tests/agents/promptBuilder.test.ts: verify English and Vietnamese generation.
  </action>
  <verify>
    <automated>npm test tests/agents/promptBuilder.test.ts</automated>
  </verify>
</task>

<task type="auto">
  <name>Task 2: Fix terminal log type:result parsing, tool_result array unwrapping, and completion indicator</name>
  <files>src/components/agents/AgentTerminalLog.tsx, src/hooks/useGhostDevDiff.ts, src-tauri/src/agent_manager.rs</files>
  <action>
    1. In src/components/agents/AgentTerminalLog.tsx:
       - Add handler for msgType === 'result': extract val.result, num_turns, duration_ms, total_cost_usd, kind: 'ai_text' / completion summary instead of dumping raw JSON.
       - Unpack tool_result when content is an array of content blocks [{type: 'text', text: '...'}] or JSON array string: extract text strings cleanly.
       - Track when a turn finishes via 'result' event or chunk: stop showing spinner and show 'Hoàn thành / Done ({time})'.
    2. In src-tauri/src/agent_manager.rs: on Windows, run attrib -r on worktree files in ensure_git_worktree to prevent read-only attribute errors.
    3. In src/hooks/useGhostDevDiff.ts: pause diff execution if stream is currently active with tool calls or ai streaming to avoid file locking on Windows.
  </action>
  <verify>
    <automated>npm test tests/agents/promptBuilder.test.ts tests/agents/AgentControlView.test.tsx</automated>
  </verify>
</task>

</tasks>
