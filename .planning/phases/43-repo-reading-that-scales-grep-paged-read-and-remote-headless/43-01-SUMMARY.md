---
phase: 43-repo-reading-that-scales-grep-paged-read-and-remote-headless
plan: 01
subsystem: services/git-remote
tags: [git, ssh, grep, pagination, agent-tools]
dependency_graph:
  requires: []
  provides:
    - grepRemoteRef
    - readRemoteFilePage
    - RemoteGrepHit
    - RemoteFilePage
  affects:
    - src/services/ai/office/teamTools.ts (plan 02 wires these into git_read)
tech_stack:
  added: []
  patterns:
    - "out-of-band exit status: `###EXIT <n>` on stderr so stdout stays a pure record stream"
    - "subshell `( … )` not brace group `{ …; }` for EXIT traps inside a pipeline (dash)"
key_files:
  created:
    - tests/services/__tests__/gitRemoteReadPipeline.test.ts
  modified:
    - src/services/gitRemoteService.ts
    - src/services/gitRemoteTreeService.ts
    - src/types/gitRemote.ts
decisions:
  - "grep record parse: split stdout on newline first, then NUL per record — `-z` separates fields, the newline ends the record"
  - "git grep exit 1 (no matches) and 141 (SIGPIPE at the head cap) are success"
  - "readRemoteFilePage reuses confineRepoPath/isNotInRef and the realpath containment instead of reimplementing them"
  - "getRemoteFileContent left untouched: RemoteFileViewer needs whole-file reads for the editor"
metrics:
  duration: ~25 min
  completed: 2026-11-16
---

# Phase 43 Plan 01: Remote read primitives — grep and paged read — Summary

`grepRemoteRef` searches a ref's tracked content and `readRemoteFilePage` returns one page of a ref blob with `totalLines`/`hasMore` and binary detection, both proven against a real local git repository.

## What was built

**`grepRemoteRef(config, repoPath, ref, options, secret)`** — `src/services/gitRemoteService.ts`

Runs one shell pipeline:

```
{ git -C <repo> -c core.fsmonitor=false --no-pager grep -z -n -I --no-color \
    [--no-ignore-case|-i] [-F] -e <pattern> --end-of-options <ref> [-- <path>];
  printf '###EXIT %s\n' "$?" >&2; } | head -c 262144
```

- `-e` makes a pattern beginning with `-` a pattern; `--end-of-options` makes a ref beginning with `-` a revision.
- `-I` skips binary blobs; `--no-ignore-case` is the default, `-i` when `caseSensitive: false`.
- Exit 0, 1 (no matches) and 141 (SIGPIPE when `head -c` closes the pipe) are success. Any other status throws with git's stderr.
- `limit` clamped to 1..200 (default 50); a slice that dropped records sets `truncated`.

**`readRemoteFilePage(config, repoPath, ref, filePath, offset, limit, secret)`** — `src/services/gitRemoteTreeService.ts`

- Binary probe first, page 1 only: `… | head -c 1024 | od -An -tx1 | tr -s ' ' '\n' | grep -qx 00` → exit 0 means binary, returning `isBinary: true` with no lines.
- One pager pass yields both the page and the total:
  `( trap 'printf "###EXIT %s\n" "$?" >&2' EXIT; <source> ) | awk -v s=<offset> -v e=<offset+limit-1> 'NR>=s&&NR<=e{print NR": "$0} END{print "###TOTAL "NR}'`
- `<source>` is `git cat-file -p <ref:path>` for the ref branch, or the existing `realpath -e`-confined `cat` snippet for the untracked fallback.
- `offset` clamped to ≥1, `limit` clamped to 1..2000 (default 200). `hasMore = offset + linesRead - 1 < totalLines`.
- Fallback path reuses `confineRepoPath`, `isNotInRef`, the `ls-files --error-unmatch` probe and the `exit 77` → `PathOutsideRepoError` mapping. Nothing reimplemented.

**Types** — `src/types/gitRemote.ts`: `RemoteGrepHit`, `RemoteFilePage`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan's grep record parse was wrong**
- **Found during:** Task 3 (real-git test)
- **Issue:** The plan said `-z` emits `path\0line\0content\n` and to "split stdout on `\0` in groups of three". `-z` only NUL-separates the *fields* of one record; the newline ends the record. Splitting on NUL first glues the next record's `<ref>:<path>` onto this record's content, so every hit after the first was lost and `truncated` was wrongly true.
- **Fix:** Split stdout on `\n` into records first, then each record on `\0` into `[path, line, text]`. A record without exactly three fields is the `head -c` cut record: dropped, sets `truncated`.
- **Files modified:** `src/services/gitRemoteService.ts`
- **Commit:** `4ea69b76`

