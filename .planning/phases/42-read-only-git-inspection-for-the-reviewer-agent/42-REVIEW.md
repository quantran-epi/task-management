---
phase: 42-read-only-git-inspection-for-the-reviewer-agent
reviewed: 2026-11-16T02:10:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - src/services/gitRemoteService.ts
  - src/services/gitRemoteTreeService.ts
  - src/services/ai/office/teamTools.ts
  - src/services/ai/office/teamPrompts.ts
  - tests/services/ai/office/teamTools.test.ts
  - tests/services/ai/office/teamToolsGitRead.test.ts
  - tests/services/ai/office/teamPrompts.test.ts
  - src/services/__tests__/gitRemoteService.test.ts
  - src/services/__tests__/gitRemoteTree.test.ts
  - src/services/__tests__/gitRemoteTreeService.test.ts
findings:
  critical: 0
  warning: 0
  info: 0
  total: 0
status: clean
---

# Phase 42: Code Review Report (continuation re-check)

**Reviewed:** 2026-11-16T02:10:00Z
**Depth:** standard (targeted continuation of the round-3 review)
**Files Reviewed:** 10
**Status:** clean

## Summary

The round-3 review is retained below as history. A targeted continuation re-checked
the three open round-3 findings plus the three findings the first continuation
surfaced. Every one was verified against the actual source and real `git` behaviour,
not against a fix report.

**Resolved in this continuation:**

- **CR-04 (new, critical)** — `git status` and the `ls-files` probe inherited
  `core.fsmonitor` from the repository, so a repository-configured hook executed over
  SSH. `runGitCommand` and the direct probe now pass `-c core.fsmonitor=false`.
  Regression creates a real executable hook, proves it runs without the guard, then
  asserts it never runs through either path.
- **WR-03 (new, warning)** — the handler called `filePath.trim()`, renaming a file
  whose name legitimately begins or ends with whitespace before it was read.
  `diff_file` and `read_file` now preserve `filePath` exactly. Regression distinguishes
  `" spaced.txt "` from `"spaced.txt"` through `executeTeamTool` for both actions.
- **WR-04 (new, warning, replaces round-3 IN-03)** — `getFileDiff` left pathspec
  globbing enabled, so `app/[id].tsx` also matched `app/i.tsx` and `:(top)*` expanded
  to everything. `--literal-pathspecs` is now a git global option on that call.
  Regression proves only the requested bracket filename appears in the diff and that
  `:(top)*` returns nothing.
- **CR-01 (round 3)** — parent- and leaf-symlink escapes are closed by canonicalizing
  both the repository root and the target with `realpath -e`, then enforcing a literal
  directory boundary before `cat`. The regression reproduces the old `SECRET-OUTSIDE`
  leak through a real shell, then asserts refusal for tracked and untracked parent
  symlinks, leaf symlinks, sibling-prefix roots and symlinked repository roots.
  Residual: a hostile, concurrently swapped remote filesystem needs native
  `openat`/`O_NOFOLLOW`; the code carries a `ponytail:` note for that ceiling.
- **WR-01 (round 3)** — `git show` silently succeeded with empty output for a missing
  glob path. Literal object lookup now uses `cat-file -p --end-of-options`; a missing
  literal path exits 128, an untracked glob-named file reads correctly through the
  fallback, and a committed empty blob still returns `''`.
- **WR-02 (round 3)** — `.catch(() => '')` treated every `ls-files` failure as
  "untracked". Only exit 1 falls back now; exit 0 re-throws the original git error and
  exit 128 or an SSH rejection propagates.
- **IN-01** — added cases for `branch: ''` (defaults to `main`) and a non-string branch
  (refused without running git).
- **IN-02** — the `INVALID_ARGUMENT` comment now states that it covers a path the tool
  will not read, not only malformed input.

## Verification

Focused suites (6 files) pass: 201 tests — `gitRemoteService`, `gitRemoteTree`,
`gitRemoteTreeService`, `teamToolsGitRead`, `teamTools`, `teamPrompts`. The
tree-service regression runs the generated commands through a real `/bin/sh` and real
temporary git repositories rather than asserting on mocked markers. `tsc --noEmit` is
clean after restoring the pinned `js-tiktoken@1.0.21` package, whose integrity matches
`package-lock.json`. Full suite not run (project rule: it takes over an hour).

## Round 3 history (superseded)

The previously open CR-01 (parent-symlink escape), WR-01 (missing literal glob returned
empty success) and WR-02 (probe conflated every failure with untracked) are all
resolved above. Two info items carried into that round were closed here as IN-01 and
IN-02.

---

_Reviewed: 2026-11-16T02:10:00Z_
_Reviewer: Claude (gsd-code-reviewer), continuation re-check_
_Depth: standard_
