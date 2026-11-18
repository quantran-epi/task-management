---
phase: 29-ssh-remote-repository-branch-diff-review
plan: 01
subsystem: git-remote-service
tags: [ssh, git, diff, branch, tauri, security]
status: complete
requires: []
provides:
  - "Typed remote git execution via Tauri native SSH bridge"
  - "POSIX shell argument escaping mitigating injection"
  - "Branch listing, status checking, commit log, diff summary parsing"
  - "Project-level SSH repo binding persistence and branch head drift check"
affects:
  - src/types/gitRemote.ts
  - src/services/gitRemoteService.ts
  - src/services/__tests__/gitRemoteService.test.ts
tech-stack:
  added: []
  patterns:
    - "POSIX single-quote escaping for shell arguments"
    - "Record separator (%x1e) and null-delimiter (%x00) git log parsing"
    - "Dexie settings table persistence for project repo configuration"
key-files:
  created:
    - src/types/gitRemote.ts
    - src/services/gitRemoteService.ts
    - src/services/__tests__/gitRemoteService.test.ts
  modified: []
decisions:
  - "Use Record Separator (%x1e) and null (%x00) delimiters for git log parsing to guarantee multiline commit message safety."
  - "Use single-quote wrapping with inner quote escaping for all remote git arguments to prevent command injection."
  - "Store project-level SSH repo binding in Dexie settings under `project_ssh_repo:{projectId}`."
metrics:
  duration: 4m
  completed: 2026-11-06T12:58:00Z
actuals:
  tokens: 28000
  tasks: 3
  commits: 3
plan_head_before: "ddf51665"
plan_head_after: "23b08776"
---

# Phase 29 Plan 01: SSH Remote Repository & Git Service Summary

Implemented foundational remote Git inspection service (`gitRemoteService.ts`) and data types (`gitRemote.ts`) using Tauri native SSH execution with strict POSIX shell argument escaping.

## Key Deliverables

1. **Strict TypeScript Types (`src/types/gitRemote.ts`)**:
   - `RemoteGitBranch`, `RemoteGitCommit`, `RemoteFileStat`, `RemoteGitStatus`, `RemoteDiffSummary`, `ProjectRepoSshBinding`.

2. **Core Remote Git Service (`src/services/gitRemoteService.ts`)**:
   - `escapeShellArg`: Wrap in single quotes and escape `'` to prevent command injection (T-29-01).
   - `runGitCommand`: Run `git -C <repoPath> --no-pager <args>` through `execRemoteCommand`.
   - `getRemoteBranches`: Query refs via `for-each-ref` and parse short branch names.
   - `checkDirtyStatus`: Run `status --porcelain=v1` to inspect dirty working tree files safely.
   - `getCommitLog`: Query commits using `%x1e` record separator and `%x00` null byte delimiter for clean multiline parsing.
   - `getDiffSummary`: Parse `--numstat` and `--name-status` to extract file changes, additions, deletions, and statuses.
   - `getFileDiff`: Extract raw diff for a specific file between base and target refs.
   - `getProjectRepoSshBinding` / `saveProjectRepoSshBinding`: Store project repo configuration in Dexie DB.
   - `checkHeadDrift`: Compare remote branch `rev-parse` output with expected head SHA.

3. **Comprehensive Unit Tests (`src/services/__tests__/gitRemoteService.test.ts`)**:
   - 14 tests covering shell escaping, branch discovery, porcelain status check, multiline commit logs, diff aggregation, single file diff, drift check, and Dexie settings binding.

## Verification
- Vitest suite `src/services/__tests__/gitRemoteService.test.ts` passed: 14 tests green.

## Self-Check: PASSED
- `src/types/gitRemote.ts` exists.
- `src/services/gitRemoteService.ts` exists.
- `src/services/__tests__/gitRemoteService.test.ts` exists.
- Commits `0d7e0dde`, `d4e5e912`, `23b08776` exist in history.
