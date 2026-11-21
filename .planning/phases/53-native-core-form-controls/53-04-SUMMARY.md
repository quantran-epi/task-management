---
phase: 53-native-core-form-controls
plan: 04
subsystem: ui
tags: [openidea, native-controls, icon-factory, feedback, display, accessibility, ant-migration]

requires:
  - phase: 53-native-core-form-controls
    provides: 53-01 vendored OpenIDEA CSS modules; 53-02 native core primitives; 53-03 native form fields
provides:
  - 141 native icons through one wrapIcon factory over vendored OpenIDEA SVG descriptors, zero runtime @ant-design/icons import
  - native Alert/Progress/Spin/Result/Skeleton/Slider/Statistic/Typography wrappers with D-12 status tokens and locked export surface
  - 26/26 core wrappers free of runtime AntD import; runtime-import gate selftest proves detection works
affects: [53-native-core-form-controls plan 05, 54-overlay-complex-controls, 56-antd-removal, 57-visual-measurement]

tech-stack:
  added: []
  patterns:
    - "Vendored static SVG descriptors render through one wrapIcon factory; token-derived tone uses currentColor monochrome paths"
    - "Feedback/display wrappers render native DOM with data-oi-control hooks and caller style precedence"

key-files:
  created:
    - src/components/ui/icon-svgs/descriptors.json
  modified:
    - src/components/ui/icon.tsx
    - src/components/ui/openidea/icons.module.css
    - src/components/ui/openidea/Feedback.module.css
    - src/components/ui/alert.tsx
    - src/components/ui/progress.tsx
    - src/components/ui/spin.tsx
    - src/components/ui/result.tsx
    - src/components/ui/skeleton.tsx
    - src/components/ui/slider.tsx
    - src/components/ui/statistic.tsx
    - src/components/ui/typography.tsx
    - src/components/ui/__tests__/controls.test.tsx

key-decisions:
  - "wrapIcon factory name, WrappedIconProps and WrappedIcon stay unchanged; only its internal parameter type becomes a static vendored SVG descriptor"
  - "141 icon names and order stay byte-identical so the 257-export guard and 165 importing files remain valid"
  - "Monochrome vendored SVG paths are normalized to currentColor so D-12 tone and caller style win"
  - "--ui-spin-accent keeps reading getStatusTokens('accent', mode) = #3871e1 instead of a hardcoded control accent"
  - "AlertErrorBoundary, five Skeleton statics, SliderProps union, StatisticCountdown/Timer and Typography.Link remain exported as native implementations"

patterns-established:
  - "Static JSON holds vendored SVG bodies; icon.tsx never accepts untrusted markup and uses useId for clip-path ids"
  - "Native feedback/display wrappers keep measurement hooks data-oi-control/data-state without changing public props"

requirements-completed: [NAT-01]

duration: ~15 min
completed: 2026-11-21
---

# Phase 53 Plan 04: Native Core Icons, Feedback and Display Summary

**141 native SVG icons plus eight native feedback/display wrappers, keeping the 257-export guard and D-12 status tokens intact**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-11-21T20:01:18Z
- **Completed:** 2026-11-21T20:16:59Z
- **Tasks:** 3/3
- **Files modified:** 12

## Accomplishments
- `icon.tsx` now renders 141 vendored OpenIDEA SVG descriptors through the unchanged `wrapIcon` factory, with `WrappedIconProps`/`WrappedIcon`, D-12 tone, spin, rotate, size and caller style preserved.
- `alert.tsx`, `progress.tsx` and `spin.tsx` render native DOM with `role=alert`/`role=progressbar`/`aria-busy`, native `AlertErrorBoundary`, `setDefaultSpinIndicator`, and the original `--ui-spin-accent` from `getStatusTokens('accent', mode)`.
- `result.tsx`, `skeleton.tsx`, `slider.tsx`, `statistic.tsx` and `typography.tsx` render native display primitives with all original statics, single/range value payloads, keyboard/pointer slider, countdown finish, timer and four font roles.
- Focused gate green: `tsc --noEmit`, `npm run lint`, 38 tests in `antdInventory`, `coverage`, `button`, `controls`; 26-wrapper runtime-import gate passes and its synthetic-import selftest returns 1 for runtime / 0 for type-only.
- `scanWrappers()` still reports 257 exports; 141 icon exports remain in order; 8 deep imports in `RemoteGitExplorer.tsx` remain untouched for Phase 55/56.

## Task Commits

Each task was committed atomically:

