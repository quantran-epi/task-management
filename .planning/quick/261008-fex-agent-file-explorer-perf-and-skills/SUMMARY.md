---
task_id: 261008-fex
slug: agent-file-explorer-perf-and-skills
date: 2026-10-08
type: quick
status: complete
commit: pending
---

# Quick Task Summary: Optimize File Explorer Performance, Exclusions, Mention in Chat, PC Reveal, and Claude Code Skills

## Problem
1. Typing search in File Explorer froze the app because `<Tree>` rendered thousands of real DOM nodes with `virtual={false}` without input debounce and auto-expanded all directories.
2. Switching between "Diff" and "All" had heavy delay due to un-excluded folders (e.g. `node_modules`, `dist`, `.git`).
3. File Explorer header text "THƯ MỤC LÀM VIỆC" broke onto two lines due to sidebar width constraint with horizontal Segmented tabs.
4. "Mở trong thư mục (Explorer)" called `open::that()` which opened code in a text editor instead of revealing the file inside PC Finder/File Explorer.
5. Terminal chat autocomplete was missing standard Claude Code commands like `/status`, `/goal`, `/doctor`, `/memory`, etc., as well as installed plugin skills.

## Key Changes
1. **File Tree & Exclusions (`src/utils/fileTreeBuilder.ts`)**:
   - Added `DEFAULT_EXCLUDED_PATTERNS` (`node_modules`, `.git`, `dist`, `build`, `target`, `.next`, `.turbo`, `.output`, `coverage`, `.cache`, `.DS_Store`).
   - Filtered worktree files through `isPathExcluded` with support for custom patterns.
2. **File Explorer UI & Performance (`src/components/agents/AgentDiffReviewer.tsx`)**:
   - Debounced search query by 200ms (`searchInput` -> `debouncedSearch`).
   - Virtualized `<Tree>` with container height measurement (`virtual={!isTestEnv}`), keeping `virtual={false}` only in jsdom tests.
   - Limited search auto-expansion to direct ancestors of matching items.
   - Restructured header: "Thư mục làm việc" on its own line with `whiteSpace: nowrap`, added Excludes Popover settings, and made Segmented full width (`block`).
   - Added read-only code preview with line numbers gutter, file type/syntax highlight selector (`detectLanguage`), copy content button, and PC explorer reveal button.
   - Added "Nhắc đến trong chatbox (@file)" in right-click context menu and toolbar calling `onMentionFile`.
3. **Chatbox Mention & Autocomplete (`src/components/agents/AgentTerminalLog.tsx`, `src/views/AgentControlView.tsx`)**:
   - Handled `mentionedFilePath` prop to append `@<path> ` into the chat input and focus.
   - Wired `onMentionFile` from `AgentDiffReviewer` to `AgentTerminalLog`.
   - Passed active session `worktreePath` to `loadAvailableSkills(repoPath)`.
4. **PC Explorer Reveal Command (`src-tauri/src/jira_proxy.rs`, `src-tauri/src/lib.rs`)**:
   - Added `reveal_in_file_explorer` command invoking native OS reveal (`open -R` on macOS, `explorer /select,` on Windows).
5. **Claude Code Builtin Commands & Plugin Scanning (`src-tauri/src/agent_skill_ops.rs`, `src/services/agents/agentSkillService.ts`)**:
   - Added all built-in commands (`status`, `goal`, `doctor`, `memory`, `model`, `permissions`, `fast`, `verbose`, `bug`, `summary`, `pr-comments`, `login`, `logout`, `terminal-setup`).
   - Added scanning for installed plugin skills in `~/.claude/plugins/installed_plugins.json` and multi-agent folders (`.agents/skills`, `.cursor/skills`, `.github/skills`).

## Verification
- `cargo check --manifest-path src-tauri/Cargo.toml` passed.
- `npx tsc --noEmit` passed (0 errors).
- `npx vitest run tests/agents/ src/utils/__tests__/fileTreeBuilder.test.ts` (47/47 passed across 10 test files).
