---
status: complete
created: 2026-10-06
task: "Fix ghost dev: human-friendly logs, subagent detection, AI response in feedback history, multi-session history"
---

# Ghost Dev Enhancements: Human Logs, Subagent Tracking, AI Feedback Pairing, Multi-Session History

## Objective
Enhance Ghost Dev in Agent Control:
1. Multi-session history: Allow multiple runs of the same task without overwriting past audit history (keyed by `sessionId`).
2. Subagent interception: Intercept Claude Code native `Agent` tool in `agent_manager.rs` and update master prompt so subagents are properly spawned and tracked.
3. Terminal UI: Add Human-friendly vs Raw logs switcher, JSON stream parser for clean readable UI, and Agent tab switcher (Master / Workers) to inspect subagent streams.
4. AI Response pairing: Capture and render AI response alongside user feedback in the audit history drawer.

## Tasks
1. [x] Task 1: Update `types/agent.ts` and `agentSessionHistoryRepo.ts` for multi-session support and AI response pairing.
2. [ ] Task 2: Update `agent_manager.rs` to intercept `Agent` tool calls alongside `dispatch_subtask` and update `ghostDevPrompt.ts`.
3. [ ] Task 3: Enhance `AgentTerminalLog.tsx` with Human-friendly/Raw mode toggle, stream-json parser, and subagent tab filter.
4. [ ] Task 4: Connect AI response capture in `useGhostDevStream.ts` and render 2-way feedback/response threads in `AgentControlView.tsx` and `AgentSessionList.tsx`.
5. [ ] Task 5: Verification (TypeScript check and targeted component test).
