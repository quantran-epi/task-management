---
phase: 49-design-system-foundation
plan: 02
subsystem: ui
tags: [tokens, light-dark, theme-toggle, cross-window-broadcast, drift-guard]

requires:
  - phase: 49-design-system-foundation
    provides: single workbench shell and one theme adapter to anchor unified tokens

provides:
  - Single typed tokens.ts source feeding both AntD ConfigProvider and CSS custom properties
  - Light/dark theme with localStorage > OS > light precedence, invalid values ignored
  - Instant toggle in TitleBar with exact Vietnamese aria-label and tooltips
  - Validated {mode} broadcast to four popout labels with browser storage fallback
  - Every mounted useThemeMode consumer re-renders on a received mode without reload
  - Parity, drift and popout re-render tests locking TOKEN-01..04

affects:
  - Phase 49 plans 03-09 (all wrappers consume tokens.ts and one theme tree)
  - Phase 50 app-wide wrapper migration (ConfigProvider/CSS palette swap point)

tech-stack:
  added: []
  patterns:
    - One typed as-const token object per mode; ConfigProvider and CSS vars derived from it
    - Static @tauri-apps/api/event imports behind isTauriApp() guard for testable emitTo/listen
    - Subscription callback writes React state directly — never re-broadcasts or writes localStorage

key-files:
  created:
    - src/styles/tokens.ts
    - src/workbench/themeBroadcast.ts
    - src/hooks/__tests__/themeBroadcast.test.ts
    - src/components/ui/__tests__/tokens.test.ts
  modified:
    - src/styles/workbench-tokens.css
    - src/workbench/AntdThemeAdapter.tsx
    - src/hooks/useThemeMode.ts
    - src/workbench/TitleBar.tsx
    - src/workbench/search/find/parts.tsx
    - src/workbench/__tests__/AntdThemeAdapter.test.tsx
    - src/workbench/search/find/__tests__/visualTokens.test.tsx

