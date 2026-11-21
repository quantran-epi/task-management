---
id: 261121-eck
phase: quick
plan: 261121-eck
subsystem: ui
tags: [tool-explorer, markdown, react, antd, synced-scroll, icons]
requires: []
provides:
  - Markdown Viewer utility tool with split editor/live preview and two-way proportional scroll
  - Tool Explorer search box width-constrained to its containing panel
  - JSON Formatter bracket icon and accent-colored Tool Explorer stripe icon
affects: [tool-explorer, workbench-ui]
tech-stack:
  added: []
  patterns:
    - Reuse useSyncedScroll hook across utility tools (exported from UtilityToolPanel)
    - Render untrusted Markdown only via renderSafeMarkdown into .markdown-rendered-view
key-files:
  created:
    - src/workbench/__tests__/ToolExplorerPanel.test.tsx
  modified:
    - src/workbench/store/layoutStore.ts
    - src/workbench/toolwindows/utilityTools.tsx
    - src/workbench/toolwindows/UtilityToolPanel.tsx
    - src/workbench/EditorArea.tsx
    - src/workbench/toolwindows/ToolExplorerPanel.tsx
    - src/workbench/__tests__/UtilityToolPanel.test.tsx
    - src/workbench/WorkbenchLayout.tsx
key-decisions:
  - "Markdown preview reuses existing renderSafeMarkdown sanitizer rather than adding unified/remark or a new parser dependency"
  - "Stripe icon uses AppstoreOutlined with --accent token (no tool/utility variant exists in JetBrainsIcons.tsx; no new dependency)"
  - "Scroll sync test stubs scrollHeight/clientHeight and runs requestAnimationFrame inline for deterministic guard release in jsdom"
patterns-established:
  - "utilityToolIcon and EditorArea utility view cases must both list a new EditorViewType utility view"
  - "Tool Explorer search width stays fluid: 100%/max-width 100% inside a border-box padded wrapper, never fixed width or negative margins"
requirements-completed: []
duration: ~5min
completed: 2026-11-21
---

# Quick 261121-eck: Tool Explorer — Markdown Viewer, search overflow, icon polish Summary

**Markdown Viewer with live sanitized preview and two-way synced scroll, fluid Tool Explorer search box, and refreshed JSON/stripe icons — no new dependencies**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-11-21T03:23:23Z
- **Completed:** 2026-11-21T03:28:00Z
- **Tasks:** 3 of 3
- **Files modified:** 8 (7 modified, 1 created)

## Accomplishments

- Added `markdown_viewer` view type, registry entry, tab/render wiring, split editor/preview with `renderSafeMarkdown`, and two-way proportional scroll via the shared `useSyncedScroll` hook.
- Constrained Tool Explorer `Input.Search` to its panel with a full-width border-box wrapper; removed the fixed margin that caused overflow in the narrow right stripe.
- Switched JSON Formatter registry icon to accent-colored `{}` bracket and Tool Explorer stripe icon to accent-colored `AppstoreOutlined`.

## Task Commits

Each task was committed atomically (code only; docs artifacts left for orchestrator):

1. **Task 1: Markdown viewer split editor/preview + sync scroll + full syntax** - `1a3697e8` (feat)
2. **Task 2: Search box overflow fix** - `6619c4fc` (fix)
3. **Task 3: JSON Formatter `{}` icon + stripe accent icon** - `635cba8e` (style)

## Files Created/Modified

- `src/workbench/store/layoutStore.ts` — added `markdown_viewer` to `EditorViewType`.
- `src/workbench/toolwindows/utilityTools.tsx` — registered Markdown Viewer; JSON icon now `{}`.
- `src/workbench/toolwindows/UtilityToolPanel.tsx` — exported `useSyncedScroll`; added `MarkdownViewer`, switch/icon cases, `FileTextOutlined` import.
- `src/workbench/EditorArea.tsx` — wired `markdown_viewer` into both icon and render switches.
- `src/workbench/toolwindows/ToolExplorerPanel.tsx` — fluid search wrapper and `Input.Search` style.
- `src/workbench/WorkbenchLayout.tsx` — stripe icon `AppstoreOutlined` with accent token; removed `ToolOutlined`.
- `src/workbench/__tests__/UtilityToolPanel.test.tsx` — added Markdown syntax + scroll sync tests (4 original tests kept).
- `src/workbench/__tests__/ToolExplorerPanel.test.tsx` — created: search width/filter test and JSON icon test.

## Decisions Made

- Reused `renderSafeMarkdown` (existing sanitizer) instead of adding a Markdown parser dependency; fits no-new-dependency constraint and keeps XSS handling in one place.
- No tool/utility variant exists in `JetBrainsIcons.tsx`, so used the plan's `AppstoreOutlined` fallback with `--accent` token.

## Deviations from Plan

None — plan executed as written. One test-expectation correction during Task 1: initial scroll-ratio assertion used wrong divisor (`fromMax=900`, not `450`); fixed to `150`/`900` before the passing run. No scope change.

## Issues Encountered

- jsdom reports zero scroll geometry and does not emit scroll events on `scrollTop` assignment; solved by stubbing `scrollHeight`/`clientHeight` and running `requestAnimationFrame` inline in the scroll-sync test.
- Vitest 5.0.2 rejects `-x`; no bail flag used.

## User Setup Required

None.

## Next Phase Readiness

All 4 requested UI outcomes shipped; scoped Vitest (8 tests across 2 files) and `npx tsc --noEmit` are green. Chrome UAT items in the plan (visual check of split preview, narrow/wide stripe search box, icon appearance) remain for the orchestrator/user to confirm visually.

## Self-Check: PASSED

All 9 files exist; all 3 task commits present in git history.

---
*Plan: 261121-eck*
*Completed: 2026-11-21*
