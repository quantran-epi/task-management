---
status: complete
phase: 07-pwa-offline-capability-lifecycle-hardening
source:
  - 07-01-SUMMARY.md
  - 07-02-SUMMARY.md
  - 07-03-SUMMARY.md
  - 07-04-SUMMARY.md
started: 2026-09-27T19:30:00Z
updated: 2026-09-27T19:50:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running server/service. Clear ephemeral state (temp DBs, caches, lock files). Start the application from scratch. Server boots without errors, any seed/migration completes, and a primary query (health check, homepage load, or basic API call) returns live data.
result: pass

### 2. PWA Installation UI & Platform Adaptivity
expected: In AppShell header (next to StatusBadge), an "Cài đặt ứng dụng" button appears on supported desktop/mobile browsers. Clicking it triggers the native browser installation prompt, or on iOS Safari opens a modal explaining the "Share -> Add to Home Screen" steps. Once installed or in standalone display mode, the install button automatically hides.
result: pass

### 3. Settings PWA Lifecycle & Storage Durability Cards
expected: Navigating to Settings -> "Sao lưu & Dữ liệu" tab displays two cards - "Trạng thái PWA" (showing Service Worker status, offline readiness, and "Kiểm tra bản cập nhật" button) and "Độ bền lưu trữ dữ liệu" (showing storage mode, quota usage progress bar, and persistence request button).
result: pass

### 4. Network Status Transitions & Offline Resilience
expected: Disconnecting network connectivity (or toggling offline in DevTools) triggers a warning notification and updates StatusBadge to offline. Core views (Tasks, Projects, Capacity, Dashboard, Settings) continue rendering and remain operable offline with IndexedDB. Reconnecting triggers a success notification.
result: pass

### 5. Non-Disruptive Update Banner & Active Form Reload Protection
expected: When a service worker update is detected, a floating UpdateBanner appears with "Cập nhật ngay" and "Để sau" buttons. Dismissing ("Để sau") collapses it into a header button with badge dot. Clicking "Cập nhật ngay" while any drawer or modal is open (e.g. TaskDrawer or ProjectModal) displays the ActiveFormGuardModal warning of uncommitted changes.
result: pass

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
