---
phase: 42-read-only-git-inspection-for-the-reviewer-agent
plan: 03
subsystem: ai-office
tags: [team-tools, git, ssh, prompt-injection, read-only, tests]
dependency_graph:
  requires:
    - src/services/ai/office/teamTools.ts (git_read handler, resolveGitRepo, refusal codes from 42-01)
    - src/services/gitRemoteService.ts (escapeShellArg, runGitCommand, getRecentCommits)
    - src/services/gitRemoteTreeService.ts (getRemoteTree, getRemoteFileContent)
    - src/services/ai/office/teamRunCoordinator.ts (oracleReadTools gate, commit 26f0eeed)
  provides:
    - "tests/services/ai/office/teamToolsGitRead.test.ts — 18 cases"
    - "injection proof: whole-command-string equality for filePath, branch, base"
    - "wrap proof: both delimiters + D-11 label for all seven actions"
    - "recorded AIO-READ-06 verdict at advertisement level"
  affects:
    - .planning/REQUIREMENTS.md (AIO-READ-04/05/06 closed)
tech-stack:
  added: []
  patterns:
    - "partial vi.mock with importOriginal, overriding only execRemoteCommand"
    - "clearAllMocks in beforeEach so mock.calls.at(-1) is scoped to the current case"
    - "whole-command-string toBe assertion, never a containment check (escaping preserves payload text)"
key-files:
  created:
    - tests/services/ai/office/teamToolsGitRead.test.ts
  modified: []
decisions:
  - "one table-driven loop covers the seven wrap cases; a per-action copy would drift"
  - "the diff_file case pins the escaped command as a literal, independent of escapeShellArg, so a handler change cannot be masked by the escape function changing too"
  - "AIO-READ-06 stays verify-only per D-13 — no gate code written, no prompt sentence added"
metrics:
  duration: 3m
  completed: 2026-11-15T15:58:16Z
  tasks: 3
  files: 1
---

# Phase 42 Plan 03: git_read injection, refusal, wrap and Oracle-gate proofs Summary

Eighteen tests in one new file close the phase on observed behaviour: the seven-action definition shape, all three refusal codes, the mutation-class absence, both untrusted delimiters plus the D-11 label on every action, and four adversarial shell payloads proven escaped by whole-command-string equality — with the Oracle gate re-run and recorded rather than rewritten.

## What Was Built

**`tests/services/ai/office/teamToolsGitRead.test.ts`** — new file, `// @vitest-environment node`.

Mock seam: `vi.mock('../../../../src/services/sshService', async (importOriginal) => ...)` spreads the real module and replaces only `execRemoteCommand`. `getSshConfigById` therefore reads the seeded `db.settings` row for real, and `getSshSecret` returns `null` outside Tauri. Real Dexie per case (`TestGitRead_<random>`), closed and deleted in `afterEach`.

Fixtures: one team + `ensureTeamThread`; one SSH profile under `SSH_CONFIGS_SETTING_KEY`; `repoSystemId` (`sshConfigId` + `remoteRepoPath: '/srv/repo'` + `defaultBaseBranch: 'main'`); `bareSystemId` (linked, no SSH profile, no repo path); a second team with no links at all.

**Task 1 — definition, repo resolution, mutation class (6 cases)**
- Seven-action enum exactly; `required: ['action']`; property key set exactly `action, base, branch, dirPath, filePath, limit, systemId, target` — no key that could carry a command string.
- `isMutationTool('git_read')` is `false`.
- `SYSTEM_NOT_LINKED` for an unlinked `systemId`; `NO_LINKED_REPO` for the empty team; `NO_LINKED_REPO` (not `SYSTEM_NOT_LINKED`) for the linked-but-repo-less system; `INVALID_ARGUMENT` for an action outside the enum.

**Task 2 — wrap and escape (12 cases)**
- Block A, table-driven over the seven actions: each asserts both delimiter phrases and the label prefix `GIT <action> /srv/repo`, plus `systemId` and `repoPath` on the parsed payload. `diff_summary` queues four responses in the real call order (rev-parse, log, `--numstat`, `--name-status`); the log response uses the `%x1e`/`%x00` layout `parseCommitLog` expects, so `commits` is non-empty and the case proves what it claims.
- Block B, `EVIL = "'; rm -rf /; echo '"`: `diff_file` compares the whole command to a literal independent of `escapeShellArg`; `read_file` compares against `escapeShellArg(EVIL + ':src/app.ts')`; `log` against `escapeShellArg(EVIL)`; `diff_summary` asserts the third of four calls (`--numstat` with `escapeShellArg(EVIL + '..main')`). No containment check anywhere — escaping preserves the payload text inside the quotes, so `not.toContain` would be vacuous.
- One case proves a `exitStatus: 128` git failure resolves to `{ refused: true, code: 'INVALID_ARGUMENT' }` via `resolves`, never the rejection matcher.

