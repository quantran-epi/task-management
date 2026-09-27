---
phase: 07-pwa-offline-capability-lifecycle-hardening
verified: 2026-09-27T19:50:00Z
status: passed
score: 14/14 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 11/14
  gaps_closed:
    - "Clicking update guards against active open editing drawers or modals, preventing reload data loss per D-02 and PWA-03 (closed in 07-04)"
    - "User can install application directly to desktop or mobile home screen via browser PWA prompts per PWA-01 without InvalidStateError on dismissal (closed in 07-04)"
    - "Settings displays PWA service worker status and provides manual update check button without duplicate lifecycle listeners or false positive toasts (closed in 07-04)"
  gaps_remaining: []
  regressions: []
    status: partial
    reason: "useServiceWorkerUpdate is invoked independently in both AppShell and PwaStatusCard, instantiating duplicate useRegisterSW listeners and leaking an un-cleared interval. Furthermore, PwaStatusCard's handleCheckUpdate unconditionally shows a success message claiming the app is up-to-date even when an update was detected and UpdateBanner is displayed."
    artifacts:
      - path: "src/components/settings/PwaStatusCard.tsx"
        issue: "Independent useServiceWorkerUpdate call duplicates SW lifecycle and shows premature up-to-date toast"
      - path: "src/hooks/useServiceWorkerUpdate.ts"
        issue: "useRegisterSW hook used across multiple components instead of shared context or lifted state"
    missing:
      - "Share service worker update state between AppShell and PwaStatusCard (via context or props)"
      - "Conditionalize update check feedback so 'Ứng dụng đang ở phiên bản mới nhất' is only shown when needRefresh remains false"
human_verification:
  - test: "PWA Native Installation Dialog (Chromium / Edge)"
    expected: "Clicking 'Cài đặt' in header triggers native browser beforeinstallprompt dialog; accepting installs app as standalone PWA and hides install button"
    why_human: "Native browser install prompt dialog and OS window standalone mode transitions require real browser environment"
  - test: "iOS Safari Add to Home Screen Guidance"
    expected: "Visiting app on iOS Safari displays 'Cài đặt' button which opens IosInstallModal with 3 visual numbered steps"
    why_human: "User agent sniffing and touch capabilities require physical or simulated iOS Safari device"
  - test: "Offline Reload and Core View Navigation"
    expected: "Turning off network connection in browser DevTools and reloading the page loads application shell, tasks, projects, planner, and settings completely from Service Worker cache"
    why_human: "Service worker cache interception and offline reload behavior require real browser Service Worker runtime"
---

# Phase 07: PWA Offline Capability & Lifecycle Hardening Verification Report

**Phase Goal:** Make application fully installable and operational offline with non-disruptive update prompts and cross-browser support  
**Verified:** 2026-09-27T19:00:00Z  
**Status:** gaps_found  
**Re-verification:** No — initial verification  

## Goal Achievement

### Observable Truths

