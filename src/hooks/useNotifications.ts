import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import dayjs from 'dayjs';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import { getTodayDateString } from '../utils/date';
import { evaluateNotifications } from '../utils/notifications';
import { DISMISSED_ALERTS_KEY } from '../db/repositories/notificationRepo';
import {
  NOTIFICATION_SETTINGS_KEY,
  DEFAULT_NOTIFICATION_SETTINGS,
  type NotificationState,
  type AlertCategory,
  type NotificationSettings,
} from '../types/notifications';

const DEFAULT_CATEGORY_COUNTS: Record<AlertCategory, number> = {
  overdue: 0,
  overload: 0,
  'due-soon': 0,
  stale: 0,
  reminder: 0,
};

/**
 * Reactive Dexie live query hook aggregating multi-domain alerts (NOTIF-02, D-01, D-05).
 * Automatically recalculates active alerts and category counts whenever tasks,
 * projects, milestones, capacity rules, overrides, allocations, or dismissed
 * settings change in IndexedDB.
 */
export function useNotifications(
  targetDb: TaskPlannerDatabase = defaultDb
): NotificationState {
  const todayDate = useMemo(() => getTodayDateString(), []);
  const maxOverloadDate = useMemo(
    () => dayjs(todayDate, 'YYYY-MM-DD').add(14, 'day').format('YYYY-MM-DD'),
    [todayDate]
  );

  const liveData = useLiveQuery(
    async () => {
      const [
        tasks,
        projects,
        milestones,
        rules,
        overrides,
        allocations,
        workSessions,
        dismissedSetting,
        notificationSettingsRecord,
      ] = await Promise.all([
        targetDb.tasks.toArray(),
        targetDb.projects.toArray(),
        targetDb.milestones.toArray(),
        targetDb.capacityRules.toArray(),
        targetDb.capacityOverrides
          .where('date')
          .between(todayDate, maxOverloadDate, true, true)
          .toArray(),
        targetDb.plannedAllocations
          .where('date')
          .between(todayDate, maxOverloadDate, true, true)
          .toArray(),
        targetDb.workSessions
          .where('date')
          .between(todayDate, maxOverloadDate, true, true)
          .toArray(),
        targetDb.settings.get(DISMISSED_ALERTS_KEY),
        targetDb.settings.get(NOTIFICATION_SETTINGS_KEY),
      ]);

      const dismissedMap =
        dismissedSetting &&
        typeof dismissedSetting.value === 'object' &&
        dismissedSetting.value !== null
          ? (dismissedSetting.value as Record<string, string>)
          : {};

      const rawSettings =
        notificationSettingsRecord &&
        typeof notificationSettingsRecord.value === 'object' &&
        notificationSettingsRecord.value !== null
          ? (notificationSettingsRecord.value as Partial<NotificationSettings>)
          : undefined;

      const resolvedSettings: NotificationSettings = {
        ...DEFAULT_NOTIFICATION_SETTINGS,
        ...rawSettings,
        enabledCategories: {
          ...DEFAULT_NOTIFICATION_SETTINGS.enabledCategories,
          ...(rawSettings?.enabledCategories ?? {}),
        },
      };

      const items = evaluateNotifications({
        tasks,
        projects,
        milestones,
        rules,
        overrides,
        allocations,
        workSessions,
        dismissedMap,
        todayDate,
        settings: resolvedSettings,
      });

      const categoryCounts: Record<AlertCategory, number> = {
        overdue: 0,
        overload: 0,
        'due-soon': 0,
        stale: 0,
        reminder: 0,
      };
      for (const item of items) {
        categoryCounts[item.category]++;
      }

      return {
        items,
        activeCount: items.length,
        categoryCounts,
        isLoading: false,
      };
    },
    [targetDb, todayDate, maxOverloadDate]
  );

  return (
    liveData ?? {
      items: [],
      activeCount: 0,
      categoryCounts: { ...DEFAULT_CATEGORY_COUNTS },
      isLoading: true,
    }
  );
}
