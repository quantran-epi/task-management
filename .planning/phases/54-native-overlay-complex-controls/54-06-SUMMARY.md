---
phase: 54-native-overlay-complex-controls
plan: 06
subsystem: ui
tags: [native-controls, holders, message, notification, upload, layout, config-provider, app, realtime, vitest]

# Dependency graph
requires:
  - phase: 54-01
    provides: ImperativeChannel/useImperativeChannel for keyed update and realtime holder stacks
  - phase: 54-02
    provides: vendored OpenIDEA CSS modules and native Button/Spin/Progress primitives
  - phase: 54-04
    provides: native modal contextHolder pattern and 22-wrapper baseline
  - phase: 54-05
    provides: native structural wrappers and focused-suite conventions (24-wrapper baseline)
provides:
  - 6 final native overlay/complex wrappers: app, config-provider, message, notification, upload, layout
  - realtime keyed message/notification holders with string+object API, pauseOnHover and D-12 tones
  - native App/ThemeConfigProvider/Layout context, token root injection and landmark/sider DOM
  - native Upload/UploadDragger with beforeUpload/LIST_IGNORE/customRequest/AntD-shaped onChange payloads
  - 28/28 overlay/complex wrappers free of runtime AntD; focused 9-test holder suite with clean console
affects: [54-07, Phase 56, Phase 57]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Each imperative holder owns a createImperativeChannel instance; keyed push/update renders through useSyncExternalStore without reload"
    - "Keyed update mutates one channel record in place, so loading-to-success keeps one DOM item and restarts its own timer/hover state"
    - "ThemeConfigProvider resolves mode from the caller theme seed, then applies CSS vars to wrapper and documentElement for BODY portals"
    - "useAntdToken derives the AntD-shaped token object from getAntdTheme(mode) instead of a runtime hook bound to a removed provider"
    - "Upload keeps AntD props by type-only alias while native file input/list implement beforeUpload, LIST_IGNORE and customRequest"

key-files:
  created:
    - src/components/ui/__tests__/overlayHolders.test.tsx
  modified:
    - src/components/ui/message.tsx
    - src/components/ui/notification.tsx
    - src/components/ui/app.tsx
    - src/components/ui/config-provider.tsx
    - src/components/ui/layout.tsx
    - src/components/ui/upload.tsx
    - src/components/ui/antdTheme.ts
    - src/workbench/__tests__/AntdThemeAdapter.test.tsx

key-decisions:
  - "message and notification use separate imperative channels and one shared stack renderer; ThemeAppHolder mounts both so callers never reload to see updates"
  - "HolderHandle is callable as well as destroy()-capable because MermaidViewer/MermaidAssistantView invoke loading handles as hide functions"
  - "useApp returns bound message/notification/modal receivers from native hooks; no AntD App.useApp() call remains"
  - "ConfigProvider injects --accent into documentElement for both light and dark, keeping #3871e1 and leaving shell chrome 40/26/36 untouched"
  - "Upload returns undefined event on onChange because no caller reads native event methods, while file/fileList payload and customRequest callbacks stay AntD-shaped"
  - "useAntdToken switched to getDesignToken(getAntdTheme(mode)) so view token reads survive removal of the runtime AntD ConfigProvider"
patterns-established:
  - "Holder exports keep lowercase use* names for internal stack renderers so scanWrappers() still reports 259 export names, matching the pre-plan baseline"

requirements-completed: [NAT-02]

# Metrics
duration: 22min
completed: 2026-11-22
---

# Phase 54 Plan 06: Native Overlay Holder Wrappers Summary

**Final six overlay/complex AntD wrappers now render native holder, theme, upload and landmark DOM with realtime keyed notification updates and no runtime AntD import**

## Performance

- **Duration:** 22 min
- **Started:** 2026-11-22T01:27:46Z
- **Completed:** 2026-11-22T01:49:42Z
- **Tasks:** 3
- **Files modified:** 9 (6 wrappers + 1 new focused test + token bridge + theme-adapter test)

## Accomplishments

- Message: native useMessage accepts string and `{content,key,duration,type}` args; success/error/warning/warn/info/loading/open return a callable destroy handle; keyed loading→success stays one DOM item with `data-state` changing in place.
- Notification: native useNotification accepts `{message,description,duration,placement,key}`, maps message to title, and defaults `{duration:4.5, placement:'topRight', pauseOnHover:true, iconSize}`. Toast timers pause on hover and resume on leave; keyed updates mutate one record.
- Both stacks subscribe with useImperativeChannel from 54-01 and render `.toast/.toastTitle/.toastBody/.toastClose` DOM with D-12 status tones from getStatusTokens; ThemeAppHolder mounts them beside children without a geometry node.
- App/ConfigProvider/Layout: native `data-oi-control="app"` wrapper carries `--ui-app-font-size`; ThemeConfigProvider writes tokens to wrapper and documentElement for both modes; Layout renders header/main/footer/aside landmarks and a native collapsible sider with `onCollapse(true,'clickTrigger')`.
- Upload: native hidden file input, trigger, drag-over state, 24px file rows, remove button and status hooks replace the AntD component. `beforeUpload=false` blocks, `UPLOAD_LIST_IGNORE` hides the row, and `customRequest` receives `{file,onSuccess,onError,onProgress}`.
- Coverage: all 28 CLASSIFY §4.2 overlay/complex wrapper files pass `check-native-imports.mjs`; the guard command lists each path exactly once including `overlayHolders.test.tsx` (`upload.tsx` once). scanWrappers() still reports the pre-plan baseline of 259 export names.
- Gates: tsc, ESLint, native-import guard, focused holder suite (9 tests), theme adapter suite (7 tests), staticApiGuard/coverage/antdInventory (21 tests combined), and five adjacent UI suites (23 tests) pass. No full Vitest run, per project rule.