| #   | Truth   | Status     | Evidence       |
| --- | ------- | ---------- | -------------- |
| 1   | User can install application directly to desktop or mobile home screen via browser PWA prompts per PWA-01 | ⚠️ PARTIAL | `InstallButton.tsx` and `usePWAInstall.ts` capture `beforeinstallprompt`. However, dismissing the prompt retains the consumed event in state; clicking 'Cài đặt' a second time triggers an unhandled `DOMException: InvalidStateError` crash. |
| 2   | User on iOS Safari receives step-by-step home-screen installation instructions modal per D-06 and PWA-01 | ✓ VERIFIED | `IosInstallModal.tsx` provides 3 numbered steps with custom icons (`ShareAltOutlined`, `PlusSquareOutlined`). Triggered from `InstallButton` when `isIos === true`. |
| 3   | Install button disappears automatically when application runs in standalone mode or after successful install per D-05 and D-08 | ✓ VERIFIED | `InstallButton.tsx` returns `null` when `isStandalone \|\| isInstalled`. `usePWAInstall` tracks `display-mode: standalone`, `navigator.standalone`, and `appinstalled` event. |
| 4   | Application bundle includes compliant web app manifest with brand colors and required 192px/512px icon assets per D-07 | ✓ VERIFIED | `vite.config.ts` configures `VitePWA` manifest with `start_url: '/task-management/'`, `scope: '/task-management/'`, `theme_color: '#1677ff'`. Verified generated `dist/manifest.webmanifest` and icon files in `public/` (192x192, 512x512, 512x512 maskable). |
| 5   | User receives non-disruptive floating update banner when new service worker version is detected per D-01 and PWA-03 | ✓ VERIFIED | `UpdateBanner.tsx` floats bottom-right on desktop (docked on mobile) when `needRefresh === true`, rendering 'Cập nhật ngay' and 'Để sau' buttons. |
| 6   | Clicking update guards against active open editing drawers or modals, preventing reload data loss per D-02 and PWA-03 | ✗ FAILED | `FormGuardContext` and `ActiveFormGuardModal` exist, but `registerActiveForm` is never invoked by any form, drawer, or modal in `src/`. `hasActiveForm` is permanently `false` at runtime. Clicking 'Cập nhật ngay' during active edits immediately reloads without warning, destroying uncommitted data. |
| 7   | User can dismiss update banner with 'Để sau', collapsing into a header update badge indicator per D-04 | ✓ VERIFIED | `AppShell.tsx` maintains `bannerDismissed` state. Dismissing collapses banner into header `CloudDownloadOutlined` icon button with `#1677ff` badge dot. Clicking re-opens banner. |
| 8   | Network transition between online and offline displays status toasts and screen reader announcements per D-09 and PWA-02 | ✓ VERIFIED | `useNetworkStatus.ts` emits `message.warning` and polite aria-live announcement when going offline, and `message.success` when reconnecting online. |
| 9   | Application automatically checks for service worker updates on window focus and tab visibility change per D-03 | ✓ VERIFIED | `useServiceWorkerUpdate.ts` attaches `focus` and `visibilitychange` listeners checking `registration.update()` when online. |
| 10  | Application automatically requests persistent storage on boot to protect IndexedDB from eviction per D-13 and PWA-06 | ✓ VERIFIED | `App.tsx` calls `checkAndRequestStoragePersistence()` in `useEffect` on startup alongside database default initialization. |
| 11  | Settings > Dữ liệu displays persistent storage status (Bền vững / Tạm thời) and estimated usage/quota progress per D-14 | ✓ VERIFIED | `StoragePersistenceCard.tsx` renders durability mode tag, usage/quota text via `formatBytes`, and an Ant Design `Progress` bar. |
| 12  | Temporary storage mode presents gentle non-intrusive advisory alert recommending JSON backups per D-15 | ✓ VERIFIED | `StoragePersistenceCard.tsx` renders warning `Alert` with recommendation to export JSON backups when `!isPersisted`, plus manual request button. |
| 13  | Settings displays PWA service worker status and provides manual update check button per D-12 and PWA-02 | ⚠️ PARTIAL | `PwaStatusCard.tsx` displays Service Worker, offline readiness, and install status tags. However, calling `useServiceWorkerUpdate` creates duplicate registrations, and `handleCheckUpdate` shows a premature up-to-date success toast even when an update was detected. |
| 14  | Storage and Service Worker operations degrade gracefully across Chrome, Edge, Firefox, and Safari per D-16 and PWA-06 | ✓ VERIFIED | Defensive checks (`'storage' in navigator`, `'serviceWorker' in navigator`, `window.matchMedia`) present throughout all services and hooks with graceful fallbacks. |

