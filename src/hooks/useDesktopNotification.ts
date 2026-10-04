import { useEffect, useRef, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import {
  sendDesktopNotification,
  isTauriEnvironment,
  isNotificationPermissionGranted,
} from '../utils/desktopNotification';
import {
  NOTIFICATION_SETTINGS_KEY,
  DEFAULT_NOTIFICATION_SETTINGS,
  type NotificationState,
  type NotificationSettings,
  type AlertCategory,
} from '../types/notifications';

export const SESSION_NOTIFICATION_SHOWN_KEY = 'desktop_notification_shown';

export interface UseDesktopNotificationOptions {
  notifications: NotificationState;
  db?: TaskPlannerDatabase;
}

function isCategoryEnabled(category: AlertCategory, settings: NotificationSettings): boolean {
  switch (category) {
    case 'reminder':
      return settings.enabledCategories.reminders;
    case 'overdue':
      return settings.enabledCategories.overdue;
    case 'overload':
      return settings.enabledCategories.overload;
    case 'due-soon':
      return settings.enabledCategories.dueSoon;
    case 'stale':
      return settings.enabledCategories.stale;
    default:
      return true;
  }
}

/**
 * Triggers browser desktop notifications (D-09, D-12, D-18, D-19, NOTIF-07, NOTIF-08).
 * 1. Startup summary: aggregated counts on initial load, throttled once per session via sessionStorage (T-12-07, T-12-08).
 * 2. Real-time alert dispatch: dispatches discrete alerts for reminders and newly active alerts across all categories.
 * Deduplicates dispatched alerts using notifiedAlertIdsRef to avoid notification storms.
 */
export function useDesktopNotification({
  notifications,
  db = defaultDb,
}: UseDesktopNotificationOptions): void {
  const notifiedAlertIdsRef = useRef<Set<string>>(new Set());
  const initialLoadHandledRef = useRef(false);

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

  const checkAndDispatchAlerts = useCallback(async () => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!isTauriEnvironment() && !('Notification' in window)) {
      return;
    }

    if (!settingsData.isEnabled || notifications.isLoading) {
      return;
    }

    const permissionGranted = await isNotificationPermissionGranted();
    if (!permissionGranted) {
      return;
    }

    // 1. Startup summary: check once on initial active load
    if (!initialLoadHandledRef.current) {
      initialLoadHandledRef.current = true;

      let alreadyShown = false;
      try {
        alreadyShown = sessionStorage.getItem(SESSION_NOTIFICATION_SHOWN_KEY) === 'true';
      } catch {
        // sessionStorage may be restricted in private/sandboxed contexts
      }

      if (!alreadyShown && notifications.activeCount > 0) {
        const overdue = notifications.categoryCounts.overdue;
        const overload = notifications.categoryCounts.overload;
        const stale = notifications.categoryCounts.stale;
        const reminders =
          notifications.categoryCounts.reminder + notifications.categoryCounts['due-soon'];
        const totalPending = reminders + stale;

        const summaryText = `Bạn có ${overdue} việc quá hạn, ${overload} ngày quá tải, và ${totalPending} việc cần xử lý.`;

        sendDesktopNotification({
          title: 'PlannerMate',
          body: summaryText,
          requireInteraction: settingsData.settings.requireInteractionEnabled,
        });

        try {
          sessionStorage.setItem(SESSION_NOTIFICATION_SHOWN_KEY, 'true');
        } catch {
          // ignore
        }

        // Seed notifiedAlertIdsRef with existing non-reminder items to prevent spamming
        // OS notifications for all backlog tasks on startup summary
        for (const item of notifications.items) {
          if (item.category !== 'reminder') {
            notifiedAlertIdsRef.current.add(item.id);
          }
        }
      }
    }

    // 2. Real-time alert dispatch across all enabled categories
    for (const item of notifications.items) {
      if (!isCategoryEnabled(item.category, settingsData.settings)) {
        continue;
      }

      if (notifiedAlertIdsRef.current.has(item.id)) {
        continue;
      }

      const title =
        item.category === 'reminder'
          ? item.title
          : `[${item.tagLabel || 'Cảnh báo'}] ${item.title}`;
      const body = item.subtitle || item.tagLabel || 'Thông báo từ PlannerMate';

      sendDesktopNotification({
        title,
        body,
        tag: item.id,
        requireInteraction: settingsData.settings.requireInteractionEnabled,
      });

      notifiedAlertIdsRef.current.add(item.id);
    }
  }, [
    settingsData.isEnabled,
    settingsData.settings,
    notifications.isLoading,
    notifications.activeCount,
    notifications.categoryCounts,
    notifications.items,
  ]);

  useEffect(() => {
    checkAndDispatchAlerts();
    const intervalId = window.setInterval(checkAndDispatchAlerts, 10000);
    return () => window.clearInterval(intervalId);
  }, [checkAndDispatchAlerts]);
}
