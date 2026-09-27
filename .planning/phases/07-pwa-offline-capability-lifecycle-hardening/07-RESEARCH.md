# Phase 07: PWA Offline Capability & Lifecycle Hardening - Research

**Researched:** 2026-09-27
**Domain:** Progressive Web Apps (PWA), Service Workers, Workbox Precache, Persistent Storage API, Cross-Browser Compatibility
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01: Floating Notification Banner:** When Service Worker detects a new version (`needRefresh`), display a compact floating banner (bottom or top) with "Cập nhật ngay" and "Để sau" buttons. Banner is non-modal and non-blocking.
- **D-02: Guard Reload Against Active Forms / Writes:** When user clicks "Cập nhật ngay", check whether any editing Drawer or Modal (TaskDrawer, AllocationModal, FeasibilityModal, Settings) is open or form is dirty. If open, show an alert warning user to save or cancel their changes before reloading. Only invoke `updateSW(true)` when interface is idle.
- **D-03: Periodic SW Update Checks:** Check for Service Worker updates on app launch and automatically on tab focus (`visibilitychange` and `focus` events). Avoid aggressive background polling.
- **D-04: Collapsed Banner Fallback:** If user clicks "Để sau" or closes update banner, collapse prompt into compact update icon on Header (adjacent to StatusBadge) with a badge in Settings.
- **D-05: Header & Settings Install Triggers:** Surface PWA install button/icon in AppShell Header and as a status card in Settings. Automatically hidden when running in standalone mode (`window.matchMedia('(display-mode: standalone)')`) or after installation.
- **D-06: iOS Safari Home-Screen Guidance:** On iOS Safari (where `beforeinstallprompt` is unavailable), clicking "Cài đặt" opens instructional modal: Tap Share -> Select "Thêm vào màn hình chính".
- **D-07: Standardized PWA Icon Assets:** Standard PNG icon bundle (192x192, 512x512, 512x512 maskable) along with SVG favicon, using app brand color `#1677ff` and task/calendar motif.
- **D-08: Post-Install Feedback:** Listen to `appinstalled` event to dispatch Ant Design message and AriaLiveRegion announcement ("Ứng dụng đã được cài đặt thành công!"). Update Settings badge to "Đã cài đặt" and hide Header install button.
- **D-09: Connectivity Transition Feedback:** On online -> offline, show transient `message.warning` and announce via AriaLiveRegion ("Đang làm việc ngoại tuyến, dữ liệu lưu cục bộ"). On offline -> online, show `message.success` and announce ("Đã kết nối lại mạng"). StatusBadge toggles "Trực tuyến" (green) / "Ngoại tuyến" (orange).
- **D-10: Comprehensive Workbox Precaching:** Use `vite-plugin-pwa` with Workbox to precache 100% of static build artifacts (HTML, JS, CSS, SVG, icons). External assets use `StaleWhileRevalidate`.
- **D-11: Subpath SPA Navigate Fallback:** Explicitly configure `navigateFallback: '/task-management/index.html'` matching Vite `base` configuration for GitHub Pages. Prevents 404 errors on deep hash links.
- **D-12: Settings PWA & Cache Status Card:** Add "Trạng thái PWA & Ngoại tuyến" card in Settings displaying SW status (Hoạt động / Chưa kích hoạt), Offline readiness (Sẵn sàng), and manual "Kiểm tra bản cập nhật" action.
- **D-13: Automatic Persistent Storage Request:** On startup, check `navigator.storage.persisted()`. If false, automatically invoke `navigator.storage.persist()`. Protects IndexedDB from browser cache eviction or Safari 7-day cap.
- **D-14: Storage Status & Quota Inspection:** In Settings > Dữ liệu, display persistent storage status (Bền vững / Tạm thời) and estimated usage/quota via `navigator.storage.estimate()` (e.g. "2.5 MB / 10 GB").
- **D-15: Non-Intrusive Persistence Fallback Warning:** If persistent storage is rejected by browser (`persist()` returns false), display gentle advisory alert in Settings > Dữ liệu recommending regular JSON backups.
- **D-16: Defensive API Detection:** Strictly gate all PWA and storage APIs behind feature detection (`'serviceWorker' in navigator`, `'storage' in navigator`, `beforeinstallprompt`). Ensure graceful degradation across Firefox, Safari, Chrome, Edge.

