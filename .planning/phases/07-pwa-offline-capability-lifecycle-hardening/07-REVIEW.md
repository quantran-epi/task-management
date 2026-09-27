---
phase: 07-pwa-offline-capability-lifecycle-hardening
reviewed: 2026-09-27T18:52:00Z
depth: standard
files_reviewed: 26
files_reviewed_list:
  - vite.config.ts
  - index.html
  - package.json
  - src/App.tsx
  - src/components/pwa/ActiveFormGuardModal.tsx
  - src/components/pwa/InstallButton.tsx
  - src/components/pwa/IosInstallModal.tsx
  - src/components/pwa/UpdateBanner.tsx
  - src/components/settings/PwaStatusCard.tsx
  - src/components/settings/StoragePersistenceCard.tsx
  - src/components/shell/AppShell.tsx
  - src/context/FormGuardContext.tsx
  - src/hooks/useNetworkStatus.ts
  - src/hooks/usePWAInstall.ts
  - src/hooks/useServiceWorkerUpdate.ts
  - src/hooks/useStoragePersistence.ts
  - src/services/storage/storagePersistence.ts
  - src/types/virtual-pwa.d.ts
  - src/views/SettingsView.tsx
  - tests/components/pwa/InstallButton.test.tsx
  - tests/components/pwa/IosInstallModal.test.tsx
  - tests/components/pwa/UpdateBanner.test.tsx
  - tests/components/settings/PwaStatusCard.test.tsx
  - tests/components/settings/StoragePersistenceCard.test.tsx
  - tests/hooks/useNetworkStatus.test.tsx
  - tests/mocks/pwaRegister.ts
findings:
  critical: 2
  warning: 4
  info: 3
  total: 9
status: issues_found
---

# Phase 07: Code Review Report

**Reviewed:** 2026-09-27T18:52:00Z  
**Depth:** standard  
**Files Reviewed:** 26  
**Status:** issues_found  

## Summary

Phase 7 implemented PWA manifests, Workbox service worker caching, installation prompts (Chromium and iOS Safari), update notification banners, network status alerts, and storage persistence quota diagnostics.

Review revealed 2 critical blockers and 4 warnings:
1. `FormGuardContext` and `ActiveFormGuardModal` were created, but `registerActiveForm` is never connected to any actual editing form or drawer (`TaskDrawer`, `ProjectModal`, `MilestoneModal`, etc.). In real app usage, `hasActiveForm` is permanently false, meaning update reloads will silently wipe active user edits without warning.
2. `usePWAInstall` retains the consumed `BeforeInstallPromptEvent` when the user dismisses the native prompt. Clicking "Cài đặt" a second time triggers an unhandled `DOMException: InvalidStateError` crash.
3. `usePWAInstall` stores the prompt event in per-hook `useState`, causing late-mounted components (such as Settings) to miss the one-shot `beforeinstallprompt` browser event.
4. Independent calls to `useServiceWorkerUpdate` in both `AppShell` and `PwaStatusCard` trigger duplicate registrations and leak an un-cleared interval.
5. `PwaStatusCard` displays a premature "Ứng dụng đang ở phiên bản mới nhất" success toast even when an update check discovers a new version, directly contradicting the `UpdateBanner`.

---

## Critical Issues

### CR-01: FormGuardContext is completely disconnected from forms; active edits lost on update reload

