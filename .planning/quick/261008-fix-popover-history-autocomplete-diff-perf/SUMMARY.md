---
task_id: 261008-fix-popover-history-autocomplete-diff-perf
slug: fix-popover-history-autocomplete-diff-perf
date: 2026-10-08
type: quick
status: complete
---

# Quick Task Summary: Fix Diff Fullscreen Popover Z-Index, Terminal Command History & Skill Autocomplete, and Diff Refresh Performance

## Completed Work
1. **Fullscreen Popover Z-Index**:
   - In `AgentDiffReviewer.tsx`: Wrapped root component in Ant Design `<ConfigProvider theme={{ token: { zIndexPopupBase: 2000 } }}>` and lowered fullscreen container `zIndex` from `1100` to `999`.
   - Result: All Popconfirm (Revert All, Revert File), Tooltip (Accept/Reject hunk), and Dropdown menus float above the fullscreen diff reviewer cleanly.

2. **Terminal Command History**:
   - In `AgentTerminalLog.tsx`: Added `commandHistory`, `historyIndex`, and `draftText`.
   - Pressing `ArrowUp` navigates backwards into prior sent instructions.
   - Pressing `ArrowDown` navigates forward and restores user's in-progress draft text when reaching the latest position.

3. **Skill Autocomplete**:
   - Added Tauri command `list_available_skills` in `src-tauri/src/agent_skill_ops.rs` reading built-in commands, project skills from `.claude/skills/`, and user skills from `~/.claude/skills/`.
   - Created `src/services/agents/agentSkillService.ts` to load skills on initial mount and cache in-memory.
   - In `AgentTerminalLog.tsx`: Typing `/` opens a floating dropdown with keyboard navigation (`ArrowUp`, `ArrowDown`, `Tab`, `Enter`, `Escape`) to autocomplete commands.

4. **Performance & Hang Prevention on Large Repos**:
   - In `useGhostDevDiff.ts`: Filtered stream chunks to only trigger debounced `refreshDiff` when file-mutating tools (`Write`, `Edit`, `NotebookEdit`, `Bash`) execute, skipping read-only operations (`Read`, `Grep`, `Glob`, `WebSearch`).
   - In `AgentDiffReviewer.tsx`: Refined folder expansion so only folders containing changed files (`diffFiles`) and matching search queries are auto-expanded, avoiding expanding thousands of folders in large repos.
   - Added a `Diff (count)` vs `Tất cả (count)` scope switcher in the sidebar header to focus on changed files by default.

## Verification
- Vitest tests in `tests/agents/AgentTerminalLog.test.tsx` (8 tests) and `tests/agents/AgentControlView.test.tsx` (9 tests) passed cleanly (17/17 passed).
- Cargo check passed with zero errors.