**Task 3 — Oracle gate (verify only, no code change)**
1. `src/services/ai/office/teamRunCoordinator.ts:1174-1179` — `oracleReadTools()` returns `ORACLE_READ_TOOLS` only when `(await getOracleToolConfig(db)).enabled === true`. Both `leadTools()` and `employeeTools()` spread it. Config is read per payload, not cached at module scope, so a mid-session toggle reaches the next turn (D-13). **PASS.**
2. `tests/services/ai/office/teamRunCoordinator.test.ts` — "advertises the Oracle read pair to both agents only when the Oracle tool is enabled" asserts both directions for both agents: absent from lead and employee payloads while disabled, present in both after `saveOracleToolConfig({ ...DEFAULT_ORACLE_CONFIG, enabled: true })`. **PASS.**
3. `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts -t "advertises the Oracle read pair"` — 1 passed, 173 skipped. **PASS.**

**Known coverage edge (accepted under D-13's verify-only scope, not fixed here):** AIO-READ-06 is proven at advertisement level only. Read-only enforcement at execution is covered by `src/services/ai/__tests__/oracleSqlclService.test.ts`. Nothing in this phase drives a real `oracle_query` through `makeExecuteToolFn` → `dispatchAiToolCall` → `executeAiTool`.

## Verification

- `npx vitest run tests/services/ai/office/teamToolsGitRead.test.ts` — 18 passed, 0 failed.
- `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts -t "advertises the Oracle read pair"` — 1 passed, 173 skipped.
- `npx vitest run tests/services/ai/office/teamTools.test.ts tests/services/ai/office/teamPrompts.test.ts tests/services/ai/office/teamRunCoordinator.test.ts tests/services/ai/office/teamToolsGitRead.test.ts` — 4 files, 305 passed, 0 failed (the phase regression gate: the 42-01 definition and count bump left both existing suites green).
- `npx tsc --noEmit -p tsconfig.json` — exit 0.
- `grep -c "toHaveLength(11)" tests/services/ai/office/teamTools.test.ts` → 1; `toHaveLength(10)` → 0.
- `git diff --stat` — empty. No source file modified by this plan.
- Acceptance greps: `execRemoteCommand: vi.fn` → 1; `clearAllMocks` → 1; `SSH_CONFIGS_SETTING_KEY` → 2; `isMutationTool('git_read')` → 1; `DỮ LIỆU KHÔNG ĐÁNG TIN — BẮT ĐẦU` → 1; `escapeShellArg` → 5; `not.toContain` → 0; `rejects` → 0; `'; rm -rf /; echo '` → 2 (the `EVIL` constant and the pinned literal).

## Deviations from Plan

None — plan executed exactly as written. Task 3 found the gate already correct, so no source change was made.

## Known Stubs

None.

## Threat Flags

None — no new surface beyond the plan's `<threat_model>`. T-42-01 (whole-command-string equality for `filePath`, `branch`, `base`, one case pinned to a literal, `clearAllMocks` keeping `mock.calls.at(-1)` case-scoped), T-42-02 (all three refusal codes pinned, including repo-less-but-linked), T-42-04 (both delimiters plus the D-11 label for all seven actions), T-42-09 (the two-direction Oracle gate test re-run) and T-42-SC (no package added) are all satisfied.

## Requirements

`AIO-READ-04`, `AIO-READ-05` and `AIO-READ-06` are all closed here. 42-01 and 42-02 deliberately left 04 and 05 open because their acceptance required the tests in this file.

## Self-Check: PASSED

- `tests/services/ai/office/teamToolsGitRead.test.ts` created — FOUND
- Commits `4af1eb26`, `d927c677` — FOUND
- `git diff --stat` empty — CONFIRMED (no source file touched)
- `.planning/REQUIREMENTS.md` AIO-READ-04/05/06 ticked — CONFIRMED
