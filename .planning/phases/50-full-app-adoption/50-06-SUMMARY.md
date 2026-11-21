---
phase: 50-full-app-adoption
plan: 06
subsystem: ui
tags: [antd, react, workbench, toolwindows, iconbutton, notify-callback, css-vars, adoption]

requires:
  - phase: 50-full-app-adoption
    provides: 50-01 foundation with codemod, ThemeAppHolder, context hooks and manifest-driven guards
provides:
  - 28 workbench/toolwindow files on UI barrel imports with no runtime antd/icons import
  - notify-driven actionRegistry with view-owned callback and no global AntD bridge
  - 14 icon-only toolbar buttons converted to IconButton with byte-identical aria-label
  - Token-valued inline literals replaced by CSS vars across the workbench surface
  - wave-06.txt manifest registering the 28 migrated paths for static API and inline sweep guards
affects: [50-full-app-adoption waves 7-9, 50-UAT.md, U5 toolbar icon button flow]

tech-stack:
  added: []
  patterns:
    - Non-React service receives notify(kind, text) callback from React view; no AntD singleton
    - Icon-only controls use IconButton with required aria-label, preserving UAT selector names
    - Compound AntD slots are mirrored as named exports (InputSearch, TextArea) in ui barrel
    - Token-valued inline styles use CSS vars; fixed dimensions stay inline

key-files:
  created:
    - tests/fixtures/adoption/wave-06.txt
  modified:
    - src/workbench/actions/actionRegistry.ts
    - src/workbench/hooks/useGlobalKeymap.ts
    - src/workbench/search/SearchEverywhereModal.tsx
    - src/workbench/toolwindows/RemoteGitExplorer.tsx
    - src/workbench/__tests__/actionRegistry.test.ts
    - src/workbench/TitleBar.tsx
    - src/components/ui/input.tsx
    - src/components/ui/textarea.tsx
    - src/components/ui/index.ts

key-decisions:
  - "executeAction(id, notify) threads a view-owned callback through perform and dispatchHandledAction; a noop default keeps non-notifying callers and tests simple"
  - "useGlobalKeymap owns useMessage and maps notify(kind, text) to message[kind](text), so the non-React registry never imports AntD"
  - "IconButton replaced icon-only Buttons without changing a single aria-label, keeping the U5 and theme-toggle UAT selectors intact"
  - "Compound AntD slots are exposed as named wrapper exports (InputSearch, TextArea) rather than runtime antd imports in views"

patterns-established:
  - "Notify callback travels from React hook to non-React service; no global bridge module"
  - "Compound AntD slots become named mirror exports in src/components/ui when a wave needs them"

requirements-completed: [ADOPT-01, ADOPT-02, ADOPT-03]

duration: 13min
completed: 2026-11-21
---

# Phase 50 Plan 06: Full App Adoption — Workbench and Toolwindows Summary

**28 workbench/toolwindow files migrated to the UI barrel with notify-driven actionRegistry, IconButton toolbar controls, and CSS-var token cleanup**

## Performance

- **Duration:** 13 min
- **Started:** 2026-11-21T13:02:30Z
- **Completed:** 2026-11-21T13:15:54Z
- **Tasks:** 2/2
- **Files modified:** 35

## Accomplishments
- All 28 workbench paths import runtime controls only from `src/components/ui` and icons from `src/components/ui/icon`; zero runtime `antd`/`@ant-design/icons` import remains in `src/workbench`.
- `actionRegistry.ts` now receives `executeAction(id, notify)` and forwards the callback through `perform` and `dispatchHandledAction`; no AntD import or global bridge exists in the non-React service.
- 14 icon-only buttons across TitleBar, FindInRemoteFiles, AiOfficeExplorer, AiStaffExplorer and RemoteGitExplorer use `IconButton` with unchanged `aria-label`, including `Chuyển đổi giao diện sáng/tối` and `Open Tasks`.
- All 161 token-valued inline literals in the wave were replaced with CSS vars; the theme toggle keeps its fixed 28x28/padding-0/radius-4 dimensions.
- `wave-06.txt` registers 28 paths, and the static API + inline sweep guards both pass on this wave.

## Task Commits

1. **Task 1: Codemod + static API → hook + IconButton cho 28 file workbench** — `64e04934` (feat)
2. **Task 2: Dọn inline token-valued + manifest wave-06** — `100e47fd` (test)

**Plan metadata commit:** pending — orchestrator owns final metadata commit after the wave.

