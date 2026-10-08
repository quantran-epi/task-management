---
phase: quick-261008-jgo
plan: 01
status: complete
subsystem: ghost-dev
tags: [ghost-dev, metrics, timer, tokens, claude-code]
requires: []
provides: [agent-metrics-live-display]
affects: [AgentTerminalLog, AgentControlView]
tech-stack:
  added: []
  patterns: [live-timer-interval, stream-token-aggregation]
key-files:
  created:
    - src/utils/agentMetrics.ts
    - src/utils/__tests__/agentMetrics.test.ts
  modified:
    - src/components/agents/AgentTerminalLog.tsx
    - src/views/AgentControlView.tsx
decisions:
  - Aggregate turn result tokens and current turn in-flight message tokens to avoid duplicate counts
  - Display metrics in terminal header tag and status banners using Claude Code format (Xs / Xm Ys, tokens / k tokens)
metrics:
  duration: 4m
  completed: 2026-10-08
actuals:
  tokens: 12000
  tasks: 2
  commits: 2
---

# Quick Task 261008-jgo: Show timer and token count in Ghost Dev Summary

Live elapsed timer and accumulated token count implemented in Claude Code style for Ghost Dev agent terminal.

## Key Changes

1. **Pure metrics utility (`src/utils/agentMetrics.ts`) & test suite (`src/utils/__tests__/agentMetrics.test.ts`)**:
   - `extractTokenCount`: extracts and sums direct or nested usage tokens (`input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`).
   - `calculateSessionTokens`: sums all completed turn `result` events and tracks in-flight turn tokens without double-counting.
   - `formatDuration`: converts seconds to concise strings (`14s`, `1m 24s`).
   - `formatTokenCount`: converts token numbers to readable strings (`850 tokens`, `3.2k tokens`).

2. **UI Integration**:
   - `AgentControlView.tsx`: passed `startedAt` and `finishedAt` from `activeSession` to `AgentTerminalLog`.
   - `AgentTerminalLog.tsx`:
     - 1-second interval timer active when agent is running or thinking.
     - Live header tag displays elapsed time and accumulated tokens next to stream line count.
     - Thinking status banner and completed status banner show elapsed time and token totals.

## Verification

- `npx vitest run src/utils/__tests__/agentMetrics.test.ts` passed (19 tests).
- `npm run build` completed successfully.

## Self-Check: PASSED
- `src/utils/agentMetrics.ts`: FOUND
- `src/utils/__tests__/agentMetrics.test.ts`: FOUND
- Commits `d98149d` and `9f75db4`: FOUND
