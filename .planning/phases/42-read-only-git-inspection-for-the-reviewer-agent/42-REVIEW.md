---
phase: 42-read-only-git-inspection-for-the-reviewer-agent
reviewed: 2026-11-15T16:40:00Z
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
  critical: 0
  warning: 6
  info: 3
  total: 9
status: issues_found
---

# Phase 42: Code Review Report (round 2)

**Reviewed:** 2026-11-15T16:40:00Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Round-1 criticals were re-verified against the actual code and against git 2.50.1, not against the fix report.

**Genuinely resolved:**

- **CR-01** — both layers are real. `revisionArg()` (`teamTools.ts:1094-1097`) refuses every `-`-leading revision before a command is built, and every revision-shaped argv element is preceded by `--end-of-options` (`gitRemoteService.ts:147,174,196,206,340`; `gitRemoteTreeService.ts:171,207`). Reproduced the original vector: `git log --end-of-options '--output=/tmp/pwn..HEAD'`, `git show --end-of-options '--output=/tmp/pwn3'` and `git diff … --end-of-options '--output=/tmp/pwn2..HEAD'` all exit 128 and create no file. Option ordering is correct in every call site (`-n`, `--format`, `--date`, `--no-ext-diff`, `--no-textconv` all precede the terminator; `--` follows it in `getFileDiff`).
- **CR-02** — `confineRepoPath()` is applied in both `getRemoteFileContent` and the exported `getRemoteWorkingFileContent`, and the `cat` fallback is no longer reachable from `../../`. Edge cases checked: `''`, `.`, `..`, `a/../../b` all throw; `src/../README.md` normalises to `README.md`; backslashes are not separators on a POSIX remote, so `..\..\x` stays a literal (harmless) filename.
- **CR-03** — `GIT_READ_FAILED` exists, the catch wraps stderr in `wrapUntrusted`, and the test asserts the code plus nonce-matched enclosure.
- **WR-02/WR-03/WR-07/WR-08/WR-09/W-12** — verified in code and by running the suites (54 git-service tests, 113 teamTools/teamPrompts tests, plus the coordinator Oracle case, all pass; `tsc --noEmit` clean).
- **WR-10** — actually covered at `tests/services/ai/office/teamRunCoordinator.test.ts:1610-1645`; the case passes.

**Still open:** the `isNotInRef` narrowing is incomplete in a way that reproduces round-1 WR-01's failure mode (wrong content labelled as branch content), the `cat` fallback still follows symlinks out of the repo, `ls-tree` returns C-quoted paths so Vietnamese filenames are unusable, `parseNumstatZ` truncates a path containing a tab, and two `WRAP_CASES` fixtures use a shape the `-z` parsers no longer accept so they pass on garbage.

## Warnings

### WR-01: `isNotInRef` cannot tell "untracked" from "deleted in this ref" — `read_file` still returns working-copy content labelled as branch content

**File:** `src/services/gitRemoteTreeService.ts:151-154,208-218`
**Issue:** The narrowed regex `/does not exist in|exists on disk, but not in/` matches a message git emits for a path that is **deleted in the requested ref** but still present in the working copy. Reproduced:

```
$ git show --end-of-options 'feature/x:gone.txt'
fatal: path 'gone.txt' exists on disk, but not in 'feature/x'   # exit 128
$ cat -- '/repo/gone.txt'
SECRET-MAIN                                                     # working copy, on another branch
```

So `git_read({action:'read_file', branch:'feature/x', filePath:'gone.txt'})` returns the content from whatever branch is checked out and labels it `GIT read_file /srv/repo — NỘI DUNG FILE` with `branch: 'feature/x'`. The reviewer reviews the wrong version and cannot tell — the exact failure WR-01 was raised for.

The regex is also unanchored, so a bad ref whose *name* contains the phrase takes the same path: `git show --end-of-options 'x does not exist in:g.txt'` → `fatal: invalid object name 'x does not exist in'.` → matches → falls back. A model-chosen branch name can therefore force the fallback at will.

**Fix:** Anchor the match to the exact path and ref and confirm the path truly is untracked before falling back:

