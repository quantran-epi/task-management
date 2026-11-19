---
phase: 47-ssh-remote-explorer-ai-code-understanding
plan: 02
subsystem: remote-explorer-search
tags: [ssh-remote, git-grep, search, initialLine, one-shot-param, antd, react, vitest, read-only]

# Dependency graph
requires:
  - phase: 47-ssh-remote-explorer-ai-code-understanding
    provides: "47-01 remote scope foundation, target UUID, and structured selection anchor"
  - phase: 29.1-remote-ssh-git-explorer
    provides: "RemoteGitExplorer target state, RemoteFileViewer readonly DOM, confined read-only git services"
provides:
  - "Content (ripgrep-style) search scoped to the active SSH config + repoPath + branch, using the existing bounded grepRemoteRef with the pattern passed as data"
  - "Name/folder search filtering the already-loaded repo-relative tree, capped and independent of content mode"
  - "path:line:text hit rows that open the existing readonly remote_file tab at the matching line via one-shot initialLine"
  - "One-shot tab param list (targetMessageId + initialLine) with plain-reopen clear, and initialLine highlight/scroll that ignores out-of-range values"
affects:
  - "Phase 47 plans 03-05 (explicit remote tool target, inline popover, path:line citations) — reuses the one-shot initialLine tab-param contract for citation open-at-line"
  - "RemoteFileViewer / layoutStore tab-param semantics"

# Actuals (#2632) — same estimateTokens scale (chars/4 over the realized diff).
actuals:
  tokens: 7588
  tasks: 3
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ONE_SHOT_TAB_PARAM_KEYS list makes every deeplink-style tab param (message highlight, remote line) clear on plain reopen; only fresh navigation re-sets it"
    - "Search result click opens the stable remote:<path> tab id and reuses the existing readonly viewer; initialLine is included only for a search/citation hit"
    - "Content search passes the user pattern to grepRemoteRef as DATA (literal: true, limit: 200); escaping/confinement stay in gitRemoteService.ts, never reimplemented in the renderer"

key-files:
  created: []
  modified:
    - src/workbench/toolwindows/RemoteGitExplorer.tsx
    - src/workbench/store/layoutStore.ts
    - src/workbench/editor/RemoteFileViewer.tsx
    - src/workbench/__tests__/RemoteGitExplorer.test.tsx
    - src/workbench/__tests__/RemoteFileViewer.test.tsx
    - src/workbench/__tests__/layoutStore.test.ts

key-decisions:
  - "D-02: both search modes read the active target from the existing layoutStore selectors; no new target picker or scope widening."
  - "D-03/D-04: content mode reuses grepRemoteRef (bounded, -e/--end-of-options escaped) and renders path:line:text; name mode filters the in-memory tree — no new filesystem walker or whole-file read."
  - "D-14: the leading-dash/special-char search pattern is passed as literal data to grepRemoteRef; escapeShellArg count in gitRemoteService.ts stays at 14, no new shell/write path."
  - "Pitfall 3: one-shot initialLine is cleared on plain tree reopen via a reusable key list, so a stale searched line never re-highlights; out-of-range initialLine is ignored gracefully."
  - "D-01: no edit to shared .planning/ROADMAP.md or .planning/STATE.md (parallel phases 45/46); orchestrator owns any tracking updates."

patterns-established:
  - "One-shot tab deeplink params are declared in a single list and uniformly stripped from merged params on plain reopen."
  - "Search hit → openRemoteFile(filePath, title, extra) → stable remote:<path> tab id; initialLine flows through EditorArea's existing tab.params spread with no EditorArea change."

requirements-completed: [D-02, D-03, D-04, D-14]

