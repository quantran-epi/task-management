---
phase: quick
plan: 260930-uwl
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/Cargo.toml
  - src-tauri/src/lib.rs
  - src-tauri/capabilities/default.json
  - package.json
  - src/utils/desktopNotification.ts
  - src/components/settings/NotificationSettingsCard.tsx
  - src/hooks/useDesktopNotification.ts
  - tests/utils/desktopNotification.test.ts
  - tests/components/settings/NotificationSettingsCard.test.tsx
  - tests/hooks/useDesktopNotification.test.ts
autonomous: true
requirements:
  - TAURI-NOTIF-PLUGIN
  - TAURI-NOTIF-CAPABILITY
  - TAURI-NOTIF-DESKTOP-DISPATCH
  - NOTIF-CROSS-PLATFORM-FALLBACK

must_haves:
  truths:
    - "src-tauri/Cargo.toml includes tauri-plugin-notification = '2'."
    - "src-tauri/src/lib.rs registers the notification plugin in the Tauri builder."
    - "src-tauri/capabilities/default.json grants 'notification:default' permission to the main window."
    - "package.json includes @tauri-apps/plugin-notification in dependencies."
    - "src/utils/desktopNotification.ts detects Tauri environment and delegates to @tauri-apps/plugin-notification for native OS banners, while preserving web browser ServiceWorker and window.Notification fallbacks."
    - "NotificationSettingsCard and useDesktopNotification support both native Tauri and web browser permission inspection and dispatch."
  artifacts:
    - path: "src-tauri/Cargo.toml"
      provides: "Rust crate dependency for tauri-plugin-notification"
      contains: "tauri-plugin-notification"
    - path: "src-tauri/src/lib.rs"
      provides: "Tauri builder plugin registration for tauri_plugin_notification"
      contains: "tauri_plugin_notification::init()"
    - path: "src-tauri/capabilities/default.json"
      provides: "Tauri v2 window capabilities granting notification:default"
      contains: "notification:default"
    - path: "package.json"
      provides: "Frontend dependency @tauri-apps/plugin-notification"
      contains: "@tauri-apps/plugin-notification"
    - path: "src/utils/desktopNotification.ts"
      provides: "Unified notification interface with environment detection, permission checks, and native/browser dispatch"
      exports: ["sendDesktopNotification", "isNotificationPermissionGranted", "requestNotificationPermission", "isTauriEnvironment"]
  key_links:
    - from: "src-tauri/capabilities/default.json"
      to: "src-tauri/src/lib.rs"
      via: "Tauri v2 capability system granting notification:default to registered tauri-plugin-notification"
    - from: "src/utils/desktopNotification.ts"
      to: "@tauri-apps/plugin-notification"
      via: "sendNotification, isPermissionGranted, and requestPermission API calls when isTauriEnvironment is true"
    - from: "src/components/settings/NotificationSettingsCard.tsx"
      to: "src/utils/desktopNotification.ts"
      via: "isNotificationPermissionGranted, requestNotificationPermission, and sendDesktopNotification"
    - from: "src/hooks/useDesktopNotification.ts"
      to: "src/utils/desktopNotification.ts"
      via: "sendDesktopNotification and permission verification during startup and interval alert checks"
---

<objective>
Integrate the official Tauri v2 notification plugin (tauri-plugin-notification for Rust, @tauri-apps/plugin-notification for frontend) to enable native OS notifications on macOS and Windows while preserving seamless fallback for the GitHub Pages web PWA.

Purpose: Ensure scheduled reminders, due-soon alerts, overdue tasks, and capacity overload alerts reliably produce native operating system notification banners when running as an installed desktop app on macOS and Windows.
Output: Rust crate configuration, Tauri capability permissions, frontend dependency installation, and updated desktop notification utility, settings card, and hook with unit tests.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@package.json
@src-tauri/Cargo.toml
@src-tauri/src/lib.rs
@src-tauri/capabilities/default.json
@src/utils/desktopNotification.ts
@src/components/settings/NotificationSettingsCard.tsx
@src/hooks/useDesktopNotification.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Configure Tauri native notification plugin and capabilities</name>
  <files>src-tauri/Cargo.toml, src-tauri/src/lib.rs, src-tauri/capabilities/default.json</files>
  <action>
    Configure Tauri v2 native notification plugin on the Rust side:

    1. In src-tauri/Cargo.toml:
       - Add tauri-plugin-notification = "2" under [dependencies].
       - Keep existing dependencies (tauri, serde, serde_json) and metadata intact.

    2. In src-tauri/src/lib.rs:
       - Update run() function to register the notification plugin:
         tauri::Builder::default().plugin(tauri_plugin_notification::init()).run(tauri::generate_context!()).expect("error while running tauri application");

    3. In src-tauri/capabilities/default.json:
       - Add "notification:default" to the "permissions" array alongside "core:default".
       - Ensure JSON remains well-formed and valid according to desktop-schema.
  </action>
  <verify>
    <automated>node -e "const cap = JSON.parse(require('fs').readFileSync('src-tauri/capabilities/default.json', 'utf8')); if (!cap.permissions.includes('notification:default')) throw new Error('missing notification:default'); const cargo = require('fs').readFileSync('src-tauri/Cargo.toml', 'utf8'); if (!cargo.includes('tauri-plugin-notification')) throw new Error('missing cargo dep'); const lib = require('fs').readFileSync('src-tauri/src/lib.rs', 'utf8'); if (!lib.includes('tauri_plugin_notification::init()')) throw new Error('missing plugin init'); console.log('Tauri notification plugin config valid');"</automated>
  </verify>
  <done>
    - src-tauri/Cargo.toml includes tauri-plugin-notification = "2".
    - src-tauri/src/lib.rs initializes tauri_plugin_notification plugin in builder.
    - src-tauri/capabilities/default.json grants "notification:default" permission to main window.
  </done>
