---
phase: 54-native-overlay-complex-controls
plan: 04
subsystem: ui
tags: [native-controls, modal, drawer, image, table, dialog, imperative-confirm, focus-trap, row-selection, pagination, vitest]

# Dependency graph
requires:
  - phase: 54-01
    provides: native DialogSurface, ImperativeChannel and runtime-import guard
  - phase: 54-02
    provides: native List/Menu/Button/Chip primitives and vendored OpenIDEA CSS modules
  - phase: 54-03
    provides: popup wrapper patterns, live event payload parity and focused-suite conventions
provides:
  - 4 native composite wrappers: modal, drawer, image, table
  - per-hook imperative confirm channel with ConfirmDialog destroy and isolated holders
  - native table grid with sort/filter/selection/pagination/expandable/summary payload parity
  - focused 9-test composite suite for focus, copy, payload, state hooks and clean console
affects: [54-05, 54-07, Phase 56, Phase 57]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DialogSurface owns the BODY portal, transparent backdrop, focus trap and focus restore; wrappers only supply content, chrome and policy"
    - "Imperative confirm channels are created per useTaskMateModal hook so multiple mounted holders never duplicate a dialog"
    - "Table emits AntD-shaped onChange/rowSelection payloads using a fresh sorter snapshot and primitive selected-key arrays"

key-files:
  created:
    - src/components/ui/__tests__/overlayComposite.test.tsx
  modified:
    - src/components/ui/modal.tsx
    - src/components/ui/drawer.tsx
    - src/components/ui/image.tsx
    - src/components/ui/table.tsx
    - src/components/ui/native/dialog.tsx

key-decisions:
  - "Modal/Drawer keep boolean mask and token-derived width scale; object mask form is reduced to a boolean for the native surface"
  - "useTaskMateModal builds an ImperativeChannel in a useRef, so contextHolder renders only its own hook's records"
  - "Drawer wraps the inner role=dialog control with an outer data-oi-control=drawer panel for Phase 57 measurement"
  - "ImagePreviewGroup walks children on open to collect preview items; Image keeps alt and caller styles.root precedence"
  - "Table renders pagination inline and never imports the 54-05 pagination wrapper"
patterns-established:
  - "Focused suites read the public store via record.payload, not the external-store record wrapper"
  - "Native event payloads for confirm/cancel are real MouseEvents with working preventDefault/stopPropagation"

requirements-completed: [NAT-02]

# Metrics
duration: 53min
completed: 2026-11-22
---

# Phase 54 Plan 04: Native Overlay Complex Controls Summary

**Four composite AntD wrappers now render OpenIDEA CSS-module DOM with native dialog focus handling, per-hook imperative confirms and AntD-shaped table payloads**

## Performance

- **Duration:** 53 min
- **Started:** 2026-11-21T23:44:04Z
- **Completed:** 2026-11-22T00:37:56Z
- **Tasks:** 3
- **Files modified:** 6 (5 wrappers/helpers + 1 new focused test)

## Accomplishments

- Modal: native DialogSurface with token width scale 10/18/28, boolean mask preservation, footer/close policies, uncontrolled open and default OK/Hủy buttons for callers relying on `onOk`.
- useTaskMateModal: per-hook ImperativeChannel, native confirm with caller copy/icon/footer/width/okType/danger handling, `onOk`/`onCancel`, Escape dismissal and `destroy()`/`update()` handle shape.
- Drawer: native panel with inner `control='dialog'` focus trap, outer `data-oi-control="drawer"` chrome, placement, raw CSS width, boolean mask and silent close.
- Image: native `<img>` plus BODY-portal preview with ArrowLeft/ArrowRight group navigation, Escape close, focus restore, `alt` accessible name, error fallback and caller `styles.root` precedence.
- Table: native `<table>` with column headers, sorter/filter controls, primitive snapshot selection keys, inline pagination, context-menu `onRow`, empty/loading hooks, density rows 22/24/28, expandable rows and self-built TableSummary.Row/Cell.
- Focused suite: 9 tests cover trap/Escape/restore, silent/no-mask/no-footer, width scale, confirm lifecycle and exactly-two-dialog isolation across three holders, image keyboard/alt, table payloads/selection/context menu/empty/loading/density; console.error spy stays clean.
- Gates: tsc, lint, native-import guard, focused suite plus staticApiGuard/coverage/antdInventory/uiTokens/inlineStyleSweep all green (27 tests in 6 files). No full Vitest run.

## Task Commits

Each task was committed atomically:

1. **Tasks 1-2: Modal/Drawer/Image/Table native conversion** - `49c00eb9` (feat)
2. **Task 3: Composite focused suite** - `c526b6ba` (test)

**Plan metadata:** pending docs commit

## Files Created/Modified

- `src/components/ui/modal.tsx` — native Modal, resolveMask/getOverlayWidth and hook-owned confirm channel.
- `src/components/ui/drawer.tsx` — native Drawer panel with width/mask/close policy.
- `src/components/ui/image.tsx` — native Image and self-built preview group/dialog.
- `src/components/ui/table.tsx` — native generic Table, tableStyle and TableSummary.
- `src/components/ui/native/dialog.tsx` — optional wrapper hook for drawer panel chrome and exact-optional prop types.
- `src/components/ui/__tests__/overlayComposite.test.tsx` — 9 focused composite tests.

## Decisions Made

- Buffered EventTarget selection not needed: `onCloseRef` remains the stable callback path required by 54-01.
- Sorting emits the fresh selected order in the same event that toggles the state, so callers observe the clicked order instead of the previous render.
- Internal pagination state is used only when callers omit `pagination.onChange`; controlled callers keep their own page state.
- Filter emit uses the freshly built key set, matching the primitive-snapshot rule from Phase 53.

## Deviations from Plan

None - plan executed with the specified native architecture and API preservation.

## Issues Encountered

- The external store returns `ImperativeRecord` wrappers; an initial confirm implementation read the record itself as the config. Fixed during Task 3 to read `record.payload`, and the focused suite now asserts caller copy and lifecycle.
- Legacy `controls.test.tsx` still asserts AntD selectors for overlay wrappers. Per plan, selector migration stays in 54-07; this plan added a focused native suite instead.
- No full Vitest run, per project rule.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 54-05. 18 of 28 overlay/complex wrappers are native. Keep `data-oi-control`/`data-state` hooks stable; pagination remains intentionally inline in `table.tsx` so 54-05 can replace `pagination.tsx` without a cross-import. Caller selector updates remain owned by 54-07.

---
*Phase: 54-native-overlay-complex-controls*
*Completed: 2026-11-22*
