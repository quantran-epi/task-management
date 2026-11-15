---
phase: 42-read-only-git-inspection-for-the-reviewer-agent
reviewed: 2026-11-16T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - src/services/gitRemoteService.ts
  - src/services/ai/office/teamTools.ts
  - tests/services/ai/office/teamTools.test.ts
  - src/services/ai/office/teamPrompts.ts
  - tests/services/ai/office/teamPrompts.test.ts
  - tests/services/ai/office/teamToolsGitRead.test.ts
  - src/services/gitRemoteTreeService.ts
findings:
  critical: 1
  warning: 2
  info: 3
  total: 6
status: issues_found
---

# Phase 42: Code Review Report (round 3 — final)

**Reviewed:** 2026-11-16T00:00:00Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Round-2 claims were re-tested against the code and against real `git` 2.50.1 repositories, not against the fix report.

**Genuinely resolved:**

- **WR-01** — `isNotInRef` is anchored to the exact path and ref. Verified the four messages git actually emits: `fatal: path '<p>' does not exist in '<r>'`, `fatal: path '<p>' exists on disk, but not in '<r>'`, `fatal: invalid object name '<r>'.`, and the tree case. Paths containing a tab, a single quote, a newline, or non-ASCII text are echoed verbatim inside the quotes, so the anchored comparison still fires for them. A ref whose *name* contains the phrase (`x does not exist in`) no longer matches. The `ls-files --error-unmatch` gate correctly refuses the "tracked but deleted in ref" case — reproduced in a real repo (`gone.txt` deleted on `feature/x`, still on disk): the working copy is no longer substituted. The legitimate untracked fallback still works.
- **WR-03** — `ls-tree -l -z` is emitted and `getRemoteTree` is the only consumer; it splits on NUL. Reproduced the C-quoting difference: without `-z`, `thư-mục/tệp.txt` arrives as `"t\341\273\207p.txt"`; with `-z` it arrives verbatim. `parseLsTreeLine` still works because the record keeps its `meta\tpath` shape.
- **WR-04** — verified against real `-z` output. `5\t0\tnew.txt\0`, rename `1\t0\t\0old.txt\0new.txt\0`, tab-in-name `1\t0\ttab\tname.txt\0`, binary `-\t-\tassets/logo.png\0` all parse to the right path. The brace form (`{a => b}`) does not exist under `-z`, so nothing to preserve.
- **WR-05** — `PathOutsideRepoError` is thrown by `confineRepoPath` (both call sites) and by the symlink refusal, and is mapped to `INVALID_ARGUMENT` at `teamTools.ts:1284`. No other throw site is misclassified: git/SSH failures still reach `GIT_READ_FAILED`.
- **WR-06** — the new fixtures use real `-z` shapes and the assertions are strong enough to fail on garbage. Reverting `checkDirtyStatus` to a `\n` split yields one entry instead of two, so the `toHaveLength(2)` assertion fails; reverting `parseNameStatusZ`/`parseNumstatZ` changes the asserted `status`/`additions`/`deletions`. `parseNumstatZ`'s tab-in-path regression is covered by its own unit test in `gitRemoteService.test.ts`.
- **IN-01** — `branch: ''` now falls back to `defaultBaseBranch`, and a supplied-but-rejected value (leading `-`, non-string) still refuses.

**Still open:** the WR-02 fix only checks the **leaf** for a symlink, so a symlinked *parent directory* still lets `cat` read outside the repository (BLOCKER). Separately, `git show` silently succeeds with empty output for a path containing glob metacharacters that does not exist literally, so `read_file` returns an empty file instead of an error and the untracked fallback never runs.

Scoped suites pass (`teamToolsGitRead`, `gitRemoteTree`, `gitRemoteTreeService`, `gitRemoteService`, `teamPrompts` — 103 tests) and `tsc --noEmit` is clean. Passing tests do not cover either open finding.

## Critical Issues

### CR-01: `test -L` only checks the leaf — a symlinked parent directory still reads outside the repo

**File:** `src/services/gitRemoteTreeService.ts:265-281`
**Issue:** The WR-02 fix refuses a path whose *leaf* is a symlink, but `cat` resolves every component. A symlink on any parent directory is followed. `confineRepoPath` only confines the path *string*, so it cannot see this.

Reproduced in a real repo with a **tracked** symlink directory (`linkdir -> /tmp/symtest/outside`, committed as `120000 blob`):

```
$ git show --end-of-options 'HEAD:linkdir/secret.txt'
fatal: path 'linkdir/secret.txt' exists on disk, but not in 'HEAD'   # exit 128
$ git ls-files --error-unmatch -- 'linkdir/secret.txt'
error: pathspec ... did not match any file(s) known to git          # exit 1 → "untracked"
$ test -L '/repo/linkdir/secret.txt' && echo MARKER || cat -- '/repo/linkdir/secret.txt'
SECRET-OUTSIDE                                                       # exit 0
```

The chain is fully reachable through `git_read({action:'read_file', filePath:'linkdir/secret.txt'})`: the anchored `isNotInRef` matches, `ls-files` reports untracked, the leaf is not a symlink, and `cat` follows the parent. The same works for an untracked symlink directory. A model can discover symlinks from the `tree` action (they appear as `120000 blob`), so this is a reachable arbitrary-file-read outside the repository — the exact invariant CR-02 was raised to enforce.

