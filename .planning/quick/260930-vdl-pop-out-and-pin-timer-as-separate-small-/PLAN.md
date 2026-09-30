---
phase: quick
plan: 260930-vdl
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/capabilities/default.json
  - src/types/navigation.ts
  - src/hooks/useHashRoute.ts
  - src/context/TimerContext.tsx
  - src/utils/timerPopout.ts
  - src/views/TimerPopoutView.tsx
  - src/components/timer/ActiveTimerWidget.tsx
  - src/App.tsx
  - tests/utils/timerPopout.test.ts
  - tests/views/TimerPopoutView.test.tsx
  - tests/context/TimerContext.test.tsx
autonomous: true
requirements:
  - TAURI-POPOUT-CAPABILITIES
  - TIMER-BROADCAST-SYNC
  - MULTI-TIMER-POPOUT-VIEW
  - ALWAYS-ON-TOP-PIN
  - POPOUT-TRIGGER-MAIN-SHELL

must_haves:
  truths:
    - "Tauri capabilities grant window creation and always-on-top permissions across all windows."
    - "Clicking popout trigger in ActiveTimerWidget opens or focuses a dedicated floating mini window."
    - "Popout window supports pinning always on top (pinned by default with toggle control in desktop mode)."
    - "Popout window displays single or multiple concurrent active timers with live tabular tickers."
    - "Timer play, pause, and finish actions synchronize instantaneously across main window and popout window via BroadcastChannel."
    - "Main window route #timer-popout renders sleek standalone TimerPopoutView without AppShell sidebar/header."
  artifacts:
    - path: "src-tauri/capabilities/default.json"
      provides: "Desktop window permissions for runtime window creation and always-on-top"
      contains: "core:window:allow-set-always-on-top"
    - path: "src/utils/timerPopout.ts"
      provides: "Helper for opening popout window, focusing existing window, and toggling always-on-top"
      exports: ["openTimerPopout", "isTauriApp", "setWindowAlwaysOnTop", "isWindowAlwaysOnTop", "closeCurrentPopoutWindow"]
    - path: "src/views/TimerPopoutView.tsx"
      provides: "Floating mini window view with pin toggle and multi-timer list controls"
      min_lines: 80
    - path: "src/components/timer/ActiveTimerWidget.tsx"
      provides: "Pop out button to launch floating window from single capsule and multi-timer dropdown"
      contains: "openTimerPopout"
    - path: "tests/views/TimerPopoutView.test.tsx"
      provides: "Component tests for single and multiple timer rendering and controls in popout view"
  key_links:
    - from: "src/components/timer/ActiveTimerWidget.tsx"
      to: "src/utils/timerPopout.ts"
      via: "openTimerPopout invocation"
      pattern: "openTimerPopout\\(\\)"
    - from: "src/App.tsx"
      to: "src/views/TimerPopoutView.tsx"
      via: "conditional render on route timer-popout"
      pattern: "route === 'timer-popout'"
    - from: "src/views/TimerPopoutView.tsx"
      to: "src/context/TimerContext.tsx"
      via: "useTimer hook consumption"
      pattern: "useTimer\\(\\)"
    - from: "src/context/TimerContext.tsx"
      to: "BroadcastChannel"
      via: "cross-window timer synchronization"
      pattern: "new BroadcastChannel"
---

<objective>
Pop out and pin timer as a separate small floating window with multi-timer support and cross-window live sync.

