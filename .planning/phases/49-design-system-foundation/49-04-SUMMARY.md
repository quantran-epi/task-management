---
phase: 49-design-system-foundation
plan: 04
subsystem: ui
tags: [antd-wrappers, input-controls, overlay-policy, theme-context, imperative-holder]

requires:
  - phase: 49-design-system-foundation
    provides: tokens.contract.ts helpers, Button/Icon wrapper pattern and AntD inventory scanner from plan 03

provides:
  - Input/Textarea/Select/InputNumber wrappers applying shared control metrics via custom properties
  - Modal/Drawer/Popconfirm wrappers with token-derived width scale and footer/close/mask policy
  - useTaskMateModal (Modal.useModal) and ThemeAppHolder + useMessage/useNotification (App.useApp) preserving ConfigProvider theme for imperative calls
  - controls.test.tsx with input and overlay policy cases in light and dark modes

affects:
  - Phase 50 app-wide migration swaps AntD imports to these wrappers and static imperative calls to the holder hooks
  - Phase 08 ESLint guard consumes these wrappers in the pass-through and static-call gates

tech-stack:
  added: []
  patterns:
    - Shared metrics emitted as --ui-control-* custom properties; no inline fractional font-size
    - Fixed overlay width scale derived from controlHeight; no caller-supplied raw CSS width
    - One ThemeAppHolder mounted at the shell root; imperative APIs consumed through App.useApp hooks

key-files:
  created:
    - src/components/ui/input.tsx
    - src/components/ui/textarea.tsx
    - src/components/ui/select.tsx
    - src/components/ui/input-number.tsx
    - src/components/ui/modal.tsx
    - src/components/ui/drawer.tsx
    - src/components/ui/popconfirm.tsx
    - src/components/ui/message.tsx
    - src/components/ui/notification.tsx
    - src/components/ui/__tests__/controls.test.tsx
  modified:
    - src/components/ui/index.ts

key-decisions:
  - "Default Textarea minRows is 2; maxRows is derived as round((controlHeight/fontSize)*2) so metrics stay token-owned"
  - "Overlay width scale = controlHeight x {sm:10, md:18, lg:28} -> 300/540/840px at controlHeight 30; callers select scale, never raw width"
  - "Modal/Drawer use AntD 6 mask.closable instead of deprecated maskClosable; Drawer uses size instead of deprecated width"
  - "No raw message/notification/Modal object re-export; ThemeAppHolder is the single context holder and Phase 50 migrates the 637 static calls"

patterns-established:
  - "Input-family wrappers share controlStyle()/controlWidthStyle() helpers so one token change updates all four"
  - "useMessage/useNotification resolve from AntApp.useApp() inside one ThemeAppHolder; imperative confirms use AntModal.useModal()"
  - "Policy props are closed enums mapped to token-derived values; no arbitrary CSS injected at trust boundary"

requirements-completed: [CTRL-03, CTRL-04]

duration: ~7min
completed: 2026-11-21
---

# Phase 49 Plan 04: Design System Foundation — Input & Overlay Wrappers Summary

**Nine token-backed AntD wrappers plus Modal.useModal/App context holders that keep imperative calls inside the ConfigProvider theme**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-11-21T08:20:14Z
- **Completed:** 2026-11-21T08:27:30Z
- **Tasks:** 2/2
- **Files modified:** 11 (10 created, 1 modified)

## Accomplishments

- Input, Textarea, Select and InputNumber wrappers apply `getSharedControlTokens()` metrics as `--ui-control-*` custom properties; width, error status, disabled and value/onChange pass through under one swap point.
- Modal, Drawer and Popconfirm apply a fixed token-derived width scale plus footer/close/mask/danger-tone policy; no caller-supplied raw CSS width.
- `useTaskMateModal()` uses `AntModal.useModal()`; `ThemeAppHolder` + `useMessage()`/`useNotification()` use `AntApp.useApp()` so imperative APIs inherit ConfigProvider theme. Phase 50 only swaps imports/call sites.
- `controls.test.tsx` covers input metrics, error/disabled behavior, overlay policy and holder-resolved imperative APIs in light and dark themes; 11 tests pass.

