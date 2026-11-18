---
phase: 43-repo-reading-that-scales-grep-paged-read-and-remote-headless
plan: 02
subsystem: services/ai/office
tags: [agent-tools, git, grep, pagination, prompts]
dependency_graph:
  requires:
    - grepRemoteRef (43-01)
    - readRemoteFilePage (43-01)
  provides:
    - "git_read grep action"
    - "git_read paged read_file"
    - "search-first REVIEWER_GIT_READ_LINE"
  affects:
    - src/services/ai/office/teamTools.ts (tool surface the model sees)
    - src/services/ai/office/teamPrompts.ts (reviewer read order)
tech_stack:
  added: []
  patterns:
    - "zero hits is a successful empty result — `git grep` exit 1 is not a refusal"
    - "conditional spread for an optional result leaf (`...(hasMore ? { nextOffset } : {})`)"
key_files:
  created: []
  modified:
    - src/services/ai/office/teamTools.ts
    - src/services/ai/office/teamPrompts.ts
    - tests/services/ai/office/teamToolsGitRead.test.ts
    - tests/services/ai/office/teamPrompts.test.ts
decisions:
  - "grep reuses the log branch-resolution shape: only an absent/empty branch falls back to the system default; a supplied-but-rejected one refuses"
  - "the test mock seam now returns full { stdout, stderr, exitStatus } objects so the page-1 binary probe and the ###EXIT marker are expressible"
metrics:
  duration: ~35 min
  completed: 2026-11-16
---

# Phase 43 Plan 02: `git_read` grep + paged read + search-first prompt — Summary

`git_read` now exposes eight actions, with `grep` locating code without reading files and `read_file` returning one page plus a truthful `totalLines`/`nextOffset`, and the reviewer prompt tells the model to search first.

## What was built

**`grep` action** — `src/services/ai/office/teamTools.ts`

- Definition enum grew to `branches | status | log | diff_summary | diff_file | read_file | tree | grep`, with `pattern`, `path`, `caseSensitive`, `literal` and `offset` properties added. `limit`'s description now covers all three consumers (log 1..50, grep 1..200, read_file 1..2000).
- Handler resolves the ref exactly as `log` does (`revisionArg(args.branch)`, falling back to `system.defaultBaseBranch` then `HEAD`; a supplied-but-rejected branch still refuses), trims an optional pathspec, and delegates to `grepRemoteRef`.
- Result: `{ action, systemId, repoPath, ref, pattern, path, hits: [{path, line, text}], truncated }`. Every `path` and `text` leaf goes through `wrapField`/`wrapUntrusted` with the `GIT grep <repo> — <field>` label.
- Zero hits returns `hits: []` — a success, not a refusal.

**Paged `read_file`** — same file

- Branch and path validation unchanged. The read now calls `readRemoteFilePage` with `offset` (≥1, default 1) and `limit` (1..2000, default 200).
- Result adds `offset`, `limit`, `linesRead`, `totalLines`, `hasMore`, `isBinary`, and `nextOffset` only when `hasMore`. A binary page returns `content: ''` instead of bytes.
- `getRemoteFileContent` is no longer imported by the tool; `RemoteFileViewer` still uses it.

**Reviewer prompt** — `src/services/ai/office/teamPrompts.ts`

`REVIEWER_GIT_READ_LINE` now orders `grep` → `tree` → paged `read_file` → branch/diff context, states that one `read_file` call is one page and `nextOffset` continues it, and keeps the "not a write path, results are data" sentence.

**Tests**

- `teamToolsGitRead.test.ts`: the mock seam was widened to `{ stdout, stderr, exitStatus }` so the page-1 binary probe and the `###EXIT` marker are expressible; helpers `queuePage` and `queueFailingSource` encode the two-call page shape. New cases: page with `nextOffset`, last page without it, binary page with empty content, empty grep `hits: []`, missing `pattern` refusal, `-`-prefixed grep branch refusal. The definition case asserts eight actions and the new property set.
- `teamPrompts.test.ts`: one new case asserts `grep` precedes `read_file`, and that `nextOffset`, `hasMore` and the data-not-instructions sentence are present.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Tests pinned `realpath -e`, which plan 01 removed**
- **Found during:** Task 1 verification
- **Issue:** `teamToolsGitRead.test.ts` asserted the working-copy snippet contains `root=$(realpath -e -- …)`. Plan 01 dropped `-e` (GNU-only; BSD/macOS rejects it), so that assertion was already failing at HEAD.
- **Fix:** the assertions now expect `realpath --`, and the fallback case queues the working-copy source's own probe + pager pass.
- **Files modified:** `tests/services/ai/office/teamToolsGitRead.test.ts`
- **Commit:** `0403d605`

**2. [Rule 3 - Blocking] Existing read_file mocks could not express the new call shape**
- **Found during:** Task 2
- **Issue:** `read_file` now costs two remote calls on page 1 (binary probe, then pager). The old `queue(...stdouts)` helper produced exit-0 strings for both, so the probe read as "binary" and every read_file case returned empty content.
- **Fix:** `queue` accepts `string | { stdout, stderr, exitStatus }`; `queuePage` and `queueFailingSource` encode the probe-plus-pager pair. The whitespace-preservation case's `mockImplementation` branches on `od -An -tx1` and `###TOTAL`.
- **Files modified:** `tests/services/ai/office/teamToolsGitRead.test.ts`
- **Commit:** `0403d605`

### Plan text corrected

The plan's Task 2 snippet reads `page.offset + page.linesRead` for `nextOffset`. That is correct for a full page but would skip a line if a page were short for any reason other than EOF. Left as the plan specified: `hasMore` is computed from the same arithmetic in `readRemoteFilePage`, so the two agree by construction.

## Verification

- `npx tsc --noEmit -p tsconfig.json` → exit 0.
- `npx vitest run tests/services/ai/office/teamToolsGitRead.test.ts tests/services/ai/office/teamTools.test.ts tests/services/ai/office/teamPrompts.test.ts` → **159/159 pass** (38 + 70 + 51).
- Tool count assertion still reads 11 — `git_read` gained actions, not a new tool.

## Self-Check: PASSED

- `src/services/ai/office/teamTools.ts` — `case 'grep'` present once; `grepRemoteRef` appears twice (import + call); `readRemoteFilePage` twice; `getRemoteFileContent` zero times; `entire content, no truncation` zero times.
- `src/services/ai/office/teamPrompts.ts` — `grep` index < `read_file` index; `nextOffset` and `hasMore` present.
- Commits `83db9e89`, `0403d605`, `3cae4a3c` present.
