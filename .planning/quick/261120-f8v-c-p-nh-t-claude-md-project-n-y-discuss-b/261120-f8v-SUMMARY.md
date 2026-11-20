---
phase: quick-261120-f8v
plan: '01'
subsystem: workbench-ai-ux
tags: [vietnamese-convention, ssh-remote-explorer, markdown-sanitization, ai-popout, global-search]
requires:
  - phase: phase-47-workbench
    provides: layoutStore transient targets, remote explorer tree, renderSafeMarkdown, floating ai-popout
provides:
  - Vietnamese discussion convention in root CLAUDE.md
  - Reveal-in-Explorer action for open SSH remote file tabs
  - Bare language-token + code normalization in AI chat Markdown renderer
  - Selection Open in Chat draft handoff into the floating AI window
  - IntelliJ-style global file/folder search across the connected SSH remote
affects: [workbench remote explorer, AI chat rendering, AI popout, project conventions]
tech-stack:
  added: []
  patterns:
    - transient one-shot layout requests excluded from persist partialize
    - confined remote git commands with query filtered client-side
    - single code-block HTML helper shared by fenced and normalized snippets
    - cross-window draft handoff via Tauri event / same-origin postMessage
key-files:
  created:
    - tests/views/AIPopoutView.test.tsx
  modified:
    - CLAUDE.md
    - src/workbench/store/layoutStore.ts
    - src/workbench/editor/RemoteFileViewer.tsx
    - src/workbench/toolwindows/RemoteGitExplorer.tsx
    - src/utils/markdown.ts
    - src/utils/aiPopout.ts
    - src/views/AIPopoutView.tsx
    - src/components/ai/InlineAISelectionBar.tsx
    - src/context/AIChatContext.tsx
    - src/App.tsx
    - src/services/gitRemoteTreeService.ts
key-decisions:
  - Reveal reuses pendingTerminalTarget transient pattern; target never persisted and paths only pass through confined getRemoteTree.
  - Bare-fence fix keeps the hand-rolled renderer and a curated language allowlist; no remark/unified rewrite, no new dependencies.
  - Popout draft uses new ai-set-draft event / same-origin postMessage and reuses pendingDraft composer seeding; failed handoff falls back to in-app flow.
  - Global search issues one ls-tree -r command, filters the query in JS so user text never reaches the shell, and represents matching folders via their path ancestors.
patterns-established:
  - one-shot store requests are set/consume pairs omitted from partialize
  - Tauri event + browser postMessage pair guarded by origin/marker validation for cross-window payloads
requirements-completed: [CONVENTION-VIETNAMESE, REVEAL-REMOTE-EXPLORER, MD-BARE-FENCE-FIX, FLOATING-CHAT-DRAFT, GLOBAL-REMOTE-SEARCH]
actuals:
  tokens: 17783
  tasks: 5
  commits: 9
  plan_head_before: 25820f0eb91abcafa598ad1f10586b8eb9332182
  plan_head_after: be19854a721b038538ac675c5a4b9e052df15da2
duration: 26 min
completed: 2026-11-20
status: complete
---

# Quick 261120-f8v: CLAUDE.md, Remote Explorer, Markdown, AI popout, Global Search Summary

**Vietnamese discussion convention plus remote-file reveal, safe bare-fence Markdown rendering, floating-AI-chat draft routing, and confined whole-ref remote search — all 5 items shipped with zero new dependencies.**

## Performance

- **Duration:** 26 min
- **Started:** 2026-11-20T04:09:26Z
- **Completed:** 2026-11-20T04:35:53Z
- **Tasks:** 5 of 5
- **Files modified:** 19
- **Commits:** 9 (4 RED + 4 GREEN + 1 docs)

## Accomplishments

- Root `CLAUDE.md` `## Conventions` now declares Vietnamese as the discussion language and keeps code identifiers, paths, commands and technical terms in original form.
- Open SSH remote file tabs have a Reveal action that selects the matching node in the left Remote Git Explorer, expanding ancestor folders; disabled without SSH context and degraded gracefully on error.
- `renderSafeMarkdown` now normalizes a bare curated language token followed by code-looking lines into an escaped, syntax-labelled code block, sharing one markup helper with real fences.
- Selection "Open in Chat" seeds the open floating AI popout composer (with entity scope) via Tauri event / same-origin `postMessage`; falls back to the in-app draft when no popout exists or handoff fails.
- Remote explorer global search finds files and folders across the whole connected ref with type icons, path breadcrumbs, highlighted matches, and click/ArrowUp/ArrowDown/Enter navigation; files open in a tab, folders reveal in the tree.

## Task Commits

Each task followed RED → GREEN; Task 1 is docs-only.

