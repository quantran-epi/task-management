import dayjs from 'dayjs';
import type {
  Task,
  ChangeRequest,
  CapacityRule,
  CapacityOverride,
  PlannedAllocation,
  WorkSession,
  ReminderItem,
} from '../types/models';
import type { AlertNotificationItem, NotificationSettings } from '../types/notifications';
import { DEFAULT_NOTIFICATION_SETTINGS } from '../types/notifications';
import { getEffectiveDailyCapacity, calculateDayMetrics } from './capacity';
import { isTaskActive } from '../db/repositories/allocationRepo';
import { evaluateDailyCapacitySpentAlert } from './timerAlerts';

export interface EvaluateNotificationsParams {
  tasks: Task[];
  changeRequests: ChangeRequest[];
  rules: CapacityRule[];
  overrides: CapacityOverride[];
  allocations: PlannedAllocation[];
  workSessions?: WorkSession[] | undefined;
  dismissedMap: Record<string, string>;
  todayDate: string;
  currentTime?: string | undefined;
  settings?: NotificationSettings | undefined;
}

/**
 * Checks whether a reminder should trigger based on date, optional time, and wall clock (D-06, D-08, NOTIF-06).
 */
export function isReminderTriggered(
  reminder: ReminderItem,
  todayDate: string,
  currentTime: string
): boolean {
  if (!reminder.date) return false;
  if (reminder.date < todayDate) return true; // Past trigger remains active per D-08
  if (reminder.date === todayDate) {
    if (!reminder.time) return true; // Triggers from 00:00 per D-06
    return currentTime >= reminder.time; // Triggers once clock reaches target HH:mm
  }
  return false;
}

/**
 * Pure alert evaluation and sorting engine (D-05, D-09, D-10, D-11, D-12, D-13, NOTIF-03, NOTIF-04, NOTIF-05).
 * Evaluates active alerts from local records:
 * 1. Overdue tasks (priorityOrder: 1, non-dismissible)
 * 2. 14-day capacity overload (priorityOrder: 2, non-dismissible)
 * 3. Due soon tasks (priorityOrder: 3, non-dismissible)
 * 4. Stale tasks (priorityOrder: 4, dismissible for today)
 * 5. Custom reminders (priorityOrder: 5, dismissible for today)
 */
