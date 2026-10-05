---
phase: 15-ghost-dev-local-claude-code-headless-orchestration-with-agen
reviewed: 2026-10-05T15:35:00Z
depth: standard
files_reviewed: 27
files_reviewed_list:
  - src-tauri/src/agent_manager.rs
  - src-tauri/src/lib.rs
  - src/App.tsx
  - src/components/agents/AgentDiffReviewer.tsx
  - src/components/agents/AgentSessionList.tsx
  - src/components/agents/AgentTerminalLog.tsx
  - src/components/agents/DiffHunkView.tsx
  - src/components/agents/DiffInlineCommentModal.tsx
  - src/components/agents/RunGhostDevModal.tsx
  - src/components/agents/ShellPermissionModal.tsx
  - src/components/settings/GhostDevConfigCard.tsx
  - src/components/shell/Navigation.tsx
  - src/components/tasks/TaskDrawer.tsx
  - src/components/tasks/TaskTable.tsx
  - src/hooks/useGhostDevDiff.ts
  - src/hooks/useGhostDevNotifications.ts
  - src/hooks/useGhostDevSessions.ts
  - src/hooks/useGhostDevStream.ts
  - src/services/agents/ghostDevConfig.ts
  - src/types/agent.ts
  - src/types/navigation.ts
  - src/utils/ghostDevPrompt.ts
  - src/utils/gitDiffParser.ts
  - src/utils/shellWhitelist.ts
  - src/views/AgentControlView.tsx
  - src/views/SettingsView.tsx
  - src/views/TasksView.tsx
findings:
  critical: 5
  warning: 6
  info: 2
  total: 13
status: issues_found
---

# Phase 15: Code Review Report

**Reviewed:** 2026-10-05T15:35:00Z
**Depth:** standard
**Files Reviewed:** 27
**Status:** issues_found

## Summary

Phase 15 implementation establishes core Ghost Dev architecture across React UI, custom diff rendering, shell whitelisting, and Tauri IPC bindings. However, adversarial review revealed 5 Critical blockers: atomic integer underflow in process count permanently locking session creation, arbitrary file deletion vulnerability via path traversal in `revert_file_diff`, broken shell permission interception loop with missing channel handling, invisible untracked files in diff queries, and unimplemented Master-Worker subtask dispatch backend.

---

## Critical Issues

### CR-01: Integer Underflow in RUNNING_PROCESS_COUNT Bricks Session Launcher
**File:** `src-tauri/src/agent_manager.rs:482` and `src-tauri/src/agent_manager.rs:524`
**Issue:** `stop_ghost_dev_session` calls `RUNNING_PROCESS_COUNT.fetch_sub(1, Ordering::SeqCst)`. When child process terminates from SIGKILL, background reader task at line 482 also executes `RUNNING_PROCESS_COUNT.fetch_sub(1, Ordering::SeqCst)`. Double subtraction underflows `AtomicUsize` from 0 to `usize::MAX` (18446744073709551615). Subsequent calls to `start_ghost_dev_session` permanently fail cap check (`current_running >= MAX_GLOBAL_PROCESSES`), bricking Ghost Dev until app restart.
**Fix:**
```rust
// Remove fetch_sub from stop_ghost_dev_session.
// Only decrement RUNNING_PROCESS_COUNT once when child.wait() returns in the supervisor task.
```

### CR-02: Path Traversal Vulnerability Leading to Arbitrary File Deletion
**File:** `src-tauri/src/agent_manager.rs:650-672`
**Issue:** `revert_file_diff` accepts unvalidated `file_path` string and constructs `path.join(&file_path)`. When `git checkout` fails, it executes `std::fs::remove_file(&full_file)`. A malicious or malformed path containing `../` can escape `worktree_path` and delete arbitrary files across user filesystem.
**Fix:**
```rust
let canonical_worktree = path.canonicalize().map_err(|e| e.to_string())?;
let target_file = path.join(&file_path);
let canonical_target = target_file.canonicalize().unwrap_or(target_file);
if !canonical_target.starts_with(&canonical_worktree) {
    return Err("Path traversal attempt detected".to_string());
}
```

### CR-03: Broken Shell Permission Channel and Missing Claude Stdin Interception
**File:** `src-tauri/src/agent_manager.rs:426-436` and `src-tauri/src/agent_manager.rs:689-702`
**Issue:** When unwhitelisted shell command is detected, `ShellPermissionRequest` is emitted, but no `oneshot` channel is inserted into `pool.pending_permissions`. Line reader loop never pauses or awaits approval. When frontend calls `respond_shell_permission`, `pool.pending_permissions.remove(&request_id)` fails with not found error, and response is never piped to Claude stdin.
**Fix:**
Insert `oneshot::channel` into `pending_permissions` before emitting request. Pause line processor awaiting `rx.await`. On response, feed approval/rejection JSON chunk into child stdin.

