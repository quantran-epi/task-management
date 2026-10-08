---
task_id: 261008-m80
slug: fix-agentcontrolview-test-failures-in-ag
date: 2026-10-08
type: quick
status: complete
commit: pending
---

# Quick Task Summary: Fix AgentControlView test failures in AgentDiffReviewer

## Root Cause
1. `Tree` used `defaultExpandedKeys={expandedKeys}` with an initial empty state; when diff files loaded asynchronously, folders remained collapsed so files like `scheduler.ts` and `demo.ts` were not rendered in the DOM.
2. Segmented toggle label was renamed from `Side-by-side` to `Split` in commit `70f9e4e`.
3. Fullscreen button `aria-label` was changed to `'Thu nhỏ diff' : 'Toàn màn hình diff'`, mismatching the accessibility label expected by tests (`'Thoát toàn màn hình diff' : 'Mở rộng diff toàn màn hình'`).

## Key Changes
- `src/components/agents/AgentDiffReviewer.tsx`:
  - Made `expandedKeys` controlled with `folderKeys` auto-expansion and `virtual={false}` on `Tree`.
  - Reverted Segmented label to `Side-by-side` for `split` mode.
  - Aligned fullscreen toggle `aria-label` to `isFullscreen ? 'Thoát toàn màn hình diff' : 'Mở rộng diff toàn màn hình'`.

## Verification
- `npx vitest run tests/agents/AgentControlView.test.tsx` (9/9 passed)
- `npx vitest run src/utils/__tests__/gitDiffParser.test.ts tests/agents/AgentTerminalLog.test.tsx` (9/9 passed)
- `npx tsc --noEmit` (0 errors)
