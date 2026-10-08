---
task_id: 261008-fix-popover-history-autocomplete-diff-perf
slug: fix-popover-history-autocomplete-diff-perf
date: 2026-10-08
type: quick
status: planned
---

# Quick Plan: Fix Diff Fullscreen Popover Z-Index, Terminal Command History & Skill Autocomplete, and Diff Refresh Performance

## Goal
1. Fix Popconfirm/Popover/Tooltip in `AgentDiffReviewer.tsx` disappearing or hidden behind diff panel when in fullscreen mode.
2. In `AgentTerminalLog.tsx`:
   - Support command history navigation with ArrowUp and ArrowDown keys.
   - Support slash command (`/`) autocomplete with skills loaded on initial mount (discovering skills from Tauri backend or built-in registry).
3. In `useGhostDevDiff.ts` and `AgentDiffReviewer.tsx`:
   - Optimize diff refresh: only trigger refresh on file-mutation tools (`Write`, `Edit`, `NotebookEdit`, `Bash`) and `session-finished` / `status_change` to `done`.
   - Prevent UI hang on large repos: avoid auto-expanding all unchanged folders, keep only diff-related folders expanded by default, and optimize tree rendering.

## Proposed Changes
1. `src-tauri/src/agent_manager.rs` & `src-tauri/src/lib.rs`:
   - Add `list_available_skills` command returning skill items `{ name, description, argument_hint }` parsed from user's `~/.claude/skills/*/SKILL.md` and project `.claude/skills/*/SKILL.md` plus built-ins.
2. `src/services/agents/agentSkillService.ts`:
   - Service to load available skills on initial load, caching them in memory.
3. `src/components/agents/AgentDiffReviewer.tsx`:
   - Wrap reviewer or set ConfigProvider with `zIndexPopupBase: 2000`, adjust fullscreen container `zIndex: 999` so all popovers/popconfirms float above it.
   - Refine `folderKeys` expansion to only auto-expand folders containing changed files (`diffFiles`) instead of every folder in the entire repo.
   - Add virtual height / maintain compatibility so tests and large trees both work cleanly.
4. `src/components/agents/AgentTerminalLog.tsx`:
   - Add command history (`ArrowUp`, `ArrowDown`, `draftText`).
   - Add `/` autocomplete dropdown loaded on mount.
5. `src/hooks/useGhostDevDiff.ts`:
   - Filter stream chunks so diff refresh is only debounced for mutation tools (`Write`, `Edit`, `NotebookEdit`, `Bash`).
