---
phase: 50-full-app-adoption
plan: 08
subsystem: ui
tags: [antd, react, views, context-hooks, notify-callback, css-vars, codemod, adoption]

requires:
  - phase: 50-full-app-adoption
    provides: "50-05/06/07 wave summaries, adoption codemod, UI barrel, ThemeAppHolder, static-API and inline-style guards"
provides:
  - "52 migrated component/util/service files using UI barrel imports only (wave-08.txt manifest)"
  - "All static message/notification/Modal.confirm calls in the 52 paths converted to context hooks or injected notify callbacks"
  - "Four non-React .ts utilities (exportFolderZip, mermaidExport, claudeCliService, documentLinks) receive view-owned notify/confirm callbacks — no global AntD bridge"
  - "201 token-valued inline literals swept to CSS vars across 31 migrated files"
  - "Zero runtime antd/@ant-design/icons imports outside src/components/ui across whole src"
affects: [50-full-app-adoption wave 9, 50-UAT.md, eslint src final gate]

tech-stack:
  added: []
  patterns:
    - "Notify callback signature (kind, text, extra?) shared via exportFolderZip.Notify; callers bind useMessage()[kind] in object form with duration: 0 for loading"
    - "ModalFuncProps injection for documentLinks.confirm dialog; view supplies useTaskMateModal().modal and renders contextHolder"
    - "Static subcomponents (Form.Item, List.Item, Empty.PRESENTED_IMAGE_SIMPLE, Input.TextArea, Radio.Group, Space.Compact, ConfigProvider, etc.) replaced with named barrel wrappers per D-03"
    - "fontSize 11/12/13.5 -> --font-size-xs/small/ui, radius 6/8 -> --radius-control, accent/secondary hexes -> --accent/--fg-secondary"

key-files:
  created:
    - tests/fixtures/adoption/wave-08.txt
  modified:
    - src/utils/exportFolderZip.ts
    - src/utils/mermaidExport.ts
    - src/utils/documentLinks.tsx
    - src/services/ai/claudeCliService.ts
    - src/components/agents/AgentDiffReviewer.tsx
    - src/components/agents/CodingZoneDiffPanel.tsx
    - src/components/agents/RunGhostDevModal.tsx
    - src/components/dashboard/AttentionTodayList.tsx
    - src/components/palette/CommandPaletteModal.tsx
    - src/components/systems/SystemTable.tsx
    - src/components/agents/AgentTerminalLog.tsx
    - src/components/knowledge/GraphEvidenceDrawer.tsx
    - src/workbench/toolwindows/DocsExplorer.tsx
    - src/views/MermaidAssistantView.tsx
    - src/components/ai/AIChatDrawer.tsx
    - src/components/ai/MermaidViewer.tsx
    - tests/ai/chatActions.test.ts
    - tests/utils/mermaidExport.test.ts

key-decisions:
  - "Shared Notify type lives in exportFolderZip.ts and is reused by mermaidExport, claudeCliService and documentLinks to avoid a second global callback shape"
  - "download-folder loading keeps key:'download-folder' and duration:0 in the callback's extra object, so hideLoading-by-key still works; success/error copy unchanged byte-for-byte"
  - "documentLinks.tsx keeps no-op defaults for notify/confirm so existing call sites cannot render silently broken UI; seven React callers now inject hooks and render contextHolder"
  - "ModalFuncProps (antd type-only import) used for injected confirm config because the wrapper ModalProps omits `icon`, which the local-path confirm relies on"
  - "Don't substitute CSS vars into hex-suffix alpha concatenation; AttentionTodayList priority tint now uses color-mix(in srgb, var(...) 9%, transparent)"
  - "Near-token data constants (SYSTEM_TYPE_FALLBACK_COLOR, SVG export background) annotated with ponytail: instead of changing values — they are data, not UI styles"

patterns-established:
  - "Every migrated React file binds useMessage()/useNotification() at component top; modal consumers render {contextHolder} in the main return"
  - "Non-React utility functions accept notify/confirm as trailing parameters; views own the callback and never pass a static AntD API"

requirements-completed: [ADOPT-01, ADOPT-02]

duration: ~15min
completed: 2026-11-21
---

# Phase 50 Plan 08: Full App Adoption — Final Wave Summary

