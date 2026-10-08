---
task_id: 261008-m80
slug: fix-agentcontrolview-test-failures-in-ag
date: 2026-10-08
type: quick
status: planned
---

# Quick Plan: Fix AgentControlView test failures in AgentDiffReviewer

## Goal
Fix 3 failing unit tests in `tests/agents/AgentControlView.test.tsx` caused by recent diff reviewer changes:
1. Tree folder collapse hiding changed file names (`scheduler.ts`, `demo.ts`)
2. Segmented toggle label renamed from `Side-by-side` to `Split`
3. Fullscreen toggle button aria-label mismatched between test and component

## Proposed Changes
- In `src/components/agents/AgentDiffReviewer.tsx`:
  - Ensure Tree expands folders properly (e.g. `expandedKeys` state controlled with `folderKeys`, `virtual={false}`) so child nodes are rendered in DOM.
  - Set Segmented option label back to `Side-by-side` for `split` mode.
  - Set fullscreen Button `aria-label` to `isFullscreen ? 'Thoát toàn màn hình diff' : 'Mở rộng diff toàn màn hình'`.
- Verify with `npx vitest run tests/agents/AgentControlView.test.tsx`.
