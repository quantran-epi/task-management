---
phase: 42-read-only-git-inspection-for-the-reviewer-agent
fixed_at: 2026-11-15T23:55:00Z
review_path: .planning/phases/42-read-only-git-inspection-for-the-reviewer-agent/42-REVIEW.md
iteration: 2
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 42: Code Review Fix Report

**Fixed at:** 2026-11-15T23:55:00Z
**Source review:** `.planning/phases/42-read-only-git-inspection-for-the-reviewer-agent/42-REVIEW.md`
**Iteration:** 2

**Summary:**
- Findings in scope: 6 (0 critical, 6 warning) — plus IN-01 and IN-02, fixed because they live in the same files and the change was small
- Fixed: 6
- Skipped: 0

**Verification:** `npx tsc --noEmit` exits 0. Scoped suites pass (7 files, 60+ tests): `src/services/__tests__/gitRemoteService.test.ts`, `src/services/__tests__/gitRemoteTree.test.ts`, `src/services/__tests__/gitRemoteTreeService.test.ts`, `tests/services/ai/office/teamToolsGitRead.test.ts`, `tests/services/ai/office/teamTools.test.ts`, `tests/services/ai/office/teamPrompts.test.ts`, `tests/services/ai/office/teamRunCoordinator.test.ts`. Full suite not run (project rule: over an hour).

## Fixed Issues

### WR-01: `isNotInRef` cannot tell "untracked" from "deleted in this ref"

**Files modified:** `src/services/gitRemoteTreeService.ts`, `src/services/__tests__/gitRemoteTree.test.ts`, `src/services/__tests__/gitRemoteTreeService.test.ts`, `tests/services/ai/office/teamToolsGitRead.test.ts`
**Commit:** `5af672da`
**Applied fix:** Two changes, both needed.
1. `isNotInRef(err, cleanPath, ref)` now matches the anchored strings `path '<cleanPath>' does not exist in '<ref>'` and `path '<cleanPath>' exists on disk, but not in '<ref>'` instead of the unanchored phrase regex, so a ref whose *name* contains the phrase can no longer force the fallback.
2. Before falling back, `getRemoteFileContent` runs `git ls-files --error-unmatch -- <path>`; if the path is tracked anywhere, the original `git show` error is re-thrown. The working copy is only consulted for a genuinely untracked path.

Tests added: tracked-but-deleted-in-ref refuses (asserts the `ls-files` argv and that no `cat` runs); a bad ref name containing the phrase refuses.

**Status:** fixed: requires human verification (fallback gating logic).

### WR-02: the `cat` fallback followed symlinks out of the repo

**Files modified:** `src/services/gitRemoteTreeService.ts`, `src/services/__tests__/gitRemoteTree.test.ts`, `src/services/__tests__/gitRemoteTreeService.test.ts`, `tests/services/ai/office/teamToolsGitRead.test.ts`
**Commit:** `5af672da`
**Applied fix:** The fallback command is now `test -L '<path>' && echo __GIT_READ_SYMLINK_REFUSED__ || cat -- '<path>'` — one round trip, no extra SSH call. A symlink throws `PathOutsideRepoError`, which `getRemoteFileContent` re-throws rather than swallowing as a generic fallback failure (otherwise the original `git show` error would have masked the refusal).

Ceiling: a regular file whose entire content is the marker string is also refused. Failing closed on a name that cannot occur in practice beats a second SSH round trip; upgrade path is a separate `test -L` call if that ever matters.

Test added: an untracked symlink is refused with a `symlink` message.

**Status:** fixed: requires human verification.

### WR-03: `ls-tree` C-quoted non-ASCII paths

**Files modified:** `src/services/gitRemoteTreeService.ts`, `src/services/__tests__/gitRemoteTree.test.ts`, `tests/services/ai/office/teamToolsGitRead.test.ts`
**Commit:** `5af672da`
**Applied fix:** `getRemoteTree` now passes `-z` and splits the output on NUL, same as `status`/`diff`. `parseLsTreeLine` is unchanged — it still reads up to the first tab, which is correct for an unquoted record.

Tests updated to the `-z` shape and to a Vietnamese directory name (`thư-mục`), asserting it arrives verbatim rather than octal-escaped.