```ts
const msg = err instanceof Error ? err.message : String(err);
const notInRef =
  msg.includes(`path '${cleanPath}' does not exist in '${ref}'`) ||
  msg.includes(`path '${cleanPath}' exists on disk, but not in '${ref}'`);
if (!notInRef) throw err;
// "exists on disk, but not in <ref>" also covers "deleted in <ref>"; confirm it is untracked:
const tracked = await runGitCommand(config, repoPath, ['ls-files', '--error-unmatch', '--', escapeShellArg(cleanPath)], secret).catch(() => '');
if (tracked.trim()) throw err;   // tracked elsewhere → the ref genuinely lacks it, do not substitute
```

### WR-02: the `cat` fallback follows symlinks — path confinement is not file confinement

**File:** `src/services/gitRemoteTreeService.ts:225-241`
**Issue:** `confineRepoPath` guarantees the *path string* stays under the repo root, but `cat` resolves symlinks. An untracked symlink inside the repo is exactly the case the fallback is designed to serve (`git show` says "exists on disk, but not in 'HEAD'"), and `cat` then reads its target. Reproduced:

```
$ ln -s /etc/hosts leak          # untracked, inside the repo
$ git show --end-of-options 'HEAD:leak'
fatal: path 'leak' exists on disk, but not in 'HEAD'
$ cat -- '/repo/leak' | head -2
##  Host Database              # outside the repository
```

This is the same class of escape CR-02 closed, one indirection further out. It needs an untracked symlink to exist in the remote working tree, so it is not directly attacker-plantable by the model — but the tool advertises repository-confined reads and does not deliver that.

**Fix:** Refuse to fall back when the path is a symlink, or resolve it first:

```ts
const res = await execRemoteCommand(
  config,
  `test -L ${escapeShellArg(targetFile)} && echo LINK || cat -- ${escapeShellArg(targetFile)}`,
  secret
);
if (res.stdout === 'LINK\n') throw new Error(`Đường dẫn là symlink, từ chối đọc: ${cleanPath}`);
```

### WR-03: `parseLsTreeLine` never unquotes C-quoted paths — non-ASCII (Vietnamese) filenames are unusable

**File:** `src/services/gitRemoteTreeService.ts:11-39,171`
**Issue:** `git ls-tree` without `-z` quotes any path outside ASCII (`core.quotePath` default true). Reproduced:

```
$ git ls-tree -l --end-of-options HEAD
040000 tree d97974b…       -	"th\306\260-m\341\273\245c"
```

`parseLsTreeLine` takes the raw text after the tab, so `title`/`key` become `"th\306\260-m\341\273\245c"`. That string is not a path: feeding it back as `dirPath` fails (`fatal: Not a valid object name HEAD:"th\304\257-m\341\273\245c"`), and the model is shown escaped octal instead of the real name. For a Vietnamese-language project this fires on the first directory with a diacritic.

**Fix:** Add `-z` and split the output on NUL (same change already made for `status`/`diff`), or disable quoting:

```ts
const gitArgs = ['ls-tree', '-l', '-z', '--end-of-options', escapeShellArg(treeRef)];
// …
for (const line of stdout.split('\0')) { … }
```

(`-c core.quotePath=false` also works but leaves the quoting behaviour config-dependent.)

### WR-04: `parseNumstatZ` truncates a path containing a tab

**File:** `src/services/gitRemoteService.ts:296-324` (line 305)
**Issue:** `-z` leaves the path verbatim, so a tab inside a filename is indistinguishable from a field separator. `entry.split('\t')` then yields four parts and `parts[2]` is only the text before the tab. Verified against real git output and the parser:

```
$ git diff --numstat -z -M HEAD~1..HEAD | od -c
1 \t 0 \t t a b \t n a m e . t x t \0
parser → { path: 'tab', additions: 1, deletions: 0 }
```

The join with `parseNameStatusZ` (which parses correctly) then misses, so the file is reported as `modified` with a path that does not exist.

**Fix:** Split only on the first two tabs:

```ts
const firstTab = entry.indexOf('\t');
const secondTab = entry.indexOf('\t', firstTab + 1);
if (firstTab === -1 || secondTab === -1) continue;
const additionsRaw = entry.slice(0, firstTab);
const deletionsRaw = entry.slice(firstTab + 1, secondTab);
let path = entry.slice(secondTab + 1);
```

### WR-05: a confinement rejection is reported as `GIT_READ_FAILED` — an infrastructure code for an argument mistake

