# Phase 7: PWA Offline Capability & Lifecycle Hardening - Context

**Gathered:** 2026-09-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 7 delivers a fully installable, offline-first Progressive Web App (PWA) running on GitHub Pages subpath `/task-management/`. It integrates `vite-plugin-pwa` with Workbox precaching, implements non-disruptive update prompts that guard against reloading during active database operations or uncommitted forms, provides install triggers with iOS Safari home-screen guidance, automatically requests persistent storage, and guarantees cross-browser resilience across Chrome, Edge, Firefox, and Safari.

Requirements covered: PWA-01, PWA-02, PWA-03, PWA-06 (supporting PWA-04, PWA-05, UX-04).

</domain>

<decisions>
## Implementation Decisions

### Update & Reload Safety (PWA-03)
- **D-01:** Floating Notification Banner:
  - When Service Worker detects a new version (`needRefresh`), display a compact floating banner (bottom or top) with "Cập nhật ngay" and "Để sau" buttons.
  - Banner is non-modal and non-blocking, allowing user to finish current reading or reviewing without interruption.
- **D-02:** Guard Reload Against Active Forms / Writes:
  - When user clicks "Cập nhật ngay", check whether any editing Drawer or Modal (TaskDrawer, AllocationModal, FeasibilityModal, Settings) is open or form is dirty.
  - If a form is open, show an alert warning user to save or cancel their changes before reloading.
  - Only invoke `updateSW(true)` when interface is idle and no editing form is open.
- **D-03:** Periodic SW Update Checks:
  - Check for Service Worker updates on app launch and automatically on tab focus (`visibilitychange` and `focus` events).
  - Avoids aggressive background polling while ensuring long-lived background tabs pick up new deployments when re-activated.
- **D-04:** Collapsed Banner Fallback:
  - If user clicks "Để sau" or closes the update banner, collapse the update prompt into a compact update icon on the Header (adjacent to StatusBadge) with a badge in Settings.
  - Allows user to manually trigger the reload/update at their convenience.

### Install Experience & Guidance (PWA-01, PWA-06)
- **D-05:** Header & Settings Install Triggers:
  - Surface PWA install button/icon in the AppShell Header (next to StatusBadge) and as a status card in Settings.
  - Automatically hidden when the app is already running in standalone display mode (`window.matchMedia('(display-mode: standalone)')`) or after installation.
- **D-06:** iOS Safari Home-Screen Guidance:
  - On iOS Safari (where `beforeinstallprompt` is unavailable), clicking "Cài đặt" opens an instructional modal illustrating the steps: Tap Share button -> Select "Thêm vào màn hình chính" (Add to Home Screen).
- **D-07:** Standardized PWA Icon Assets:
  - Provide standard PNG icon bundle (192x192, 512x512, and 512x512 maskable) along with SVG favicon, using app brand color `#1677ff` and task/calendar motif.
  - Satisfies Lighthouse PWA criteria and ensures crisp rendering on mobile home screens and desktop taskbars.
- **D-08:** Post-Install Feedback:
  - Listen to `appinstalled` event to dispatch an Ant Design message and AriaLiveRegion announcement ("Ứng dụng đã được cài đặt thành công!").
  - Update Settings PWA badge to "Đã cài đặt" and hide the Header install button.

### Offline Feedback & Caching Strategy (PWA-02, UX-04)
- **D-09:** Connectivity Transition Feedback:
  - On transitioning from online to offline, show transient `message.warning` and announce via AriaLiveRegion ("Đang làm việc ngoại tuyến, dữ liệu lưu cục bộ").
  - On transitioning back online, show `message.success` and announce via AriaLiveRegion ("Đã kết nối lại mạng").
  - Existing `StatusBadge` dynamically toggles between "Trực tuyến" (green) and "Ngoại tuyến" (orange).
- **D-10:** Comprehensive Workbox Precaching:
  - Use `vite-plugin-pwa` with Workbox to precache 100% of static build artifacts (HTML, JS, CSS, SVG, icons).
  - External assets (e.g. fonts) use `StaleWhileRevalidate`.
  - Guarantees 100% offline capability on second visit without network dependence.
- **D-11:** Subpath SPA Navigate Fallback:
  - Explicitly configure `navigateFallback: '/task-management/index.html'` matching Vite `base` configuration for GitHub Pages.
  - Prevents 404 errors when reloading or opening deep hash links (`/#/planner`, `/#/tasks`) while offline.