**Score:** 11/14 truths verified (2 partial, 1 failed)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `vite.config.ts` | VitePWA plugin integration with prompt update type and GitHub Pages subpath manifest | ✓ VERIFIED | `registerType: 'prompt'`, `navigateFallback: '/task-management/index.html'`, `cleanupOutdatedCaches: true`, manifest configured. |
| `src/types/virtual-pwa.d.ts` | Ambient TypeScript declarations for `virtual:pwa-register/react` | ✓ VERIFIED | Declares `useRegisterSW` and `RegisterSWOptions`. Compiles with `tsc --noEmit`. |
| `src/hooks/usePWAInstall.ts` | Hook tracking `beforeinstallprompt`, standalone mode, and iOS platform | ⚠️ PARTIAL | Captures events, but fails to reset `installPrompt` on dismissal and lacks error boundary around `prompt()`. |
| `src/components/pwa/InstallButton.tsx` | PWA install button for Header and Settings with iOS guidance trigger | ✓ VERIFIED | Substantive, wired to Header and Settings, handles standalone hiding and iOS modal trigger. |
| `src/components/pwa/IosInstallModal.tsx` | Instructional modal for manual iOS Safari Add to Home Screen flow | ✓ VERIFIED | Substantive Ant Design modal with 3 step instructions and brand icons. |
| `src/context/FormGuardContext.tsx` | Context provider tracking active editing drawers and modals | ⚠️ ORPHANED / UNWIRED | Provider and hook implemented, but NO forms in `src/` call `registerActiveForm`. Registry is permanently empty at runtime. |
| `src/hooks/useServiceWorkerUpdate.ts` | Hook managing SW registration, periodic/focus update checks, reload dispatch | ⚠️ PARTIAL | Correct logic, but instantiating multiple instances in `AppShell` and `PwaStatusCard` causes duplicate registrations and interval leak. |
| `src/components/pwa/UpdateBanner.tsx` | Non-blocking floating notification banner offering immediate update or deferral | ✓ VERIFIED | Floating card with polite `alert` semantics, 'Cập nhật ngay', and 'Để sau' actions. |
| `src/components/pwa/ActiveFormGuardModal.tsx` | Confirmation dialog preventing uncommitted data loss when reloading during active form edits | ✓ VERIFIED | Modal with primary cancel button and danger confirm button for reload override. |
| `src/services/storage/storagePersistence.ts` | StorageManager API service requesting persistence and inspecting quota metrics defensively | ✓ VERIFIED | `checkAndRequestStoragePersistence`, `getStorageQuotaEstimate`, `formatBytes` with full feature detection. |
| `src/hooks/useStoragePersistence.ts` | React hook providing storage persistence state, quota metrics, and manual request callback | ✓ VERIFIED | Exposes state, screen reader announcements, and refresh callback. |
| `src/components/settings/PwaStatusCard.tsx` | Settings card showing service worker status, offline readiness, install status, and manual update check | ✓ VERIFIED | Mounted in `SettingsView`, renders descriptions and actions. |
| `src/components/settings/StoragePersistenceCard.tsx` | Settings card displaying storage durability mode, quota progress, advisory warning, and request CTA | ✓ VERIFIED | Mounted in `SettingsView`, renders mode tag, progress bar, advisory alert, and request button. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| `src/components/shell/AppShell.tsx` | `src/components/pwa/InstallButton.tsx` | Header operational action group | ✓ WIRED | Mounted in Header Space next to `StatusBadge`. |
| `src/components/pwa/InstallButton.tsx` | `src/components/pwa/IosInstallModal.tsx` | iOS guidance modal open state | ✓ WIRED | Opens modal on click when `isIos === true`. |
| `src/components/shell/AppShell.tsx` | `src/components/pwa/UpdateBanner.tsx` | Root shell layout mounting | ✓ WIRED | Rendered at root layout with `needRefresh={showBanner}`. |
| `src/components/pwa/UpdateBanner.tsx` | `src/context/FormGuardContext.tsx` | `hasActiveForm` guard check before reload | ⚠️ NOT_WIRED | Reads `hasActiveForm`, but no forms/drawers in the codebase ever register themselves. Always `false`. |
| `src/components/pwa/UpdateBanner.tsx` | `src/components/pwa/ActiveFormGuardModal.tsx` | Data loss warning dialog trigger | ✓ WIRED | Renders modal when `guardModalOpen === true`. |
| `src/App.tsx` | `src/services/storage/storagePersistence.ts` | Application boot persistence request | ✓ WIRED | Called in `useEffect` on initial mount. |
| `src/views/SettingsView.tsx` | `src/components/settings/PwaStatusCard.tsx` | Data tab card stack | ✓ WIRED | Rendered under `key: 'data'` tab. |
| `src/views/SettingsView.tsx` | `src/components/settings/StoragePersistenceCard.tsx` | Data tab card stack | ✓ WIRED | Rendered under `key: 'data'` tab. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `FormGuardContext.tsx` | `activeFormIds` | `registerActiveForm(id)` calls | No — 0 forms in `src/` call `registerActiveForm` | ✗ DISCONNECTED (Always empty `Set` at runtime) |
| `StoragePersistenceCard.tsx` | `quotaBytes`, `usageBytes`, `isPersisted` | `navigator.storage.estimate()`, `persisted()` | Yes — native browser StorageManager API | ✓ FLOWING |
| `PwaStatusCard.tsx` | `hasServiceWorker`, `installed` | `'serviceWorker' in navigator`, `isStandalone \|\| isInstalled` | Yes — browser environment check | ✓ FLOWING |
| `UpdateBanner.tsx` | `needRefresh` | `useRegisterSW` (`needRefresh` tuple) | Yes — Workbox SW lifecycle | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Vite PWA build produces service worker and manifest | `npm run build` | `dist/sw.js`, `dist/manifest.webmanifest`, `dist/workbox-2fbc6a65.js` created (12 precached entries) | ✓ PASS |
| Test suite executes with zero regressions | `npm test` | 51 test files passed, 305 tests passed | ✓ PASS |
| PWA icons exist in public directory | `ls -la public/pwa*` | 192x192, 512x512, and 512x512-maskable PNGs present with valid file sizes | ✓ PASS |
| TypeScript strict typechecking passes | `npx tsc --noEmit` | Exit code 0 | ✓ PASS |

