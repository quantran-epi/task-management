---
phase: 07-pwa-offline-capability-lifecycle-hardening
plan: "04"
subsystem: pwa
tags:
  - pwa
  - serviceworker
  - form-guard
  - install-prompt
  - offline
requires:
  - "07-01"
  - "07-02"
  - "07-03"
provides:
  - pwa-prompt-safety
  - singleton-sw-lifecycle
  - form-guard-modals-drawers
tech-stack:
  added: []
  patterns:
    - singleton service worker context
    - dynamic form guard registration hook
key-files:
  created:
    - src/context/ServiceWorkerContext.tsx
    - tests/hooks/usePWAInstall.test.tsx
  modified:
    - src/hooks/usePWAInstall.ts
    - src/hooks/useServiceWorkerUpdate.ts
    - src/context/FormGuardContext.tsx
    - src/components/shell/AppShell.tsx
    - src/components/settings/PwaStatusCard.tsx
    - src/components/tasks/TaskDrawer.tsx
    - src/components/projects/ProjectModal.tsx
    - src/components/projects/MilestoneModal.tsx
    - src/components/planner/AllocationModal.tsx
    - src/components/planner/CapacitySettingsModal.tsx
    - src/components/planner/FeasibilityModal.tsx
    - tests/components/settings/PwaStatusCard.test.tsx
    - tests/components/pwa/UpdateBanner.test.tsx
decisions:
  - "Wrapped BeforeInstallPromptEvent prompt() in try/catch/finally to unconditionally nullify prompt reference and prevent InvalidStateError on dismissal"
  - "Created ServiceWorkerContext provider as singleton at AppShell root to eliminate duplicate SW registrations and timer leaks"
  - "Added useRegisterActiveForm hook and wired all 6 editing drawers and modals to prevent data loss on update reload"
metrics:
  duration: 8m
  completed_date: "2026-09-27"
---

# Phase 07 Plan 04: PWA Offline Capability & Lifecycle Hardening Gap Closure Summary

Resolved all 3 verification gaps from Phase 07: guarded active forms/drawers against reload data loss, eliminated install prompt dismissal crashes, and unified Service Worker lifecycle into a singleton context.

## Key Changes

### 1. PWA Install Prompt Safe Dismissal & Error Handling (PWA-01, PWA-06)
- Wrapped `installPrompt.prompt()` and `installPrompt.userChoice` inside a `try/catch/finally` block.
- Unconditionally reset `installPrompt` to `null` in the `finally` block to prevent `DOMException: InvalidStateError` when `prompt()` is called multiple times or after dismissal.
- Catches native prompt rejections defensively without unhandled errors crashing UI.
- Added comprehensive unit tests in `tests/hooks/usePWAInstall.test.tsx` verifying dismissal, acceptance, and rejection scenarios.

### 2. Singleton Service Worker Lifecycle & Manual Update Feedback (PWA-02, D-12)
- Created `ServiceWorkerContext` and `ServiceWorkerProvider` at the application root in `AppShell.tsx`.
- Centralized `useRegisterSW`, hourly update polling, focus/visibilitychange listeners, and reload management into `ServiceWorkerContext`, preventing duplicate registrations and memory leaks.
- Updated `useServiceWorkerUpdate` hook to consume the singleton context with graceful fallbacks.
- Corrected `PwaStatusCard`: checks `!hasUpdate && !needRefresh` before announcing "Ứng dụng đang ở phiên bản mới nhất", suppressing misleading success feedback when an update is detected.

### 3. Active Form Reload Guard Across All Editors (PWA-03, D-02)
- Added `useRegisterActiveForm(id, active)` convenience hook in `src/context/FormGuardContext.tsx`.
- Integrated `useRegisterActiveForm` across all 6 application editing drawers and modals:
  - `TaskDrawer`: `useRegisterActiveForm('task-drawer', open)`
  - `ProjectModal`: `useRegisterActiveForm('project-modal', open)`
  - `MilestoneModal`: `useRegisterActiveForm('milestone-modal', open)`
  - `AllocationModal`: `useRegisterActiveForm('allocation-modal', open)`
  - `CapacitySettingsModal`: `useRegisterActiveForm('capacity-settings-modal', open)`
  - `FeasibilityModal`: `useRegisterActiveForm('feasibility-modal', open)`
- Expanded `tests/components/pwa/UpdateBanner.test.tsx` with dynamic tests ensuring `UpdateBanner` activates `ActiveFormGuardModal` whenever any editor is open.

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

1. Created files exist:
   - `src/context/ServiceWorkerContext.tsx`: FOUND
   - `tests/hooks/usePWAInstall.test.tsx`: FOUND
2. Commits exist:
   - `f7900ce`: FOUND
   - `9af91d4`: FOUND
   - `ff9f60d`: FOUND
3. Test suite: 52 files passed (318 tests passed), 0 failures.
4. Production build: `tsc && vite build` succeeded cleanly.