- **D-12:** Settings PWA & Cache Status Card:
  - Add a "Trạng thái PWA & Ngoại tuyến" card in Settings displaying Service Worker status (Hoạt động / Chưa kích hoạt), Offline readiness (Sẵn sàng), and a manual "Kiểm tra bản cập nhật" action.

### Storage Persistence & Cross-Browser Hardening (PWA-06)
- **D-13:** Automatic Persistent Storage Request:
  - On application startup, check `navigator.storage.persisted()`. If false, automatically invoke `navigator.storage.persist()`.
  - Protects IndexedDB database from automated eviction by browsers on low disk space or Safari's 7-day cap.
- **D-14:** Storage Status & Quota Inspection:
  - In Settings > Dữ liệu, display persistent storage status (Bền vững / Tạm thời) and estimated usage/quota via `navigator.storage.estimate()` (e.g. "2.5 MB / 10 GB").
- **D-15:** Non-Intrusive Persistence Fallback Warning:
  - If persistent storage is rejected by the browser (`persist()` returns false), display a gentle advisory note in Settings > Dữ liệu recommending regular JSON backup exports.
  - Do not disrupt the main user interface with intrusive warnings.
- **D-16:** Defensive API Detection:
  - Strictly gate all PWA and storage APIs behind feature detection (`'serviceWorker' in navigator`, `'storage' in navigator`, `beforeinstallprompt`).
  - Ensure graceful degradation so the application functions seamlessly as a standard web app on browsers with restricted PWA features (Firefox, desktop Safari).

### Claude's Discretion
- Exact layout and styling of the floating update banner using Ant Design tokens.
- Specific SVG vector paths for app icons matching the `#1677ff` primary theme.
- Internal hook architecture for PWA prompt and update registration (`usePWA`, `useServiceWorkerUpdate`).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Requirements & Architecture
- `CLAUDE.md` — Core constraints: GitHub Pages subpath `/task-management/`, `vite-plugin-pwa@1.3.0`, Workbox `7.4.1`, `registerType: 'prompt'`, no auto `skipWaiting`.
- `.planning/REQUIREMENTS.md` § PWA and Delivery — PWA-01 (installation), PWA-02 (offline operation), PWA-03 (update reload safety), PWA-04 (subpath scope), PWA-05 (Pages deployment), PWA-06 (cross-browser compatibility), UX-04 (accessible status announcements).
- `.planning/ROADMAP.md` § Phase 7 — Goals, dependencies, and success criteria for Phase 7.

### Prior Phase Implementation Context
- `.planning/phases/01-foundation-deployment-shell/01-CONTEXT.md` — Hash routing pattern and GitHub Pages deployment configuration.
- `.planning/phases/06-safe-local-backup-restore/06-CONTEXT.md` — Settings two-tab structure (`capacity`, `data`) and `AriaLiveRegion` dispatcher.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/hooks/useNetworkStatus.ts`: Native `online`/`offline` window event listener, tracks boolean network status.
- `src/components/shell/StatusBadge.tsx`: Displays connection badge in Header; prime location for collapsed update badge or install icon.
- `src/components/common/AriaLiveRegion.tsx` & `src/utils/ariaLive.ts`: Accessible screen reader notification dispatcher for offline alerts and install completion.
- `src/views/SettingsView.tsx`: Tabbed settings view (`capacity`, `data`) where PWA status card and storage persistence metrics can be mounted.

### Established Patterns
- Ant Design `App` / `message` utilities for transient system notifications.
- Modal / Drawer workflows with stateful open tracking (TaskDrawer, AllocationModal, FeasibilityModal).
- Calendar date handling strictly via `YYYY-MM-DD` strings without timezone drift.

### Integration Points
- `vite.config.ts`: Register `VitePWA` with manifest and Workbox configuration.
- `index.html`: Update manifest link, theme colors, and apple-touch-icon meta tags.
- `src/components/shell/AppShell.tsx`: Host UpdateBanner, InstallButton, and offline transition triggers.
- `src/main.tsx` / `src/App.tsx`: Initialize persistent storage check and Service Worker update listeners.

</code_context>

<specifics>
## Specific Ideas

- Floating update notification banner at bottom right or top of screen with "Cập nhật ngay" and "Để sau" buttons.
- iOS Safari install helper modal showing Share -> Add to Home Screen icons.
- Vietnamese terminology: "Cập nhật ngay", "Để sau", "Trực tuyến", "Ngoại tuyến", "Lưu trữ bền vững", "Cài đặt ứng dụng".

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope.

</deferred>

---

*Phase: 07-PWA Offline Capability & Lifecycle Hardening*
*Context gathered: 2026-09-27*
