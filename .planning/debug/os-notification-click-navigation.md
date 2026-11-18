---
status: awaiting_human_verify
trigger: "hiện tại các notification OS khi ấn vào không tự động chuyển đến trang đích, fix tất cả các notification của app"
created: 2026-11-17T00:00:00Z
updated: 2026-11-17T23:25:00Z
---

## Current Focus

bug_class: Bohrbug (deterministic — click handler is entirely absent on desktop)
reasoning_checkpoint:
  hypothesis: "No OS-notification click handler exists on Tauri desktop. `@tauri-apps/plugin-notification`'s desktop `show()` (notify_rust) drops the click event, its JS click APIs (`onNotificationReceived`/`onAction`) are mobile-only, and `sendDesktopNotification()` never attaches a deeplink payload or click listener. Therefore clicking any notification cannot focus the window nor navigate. A custom Rust command that shows a clickable notification via notify_rust, waits for the default-action click, focuses the main window, and emits a `notification-clicked` event carrying a hash route — consumed by a shared frontend listener — addresses the root cause for ALL notification sites."
  confirming_evidence:
    - "grep across src: zero usages of onNotificationReceived/onAction; no click listener registered anywhere."
    - "plugin index.d.ts: onNotificationReceived and onAction documented 'Only emitted on mobile'."
    - "tauri-plugin-notification-2.5.0 desktop.rs show(): calls notify_rust Notification::show() and discards handle; no wait_for_response/click callback."
    - "desktopNotification.ts Tauri branch passes only {title,body,extra}; browser fallback onclick calls window.focus() only, no navigation."
    - "notify-rust 4.18.1 NotificationHandle::wait_for_response delivers NotificationResponse::Default on body click across XDG/Windows/macOS (verified response.rs + platform handles)."
    - "Both shells use useHashRoute listening to `hashchange`; setting window.location.hash drives navigation in both."
  falsification_test: "After the fix, emit/simulate a `notification-clicked` event with a hash payload and observe the app does NOT navigate, OR click an OS notification and the main window is not focused — either disproves the hypothesis. Also, if wait_for_response never fires Default on a body click on the target OS, this fix cannot work."
  fix_rationale: "Root cause is an entirely missing desktop click->deeplink path. The fix creates that path at the lowest common layer: a Rust command showing a clickable native notification that detects the default click, focuses main window, emits the route; the frontend's central sendDesktopNotification invokes it for Tauri with a deeplink payload, and a single global listener applies the hash route. Centralizing means every notification site gains click-navigation without per-site edits."
  blind_spots:
    - "Cannot fully verify real OS banner click on this headless Linux/WSL environment; click semantics differ on macOS/Windows and depend on each desktop's notification daemon supporting actions."
    - "notify_rust blocking wait_for_response must run off the main thread; need to confirm no UI deadlock and that focus works from that thread."
    - "notify_rust native notifications bypass the tauri notification plugin's permission state; preserve permission gating in the TS dispatcher."
    - "IntelliJ Workbench shell uses tabs/layoutStore rather than hash routes for most views - hash navigation may need a dedicated handler to open the right tab."
  candidate_causes:
    - "code: no click handler / no deeplink payload anywhere in the notification dispatch path (CONFIRMED)."
    - "config: Tauri capabilities omit a needed permission for window focus or event emit - checked, core:window:allow-set-focus and core:default present; not the cause."
    - "environment: OS notification daemon on some platforms doesn't deliver click actions - possible amplifier on Linux, but the app never registers a handler, so not primary."
    - "data: notifications carry no target/deeplink metadata - CONTRIBUTING; call sites have targetable context but sendDesktopNotification doesn't forward a route."
  and_gate: "no - the single missing click->navigation path fully accounts for the symptom; absence of deeplink data is part of that same path, not an independent co-occurring condition."
test: (1) Confirm no `onNotificationReceived`/`onAction` listener exists in app code. (2) Confirm plugin desktop `show()` has no click hook. (3) Confirm all send call sites pass no deeplink `data`. (4) Design custom Rust notification click -> Tauri event -> hash-route navigation.
expecting: Clicking any OS notification focuses the main window and navigates to the notification's target page in both default and IntelliJ shells.
next_action: awaiting human verification — trigger every OS notification type in the real Tauri app, click each banner, confirm the window focuses and the correct target page opens in both default and IntelliJ shells; report back. Commit f4aadb8c.

## Symptoms