1. **Task 1: Vietnamese convention** - `87a973e0` (docs)
2. **Task 2 RED: reveal tests** - `deba0c7c` (test)
3. **Task 2 GREEN: reveal implementation** - `751381a9` (feat)
4. **Task 3 RED: bare-fence tests** - `74426668` (test)
5. **Task 3 GREEN: bare-fence fix** - `329aebe1` (fix)
6. **Task 4 RED: popout handoff tests** - `a9ab7820` (test)
7. **Task 4 GREEN: popout handoff implementation** - `023e33ae` (feat)
8. **Task 5 RED: global search tests** - `622481a4` (test)
9. **Task 5 GREEN: global search implementation** - `be19854a` (feat)

## Files Created/Modified

- `CLAUDE.md` - added `### Language` under Conventions.
- `src/workbench/store/layoutStore.ts` - transient `pendingRevealTarget` set/consume pair.
- `src/workbench/editor/RemoteFileViewer.tsx` - Reveal toolbar button (`Hiện trong Explorer`).
- `src/workbench/toolwindows/RemoteGitExplorer.tsx` - controlled Tree selection/expansion, reveal effect, global search UI + navigation.
- `src/utils/markdown.ts` - curated bare-language normalization, shared code-block markup helper.
- `src/utils/aiPopout.ts` - `AI_DRAFT_EVENT`, `isAiPopoutOpen`, `sendTextToAiPopout`, tracked browser handle.
- `src/views/AIPopoutView.tsx` - Tauri/browser draft listeners feeding `pendingDraft` and active scope.
- `src/components/ai/InlineAISelectionBar.tsx` - scope computed once, routed to popout with in-app fallback.
- `src/context/AIChatContext.tsx` - `setPendingDraft` setter for cross-window seeding.
- `src/App.tsx` - legacy popout route wrapped with `AIChatProvider`.
- `src/services/gitRemoteTreeService.ts` - `searchRemoteTree` with `SEARCH_RESULT_LIMIT`.
- Tests: `src/workbench/__tests__/RemoteFileViewer.test.tsx`, `src/workbench/__tests__/RemoteGitExplorer.test.tsx`, `src/services/__tests__/gitRemoteTreeService.test.ts`, `tests/utils/markdown.test.ts`, `tests/ai/aiPopout.test.ts`, `tests/components/ai/InlineAISelectionBar.test.tsx`, `tests/views/AIPopoutView.test.tsx`, `tests/components/notes/DocEditorPane.test.tsx`.

## Decisions Made

- Reveal uses the existing one-shot layout request pattern; the file path only reaches the already-confined `getRemoteTree` service, never a shell command.
- Bare-fence normalization accepts a language label only from a fixed allowlist and routes all code lines through the existing `escapeHtml`, so sanitization is unchanged.
- Global search filters the query client-side after a single `ls-tree -r -l -z --end-of-options <escaped-ref>` call; folder hits derive from path ancestors, capped at 100 results.

## Deviations from Plan

None - plan executed as written. Two in-scope supporting changes were needed: `AIChatContext` gained a tiny `setPendingDraft` setter (the plan's preferred reuse path), and the legacy `App.tsx` popout route was wrapped with `AIChatProvider` so the new listener has a context. Both are required for the handoff to work and add no new dependencies.

## Issues Encountered

- Baseline `npm test` failed on a missing `zustand` module even though it was declared in `package.json` and pinned in `package-lock.json`. Fixed by running `npm ci` to restore the locked dependency tree (no new packages, no lockfile change).
- Plan verification step says `npm test -- <files>`; this project's test script is `vitest run`, so verification used `npm test -- --run <files>`.
- Test fixture for `ls-tree -l` was initially in the wrong column order (`size` before tab instead of after SHA); corrected to match `parseLsTreeLine`.
- Manual Tauri smoke walkthroughs (reveal, popout draft, global search) were not run; automated tests cover the behavior contracts.

## Known Stubs

None. The global search input `placeholder` text is a real UI placeholder, not an unimplemented data source.

## Threat Flags

None. All four high/medium threat rows in the plan were mitigated in code: confined reveal paths, allowlisted/escaped Markdown, same-origin + namespaced cross-window drafts, and client-side-only search query filtering.

## Verification

- All focused tests: 8 files, 105 tests passed (`npm test -- --run ...`).
- `npx tsc --noEmit` clean.
- `npm run build` succeeded (existing chunk-size warnings only, no new errors).

## Next Phase Readiness

Quick task complete. No blockers. Manual Tauri smoke remains optional for visual confirmation of the three interaction flows.

## Self-Check: PASSED

All 9 task commits verified in git history. SUMMARY.md exists with `status: complete`. Created test file `tests/views/AIPopoutView.test.tsx` present on disk. Focused suite (105 tests), typecheck and production build all pass.

---
*Phase: quick-261120-f8v*
*Completed: 2026-11-20*
