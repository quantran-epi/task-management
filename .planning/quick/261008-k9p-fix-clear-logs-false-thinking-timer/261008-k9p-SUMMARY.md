---
phase: quick-261008-k9p
plan: 01
status: complete
date: 2026-10-08
commit: pending
files_modified:
  - src/services/agents/agentLogStore.ts
  - src/hooks/useGhostDevStream.ts
  - src/components/agents/AgentTerminalLog.tsx
  - src/views/AgentControlView.tsx
  - tests/agents/AgentTerminalLog.test.tsx
  - tests/agents/agentLogStore.test.ts
---

# Quick Task 261008-k9p: Fix Clear Logs False Thinking State & Timer Run

## Summary of Fixes

1. **Persistent Task Cleared State in `agentLogStore`**:
   - Added `clearedTasks: Set<string>` to `AgentLogStore`.
   - `clearLogs(taskId)` adds task to `clearedTasks`.
   - `addChunk(chunk)` resets `clearedTasks` when new output or user message arrives.
   - Exposed `isCleared(taskId)` querying whether logs for this task have been cleared.

2. **Hook & View Integration**:
   - `useGhostDevStream(taskId)` exposes `isCleared: boolean`, reactive to store updates and task switching.
   - `AgentControlView` passes `isCleared` to `AgentTerminalLog`.

3. **Terminal State Transitions**:
   - `AgentTerminalLog` incorporates `effectiveIsCleared` (`isCleared || clearedInternally`).
   - If `effectiveIsCleared` is true, `isThinking` returns `false` (no false loading status or spinner).
   - Cleared internal state automatically resets when new stream chunks arrive or task changes.

4. **Live Timer & Header Tag Accuracy**:
   - Live 1-second interval timer now only ticks when `isThinking` is true (actively executing/streaming/tool-calling).
   - When idle/waiting for user input, timer remains paused/frozen on completed turn duration.
   - Header metrics tag displays spinning loader only during active execution, and completed checkmark tag when idle.