export function evaluateNotifications(params: EvaluateNotificationsParams): AlertNotificationItem[] {
  const { tasks, changeRequests, rules, overrides, allocations, dismissedMap, todayDate } =
    params;
  const currentTime = params.currentTime ?? dayjs().format('HH:mm');
  const effectiveSettings = params.settings ?? DEFAULT_NOTIFICATION_SETTINGS;

  const crMap = new Map<string, string>(changeRequests.map((cr) => [cr.id, cr.code]));
  const taskMap = new Map<string, Task>(tasks.map((t) => [t.id, t]));
  const results: AlertNotificationItem[] = [];

  // 1. Overdue tasks (deadline < todayDate and status not Done/Cancelled)
  if (effectiveSettings.enabledCategories.overdue) {
    for (const task of tasks) {
      if (task.status === 'Done' || task.status === 'Cancelled') continue;
      if (task.deadline && task.deadline < todayDate) {
        const daysOverdue = dayjs(todayDate, 'YYYY-MM-DD').diff(
          dayjs(task.deadline, 'YYYY-MM-DD'),
          'day'
        );
        results.push({
          id: `overdue:task:${task.id}`,
          category: 'overdue',
          title: task.name,
          subtitle: crMap.get(task.crId),
          date: task.deadline,
          tagColor: 'error',
          tagLabel: `Quá hạn ${daysOverdue} ngày`,
          entityType: 'task',
          entityId: task.id,
          canDismiss: false,
          priorityOrder: 1,
          task,
        });
      }
    }
  }

  // 2. Capacity Overload (14-day horizon from todayDate to todayDate + 14d)
  const allocationsByDate = new Map<string, PlannedAllocation[]>();
  for (const alloc of allocations) {
    const list = allocationsByDate.get(alloc.date);
    if (list) {
      list.push(alloc);
    } else {
      allocationsByDate.set(alloc.date, [alloc]);
    }
  }

  // Work session spent minutes by date
  const spentByDate = new Map<string, number>();
  if (params.workSessions && params.workSessions.length > 0) {
    for (const session of params.workSessions) {
      const current = spentByDate.get(session.date) ?? 0;
      spentByDate.set(session.date, current + session.durationMinutes);
    }
  }

  for (let i = 0; i <= 14; i++) {
    const checkDate = dayjs(todayDate, 'YYYY-MM-DD').add(i, 'day').format('YYYY-MM-DD');
    const capMinutes = getEffectiveDailyCapacity(checkDate, rules, overrides);
    const dayAllocations = allocationsByDate.get(checkDate) ?? [];

    let activeMinutes = 0;
    let activeTaskCount = 0;

    for (const alloc of dayAllocations) {
      const task = taskMap.get(alloc.taskId);
      if (task && isTaskActive(task.status)) {
        activeMinutes += alloc.allocatedMinutes;
        activeTaskCount++;
      }
    }

    const metrics = calculateDayMetrics(checkDate, capMinutes, activeMinutes, 0, activeTaskCount);

    if (effectiveSettings.enabledCategories.overload) {
      const overloadThresholdRatio = effectiveSettings.capacityOverloadThreshold / 100;
      const isCapacityOverloaded =
        capMinutes === 0
          ? activeMinutes > 0
          : activeMinutes > capMinutes * overloadThresholdRatio;

      if (isCapacityOverloaded) {
        const allocHours = Math.round((activeMinutes / 60) * 10) / 10;
        const capHours = Math.round((capMinutes / 60) * 10) / 10;
        results.push({
          id: `overload:date:${checkDate}`,
          category: 'overload',
          title: `Quá tải ngày ${checkDate}`,
          subtitle: `${activeTaskCount} tác vụ được phân bổ`,
          date: checkDate,
          tagColor: 'warning',
          tagLabel: `Quá tải ${metrics.percent}% (${allocHours}h / ${capHours}h)`,
          entityType: 'capacity',
          canDismiss: false,
          priorityOrder: 2,
        });
      }
    }

    // Check if recorded work session spent time exceeded daily capacity (TIMER-06, D-07)
    if (effectiveSettings.enabledCategories.timer) {
      const daySpent = spentByDate.get(checkDate) ?? 0;
      if (daySpent > 0) {
        const spentAlert = evaluateDailyCapacitySpentAlert(checkDate, daySpent, capMinutes);
        if (spentAlert) {
          results.push(spentAlert);
        }
      }
    }
  }

  // 3. Due Soon tasks (deadline within dueSoonDays from todayDate)
  if (effectiveSettings.enabledCategories.dueSoon) {
    for (const task of tasks) {
      if (task.status === 'Done' || task.status === 'Cancelled') continue;
      if (task.deadline && task.deadline >= todayDate) {
        const diffDays = dayjs(task.deadline, 'YYYY-MM-DD').diff(
          dayjs(todayDate, 'YYYY-MM-DD'),
          'day'
        );
        if (diffDays <= effectiveSettings.dueSoonDays) {
          const isToday = diffDays === 0;
          const isTomorrow = diffDays === 1;
          const tagLabel = isToday
            ? 'Đến hạn hôm nay'
            : isTomorrow
            ? 'Đến hạn ngày mai'
            : `Đến hạn sau ${diffDays} ngày`;
          results.push({
            id: `due-soon:task:${task.id}`,
            category: 'due-soon',
            title: task.name,
            subtitle: crMap.get(task.crId),
            date: task.deadline,
            tagColor: isToday ? 'processing' : 'blue',
            tagLabel,
            entityType: 'task',
            entityId: task.id,
            canDismiss: false,
            priorityOrder: 3,
            task,
          });
        }
      }
    }
  }

  // 4. Stale tasks (In Progress or In Review, untouched > staleTaskDays)
  if (effectiveSettings.enabledCategories.stale) {
    for (const task of tasks) {
      if (task.status !== 'In Progress' && task.status !== 'In Review') continue;
      const lastUpdatedDate = task.updatedAt ? task.updatedAt.slice(0, 10) : todayDate;
      const diffDays = dayjs(todayDate, 'YYYY-MM-DD').diff(
        dayjs(lastUpdatedDate, 'YYYY-MM-DD'),
        'day'
      );
      if (diffDays > effectiveSettings.staleTaskDays) {
        const alertKey = `stale:task:${task.id}`;
        if (dismissedMap[alertKey] !== todayDate) {
          results.push({
            id: alertKey,
            category: 'stale',
            title: task.name,
            subtitle: crMap.get(task.crId),
            date: lastUpdatedDate,
            tagColor: 'purple',
            tagLabel: `Chưa cập nhật ${diffDays} ngày`,
            entityType: 'task',
            entityId: task.id,
            canDismiss: true,
            priorityOrder: 4,
            task,
          });
        }
      }
    }
  }

  // 5. Custom reminders (CR, Task) per D-06, D-07, D-08, NOTIF-06.
  // CR reminders come from the CR's own `reminders` array; there is no intermediate tier.
  if (effectiveSettings.enabledCategories.reminders) {
    for (const cr of changeRequests) {
      if (cr.status === 'Done' || cr.status === 'Cancelled') continue;
      if (cr.reminders && cr.reminders.length > 0) {
        for (const reminder of cr.reminders) {
          if (isReminderTriggered(reminder, todayDate, currentTime)) {
            const alertKey = `reminder:cr:${cr.id}:${reminder.id}`;
            if (dismissedMap[alertKey] === todayDate) continue;
            results.push({
              id: alertKey,
              category: 'reminder',
              title: cr.name,
              subtitle: reminder.note || cr.reminderNote,
              date: reminder.time ? `${reminder.time} ${reminder.date}` : reminder.date,
              tagColor: 'gold',
              tagLabel: reminder.time ? `Nhắc nhở (${reminder.time})` : 'Nhắc nhở',
              entityType: 'cr',
              entityId: cr.id,
              canDismiss: true,
              priorityOrder: 5,
            });
          }
        }
      } else if (cr.reminderDate) {
        const legacyReminder: ReminderItem = {
          id: '',
          date: cr.reminderDate,
        };
        if (cr.reminderNote) legacyReminder.note = cr.reminderNote;
        if (isReminderTriggered(legacyReminder, todayDate, currentTime)) {
          const alertKey = `reminder:cr:${cr.id}`;
          if (dismissedMap[alertKey] === todayDate) continue;
          results.push({
            id: alertKey,
            category: 'reminder',
            title: cr.name,
            subtitle: cr.reminderNote,
            date: cr.reminderDate,
            tagColor: 'gold',
            tagLabel: 'Nhắc nhở',
            entityType: 'cr',
            entityId: cr.id,
            canDismiss: true,
            priorityOrder: 5,
          });
        }
      }
    }

  for (const task of tasks) {
    if (task.status === 'Done' || task.status === 'Cancelled') continue;
    if (task.reminders && task.reminders.length > 0) {
      for (const reminder of task.reminders) {
        if (isReminderTriggered(reminder, todayDate, currentTime)) {
          const alertKey = `reminder:task:${task.id}:${reminder.id}`;
          if (dismissedMap[alertKey] === todayDate) continue;
          results.push({
            id: alertKey,
            category: 'reminder',
            title: task.name,
            subtitle: reminder.note || task.reminderNote || crMap.get(task.crId),
            date: reminder.time ? `${reminder.time} ${reminder.date}` : reminder.date,
            tagColor: 'gold',
            tagLabel: reminder.time ? `Nhắc nhở (${reminder.time})` : 'Nhắc nhở',
            entityType: 'task',
            entityId: task.id,
            canDismiss: true,
            priorityOrder: 5,
            task,
          });
        }
      }
    } else if (task.reminderDate) {
      const legacyReminder: ReminderItem = {
        id: '',
        date: task.reminderDate,
      };
      if (task.reminderNote) legacyReminder.note = task.reminderNote;
      if (isReminderTriggered(legacyReminder, todayDate, currentTime)) {
        const alertKey = `reminder:task:${task.id}`;
        if (dismissedMap[alertKey] === todayDate) continue;
        results.push({
          id: alertKey,
          category: 'reminder',
          title: task.name,
          subtitle: task.reminderNote || crMap.get(task.crId),
          date: task.reminderDate,
          tagColor: 'gold',
          tagLabel: 'Nhắc nhở',
          entityType: 'task',
          entityId: task.id,
          canDismiss: true,
          priorityOrder: 5,
          task,
        });
      }
    }
  }
  }

  // Final sort: priorityOrder ascending, then date ascending, then id
  return results.sort((a, b) => {
    if (a.priorityOrder !== b.priorityOrder) {
      return a.priorityOrder - b.priorityOrder;
    }
    if (a.date && b.date && a.date !== b.date) {
      return a.date.localeCompare(b.date);
    }
    return a.id.localeCompare(b.id);
  });
}