## Task Commits

1. **Task 1: Wrap input-family controls with shared metrics** — `8f2d63d5` (feat)
2. **Task 2: Wrap overlays and themed static utilities with context-preserving holders** — `a4cbb471` (feat)

## Files Created/Modified

- `src/components/ui/input.tsx` — Input wrapper, shared `controlStyle()`/`controlWidthStyle()` helpers
- `src/components/ui/textarea.tsx` — Textarea wrapper with token-derived autoSize default (minRows 2)
- `src/components/ui/select.tsx` — generic-friendly Select wrapper, allowClear default
- `src/components/ui/input-number.tsx` — InputNumber wrapper with min/max/precision passthrough
- `src/components/ui/modal.tsx` — Modal wrapper, width scale and `useTaskMateModal()`
- `src/components/ui/drawer.tsx` — Drawer wrapper with width scale and placement/close policy
- `src/components/ui/popconfirm.tsx` — Popconfirm wrapper with status-token danger tone
- `src/components/ui/message.tsx` — `ThemeAppHolder` and `useMessage()`
- `src/components/ui/notification.tsx` — `useNotification()` and shared notification defaults
- `src/components/ui/__tests__/controls.test.tsx` — 11 scoped policy tests
- `src/components/ui/index.ts` — same-name re-exports for all new wrappers/hooks

## Decisions Made

- Textarea default `minRows` is 2; `maxRows` derived from controlHeight/fontSize, keeping the sizing policy token-owned.
- Overlay width scale maps `controlHeight` × {sm:10, md:18, lg:28}, yielding 300/540/840px at 30px control height.
- AntD 6 deprecations avoided: `mask: { closable }` replaces `maskClosable`; Drawer `size` replaces `width`.
- Imperative exports are context hooks only; raw AntD static objects are never re-exported.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] AntD 6 deprecated props in overlays**
- **Found during:** Task 2 verification (jsdom warnings)
- **Issue:** `maskClosable` and Drawer `width` emit AntD 6 deprecation warnings and draw a second, unpoliced width path.
- **Fix:** Modal/Drawer now use `mask: { closable }`; Drawer uses `size` with the token-derived value.
- **Files modified:** `src/components/ui/modal.tsx`, `src/components/ui/drawer.tsx`
- **Verification:** `tsc --noEmit` clean; scoped tests pass with no deprecation warnings.
- **Commit:** `a4cbb471`

No scope creep; no app call-site migration performed (owned by Phase 50).

## Issues Encountered

- AntD 6 `Input.TextArea` autoSize writes a fractional height in jsdom (NaN warning from ResizeObserver shim). Test asserts the exported token-derived default and rendered wrapper instead of the computed inline height; production metric policy remains token-owned.

## User Setup Required

None.

## Known Stubs

None. Every wrapper applies token-derived defaults; no placeholder UI or mock data.

## Threat Flags

None beyond the plan's threat register. T-49-13/15/16/17 are implemented by zero static calls in `src/components/ui/`, visible contract calls in each wrapper, one exported `ThemeAppHolder`, and closed width/footer policy props. No new network endpoint, auth path, file access pattern or schema change was introduced.

## Next Phase Readiness

- Phase 50 can swap AntD imports to these wrappers and the 637 static `Modal.confirm`/`message.*`/`notification.*` calls to `useTaskMateModal`/`useMessage`/`useNotification`, mounting `ThemeAppHolder` once at the shell root.
- Plan 08 guard can enforce the static-call and pass-through gates against these files.

## Self-Check: PASSED

- All ten created files and the modified barrel exist on disk.
- Task commits `8f2d63d5` and `a4cbb471` are present in `git log`.
- Scoped tests: 3 files / 22 tests pass (controls 11, button 6, inventory 5); `npx tsc --noEmit` exits 0; grep gate finds zero static AntD calls in `src/components/ui/`.

---
*Phase: 49-design-system-foundation*
*Completed: 2026-11-21*