**File:** `src/services/ai/office/teamTools.ts:1270-1278`; `src/services/gitRemoteTreeService.ts:138,144`
**Issue:** `confineRepoPath` throws a plain `Error`, so `git_read({action:'read_file', filePath:'../../../home/git/.ssh/id_rsa'})` and `{action:'tree', dirPath:'../..'}` both return `code: 'GIT_READ_FAILED'` (pinned by `teamToolsGitRead.test.ts:477,487`). That is CR-03's mistake in the other direction: the model is told the *infrastructure* failed when its own argument was rejected, so it retries the same escaping path or reports a broken SSH connection instead of correcting the path.

**Fix:** Distinguish the two at the throw site and map them in the handler:

```ts
export class PathOutsideRepoError extends Error {}
// confineRepoPath: throw new PathOutsideRepoError(...)
// gitRead catch:
if (err instanceof PathOutsideRepoError) {
  return JSON.stringify(refuse('INVALID_ARGUMENT', wrapUntrusted(gitLabel('ĐƯỜNG DẪN'), err.message)));
}
```

### WR-06: `WRAP_CASES` status and diff_summary fixtures use a shape the `-z` parsers no longer accept

**File:** `tests/services/ai/office/teamToolsGitRead.test.ts:232,238`
**Issue:** Both fixtures are newline/`\t` shaped, but `checkDirtyStatus` now splits on `\0` and `parseNameStatusZ`/`parseNumstatZ` require the `-z` shape. Running the real parsers over the fixtures:

```
status  ' M src/app.ts\n?? new.txt\n'  → [{ path: 'src/app.ts\n?? new.txt\n' }]
numstat '3\t1\tsrc/app.ts\n'           → [{ path: 'src/app.ts\n' }]
name-status 'M\tsrc/app.ts\n'          → []            (no rows at all)
```

The assertions still pass only because `expectEnclosed` does a substring `indexOf('src/app.ts')`. So the two cases that are supposed to prove the handler wraps its payload would pass just as happily if the parsers regressed to garbage — the coverage is illusory.

**Fix:** Use the real shapes, as `gitRemoteService.test.ts:204-221` already does:

```ts
{ action: 'status', args: {}, outputs: [' M src/app.ts\0?? new.txt\0'] },
{ action: 'diff_summary', args: { base: 'main', target: 'feature/x' },
  outputs: ['<sha>\n', LOG_OUT, '3\t1\tsrc/app.ts\0', 'M\0src/app.ts\0'] },
```

and assert the parsed `files[0].path` / `uncommittedFiles[0].path` equals `src/app.ts` exactly, not by substring.

## Info

### IN-01: empty or non-string `branch` now refuses instead of falling back to `defaultBaseBranch`

**File:** `src/services/ai/office/teamTools.ts:1149`
**Issue:** `revisionArg(args.branch ?? system.defaultBaseBranch ?? 'HEAD')` — `??` only falls back on `null`/`undefined`. `branch: ''` (or a non-string such as `5`) now yields `undefined` and an `INVALID_ARGUMENT` refusal, where the previous expression fell through to the system's default branch. Behaviour change introduced by the CR-01 fix, not a security issue.
**Fix:** `const branch = revisionArg(args.branch) ?? revisionArg(system.defaultBaseBranch) ?? 'HEAD';` and keep the refusal only for a value that was supplied but rejected.

### IN-02: no-op assertion in the tree-service test

**File:** `src/services/__tests__/gitRemoteTreeService.test.ts:65`
**Issue:** `expect(sshService,)` — a trailing-comma `expect` on the module object, immediately followed by the real assertion. It asserts nothing and reads as a typo.
**Fix:** Delete the line.

### IN-03: round-1 Info items still open (unchanged, out of fix scope)

**Files:** `src/services/gitRemoteService.ts:66` (`isHead` hardcoded `false`); `src/services/ai/office/teamTools.ts:1247` (`dirPath` untrimmed) and `:1120` (`repoPath` echoed raw); `src/services/gitRemoteService.ts:42,147,171` (inconsistent format-string quoting); `src/services/ai/office/teamPrompts.ts:225` (`tree` unnumbered in a 1–5 ordered list).
**Issue:** Carried over from round 1, re-verified as still present. None affects correctness or security.
**Fix:** As listed in round 1; the prompt-list numbering is the cheapest and most user-visible.

---

_Reviewed: 2026-11-15T16:40:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
