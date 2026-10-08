---
task_id: 261008-tfe
slug: fix-agentdiffreviewer-tree-expansion
date: 2026-10-08
type: quick
status: complete
commit: pending
---

# Quick Task Summary: Fix AgentDiffReviewer tree expansion in AgentControlView tests

## Root Cause
Commit `9f0a894` replaced custom folder expansion with Ant Design `<Tree>` using `buildWorktreeFileTree`, but omitted controlled `expandedKeys` and `virtual={false}`. Folders containing changed files (`src/utils/scheduler.ts` and `src/demo.ts`) remained collapsed by default, preventing testing-library queries from finding `scheduler.ts` and `demo.ts` in the rendered DOM.

## Key Changes
- `src/components/agents/AgentDiffReviewer.tsx`:
  - Computed `folderKeys` recursively from `treeData` for all directory nodes.
  - Managed controlled `expandedKeys` state, keeping directories auto-expanded when new files arrive and listening to `onExpand`.
  - Added `virtual={false}` to `<Tree>` to guarantee full DOM rendering in jsdom and desktop environments.

## Verification
- `npx vitest run tests/agents/AgentControlView.test.tsx` (9/9 passed)
- `npx vitest run tests/agents/` (38/38 passed across 8 test files)
- `npx tsc --noEmit` (0 errors)
