---
phase: quick
plan: 261005-taw
type: execute
wave: 1
depends_on: []
files_modified:
  - vite.config.ts
  - src/context/ServiceWorkerContext.tsx
  - tests/context/ServiceWorkerContext.test.tsx
autonomous: true
requirements:
  - TAURI-DISABLE-SERVICE-WORKER
  - TAURI-AUTO-UNREGISTER-STALE-SW

estimate:
  tokens: 15000
  raw_tokens: 10000
  tasks: 1
  confidence: high

must_haves:
  truths:
    - "Vite build with TAURI_ENV_PLATFORM or TAURI_PLATFORM set disables PWA service worker generation"
    - "Running inside Tauri automatically unregisters any lingering service workers and clears old caches"
    - "ServiceWorkerContext checkUpdate, hourly interval, and visibility checks do not run in Tauri"
    - "Web/PWA build retains full VitePWA service worker generation and update checking"
  artifacts:
    - vite.config.ts
    - src/context/ServiceWorkerContext.tsx
    - tests/context/ServiceWorkerContext.test.tsx
  key_links:
    - "VitePWA disable: isTauri in vite.config.ts"
    - "isTauriApp check in src/context/ServiceWorkerContext.tsx"
---

<objective>
Disable service worker in Tauri builds and automatically unregister any stale service workers in the Tauri desktop runtime.

Purpose: Prevent WebView2 from intercepting requests with stale cached code from older app installs and eliminate `TypeError: Failed to update a ServiceWorker` in Tauri desktop apps.
Output: Configured `vite.config.ts` and updated `ServiceWorkerContext.tsx` with targeted unit tests.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@vite.config.ts
@src/context/ServiceWorkerContext.tsx
@src/utils/timerPopout.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Disable VitePWA for Tauri and auto-unregister stale SW in ServiceWorkerContext</name>
  <files>vite.config.ts, src/context/ServiceWorkerContext.tsx, tests/context/ServiceWorkerContext.test.tsx</files>
  <action>
    1. In `vite.config.ts`:
       - Add `disable: isTauri` to `VitePWA` options so that when building for Tauri desktop, service worker generation and manifest injection are disabled, while preserving `virtual:pwa-register/react` module resolution.
    2. In `src/context/ServiceWorkerContext.tsx`:
       - Import `isTauriApp` from `../utils/timerPopout`.
       - On mount, if `isTauriApp()` is true:
         - Query `navigator.serviceWorker.getRegistrations()` and call `reg.unregister()` on all registrations.
         - Clear all keys in `window.caches` to wipe any cached `index.html` or assets from previous desktop versions.
       - In `checkUpdate`:
         - If `isTauriApp()` is true, return `false` immediately without calling `reg.update()`.
       - In update interval and focus/visibility listeners:
         - Skip attaching or firing SW update checks when `isTauriApp()` is true.
       - In `reloadApp`:
         - If `isTauriApp()` is true, simply call `window.location.reload()`.
    3. In `tests/context/ServiceWorkerContext.test.tsx`:
       - Add unit test verifying that in Tauri environment (`isTauriApp() === true`):
         - `navigator.serviceWorker.getRegistrations` is called and unregisters any existing SWs.
         - `caches.delete` is invoked for existing caches.
         - `checkUpdate` returns `false` without error.
         - Normal web environment remains functioning.
  </action>
  <verify>
    Run `npm test -- tests/context/ServiceWorkerContext.test.tsx` and verify clean build with `TAURI_ENV_PLATFORM=windows npm run build`.
  </verify>
</task>

</tasks>