Purpose: Provide a compact, distraction-free floating widget that stays on top of other desktop windows while tracking active tasks, synchronizing state with the main application window in real time.
Output: Tauri capability configuration, popout window utility, cross-window BroadcastChannel sync, standalone TimerPopoutView, and ActiveTimerWidget popout trigger.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src-tauri/tauri.conf.json
@src-tauri/capabilities/default.json
@src/components/timer/ActiveTimerWidget.tsx
@src/context/TimerContext.tsx
@src/App.tsx
@src/utils/timerPopout.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Configure Tauri window capabilities and popout window management utility</name>
  <files>src-tauri/capabilities/default.json, src/utils/timerPopout.ts, tests/utils/timerPopout.test.ts</files>
  <action>
    1. Update `src-tauri/capabilities/default.json`:
       - Set `"windows": ["*"]` so permissions apply to both main window and popout window.
       - Add core window permissions: `core:window:default`, `core:window:allow-create`, `core:window:allow-set-always-on-top`, `core:window:allow-is-always-on-top`, `core:window:allow-set-focus`, `core:window:allow-close`, `core:window:allow-show`, `core:window:allow-hide`, `core:window:allow-start-dragging`, `core:webview:allow-create-webview-window`.
    2. Refine `src/utils/timerPopout.ts`:
       - `isTauriApp()`: checks if `__TAURI_INTERNALS__` exists on window.
       - `openTimerPopout()`: In Tauri, dynamically imports `@tauri-apps/api/webviewWindow`, checks if `timer-popout` exists (via `getAllWebviewWindows()`); if exists, shows and focuses it; if not, instantiates `new WebviewWindow('timer-popout', { url: '#timer-popout', title: 'Task Timer', width: 360, height: 320, minWidth: 280, minHeight: 140, alwaysOnTop: true, resizable: true, decorations: true })`.
       - In browser / PWA fallback: opens `window.open(base, 'task-planner-timer-popout', 'width=360,height=320,resizable=yes,status=no')`.
       - `isWindowAlwaysOnTop()` and `setWindowAlwaysOnTop(alwaysOnTop)`: wraps `getCurrentWebviewWindow().isAlwaysOnTop()` and `.setAlwaysOnTop(alwaysOnTop)`.
       - `closeCurrentPopoutWindow()`: closes current webview window or calls `window.close()`.
    3. Update `tests/utils/timerPopout.test.ts` to test browser fallback, Tauri detection, and always-on-top toggle helpers.
  </action>
  <verify>
    <automated>npx vitest run tests/utils/timerPopout.test.ts</automated>
  </verify>
  <done>Tauri capabilities configured and timerPopout utility passes automated tests.</done>
</task>

<task type="auto">
  <name>Task 2: Implement cross-window live sync and hash route registration</name>
  <files>src/types/navigation.ts, src/hooks/useHashRoute.ts, src/context/TimerContext.tsx, tests/context/TimerContext.test.tsx</files>
  <action>
    1. Update `src/types/navigation.ts` to include `'timer-popout'` in `AppRoute` union.
    2. Update `src/hooks/useHashRoute.ts` to whitelist `'timer-popout'` in `VALID_ROUTES`.
    3. In `src/context/TimerContext.tsx`:
       - Define `TIMER_SYNC_CHANNEL = 'task_timer_sync'`.
       - Introduce a `syncRev` state counter in `TimerProvider` and pass `[database, syncRev]` into `useLiveQuery` to force immediate re-query when foreign windows emit changes.
       - Emit `{ type: 'TIMER_MUTATED', action: 'START' | 'PAUSE' | 'FINISH' | 'CANCEL', taskId }` via `BroadcastChannel` whenever any timer is started, paused, finished, or cancelled.
       - In `useEffect` listening on `BroadcastChannel`, increment `syncRev` and `tick` upon message receipt so both Dexie's live query and the elapsed ticker update synchronously in real time across windows.
    4. Update `tests/context/TimerContext.test.tsx` to verify BroadcastChannel event emission and cross-window sync reactivity.
  </action>
  <verify>
    <automated>npx vitest run tests/context/TimerContext.test.tsx</automated>
  </verify>
  <done>Timer route registered and BroadcastChannel enables instantaneous cross-window timer updates.</done>
</task>

