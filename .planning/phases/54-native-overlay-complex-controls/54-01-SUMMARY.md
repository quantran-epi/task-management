---
phase: 54-native-overlay-complex-controls
plan: 01
subsystem: ui
tags: [native-controls, dialog, focus-trap, overlay, external-store, import-guard, vitest]

# Dependency graph
requires:
  - phase: 53-native-core-form-controls
    provides: Popup helper (portal/Escape/onCloseRef WR-05), vendored OpenIDEA CSS modules, token contract
provides:
  - DialogSurface with focus trap, transparent backdrop, 5 placements, measurement hooks
  - ImperativeChannel with subscribe/push/update/remove/clear and useSyncExternalStore hook
  - scripts/check-native-imports.mjs runtime-import guard CLI for plans 54-02..54-07 and Phase 56
  - Focused overlayFoundation tests covering trap/Escape/restore, realtime channel, guard both directions
affects: [54-02, 54-03, 54-04, 54-05, 54-06, 54-07, Phase 56, Phase 57]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Focus trap lives in DialogSurface, not Popup; onCloseRef makes listener effects stable (WR-05)"
    - "Imperative holder state uses per-holder external store + useSyncExternalStore, never module singleton"
    - "Runtime AntD imports guarded by CLI that allows only fully type-only clauses"

key-files:
  created:
    - src/components/ui/native/dialog.tsx
    - src/components/ui/native/imperativeChannel.ts
    - scripts/check-native-imports.mjs
    - src/components/ui/__tests__/overlayFoundation.test.tsx
  modified: []

key-decisions:
  - "DialogSurface is internal to ui/native/ and adds no required prop to the 28 wrappers"
  - "masked=false renders the portal dialog but no backdrop node at all; backdrop remains transparent (no dim)"
  - "Escape is handled only by the topmost open dialog; cleanup resets open state without stealing focus on caller unmount"
  - "Snapshot arrays are replaced only on real mutations; identical snapshots stay referentially stable for useSyncExternalStore"

patterns-established:
  - "data-oi-control hooks: dialog, dialog-backdrop, dialog-close, dialog-footer, data-state=open"
  - "No eslint-disable directives: react-hooks/exhaustive-deps is not enabled (INFO-04)"

requirements-completed: [NAT-02]

# Metrics
duration: ~5 min
completed: 2026-11-21
---

# Phase 54 Plan 01: Native Overlay Foundation Summary

**DialogSurface focus trap, per-holder ImperativeChannel, and a runtime AntD import guard CLI with two-way selftest**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-11-21T22:40:04Z
- **Completed:** 2026-11-21T22:46:00Z
- **Tasks:** 3
- **Files created:** 4

## Accomplishments

- `DialogSurface` portals to BODY with a transparent backdrop, Tab/Shift+Tab trap, Escape close, focus restore, and stable `onCloseRef` — no listener churn.
- `ImperativeChannel` powers realtime message/notification/modal.confirm holders via `useSyncExternalStore`, with UUID keys and in-place key updates.
- Guard CLI rejects runtime `antd`/`@ant-design/icons` imports, allows type-only clauses; selftest proves both exit codes.
- 12 focused tests pass (9 foundation + 3 uiTokens); tsc and lint green; 56 wrapper files and 257 exports unchanged.

## Task Commits

1. **Task 1: DialogSurface helper** - `bcd6a8a0` (feat)
2. **Task 2: ImperativeChannel** - `8bec4507` (feat)
3. **Task 3: Guard CLI + foundation tests** - `9fdcbe40` (chore)

**Plan metadata:** pending (docs)

## Files Created/Modified

- `src/components/ui/native/dialog.tsx` — dialog surface with focus trap, backdrop policy, placements, hooks
- `src/components/ui/native/imperativeChannel.ts` — external store + React hook for imperative holders
- `scripts/check-native-imports.mjs` — shared runtime-import guard
- `src/components/ui/__tests__/overlayFoundation.test.tsx` — focused behavior tests + guard selftest

## Decisions Made

- No new dependency; no wrapper converted; no vendored CSS, token, or caller changed.
- Focus-filter uses the declared focusable selector list instead of `offsetParent`, which is always null in jsdom.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Focus trap filter excluded every element in jsdom**
- **Found during:** Task 3 (foundation tests)
- **Issue:** `element.offsetParent !== null` filter dropped all focusable nodes under jsdom, so initial focus and Tab wrapping failed.
- **Fix:** Removed the visibility filter; the selector already excludes disabled controls.
- **Files modified:** `src/components/ui/native/dialog.tsx`
- **Verification:** Focus test passes for initial focus, Tab last→first, Shift+Tab first→last.

**2. [Rule 1 - Test correctness] Temp guard selftest directory removed between tests**
- **Found during:** Task 3 (foundation tests)
- **Issue:** `mkdtempSync` created once at describe scope but `afterEach` removed it after the first test.
- **Fix:** Create and remove a fresh temp dir inside each `check()` call.
- **Files modified:** `src/components/ui/__tests__/overlayFoundation.test.tsx`
- **Verification:** Guard runtime-import and type-only-import tests both pass.

---

**Total deviations:** 2 auto-fixed (2 bug fixes)
**Impact on plan:** None — test-environment correctness only; production contract unchanged.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

Ready for 54-02. Foundation contracts are fixed: use `DialogSurface` for modal-like surfaces, `createImperativeChannel` for holders, and run `node scripts/check-native-imports.mjs <changed files>` after each wrapper conversion. Do not run the full Vitest suite.

---
*Phase: 54-native-overlay-complex-controls*
*Completed: 2026-11-21*