1. **Task 1: Icon factory native — 141 export giữ nguyên** - `cc09fb48` (feat)
2. **Task 1 follow-up: normalized monochrome icon colors** - `abd79fde` (fix)
3. **Task 2: Alert/Progress/Spin native feedback** - `5d418a91` (feat)
4. **Task 3: Result/Skeleton/Slider/Statistic/Typography native display** - `109176de` (feat)
5. **Task 3 follow-up: skeleton shimmer + reduced motion** - `8995e818` (fix)

**Plan metadata:** see `docs(53-04): complete native icons feedback display plan` commit.

## Files Created/Modified

- `src/components/ui/icon.tsx` - native `wrapIcon` factory and 141 unchanged icon exports.
- `src/components/ui/icon-svgs/descriptors.json` - 141 static vendored SVG descriptors sourced from OpenIDEA `expui`/`openidea` assets.
- `src/components/ui/openidea/icons.module.css` - icon spin with reduced-motion duration.
- `src/components/ui/openidea/Feedback.module.css` - native skeleton shimmer and reduced-motion guard.
- `src/components/ui/alert.tsx` - native N-01 banner and `AlertErrorBoundary`.
- `src/components/ui/progress.tsx` - native N-20 progressbar with stroke/status tokens.
- `src/components/ui/spin.tsx` - native N-25 spinner with `setDefaultSpinIndicator` and D-12 accent.
- `src/components/ui/result.tsx` - native N-21 result with status icon and title/description metrics.
- `src/components/ui/skeleton.tsx` - native N-22 skeleton and five static shapes.
- `src/components/ui/slider.tsx` - native N-23 slider with keyboard/pointer handles and single/range payloads.
- `src/components/ui/statistic.tsx` - native N-27 statistic, countdown and timer.
- `src/components/ui/typography.tsx` - native N-33 roles and `Typography.Link`.
- `src/components/ui/__tests__/controls.test.tsx` - spin selector moved from `.ant-spin` to `[data-oi-control="spinner"]` while keeping token/color assertions.

## Decisions Made

- Kept the AntD-derived prop aliases and static export names; only render implementations changed until Phase 56.
- Treated vendored SVG bodies as static data (`dangerouslySetInnerHTML` only on source-controlled strings) and used `useId()` for the two clip-path-bearing sources.
- Normalized monochrome SVG colors to `currentColor` so status tone and caller style remain observable in jsdom and CSS.
- Preserved D-12 status mapping for alert/progress/icon/result and the separate `--ui-spin-accent` accent contract.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Vendored monochrome SVGs ignored D-12 tone**
- **Found during:** Task 1 self-check with `controls.test.tsx`
- **Issue:** Raw OpenIDEA grey `#6C707E` fills/strokes overrode `color` from `getStatusTokens`.
- **Fix:** Normalized monochrome SVG paths to `currentColor` in 100 descriptors; `abd79fde`.
- **Files modified:** `src/components/ui/icon-svgs/descriptors.json`
- **Verification:** `controls.test.tsx` icon color assertion passes in light and dark; focused gates green.

**2. [Rule 1 - Bug] Skeleton shimmer CSS was token-only**
- **Found during:** Task 3 self-check
- **Issue:** `--ui-skeleton-shimmer-duration` had no animation consumer; reduced-motion rule was missing.
- **Fix:** Added `.skeleton` animation and `prefers-reduced-motion` guard to vendored `Feedback.module.css`; `8995e818`.
- **Files modified:** `src/components/ui/skeleton.tsx`, `src/components/ui/openidea/Feedback.module.css`
- **Verification:** tsc, lint, coverage test and 26-wrapper runtime-import gate pass.

---

**Total deviations:** 2 auto-fixed (Rule 1 bugs). **Impact:** Local CSS/asset corrections; no API, scope or caller change.

## Issues Encountered

- AntD 6 does not export `SliderProps` or a top-level `StatisticCountdownProps`; the original union/type aliases are retained by importing the precise `antd/es/statistic` types and keeping the public `StatisticProps`/`SliderProps` names.
- The descriptor generator maps AntD icon names to semantically closest OpenIDEA SVG sources where exact names differ (for example `SearchOutlined` -> `expui/general/search`); all 141 export names and order are unchanged.

## Known Stubs

None - display wrappers render native DOM with real props, statics and token-derived styles.

## Threat Flags

None - vendored SVG bodies are static source assets, no new network endpoints, auth paths, file access patterns or schema changes were introduced.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 53-05. The core set of 26 wrappers has no runtime AntD import, leaving overlay/complex controls and final dependency removal for later phases. Phase 56 must still remove type-only AntD imports, the ESLint override and the 8 deep imports in `RemoteGitExplorer.tsx`; Phase 57 can measure the new `data-oi-control` hooks.

## Self-Check: PASSED

All listed files exist and all five task commits are present in git history.

---
*Phase: 53-native-core-form-controls*
*Completed: 2026-11-21*