### Claude's Discretion
- Exact layout and styling of the floating update banner using Ant Design tokens.
- Specific SVG vector paths for app icons matching the `#1677ff` primary theme.
- Internal hook architecture for PWA prompt and update registration (`usePWA`, `useServiceWorkerUpdate`).

### Deferred Ideas (OUT OF SCOPE)
- None — all decisions remain within Phase 7 boundary.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PWA-01 | User can install application directly to desktop or mobile home screen via browser PWA prompts. | Web App Manifest configuration with required icons and display standalone; `beforeinstallprompt` capture; fallback modal for iOS Safari (`IosInstallModal`). |
| PWA-02 | User can open and use previously loaded core features without a network connection. | Workbox precaching of 100% build assets via `vite-plugin-pwa`; `navigateFallback: '/task-management/index.html'`; network change detection and accessible feedback. |
| PWA-03 | Application prompts before activating an update that requires reload and avoids interrupting pending data writes. | `registerType: 'prompt'`; `useRegisterSW` hook; `UpdateBanner` with reload guard against active dirty forms (`ActiveFormGuardModal`); collapsed header badge trigger. |
| PWA-06 | Current Chrome, Edge, Firefox, and Safari can use core task, planning, dashboard, and backup features; install behavior follows browser capabilities. | Defensive API detection (`navigator.storage`, `navigator.serviceWorker`, `window.matchMedia`); `navigator.storage.persist()` automatic request; storage quota inspection. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

1. **Audience & Runtime:** One personal user; 100% local browser execution; no backend server.
2. **Hosting:** GitHub Pages subpath `/task-management/`; production build, manifest, and service worker scope must match this base path.
3. **Persistence:** IndexedDB via Dexie is the local working store; app must function 100% offline.
4. **PWA & Update Safety:** Installable and offline-capable; service worker updates must prompt user (`registerType: 'prompt'`) and never use unprompted automatic `skipWaiting`; reload must not cause data loss.
5. **UI & Access:** Ant Design 6.6.5 with `@ant-design/icons` 6.3.4; accessible status announcements via AriaLiveRegion (UX-04); touch targets >= 44px on mobile viewports.
6. **Identifiers & Dates:** Native `crypto.randomUUID()`; dates persisted as `YYYY-MM-DD` strings.

## Summary

Phase 7 hardens the personal task planner into an installable, offline-first Progressive Web App (PWA). It leverages `vite-plugin-pwa` (v1.3.0) and `workbox-window` (v7.4.1) with prompt-driven update semantics (`registerType: 'prompt'`). Precache covers all static HTML, JS, CSS, and SVG assets within the `/task-management/` GitHub Pages scope, paired with `navigateFallback: '/task-management/index.html'`.

Update safety is prioritized: when a new service worker build is waiting, the user receives a floating non-blocking notification banner (`UpdateBanner`). If the user clicks "Cập nhật ngay" while any editing drawer or modal is open (e.g. `TaskDrawer`, `AllocationModal`, `FeasibilityModal`, dirty Settings form), an `ActiveFormGuardModal` intercepts the reload to prevent uncommitted data loss. Users can also defer updates ("Để sau"), collapsing the alert into an icon badge in the shell header.