## Files Created/Modified
- `tests/fixtures/adoption/wave-06.txt` — 28 migrated source paths
- `src/workbench/actions/actionRegistry.ts` — notify-driven `ActionNotify` signature, no static message import
- `src/workbench/hooks/useGlobalKeymap.ts` — maps context message instance to `notify`
- `src/workbench/search/SearchEverywhereModal.tsx`, `src/workbench/toolwindows/RemoteGitExplorer.tsx` — pass notify into `executeAction`
- `src/workbench/__tests__/actionRegistry.test.ts` — notify stub replaces static `message` spy
- `src/workbench/TitleBar.tsx` — IconButton toolbar and theme toggle, CSS-var literals
- `src/components/ui/input.tsx`, `textarea.tsx`, `index.ts` — additive `InputSearch` and `TextArea` named mirrors
- 28 workbench/toolwindow files — barrel imports, context hooks, IconButton and CSS vars

## Decisions Made
- `notify` defaults to a noop in `executeAction` so callers that do not need feedback (and tests) keep a one-argument signature; notifying callers pass a real callback.
- `useMessage()` lives in the React hook/view, never in the `.ts` service, satisfying D-06 without a singleton.
- `InputSearch`/`TextArea` were added as named mirrors inside the wrapper layer instead of allowing runtime imports at the view.
- Repeated hex fallback tokens inside `var(--token, #hex)` were removed so the inline sweep guard sees a single token source; near-token sizes normalized to `--font-size-small`/`--font-size-xs`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Compound AntD slots failed typecheck after codemod**
- **Found during:** Task 1 verification
- **Issue:** `Input.Search`, `Input.TextArea`, `List.Item`, `Descriptions.Item`, `Space.Compact`, `Radio.Group` and `Empty.PRESENTED_IMAGE_SIMPLE` are not properties of the wrapper functions, so `tsc` failed on 30+ call sites.
- **Fix:** Replaced compound usage with existing named mirrors and added `InputSearch`/`TextArea` named exports inside `src/components/ui`; no runtime AntD import at the view.
- **Files modified:** `src/components/ui/input.tsx`, `textarea.tsx`, `index.ts` and 6 workbench files
- **Verification:** `npx tsc --noEmit` exit 0.
- **Committed in:** `64e04934`

**2. [Rule 3 - Blocking] Inline sweep guard flagged 161 literals across 23 files, not just the 6 named in Task 2**
- **Found during:** Task 2 verification after creating `wave-06.txt`
- **Issue:** The manifest-driven guard scans every migrated path; token-valued `fontSize`, `borderRadius` and hex fallbacks remained in 23 of the 28 files.
- **Fix:** Replaced all guarded literals with CSS vars across the full manifest, keeping only fixed dimensions inline.
- **Files modified:** 23 workbench files under `src/workbench`
- **Verification:** `inlineStyleSweep.test.ts` 2/2 pass, `npm run test:foundation` 14 files/83 tests pass.
- **Committed in:** `100e47fd`

**3. [Rule 1 - Bug] Sequential size replacement corrupted decimal font sizes**
- **Found during:** Task 2 typecheck
- **Issue:** `fontSize: 12.5` became `'var(--font-size-small)'.5` because `fontSize: 12` was replaced first, producing invalid JS.
- **Fix:** Normalized the corrupted fragments to a single quoted CSS var and quoted bare CSS var object values.
- **Files modified:** 6 workbench files
- **Verification:** `npx tsc --noEmit` exit 0.
- **Committed in:** `100e47fd`

**4. [Rule 1 - Bug] Hex fallback replacement produced unquoted CSS vars in JS objects**
- **Found during:** Task 2 typecheck
- **Issue:** `color: var(--accent)` was emitted as bare JS instead of a quoted CSS value string.
- **Fix:** Quoted bare var values in style objects while leaving already-quoted CSS strings untouched.
- **Files modified:** 6 workbench files
- **Verification:** `npx tsc --noEmit` exit 0, inline sweep green.
- **Committed in:** `100e47fd`

---

**Total deviations:** 4 auto-fixed (2 Rule 3 blocking, 2 Rule 1 bugs). No scope creep; all fixes required for type safety and guard compliance.

## Issues Encountered
- Two pre-existing `react-hooks/exhaustive-deps` unused-disable warnings in FindInRemoteFiles and RemoteGitExplorer remain; they are outside this plan's scope.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
Wave 6 guards are active and U5 toolbar icon buttons keep their accessible names for Chrome light/dark UAT. Later waves can continue codemod-driven migration; final D-11 lint promotion remains a later plan.

## Self-Check: PASSED

- Verified commits `64e04934` and `100e47fd` in git history.
- Verified `tests/fixtures/adoption/wave-06.txt` has exactly 28 non-empty lines.
- Verified no runtime `antd`/`@ant-design/icons` import and no unbound static API call remains in `src/workbench`.
- Final gates: `npx tsc --noEmit`, `npm run lint`, `npx eslint src/workbench`, `npm run test:foundation`, static API guard, inline style sweep and `actionRegistry.test.ts` — all green.

---
*Phase: 50-full-app-adoption*
*Completed: 2026-11-21*