**All 52 remaining component/util/service files moved to UI barrel imports and context hooks, with four non-React utilities driven by view-owned notify callbacks and a 52-path wave-08 manifest closing the adoption source sweep**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-11-21T14:22:46Z
- **Completed:** 2026-11-21T14:37:46Z
- **Tasks:** 2/2
- **Files modified:** 97 (65 in Task 1 + 32 in Task 2, overlapping)

## Accomplishments
- Codemod rewrote all runtime `antd`/`@ant-design/icons` value imports on 52 paths to the `src/components/ui` barrel; only `import type` remains. Whole `src` now has 0 runtime AntD imports outside `src/components/ui`.
- Converted 91 static `message.*`/`notification.*`/`Modal.confirm` call sites across 15 React components to `useMessage()`, `useNotification()`, `useTaskMateModal()` with `{contextHolder}` rendered.
- Replaced static subcomponents (`Form.Item`, `List.Item`, `Empty.PRESENTED_IMAGE_SIMPLE`, `Input.TextArea`, `Radio.Group`, `Space.Compact`, `ConfigProvider` → `ThemeConfigProvider`, etc.) with named barrel wrappers.
- Made four non-React files notify-driven: `exportFolderZip`, `mermaidExport`, `claudeCliService`, `documentLinks`. Callers in 10 React files + 2 test files pass view-owned callbacks; no global singleton or bridge module.
- Preserved the `download-folder` notification key and byte-for-byte Vietnamese copy; `loading` uses `duration: 0` in the callback's extra object so hide-by-key still works.
- Swept 201 guard-matched inline literals to CSS vars on 31 files; annotated genuinely non-style data values with `ponytail:` comments.
- Wrote `tests/fixtures/adoption/wave-08.txt` with exactly 52 paths; both adoption guards pass.

## Task Commits

1. **Task 1: Codemod + static API → hook cho 52 file + notify callback 3 file .ts (D-01/D-05/D-06)** - `ce58d4fb` (feat)
2. **Task 2: Dọn inline token-valued + manifest wave-08 (D-08/D-09/D-10)** - `a5bc8101` (refactor)

## Files Created/Modified
- `tests/fixtures/adoption/wave-08.txt` — 52-path manifest for adoption guards
- `src/utils/{exportFolderZip,mermaidExport,documentLinks}.ts(x)`, `src/services/ai/claudeCliService.ts` — notify/confirm callbacks, no static AntD import
- `src/components/{agents,analytics,common,dailyReview,dashboard,diagrams,knowledge,notifications,palette,shell,systems,timer}/**` — barrel imports, context hooks, CSS vars
- `src/components/ai/{AIChatDrawer,MermaidViewer}.tsx`, `src/views/{MermaidAssistantView,NotesView}.tsx`, `src/workbench/toolwindows/DocsExplorer.tsx` — notify callback wiring
- `src/components/{changeRequests,tasks,settings}/**`, `src/views/ItemInsightView.tsx` — `documentLinks` notify/confirm wiring + modal contextHolder
- `tests/ai/chatActions.test.ts`, `tests/utils/mermaidExport.test.ts` — updated for new notify parameters

## Decisions Made
- Shared `Notify` type from `exportFolderZip.ts` reused across all non-React utilities to keep one callback contract.
- `documentLinks` confirm uses antd's type-only `ModalFuncProps` because the wrapped `ModalProps` lacks `icon`, needed by the local-path dialog.
- `documentLinks` keeps no-op defaults so un-migrated call paths still run; all seven React callers inject real hooks.
- Data constants and SVG export background colors were annotated `ponytail:` rather than rewritten — they are not UI styles.
- Priority badge alpha tint uses `color-mix()` because `var(...) + '15'` hex concatenation produces invalid CSS.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Codemod left static subcomponents without barrel equivalents**
- **Found during:** Task 1 `npx tsc --noEmit` (154 errors)
- **Issue:** After import rewrite, files used `Form.Item`, `List.Item`, `Empty.PRESENTED_IMAGE_SIMPLE`, `Input.TextArea`, `Radio.Group`, `Space.Compact`, `ConfigProvider`, `Form.useForm`, `Form.useWatch` — absent from named wrappers.
- **Fix:** Replaced all with named barrel exports (`FormItem`, `ListItem`, `EmptyImageSimple`, `TextArea`, `RadioGroup`, `SpaceCompact`, `ThemeConfigProvider`, `useForm`, `useWatch`) per D-03; removed resulting unused imports.
- **Files modified:** 19 wave-08 files
- **Commit:** `ce58d4fb`

