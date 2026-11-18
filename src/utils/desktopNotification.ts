import {
  isPermissionGranted as isTauriPermissionGranted,
  requestPermission as requestTauriPermission,
} from '@tauri-apps/plugin-notification';
import {
  BROWSER_NOTIFICATION_CLICK_EVENT,
  NotificationDeepLink,
} from './notificationDeepLink';

export interface DesktopNotificationPayload {
  title: string;
  body?: string;
  icon?: string;
  tag?: string;
  requireInteraction?: boolean;
  data?: unknown;
  /** Hash route to open when the OS notification is clicked (e.g. `#/tasks`). */
  deeplink?: string;
}

/**
 * Checks if running inside a Tauri v2 environment.
 */
export function isTauriEnvironment(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const win = window as unknown as Record<string, unknown>;
  return (
    win.__TAURI_INTERNALS__ !== undefined ||
    win.__TAURI__ !== undefined
  );
}

/**
 * Unified permission check supporting Tauri native desktop and browser/PWA.
 */
export async function isNotificationPermissionGranted(): Promise<boolean> {
  if (isTauriEnvironment()) {
    try {
      return await isTauriPermissionGranted();
    } catch (err) {
      console.warn('Tauri isPermissionGranted check failed:', err);
      return false;
    }
  }

  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    Boolean(window.Notification) &&
    window.Notification.permission === 'granted'
  );
}

/**
 * Unified permission request supporting Tauri native desktop and browser/PWA.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (isTauriEnvironment()) {
    try {
      const permission = await requestTauriPermission();
      return permission === 'granted';
    } catch (err) {
      console.warn('Tauri requestPermission failed:', err);
      return false;
    }
  }

  if (
    typeof window === 'undefined' ||
    !('Notification' in window) ||
    !window.Notification ||
    typeof window.Notification.requestPermission !== 'function'
  ) {
    return false;
  }

  try {
    const permission = await window.Notification.requestPermission();
    return permission === 'granted';
  } catch (err) {
    console.warn('Browser Notification.requestPermission failed:', err);
    return false;
  }
}

/**
 * Unified desktop notification dispatcher (NOTIF-07, NOTIF-08, TAURI-NOTIF-DESKTOP-DISPATCH).
 * 1. In Tauri environment: dispatches via @tauri-apps/plugin-notification for native OS banners.
 * 2. In browser environment: attempts dispatch via active Service Worker registration (recommended for PWAs).
 * 3. Fallback: dispatches via window.Notification when Service Worker is unregistered or unavailable.
 */
export async function sendDesktopNotification(
  payload: DesktopNotificationPayload
): Promise<boolean> {
  // 1. Tauri desktop application branch
  if (isTauriEnvironment()) {
    try {
      const granted = await isNotificationPermissionGranted();
      if (!granted) {
        return false;
      }

      // The stock plugin's desktop path discards the notification handle, so a user click can
      // never be observed. Use the custom command, which waits for the click, focuses the main
      // window, and emits `notification-clicked` with the deeplink route.
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('send_clickable_notification', {
        title: payload.title,
        body: payload.body ?? null,
        deeplink: payload.deeplink ?? NotificationDeepLink.dashboard,
      });
      return true;
    } catch (tauriErr) {
      console.warn('Tauri send_clickable_notification failed:', tauriErr);
      return false;
    }
  }

  // 2. Browser / PWA environment branch
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
    // 2a. PWA Service Worker branch
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

    // 2b. Window Notification fallback
    if (typeof window.Notification === 'function') {
      const notif = new window.Notification(payload.title, options);

      notif.onclick = () => {
        try {
          window.focus();
        } catch {
          // ignore focus error
        }
        // Route to the notification's target page via the shared deeplink handler.
        window.dispatchEvent(
          new CustomEvent(BROWSER_NOTIFICATION_CLICK_EVENT, {
            detail: { route: payload.deeplink ?? NotificationDeepLink.dashboard },
          })
        );
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
