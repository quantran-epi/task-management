---
task_id: 261008-tfe
slug: fix-agentdiffreviewer-tree-expansion
date: 2026-10-08
type: quick
status: planned
---

# Quick Plan: Fix AgentDiffReviewer tree expansion in AgentControlView tests

## Goal
Fix 2 failing unit tests in `tests/agents/AgentControlView.test.tsx` (`renders session list...` and `toggles diff reviewer full-screen mode...`) where `scheduler.ts` and `demo.ts` cannot be found by React Testing Library.

## Root Cause
Commit `9f0a894` migrated tree rendering to `buildWorktreeFileTree` and replaced custom tree logic with `<Tree blockNode showIcon={false} ...>`.
However:
1. `Tree` has no folder auto-expansion (`expandedKeys` or `defaultExpandAll`), so parent directory nodes (`src`, `src/utils`) remain collapsed by default. File nodes `demo.ts` and `scheduler.ts` are children of these directories and thus hidden from DOM.
2. In jsdom / testing-library, virtualization on `<Tree>` can skip DOM rendering when virtual scroll math evaluates height. Setting `virtual={false}` is required.

## Proposed Changes
1. `src/components/agents/AgentDiffReviewer.tsx`:
   - Compute `folderKeys` from `treeData` (recursively gathering all node keys where `isDir` is true or `!isLeaf`).
   - Maintain controlled `expandedKeys` state, initialized/updated when `folderKeys` change, and handled via `onExpand`.
   - Add `virtual={false}` to `<Tree>` component so all expanded nodes are rendered in DOM in jsdom and desktop.
2. Verify:
   - Run `npx vitest run tests/agents/AgentControlView.test.tsx`.
   - Run full test suite to ensure no regressions.