**2. [Rule 1 - Bug] `Badge status="error"` failed design-system type**
- **Found during:** Task 1 typecheck
- **Issue:** Wrapper `Badge` accepts `StatusKind` (`accent|danger|info|success|warning`), not antd's `error`.
- **Fix:** Changed two occurrences in `GitHubSyncStatusDot.tsx` to `status="danger"`; visual red dot unchanged.
- **Files modified:** `src/components/shell/GitHubSyncStatusDot.tsx`
- **Commit:** `ce58d4fb`

**3. [Rule 2 - Missing Critical] `documentLinks` callers would lose all notifications**
- **Found during:** Task 1 caller audit after adding notify parameters
- **Issue:** Plan named only 4 caller files; `documentLinks.tsx` had 7 React callers whose messages would have been silenced by no-op defaults.
- **Fix:** Injected `notify`/`confirm` callbacks from `useMessage()`/`useTaskMateModal()` into all seven callers and rendered `{contextHolder}` in each; updated two test files for the new signatures.
- **Files modified:** 9 additional caller/test files
- **Commit:** `ce58d4fb`

**4. [Rule 1 - Bug] CSS-var hex-suffix alpha concatenation**
- **Found during:** Task 2 sweep review
- **Issue:** `PRIORITY_COLORS` values became `var(...)` but `AttentionTodayList.tsx` appended `15` for alpha, producing invalid CSS.
- **Fix:** Replaced with `color-mix(in srgb, var(...) 9%, transparent)`.
- **Files modified:** `src/components/dashboard/AttentionTodayList.tsx`
- **Commit:** `a5bc8101`

**5. [Rule 3 - Blocking] Manifest count ambiguity**
- **Found during:** Task 2 verification (`grep -c .` expected 52)
- **Issue:** Plan's `files_modified` lists 57 paths including the manifest itself and 4 callers.
- **Fix:** Wrote 52 paths = 57 − 1 manifest − 4 callers, including `src/utils/exportFolderZip.ts` as required.
- **Files modified:** `tests/fixtures/adoption/wave-08.txt`
- **Commit:** `a5bc8101`

---

**Total deviations:** 5 auto-fixed (2 Rule 1 bugs, 1 Rule 2 missing critical, 2 Rule 3 blocking). No new packages, no architecture change.

## Issues Encountered
- Unhandled rejections from `ZipImportPreviewModal`/`DocsLibraryActions` surfaced in `DocsExplorerZip.test.tsx`; both files are untouched by wave 08 and already use `useMessage()` — their test harness lacks `ThemeAppHolder`. Out of scope; not fixed here. The three targeted test files themselves pass (13/13).

## User Setup Required
None.

## Next Phase Readiness
Wave 08 closes the 239-file direct-import adoption. Remaining work belongs to plan 09: promote `lint` to `eslint src`, remove `lint:adoption`, extend guards to the full manifest set, and finish UAT. Note for UAT: priority badge tint in AttentionTodayList now uses `color-mix()` and Badge status dots use token colors; all swept inline colors follow light/dark CSS vars.

## Threat Flags
None — notify callback injection removes the last static-AntD surface; no new network endpoint, auth path, file access pattern, or schema change was introduced.

## Self-Check: PASSED

- All 52 manifest paths exist on disk; `grep -c . tests/fixtures/adoption/wave-08.txt` = 52.
- Both task commits found in git history (`ce58d4fb`, `a5bc8101`).
- Gates: `npx tsc --noEmit`, `npm run lint`, scoped `npx eslint` on all migrated directories (0 errors), `npm run test:foundation` (14 files / 83 tests), `systemTypeSettings.test.ts` (9 tests), adoption guards (4 tests), notify-path tests (9 tests) all green.
- Source assertion: 0 runtime `antd`/`@ant-design/icons` imports outside `src/components/ui`; 0 static API calls in the four non-React utilities.

---
*Phase: 50-full-app-adoption*
*Completed: 2026-11-21*
