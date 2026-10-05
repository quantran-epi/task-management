---
phase: 15-ghost-dev-local-claude-code-headless-orchestration-with-agen
fixed_at: 2026-10-05T15:40:00Z
review_path: .planning/phases/15-ghost-dev-local-claude-code-headless-orchestration-with-agen/15-REVIEW.md
iteration: 1
findings_in_scope: 11
fixed: 11
skipped: 0
status: all_fixed
---

# Phase 15: Code Review Fix Report

**Fixed at:** 2026-10-05T15:40:00Z
**Source review:** .planning/phases/15-ghost-dev-local-claude-code-headless-orchestration-with-agen/15-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 11
- Fixed: 11
- Skipped: 0

## Fixed Issues

### CR-01: Integer Underflow in RUNNING_PROCESS_COUNT Bricks Session Launcher

**Files modified:** `src-tauri/src/agent_manager.rs`
**Commit:** c413d71
**Applied fix:** Removed duplicate `fetch_sub` in `stop_ghost_dev_session` and implemented `saturating_sub` in supervisor process wait handler to prevent underflow.

### CR-02: Path Traversal Vulnerability Leading to Arbitrary File Deletion

**Files modified:** `src-tauri/src/agent_manager.rs`
**Commit:** 1b78423
**Applied fix:** Canonicalized worktree path and target file path, rejecting paths containing `..` or escaping worktree boundary before checkout or deletion.

### CR-03: Broken Shell Permission Channel and Missing Claude Stdin Interception

**Files modified:** `src-tauri/src/agent_manager.rs`
**Commit:** 79ae33d
**Applied fix:** Created and stored `oneshot` approval channel in `pending_permissions`, paused reader loop until response received, piped approval/rejection JSON to child stdin, and logged audit entry.

### CR-04: Untracked New Files Completely Missing from Worktree Diff Reviewer

**Files modified:** `src-tauri/src/agent_manager.rs`
**Commit:** c70c927
**Applied fix:** Executed `git add -N .` prior to `git diff HEAD` so newly created files appear in unified diffs without modifying staging area.

### CR-05: Missing Master-Worker Subtask Dispatch Engine (D-05, D-06)

**Files modified:** `src-tauri/src/agent_manager.rs`, `src/utils/ghostDevPrompt.ts`
**Commit:** df5734d
**Applied fix:** Intercepted `dispatch_subtask` tool calls from Master stream, enforced 2-worker concurrency cap, spawned worker Claude process in worktree, piped worker stream events tagged with `worker_id`, and returned completion result to Master stdin.

### WR-01: Side-by-Side Diff Pairing Desynchronization on Multi-Line Hunks

**Files modified:** `src/components/agents/DiffHunkView.tsx`
**Commit:** 077eedb
**Applied fix:** Grouped contiguous deletion and addition blocks together up to `max(delCount, addCount)` for synchronized side-by-side hunk rows.

### WR-02: Invalid `orientation` Prop on Ant Design `Space` Component

**Files modified:** `src/components/agents/ShellPermissionModal.tsx`, `src/components/agents/AgentTerminalLog.tsx`, `src/components/agents/AgentSessionList.tsx`, `src/components/agents/AgentDiffReviewer.tsx`
**Commit:** 77c5ff7
**Applied fix:** Replaced invalid `orientation` prop with Ant Design standard `direction="horizontal"` and `direction="vertical"`.

### WR-03: `chrono_iso_now` Produces Raw Epoch String Instead of ISO-8601

**Files modified:** `src-tauri/src/agent_manager.rs`
**Commit:** 54730c8
**Applied fix:** Implemented calendar date-time formatting algorithm producing standard ISO-8601 UTC timestamp `YYYY-MM-DDTHH:MM:SSZ`.

### WR-04: User Concurrency Cap Setting Ignored by Rust Backend

**Files modified:** `src-tauri/src/agent_manager.rs`, `src/components/agents/RunGhostDevModal.tsx`
**Commit:** eaec6ab
**Applied fix:** Added `concurrencyCap` to `StartSessionPayload`, passed user-configured value from modal, and clamped concurrency limit (1..=12) in backend.

### WR-05: Session Status Overwrite from "interrupted" to "error"

**Files modified:** `src-tauri/src/agent_manager.rs`
**Commit:** b2ee64e
**Applied fix:** Checked if session status was marked `"interrupted"` upon process exit and preserved status instead of overwriting with `"error"`.

### WR-06: 3-Second Diff Polling Flips `loading` State Causing UI Jitter

**Files modified:** `src/hooks/useGhostDevDiff.ts`
**Commit:** 0023d9a
**Applied fix:** Added `silent` parameter to `refreshDiff`, allowing 3-second background polling to refresh silently without flipping `loading` spinner state.

---

_Fixed: 2026-10-05T15:40:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
