---
phase: 42-read-only-git-inspection-for-the-reviewer-agent
fixed_at: 2026-11-15T23:30:00Z
review_path: .planning/phases/42-read-only-git-inspection-for-the-reviewer-agent/42-REVIEW.md
iteration: 1
findings_in_scope: 15
fixed: 14
skipped: 1
status: partial
---

# Phase 42: Code Review Fix Report

**Fixed at:** 2026-11-15T23:30:00Z
**Source review:** `.planning/phases/42-read-only-git-inspection-for-the-reviewer-agent/42-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 15 (3 critical, 12 warning)
- Fixed: 14
- Skipped: 1 (WR-10 — already covered)

## Fixed Issues

### CR-01: Model-supplied revision args parsed as git options

**Files modified:** `src/services/gitRemoteService.ts`, `src/services/gitRemoteTreeService.ts`, `src/services/ai/office/teamTools.ts`, `tests/services/ai/office/teamToolsGitRead.test.ts`, `src/services/__tests__/gitRemoteService.test.ts`, `src/services/__tests__/gitRemoteTree.test.ts`
**Commit:** `bc0b3829`, `64f8281e`, `d90e6748`
**Applied fix:** Both layers, as directed. Handler: new `revisionArg()` refuses any revision-shaped value starting with `-` before a command is built (refusal, not strip). Service: `--end-of-options` added before every revision argument in `log`, `rev-parse`, `show`, `ls-tree` and `diff`. One correction to the review's suggested patch: `rev-parse` needs `--verify` too — plain `rev-parse --end-of-options main` echoes the literal `--end-of-options` back as a revision, which would have corrupted `headSha`. Verified against git 2.50.1: `--end-of-options` blocks `--output` for `log`, `show`, `diff`.

**Status:** fixed: requires human verification (logic change in command construction).

### CR-02: `read_file` fallback escaped the repository via `../`

**Files modified:** `src/services/gitRemoteTreeService.ts`, `tests/services/ai/office/teamToolsGitRead.test.ts`, `src/services/__tests__/gitRemoteTree.test.ts`
**Commit:** `64f8281e`, `d90e6748`
**Applied fix:** New exported `confineRepoPath()` normalises then refuses a path that pops past the repo root, applied in both `getRemoteFileContent` and `getRemoteWorkingFileContent` (the latter is exported and cannot trust its caller). No `node:path` import — this module is bundled for the browser/Tauri renderer where `path.posix` is unavailable, so the needed subset is inlined. Also gated the fallback on `isNotInRef()` (see WR-01).

**Status:** fixed: requires human verification.

### CR-03: Raw remote stderr unwrapped and mislabelled `INVALID_ARGUMENT`

**Files modified:** `src/services/ai/office/teamTools.ts`, `tests/services/ai/office/teamToolsGitRead.test.ts`
**Commit:** `d90e6748`
**Applied fix:** Added `GIT_READ_FAILED` to `TeamToolRefusalCode`; the catch-all now returns that code with `wrapUntrusted(gitLabel('LỖI GIT'), ...)`. The test that pinned the misclassification now asserts the new code plus nonce-matched enclosure of the stderr.

### WR-01: `read_file` silently returned working-tree content labelled as branch content

**Files modified:** `src/services/gitRemoteTreeService.ts`, `tests/services/ai/office/teamToolsGitRead.test.ts`, `src/services/__tests__/gitRemoteTree.test.ts`
**Commit:** `64f8281e`, `d90e6748`
**Applied fix:** `isNotInRef()` matches only `does not exist in` / `exists on disk, but not in`. Anything else (bad ref, SSH down) propagates so CR-03's refusal fires. Tests cover both directions: bad ref issues exactly one command and refuses; a genuinely untracked path still falls back to `cat`.

### WR-02: Rename detection broken in `getDiffSummary`

**Files modified:** `src/services/gitRemoteService.ts`, `src/services/__tests__/gitRemoteService.test.ts`
**Commit:** `bc0b3829`
**Applied fix:** Both `diff` calls now use `-z -M`, with dedicated `parseNameStatusZ()` / `parseNumstatZ()` parsers. Both key on the TARGET path, so the join lands and a rename reports `renamed`. Test asserts `{ path: 'big2.txt', status: 'renamed' }` from real `-z` shapes probed against git 2.50.1.

### WR-03: `checkDirtyStatus` corrupted paths with spaces and renames

**Files modified:** `src/services/gitRemoteService.ts`, `src/services/__tests__/gitRemoteService.test.ts`
**Commit:** `bc0b3829`
**Applied fix:** `status --porcelain=v1 -z`, split on `\0`. A rename/copy consumes its source token so it is not reported as its own file. Tests cover a path with spaces and a rename.

### WR-04: Refusal messages embedded user/model text unwrapped

**Files modified:** `src/services/ai/office/teamTools.ts`
**Commit:** `d90e6748`
**Applied fix:** `SYSTEM_NOT_LINKED` wraps the requested id; `NO_LINKED_REPO` (both sites) and the multi-repo `INVALID_ARGUMENT` list wrap system names via `wrapUntrusted`.

### WR-05: `resolveGitRepo` ran outside the try

**Files modified:** `src/services/ai/office/teamTools.ts`
**Commit:** `d90e6748`
**Applied fix:** Repo resolution moved inside the `try`. `repoPath` is hoisted as `''` and assigned after resolution, so the `gitLabel` closure used by the catch still compiles and labels correctly.

### WR-06: Non-integer `limit` produced a confusing git failure

**Files modified:** `src/services/ai/office/teamTools.ts`
**Commit:** `d90e6748`
**Applied fix:** `Math.floor(Number(args.limit))` before the clamp.

### WR-07: Three of four escape assertions derived expectation from `escapeShellArg`

**Files modified:** `tests/services/ai/office/teamToolsGitRead.test.ts`
**Commit:** `d90e6748`
**Applied fix:** All four now pin literals; the `escapeShellArg` import was removed from the test file so it cannot creep back.

### WR-08: Wrap assertions checked tag presence, not enclosure

**Files modified:** `tests/services/ai/office/teamToolsGitRead.test.ts`
**Commit:** `d90e6748`
**Applied fix:** New `expectEnclosed()` walks every opening tag, reads its nonce, advances to the closing tag carrying that same nonce, and asserts the payload index lies inside exactly one such block.

### WR-09: `vi.clearAllMocks()` did not clear once-impl queues

**Files modified:** `tests/services/ai/office/teamToolsGitRead.test.ts`
**Commit:** `d90e6748`
**Applied fix:** `vi.mocked(execRemoteCommand).mockReset()` in `beforeEach`.

### WR-11: No test covered the actual security boundary

**Files modified:** `tests/services/ai/office/teamToolsGitRead.test.ts`
**Commit:** `d90e6748`
**Applied fix:** New Block C: refusal cases for `log`/`diff_summary`/`read_file`/`tree` with a `-`-leading revision (asserting `execRemoteCommand` was never called), `filePath: '../../../home/git/.ssh/id_rsa'` and `dirPath: '../..'` (asserting no `cat --` command is reached), plus the WR-01 both-directions cases. Service-layer boundary tests added in `gitRemoteService.test.ts` and `gitRemoteTree.test.ts`.

### WR-12: `diff`/`show` ran without `--no-ext-diff` / `--no-textconv`

**Files modified:** `src/services/gitRemoteService.ts`, `src/services/gitRemoteTreeService.ts`
**Commit:** `bc0b3829`, `64f8281e`
**Applied fix:** Added to `diff` (both `--numstat`, `--name-status` and the file diff) and `show`. Not added to `ls-tree`, which has no diff-driver path.

## Skipped Issues

### WR-10: AIO-READ-06 (Oracle read pair gated on AI Tool config) has no test

**File:** `src/services/ai/office/teamRunCoordinator.ts:1177-1179`
**Reason:** already covered — the review's `grep -rn "oracleReadTools" tests/` missed it because the test asserts tool NAMES, not the helper. `tests/services/ai/office/teamRunCoordinator.test.ts:1610-1645` ("advertises the Oracle read pair to both agents only when the Oracle tool is enabled") asserts absence for both lead and employee with the config disabled, flips `saveOracleToolConfig({ enabled: true })`, then asserts presence. Verified passing in this run.
**Original issue:** Requirement gate with zero coverage.

## Notes

- Out of scope by `fix_scope: critical_warning`: IN-01 through IN-05 were not addressed. IN-05 in particular was drafted and reverted — wrapping `repoPath` would have changed the payload shape the existing tests assert, and it is Info-tier.
- Commit granularity: three commits by layer rather than one per finding. The source and test hunks for a single finding are interleaved with the hunks of its neighbours (a test pins the exact command string a source hunk produces), so no per-finding split both compiles and passes its own tests. Each commit is green on its scoped tests.
- Scoped test runs: `teamToolsGitRead` 26 pass, `teamTools` + `teamPrompts` 139 pass, `gitRemoteService` 15 pass, `gitRemoteTree` + `gitRemoteTreeService` 13 pass, workbench viewers 8 pass. `tsc --noEmit` exits 0.

---

_Fixed: 2026-11-15T23:30:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