**File:** `src/context/FormGuardContext.tsx:4-35`, `src/components/pwa/UpdateBanner.tsx:26-41`  
**Issue:** Requirement PWA-03 and design decision D-02 require that the application prevent interrupting pending data writes by warning the user before reloading. `FormGuardContext` exposes `registerActiveForm(id)` and `hasActiveForm`. However, `registerActiveForm` is only used inside a unit test mock helper (`tests/components/pwa/UpdateBanner.test.tsx`). No form, drawer, or modal in `src/` (`TaskDrawer`, `ProjectModal`, `MilestoneModal`, `AllocationModal`, `WeeklyCapacityForm`) registers itself when opened. As a result, `hasActiveForm` is always `false` at runtime. If a user is actively writing a task description or configuring capacity when an update arrives, clicking "Cập nhật ngay" reloads the page immediately without confirmation, destroying uncommitted user data.  
**Fix:**
Integrate `registerActiveForm` into form components or open drawers. For example, in `src/components/tasks/TaskDrawer.tsx`:
```tsx
import { useFormGuard } from '../../context/FormGuardContext';

// Inside TaskDrawer:
const { registerActiveForm } = useFormGuard();

useEffect(() => {
  if (open) {
    const unregister = registerActiveForm(`task-drawer-${taskId ?? 'new'}`);
    return unregister;
  }
}, [open, taskId, registerActiveForm]);
```
Alternatively, track active editing state globally or via form dirty state.

---

### CR-02: Consumed BeforeInstallPromptEvent retained on dismissal; crash on subsequent click

**File:** `src/hooks/usePWAInstall.ts:86-95`  
**Issue:** Per the W3C Manifest and Chromium implementation, `BeforeInstallPromptEvent.prompt()` can only be invoked once. Once called, the event is permanently consumed. In `usePWAInstall.ts`, `setInstallPrompt(null)` is only executed if `choice.outcome === 'accepted'`. If the user dismisses the dialog (`choice.outcome === 'dismissed'`), `installPrompt` remains in state and the Install button remains visible. If the user clicks "Cài đặt" again, `installPrompt.prompt()` throws an unhandled `DOMException: InvalidStateError` ("The prompt() method may only be called once") and crashes the call stack.  
**Fix:**
Always clear `installPrompt` to `null` once `.prompt()` has been called, and wrap the execution in a `try/catch` block:
```tsx
  const promptInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | null> => {
    if (!installPrompt) return null;
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setIsInstalled(true);
      }
      return choice.outcome;
    } catch (err) {
      console.warn('PWA install prompt invocation failed:', err);
      return null;
    } finally {
      // Event is single-use; must be cleared regardless of user choice
      setInstallPrompt(null);
    }
  }, [installPrompt]);
```

---

## Warnings

### WR-01: Late-mounted components miss one-shot beforeinstallprompt event

**File:** `src/hooks/usePWAInstall.ts:24-84`  
**Issue:** `beforeinstallprompt` is a one-shot window event emitted by Chromium shortly after page load. Because `usePWAInstall` stores `installPrompt` in local component `useState`, any component mounted after initial load—specifically `PwaStatusCard` and `<InstallButton mode="settings" />` in `SettingsView`—will never receive the event. On desktop Chrome, Edge, and Android, navigating to Settings will always evaluate `isInstallable` as `false`, causing the Install button in Settings to be hidden even when the app is installable.  
**Fix:**
Store the deferred prompt in a module-level variable or React context so subsequent hook instances can read the cached prompt:
```ts
let globalInstallPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<(prompt: BeforeInstallPromptEvent | null) => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    globalInstallPrompt = e as BeforeInstallPromptEvent;
    listeners.forEach((cb) => cb(globalInstallPrompt));
  });
}
```

---

### WR-02: Duplicate useRegisterSW calls and leaked interval in useServiceWorkerUpdate

**File:** `src/hooks/useServiceWorkerUpdate.ts:21-47, 70-95`  
**Issue:** `useServiceWorkerUpdate` calls `useRegisterSW(...)` directly. The hook is called in both `AppShell.tsx` and `PwaStatusCard.tsx`. When Settings is viewed, two instances of `useRegisterSW` run concurrently, each registering separate listeners and holding disconnected `needRefresh` state. Furthermore, in `onRegistered(r)`:
```ts
const intervalId = setInterval(...);
return () => clearInterval(intervalId);
```
`onRegistered` is an event callback defined as `(r: ServiceWorkerRegistration | undefined) => void`. The returned cleanup function is ignored by `vite-plugin-pwa`, leaving an uncleaned 1-hour interval running whenever the hook mounts.  
**Fix:**
Move the hourly interval into a standard React `useEffect` with proper cleanup, and share service worker state via React context or restrict `useRegisterSW` to a single root provider.