**Fix:** resolve the real path and verify containment instead of testing only the leaf:

```ts
const repoRoot = repoPath.replace(/\/+$/, '');
const cmd =
  `p=$(realpath -- ${escapeShellArg(targetFile)} 2>/dev/null) || exit 1; ` +
  `case "$p" in ${escapeShellArg(repoRoot)}/*) cat -- "$p" ;; *) echo ${SYMLINK_MARKER} ;; esac`;
```

If `realpath` cannot be assumed on the remote, walk each component with `test -L` before `cat`, or refuse any path whose resolved form is not under `realpath <repoPath>`. Add a test with a symlinked *parent* directory, not only a symlinked leaf.

## Warnings

### WR-01: `git show` returns exit 0 with empty stdout for a glob-shaped path — `read_file` reports an empty file, and the untracked fallback never runs

**File:** `src/services/gitRemoteTreeService.ts:221-227`
**Issue:** When the object spec contains pathspec metacharacters (`*`, `?`, `[...]`) and does not match a literal path, `git show` treats the argument as a pathspec, prints nothing, and exits 0. `runGitCommand` sees success and returns `''`.

Reproduced:

```
$ git show --end-of-options 'main:*.txt'      # repo has only.txt
$ echo $?                                      # 0, no output
$ git show --end-of-options 'main:onl?.txt'    # 0, no output
$ git cat-file -p 'main:onl?.txt'              # fatal: path ... does not exist (128)
```

Consequences: `read_file` returns `content` wrapped around an empty string, indistinguishable from a genuinely empty file; `isNotInRef` never fires, so an untracked file whose name contains a glob character can never be read through the fallback. A literal path with a bracket (e.g. `app/pages/[id].tsx`) still resolves correctly, so this only bites paths that do not exist literally — a silent wrong answer rather than an error.

**Fix:** force literal pathspec handling and treat an empty result as "not found". Either set `GIT_LITERAL_PATHSPECS=1` for the `show` invocation, or use `git cat-file -p --end-of-options '<ref>:<path>'` (verified: exits 128 with `fatal: path '<p>' does not exist in '<r>'`, which the anchored `isNotInRef` already matches). Add a case with a `*`/`?` path that does not exist.

### WR-02: `ls-files` failure is conflated with "untracked" — the fallback fails open

**File:** `src/services/gitRemoteTreeService.ts:233-239`
**Issue:** `.catch(() => '')` maps *every* `ls-files` failure to "not tracked", including failures that mean the question could not be answered (`fatal: not a git repository`, a bare repo, an invalid pathspec magic, a dropped SSH session). Verified: `git ls-files --error-unmatch -- ':(bad)x'` exits 128 with `fatal: Invalid pathspec magic`, which the current code reads as "untracked" and therefore falls back to the working copy.

Only exit 1 (`error: pathspec ... did not match any file(s) known to git`) is the legitimate "untracked" signal. Conflating the two is what makes CR-01 reachable even when `ls-files` was never able to answer.

**Fix:** distinguish the exit status rather than catching everything. Either expose `exitStatus` from `runGitCommand`, or call `execRemoteCommand` directly for this probe and fall back only when the status is 1:

```ts
const probe = await execRemoteCommand(config, `git -C ${escapeShellArg(repoPath)} --no-pager ls-files --error-unmatch -- ${escapeShellArg(cleanPath)}`, secret);
if (probe.exitStatus !== 1) throw err;   // tracked, or could not determine → do not substitute
```

## Info

### IN-01: the `branch: ''` fallback has no regression test

**File:** `src/services/ai/office/teamTools.ts:1153-1165`
**Issue:** The IN-01 fix is correct but untested. No case in `teamToolsGitRead.test.ts` passes `branch: ''`, so a future revert to `??` would not be caught.
**Fix:** add a case asserting `log` with `branch: ''` runs and reports `branch: 'main'` (the seeded `defaultBaseBranch`), plus one asserting a non-string `branch` still refuses.

### IN-02: a symlink refusal is reported as `INVALID_ARGUMENT`, which is defined as the model's argument mistake

**File:** `src/services/ai/office/teamTools.ts:1284-1288`
**Issue:** `INVALID_ARGUMENT` is documented as "an argument the caller got wrong". A symlink path inside the repo is a legitimate path; the refusal is a policy decision. The message does name the symlink, so a retry loop is unlikely, but the code is semantically wrong and the same reasoning that gave `LEAD_USES_DB_TOOLS` its own code applies.
**Fix:** either keep `INVALID_ARGUMENT` and adjust the comment to say "a path the tool will not read", or introduce a dedicated code (e.g. `PATH_NOT_READABLE`).

### IN-03: `diff_file` does not confine `filePath`, unlike `read_file`

**File:** `src/services/ai/office/teamTools.ts:1202-1221`
**Issue:** `read_file` runs `confineRepoPath`; `diff_file` passes `filePath` straight to `getFileDiff`. Git rejects an escaping path (`fatal: ... is outside repository`, verified), so this is not a traversal hole, but pathspec magic is accepted (`:(top)*` returns the whole diff). The asymmetry means the next reader cannot tell whether the omission is deliberate.
**Fix:** apply `confineRepoPath(filePath, 'Đường dẫn tệp')` in the `diff_file` branch for consistency and to reject pathspec magic.

---

_Reviewed: 2026-11-16T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
