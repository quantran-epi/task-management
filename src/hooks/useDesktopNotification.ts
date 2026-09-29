import { useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import dayjs from 'dayjs';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import {
  NOTIFICATION_SETTINGS_KEY,
  DEFAULT_NOTIFICATION_SETTINGS,
  type NotificationState,
  type NotificationSettings,
} from '../types/notifications';

export const SESSION_NOTIFICATION_SHOWN_KEY = 'desktop_notification_shown';

export interface UseDesktopNotificationOptions {
  notifications: NotificationState;
  db?: TaskPlannerDatabase;
}

/**
 * Triggers browser desktop notifications (D-09, D-12, D-18, D-19, NOTIF-07, NOTIF-08).
 * 1. Startup summary: aggregated counts on initial load, throttled once per session via sessionStorage (T-12-07, T-12-08).
 * 2. Live reminder ticker: checks every 30s for minute-exact reminders and dispatches discrete alerts.
 * Respects user preferences in db.settings, checks Notification.permission, and sets requireInteraction.
 */
export function useDesktopNotification({
  notifications,
  db = defaultDb,
}: UseDesktopNotificationOptions): void {
  const notifiedRemindersRef = useRef<Set<string>>(new Set());

  const settingsData = useLiveQuery(
    async () => {
      const [legacySetting, fullSettingsRecord] = await Promise.all([
        db.settings.get('browserNotificationsEnabled'),
        db.settings.get(NOTIFICATION_SETTINGS_KEY),
      ]);

      const rawSettings =
        fullSettingsRecord?.value && typeof fullSettingsRecord.value === 'object'
          ? (fullSettingsRecord.value as Partial<NotificationSettings>)
          : undefined;

      const resolvedSettings: NotificationSettings = {
        ...DEFAULT_NOTIFICATION_SETTINGS,
        ...rawSettings,
        enabledCategories: {
          ...DEFAULT_NOTIFICATION_SETTINGS.enabledCategories,
          ...(rawSettings?.enabledCategories ?? {}),
        },
      };

      const isEnabled =
        rawSettings?.browserNotificationsEnabled ?? legacySetting?.value === true;

      return {
        isEnabled,
        settings: resolvedSettings,
      };
    },
    [db],
    {
      isEnabled: false,
      settings: DEFAULT_NOTIFICATION_SETTINGS,
    }
  );

  // 1. Startup aggregated summary notification
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return;
    }

    if (
      !settingsData.isEnabled ||
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
    const stale = notifications.categoryCounts.stale;
    const reminders =
      notifications.categoryCounts.reminder + notifications.categoryCounts['due-soon'];
    const totalPending = reminders + stale;

    // T-12-07: Use summary counts rather than sensitive task/project descriptions
    const summaryText = `Bạn có ${overdue} việc quá hạn, ${overload} ngày quá tải, và ${totalPending} việc cần xử lý.`;

    try {
      const desktopNotif = new window.Notification('Task Planner', {
        body: summaryText,
        icon: '/task-management/favicon.ico',
        requireInteraction: settingsData.settings.requireInteractionEnabled,
      });

      desktopNotif.onclick = () => {
        window.focus();
        desktopNotif.close();
      };

      sessionStorage.setItem(SESSION_NOTIFICATION_SHOWN_KEY, 'true');
    } catch (err) {
      console.warn('Desktop notification dispatch failed:', err);
    }
  }, [
    settingsData.isEnabled,
    settingsData.settings.requireInteractionEnabled,
    notifications.isLoading,
    notifications.activeCount,
    notifications.categoryCounts,
  ]);

  // 2. Live reminder interval ticker (checks every 30s for minute-exact alerts)
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return;
    }

    const checkLiveReminders = () => {
      if (
        !settingsData.isEnabled ||
        Notification.permission !== 'granted' ||
        notifications.isLoading ||
        !settingsData.settings.enabledCategories.reminders
      ) {
        return;
      }

      const currentClock = dayjs().format('HH:mm');
      const currentDate = dayjs().format('YYYY-MM-DD');
      const currentMinuteTarget = `${currentClock} ${currentDate}`;

      for (const item of notifications.items) {
        if (item.category !== 'reminder') continue;
        if (item.date === currentMinuteTarget) {
          const reminderKey = `${item.id}:${currentMinuteTarget}`;
          if (notifiedRemindersRef.current.has(reminderKey)) continue;

          try {
            const notif = new window.Notification(item.title, {
              body: item.subtitle || 'Đã đến giờ nhắc nhở!',
              icon: '/task-management/favicon.ico',
              requireInteraction: settingsData.settings.requireInteractionEnabled,
            });

            notif.onclick = () => {
              window.focus();
              notif.close();
            };

            notifiedRemindersRef.current.add(reminderKey);
          } catch (err) {
            console.warn('Live reminder notification failed:', err);
          }
        }
      }
    };

    checkLiveReminders();
    const intervalId = window.setInterval(checkLiveReminders, 30000);
    return () => window.clearInterval(intervalId);
  }, [
    settingsData.isEnabled,
    settingsData.settings.requireInteractionEnabled,
    settingsData.settings.enabledCategories.reminders,
    notifications.isLoading,
    notifications.items,
  ]);
}