**2. [Rule 1 - Bug] `git grep` prefixes paths with `<ref>:`**
- **Found during:** Task 3
- **Issue:** Hits carried `HEAD:src/a.ts` rather than `src/a.ts`, which is not a usable path for a follow-up `read_file`.
- **Fix:** Strip exactly the `${ref}:` prefix (not a bare `HEAD` match, so a real path named `HEAD…` survives).
- **Files modified:** `src/services/gitRemoteService.ts`
- **Commit:** `4ea69b76`

**3. [Rule 1 - Bug] EXIT trap does not run for a brace group inside a pipeline under dash**
- **Found during:** Task 3 (untracked-fallback case)
- **Issue:** `{ trap …; cmd; } | awk …` never ran the trap, so the `###EXIT` marker was missing, `sourceExit` defaulted to 0 and a failed `cat-file` was read as an empty page (`totalLines: 0`).
- **Fix:** Use a subshell `( trap …; cmd ) | awk …`, which does run the EXIT trap. Verified: `###EXIT 128`, `###EXIT 77` and `###EXIT 1` all arrive.
- **Files modified:** `src/services/gitRemoteTreeService.ts`
- **Commit:** `da0e7487`

### Test expectation corrected

`git grep` orders hits by path, not by file creation order. The plan's expected order (`src/a.ts` first) was wrong; the test now asserts the real order `['docs/notes.md', 'docs/notes.md', 'src/a.ts']` with lines `[1, 3, 42]`.

## Pre-existing failure, fixed during review

`src/services/__tests__/gitRemoteTreeService.test.ts` had **12 failing tests on this machine,
identical before and after this plan's changes** (confirmed by running the suite in a worktree
at the pre-phase commit `a28fb6cb`). Cause: `workingCopyCatSnippet` used `realpath -e`, which is
GNU-only; BSD/macOS `/bin/realpath` rejects it with `realpath: illegal option -- e`, so every
working-copy read failed closed.

The executor logged this as "out of scope, production targets a Linux remote". That reasoning is
wrong: a macOS remote is a real target, and a guard that fails closed on it is a defect, not a
configuration difference. Fixed by dropping `-e` — plain `realpath --` is POSIX-portable and
already strict on both implementations (it refuses a path whose components do not exist and
resolves every symlink in the path, which is exactly what the containment guard needs).

- **Files modified:** `src/services/gitRemoteTreeService.ts`
- **Commit:** `49a0dbd4`
- **Verified:** 26/26 tree-service tests pass, including the two "fails closed" cases
  (`realpath` unavailable → `Failed to read`; dangling symlink target → rejection).

## Review fixes (post-plan, commits 9bc995e2..2ec0045a)

| Defect | Fix | Commit |
|--------|-----|--------|
| A grep record whose PATH contains a newline was split into a bogus hit with a truncated path | a record is complete only when both NUL fields arrived AND the line field is numeric | `9bc995e2` |
| A record the byte cap cut was flagged `truncated` and still emitted, with a partial body | drop it; the flag alone is the signal | `2ec0045a` |
| `parsePage` dropped every empty line, so a page of blank lines reported `linesRead: 0` with `hasMore: true` — `nextOffset` never advanced and the caller looped | drop only the trailing split artefact; read the total marker from its guaranteed last position | `3af87975` |

**Ceiling, deliberately not fixed:** the binary probe runs on page 1 only, so a file whose first
1024 bytes are text but which carries a NUL later is not flagged on a later page. It cannot leak
raw bytes — `awk` ends the string at the NUL — so the page holds a truncated line, never binary.
Recorded as a comment in `gitRemoteTreeService.ts` (`09a1789f`).

## Verification

- `npx tsc --noEmit -p tsconfig.json` → exit 0.
- `npx vitest run tests/services/__tests__/gitRemoteReadPipeline.test.ts` → **9/9 pass**.
- `npx vitest run tests/services/__tests__/gitRemoteReadPipeline.test.ts src/services/__tests__/gitRemoteTreeService.test.ts src/services/__tests__/gitRemoteService.test.ts` → **52/52 pass** (after the `realpath` fix).
- No file outside `files_modified` changed.

## Self-Check: PASSED

- `src/services/gitRemoteService.ts` — `grepRemoteRef` exported, 1 occurrence.
- `src/services/gitRemoteTreeService.ts` — `readRemoteFilePage` exported, 1 occurrence; `getRemoteFileContent` still exported and unchanged in signature.
- `src/types/gitRemote.ts` — `RemoteGrepHit` and `RemoteFilePage` exported.
- `tests/services/__tests__/gitRemoteReadPipeline.test.ts` — 9 `it(` cases, all passing.
- Commits `da0e7487`, `4ea69b76`, `b53af34d` present.