### CR-04: Untracked New Files Completely Missing from Worktree Diff Reviewer
**File:** `src-tauri/src/agent_manager.rs:539-565`
**Issue:** `get_worktree_diff` executes `git diff HEAD` and `git diff`. In Git, newly created files are untracked and produce zero output in both commands. New files created by agent never appear in `AgentDiffReviewer`.
**Fix:**
Execute `git add -N .` (intent-to-add) prior to `git diff HEAD` so newly added files are recognized in unified diff output without dirtying commit staging.

### CR-05: Missing Master-Worker Subtask Dispatch Engine (D-05, D-06)
**File:** `src-tauri/src/agent_manager.rs:410-445`
**Issue:** Specification requires Master Agent to dispatch subtasks to up to 2 concurrent Worker Agents via `dispatch_subtask`. In `agent_manager.rs`, `dispatch_subtask` tool call is never handled, worker process pool is never spawned, and `active_workers` / `worker_pids` remain dead data structures.
**Fix:**
Intercept `dispatch_subtask` tool calls from Master stream, spawn worker Claude process in same worktree with worker model, pipe worker stream events with `worker_id` tagged, and write structured completion result back to Master stdin upon worker exit.

---

## Warnings

### WR-01: Side-by-Side Diff Pairing Desynchronization on Multi-Line Hunks
**File:** `src/components/agents/DiffHunkView.tsx:150-173`
**Issue:** Loop only checks `lines[i+1]?.type === 'add'`. Consecutive deletions followed by consecutive additions leave leading deletions unpaired and pair only last deletion with first addition.
**Fix:**
Group contiguous deletion block and contiguous addition block, then pair indices up to `max(delCount, addCount)`.

### WR-02: Invalid `orientation` Prop on Ant Design `Space` Component
**File:** `src/components/agents/ShellPermissionModal.tsx:100`, `src/components/agents/AgentSessionList.tsx:145,177`, `src/components/agents/AgentTerminalLog.tsx:93,101`, `src/components/agents/AgentDiffReviewer.tsx:126,155,248,257,293`
**Issue:** `<Space>` in Ant Design expects `direction="vertical"` or `direction="horizontal"`. Using `orientation` is invalid; it is ignored and falls back to horizontal, distorting `ShellPermissionModal` into a single inline row.
**Fix:**
Replace `orientation="vertical"` and `orientation="horizontal"` with `direction="vertical"` and `direction="horizontal"`.

### WR-03: `chrono_iso_now` Produces Raw Epoch String Instead of ISO-8601
**File:** `src-tauri/src/agent_manager.rs:704-714`
**Issue:** Returns raw seconds string (e.g. `"1743859200"`). JavaScript `new Date(session.startedAt)` or `dayjs(session.startedAt)` produces `Invalid Date` or erroneous dates.
**Fix:**
Format RFC3339 / ISO8601 string: `2026-10-05T15:35:00Z` or use lightweight ISO formatter.

### WR-04: User Concurrency Cap Setting Ignored by Rust Backend
**File:** `src-tauri/src/agent_manager.rs:12,257`
**Issue:** `GhostDevConfigCard.tsx` configures concurrency cap (1–12), but backend hardcodes `MAX_GLOBAL_PROCESSES = 6` without reading frontend setting.
**Fix:**
Accept `concurrencyCap` in `StartSessionPayload` or retrieve it dynamically.

### WR-05: Session Status Overwrite from "interrupted" to "error"
**File:** `src-tauri/src/agent_manager.rs:484-495`
**Issue:** When stopped via `stop_ghost_dev_session`, status is set to `"interrupted"`. When SIGKILL kills child, `child.wait()` sees failure and overwrites status to `"error"`, firing false alarm failure notifications.
**Fix:**
Check if existing status in pool is `"interrupted"`; if so, do not overwrite with `"error"`.

### WR-06: 3-Second Diff Polling Flips `loading` State Causing UI Jitter
**File:** `src/hooks/useGhostDevDiff.ts:43,61`
**Issue:** Background polling triggers `setLoading(true)` every 3 seconds, causing reload spinner to spin continuously and empty state banners to flicker.
**Fix:**
Separate user-initiated `loading` from background silent refresh.

---

## Info

### IN-01: Clicking Horizontal Scrollbar on Code Line Triggers Comment Modal
**File:** `src/components/agents/DiffHunkView.tsx:58-75`
**Issue:** Overflow code element with horizontal scrollbar propagates click to parent `role="button"`, opening comment modal when trying to scroll.
**Fix:** Add `e.stopPropagation()` on scrollbar interactions or separate comment trigger button.

### IN-02: Duplicate Session Subscription in Navigation and AgentControlView
**File:** `src/components/shell/Navigation.tsx:25` and `src/views/AgentControlView.tsx:21`
**Issue:** Both views invoke `useGhostDevSessions()`, opening duplicate IPC event listeners for `ghost-dev:stream-chunk`.

---

_Reviewed: 2026-10-05T15:35:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
