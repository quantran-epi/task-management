---
phase: 50-full-app-adoption
plan: 01
subsystem: ui
tags: [antd, react, theme, context, codemod, vitest, playwright, adoption]

requires:
  - phase: 49-design-system-foundation
    provides: 51 wrappers, ui barrel, ThemeAppHolder/useMessage hooks, token source and ESLint guard
provides:
  - ThemeAppHolder mounted once under each of five AppIntelliJ rendered branches
  - ThemeConfigProvider wrapper and useAntdToken/darkAlgorithm theme bridge exported from ui barrel
  - Idempotent import-only adoption codemod with --help and manifest support
  - Two notification hooks moved from static message API to context useMessage
  - Static API guard and inline token sweep reading wave manifests
  - Six-flow Playwright adoption smoke skeleton U1..U6
affects: [50-full-app-adoption wave 2-9, 50-UAT.md, all five surface migrations]

tech-stack:
  added: []
  patterns:
    - Shell wraps every rendered branch with ThemeConfigProvider then ThemeAppHolder
    - View files import theme via useAntdToken() from ui barrel, never runtime antd
    - Static AntD API guard distinguishes context-bound instances from unbound static calls
    - Migrated file manifests live in tests/fixtures/adoption/wave-*.txt and drive source guards

key-files:
  created:
    - src/components/ui/config-provider.tsx
    - scripts/adoption-codemod.mjs
    - src/components/ui/__tests__/staticApiGuard.test.ts
    - src/components/ui/__tests__/inlineStyleSweep.test.ts
    - tests/fixtures/adoption/wave-01.txt
    - e2e/adoption.spec.ts
  modified:
    - src/AppIntelliJ.tsx
    - src/workbench/AntdThemeAdapter.tsx
    - src/workbench/__tests__/AntdThemeAdapter.test.tsx
    - src/components/ui/antdTheme.ts
    - src/components/ui/index.ts
    - src/hooks/useNetworkStatus.ts
    - src/hooks/useTimerAlertMonitor.ts

key-decisions:
  - "ThemeConfigProvider forwards caller theme and strips undefined via withoutUndefined, keeping exactOptionalPropertyTypes green without reading localStorage"
  - "Static API guard treats a same-named local message/notification/Modal as context-bound; a real static antd import always violates"
  - "Codemod leaves static APIs on their original import and warns for manual hook conversion, so import rewriting never silently changes behavior"

patterns-established:
  - "One holder per rendered branch: AntdThemeAdapter > ThemeAppHolder > providers/view"
  - "Wave manifests are the whitelist for adoption source guards"

requirements-completed: [ADOPT-01, ADOPT-02, ADOPT-03, ADOPT-04]

duration: 13min
completed: 2026-11-21
---

# Phase 50 Plan 01: Full App Adoption Foundation Summary

**Shell holder mounting, theme bridge wrappers, import codemod, two context-based notification hooks, and manifest-driven guards for the five adoption waves**

## Performance

- **Duration:** 13 min
- **Started:** 2026-11-21T12:33:43Z
- **Completed:** 2026-11-21T12:46:37Z
- **Tasks:** 3/3
- **Files modified:** 13

## Accomplishments
- `ThemeAppHolder` is mounted exactly once under `AntdThemeAdapter` in all five `AppIntelliJ` return branches, so context hooks receive live instances in main shell and popouts.
- `AntdThemeAdapter` now imports `ThemeConfigProvider` from the UI barrel instead of runtime `antd`; `useAntdToken`/`darkAlgorithm` are exported for upcoming view waves.
- Two notification hooks use `useMessage()` with Vietnamese copy preserved byte-for-byte and no static `message` import.
- Idempotent import-only codemod plus static-API and inline-token guards let each later wave prove its own cleanliness.
- Playwright skeleton lists six U1..U6 flows with a theme-parity baseline; all scoped gates stay green.

## Task Commits

