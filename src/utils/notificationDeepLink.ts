/**
 * Deep-link routing for OS notification clicks.
 *
 * On Tauri desktop the OS banner click is detected in Rust (`send_clickable_notification`), which
 * focuses the main window and emits a `notification-clicked` event carrying a hash route. This
 * module is the single frontend consumer of that event. It applies the route in a way that works
 * for BOTH app shells:
 *   - Default shell: `useHashRoute` reacts to `hashchange` and navigates.
 *   - IntelliJ Workbench: `WorkbenchLayout` listens for `taskmate:notification-deeplink` and opens
 *     the matching editor tab.
 */

import type { AlertNotificationItem } from '../types/notifications';

export const NOTIFICATION_CLICKED_EVENT = 'notification-clicked';
export const NOTIFICATION_DEEPLINK_EVENT = 'taskmate:notification-deeplink';
export const BROWSER_NOTIFICATION_CLICK_EVENT = 'notification-deeplink';

export const NotificationDeepLink = {
  aiPopout: '#/ai-popout',
  dashboard: '#/dashboard',
  tasks: '#/tasks',
  telegram: '#/telegram',
  settings: '#/settings?tab=notifications',
  /** Team chat workspace. `messageId` (when present) scrolls to and highlights that message. */
  team: (teamId: string, messageId?: string | undefined) =>
    `#/team?teamId=${encodeURIComponent(teamId)}` +
    (messageId ? `&messageId=${encodeURIComponent(messageId)}` : ''),
  task: (id: string) => `#/insight?type=task&id=${encodeURIComponent(id)}`,
  cr: (id: string) => `#/insight?type=cr&id=${encodeURIComponent(id)}`,
  system: (id: string) => `#/insight?type=system&id=${encodeURIComponent(id)}`,
  plannerDate: (date: string) => `#/planner?date=${encodeURIComponent(date)}`,
} as const;

/** Maps an in-app alert item to the page a user expects when clicking its OS notification. */
export function deeplinkForAlert(item: AlertNotificationItem): string {
  switch (item.entityType) {
    case 'task':
      return item.entityId ? NotificationDeepLink.task(item.entityId) : NotificationDeepLink.tasks;
    case 'cr':
      return item.entityId ? NotificationDeepLink.cr(item.entityId) : NotificationDeepLink.dashboard;
    case 'system':
      return item.entityId ? NotificationDeepLink.system(item.entityId) : NotificationDeepLink.dashboard;
    case 'capacity':
      return item.date ? NotificationDeepLink.plannerDate(item.date) : '#/planner';
    default:
      return NotificationDeepLink.dashboard;
  }
}

interface NotificationClickedPayload {
  route?: string | null;
}

/** True when a hash string is a safe in-app route we are willing to navigate to. */
export function isSafeHashRoute(route: string): boolean {
  // Whitelist to the same route set parseHash accepts; never allow arbitrary URLs or scripts.
  return /^#\/[A-Za-z][A-Za-z0-9_-]*([?][^\s]*)?$/.test(route);
}

/** Applies an OS-notification deeplink to the current shell. */
export function applyNotificationDeepLink(route: string): void {
  if (typeof window === 'undefined' || !isSafeHashRoute(route)) return;
  if (window.location.hash !== route) {
    window.location.hash = route;
  }
  // The IntelliJ shell does not navigate off the hash; give it an explicit signal.
  window.dispatchEvent(new CustomEvent(NOTIFICATION_DEEPLINK_EVENT, { detail: { route } }));
}

/**
 * Mounts the global OS-notification-click listener. Returns an unlisten function. Safe to call
 * in a browser (non-Tauri) environment — the Tauri listener simply fails to register there.
 */
export function startNotificationDeepLinkListener(standaloneChat = false): () => void {
  let unlisten: (() => void) | undefined;
  let disposed = false;

  void (async () => {
    try {
      const { listen } = await import('@tauri-apps/api/event');
      const stop = await listen<NotificationClickedPayload>(
        NOTIFICATION_CLICKED_EVENT,
        (event) => {
          if (standaloneChat) return;
          const route = event.payload?.route;
          if (typeof route === 'string') applyNotificationDeepLink(route);
        }
      );
      if (disposed) {
        stop();
      } else {
        unlisten = stop;
      }
    } catch {
      // Not running in Tauri, or the event API is unavailable — ignore.
    }
  })();

  // Browser/PWA fallback notifications dispatch a custom click event carrying their route.
  const onBrowserClick = (event: Event) => {
    if (standaloneChat) return;
    const detail = (event as CustomEvent<{ route?: string }>).detail;
    if (detail && typeof detail.route === 'string') applyNotificationDeepLink(detail.route);
  };
  window.addEventListener(BROWSER_NOTIFICATION_CLICK_EVENT, onBrowserClick);

  return () => {
    disposed = true;
    unlisten?.();
    window.removeEventListener(BROWSER_NOTIFICATION_CLICK_EVENT, onBrowserClick);
  };
}
