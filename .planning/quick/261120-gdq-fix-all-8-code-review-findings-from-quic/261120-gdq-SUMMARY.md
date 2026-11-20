---
phase: quick-261120-gdq
plan: '01'
subsystem: testing
tags: [react, remote-explorer, git-ls-tree, ai-popout, tauri-emit-to, markdown-sanitization, regression-fix]

requires:
  - phase: quick-261120-f8v
    provides: SSH remote file reveal, global whole-ref search, AI chat Markdown + floating popout draft handoff (the code under review)
provides:
  - Cross-branch pending reveal consumed via store->local branch sync; folder-result reveal shows tree; multi-level reveal fetches each ancestor once
  - Whole-ref search caches ls-tree stdout by config/repo/ref and caps real file matches independently of folder ancestors
  - Tauri draft/scope handoff scoped with emitTo; browser mode recovers session-restored named popup; Markdown prose no longer misrenders as bare code
affects: [workbench remote explorer, git remote tree service, AI popout handoff, safe Markdown renderer]

tech-stack:
  added: []
  patterns:
    - store→local sync through last-applied refs keyed on the store value (target + branch)
    - in-flight ref keyed by target identity to stop state-update effect re-entry
    - non-secret module-level cache Map for whole-ref git listings, success-only
    - emitTo(target, event) window-scoped cross-webview delivery instead of global emit
    - sessionStorage marker + named window re-open + hash verification for browser popout recovery

key-files:
  created: []
  modified:
    - src/workbench/toolwindows/RemoteGitExplorer.tsx
    - src/workbench/__tests__/RemoteGitExplorer.test.tsx
    - src/services/gitRemoteTreeService.ts
    - src/services/__tests__/gitRemoteTreeService.test.ts
    - src/utils/aiPopout.ts
    - tests/ai/aiPopout.test.ts
    - src/utils/markdown.ts
    - tests/utils/markdown.test.ts

key-decisions:
  - "Session marker lives in sessionStorage (not just a module var) so a page reload can re-adopt the session-restored named popup; recovery still verifies the #ai-popout hash and closes stray windows"
  - "Whole-ref cache key is config.id|repoPath|ref only — never the query, token, or secret; failures are not cached; no TTL"
  - "Folder ancestors are derived before capping so the last capped file still contributes its navigation folders; both files and folders pass confineRepoPath"
  - "Bare-language code heuristic needs a strong structural marker; CODE_KEYWORDS only counts with a trailing colon, never alone or with a lone ':'"
  - "HTML/Tag warnings in RemoteGitExplorer tests are pre-existing AntD deprecations, out of scope"

patterns-established:
  - "Reveal effects that depend on state they mutate need an in-flight ref guard, not a cancelled flag alone"
  - "Cross-branch UI alignment must sync both store and local component state or the alignment guard never clears"

requirements-completed: [REVEAL-CROSS-BRANCH, REVEAL-FOLDER-RESULT, REVEAL-NO-DUP-FETCH, GLOBAL-SEARCH-CACHE, SEARCH-CAP-FILES, POPOUT-SCOPED-EMIT, POPOUT-HANDLE-RECOVERY, MD-CODE-LINE-TIGHTEN]

actuals:
  tokens: 7112
  tasks: 3
  commits: 3
  plan_head_before: 4dc3d2a9cf20adc44a3fcc2e7261bfe60d8d4cd2
  plan_head_after: 0927799566c242ce797e95a3161dbfb4c0d9beda

coverage:
  - id: D1
    description: "Cross-branch pending reveals are consumed with the aligned tree loaded and folder-result reveals show the tree; multi-level reveals fetch each ancestor once"
    requirement: REVEAL-CROSS-BRANCH
    verification:
      - kind: unit
        ref: "src/workbench/__tests__/RemoteGitExplorer.test.tsx#consumes a cross-branch pending reveal / activating a global-search folder result / fetches each ancestor exactly once"
        status: pass
    human_judgment: false
  - id: D2
    description: "Whole-ref search caches by config/repo/ref, new ref refetches, and broad searches return up to the full file cap with folder ancestors derived separately"
    requirement: GLOBAL-SEARCH-CACHE
    verification:
      - kind: unit
        ref: "src/services/__tests__/gitRemoteTreeService.test.ts#caps real file matches independently / reuses one whole-ref listing"
        status: pass
    human_judgment: false
  - id: D3
    description: "Tauri draft and scope events are delivered only to the ai-popout window via emitTo; browser mode recovers session-restored popups"
    requirement: POPOUT-SCOPED-EMIT
    verification:
      - kind: unit
        ref: "tests/ai/aiPopout.test.ts#emits the draft event scoped / scopes the scope event / recovers a session-restored named popout"
        status: pass
    human_judgment: false
  - id: D4
    description: "Markdown prose with a colon, parentheses, or code-like keywords no longer renders as a bare code block, while genuine code still does"
    requirement: MD-CODE-LINE-TIGHTEN
    verification:
      - kind: unit
        ref: "tests/utils/markdown.test.ts#bare language token followed by code (false-positive regressions + def foo(x): true-positive)"
        status: pass
    human_judgment: false

