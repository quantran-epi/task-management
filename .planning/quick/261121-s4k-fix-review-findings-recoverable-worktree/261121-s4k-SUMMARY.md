---
phase: 261121-s4k
plan: 01
subsystem: ai-office-worktree
tags: [worktree, recovery, error-classification, team-chat]
requires: [261121-qpp, 261121-r78]
provides:
  - LocalWorktreeError typed classifier
  - mutable worktree target with live resolver push
  - send-time ambiguity resolution from linked-system catalog
  - peer-correct bubble recipient for provisioning failures
affects: [teamRunCoordinator, TeamWorkspace, sshWorktreeService]
tech_stack:
  added: []
  patterns: [typed-error-classification, primitive-dep-effect, catalog-only-resolution]
key_files:
  created: []
  modified:
    - src/services/sshWorktreeService.ts
    - src/services/ai/office/teamRunCoordinator.ts
    - src/components/ai/office/TeamWorkspace.tsx
    - tests/services/ai/office/teamRunCoordinator.test.ts
    - tests/components/ai/office/TeamWorkspaceWorktreeTarget.test.tsx
decisions:
  - "Typed LocalWorktreeError replaces all local string marker matching"
  - "Ambiguity answer selects only a catalog row via name/code/repo-tail; never a raw path"
  - "Target swap refused while developer runtime is active; no coordinator teardown (WR-06)"
  - "Creation effect deps untouched; a primitive-deps effect pushes resolver changes"
metrics:
  duration: 25m
  completed: 2026-11-21
---

# Phase 261121-s4k Plan 01: Fix review findings recoverable worktree Summary

Local provisioning errors now use a typed `LocalWorktreeError`; provider copy with identical text stays sanitized. Worktree ambiguity is recoverable in the same session: the lead asks once, the next user answer is matched against linked-system names/codes/repo tails and applied before the next turn, with no coordinator rebuild.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | `063b4533` | fix(261121-s4k): typed local worktree errors and peer bubble recipient |
| 2 | `7c11128e` | feat(261121-s4k): live worktree target push and recoverable ambiguity |
| 3 | `a0561096` | test(261121-s4k): cover typed errors, peer addressing, and recovery |

## Findings Closed

- **CR-01**: `send()` resolves an ambiguity answer against `listLinkedSystems` catalog rows (name/code/repo tail via `extractRepoHintsFromText`), applies exactly one match to the mutable target, clears ambiguity, and never takes a raw path from text. Zero/multiple matches keep the question open. No coordinator recreate.
- **WR-01**: `LocalWorktreeError` is thrown only by app provisioning sites; `truthfulLocalReport` is `instanceof`-based. `LOCAL_ERROR_CODE_PREFIXES`, `LOCAL_ERROR_PHRASES`, `getWorktreeConfig`, and all text marker matching are removed.
- **WR-02**: `TeamWorkspace` has a separate effect on primitive resolver deps that calls `setAgentDeveloperWorktree` / `setWorktreeAmbiguousSystems`; the coordinator creation effect deps are unchanged.
- **WR-03**: `replyTarget`/`replyRecipient` are computed from the trigger row before `provisionAgentSession`; a `send_message`-triggered provisioning failure addresses the peer/lead, never `USER_PARTICIPANT_ID`.
- **WR-04**: regression asserts exactly one `messageKind === 'report'`, `runStatus === 'error'` bubble for the failing developer, with a matching team-log `kind === 'report'` row.
- **IN-01**: stale marker classifier comment replaced with typed classifier wording.

## Verification

- `npx tsc --noEmit` — clean.
- `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts -t 'truthful local errors' --reporter=dot` — 6 passed, 202 skipped.
- `npx vitest run tests/components/ai/office/TeamWorkspaceWorktreeTarget.test.tsx --reporter=dot` — 5 passed.
- Grep: no `LOCAL_ERROR_CODE_PREFIXES`, `LOCAL_ERROR_PHRASES`, or `getWorktreeConfig` remains in `teamRunCoordinator.ts`.
- Full Vitest suite not run (project rule: over an hour).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Spy on coordinator setter could not observe internal calls**
- **Found during:** Task 3
- **Issue:** `send()` calls lexical setter functions; `vi.spyOn(coordinator, 'setAgentDeveloperWorktree')` only replaces the returned object's property, so a spy would record zero calls even when resolution worked.
- **Fix:** Added two optional observation callbacks to `TeamRunCoordinatorOptions` (`onAgentDeveloperWorktreeSet`, `onWorktreeAmbiguousSystemsSet`) and invoked them inside the setters. Harness passes spies through those seams.
- **Files modified:** `src/services/ai/office/teamRunCoordinator.ts`, `tests/services/ai/office/teamRunCoordinator.test.ts`
- **Commit:** `a0561096`

### Auth gates

None.

## Threat Flags

None. No new network endpoint, auth path, file access pattern, or schema change; target selection is catalog-only and prompt names remain `wrapUntrusted`-framed.

## Known Stubs

None.

## Self-Check: PASSED
