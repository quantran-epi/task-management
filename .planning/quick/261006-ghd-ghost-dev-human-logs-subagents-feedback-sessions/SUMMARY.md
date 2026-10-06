---
status: complete
date: 2026-10-06
task: "Fix ghost dev: human-friendly logs, subagent detection, AI response in feedback history, multi-session history"
---

# Ghost Dev Enhancements: Human Logs, Subagent Tracking, AI Feedback Pairing, Multi-Session History

## Completed Work

1. **Multi-Session History**:
   - `agentSessionHistoryRepo.ts`: Stopped overwriting past sessions of the same `taskId`. Sessions are now tracked and preserved independently by `sessionId`.
   - `AgentSessionList.tsx` and `AgentControlView.tsx`: Updated delete operations to target `sessionId` so deleting one run does not affect other runs of the same task.

2. **Subagent Interception & Prompt Update**:
   - `src-tauri/src/agent_manager.rs`: Intercepts Claude Code native `Agent` tool calls (`tool_name == "dispatch_subtask" || tool_name == "Agent"`) with parameter extraction (`prompt`, `description`, `subagent_type`/`role`, `model`).
   - `src/utils/ghostDevPrompt.ts`: Updated prompt instructions to direct Claude to use tool `Agent` or `dispatch_subtask` for parallel workers.

3. **Terminal UI (Human-Friendly Logs & Subagent Filtering)**:
   - `AgentTerminalLog.tsx`:
     - Added Segmented switcher for `Trực quan` (Human-friendly) and `Raw Log` (dark monospace stream with copy-all).
     - Added Agent Switcher tabs (`👑 Master Lead`, `⚡ Subagent Worker (...)`, `Tất cả`).
     - Implemented `parseStreamChunk` for stream-json events (Assistant AI responses, collapsible Tool calls, Tool results with success/error indicators, Security alerts, User feedback).

4. **AI Response Pairing in Audit History**:
   - `types/agent.ts`: Added `aiResponse?: string` to `UserFeedbackEntry`.
   - `useGhostDevStream.ts`: Automatically captures AI assistant responses following user feedback and attaches them via `attachAiResponseToLatestFeedback`.
   - `AgentControlView.tsx`: Rendered two-way conversation thread cards in the Audit Details drawer displaying user feedback paired with AI resolution.

## Verification
- `npx tsc --noEmit`: 0 errors.
- `npx vitest run tests/agents/agentSessionHistoryRepo.test.ts`: 8/8 passed.
