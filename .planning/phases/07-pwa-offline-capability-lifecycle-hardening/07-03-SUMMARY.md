---
phase: 07-pwa-offline-capability-lifecycle-hardening
plan: 03
subsystem: pwa
tags:
  - pwa
  - storage-persistence
  - indexeddb
  - storage-quota
  - settings
dependency_graph:
  requires:
    - 07-02
  provides:
    - PWA-02
    - PWA-06
  affects:
    - App
    - SettingsView
tech_stack:
  added: []
  patterns:
    - StorageManager API defensive detection
    - automatic startup persistence request
    - storage quota formatting and progress tracking
    - non-intrusive advisory warning for unpersisted storage
key_files:
  created:
    - src/services/storage/storagePersistence.ts
    - src/hooks/useStoragePersistence.ts
    - src/components/settings/PwaStatusCard.tsx
    - src/components/settings/StoragePersistenceCard.tsx
    - tests/components/settings/PwaStatusCard.test.tsx
    - tests/components/settings/StoragePersistenceCard.test.tsx
  modified:
    - src/App.tsx
    - src/views/SettingsView.tsx
decisions:
  - "Requested storage persistence automatically on app boot alongside database seed initialization"
  - "Gated StorageManager APIs defensively behind feature detection with empty state fallback for private/legacy browsers"
  - "Displayed storage mode, quota progress, and safe advisory alert recommending JSON backups when unpersisted"
  - "Surfaced PWA lifecycle status and manual update check trigger in Settings data tab"
metrics:
  duration: 8m
  completed_date: "2026-09-27"
---

# Phase 07 Plan 03: PWA Storage Persistence & Settings Status Summary

Hardened local storage durability with automated boot persistence (`navigator.storage.persist()`), quota inspection hook, and settings status cards for PWA lifecycle and IndexedDB durability.

## Overview

1. **Storage Persistence Service & Hook**: Created `src/services/storage/storagePersistence.ts` and `src/hooks/useStoragePersistence.ts`. Strictly feature-detects `navigator.storage`, checks `persisted()`, requests `persist()`, and calculates `estimate()` quota metrics defensively.
2. **App Boot Integration**: Updated `src/App.tsx` to automatically invoke `checkAndRequestStoragePersistence().catch(...)` at startup alongside default database seeding per D-13.
3. **PWA Status Card**: Created `PwaStatusCard.tsx` displaying Service Worker state ("Hoạt động" / "Chưa hỗ trợ"), Offline readiness ("Sẵn sàng"), Installation status ("Đã cài đặt PWA" / "Chưa cài đặt"), and a manual "Kiểm tra bản cập nhật" trigger calling `checkUpdate()` with network guards and user feedback.
4. **Storage Durability Card**: Created `StoragePersistenceCard.tsx` displaying storage mode ("Bền vững" / "Tạm thời"), quota usage progress bar, safe advisory alert recommending periodic JSON backups when unpersisted, and a manual "Yêu cầu lưu trữ bền vững" CTA button. Gracefully shows an empty state when StorageManager is unsupported.
5. **Settings Integration**: Mounted `PwaStatusCard` and `StoragePersistenceCard` into `SettingsView` under the "Sao lưu & Dữ liệu" tab above the Danger Zone card.

## Key Changes

- **src/services/storage/storagePersistence.ts**: Service inspecting persistence and quota with `formatBytes` helper.
- **src/hooks/useStoragePersistence.ts**: Hook returning `{ isPersisted, quotaBytes, usageBytes, formattedQuota, formattedUsage, percentUsed, isSupported, loading, requestPersistence, refresh }` with screen reader announcements.
- **src/App.tsx**: Auto-requests persistence on mount.
- **src/components/settings/PwaStatusCard.tsx**: Card showing SW and install status with manual update check.
- **src/components/settings/StoragePersistenceCard.tsx**: Card showing storage durability, quota usage, advisory warning, and request button.
- **src/views/SettingsView.tsx**: Mounted both cards in data tab.
- **tests/components/settings/PwaStatusCard.test.tsx**: Unit tests for status tags, update trigger, and offline handling.
- **tests/components/settings/StoragePersistenceCard.test.tsx**: Unit tests for unsupported empty state, temporary advisory mode, request CTA, and persisted mode.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Exact optional property types compatibility**
- **Found during:** Task 1 build check
- **Issue:** TypeScript error TS2375 due to `exactOptionalPropertyTypes: true` requiring `quotaBytes?: number | undefined`.
- **Fix:** Added `| undefined` to optional numeric properties in persistence interfaces.
- **Files modified:** `src/services/storage/storagePersistence.ts`, `src/hooks/useStoragePersistence.ts`
- **Commit:** `a51102f`

**2. [Rule 1 - Bug] Unused React import in test files**
- **Found during:** Task 2 build check
- **Issue:** TypeScript error TS6133 for unused `React` imports under React 19 JSX transform.
- **Fix:** Removed unused `React` imports from test files.
- **Files modified:** `tests/components/settings/PwaStatusCard.test.tsx`, `tests/components/settings/StoragePersistenceCard.test.tsx`
- **Commit:** `d0471b8`

## Self-Check: PASSED

- FOUND: `src/services/storage/storagePersistence.ts`
- FOUND: `src/hooks/useStoragePersistence.ts`
- FOUND: `src/components/settings/PwaStatusCard.tsx`
- FOUND: `src/components/settings/StoragePersistenceCard.tsx`
- FOUND: `tests/components/settings/PwaStatusCard.test.tsx`
- FOUND: `tests/components/settings/StoragePersistenceCard.test.tsx`
- FOUND: Commit `a51102f` (Task 1)
- FOUND: Commit `d0471b8` (Task 2)
