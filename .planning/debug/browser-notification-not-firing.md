---
status: diagnosed
trigger: "browser-notification-not-firing"
created: 2026-09-29T22:03:00Z
updated: 2026-09-29T22:20:00Z
---

## Current Focus

hypothesis: Notifications not firing in real-time due to reactive query stagnation without clock ticker, missing ServiceWorker showNotification fallback in PWA, and category-restricted desktop notification hook.
test: verify Notification API dispatch, useNotifications live query triggers, and alert categories in useDesktopNotification.
expecting: all alerts fire automatically and in real-time via desktop notification.
next_action: complete diagnosis and feed gaps into plan-phase --gaps.

## Symptoms

expected: Navigate to Settings -> Thông báo, enable "Bật thông báo màn hình" and "Giữ thông báo trên màn hình". When an alert triggers (reminder scheduled time or timer exceeding allocated time), an OS desktop notification banner should be displayed in real time without needing reload or user interaction.
actual: User reports: "i dont event see browser notification fire, only in-app notification.try both reminder and timer exceed allocated time, dont fire browser notification, reminder only see in drawer notification"
errors: None reported in UI.
reproduction: Enable desktop notifications and persistence in settings, schedule a reminder or run timer past allocated time. In-app drawer notification appears, but browser desktop notification never fires.
started: Discovered during Phase 12.2 UAT

## Root Causes

1. **Clock Stagnation in `useNotifications`**: `useNotifications` uses Dexie's `useLiveQuery` without a periodic timer. Dexie only re-evaluates when an IndexedDB transaction commits. As real-world clock time passes (e.g. crossing a reminder's HH:mm), `evaluateNotifications` is never re-run, so `notifications.items` remains stale until manual page reload or DB write.
2. **Missing Real-Time Unified Alert Dispatcher in `useDesktopNotification`**:
   - `useDesktopNotification` only polled `category === 'reminder'`, ignoring all other active alert types (overdue, overload, timer, due soon).
   - For reminders, it strictly required `parts.length === 2` (`time date`), skipping reminders with only date or reminders triggered in past minutes.
   - Startup summary was silenced once per session via `sessionStorage`, preventing any newly triggered alerts from surfacing via desktop notifications during the session.
3. **PWA / Service Worker Notification Dispatch Fallback**:
   - The app uses VitePWA with an active service worker. Modern desktop browsers (Chromium, Edge) frequently restrict or suppress `new Notification()` constructed in the DOM window context, requiring `navigator.serviceWorker.ready -> registration.showNotification(title, options)` to reliably display OS desktop banners.
4. **Settings Disconnection in `useTimerAlertMonitor`**:
   - `useTimerAlertMonitor` reads legacy key `'browserNotificationsEnabled'` instead of unified `NOTIFICATION_SETTINGS_KEY` (`'notification_settings'`), and does not pass `requireInteraction: settings.requireInteractionEnabled`.

## Resolution

root_cause: |
  1. useNotifications lacks a minute interval ticker, so evaluateNotifications does not reactively run when clock hits reminder time.
  2. useDesktopNotification only tracks reminders with explicit times and ignores other alert categories (timer, overdue, overload).
  3. Notifications use `new Notification()` directly rather than `registration.showNotification()` via active ServiceWorker with document fallback, which causes Chrome/PWA to drop desktop notifications.
  4. useTimerAlertMonitor does not read unified notificationSettings or apply requireInteraction.
fix: |
  1. Add a live 30s/60s clock ticker in useNotifications so evaluateNotifications updates automatically as time passes.
  2. Create a robust `sendDesktopNotification` helper that checks permission, attempts `serviceWorker.ready.then(reg => reg.showNotification(title, options))` with fallback to `new window.Notification()`.
  3. Update `useDesktopNotification` to track all alert types uniformly: whenever any new alert appears in `notifications.items` (reminders, timer, overload, overdue), dispatch a desktop notification if not already notified.
  4. Ensure `useTimerAlertMonitor` and `useDesktopNotification` use the unified `notificationSettings` and `sendDesktopNotification`.
verification: Vitest tests for sendDesktopNotification, useDesktopNotification, useNotifications clock ticker, and live reminder triggering.
files_changed:
  - src/utils/desktopNotification.ts
  - src/hooks/useDesktopNotification.ts
  - src/hooks/useNotifications.ts
  - src/hooks/useTimerAlertMonitor.ts
