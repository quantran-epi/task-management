---
phase: quick-261008-qmp
plan: 01
status: complete
date: 2026-10-08
files_modified:
  - src/hooks/useGhostDevDiff.ts
  - src/components/agents/AgentDiffReviewer.tsx
  - src/hooks/useGhostDevSessions.ts
  - src/components/agents/AgentSessionList.tsx
  - src/views/AgentControlView.tsx
  - src/components/agents/AgentTerminalLog.tsx
  - src/services/agents/agentLogStore.ts
---

# Quick Task Summary: Ghost Dev Multi-Process Fixes

1. **Diff Panel Race Conditions & Loading**:
   - Added in-memory module-level `diffCache` per `worktreePath` for 0ms instant display upon switching processes.
   - Replaced `inFlightRef` drop logic with a sequential monotonic `requestId` token to prevent stale diff overrides.
   - Added Ant Design `<Spin>` overlay on `AgentDiffReviewer` with action buttons disabled during active fetch.

2. **Stop Process UX**:
   - Controlled `popconfirmOpenTaskId` closes Popconfirm synchronously upon clicking stop.
   - Introduced `stoppingTaskIds` tracked in `useGhostDevSessions`.
   - Rendered `<Tag color="orange" icon={<LoadingOutlined spin />}>Đang dừng...</Tag>` and disabled all clicks/actions on the stopping process card.

3. **Terminal Log & Multi-Task State**:
   - Removed accidental `clearLogs()` invocation on session stop in `AgentControlView`.
   - Reset `selectedAgent` to `'all'` on task switch in `AgentTerminalLog` to prevent logs from being filtered out.
   - Normalized `taskId` / `task_id` stream chunks in `agentLogStore`.
   - Overhauled `isThinking` calculation to avoid false "agent is thinking" states when idle or waiting for next user input.