key-decisions:
  - antdText (#191b1f) and cssFg (#1f2937) kept as separately named constants; no hex was changed
  - CSS palette declarations removed where applyCssVariables writes them; structural var() aliases stay
  - subscribeToThemeBroadcast wired into useThemeMode only — no second listener inside the adapter
  - Tauri emitTo/listen imported statically behind isTauriApp(); dynamic import bypassed Vitest mocks
  - OS change listener runs only while no valid localStorage override exists

patterns-established:
  - getAntdTheme(mode) is the only ConfigProvider theme builder
  - applyCssVariables(mode, element) is the only palette/metric CSS writer
  - Received theme modes use the same exact {mode: enum} validator as Tauri payloads

requirements-completed: [TOKEN-01, TOKEN-02, TOKEN-03, TOKEN-04]

duration: ~13min
completed: 2026-11-21
---

# Phase 49 Plan 02: Design System Foundation — Tokens & Theme Propagation Summary

**Collapsed the duplicate AntD/CSS palettes into one typed tokens.ts source, added persisted instant light/dark toggle with validated cross-window broadcast, and locked parity with drift and popout re-render tests**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-11-21T14:48:00Z
- **Completed:** 2026-11-21T15:01:00Z
- **Tasks:** 3/3
- **Files modified:** 11 across 3 commits

## Accomplishments

- `src/styles/tokens.ts` exports `ThemeMode`, `lightTokens`, `darkTokens`, `statusColorMap`, `fileStatusMap`, `getAntdTheme`, `applyCssVariables`. ConfigProvider palette, metrics, status map and every palette/metric CSS custom property derive from this one source.
- `AntdThemeAdapter` no longer contains a literal hex or metric; it reads the new hook shape, calls `getAntdTheme(mode)`, injects CSS vars via `applyCssVariables`, and sets `data-theme={mode}`.
- `useThemeMode` resolves `localStorage['taskmate_theme']` > OS > light, ignores tampered values, keeps the OS listener only without an override, subscribes to broadcasts once, and applies received modes directly to React state without re-broadcasting or writing storage.
- `themeBroadcast` emits exact `{ mode }` to `timer-popout`, `notes-popout`, `ai-popout`, `coding-zone-popout` in Tauri and falls back to the browser `storage` event; all payloads pass an exact-shape validator and subscribers detach on cleanup.
- `TitleBar` gained the theme toggle with exact `aria-label="Chuyển đổi giao diện sáng/tối"` and tooltips `Giao diện: Sáng` / `Giao diện: Tối`.
- Verification: `npx tsc --noEmit` clean; four focused Vitest files / 29 tests pass including the popout re-render proof; zero hex literals in the adapter; zero duplicated palette hex in CSS code lines. No full suite run.

## Task Commits

1. **Task 1: Create tokens.ts single source and refactor adapter + CSS vars** — `d8d6acb7` (feat)
2. **Task 2: Add localStorage override, instant toggle and theme broadcast** — `b86aab49` (feat)
3. **Task 3: Add token parity and drift-detection tests** — `a5bca199` (test)

## Files Created/Modified

- Created: `src/styles/tokens.ts`, `src/workbench/themeBroadcast.ts`, `src/hooks/__tests__/themeBroadcast.test.ts`, `src/components/ui/__tests__/tokens.test.ts`
- Modified: `src/styles/workbench-tokens.css`, `src/workbench/AntdThemeAdapter.tsx`, `src/hooks/useThemeMode.ts`, `src/workbench/TitleBar.tsx`, `src/workbench/search/find/parts.tsx`, `src/workbench/__tests__/AntdThemeAdapter.test.tsx`, `src/workbench/search/find/__tests__/visualTokens.test.tsx`

## Decisions Made

- Kept the known `colorText` vs `--fg` hex disagreement as two named constants (`antd.colorText`, `css.fg`) per 49-UI-SPEC "không đổi hex".
- Kept CSS-only structural aliases (`--handle-line-color`, `--handle-line-color-hover`, remote-tree aliases) out of tokens.ts because they are var() references, not palette values.
- Used static Tauri event imports behind `isTauriApp()`; dynamic imports in the first draft bypassed Vitest module mocks and silently hit real IPC shape errors.
- Subscriber lives in `useThemeMode` only — the adapter and every popout inherit it through the one hook, so no second listener can drift.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Dynamic Tauri import bypassed Vitest mocks**
- **Found during:** Task 2 verification
- **Issue:** `import('@tauri-apps/api/event')` inside `broadcastThemeMode`/`subscribeToThemeBroadcast` resolved the real module in Vitest, so mocked `emitTo` was never called and the real IPC shape threw.
- **Fix:** Switched to static `emitTo`/`listen` imports guarded by `isTauriApp()`, matching the repo's existing Tauri-boundary pattern; tests mock the module cleanly.
- **Files modified:** `src/workbench/themeBroadcast.ts`
- **Commit:** `b86aab49`

**2. [Rule 3 - Blocking] visualTokens.test.tsx asserted palette literals removed from CSS**
- **Found during:** Task 2 combined verification
- **Issue:** The existing source-scan test expected `--accent: #2f62d8` / `#6a9bff` and compact metrics in `workbench-tokens.css`, which Task 1 intentionally deleted.
- **Fix:** Updated those assertions to read the same explicit values from `src/styles/tokens.ts` and kept the font unicode-range/no-purple/structural checks intact.
- **Files modified:** `src/workbench/search/find/__tests__/visualTokens.test.tsx`
- **Commit:** `b86aab49`

**3. [Rule 3 - Blocking] Second useThemeMode caller broke with the new hook shape**
- **Found during:** Task 2 pre-flight grep
- **Issue:** `src/workbench/search/find/parts.tsx` consumed the old boolean return, which would fail typecheck after the hook became an object.
- **Fix:** Updated it to destructure `{ mode }` and derive `isDark`; typecheck confirmed no other callers remain.
- **Files modified:** `src/workbench/search/find/parts.tsx`
- **Commit:** `b86aab49`

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking). No scope creep.

## Issues Encountered

- Browser `storage` fallback and Tauri `emitTo` both write/propagate for the same override; the subscriber validates shape and the hook writes received modes straight to state, so no loop occurs.

## User Setup Required

None.

## Known Stubs

None. All theme surfaces are wired to real token values and a live hook; broadcast fallback has working browser and Tauri transports.

## Threat Flags

None. The plan's threat model covers the localStorage, cross-window payload and CSS-injection boundaries; no new endpoint, auth path, file access or schema change was introduced.

## Next Phase Readiness

- Phase 49 plan 03 can build wrappers against `getAntdTheme` / `statusColorMap`; wrappers must consume these rather than reintroduce literals.
- `visualTokens.test.tsx` and `tokens.test.ts` are source-coupled to file paths and explicit hex values; future token moves must update both gates.

## Self-Check: PASSED

- All four created files and all seven modified files exist on disk.
- All three task commits (`d8d6acb7`, `b86aab49`, `a5bca199`) are present in `git log`.
- `npx tsc --noEmit` clean; four focused test files / 29 tests pass.

---
*Phase: 49-design-system-foundation*
*Completed: 2026-11-21*
