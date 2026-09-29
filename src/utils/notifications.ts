import dayjs from 'dayjs';
import type {
  Task,
  Project,
  Milestone,
  CapacityRule,
  CapacityOverride,
  PlannedAllocation,
  WorkSession,
  ReminderItem,
} from '../types/models';
import type { AlertNotificationItem } from '../types/notifications';
import { getEffectiveDailyCapacity, calculateDayMetrics } from './capacity';
import { isTaskActive } from '../db/repositories/allocationRepo';
import { evaluateDailyCapacitySpentAlert } from './timerAlerts';

export interface EvaluateNotificationsParams {
  tasks: Task[];
  projects: Project[];
  milestones: Milestone[];
  rules: CapacityRule[];
  overrides: CapacityOverride[];
  allocations: PlannedAllocation[];
  workSessions?: WorkSession[] | undefined;
  dismissedMap: Record<string, string>;
  todayDate: string;
  currentTime?: string | undefined;
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
  const { tasks, projects, milestones, rules, overrides, allocations, dismissedMap, todayDate } =
    params;
  const currentTime = params.currentTime ?? dayjs().format('HH:mm');

  const tomorrowDate = dayjs(todayDate, 'YYYY-MM-DD').add(1, 'day').format('YYYY-MM-DD');
  const projectMap = new Map<string, string>(projects.map((p) => [p.id, p.name]));
  const taskMap = new Map<string, Task>(tasks.map((t) => [t.id, t]));
  const results: AlertNotificationItem[] = [];

  // 1. Overdue tasks (deadline < todayDate and status not Done/Cancelled)
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
        subtitle: task.projectId ? projectMap.get(task.projectId) : undefined,
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

    if (metrics.isOverloaded) {
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

    // Check if recorded work session spent time exceeded daily capacity (TIMER-06, D-07)
    const daySpent = spentByDate.get(checkDate) ?? 0;
    if (daySpent > 0) {
      const spentAlert = evaluateDailyCapacitySpentAlert(checkDate, daySpent, capMinutes);
      if (spentAlert) {
        results.push(spentAlert);
      }
    }
  }

  // 3. Due Soon tasks (deadline === todayDate or deadline === tomorrowDate)
  for (const task of tasks) {
    if (task.status === 'Done' || task.status === 'Cancelled') continue;
    if (task.deadline === todayDate || task.deadline === tomorrowDate) {
      const isToday = task.deadline === todayDate;
      results.push({
        id: `due-soon:task:${task.id}`,
        category: 'due-soon',
        title: task.name,
        subtitle: task.projectId ? projectMap.get(task.projectId) : undefined,
        date: task.deadline,
        tagColor: isToday ? 'processing' : 'blue',
        tagLabel: isToday ? 'Đến hạn hôm nay' : 'Đến hạn ngày mai',
        entityType: 'task',
        entityId: task.id,
        canDismiss: false,
        priorityOrder: 3,
        task,
      });
    }
  }

  // 4. Stale tasks (In Progress or In Review, untouched > 5 days)
  for (const task of tasks) {
    if (task.status !== 'In Progress' && task.status !== 'In Review') continue;
    const lastUpdatedDate = task.updatedAt ? task.updatedAt.slice(0, 10) : todayDate;
    const diffDays = dayjs(todayDate, 'YYYY-MM-DD').diff(
      dayjs(lastUpdatedDate, 'YYYY-MM-DD'),
      'day'
    );
    if (diffDays > 5) {
      const alertKey = `stale:task:${task.id}`;
      if (dismissedMap[alertKey] !== todayDate) {
        results.push({
          id: alertKey,
          category: 'stale',
          title: task.name,
          subtitle: task.projectId ? projectMap.get(task.projectId) : undefined,
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

  // 5. Custom reminders (Project, Milestone, Task) per D-06, D-07, D-08, NOTIF-06
  for (const project of projects) {
    if (project.status === 'Done' || project.status === 'Cancelled') continue;
    if (project.reminders && project.reminders.length > 0) {
      for (const reminder of project.reminders) {
        if (isReminderTriggered(reminder, todayDate, currentTime)) {
          const alertKey = `reminder:project:${project.id}:${reminder.id}`;
          if (dismissedMap[alertKey] === todayDate) continue;
          results.push({
            id: alertKey,
            category: 'reminder',
            title: project.name,
            subtitle: reminder.note || project.reminderNote,
            date: reminder.time ? `${reminder.time} ${reminder.date}` : reminder.date,
            tagColor: 'gold',
            tagLabel: reminder.time ? `Nhắc nhở (${reminder.time})` : 'Nhắc nhở',
            entityType: 'project',
            entityId: project.id,
            canDismiss: true,
            priorityOrder: 5,
          });
        }
      }
    } else if (project.reminderDate) {
      const legacyReminder: ReminderItem = {
        id: '',
        date: project.reminderDate,
      };
      if (project.reminderNote) legacyReminder.note = project.reminderNote;
      if (isReminderTriggered(legacyReminder, todayDate, currentTime)) {
        const alertKey = `reminder:project:${project.id}`;
        if (dismissedMap[alertKey] === todayDate) continue;
        results.push({
          id: alertKey,
          category: 'reminder',
          title: project.name,
          subtitle: project.reminderNote,
          date: project.reminderDate,
          tagColor: 'gold',
          tagLabel: 'Nhắc nhở',
          entityType: 'project',
          entityId: project.id,
          canDismiss: true,
          priorityOrder: 5,
        });
      }
    }
  }

  for (const milestone of milestones) {
    if (milestone.status === 'Done' || milestone.status === 'Cancelled') continue;
    if (milestone.reminders && milestone.reminders.length > 0) {
      for (const reminder of milestone.reminders) {
        if (isReminderTriggered(reminder, todayDate, currentTime)) {
          const alertKey = `reminder:milestone:${milestone.id}:${reminder.id}`;
          if (dismissedMap[alertKey] === todayDate) continue;
          results.push({
            id: alertKey,
            category: 'reminder',
            title: milestone.name,
            subtitle:
              reminder.note ||
              milestone.reminderNote ||
              (milestone.projectId ? projectMap.get(milestone.projectId) : undefined),
            date: reminder.time ? `${reminder.time} ${reminder.date}` : reminder.date,
            tagColor: 'gold',
            tagLabel: reminder.time ? `Nhắc nhở (${reminder.time})` : 'Nhắc nhở',
            entityType: 'milestone',
            entityId: milestone.id,
            canDismiss: true,
            priorityOrder: 5,
          });
        }
      }
    } else if (milestone.reminderDate) {
      const legacyReminder: ReminderItem = {
        id: '',
        date: milestone.reminderDate,
      };
      if (milestone.reminderNote) legacyReminder.note = milestone.reminderNote;
      if (isReminderTriggered(legacyReminder, todayDate, currentTime)) {
        const alertKey = `reminder:milestone:${milestone.id}`;
        if (dismissedMap[alertKey] === todayDate) continue;
        results.push({
          id: alertKey,
          category: 'reminder',
          title: milestone.name,
          subtitle:
            milestone.reminderNote ||
            (milestone.projectId ? projectMap.get(milestone.projectId) : undefined),
          date: milestone.reminderDate,
          tagColor: 'gold',
          tagLabel: 'Nhắc nhở',
          entityType: 'milestone',
          entityId: milestone.id,
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
            subtitle:
              reminder.note ||
              task.reminderNote ||
              (task.projectId ? projectMap.get(task.projectId) : undefined),
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
          subtitle:
            task.reminderNote || (task.projectId ? projectMap.get(task.projectId) : undefined),
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