1. **Task 1: Wrapper ConfigProvider + theme bridge, mount holder trên mọi branch** - `6e71c537` (test RED), `80a0b292` (feat GREEN)
2. **Task 2: Codemod import + chuyển 2 hook thông báo sang useMessage** - `546fe217` (feat)
3. **Task 3: Guard static API + inline sweep + e2e skeleton 6 luồng** - `bde9b330` (test)

**Plan metadata commit:** pending — orchestrator owns final metadata commit after the wave.

## Files Created/Modified
- `src/components/ui/config-provider.tsx` — `ThemeConfigProvider`, caller-owned theme, no localStorage read
- `src/components/ui/antdTheme.ts` — `useAntdToken()`, `darkAlgorithm`, unchanged `getAntdAlgorithms`
- `src/components/ui/index.ts` — barrel exports for the new wrappers
- `src/AppIntelliJ.tsx` — holder mounted in all five branches
- `src/workbench/AntdThemeAdapter.tsx` — runtime antd import removed
- `src/workbench/__tests__/AntdThemeAdapter.test.tsx` — holder/context, token bridge and source assertions
- `src/hooks/useNetworkStatus.ts`, `src/hooks/useTimerAlertMonitor.ts` — context message instances
- `scripts/adoption-codemod.mjs` — deterministic import rewrite CLI
- `src/components/ui/__tests__/staticApiGuard.test.ts`, `src/components/ui/__tests__/inlineStyleSweep.test.ts` — manifest-driven source guards
- `tests/fixtures/adoption/wave-01.txt` — seven migrated source paths
- `e2e/adoption.spec.ts` — six-flow smoke skeleton

## Decisions Made
- `withoutUndefined` strips an omitted `theme` prop so `exactOptionalPropertyTypes` stays green.
- The static API guard binds by local declaration from `useMessage`/`useNotification`/`useTaskMateModal`; this avoids false positives on the migrated hooks while still flagging genuine static imports.
- The codemod warns and leaves static API imports untouched; manual conversion is mandatory per D-05/D-06.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Codemod injected theme helpers into icon imports and was not idempotent**
- **Found during:** Task 2 fixture dry-run in /tmp
- **Issue:** First draft pushed `useAntdToken`/`darkAlgorithm` into the icons import clause and rewrote already-migrated files on a second run.
- **Fix:** Tracked `importedTheme` per antd clause only, kept static APIs on their original import with a warning, and compared each replacement string before writing.
- **Files modified:** `scripts/adoption-codemod.mjs`
- **Verification:** Fixture rewrite produced correct barrel/type/static split; second run reported `0 file(s) changed`.
- **Committed in:** `546fe217`

**2. [Rule 1 - Bug] exactOptionalPropertyTypes rejected optional theme forwarding**
- **Found during:** Task 1 verification
- **Issue:** Passing `theme: ThemeConfig | undefined` to `AntConfigProvider` failed type check.
- **Fix:** Wrapped props with `withoutUndefined({ theme })`.
- **Files modified:** `src/components/ui/config-provider.tsx`
- **Verification:** `npx tsc --noEmit` exit 0.
- **Committed in:** `80a0b292`

**Total deviations:** 2 auto-fixed (Rule 1 bug fixes). No scope creep; both required for correct implementation.

## Issues Encountered
- None beyond the two auto-fixes above.

## User Setup Required
None.

## Next Phase Readiness
Wave 1 manifest and guards are ready. Later plan 02-09 can add their own wave manifests and run the codemod plus guards per surface; `lint:adoption` and `guardConfig.test.ts` remain untouched for the final plan per D-11.

## Self-Check: PASSED

- All seven created files exist on disk.
- All four task commits verified in git history.
- Overall gates: `npx tsc --noEmit`, `npm run lint`, `npm run test:foundation`, codemod `--help`, manifest count 7, Playwright list 6 tests.

---
*Phase: 50-full-app-adoption*
*Completed: 2026-11-21*
