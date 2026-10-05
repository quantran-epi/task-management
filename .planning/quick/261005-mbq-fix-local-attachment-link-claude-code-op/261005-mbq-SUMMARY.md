---
phase: quick
plan: 261005-mbq
subsystem: desktop-integration
tags: [tauri, local-paths, claude-code, windows-cmd, document-links]
requires:
  - phase: quick
    provides: Existing local attachment link handling, Tauri path open commands, and Claude terminal launch flow
provides:
  - Dedicated Tauri command `launch_claude_at_local_path` for local-path Claude Code launches
  - Windows direct `cmd.exe /d /k claude` launch with selected path as working directory
  - Frontend routing from local attachment Claude option to dedicated native command
  - Targeted Vitest coverage for Tauri command routing and browser fallback
  - Rust unit tests for command spec and path resolution, pending local Rust tool availability to run
affects: [desktop-local-links, document-links, tauri-ipc]
tech-stack:
  added: []
  patterns:
    - Fixed native command plus `current_dir` for user-controlled local paths instead of shell interpolation
    - Browser fallback remains clipboard-only for runnable Claude command
key-files:
  created: []
  modified:
    - src-tauri/src/jira_proxy.rs
    - src-tauri/src/lib.rs
    - src/utils/documentLinks.tsx
    - tests/utils/documentLinks.test.ts
key-decisions:
  - "Use dedicated `launch_claude_at_local_path` Tauri command for attachment local paths instead of reusing shell command launcher."
  - "On Windows, spawn `cmd.exe` directly with fixed `/d /k claude` args and pass user path only as `current_dir`."
requirements-completed:
  - QUICK-261005-MBQ
duration: 7min
completed: 2026-10-05
---

# Quick 261005-mbq: Fix Local Attachment Claude Code Launcher Summary

**Local attachment Claude option now invokes a dedicated Tauri command that launches Claude Code from Windows `cmd.exe` at the selected path while preserving File Explorer and browser clipboard fallback.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-10-05T09:14:09Z
- **Completed:** 2026-10-05T09:21:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added `launch_claude_at_local_path(path)` native command and registered it with Tauri invoke handler.
- Resolved local paths safely: trim/file URI cleanup, missing path rejection, directory passthrough, file-to-parent directory.
- Windows local-path Claude launch uses direct `cmd.exe` with fixed `/d`, `/k`, `claude` args and working directory set separately.
- Updated React utility so Tauri local-path Claude flow invokes `launch_claude_at_local_path`, not `launch_claude_terminal`.
- Kept File Explorer action wired to `open_local_path` and browser fallback clipboard behavior unchanged.

## Task Commits

1. **Task 1: Add native local-path Claude Code launcher using Windows cmd.exe** - `8e6dd6c` (feat)
2. **Task 2: Wire local attachment Claude option to dedicated native launcher** - `6964979` (fix)

## Files Created/Modified

- `src-tauri/src/jira_proxy.rs` - Added path cleanup helper, local-path working directory resolver, dedicated Claude local path Tauri command, and Rust unit tests.
- `src-tauri/src/lib.rs` - Registered `jira_proxy::launch_claude_at_local_path` in invoke handler.
- `src/utils/documentLinks.tsx` - Routed Tauri local-path Claude action to dedicated native command and updated success text.
- `tests/utils/documentLinks.test.ts` - Added Tauri invoke mock and regression coverage for dedicated command routing.

## Decisions Made

- Dedicated local-path command avoids changing existing `launch_claude_terminal`, which remains for AI prompt launches.
- User-controlled path is never interpolated into Windows shell command; it is passed only as process working directory.
- Browser mode remains clipboard-only because native launch is unavailable outside Tauri.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Factored file URI cleanup for shared native path handling**
- **Found during:** Task 1
- **Issue:** New command needed same `file://` cleanup rules as `open_local_path`; duplicating logic risks drift.
- **Fix:** Added `clean_file_uri_path` and reused it for `open_local_path` plus `launch_claude_at_local_path`.
- **Files modified:** `src-tauri/src/jira_proxy.rs`
- **Verification:** Vitest passed; Rust tests added but local Cargo unavailable.
- **Committed in:** `8e6dd6c`

**Total deviations:** 1 auto-fixed (Rule 2)
**Impact on plan:** Required for correctness and consistency. No scope creep.

## Verification

- `npx vitest run tests/utils/documentLinks.test.ts` - PASSED, 18 tests.
- `cargo test --manifest-path src-tauri/Cargo.toml launch_claude_local_path --lib` - BLOCKED, `cargo: command not found` in execution environment.
- `cargo check --manifest-path src-tauri/Cargo.toml` - BLOCKED, `cargo: command not found` in execution environment.

## Issues Encountered

- Rust toolchain not available in current Git Bash PATH. `cargo` and `/c/Users/quantd/.cargo/bin/cargo.exe` both missing, so Rust checks could not run here.

## Known Stubs

None.

## Threat Flags

None beyond threat surfaces declared in PLAN.md. New Tauri IPC and native process spawn were covered by `T-261005-MBQ-01` through `T-261005-MBQ-03`.

## User Setup Required

None.

## Next Phase Readiness

- Frontend routing verified with targeted Vitest.
- Rust code contains targeted unit tests but needs Rust toolchain available to run `cargo test` and `cargo check`.

## Self-Check: PASSED

- Created/modified files exist.
- Task commits `8e6dd6c` and `6964979` exist in git history.
- Summary written to `.planning/quick/261005-mbq-fix-local-attachment-link-claude-code-op/261005-mbq-SUMMARY.md`.

---
*Phase: quick*
*Completed: 2026-10-05*
