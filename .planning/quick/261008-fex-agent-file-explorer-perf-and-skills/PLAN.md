---
task_id: 261008-fex
slug: agent-file-explorer-perf-and-skills
date: 2026-10-08
type: quick
status: in-progress
---

# Quick Plan: Optimize File Explorer, Exclusions, Mention in Chat, PC Explorer Reveal, and Slash Commands

## Goal
Fix freezing in file explorer search, eliminate delay when toggling trees, prevent header line break, reveal files in PC File Explorer/Finder, support file exclusion, support "mention in chatbox", and populate full Claude Code slash commands and plugin skills in autocomplete.

## Key Changes
1. `src/utils/fileTreeBuilder.ts`:
   - Add default exclude list (`node_modules`, `.git`, `dist`, `build`, `target`, `.next`, `.cache`, etc.).
   - Support configurable exclusions.
2. `src/components/agents/AgentDiffReviewer.tsx`:
   - Debounce search input (200ms).
   - In real browser runtime enable `<Tree virtual={true}>`, in jsdom tests disable virtualization.
   - Only expand matching ancestors during search instead of all directory nodes.
   - Fix header layout so "THƯ MỤC LÀM VIỆC" does not break line.
   - Right-click context menu: Add "Nhắc đến trong chatbox (Mention in chat)" calling `onMentionFile`.
   - Add language selector / file type toggle for file preview syntax highlighting.
3. `src/views/AgentControlView.tsx` & `src/components/agents/AgentTerminalLog.tsx`:
   - Support `onMentionFile(filePath)` to insert `@<filePath> ` into terminal prompt input.
   - Pass active session worktree path to `loadAvailableSkills(worktreePath)`.
4. `src-tauri/src/agent_diff_ops.rs` & `src-tauri/src/jira_proxy.rs` / `src-tauri/src/lib.rs`:
   - Add `reveal_in_file_explorer` command (macOS `open -R`, Windows `explorer /select,`, Linux `xdg-open`).
5. `src-tauri/src/agent_skill_ops.rs` & `src/services/agents/agentSkillService.ts`:
   - Add all built-in Claude Code commands (`/status`, `/goal`, `/doctor`, `/memory`, `/model`, `/permissions`, `/fast`, `/cost`, `/verbose`, `/bug`, `/summary`, `/pr-comments`).
   - Scan plugin skills from `~/.claude/plugins/cache/**/skills` and multi-agent folders.