# Coverage metadata (#1602) — one entry per shipped deliverable.
coverage:
  - id: D1
    description: "Content search runs in the active target and passes the pattern as bounded literal data to grepRemoteRef"
    requirement: D-02
    verification:
      - kind: unit
        ref: "src/workbench/__tests__/RemoteGitExplorer.test.tsx#content search calls grepRemoteRef with the active target and bounded limit, renders path:line:text, and opens at that line"
        status: pass
      - kind: other
        ref: "grep -c grepRemoteRef src/workbench/toolwindows/RemoteGitExplorer.tsx == 3 (baseline 0); escapeShellArg count in gitRemoteService.ts == 14 (unchanged)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Content hits render as path:line:text and clicking opens the readonly remote tab at that line"
    requirement: D-04
    verification:
      - kind: unit
        ref: "src/workbench/__tests__/RemoteGitExplorer.test.tsx#content search calls grepRemoteRef with the active target and bounded limit, renders path:line:text, and opens at that line"
        status: pass
    human_judgment: false
  - id: D3
    description: "Name/folder search filters the active tree by relative path, opens the readonly tab, and does not leak across modes"
    requirement: D-03
    verification:
      - kind: unit
        ref: "src/workbench/__tests__/RemoteGitExplorer.test.tsx#name mode filters the active tree by relative path and opens the remote tab without initialLine; switching modes clears the other mode's results"
        status: pass
    human_judgment: false
  - id: D4
    description: "One-shot initialLine highlights and scrolls in-range, ignores out-of-range, and is cleared on plain reopen"
    requirement: D-04
    verification:
      - kind: unit
        ref: "src/workbench/__tests__/RemoteFileViewer.test.tsx#highlights and scrolls to initialLine, ignores out-of-range, and leaves no stale highlight without it"
        status: pass
      - kind: unit
        ref: "src/workbench/__tests__/layoutStore.test.ts#clears one-shot deeplink params on plain reopen but re-sets them on a fresh navigation"
        status: pass
    human_judgment: false
  - id: D5
    description: "Every search read stays on confined, escaped, bounded read-only services; no write path introduced"
    requirement: D-14
    verification:
      - kind: unit
        ref: "src/workbench/__tests__/RemoteGitExplorer.test.tsx#content search passes leading-dash/special-char pattern as data to grepRemoteRef"
        status: pass
    human_judgment: false
  - id: D6
    description: "Live SSH walkthrough of search + open-at-line against a real remote host"
    requirement: D-02
    verification: []
    human_judgment: true
    rationale: "No configured SSH remote host in this environment; live read-only walkthrough is a manual UAT item (47-VALIDATION.md). Automated mocked coverage proves the contract, not real-host behavior."

# Metrics
duration: 15min
completed: 2026-11-19
status: complete
plan_head_before: cf2483c0d1ed67d1fd960cb95f1b4e6216da8d02
plan_head_after: e8f4f3dc09bc81e6375579c44078358db7e42de8
---

# Phase 47 Plan 02: SSH Remote Explorer Search Summary

**Active-target name/content search over the existing confined git services, with bounded `path:line:text` hits that open the readonly remote viewer at a one-shot highlighted line**

## Performance

- **Duration:** 15 min
- **Started:** 2026-11-19T09:49:48Z
- **Completed:** 2026-11-19T10:05:26Z
- **Tasks:** 3 (1 tracer + 2 auto)
- **Files modified:** 6

## Accomplishments

- Content search (ripgrep-style) runs in the currently open SSH config + repoPath + branch, passing the user pattern as literal data to the existing bounded `grepRemoteRef` (200-hit cap, `-e`/`--end-of-options` escaping left in the service).
- Name/folder search filters the already-loaded repo-relative tree case-insensitively by path segment, capped at 200 rows, with no new walker or whole-file read; content/name modes are independent.
- Content hits render as `path:line:text` and open the existing `remote:<path>` readonly tab with a one-shot `initialLine`; the viewer highlights and scrolls to that line.
- One-shot tab params (`targetMessageId` + `initialLine`) now share a single clear list, so a plain tree reopen never re-highlights a stale searched line; out-of-range lines are ignored gracefully.

## Task Commits

Each task was committed atomically:

1. **Task 1 (tracer): content search to open-at-line, one path end-to-end** — `bdef229d` (feat)
2. **Task 2: name/folder search mode scoped to the active tree** — `e8f4f3dc` (feat)
3. **Task 3: one-shot initialLine + viewer highlight/scroll regression** — implemented and committed within Task 1's commit `bdef229d` (the tracer carried `layoutStore.ts`, `RemoteFileViewer.tsx`, and their focused tests); verified independently below.

_Note: Task 1 was a tracer. Its automated-only `<verify>` (`tsc --noEmit` + focused explorer test) was re-run end-to-end after commit per the tracer feedback gate (interactive, `end-of-phase` mode) before expanding to Tasks 2-3._

## Files Created/Modified

