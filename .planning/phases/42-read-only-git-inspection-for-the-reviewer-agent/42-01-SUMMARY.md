---
phase: 42-read-only-git-inspection-for-the-reviewer-agent
plan: 01
subsystem: ai-office
tags: [team-tools, git, ssh, prompt-injection, read-only]
dependency_graph:
  requires:
    - src/services/gitRemoteService.ts (runGitCommand, escapeShellArg, existing readers)
    - src/services/gitRemoteTreeService.ts (getRemoteTree, getRemoteFileContent)
    - src/services/sshService.ts (getSshConfigById, getSshSecret)
    - src/services/ai/untrustedData.ts (wrapField, wrapUntrusted)
    - src/db/repositories/aiTeamRepo.ts (listTeamLinks)
  provides:
    - "git_read team tool: branches | status | log | diff_summary | diff_file | read_file | tree"
    - "TeamToolRefusalCode: SYSTEM_NOT_LINKED, NO_LINKED_REPO"
    - "getRecentCommits(config, repoPath, branch, limit, secret)"
  affects:
    - src/services/ai/office/teamRunCoordinator.ts (advertises git_read to both payloads, no edit needed)
    - .planning/phases/42-.../42-02-PLAN.md (reviewer prompt line)
    - .planning/phases/42-.../42-03-PLAN.md (injection + refusal + wrap tests)
tech-stack:
  added: []
  patterns:
    - "refusal-as-value: every failure path returns JSON.stringify(refuse(code, message))"
    - "context-sourced identity: systemId is only an index into the team's linked-system set"
    - "untrusted wrap at the tool-result boundary, label = action + repo path (D-11)"
key-files:
  created: []
  modified:
    - src/services/gitRemoteService.ts
    - src/services/ai/office/teamTools.ts
    - tests/services/ai/office/teamTools.test.ts
decisions:
  - "D-06: one git_read tool with a fixed seven-value action enum; no property accepts a command string, -c, --output or --ext-diff"
  - "D-07: repo resolved from team links; unlinked systemId -> SYSTEM_NOT_LINKED, repo-less or empty set -> NO_LINKED_REPO, ambiguous set -> INVALID_ARGUMENT listing candidates"
  - "D-08: handler never builds a command string; every value reaches a gitRemoteService/gitRemoteTreeService function that escapes per argument"
  - "D-09: git_read stays out of MUTATION_TOOLS and out of both role-only sets, so no coordinator edit and no approval card"
  - "D-11: every wrap label is `GIT <action> <repoPath> — <field>`"
  - "getRecentCommits added instead of faking a range: getCommitLog's base..target cannot express last-N of one branch"
metrics:
  duration: 4m
  completed: 2026-11-15T15:52:21Z
  tasks: 3
  files: 3
---

# Phase 42 Plan 01: git_read read-only remote git inspection Summary

One `git_read` team tool exposing seven fixed read actions over the existing SSH git services, with the repository resolved from the team's linked systems and every text leaf wrapped as untrusted data labeled with action plus repo path.

## What Was Built

**`src/services/gitRemoteService.ts`**
- `parseCommitLog(output)` — module-private, extracted from `getCommitLog`'s inline loop. `getCommitLog` now returns `parseCommitLog(output)`; one parser, no duplication.
- `getRecentCommits(config, repoPath, branch, limit, secret)` — `git log <escaped branch> -n <limit>`. `getCommitLog` builds `base..target`, which cannot express "last N commits of one branch" (`branch..branch` is empty; `branch~N` fails on a short branch).

**`src/services/ai/office/teamTools.ts`**
- `TeamToolRefusalCode` gains `SYSTEM_NOT_LINKED` and `NO_LINKED_REPO`. Argument-shape and execution failures reuse `INVALID_ARGUMENT`.
- `git_read` definition appended to `TEAM_TOOL_DEFINITIONS` with the seven-action enum, `required: ['action']`, and no free-form command parameter. Derived payloads pick it up for both agents with no coordinator edit.
- Module header corrected: `git_read` is the one handler that reaches the network; the rest stay offline.
- `resolveGitRepo(args, ctx)` — filters `listTeamLinks` to `itemType === 'system'`, loads each `systems` row, keeps those with non-empty `sshConfigId` + `remoteRepoPath`. A non-empty `args.systemId` is only an index into the linked set: absent from links → `SYSTEM_NOT_LINKED`; linked but repo-less → `NO_LINKED_REPO`; ambiguous set with no id → `INVALID_ARGUMENT` listing candidates; empty set → `NO_LINKED_REPO`; deleted SSH profile → `NO_LINKED_REPO`.
- `gitRead(args, ctx)` — narrows the resolution union with `'refused' in result`, then one `switch` over the seven actions, all inside a single `try/catch` returning `refuse('INVALID_ARGUMENT', err.message)`. `wrapCommits` helper wraps author (`wrapField`) and message (`wrapUntrusted`) for `log` and `diff_summary`.
- One `case 'git_read': return gitRead(input, ctx);` in `executeTeamTool`.

**`tests/services/ai/office/teamTools.test.ts`** — tool-count assertion bumped 10 → 11 and `'git_read'` added to the `arrayContaining` list, in the same commit that added the definition.

## Verification

- `npx tsc --noEmit -p tsconfig.json` — exit 0.
- `npx vitest run src/services/__tests__/gitRemoteService.test.ts` — 12 passed (regression gate for the parser extraction).
- `npx vitest run tests/services/ai/office/teamTools.test.ts` — 70 passed.
- `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts -t "composes the lead payload|resolves every advertised team tool name"` — 2 passed, 172 skipped.
- `grep -c "git_read" src/services/ai/aiTools.ts` → 0 (never mutation-classified).
- `git diff --stat` over the three plan commits touches only the three declared files.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — no new surface beyond the plan's `<threat_model>`.

## Requirements

`AIO-READ-04` and `AIO-READ-05` are implemented here but deliberately **not** marked complete: AIO-READ-05 requires "a test asserts the wrap is present", and those tests land in 42-03 (`tests/services/ai/office/teamToolsGitRead.test.ts`). 42-03 declares both ids and will close them.

## Self-Check: PASSED

- `src/services/gitRemoteService.ts` modified — FOUND
- `src/services/ai/office/teamTools.ts` modified — FOUND
- `tests/services/ai/office/teamTools.test.ts` modified — FOUND
- Commits `3d0a3ac2`, `e8c70873`, `d9095ea6` — FOUND