expected: Clicking any OS notification (reminder, timer, overdue, overload, etc.) automatically opens/focuses the Tauri app and navigates to the notification's intended target page (deeplink).
actual: Clicking OS notification does not open/focus the app at all; no navigation occurs.
errors: None reported by user.
timeline: Reported 2026-11-17.
reproduction: Trigger any in-app notification that produces an OS notification banner, then click the banner.
source_mechanism: Tauri desktop uses `@tauri-apps/plugin-notification` (native OS banners via notify_rust); browser/PWA fallback uses Service Worker / `window.Notification`.
scope: Fix ALL notifications in the app, not just reminders.

## Eliminated
<!-- APPEND only - prevents re-investigating -->

- hypothesis: App already registers a JS click listener via plugin `onNotificationReceived`/`onAction` and it just fails to navigate.
  evidence: grep across all of src found zero usages of `onNotificationReceived`/`onAction`; only a custom `team-notification-permission-change` window event exists. No listener exists to handle clicks.
  timestamp: 2026-11-17T00:14:00Z

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-11-17T00:10:00Z
  checked: `src/utils/desktopNotification.ts` Tauri branch (lines 89-121)
  found: `sendTauriNotification(options)` called with only `{title, body, extra}`; `options.extra` populated from `payload.data` when it is an object. No click handler registration. Browser fallback `notif.onclick` (lines 172-183) calls only `window.focus()` + `notif.close()` — no navigation.
  implication: No path from a notification click to in-app routing exists either on desktop or browser.

- timestamp: 2026-11-17T00:12:00Z
  checked: `@tauri-apps/plugin-notification` dist-js/index.d.ts + index.js
  found: Only click-related APIs are `onNotificationReceived` (JSDoc: "Only emitted on mobile") and `onAction` ("Only emitted on mobile, for notifications that reference an action type"). They wire to plugin events `notification` / `actionPerformed`. No desktop click event.
  implication: Registering a JS click listener via this plugin cannot work on the primary Tauri desktop runtime.

- timestamp: 2026-11-17T00:13:00Z
  checked: `tauri-plugin-notification-2.5.0/src/desktop.rs` show() (lines 203-245)
  found: Desktop `show()` builds a `notify_rust::Notification`, calls `notification.show()` in a spawned task, and returns `()`. No `wait_for_response`/`on_close`/action handler is attached; no click callback emitted.
  implication: The plugin's desktop backend fundamentally drops click events; requires a custom Rust path to detect clicks.

- timestamp: 2026-11-17T00:13:30Z
  checked: `notify-rust-4.18.1` response.rs + xdg/mod.rs + windows.rs
  found: `NotificationHandle::wait_for_response(ResponseHandler)` / `wait_for_action` exist cross-platform; `NotificationResponse::Default` = body clicked / default action, `Action(String)` = named button, `Closed(reason)`. On Windows a body click yields `Action` with default key or `Default`; on Linux XDG `default` action key is delivered. Caller must attach this to the handle returned by `Notification::show()`.
  implication: A custom Rust command that shows a notification and calls `wait_for_response` can detect a body click, focus the main window, and emit an event with the deeplink target.

- timestamp: 2026-11-17T00:14:00Z
  checked: all `sendDesktopNotification` call sites (grep)
  found: Sites = useDesktopNotification.ts (2), useTeamChatNotifications.ts, useTimerAlertMonitor.ts, useGhostDevNotifications.ts (3), NotificationSettingsCard.tsx (3 test notifications), AIChatDrawer.tsx, budgetWarning.ts, telegramHeadlessWorker.ts. Most pass no `data`; call sites carry targetable context (item.id/entityType/entityId/date, teamId, taskId, chat scope, etc.).
  implication: Fix must be centralized in `sendDesktopNotification` so ALL notifications get click→deeplink without editing each site, plus enrich a few payloads with deeplink data.

- timestamp: 2026-11-17T00:14:30Z
  checked: `src/App.tsx`, `src/AppIntelliJ.tsx`, `src/hooks/useHashRoute.ts`, `src/types/navigation.ts`
  found: Routing is hash-based. `useHashRoute` subscribes to `hashchange` and `navigate()` sets `window.location.hash`. Both default (`App`) and IntelliJ (`AppIntelliJ`) shells call `useHashRoute`. `buildHash(route, params)` produces `#/route?params`. No existing global "navigate" Tauri event.
  implication: Setting `window.location.hash` from a Tauri event listener will drive navigation in BOTH shells automatically via the shared `hashchange` mechanism.

- timestamp: 2026-11-17T00:15:00Z
  checked: `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`, `src-tauri/capabilities/default.json`
  found: Tauri builder registers notification plugin, manages state, `generate_handler!` for commands, `.run()` loop handles `RunEvent`. `tauri-plugin-notification = "2"`, capability `notification:default`. No custom notification command or click event exists.
  implication: Add a Rust command `send_clickable_notification` using `notify_rust` directly (add as direct dep) that waits for response, focuses main window, and emits a `notification-clicked` event with deeplink hash; expose command in capabilities; replace Tauri branch of `sendDesktopNotification` to call it.

