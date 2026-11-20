---
phase: 48-agent-developer-workbench-ssh-worktree-coding-zone-popout-hu
plan: 01
subsystem: security
tags: [ssh, worktree, tauri, rust, git-apply, path-confinement, team-tools]
requires:
  - phase: 47-ssh-remote-explorer-ai-code-understanding
    provides: "read-only SSH remote tooling, path confinement patterns, remote chat target identity"
provides:
  - "Deterministic SSH remote worktree provisioning at Agent Developer session start with realpath verification"
  - "Confined worktree read/diff/apply/revert verbs rooted only at remoteWorktreePath"
  - "Role-gated code_edit team tool bound to request-bound provisioned descriptor"
  - "Agent Developer roster member with model claude-opus-5-5"
  - "Four Tauri SSH worktree commands: provision, list_files, read_file, apply_patch"
affects: [48-02, 48-03, 48-04]
tech-stack:
  added: []
  patterns:
    - "session-start worktree provisioning owns remoteWorktreePath; no repoPath fallback"
    - "lexical TS confinement plus Rust realpath + literal directory boundary"
    - "role-gated, request-bound team tool dispatch with untrusted result wrapping"
key-files:
  created:
    - src/types/codingZone.ts
    - src/services/sshWorktreeService.ts
    - src/services/__tests__/sshWorktreeProvision.test.ts
    - src/services/__tests__/sshWorktreeService.test.ts
    - src/services/ai/office/__tests__/teamTools.codeEdit.test.ts
  modified:
    - src-tauri/src/agent_diff_ops.rs
    - src-tauri/src/lib.rs
    - src/services/ai/office/teamRunCoordinator.ts
    - src/services/ai/office/teamTools.ts
    - src/services/ai/aiTools.ts
    - src/db/repositories/__tests__/aiOfficeImport.test.ts
    - .planning/AI-STAFF-SDLC-TEAM.json
key-decisions:
  - "Worktree path derived deterministically as <repo>/.taskmate-worktrees/agent-developer-<safe>; branch taskmate/agent-developer-<safe>"
  - "remoteRepoPath is provisioning-only; every edit/diff/read verb uses remoteWorktreePath only"
  - "Agent Developer session never activates without a provisioned descriptor; failure surfaces WORKTREE_NOT_AVAILABLE"
  - "code_edit offered only in Agent Developer payload and refused for lead/non-developer at handler"
patterns-established:
  - "Rust SSH worktree commands use connect_and_auth + build_remote_command base64 payload with shell-quoted args"
  - "Confined verbs reject absolute, ~, .. escapes, symlink escapes and paths equal to or under main checkout"
requirements-completed: [D-07, D-08, D-09, D-10]
duration: 21min
completed: 2026-11-20
---

# Phase 48 Plan 01: SSH Worktree Foundation Summary

**Deterministic SSH remote worktree provisioning at session start, confined worktree git verbs with realpath boundary enforcement, and a role-gated `code_edit` team tool bound to the provisioned Agent Developer session**

## Performance

- **Duration:** 21min
- **Started:** 2026-11-20T18:32:30Z
- **Completed:** 2026-11-20T18:53:37Z
- **Tasks:** 3
- **Files modified:** 12

## Accomplishments
- `provisionWorktree` owns session-start creation of a real remote worktree; Rust verifies `git worktree list` idempotency and `realpath` boundary before returning a descriptor with required `remoteWorktreePath`.
- All read/diff/apply/revert verbs run with cwd and target rooted at `remoteWorktreePath`; no main-checkout fallback and no raw `ssh_write_file` with a model path.
- `code_edit` is offered and accepted only for Agent Developer, uses only the request-bound provisioned descriptor, ignores model-supplied repo/path, and wraps result text as untrusted data.
- Real roster imports exactly one new Agent Developer employee with `claude-opus-5-5` and no skill warning.

## Task Commits

1. **Task 1: Define worktree contract and provision deterministic SSH remote worktree at session start** - `e2f9e5ff` (feat)
2. **Task 2: Build confined worktree read/diff/apply/revert service rooted only at remoteWorktreePath** - `88d57704` (feat)
3. **Task 3: Add role-gated code_edit team tool and Agent Developer roster entry** - `8bde6f70` (feat)

**Plan metadata:** `baf83c32` (docs: complete plan)

## Files Created/Modified
- `src/types/codingZone.ts` - WorktreeDescriptor, CodeEditArgs/Result/Refusal, sync payload, connection state types
- `src/services/sshWorktreeService.ts` - provisioning + deterministic derivation + confined verbs
- `src/services/__tests__/sshWorktreeProvision.test.ts` - derivation, idempotent command payload, no local write, session gate tests
- `src/services/__tests__/sshWorktreeService.test.ts` - confinement and verb routing tests
- `src/services/ai/office/__tests__/teamTools.codeEdit.test.ts` - role gate, descriptor binding, apply/revert, untrusted wrap tests
- `src-tauri/src/agent_diff_ops.rs` - four SSH worktree commands + `confine_worktree_path`
- `src-tauri/src/lib.rs` - registers four new Tauri commands
- `src/services/ai/office/teamRunCoordinator.ts` - session-start provisioning gate, developer-only payload filter
- `src/services/ai/office/teamTools.ts` - code_edit definition, dispatch, refusals
- `src/services/ai/aiTools.ts` - optional `additionalProperties` on tool parameter schema
- `src/db/repositories/__tests__/aiOfficeImport.test.ts` - updated real roster assertion
- `.planning/AI-STAFF-SDLC-TEAM.json` - added Agent Developer employee

## Decisions Made
- Rust and TS sanitizers use identical ASCII allow-list `[A-Za-z0-9_-]`, 40-char cap, for parity asserted by tests.
- Provisioning uses `git worktree add -b` only when `worktree list --porcelain` lacks the path; existing worktrees are reused without branch reset.
- TS lexical confinement is defence in depth; Rust realpath + literal `/` boundary is the enforcement point on the remote host.
- `code_edit` patch/hunk text comes from model args but is untrusted data; it never selects host, repo, worktree, or main-checkout path.

## Deviations from Plan

None - plan executed as written. TDD RED/GREEN commits were consolidated into one atomic feat commit per task to satisfy sequential per-task commit protocol.

## Issues Encountered
- Minor TDD expectation corrections (sanitizer output, absolute path rejection message, wrapped tool result JSON) resolved in tests before GREEN.
- Two pre-existing Rust visibility warnings in `src-tauri/src/tool_cancel.rs` remain unchanged and are out of scope for this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Plans 48-02/48-03/48-04 can build Coding Zone UI, diff review, and popout sync on the provisioned descriptor and confined verbs.
- Live SSH remote target availability remains a runtime preflight concern for the UI (D-18), not a code blocker.

---
*Phase: 48-agent-developer-workbench-ssh-worktree-coding-zone-popout-hu*
*Completed: 2026-11-20*