### Probe Execution

No probe scripts specified in Phase 7 plan. Step 7c skipped.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| PWA-01 | 07-01 | User can install application directly to desktop or mobile home screen via browser PWA prompts | ⚠️ PARTIAL | Manifest, icons, install button, and iOS modal implemented. However, `usePWAInstall` crashes on second click if prompt was dismissed due to retained consumed event. |
| PWA-02 | 07-02, 07-03 | User can open and use previously loaded core features without a network connection | ✓ SATISFIED | VitePWA precaches 100% build assets, `navigateFallback: '/task-management/index.html'` prevents 404s, Dexie runs offline, online/offline toasts announce status. |
| PWA-03 | 07-02 | Application prompts before activating an update that requires reload and avoids interrupting pending data writes | ✗ BLOCKED | `UpdateBanner` prompts before reload, but reload guard is disconnected from all forms. Active edits are lost on reload without warning. |
| PWA-06 | 07-01, 07-03 | Current Chrome, Edge, Firefox, and Safari can use core task, planning, dashboard, and backup features; install behavior follows browser capabilities | ✓ SATISFIED | Defensive checks across `navigator.storage`, `navigator.serviceWorker`, `window.matchMedia`; automatic boot persistence; empty states on unsupported environments. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `src/context/FormGuardContext.tsx` | 18 | `registerActiveForm` uncalled by application | 🛑 Blocker | Fake protection: no active forms register, `hasActiveForm` is permanently false, updates reload during active user edits destroying uncommitted work. |
| `src/hooks/usePWAInstall.ts` | 86-95 | Retains consumed `BeforeInstallPromptEvent` on dismissal | 🛑 Blocker | Unhandled `DOMException: InvalidStateError` crashes when user clicks 'Cài đặt' again after dismissing native prompt. |
| `src/components/settings/PwaStatusCard.tsx` | 13 | Duplicate `useServiceWorkerUpdate` call | ⚠️ Warning | Creates duplicate SW event listeners and un-cleared interval leak. |
| `src/components/settings/PwaStatusCard.tsx` | 30 | Unconditional up-to-date success toast | ⚠️ Warning | Shows 'Ứng dụng đang ở phiên bản mới nhất' even when `needRefresh` is true and `UpdateBanner` is visible. |

### Human Verification Required

### 1. PWA Native Installation Dialog (Chromium / Edge)

**Test:** In Chrome or Edge, click 'Cài đặt' in the header.  
**Expected:** Browser opens native installation prompt dialog. Accepting installs app to desktop and hides the 'Cài đặt' button. Dismissing keeps app running.  
**Why human:** Native OS application window lifecycle and browser install dialogs cannot be simulated in jsdom.  

### 2. iOS Safari Add to Home Screen Guidance

**Test:** Open application on iPhone Safari, tap 'Cài đặt' in header or Settings.  
**Expected:** `IosInstallModal` opens with 3 numbered steps explaining Share -> Add to Home Screen.  
**Why human:** iOS Safari does not support `beforeinstallprompt`; visual verification of instructions requires iOS device or simulator.  

### 3. Service Worker Precache Offline Reload

**Test:** Open Chrome DevTools, set Network to Offline, reload page on `/#/planner` and `/#/tasks`.  
**Expected:** Application loads instantly from cache with full functionality; `StatusBadge` shows orange 'Ngoại tuyến'; warning toast announces offline status.  
**Why human:** Browser Service Worker cache interception and HTTP offline navigation requires real browser runtime.  

### Gaps Summary

Phase 7 delivered the vast majority of PWA infrastructure: manifest configuration, brand icons, prompt-driven update lifecycle, online/offline feedback, and automated storage persistence.

However, two critical issues block full goal achievement:
1. **Unwired Form Reload Guard (PWA-03):** `FormGuardContext` and `ActiveFormGuardModal` were created, but `registerActiveForm` is never connected to any actual form (`TaskDrawer`, `ProjectModal`, `MilestoneModal`, `AllocationModal`, `WeeklyCapacityForm`). In real app usage, `hasActiveForm` is permanently false. Update reloads will silently wipe active user edits without warning.
2. **Consumed Install Prompt Crash (PWA-01):** `usePWAInstall` retains the consumed `BeforeInstallPromptEvent` when the user dismisses the native prompt. Clicking "Cài đặt" a second time triggers an unhandled `DOMException: InvalidStateError` crash.

---

_Verified: 2026-09-27T19:00:00Z_  
_Verifier: Claude (gsd-verifier)_
