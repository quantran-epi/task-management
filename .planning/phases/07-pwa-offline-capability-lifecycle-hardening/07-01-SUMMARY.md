---
phase: 07-pwa-offline-capability-lifecycle-hardening
plan: 01
subsystem: pwa
tags:
  - pwa
  - service-worker
  - vite-plugin-pwa
  - manifest
  - install-prompt
dependency_graph:
  requires: []
  provides:
    - PWA-01
    - PWA-06
  affects:
    - AppShell
    - Header
tech_stack:
  added:
    - vite-plugin-pwa@^1.3.0
    - workbox-window@^7.4.1
  patterns:
    - prompt-driven SW registration
    - beforeinstallprompt capture
    - iOS Safari fallback guidance
    - exactOptionalPropertyTypes conformance
key_files:
  created:
    - public/favicon.svg
    - public/pwa-192x192.png
    - public/pwa-512x512.png
    - public/pwa-512x512-maskable.png
    - src/types/virtual-pwa.d.ts
    - src/hooks/usePWAInstall.ts
    - src/components/pwa/InstallButton.tsx
    - src/components/pwa/IosInstallModal.tsx
    - tests/mocks/pwaRegister.ts
    - tests/components/pwa/InstallButton.test.tsx
    - tests/components/pwa/IosInstallModal.test.tsx
  modified:
    - package.json
    - package-lock.json
    - vite.config.ts
    - index.html
    - src/components/shell/AppShell.tsx
decisions:
  - "Configured VitePWA with registerType: 'prompt' to prevent unprompted auto-skipWaiting during active writes"
  - "Set navigateFallback to /task-management/index.html to prevent 404s on deep hash navigation in GitHub Pages"
  - "Provided dedicated IosInstallModal with visual step guidance for iOS Safari where beforeinstallprompt is unsupported"
  - "Handled exactOptionalPropertyTypes on InstallButton className prop to avoid undefined assignment error"
metrics:
  duration: 10m
  completed_date: "2026-09-27"
---

# Phase 07 Plan 01: PWA Configuration & Client Installation Architecture Summary

Configured VitePWA plugin with prompt registration, GitHub Pages subpath manifest, icon bundle, `usePWAInstall` hook, `InstallButton`, and `IosInstallModal` integrated into `AppShell`.

## Overview

1. **VitePWA Build Integration**: Added `vite-plugin-pwa` and `workbox-window` dev dependencies. Configured `registerType: 'prompt'`, `navigateFallback: '/task-management/index.html'`, `cleanupOutdatedCaches: true`, and complete manifest targeting `/task-management/` GitHub Pages subpath.
2. **App Assets & Ambient Declarations**: Created `#1677ff` task clipboard brand icon `public/favicon.svg` and generated matching 192x192, 512x512, and 512x512 maskable PNG icons. Registered `virtual:pwa-register/react` ambient TypeScript types and test mock helper.
3. **PWA Installation Flow**: Implemented `usePWAInstall` hook capturing `beforeinstallprompt`, detecting standalone display mode and iOS platforms, and listening for `appinstalled` feedback. Created `IosInstallModal` with numbered steps for Safari Add to Home Screen. Created `InstallButton` supporting header and settings modes, mounted in `AppShell` header.

## Key Changes

- **vite.config.ts & index.html**: Injected VitePWA plugin with prompt registration and complete manifest metadata. Updated HTML meta theme color and apple-touch-icon links.
- **src/hooks/usePWAInstall.ts**: Event-driven hook tracking beforeinstallprompt event, standalone display mode (`window.matchMedia('(display-mode: standalone)')` and `navigator.standalone`), iOS platform detection, and `appinstalled` notifications.
- **src/components/pwa/IosInstallModal.tsx**: Ant Design centered modal with step-by-step instructions for manual iOS Safari installation.
- **src/components/pwa/InstallButton.tsx**: Adaptive install button hidden in standalone mode or post-install, opening native install prompt or iOS modal.
- **src/components/shell/AppShell.tsx**: Mounted `InstallButton` inside Header Space next to `StatusBadge`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Conformance with exactOptionalPropertyTypes on InstallButton className**
- **Found during:** Task 2 build verification (`tsc`)
- **Issue:** TypeScript error TS2375: `exactOptionalPropertyTypes: true` prohibits passing `{ className: undefined }` when prop is optional.
- **Fix:** Conditionally assigned `buttonProps.className` only when `className !== undefined`.
- **Files modified:** `src/components/pwa/InstallButton.tsx`
- **Commit:** `73b2672`

## Self-Check: PASSED

- FOUND: `vite.config.ts`
- FOUND: `public/favicon.svg`
- FOUND: `public/pwa-192x192.png`
- FOUND: `public/pwa-512x512.png`
- FOUND: `public/pwa-512x512-maskable.png`
- FOUND: `src/types/virtual-pwa.d.ts`
- FOUND: `src/hooks/usePWAInstall.ts`
- FOUND: `src/components/pwa/InstallButton.tsx`
- FOUND: `src/components/pwa/IosInstallModal.tsx`
- FOUND: `tests/mocks/pwaRegister.ts`
- FOUND: `tests/components/pwa/InstallButton.test.tsx`
- FOUND: `tests/components/pwa/IosInstallModal.test.tsx`
- FOUND: Commit `b0826ca` (Task 1)
- FOUND: Commit `73b2672` (Task 2)