**Status:** fixed.

### WR-04: `parseNumstatZ` truncated a path containing a tab

**Files modified:** `src/services/gitRemoteService.ts`, `src/services/__tests__/gitRemoteService.test.ts`
**Commit:** `15f976cd`
**Applied fix:** Replaced `entry.split('\t')` with `indexOf` lookups for the first two tabs; additions and deletions come from the slices before them, and everything after the second tab is the path. The rename branch (empty third field) and the binary `-`/`-` case are preserved.

Tests added: `1\t0\ttab\tname.txt\0` parses to path `tab\tname.txt`; rename and binary shapes still parse.

**Status:** fixed.

### WR-05: a confinement rejection was reported as `GIT_READ_FAILED`

**Files modified:** `src/services/gitRemoteTreeService.ts`, `src/services/ai/office/teamTools.ts`, `tests/services/ai/office/teamToolsGitRead.test.ts`
**Commit:** `5af672da`, `8c569b21`
**Applied fix:** New exported `PathOutsideRepoError extends Error`; `confineRepoPath` throws it. The `git_read` catch maps it to `refuse('INVALID_ARGUMENT', wrapUntrusted(gitLabel('ĐƯỜNG DẪN'), err.message))` before the generic `GIT_READ_FAILED` branch. The message stays wrapped — it echoes the model-supplied path, which is untrusted text on a `role: 'tool'` channel.

Tests updated: escaping `filePath` and escaping `dirPath` now assert `INVALID_ARGUMENT`.

**Status:** fixed: requires human verification (error-class plumbing).

### WR-06: `WRAP_CASES` status and diff_summary fixtures used pre-`-z` shapes

**Files modified:** `tests/services/ai/office/teamToolsGitRead.test.ts`
**Commit:** `8c569b21`
**Applied fix:** Fixtures now use the shapes the parsers consume: `' M src/app.ts\0?? new.txt\0'`, `'3\t1\tsrc/app.ts\0'`, `'M\0src/app.ts\0'`, and a NUL-terminated `ls-tree -z` record pair for the tree case. The per-case assertions now check the parsed values exactly: `uncommittedFiles` has 2 rows with the right paths, `files[0]` is `{ status: 'modified', additions: 3, deletions: 1 }` with path `src/app.ts`, and the tree yields exactly 2 nodes titled `src/lib` and `src/app.ts`.

Note on the assertion shape: each wrapped field is a nonce-tagged multi-line block, so the parsed value is asserted with `toContain('\nsrc/app.ts\n')` — the raw value on its own line, which a parser regression to `src/app.ts\n?? new.txt\n` or to a truncated path cannot satisfy. The row COUNT (`toHaveLength`) is what catches the name-status regression that previously produced zero rows.

**Status:** fixed.

## Also Fixed (Info)

### IN-01: empty `branch` no longer fell back to `defaultBaseBranch`

**Files modified:** `src/services/ai/office/teamTools.ts`
**Commit:** `8c569b21`, `a82bb2dd`
**Applied fix:** `log` treats `undefined`, `null` and `''` as "not supplied" and uses `revisionArg(system.defaultBaseBranch) ?? 'HEAD'`; any other supplied value still goes through `revisionArg` and refuses if it starts with `-`.

### IN-02: no-op `expect(sshService,)` in the tree-service test

**Files modified:** `src/services/__tests__/gitRemoteTreeService.test.ts`
**Commit:** `5af672da`
**Applied fix:** Deleted the line. That test's `runGitCommand` mock was also updated to reject twice (the `git show` call, then the `ls-files` confirmation) so it exercises the real WR-01 path.

## Not Fixed (out of scope)

### IN-03: round-1 Info items

**Files:** `src/services/gitRemoteService.ts:66` (`isHead` hardcoded `false`), `src/services/ai/office/teamTools.ts` (`dirPath` untrimmed, `repoPath` echoed raw), `src/services/gitRemoteService.ts` (inconsistent format-string quoting), `src/services/ai/office/teamPrompts.ts:225` (`tree` unnumbered in a 1–5 list)
**Reason:** Info-tier, outside `fix_scope: critical_warning`, and none affects correctness or security. Left as recorded in round 1.

---

_Fixed: 2026-11-15T23:55:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
