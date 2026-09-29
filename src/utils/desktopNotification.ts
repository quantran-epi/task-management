export interface DesktopNotificationPayload {
  title: string;
  body?: string;
  icon?: string;
  tag?: string;
  requireInteraction?: boolean;
  data?: unknown;
}

/**
 * Unified desktop notification dispatcher (NOTIF-07, NOTIF-08).
 * Attempts to dispatch via active Service Worker registration (recommended for PWAs).
 * Falls back to window.Notification when Service Worker is unregistered or unavailable.
 */
export async function sendDesktopNotification(
  payload: DesktopNotificationPayload
): Promise<boolean> {
  if (
    typeof window === 'undefined' ||
    !('Notification' in window) ||
    !window.Notification ||
    window.Notification.permission !== 'granted'
  ) {
    return false;
  }

  const options: NotificationOptions = {
    icon: payload.icon ?? '/task-management/favicon.ico',
  };
  if (payload.body !== undefined) {
    options.body = payload.body;
  }
  if (payload.tag !== undefined) {
    options.tag = payload.tag;
  }
  if (payload.requireInteraction !== undefined) {
    options.requireInteraction = payload.requireInteraction;
  }
  if (payload.data !== undefined) {
    options.data = payload.data;
  }

  try {
    // 1. PWA Service Worker branch
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      try {
        const swPromise = navigator.serviceWorker.ready;
        const timeoutPromise = new Promise<undefined>((resolve) =>
          setTimeout(() => resolve(undefined), 500)
        );
        const registration = await Promise.race([swPromise, timeoutPromise]);

        if (registration && typeof registration.showNotification === 'function') {
          await registration.showNotification(payload.title, options);
          return true;
        }
      } catch (swErr) {
        console.warn('Service Worker notification dispatch failed, falling back to window.Notification:', swErr);
      }
    }

    // 2. Window Notification fallback
    if (typeof window.Notification === 'function') {
      const notif = new window.Notification(payload.title, options);

      notif.onclick = () => {
        try {
          window.focus();
        } catch {
          // ignore focus error
        }
        try {
          notif.close();
        } catch {
          // ignore close error
        }
      };

      return true;
    }

    return false;
  } catch (err) {
    console.warn('Desktop notification dispatch failed:', err);
    return false;
  }
}