- `src/workbench/toolwindows/RemoteGitExplorer.tsx` — content/name `Segmented` search input, debounced `grepRemoteRef` call, bounded `path:line:text` and name hit lists, shared `openRemoteFile` tab-open helper.
- `src/workbench/store/layoutStore.ts` — `ONE_SHOT_TAB_PARAM_KEYS` list and uniform one-shot clear in `openTab`.
- `src/workbench/editor/RemoteFileViewer.tsx` — optional `initialLine` prop, in-range highlight style + `scrollIntoView`, out-of-range guard; readonly markers and 2MB guard unchanged.
- `src/workbench/__tests__/RemoteGitExplorer.test.tsx` — content-search call args/rendering/click and name-mode filtering/mode-switch tests.
- `src/workbench/__tests__/RemoteFileViewer.test.tsx` — highlight + scroll, out-of-range safe, no stale highlight.
- `src/workbench/__tests__/layoutStore.test.ts` — one-shot param clear/re-set on reopen.

## Decisions Made

- Search reuses the explorer's existing active-target selectors and the confined git services; no target picker, no new shell/write path (D-02/D-14).
- Content search passes the pattern as literal data to `grepRemoteRef`; escaping and the 200-hit cap stay in `gitRemoteService.ts` (verified `escapeShellArg` uses still 14).
- Name mode filters the in-memory tree rather than re-walking the remote filesystem, keeping paths repo-relative and reads bounded.
- `initialLine` is a one-shot param alongside `targetMessageId`, cleared on plain reopen, so later citation navigation (plan 05) inherits the same contract.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `exactOptionalPropertyTypes` rejected optional extra tab params**
- **Found during:** Task 1 (typecheck)
- **Issue:** the `openRemoteFile` helper's `extra` type used `size?: number`, but tree nodes pass `number | undefined`.
- **Fix:** widened the helper's optional fields to `number | undefined` / `string | undefined`.
- **Files modified:** `src/workbench/toolwindows/RemoteGitExplorer.tsx`
- **Verification:** `tsc --noEmit` clean.
- **Committed in:** `bdef229d`

**2. [Rule 1 - Bug] Test targeted antd's `Input.Search` wrapper instead of the `<input>`**
- **Found during:** Task 1 (focused test)
- **Issue:** `data-testid` landed on the wrapper div; `fireEvent.change` threw "element does not have a value setter".
- **Fix:** resolve the nested `input` element in the test before firing change.
- **Files modified:** `src/workbench/__tests__/RemoteGitExplorer.test.tsx`
- **Verification:** focused explorer test passes (6/6, later 8/8).
- **Committed in:** `bdef229d` (test file)

**3. [Rule 1 - Bug] Name-mode test searched a lazily-unloaded child path**
- **Found during:** Task 2 (focused test)
- **Issue:** `src/index.ts` is only loaded after expanding `src`, so name filtering correctly returned no match for it.
- **Fix:** search the root-level `package.json` leaf for the filter/click assertion.
- **Files modified:** `src/workbench/__tests__/RemoteGitExplorer.test.tsx`
- **Verification:** focused explorer test passes (8/8).
- **Committed in:** `e8f4f3dc`

---

**Total deviations:** 3 auto-fixed (all Rule 1 test/typecheck fixes). **Impact:** no scope creep, no contract change; all fixes were necessary for correctness of the new tests and typecheck.

## Issues Encountered

- None blocking. A React scheduler `window is not defined` message appeared once when two jsdom test files ran in one process; both files passed (20/20) and the plan-level union run of three focused files was clean (28/28, no unhandled errors). This is a jsdom teardown artifact, not a product failure.

## User Setup Required

None — no external service configuration required for the automated contract tests. Live SSH walkthrough is a manual UAT item (no configured remote host here).

## Next Phase Readiness

- The one-shot `initialLine` tab param and `openRemoteFile` helper are ready for plan 05's `path:line` citation navigation to open remote files at a line without leaking stale highlights.
- Search modes are scoped to the active target; no new target picker was added, consistent with the deferred "full remote-path search" idea.
- Live SSH/Tauri walkthrough remains manual UAT (47-VALIDATION.md); automated mocked coverage records the contract.
- D-01 isolation honored: no edit to shared `ROADMAP.md` or `STATE.md`; orchestrator owns any tracking update.

## Self-Check: PASSED

- Modified files exist on disk (explorer, layoutStore, viewer, three focused test files).
- Both task commits verified: `bdef229d` and `e8f4f3dc` are ancestors of HEAD.
- Acceptance greps pass: `grepRemoteRef` in explorer = 3 (baseline 0); `initialLine` in layoutStore = 2, viewer = 7 (baseline 0); Segmented name mode present; escapeShellArg count unchanged at 14.
- Plan-level verification: `tsc --noEmit` clean; union of three focused test files 28/28 pass.
- No stubs introduced; no file deletions in either task commit.

---
*Phase: 47-ssh-remote-explorer-ai-code-understanding*
*Completed: 2026-11-19*
