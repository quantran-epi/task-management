import { useEffect, useRef } from 'react';
import { message } from 'antd';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type TaskPlannerDatabase } from '../db';
import { useTimer } from '../hooks/useTimer';
import { getTodayDateString } from '../utils/date';
import { evaluateLiveTaskDailyAllocationAlert } from '../utils/timerAlerts';
import { sendDesktopNotification } from '../utils/desktopNotification';
import {
  NOTIFICATION_SETTINGS_KEY,
  DEFAULT_NOTIFICATION_SETTINGS,
  type NotificationSettings,
} from '../types/notifications';

export interface UseTimerAlertMonitorOptions {
  database?: TaskPlannerDatabase;
}

/**
 * Global background monitor for active running timers against daily allocation or task estimate.
 * Triggers in-app warning message and desktop notification immediately when threshold is reached
 * without waiting for user to stop or pause the timer.
 * Runs in AppShell so alerts fire across all pages/views in the application.
 */
export function useTimerAlertMonitor(options: UseTimerAlertMonitorOptions = {}): void {
  const targetDb = options.database || db;
  const { activeTimers, getElapsedSeconds, tick } = useTimer();
  const alertedTasksRef = useRef<Set<string>>(new Set());

  const todayStr = getTodayDateString();

  // Query today's allocations and work sessions
  const liveMonitoringData = useLiveQuery(async () => {
    if (!targetDb || activeTimers.length === 0) {
      return {
        tasksMap: new Map(),
        allocationsMap: new Map<string, number>(),
        todaySpentMap: new Map<string, number>(),
        totalSpentMap: new Map<string, number>(),
        desktopNotifEnabled: false,
        requireInteractionEnabled: DEFAULT_NOTIFICATION_SETTINGS.requireInteractionEnabled,
      };
    }

    const runningTaskIds = activeTimers
      .filter((t) => t.status === 'running')
      .map((t) => t.taskId);

    if (runningTaskIds.length === 0) {
      return {
        tasksMap: new Map(),
        allocationsMap: new Map<string, number>(),
        todaySpentMap: new Map<string, number>(),
        totalSpentMap: new Map<string, number>(),
        desktopNotifEnabled: false,
        requireInteractionEnabled: DEFAULT_NOTIFICATION_SETTINGS.requireInteractionEnabled,
      };
    }

    const [tasks, allocations, todaySessions, allSessions, legacySetting, notifSettingRecord] =
      await Promise.all([
        targetDb.tasks.bulkGet(runningTaskIds),
        targetDb.plannedAllocations.where('date').equals(todayStr).toArray(),
        targetDb.workSessions.where('date').equals(todayStr).toArray(),
        targetDb.workSessions.where('taskId').anyOf(runningTaskIds).toArray(),
        targetDb.settings.get('browserNotificationsEnabled'),
        targetDb.settings.get(NOTIFICATION_SETTINGS_KEY),
      ]);

    const rawSettings =
      notifSettingRecord?.value && typeof notifSettingRecord.value === 'object'
        ? (notifSettingRecord.value as Partial<NotificationSettings>)
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
    const timerCategoryEnabled = resolvedSettings.enabledCategories.timer !== false;

    const tasksMap = new Map();
    for (const t of tasks) {
      if (t) tasksMap.set(t.id, t);
    }

    const allocationsMap = new Map<string, number>();
    for (const a of allocations) {
      if (runningTaskIds.includes(a.taskId)) {
        allocationsMap.set(a.taskId, (allocationsMap.get(a.taskId) || 0) + a.allocatedMinutes);
      }
    }

    const todaySpentMap = new Map<string, number>();
    for (const s of todaySessions) {
      if (runningTaskIds.includes(s.taskId)) {
        todaySpentMap.set(s.taskId, (todaySpentMap.get(s.taskId) || 0) + s.durationMinutes);
      }
    }

    const totalSpentMap = new Map<string, number>();
    for (const s of allSessions) {
      totalSpentMap.set(s.taskId, (totalSpentMap.get(s.taskId) || 0) + s.durationMinutes);
    }

    return {
      tasksMap,
      allocationsMap,
      todaySpentMap,
      totalSpentMap,
      desktopNotifEnabled: isEnabled && timerCategoryEnabled,
      requireInteractionEnabled: resolvedSettings.requireInteractionEnabled,
    };
  }, [targetDb, activeTimers, todayStr]);

  useEffect(() => {
    // Clean up alerted set for tasks that are no longer active
    const activeIds = new Set(activeTimers.map((t) => t.taskId));
    for (const taskId of alertedTasksRef.current) {
      if (!activeIds.has(taskId)) {
        alertedTasksRef.current.delete(taskId);
      }
    }

    if (!liveMonitoringData) return;
    const {
      tasksMap,
      allocationsMap,
      todaySpentMap,
      totalSpentMap,
      desktopNotifEnabled,
      requireInteractionEnabled,
    } = liveMonitoringData;

    for (const timer of activeTimers) {
      if (timer.status !== 'running') continue;
      if (alertedTasksRef.current.has(timer.taskId)) continue;

      const task = tasksMap.get(timer.taskId);
      if (!task) continue;

      const todayAllocated = allocationsMap.get(timer.taskId);
      const todaySpent = todaySpentMap.get(timer.taskId) || 0;
      const totalSpent = totalSpentMap.get(timer.taskId) || 0;
      const elapsedSeconds = getElapsedSeconds(timer.taskId);

      const alert = evaluateLiveTaskDailyAllocationAlert(
        task,
        todayAllocated,
        todaySpent,
        elapsedSeconds,
        totalSpent
      );

      if (alert.shouldAlert) {
        alertedTasksRef.current.add(timer.taskId);
        // 1. Ant Design in-app message
        message.warning(alert.message);

        // 2. Desktop notification if granted and enabled
        if (desktopNotifEnabled) {
          sendDesktopNotification({
            title: 'Vượt thời gian phân bổ',
            body: alert.message,
            requireInteraction: requireInteractionEnabled,
          }).catch((err) => {
            console.warn('Live timer desktop notification failed:', err);
          });
        }
      }
    }
  }, [activeTimers, liveMonitoringData, getElapsedSeconds, tick]);
}
