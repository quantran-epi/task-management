---
phase: quick
plan: 260930-vdl
status: complete
subsystem: timer-popout
tags: [tauri, timer, popout, always-on-top, broadcast-channel, multi-timer]
dependency_graph:
  requires: [TimerContext, ActiveTimerWidget, timerPopout]
  provides: [TimerPopoutView, openTimerPopout, isWindowAlwaysOnTop, setWindowAlwaysOnTop, toggleAlwaysOnTop]
  affects: [App, ActiveTimerWidget, TimerContext, useHashRoute, navigation]
tech_stack:
  added: []
  patterns: [tauri-secondary-webview, broadcast-channel-sync, pip-mini-window, always-on-top]
key_files:
  created:
    - src/utils/timerPopout.ts
    - src/views/TimerPopoutView.tsx
    - tests/utils/timerPopout.test.ts
    - tests/views/TimerPopoutView.test.tsx
  modified:
    - src-tauri/capabilities/default.json
    - src/types/navigation.ts
    - src/hooks/useHashRoute.ts
    - src/context/TimerContext.tsx
    - src/components/timer/ActiveTimerWidget.tsx
    - src/App.tsx
decisions:
  - Tauri capabilities target all windows ("*") granting webview creation and always-on-top permissions
  - Popout window route (#timer-popout) mounts standalone TimerPopoutView directly under ConfigProvider & TimerProvider, bypassing AppShell
  - Popout supports both single prominent capsule and multi-timer stacked list with individual start/pause/finish controls
  - Real-time cross-window synchronization uses native BroadcastChannel alongside Dexie reactive queries
metrics:
  duration_min: 15
  tasks: 3
  files: 10
  completed_at: 2026-09-30T15:46:00Z
requirements:
  - TAURI-POPOUT-CAPABILITIES
  - TIMER-BROADCAST-SYNC
  - MULTI-TIMER-POPOUT-VIEW
  - ALWAYS-ON-TOP-PIN
  - POPOUT-TRIGGER-MAIN-SHELL
---

# Quick 260930-vdl: Pop Out and Pin Timer as Separate Small Window

Added desktop popout floating mini window for task timer with always-on-top pinning, cross-window real-time synchronization, and concurrent multi-timer support.

## Key Changes

1. **Tauri Capabilities & Window Manager (`src-tauri/capabilities/default.json`, `src/utils/timerPopout.ts`)**
   - Granted `core:webview:allow-create-webview-window`, `core:window:allow-set-always-on-top`, `core:window:allow-is-always-on-top`, `core:window:allow-set-focus`, `core:window:allow-close`, `core:window:allow-set-size`, `core:window:allow-start-dragging` to all windows.
   - Built `openTimerPopout()`, `isWindowAlwaysOnTop()`, `setWindowAlwaysOnTop()`, `toggleAlwaysOnTop()`, `closeCurrentPopoutWindow()`, supporting native Tauri secondary WebviewWindow and browser popup fallback.

2. **Cross-Window Synchronization & Routing (`src/context/TimerContext.tsx`, `src/types/navigation.ts`, `src/hooks/useHashRoute.ts`)**
   - Registered `timer-popout` hash route in `VALID_ROUTES`.
   - Connected `BroadcastChannel('task_timer_sync')` in `TimerProvider` for instant cross-window ticker and mutation synchronization.

3. **Popout UI View & Shell Trigger (`src/views/TimerPopoutView.tsx`, `src/components/timer/ActiveTimerWidget.tsx`, `src/App.tsx`)**
   - Implemented `TimerPopoutView` featuring compact draggable header, active timer badge, pushpin always-on-top toggle, clean empty state, single prominent timer layout, and stacked multi-timer list.
   - Added pop out action button to `ActiveTimerWidget` in both single-capsule view and multi-timer dropdown header.
   - Mounted `TimerPopoutView` in `App.tsx` directly without sidebar or header navigation for a lean mini-widget experience.

## Verification
- `tests/utils/timerPopout.test.ts` (8 passing unit tests)
- `tests/views/TimerPopoutView.test.tsx` (6 passing unit tests)
- `npm run build` succeeds cleanly with zero type errors.