---

### WR-03: Contradictory notification when manual update check finds an update

**File:** `src/components/settings/PwaStatusCard.tsx:28-37`  
**Issue:** In `handleCheckUpdate`, `await checkUpdate()` triggers `registration.update()`. When a new service worker script is found on the server, `registration.update()` resolves once download and installation begin. `handleCheckUpdate` immediately executes `message.success('Ứng dụng đang ở phiên bản mới nhất.')`. Seconds later, the service worker reaches the waiting state, triggering `needRefresh = true` and popping up `UpdateBanner` ("Đã có bản cập nhật mới"). The user is told both that the app is up to date and that an update is available.  
**Fix:**
Inspect the registration status after `update()`:
```ts
const reg = await navigator.serviceWorker?.getRegistration();
if (reg?.installing || reg?.waiting) {
  message.info('Đang tải bản cập nhật mới...');
} else {
  message.success('Ứng dụng đang ở phiên bản mới nhất.');
}
```

---

### WR-04: Dead parameter logic in reloadApp (`force || true`)

**File:** `src/hooks/useServiceWorkerUpdate.ts:98-106`  
**Issue:** In `reloadApp`:
```ts
const reloadApp = useCallback(
  async (force = false) => {
    try {
      await updateServiceWorker(force || true);
```
The expression `force || true` always evaluates to `true`. Passing `force = false` still passes `true` to `updateServiceWorker`, rendering the `force` parameter inert.  
**Fix:**
Default the parameter to `true` and pass it directly:
```ts
const reloadApp = useCallback(
  async (force = true) => {
    try {
      await updateServiceWorker(force);
    } catch (err) { ... }
  },
  [updateServiceWorker]
);
```

---

## Info

### IN-01: Hardcoded base path in index.html link tags

**File:** `index.html:8-9`  
**Issue:** `href="/task-management/favicon.svg"` and `href="/task-management/pwa-192x192.png"` hardcode the `/task-management/` base repository subpath instead of using Vite's `%BASE_URL%` interpolation token (`%BASE_URL%favicon.svg`).  
**Fix:** Use `%BASE_URL%` in `index.html`:
```html
<link rel="icon" type="image/svg+xml" href="%BASE_URL%favicon.svg" />
<link rel="apple-touch-icon" href="%BASE_URL%pwa-192x192.png" />
```

---

### IN-02: Dead test mock file `tests/mocks/pwaRegister.ts`

**File:** `tests/mocks/pwaRegister.ts:1-19`  
**Issue:** Created in 07-01 to mock `virtual:pwa-register/react`, but neither `tests/setup.ts` nor any test file imports or uses it. Tests in `PwaStatusCard.test.tsx` use inline mocks instead.  
**Fix:** Import in tests requiring SW register mocks or remove if redundant.

---

### IN-03: Workbox precache 2MB single-file size ceiling risk

**File:** `vite.config.ts:46-51`  
**Issue:** Production client bundle `index.js` currently compiles to 1,680 KB (1.68 MB). Workbox has a default `maximumFileSizeToCacheInBytes` limit of 2,097,152 bytes (2 MB). When Phase 8 adds GitHub sync dependencies (`@octokit/request` and crypto routines), the chunk may exceed 2 MB and fail the Vite build unless code splitting or chunk size overrides are configured.  
**Fix:** Configure manual chunking in `vite.config.ts` or increase `maximumFileSizeToCacheInBytes: 3 * 1024 * 1024`.

---

_Reviewed: 2026-09-27T18:52:00Z_  
_Reviewer: Claude (gsd-code-reviewer)_  
_Depth: standard_  
