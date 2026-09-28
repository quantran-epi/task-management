import dayjs from 'dayjs';
import type {
  Task,
  Project,
  Milestone,
  CapacityRule,
  CapacityOverride,
  PlannedAllocation,
} from '../types/models';
import type { AlertNotificationItem } from '../types/notifications';
import { getEffectiveDailyCapacity, calculateDayMetrics } from './capacity';
import { isTaskActive } from '../db/repositories/allocationRepo';

export interface EvaluateNotificationsParams {
  tasks: Task[];
  projects: Project[];
  milestones: Milestone[];
  rules: CapacityRule[];
  overrides: CapacityOverride[];
  allocations: PlannedAllocation[];
  dismissedMap: Record<string, string>;
  todayDate: string;
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

  // 5. Custom reminders (Project, Milestone, Task where reminderDate <= todayDate)
  for (const project of projects) {
    if (project.status === 'Done' || project.status === 'Cancelled') continue;
    if (project.reminderDate && project.reminderDate <= todayDate) {
      const alertKey = `reminder:project:${project.id}`;
      if (dismissedMap[alertKey] !== todayDate) {
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
    if (milestone.reminderDate && milestone.reminderDate <= todayDate) {
      const alertKey = `reminder:milestone:${milestone.id}`;
      if (dismissedMap[alertKey] !== todayDate) {
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
    if (task.reminderDate && task.reminderDate <= todayDate) {
      const alertKey = `reminder:task:${task.id}`;
      if (dismissedMap[alertKey] !== todayDate) {
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