<task type="auto">
  <name>Task 3: Build TimerPopoutView, multi-timer UI, and pop out trigger button in ActiveTimerWidget</name>
  <files>src/views/TimerPopoutView.tsx, src/components/timer/ActiveTimerWidget.tsx, src/App.tsx, tests/views/TimerPopoutView.test.tsx</files>
  <action>
    1. Create `src/views/TimerPopoutView.tsx`:
       - Header bar: compact header with app title / icon, active timer badge count, pin toggle button (`PushpinFilled` when pinned / `PushpinOutlined` when unpinned) calling `setWindowAlwaysOnTop`, and close button calling `closeCurrentPopoutWindow`.
       - Initial pin state: defaults to `true` (pinned always on top on desktop).
       - Timer list: supports 0, 1, or N concurrent active timers.
         - When 0 timers active: render clean compact empty state ("Chưa có bộ đếm nào đang chạy") with helpful guidance.
         - When 1 or multiple timers active: render compact list of timer cards. Each row includes status indicator (green pulse for running, orange for paused), task name with tooltip, tabular elapsed ticker (`HH:mm:ss`), and action buttons (Play/Pause, Finish session, Cancel timer).
       - Responsive and scrollable if multiple timers exceed window height.
    2. Update `src/App.tsx`:
       - In `App.tsx`, check `if (route === 'timer-popout')`: render `<ConfigProvider locale={viVN} theme={{ algorithm: isDark ? darkAlgorithm : defaultAlgorithm }}><TimerProvider><TimerPopoutView /></TimerProvider></ConfigProvider>` directly, completely bypassing `AppShell` (no navigation menu, sidebar, or footer).
    3. Update `src/components/timer/ActiveTimerWidget.tsx`:
       - Add popout icon button (`<ExportOutlined />` with tooltip "Mở cửa sổ mini ghim nổi") to both the single active timer capsule and the multi-timer dropdown header/rows, allowing the user to pop out the timer at any time with a single click.
    4. Create `tests/views/TimerPopoutView.test.tsx` with component tests verifying:
       - Rendering 0 timers empty state.
       - Rendering single active timer with ticker and controls.
       - Rendering multiple concurrent active timers with independent play/pause/finish controls.
       - Toggling pin always-on-top state.
  </action>
  <verify>
    <automated>npx vitest run tests/views/TimerPopoutView.test.tsx tests/components/ActiveTimerWidget.test.tsx</automated>
  </verify>
  <done>TimerPopoutView displays single and multi-timers, pins to desktop, syncs live, and launches from main widget.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Popout Window ↔ Main Window | Cross-window communication over BroadcastChannel and local IndexedDB |
| Webview ↔ Tauri Native Runtime | Tauri IPC for window creation and always-on-top configuration |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-QUICK-01 | Tampering | BroadcastChannel message handling | mitigate | Validate message shape and restrict actions to local cache sync triggers without executing arbitrary code |
| T-QUICK-02 | Elevation of Privilege | Tauri capability permissions | mitigate | Restrict window permissions to specific core:window allow actions and explicit window labels |
| T-QUICK-03 | Denial of Service | Rapid multi-window timer spam | mitigate | Preserve existing 20-timer concurrency cap in TimerContext across all windows |
</threat_model>

<verification>
Automated verification commands:
- `npx vitest run tests/utils/timerPopout.test.ts`
- `npx vitest run tests/context/TimerContext.test.tsx`
- `npx vitest run tests/views/TimerPopoutView.test.tsx`
- `npx vitest run tests/components/ActiveTimerWidget.test.tsx`
- `npm run build`
</verification>

<success_criteria>
- All unit and component tests pass without warnings.
- Production build (`npm run build`) passes cleanly.
- Popout window launches with always-on-top pin capability.
- Multi-timer display renders all active timers with real-time synchronized ticker updates.
</success_criteria>

<output>
Create `.planning/quick/260930-vdl-pop-out-and-pin-timer-as-separate-small-/260930-vdl-SUMMARY.md` when done
</output>
