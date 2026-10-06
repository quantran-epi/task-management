---
status: complete
date: 2026-10-06
slug: 261006-nog-fix-ghost-dev-subagent-tracking-log-filt
plan: 261006-nog
---

# Quick Task Summary: Fix Ghost Dev Subagent Tracking, Log Filtering, UI Contrast, and Loading Indicators

## Problem Identified
1. **Subagents Not Tracked**: Ghost Dev subagents spawned via native `Task` or `Agent` tools were not detected or registered into `session.state.active_workers`. Stream event chunks were not attributed to subagents (`worker_id: None`, `source: "master"`).
2. **Raw JSON Noise in Human View**: Internal system hooks (`hook_started`, `hook_response`, `init`, `telemetry`) and nested tool envelopes were rendered as raw JSON dumps in the human-friendly log stream.
3. **Dark Contrast Issue**: Dark background in `AgentTerminalLog` caused dark-on-dark contrast problems in Ant Design Segmented, Collapse, and Buttons.
4. **Missing AI Running Indicator**: While Claude Code AI was running or streaming, there was no active progress indication in `AgentTerminalLog` and `ChatMessageBubble` (when streaming with initial content).

## Fix Applied
1. **Subagent Detection & Tracking (`src-tauri/src/agent_manager.rs`)**:
   - Inspected `stream-json` events for `parent_tool_use_id`. Attributed `StreamEventChunk` to `worker_id: Some(parent_id)` and `source: "worker"`.
   - Extracted tool calls (`Task`, `Agent`, `dispatch_subtask`) from top-level and nested assistant message content blocks; registered subagents in `session.state.active_workers` and emitted `ghost-dev:session-updated`.
   - Extracted `tool_result` events to update subagent status to `done` or `error`.
   - Kept dual `--permission-mode bypassPermissions --dangerously-skip-permissions` with both worktree and repo root `--add-dir`.

2. **Master Prompt Alignment (`src/utils/ghostDevPrompt.ts`)**:
   - Explicitly instructed writing within the Git worktree directory.
   - Instructed using native `Task(description, prompt, subagent_type)` or `dispatch_subtask`.

3. **Terminal UI & Log Parsing (`src/components/agents/AgentTerminalLog.tsx` & `AgentControlView.tsx`)**:
   - Wrapped root in `ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}` for high-contrast dark theming.
   - Enhanced `parseStreamChunk` to unpack nested `tool_use` into `tool_call` and `tool_result` into `tool_result`.
   - Filtered out internal system hooks (`hook_started`, `hook_response`, `init`, `telemetry`) from the human-friendly log view (preserved in raw log mode).
   - Added dynamic subagent tab discovery in `allWorkers` switcher from `Task`/`Agent` tool calls.
   - Added `isRunning` prop and rendered an active spinner loading indicator (`Claude AI đang xử lý / suy nghĩ...`) at the bottom of the log stream.
   - Passed `isRunning={activeSession?.status === 'running'}` from `AgentControlView`.

4. **Chat Streaming Indicator (`src/components/ai/ChatMessageBubble.tsx`)**:
   - Rendered active processing badge whenever `isStreaming` is true, ensuring continuous visual feedback during streaming.

5. **Verification**:
   - `npx vitest run tests/agents/promptBuilder.test.ts tests/agents/AgentControlView.test.tsx tests/agents/AgentTerminalLog.test.tsx` (11 passing tests).
   - `npm run build` (TypeScript compilation & Vite production build successful).
   - `cargo check --manifest-path src-tauri/Cargo.toml` (0 errors).