duration: 7min
completed: 2026-11-20
status: complete
---

# Quick 261120-gdq: Close 8 code-review findings from 261120-f8v Summary

**Fixed cross-branch reveal alignment, global-search cap fairness and caching, window-scoped AI handoff with browser popup recovery, and Markdown prose false positives across four modules**

## Performance

- **Duration:** 7 min
- **Started:** 2026-11-20T04:53:55Z
- **Completed:** 2026-11-20T05:01:00Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- RemoteGitExplorer: pending reveals on a different branch now align local `selectedBranch` from the store and are consumed; folder results clear the global query so the Tree renders; a target-keyed in-flight ref plus a single post-loop `setTreeData` stops duplicate ancestor fetches.
- gitRemoteTreeService: whole-ref `ls-tree -r` stdout cached by `config.id|repoPath|ref` (success only, failure never cached, `clearSearchTreeCache()` for tests); `SEARCH_RESULT_LIMIT` now caps real file matches while folder ancestors are derived separately, both confined.
- aiPopout: Tauri draft/scope handoffs use `emitTo('ai-popout', ...)` instead of global `emit`; browser mode stores a sessionStorage marker and re-adopts a session-restored named popup via `window.open('', name)` guarded by the `#ai-popout` hash, closing stray windows.
- markdown: `looksLikeCodeLine` requires a strong structural marker (`;`, braces, `=`, `=>`, `->`, identifier followed by `(`); keywords only count with a trailing colon, so prose with a lone `:` or spaced `(...)` no longer becomes a code block. `escapeHtml` / allowlist untouched.
- Focused verification: 4 test files, 89 tests pass; `npm run build` succeeds (only pre-existing warnings). Full suite not run per project rule.

## Task Commits

Each task was committed atomically (code + tests only):

1. **Task 1: Fix reveal branch sync, folder-result reveal, and duplicate tree fetches** - `234c04e9` (fix)
2. **Task 2: Cap search by matching files and cache whole-ref tree listing** - `0b17eb4d` (fix)
3. **Task 3: Scope Tauri handoff, recover browser popout, tighten code-line heuristic** - `09277995` (fix)

Plan metadata commit: handled by orchestrator (docs not committed by executor).

## Files Created/Modified

- `src/workbench/toolwindows/RemoteGitExplorer.tsx` - added branch sync effect, in-flight reveal guard, single `setTreeData`, folder-result query clear
- `src/workbench/__tests__/RemoteGitExplorer.test.tsx` - 3 regression tests (cross-branch reveal, folder activation, single ancestor fetch)
- `src/services/gitRemoteTreeService.ts` - search cache + file-only cap with folder set; `clearSearchTreeCache()` export
- `src/services/__tests__/gitRemoteTreeService.test.ts` - cap fairness + cache reuse/refetch tests
- `src/utils/aiPopout.ts` - `emitTo` scoping, browser popout recovery helper + session marker
- `tests/ai/aiPopout.test.ts` - scoped emit assertions + recovery test
- `src/utils/markdown.ts` - tightened `looksLikeCodeLine`
- `tests/utils/markdown.test.ts` - false-positive and over-tightening-guard regressions

## Decisions Made

- Session marker persisted in `sessionStorage` rather than a module variable, because a module variable is lost on the very page reload that creates the recovery scenario; hash verification still prevents adopting a stray window.
- Cache uses only non-secret identifiers; no TTL per plan (stale-until-ref-change is the accepted tradeoff).
- Folder ancestors derived before the file cap check so a capped final file still yields navigation folders.

## Deviations from Plan

None - plan executed as written. (One test assertion for the folder-result case was tightened during verification: the reveal correctly consumes the pending target, so the test asserts consumption plus the ancestor `getRemoteTree` call instead of asserting a still-pending target.)

## Issues Encountered

- Initial folder-result regression test asserted `pendingRevealTarget` remained set; the implementation correctly consumes it after the reveal. Adjusted the test to assert the reveal ran and the target was consumed. No production change needed.
- Pre-existing AntD `bordered={false}` deprecation warnings and `getComputedStyle` jsdom notice appear in test output; unrelated to this plan's changes, left untouched.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

All 8 findings closed with module-local diffs and focused regression coverage. No new dependencies; confinement, shell escaping, and XSS escaping preserved. Ready for verify/code-review. No blockers.

---
*Phase: quick-261120-gdq*
*Completed: 2026-11-20*

## Self-Check: PASSED

All 8 source/test files and the SUMMARY exist on disk; all 3 task commits (`234c04e9`, `0b17eb4d`, `09277995`) are present in git history. Focused tests: 89/89 pass across 4 files. Build succeeds.
