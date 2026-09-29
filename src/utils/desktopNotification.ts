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

  const iconUrl = payload.icon ?? '/task-management/favicon.ico';

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
          await registration.showNotification(payload.title, {
            body: payload.body,
            icon: iconUrl,
            tag: payload.tag,
            requireInteraction: payload.requireInteraction,
            data: payload.data,
          });
          return true;
        }
      } catch (swErr) {
        console.warn('Service Worker notification dispatch failed, falling back to window.Notification:', swErr);
      }
    }

    // 2. Window Notification fallback
    if (typeof window.Notification === 'function') {
      const notif = new window.Notification(payload.title, {
        body: payload.body,
        icon: iconUrl,
        tag: payload.tag,
        requireInteraction: payload.requireInteraction,
        data: payload.data,
      });

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