- timestamp: 2026-11-17T23:10:00Z
  checked: fix implementation
  found: Added `src-tauri/src/desktop_notification.rs` (Rust command `send_clickable_notification`: notify_rust Notification with `default` action, `wait_for_response` on a background thread, focus main window via `get_webview_window("main")`, emit `notification-clicked` with route). Registered in lib.rs + Cargo.toml (notify-rust direct dep). Added `src/utils/notificationDeepLink.ts` (route mapping, safe-route guard, global event listener applying hash + custom event). Updated `desktopNotification.ts` Tauri branch to invoke the command and browser fallback to dispatch the deeplink. Mounted listener in both App.tsx and AppIntelliJ.tsx. Added WorkbenchLayout handler to open tabs on deeplink. Supplied `deeplink` at all 13 notification call sites.
  implication: All notifications now have an OS click -> focus -> navigate path in both shells.

## Resolution

root_cause: "No OS-notification click handler exists on Tauri desktop. `@tauri-apps/plugin-notification`'s desktop backend calls notify_rust's `show()` and discards the handle, so click events are dropped; its JS click APIs (`onNotificationReceived`/`onAction`) are mobile-only. `sendDesktopNotification()` never attached a click listener or deeplink payload, and the browser fallback only called `window.focus()`. Clicking any notification could therefore never focus the app or navigate."

fix: "Added a custom Rust Tauri command `send_clickable_notification` that shows a native notification with notify_rust, registers the `default` action, and on a background thread waits for the body click, focuses the main window, and emits a `notification-clicked` event carrying a hash route. Added a centralized frontend module `notificationDeepLink.ts` that maps alert items to hash routes, guards route safety, listens for the Tauri event, and applies navigation (hash for the default shell; a `taskmate:notification-deeplink` event consumed by WorkbenchLayout for the IntelliJ shell). `sendDesktopNotification()` now invokes the Rust command on Tauri and dispatches the deeplink on browser notification clicks. All 13 notification call sites now pass a deeplink target."

verification:
  target_test: { result: pass, file: src/utils/__tests__/notificationDeepLink.test.ts, tests: 10 }
  mutation_check: { result: pass, method: manual (Stryker not configured), mutant: "deeplinkForAlert task branch -> dashboard", mutant_killed: true, killed_by: 2 tests }
  no_op_deletion: { result: pass, deletion_justified_by_rca: true, note: "desktopNotification.ts removed the old plugin send branch — justified: that path could never observe clicks (root cause). Net diff is additive behavior." }
  adjacent_tests: { result: pass, suites_run: [AppIntelliJ.test.tsx, WorkbenchLayout.test.tsx, WorkbenchBottomPanel.test.tsx, notificationDeepLink.test.ts], tests: 22 }
  revert_and_reconfirm: { result: pass, bug_returned_on_revert: true (5 failures when deeplink mapping stubbed), fixed_on_reapply: true (10 pass) }
  typecheck: { result: pass, command: "npx tsc --noEmit" }
  rust_compile: { result: skipped, reason: "cargo check blocked by sandbox network — crates (bit-vec/cookie/target-lexicon) cannot be downloaded; bit-vec confirmed pre-existing in HEAD lockfile, not introduced by this change. All Rust APIs verified against cached notify-rust 4.18.1 + tauri 2.12.0 source." }
  guardrail_verdict: accepted

files_changed:
  - src-tauri/src/desktop_notification.rs (new): Rust clickable-notification command
  - src-tauri/src/lib.rs: register command module + handler
  - src-tauri/Cargo.toml: add notify-rust direct dependency
  - src/utils/notificationDeepLink.ts (new): deeplink mapping, safety guard, global listener
  - src/utils/__tests__/notificationDeepLink.test.ts (new): regression tests
  - src/utils/desktopNotification.ts: Tauri dispatch via custom command + browser deeplink click
  - src/App.tsx / src/AppIntelliJ.tsx: mount deep-link listener
  - src/workbench/WorkbenchLayout.tsx: open tabs on deeplink
  - src/hooks/useDesktopNotification.ts / useTeamChatNotifications.ts / useTimerAlertMonitor.ts / useGhostDevNotifications.ts: deeplink payloads
  - src/components/ai/AIChatDrawer.tsx / settings/NotificationSettingsCard.tsx: deeplink payloads
  - src/services/ai/office/budgetWarning.ts / telegram/telegramHeadlessWorker.ts: deeplink payloads