## Task Commits

Each task was committed atomically:

1. **Task 1: message + notification native realtime holders** - `4b202bc8` (feat)
2. **Task 2: App + ConfigProvider + Layout native wrappers** - `c3bb58f5` (feat)
3. **Task 3: Upload native + 28/28 coverage + focused suite** - `bd0d1765` (feat)

**Plan metadata:** pending

## Files Created/Modified

- `src/components/ui/message.tsx` — native useMessage, imperative message channel, Toast stack and ThemeAppHolder mount.
- `src/components/ui/notification.tsx` — native useNotification, useNotificationConfig and notification stack with hover pause.
- `src/components/ui/app.tsx` — native App wrapper with `data-oi-control="app"` and bound useApp.
- `src/components/ui/config-provider.tsx` — native ThemeConfigProvider with root+documentElement CSS var injection.
- `src/components/ui/layout.tsx` — native Layout, LayoutHeader/Footer/Content/Sider and collapse state.
- `src/components/ui/upload.tsx` — native Upload, UploadDragger and UPLOAD_LIST_IGNORE with AntD-shaped callbacks.
- `src/components/ui/__tests__/overlayHolders.test.tsx` — 9 focused tests for holders, App/ConfigProvider/Layout, Upload payloads, realtime keyed updates and hover pause.
- `src/components/ui/antdTheme.ts` — useAntdToken derives tokens from getAntdTheme(mode) so view callers keep working after provider removal.
- `src/workbench/__tests__/AntdThemeAdapter.test.tsx` — holder mount assertion updated from `.ant-app` to native holder hooks.

## Decisions Made

- Native holder stacks keep one channel per module; a keyed push merges into the existing record instead of adding another item.
- The message handle is callable because two existing Mermaid callers use `message.loading(text, 0)` as a hide function; `destroy()` aliases the same closure.
- `ThemeConfigProvider` detects dark from `theme.token.colorBgBase`, so the explicit caller theme wins over the live theme broadcast.
- Upload emits a native-shaped `event: undefined` on change; AntD callers in this tree only consume `file` and `fileList`.
- `useAntdToken` no longer depends on an AntD provider being mounted; it resolves tokens from the same theme config used by the adapter.

## Deviations from Plan

**1. [Rule 1 - Bug] Callable loading handle** — Found during: Task 1 typecheck | Issue: `MermaidViewer.tsx` and `MermaidAssistantView.tsx` call the handle returned by `message.loading(text, 0)` as a function; a plain `{key,destroy}` handle broke both callers | Fix: made HolderHandle callable and aliased destroy to the same closure | Files modified: `src/components/ui/message.tsx` | Verification: tsc green; focused holder suite green | Committed in: `4b202bc8`

**2. [Rule 3 - Blocking] useAntdToken provider dependency** — Found during: Task 2 verification | Issue: `AntdThemeAdapter.test.tsx` resolved `colorPrimary` to the AntD default `#1677ff` after ConfigProvider became native, because `AntTheme.useToken()` read a provider that no longer existed | Fix: `useAntdToken` now returns `getDesignToken(getAntdTheme(mode))` and the adapter test asserts native holder hooks instead of `.ant-app` | Files modified: `src/components/ui/antdTheme.ts`, `src/workbench/__tests__/AntdThemeAdapter.test.tsx` | Verification: theme adapter suite 7/7 green, tsc and lint green | Committed in: `c3bb58f5`

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking). **Impact:** both preserve caller behavior and API shape; no caller files were edited.

## Issues Encountered

- `controls.test.tsx` still asserts legacy `.ant-modal` selectors and has one failing pre-existing case; reproduced unchanged on clean baseline commit `8363973a` in a temporary detached worktree. Selector migration remains scheduled for 54-07; no controls test was edited in this plan.
- Notification hover timer test initially used synthetic `mouseEnter`/`mouseLeave`; the final test uses React's `mouseOver`/`mouseOut` events so the native handler pauses and resumes in jsdom.
- No full Vitest run, per project rule.

## User Setup Required

None.

## Next Phase Readiness

Ready for 54-07. All 28/28 overlay/complex wrappers are native with stable `data-oi-control`/`data-state` hooks for Phase 57 measurement. Caller selector migration in `controls.test.tsx` remains the next plan's scope.

---
*Phase: 54-native-overlay-complex-controls*
*Completed: 2026-11-22*
