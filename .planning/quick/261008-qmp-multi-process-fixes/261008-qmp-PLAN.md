---
phase: quick-261008-qmp
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/hooks/useGhostDevDiff.ts
  - src/components/agents/AgentDiffReviewer.tsx
  - src/hooks/useGhostDevSessions.ts
  - src/components/agents/AgentSessionList.tsx
  - src/views/AgentControlView.tsx
  - src/components/agents/AgentTerminalLog.tsx
  - src/services/agents/agentLogStore.ts
autonomous: true
requirements: [QUICK-GHOST-DEV-MULTI-PROCESS-FIXES]
must_haves:
  truths:
    - In-memory per-worktree diff cache guarantees instant diff rendering on process switch with zero blank flicker
    - Sequential requestId token eliminates stale diff race conditions and drops
    - Diff panel renders an Ant Design Spin overlay while loading and disables action buttons
    - Stop process Popconfirm hides immediately upon confirmation and enters stopping state with spinner
    - Stopping session disables all user actions and card clicks until backend confirmation
    - Terminal log buffers remain isolated per task and never wiped on session switch or stop
    - Agent thinking state correctly reflects active processing and does not falsely stick on thinking when idle waiting for user
---

<objective>
Fix diff panel race conditions and slow loading, improve stop process UX with instant popover close and stopping indicator, and isolate multi-task terminal log state.
</objective>
