import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import type { NotificationState } from '../types/notifications';

export const SESSION_NOTIFICATION_SHOWN_KEY = 'desktop_notification_shown';

export interface UseDesktopNotificationOptions {
  notifications: NotificationState;
  db?: TaskPlannerDatabase;
}

/**
 * Triggers a browser desktop notification once per session when active alerts exist (D-18, D-19).
 * Respects user opt-in saved in db.settings ('browserNotificationsEnabled'), checks Notification.permission,
 * aggregates alert counts into a non-leaking summary string (T-12-07), and throttles execution via sessionStorage (T-12-08).
 */
export function useDesktopNotification({
  notifications,
  db = defaultDb,
}: UseDesktopNotificationOptions): void {
  const enabledSetting = useLiveQuery(
    async () => {
      const setting = await db.settings.get('browserNotificationsEnabled');
      return setting?.value === true;
    },
    [db],
    false
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return;
    }

    if (
      !enabledSetting ||
      Notification.permission !== 'granted' ||
      notifications.isLoading ||
      notifications.activeCount === 0
    ) {
      return;
    }

    // T-12-08: Throttle to once per browser session
    try {
      const alreadyShown = sessionStorage.getItem(SESSION_NOTIFICATION_SHOWN_KEY);
      if (alreadyShown === 'true') {
        return;
      }
    } catch {
      // sessionStorage might be restricted in some iframe or private contexts
      return;
    }

    const overdue = notifications.categoryCounts.overdue;
    const overload = notifications.categoryCounts.overload;
    const reminders =
      notifications.categoryCounts.reminder + notifications.categoryCounts['due-soon'];

    // T-12-07: Use summary counts rather than sensitive task/project descriptions
    const summaryText = `Bạn có ${overdue} việc quá hạn, ${overload} ngày quá tải, và ${reminders} việc cần xử lý.`;

    try {
      const desktopNotif = new window.Notification('Task Planner', {
        body: summaryText,
        icon: '/task-management/favicon.ico',
      });

      desktopNotif.onclick = () => {
        window.focus();
        desktopNotif.close();
      };

      sessionStorage.setItem(SESSION_NOTIFICATION_SHOWN_KEY, 'true');
    } catch (err) {
      console.warn('Desktop notification dispatch failed:', err);
    }
  }, [enabledSetting, notifications.isLoading, notifications.activeCount, notifications.categoryCounts]);
}