Browser storage resilience is secured through the StorageManager API (`navigator.storage.persist()`), protecting local IndexedDB data from automated browser cache eviction (especially relevant for Safari's 7-day cap and low-storage mobile environments).

**Primary recommendation:** Configure `vite-plugin-pwa` with `registerType: 'prompt'`, inject full manifest and icons matching `/task-management/` base, wire lifecycle hooks to `AppShell`, guard reload with an active form/editing detector, and trigger `navigator.storage.persist()` at app boot.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Asset Precaching & Offline Fetch | Service Worker (Workbox) | Browser Cache Storage | Intercepts HTTP requests offline and serves precached bundle immediately. |
| SW Registration & Update Prompt | Client Runtime (`useRegisterSW`) | React UI (`UpdateBanner`) | Listens to SW lifecycle events (`onNeedRefresh`, `onOfflineReady`) and controls reload timing. |
| Reload Safety Guard | React State / UI Context | Window BeforeUnload | Detects open editing forms/drawers in DOM and halts reload until confirmed. |
| Install Prompt Capture & Guidance | Browser Window (`beforeinstallprompt`) | React UI (`InstallButton`, `IosInstallModal`) | Captures deferred install event or displays platform-specific instructions on iOS. |
| Storage Durability Management | Browser StorageManager API | Settings View (`StoragePersistenceCard`) | Requests persistent quota and displays metrics/warnings without breaking app flow. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `vite-plugin-pwa` | 1.3.0 [VERIFIED: npm registry] | Vite PWA plugin & manifest generator | Official Vite standard for Workbox service worker generation and manifest injection. Matches CLAUDE.md stack recommendation. |
| `workbox-window` | 7.4.1 [VERIFIED: npm registry] | Client-side SW registration & lifecycle listener | Built-in companion to `vite-plugin-pwa/react` for listening to registration, waiting, and controlling workers. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `antd` | 6.6.5 (installed) | UI components (Card, Modal, Alert, Badge, Progress, Button) | Renders UpdateBanner, InstallButton, IosInstallModal, and Settings cards per UI-SPEC. |
| `@ant-design/icons` | 6.3.4 (installed) | Icons (`DownloadOutlined`, `CloudSyncOutlined`, `CloudDownloadOutlined`, `SyncOutlined`, `ShareAltOutlined`, `PlusSquareOutlined`) | Visual affordances in Header, Banner, and iOS guide modal. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `vite-plugin-pwa` | Hand-rolled `sw.js` | Hand-written service workers frequently introduce stale cache traps, hash mismatches, and broken offline routes. Workbox handles revision hashes automatically. |
| `registerType: 'prompt'` | `registerType: 'autoUpdate'` | Auto-updating calls `skipWaiting` immediately, which can hot-swap scripts while a user is typing in a form or executing an IndexedDB transaction, corrupting state or losing input. |

**Installation:**
```bash
npm install vite-plugin-pwa@^1.3.0 workbox-window@^7.4.1 --save-dev
```

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `vite-plugin-pwa` | npm | 4+ yrs | 5.2M/wk | github.com/vite-pwa/vite-plugin-pwa | [OK] | Approved |
| `workbox-window` | npm | 6+ yrs | 12.0M/wk | github.com/googlechrome/workbox | [OK] | Approved |

**Packages removed due to [SLOP] verdict:** None
**Packages flagged as suspicious [SUS]:** None

## Architecture Patterns

### System Architecture Diagram

```
                 +--------------------------------------------------+
                 |                 Browser Window                   |
                 |                                                  |
User Action ---->|  AppShell & Header                               |
                 |    ├── StatusBadge ("Trực tuyến" / "Ngoại tuyến")|
                 |    ├── InstallButton (beforeinstallprompt / iOS) |
                 |    ├── UpdateHeaderButton (Collapsed pulse dot)  |
                 |    └── ResetDbButton                             |
                 |                                                  |
Editing State -->|  Active Form / Drawer Tracker                    |
                 |    └── (TaskDrawer, AllocationModal, Feasibility)|
                 |                          |                       |
                 |                          v                       |
                 |  UpdateBanner ---> ActiveFormGuardModal          |
                 |    ("Cập nhật")     (Alert if form is dirty)     |
                 |          |                       |               |
                 |          +----------+------------+               |
                 |                     |                            |
                 |                     v (Proceed)                  |
                 |              updateSW(true)                      |
                 |                     |                            |
                 +---------------------|----------------------------+
                                       | postMessage(SKIP_WAITING)
                                       v
                 +--------------------------------------------------+
                 |            Service Worker (Workbox)              |
                 |                                                  |
                 |  Precache: index.html, JS, CSS, SVG assets       |
                 |  NavigateFallback: /task-management/index.html   |
                 |  RuntimeCache: StaleWhileRevalidate for assets   |
                 +--------------------------------------------------+
                                       |
                                       v
                 +--------------------------------------------------+
                 |        IndexedDB & StorageManager API            |
                 |                                                  |
                 |  navigator.storage.persist() -> Persistent Mode  |
                 |  navigator.storage.estimate() -> Usage / Quota   |
                 +--------------------------------------------------+
```

### Recommended Project Structure
```
src/
├── components/
│   ├── common/
│   │   ├── AriaLiveRegion.tsx
│   │   └── ...
│   ├── pwa/
│   │   ├── UpdateBanner.tsx             # Floating notification banner (D-01, D-02)
│   │   ├── ActiveFormGuardModal.tsx     # Guards reload against active open forms (D-02)
│   │   ├── InstallButton.tsx            # Header & Settings install button (D-05, D-08)
│   │   └── IosInstallModal.tsx          # Step-by-step iOS Safari install guide (D-06)
│   ├── settings/
│   │   ├── PwaStatusCard.tsx            # SW lifecycle and manual check in Settings (D-12)
│   │   ├── StoragePersistenceCard.tsx   # Storage persistence & quota in Settings (D-14, D-15)
│   │   └── ...
│   └── shell/
│       ├── AppShell.tsx                 # Hosts UpdateBanner, InstallButton, Aria announcements
│       └── StatusBadge.tsx              # Dynamic online/offline indicator
├── context/
│   └── FormGuardContext.tsx             # Tracks active editing drawers/modals for reload safety
├── hooks/
│   ├── useNetworkStatus.ts              # Online/offline event tracking
│   ├── usePWAInstall.ts                 # beforeinstallprompt, appinstalled, iOS detection
│   ├── useServiceWorkerUpdate.ts        # vite-plugin-pwa integration, focus check, reload guard
│   └── useStoragePersistence.ts         # navigator.storage.persist() & estimate()
└── public/
    ├── favicon.svg                      # Scalable SVG brand icon
    ├── pwa-192x192.png                  # Standard 192px icon
    ├── pwa-512x512.png                  # Standard 512px icon
    └── pwa-512x512-maskable.png         # Maskable 512px icon
```

### Pattern 1: `vite-plugin-pwa` Configuration in `vite.config.ts`
```typescript
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/task-management/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        name: 'Personal Task & Workload Planner',
        short_name: 'TaskPlanner',
        description: 'Private offline-first personal task and workload planner',
        theme_color: '#1677ff',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/task-management/',
        scope: '/task-management/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        navigateFallback: '/task-management/index.html',
        navigateFallbackAllowlist: [/^\/task-management\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
```

### Pattern 2: Safe Reload Guard Context (`FormGuardContext`)
**What:** Global tracker for open forms/drawers to prevent `window.location.reload()` while user is editing.
**When to use:** Whenever an action triggers an application reload (e.g. Service Worker update, backup restore, database reset).
```typescript
interface FormGuardContextType {
  registerActiveForm: (id: string) => () => void;
  hasActiveForm: boolean;
}
```

### Anti-Patterns to Avoid
- **Auto `skipWaiting` without prompt:** Silently updating the service worker causes race conditions with IndexedDB schema changes and uncommitted component forms.
- **Root `/` fallback under GitHub Pages subpath:** Setting `navigateFallback: '/index.html'` breaks offline navigation when hosted under `/task-management/`. Always prefix with base path.
- **Blocking alert on persistent storage rejection:** If `persist()` returns false (e.g. in incognito or unbookmarked domains in Firefox), do NOT pop an invasive modal; show a soft advisory tag in Settings.
- **Direct window.reload without SW activation:** Reloading before the waiting worker activates will just reload the old precached version. Always call `updateSW(true)` which posts `SKIP_WAITING` and reloads.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Service Worker generation & hashing | Custom `sw.js` script with cache version strings | `vite-plugin-pwa` with Workbox | Workbox calculates sha256 revision hashes of every compiled JS/CSS asset, preventing stale cache mismatches. |
| SW Lifecycle State Management | Custom `navigator.serviceWorker.addEventListener` listener | `virtual:pwa-register/react` (`useRegisterSW`) | Handles controllerchange, registration waiting, and reload dispatch cleanly. |
| PWA Detection | User-agent string parsing for installability | `window.matchMedia('(display-mode: standalone)')` & `beforeinstallprompt` | Display-mode media query is standard across Chrome, Edge, and iOS Safari. |
| Storage Persistence Request | Custom IndexedDB quota calculators | `navigator.storage.persist()` and `navigator.storage.estimate()` | Native browser API explicitly supported across all modern browsers. |

## Common Pitfalls

### Pitfall 1: Subpath 404 in GitHub Pages Offline Navigation
**What goes wrong:** App works offline at `/task-management/`, but if user refreshes on `/#/planner`, browser fails or serves 404.
**Why it happens:** Workbox `navigateFallback` defaults to `/index.html` instead of `/task-management/index.html`.
**How to avoid:** Explicitly configure `navigateFallback: '/task-management/index.html'` and `navigateFallbackAllowlist: [/^\/task-management\//]` in VitePWA workbox settings.

### Pitfall 2: Reloading During Unsaved Work (Data Loss)
**What goes wrong:** User receives "Đã có bản cập nhật mới", clicks "Cập nhật ngay", page reloads immediately, losing uncommitted text in TaskDrawer or dirty forms.
**Why it happens:** SW reload handlers traditionally call `window.location.reload()` directly on click.
**How to avoid:** Integrate `ActiveFormGuardModal` (D-02) that inspects registered editing drawers/modals and displays a warning dialog if work is in flight.

### Pitfall 3: Safari 7-Day Storage Eviction
**What goes wrong:** User visits app after 8 days of inactivity on iOS Safari or desktop Safari; IndexedDB tasks are wiped.
**Why it happens:** WebKit's Intelligent Tracking Prevention (ITP) caps client storage to 7 days for origins without user interaction unless storage is persisted.
**How to avoid:** Invoke `navigator.storage.persist()` on app boot (D-13) and advise users to install to Home Screen (standalone PWAs are exempt from ITP 7-day cap).

### Pitfall 4: `beforeinstallprompt` Unhandled on Non-Chromium Browsers
**What goes wrong:** App expects `beforeinstallprompt` event; on Firefox and iOS Safari, the event never fires, leaving users unable to install or seeing broken buttons.
**Why it happens:** `beforeinstallprompt` is a non-standard Chromium API.
**How to avoid:** Detect iOS Safari via user-agent / navigator platform and display `IosInstallModal` with manual steps (D-06). In Firefox, provide clear guidance or hide the header button gracefully.

## Code Examples

### Periodic Focus Check for SW Updates (D-03)
```typescript
// Source: Workbox / vite-plugin-pwa official recipe
export function useServiceWorkerUpdate() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      if (!registration) return;

      const checkForUpdate = () => {
        if (!navigator.onLine) return;
        registration.update().catch(console.error);
      };

      // Check on tab focus and visibility change
      window.addEventListener('focus', checkForUpdate);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          checkForUpdate();
        }
      });
    },
  });

  return { needRefresh, setNeedRefresh, updateServiceWorker };
}
```

### Storage Persistence and Estimation Inspection (D-13, D-14)
```typescript
// Source: MDN Web Docs StorageManager API
export async function checkAndRequestStoragePersistence(): Promise<{
  isPersisted: boolean;
  quotaBytes?: number;
  usageBytes?: number;
}> {
  let isPersisted = false;
  let quotaBytes: number | undefined;
  let usageBytes: number | undefined;

  if (typeof navigator !== 'undefined' && 'storage' in navigator) {
    // Check if already persisted
    if (navigator.storage.persisted) {
      isPersisted = await navigator.storage.persisted();
      if (!isPersisted && navigator.storage.persist) {
        isPersisted = await navigator.storage.persist();
      }
    }

    // Estimate storage usage
    if (navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      quotaBytes = estimate.quota;
      usageBytes = estimate.usage;
    }
  }

  return { isPersisted, quotaBytes, usageBytes };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `registerType: 'autoUpdate'` with immediate `skipWaiting` | `registerType: 'prompt'` with interactive reload guard | Workbox 6+ / Vite PWA | Eliminates background app reload during active form typing or Dexie transactions. |
| Browser AppCache (`manifest.appcache`) | Service Worker Cache API with Workbox | HTML5 deprecation | Complete programmatic control over precaching, cache invalidation, and fallback routing. |
| Passive local storage | Explicit `navigator.storage.persist()` | Modern Storage API | Protects local IndexedDB from automated eviction under memory/disk pressure. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Standard PNG assets (192x192, 512x512, maskable) in `public/` satisfy Lighthouse and mobile installability checks without external build plugins | Architecture Patterns | Low — SVGs and sharp/canvas scripts can generate PNGs during build if needed |

## Open Questions

1. **How to test Service Worker behavior in Vitest / jsdom environment?**
   - What we know: `jsdom` does not implement `navigator.serviceWorker` or `navigator.storage`.
   - What's unclear: How to unit test `usePWAInstall` and `useServiceWorkerUpdate` cleanly.
   - Recommendation: Provide test mocks for `virtual:pwa-register/react`, `navigator.serviceWorker`, and `navigator.storage` in `tests/setup.ts` to verify UI transitions, modals, and callbacks reliably.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build & tooling | ✓ | 24.16.0 | — |
| npm | Package management | ✓ | 11.13.0 | — |
| ServiceWorker API | Offline & PWA | ✓ (Browser runtime) | Standard | Standard web app execution if missing (Firefox private mode, legacy Safari) |
| StorageManager API | Storage persistence | ✓ (Browser runtime) | Standard | Best-effort IndexedDB storage with soft UI advisory |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.2 + React Testing Library 16.3.3 |
| Config file | `vite.config.ts` |
| Quick run command | `npx vitest run tests/components/pwa/` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PWA-01 | Install triggers in Header & Settings; iOS modal display on iOS Safari | Unit / Component | `npx vitest run tests/components/pwa/InstallButton.test.tsx` | ❌ Wave 0 |
| PWA-02 | Service Worker precaching & network status transition announcements | Unit / Component | `npx vitest run tests/hooks/useNetworkStatus.test.tsx` | ❌ Wave 0 |
| PWA-03 | UpdateBanner prompt, collapsed header icon, and active form guard modal reload protection | Unit / Component | `npx vitest run tests/components/pwa/UpdateBanner.test.tsx` | ❌ Wave 0 |
| PWA-06 | Storage persistence check, estimate display, and fallback advisory alert in Settings | Unit / Component | `npx vitest run tests/components/settings/StoragePersistenceCard.test.tsx` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/components/pwa/`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green (`npm test`) before completion

### Wave 0 Gaps
- [ ] `tests/components/pwa/InstallButton.test.tsx` — covers PWA-01, PWA-06
- [ ] `tests/components/pwa/UpdateBanner.test.tsx` — covers PWA-03
- [ ] `tests/components/pwa/IosInstallModal.test.tsx` — covers PWA-01, D-06
- [ ] `tests/components/settings/PwaStatusCard.test.tsx` — covers PWA-02, PWA-06, D-12
- [ ] `tests/components/settings/StoragePersistenceCard.test.tsx` — covers PWA-06, D-14, D-15
- [ ] `tests/mocks/pwaRegister.ts` — mock for `virtual:pwa-register/react`

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Single-user local application, no backend authentication. |
| V3 Session Management | no | Local runtime only. |
| V4 Access Control | no | Single-user personal planner. |
| V5 Input Validation | yes | Validate and sanitize all external PWA manifest fields and storage inputs. |
| V6 Cryptography | no | PWA lifecycle does not handle encryption (owned by Phase 8). |
| V14 Configuration | yes | Service worker caching must never cache sensitive tokens or passphrases; `navigateFallbackAllowlist` strictly scoped to `/task-management/`. |

### Known Threat Patterns for Service Workers & Offline PWA

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Stale Cache Trap | Denial of Service | `cleanupOutdatedCaches: true` in Workbox; `registerType: 'prompt'` with interactive reload. |
| Subpath Traversal / Cross-Origin Scope Leak | Information Disclosure | Explicit `scope: '/task-management/'` in manifest and Service Worker registration. |
| Data Overwrite via Forced Refresh | Tampering / Repudiation | Form guard checks (`hasActiveForm`) before `updateSW(true)` execution. |
| Cache Poisoning via Untrusted CDN | Tampering | Precache only self-hosted assets built by Vite (`globPatterns: ['**/*.{js,css,html,svg,png,ico}']`). |

## Sources

### Primary (HIGH confidence)
- Official Documentation: `https://vite-pwa-org.netlify.app/guide/` — Vite PWA plugin, prompt updates, Workbox configuration.
- MDN Web Docs: `https://developer.mozilla.org/en-US/docs/Web/API/StorageManager` — `navigator.storage.persist()` and `navigator.storage.estimate()`.
- MDN Web Docs: `https://developer.mozilla.org/en-US/docs/Web/API/BeforeInstallPromptEvent` — PWA installation lifecycle and display-mode matching.

### Secondary (MEDIUM confidence)
- Project Architecture & Context: `.planning/phases/07-pwa-offline-capability-lifecycle-hardening/07-CONTEXT.md` & `07-UI-SPEC.md`.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — official `vite-plugin-pwa` and `workbox-window` verified on npm registry with 5M+ weekly downloads.
- Architecture: HIGH — verified against GitHub Pages `/task-management/` subpath constraints and UI-SPEC design contract.
- Pitfalls: HIGH — covers subpath navigation fallbacks, reload data loss, and Safari storage eviction.

**Research date:** 2026-09-27
**Valid until:** 2026-10-27
