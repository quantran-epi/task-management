---
phase: 261122-ut7
plan: 01
status: complete
subsystem: ai-office
tags: [tool-task, cancellation, stopwatch, memoization, optimistic-update]
key_files:
  created:
    - src/components/ai/office/__tests__/toolTaskActivity.test.tsx
  modified:
    - src/components/ai/office/AgentActivityPanel.tsx
    - src/components/ai/office/TeamWorkspace.tsx
    - src/components/ai/runtime/toolTaskStore.ts
    - src/types/aiOffice.ts
commits:
  - 40e04955
  - d3aeef22
verification:
  - "npx tsc --noEmit — pass"
  - "npx vitest run src/components/ai/office/__tests__/toolTaskActivity.test.tsx — 3 passed"
  - "npx eslint <changed files> — pass"
---

# Quick task summary

- Finding 1 (cancelled shown as done): CONFIRMED — Rust emits `cancelled`; UI mapped to `done`. Fixed with widened status union and cancelled label/icon.
- Finding 2 (stopwatch uses last chunk): CONFIRMED — store rewrote `updatedAt` on every chunk. Fixed with stable `startedAt` owned by `toolTaskStore`.
- Finding 3 (memo signature): NOT CONFIRMED — `agentSnapshotSignature` already includes `resultPreview`, `detail`, `label`, `durationMs`, `endedAt` (commit b5ba22d35). Added a guard test.
- Finding 4 (stale toggle revert): CONFIRMED — error handler closed over render-time props. Fixed with a ref refreshed from the current team prop on every render.
