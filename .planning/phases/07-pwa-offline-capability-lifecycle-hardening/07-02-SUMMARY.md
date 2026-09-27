---
phase: 07-pwa-offline-capability-lifecycle-hardening
plan: 02
subsystem: pwa
tags:
  - pwa
  - service-worker
  - update-prompt
  - form-guard
  - offline-resilience
dependency_graph:
  requires:
    - 07-01
  provides:
    - PWA-02
    - PWA-03
  affects:
    - AppShell
    - FormGuardContext
tech_stack:
  added: []
  patterns:
    - active-form tracking via Set registry
    - periodic & focus-based SW update polling
    - non-blocking floating alert banner
    - destructive reload confirmation guard
    - accessible aria-live status transitions
key_files:
  created:
    - src/context/FormGuardContext.tsx
    - src/hooks/useServiceWorkerUpdate.ts
    - src/components/pwa/UpdateBanner.tsx
    - src/components/pwa/ActiveFormGuardModal.tsx
    - tests/hooks/useNetworkStatus.test.tsx
    - tests/components/pwa/UpdateBanner.test.tsx
  modified:
    - src/hooks/useNetworkStatus.ts
    - src/components/shell/AppShell.tsx
decisions:
  - "Provided FormGuardContext to track active editing sessions across drawers and modals to prevent data loss on reload"
  - "Implemented useServiceWorkerUpdate with window focus and tab visibility polling for background tab updates"
  - "Wrapped UpdateBanner reload trigger in hasActiveForm guard displaying ActiveFormGuardModal when edits are pending"
  - "Collapsed dismissed update banner into header operational action button with primary accent badge dot"
  - "Dispatched Ant Design message alerts and screen reader announcements upon network online/offline transitions"
metrics:
  duration: 12m
  completed_date: "2026-09-27"
---

# Phase 07 Plan 02: PWA Offline Capability & Lifecycle Hardening Summary

Implemented active form tracking (`FormGuardContext`), periodic focus-based update polling (`useServiceWorkerUpdate`), non-disruptive floating `UpdateBanner`, reload data-loss guard (`ActiveFormGuardModal`), collapsed header badge, and accessible network status transitions.

## Overview

1. **Active Form Tracking Context**: Created `FormGuardContext` maintaining a dynamic `Set<string>` of active editing sessions (drawers/modals). Exposes `registerActiveForm(id)` with cleanup and `hasActiveForm` boolean.
2. **Service Worker Lifecycle Hook**: Created `useServiceWorkerUpdate` connecting to `virtual:pwa-register/react`. Automatically polls for updates on window `focus` and tab `visibilitychange` (when document becomes visible and device is online).
3. **Floating Update Banner & Reload Protection**: Implemented `UpdateBanner` floating bottom-right on desktop and docked bottom on mobile. Clicking "Cập nhật ngay" inspects `hasActiveForm`. If an active form is registered, prompts with `ActiveFormGuardModal` warning of data loss before confirming `reloadApp(true)`. Dismissing with "Để sau" collapses notification into a header badge trigger with dot indicator.
4. **Accessible Network Feedback**: Updated `useNetworkStatus` to trigger `message.warning` / `announceToScreenReader` on transitioning offline, and `message.success` / `announceToScreenReader` on reconnecting online.

## Key Changes

- **src/context/FormGuardContext.tsx**: React context provider and `useFormGuard` hook tracking active editing form registrations.
- **src/hooks/useServiceWorkerUpdate.ts**: Hook orchestrating SW update checks on visibility/focus and triggering reload execution.
- **src/hooks/useNetworkStatus.ts**: Emits user-facing toasts and accessible screen reader text on online/offline state changes.
- **src/components/pwa/ActiveFormGuardModal.tsx**: Ant Design modal with primary default cancel button and danger confirm button for reload override.
- **src/components/pwa/UpdateBanner.tsx**: Floating non-modal card with role `alert` and polite aria-live presentation.
- **src/components/shell/AppShell.tsx**: Wrapped shell with `FormGuardProvider`, mounted `UpdateBanner`, and added collapsed header update icon button.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Unused variable checkUpdate in AppShell**
- **Found during:** Task 2 build verification (`npm run build`)
- **Issue:** TypeScript error TS6133: `checkUpdate` was extracted from `useServiceWorkerUpdate` but not used in `AppShellInner`.
- **Fix:** Removed `checkUpdate` from destructuring assignment.
- **Files modified:** `src/components/shell/AppShell.tsx`
- **Commit:** `c6ebbed`

## Self-Check: PASSED

- FOUND: `src/context/FormGuardContext.tsx`
- FOUND: `src/hooks/useServiceWorkerUpdate.ts`
- FOUND: `src/components/pwa/UpdateBanner.tsx`
- FOUND: `src/components/pwa/ActiveFormGuardModal.tsx`
- FOUND: `src/hooks/useNetworkStatus.ts`
- FOUND: `src/components/shell/AppShell.tsx`
- FOUND: `tests/hooks/useNetworkStatus.test.tsx`
- FOUND: `tests/components/pwa/UpdateBanner.test.tsx`
- FOUND: Commit `543da4b` (Task 1)
- FOUND: Commit `c6ebbed` (Task 2)
