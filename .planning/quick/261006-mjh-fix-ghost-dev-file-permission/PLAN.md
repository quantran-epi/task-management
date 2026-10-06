---
status: complete
created: 2026-10-06
task: "Fix ghost dev file permission and worktree path alignment"
---

# Fix Ghost Dev File Permission and Worktree Path Alignment

## Objective
Fix Claude Code permission denial when writing files in Ghost Dev sessions:
1. Pass `--dangerously-skip-permissions` to Claude CLI in both Master and Worker processes in `src-tauri/src/agent_manager.rs`.
2. Pass `--add-dir` pointing to the root `repo_path` so Claude Code's sandbox explicitly allows operations across both the worktree and the repository.
3. Update `src/utils/ghostDevPrompt.ts` to clarify to the agent that it is operating inside an isolated Git worktree, guiding it to write files relative to the current working directory while having access to the repository context.
4. Update `tests/agents/promptBuilder.test.ts` to maintain test coverage.

## Tasks
1. [x] Task 1: Create quick task directory and PLAN.md.
2. [x] Task 2: Update `src-tauri/src/agent_manager.rs` for master & worker CLI arguments (`--dangerously-skip-permissions`, `--add-dir`).
3. [x] Task 3: Align prompt worktree description in `src/utils/ghostDevPrompt.ts` and update `tests/agents/promptBuilder.test.ts`.
4. [x] Task 4: Verify targeted test (`npx vitest run tests/agents/promptBuilder.test.ts`), write SUMMARY.md, update STATE.md.