</task>

<task type="auto">
  <name>Task 2: Integrate @tauri-apps/plugin-notification with desktopNotification utility, settings card, and hook</name>
  <files>package.json, src/utils/desktopNotification.ts, src/components/settings/NotificationSettingsCard.tsx, src/hooks/useDesktopNotification.ts, tests/utils/desktopNotification.test.ts, tests/components/settings/NotificationSettingsCard.test.tsx, tests/hooks/useDesktopNotification.test.ts</files>
  <action>
    Add frontend notification package and create a unified notification abstraction supporting both desktop Tauri and web browser:

    1. In package.json:
       - Install @tauri-apps/plugin-notification: "^2.2.1" into dependencies via npm.

    2. In src/utils/desktopNotification.ts:
       - Add export function isTauriEnvironment(): boolean checking window.__TAURI_INTERNALS__ !== undefined.
       - Add export async function isNotificationPermissionGranted(): Promise<boolean>:
         - If in Tauri environment: call isPermissionGranted() from @tauri-apps/plugin-notification.
         - Else (web browser): check typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted'.
       - Add export async function requestNotificationPermission(): Promise<boolean>:
         - If in Tauri environment: call requestPermission() from @tauri-apps/plugin-notification, returning true if result === 'granted'.
         - Else (web browser): check window.Notification support, call window.Notification.requestPermission(), returning true if result === 'granted'.
       - Update export async function sendDesktopNotification(payload: DesktopNotificationPayload): Promise<boolean>:
         - If in Tauri environment:
           - Check permission via isNotificationPermissionGranted(). If not granted, return false.
           - Call sendNotification({ title: payload.title, body: payload.body, extra: payload.data as Record<string, unknown> | undefined }).
           - Return true.
         - Else (web browser / PWA fallback):
           - Preserve existing logic: verify window.Notification.permission === 'granted', attempt Service Worker showNotification, and fallback to window.Notification.

    3. In src/components/settings/NotificationSettingsCard.tsx:
       - Use isNotificationPermissionGranted and requestNotificationPermission instead of direct window.Notification references for permission checks.
       - In handleBrowserToggle: check isTauriEnvironment(); if not in Tauri and Notification is not in window, warn unsupported. If permission is denied, set permissionBlocked. If granted, enable and send confirmation notification. If default/prompt, call requestNotificationPermission() and update settings accordingly.
       - In test notification button onClick: check permission via isNotificationPermissionGranted() before sending test notification.

    4. In src/hooks/useDesktopNotification.ts:
       - In checkAndDispatchAlerts: adapt permission check to support Tauri environments seamlessly (using isNotificationPermissionGranted or cached permission state) so notifications trigger in Tauri without requiring window.Notification object.

    5. In test files (tests/utils/desktopNotification.test.ts, tests/components/settings/NotificationSettingsCard.test.tsx, tests/hooks/useDesktopNotification.test.ts):
       - Add unit test coverage for Tauri environment detection, permission checks, and native sendNotification dispatch.
       - Verify mock handling when running in Node/jsdom test runner so all existing tests and new Tauri tests pass cleanly.
  </action>
  <verify>
    <automated>npx vitest run tests/utils/desktopNotification.test.ts tests/components/settings/NotificationSettingsCard.test.tsx tests/hooks/useDesktopNotification.test.ts && npm run build</automated>
  </verify>
  <done>
    - @tauri-apps/plugin-notification is installed in package.json.
    - desktopNotification.ts exports isTauriEnvironment, isNotificationPermissionGranted, requestNotificationPermission, and sendDesktopNotification with dual Tauri/browser support.
    - NotificationSettingsCard.tsx and useDesktopNotification.ts support both native desktop and web browser runtimes.
    - All vitest unit tests pass and npm run build succeeds without TypeScript or bundling errors.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Webview <-> Tauri Notification Plugin | IPC boundary sending notification payloads to the host operating system |
| User Settings <-> Notification Permissions | Storage of notification enablement state in IndexedDB settings table |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-NOTIF-01 | Elevation of Privilege | src-tauri/capabilities/default.json | mitigate | Grant only 'notification:default' permission scope; do not grant broader system dialog or arbitrary command execution |
| T-NOTIF-02 | Information Disclosure | src/utils/desktopNotification.ts | mitigate | Sanitize notification title and body, ensuring sensitive credentials, tokens, and passphrases are never passed into OS notification banners |
| T-NOTIF-03 | Denial of Service | src/hooks/useDesktopNotification.ts | mitigate | Retain notifiedAlertIdsRef deduplication and session-throttled startup summary to prevent notification flood loops |
</threat_model>

<verification>
- Automated check: `node -e "..."` checks `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, and `src-tauri/capabilities/default.json`.
- Automated check: `npx vitest run tests/utils/desktopNotification.test.ts tests/components/settings/NotificationSettingsCard.test.tsx tests/hooks/useDesktopNotification.test.ts` passes.
- Automated check: `npm run build` succeeds without type errors.
</verification>

<success_criteria>
- Native Tauri notification plugin is configured in Rust (Cargo.toml, lib.rs, capabilities/default.json).
- Frontend imports @tauri-apps/plugin-notification and provides unified cross-platform API for permissions and dispatch.
- Settings view and background hooks cleanly operate in both desktop Tauri app and browser PWA.
- All test suites and production build compile cleanly.
</success_criteria>

<output>
Create .planning/quick/260930-uwl-add-tauri-notification-plugin-for-native/SUMMARY.md when done.
</output>
