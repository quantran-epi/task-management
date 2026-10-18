import { db as defaultDb, type TaskPlannerDatabase } from '../index';
import { updateTask } from './taskRepo';
import { updateProject } from './projectRepo';
import { updateMilestone } from './milestoneRepo';

export const DISMISSED_ALERTS_KEY = 'dismissedAlerts';

/**
 * Checks if an alert key is dismissible by the user (D-15).
 * Overdue tasks, capacity overloads, and due-soon deadlines cannot be dismissed.
 * Only stale tasks and custom reminders can be temporarily dismissed for the day.
 */
export function isAlertDismissible(alertKey: string): boolean {
  if (
    alertKey.startsWith('overdue:') ||
    alertKey.startsWith('overload:') ||
    alertKey.startsWith('due-soon:')
  ) {
    return false;
  }
  return alertKey.startsWith('stale:') || alertKey.startsWith('reminder:');
}

/**
 * Returns current dismissed alerts dictionary from local settings.
 */
export async function getDismissedAlerts(
  db: TaskPlannerDatabase = defaultDb
): Promise<Record<string, string>> {
  const setting = await db.settings.get(DISMISSED_ALERTS_KEY);
  if (!setting || typeof setting.value !== 'object' || setting.value === null) {
    return {};
  }
  return setting.value as Record<string, string>;
}

/**
 * Persists alert dismissal scoped to the current calendar day (D-14, D-15, D-16).
 * Automatically purges entries from prior calendar days to prevent unbounded dictionary growth (T-12-05).
 * Rejects non-dismissible alerts (overdue, overload) with an Error.
 */
export async function dismissAlertToday(
  alertKey: string,
  todayDate: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  if (!isAlertDismissible(alertKey)) {
    throw new Error('Cảnh báo quá hạn và quá tải không thể bỏ qua.');
  }

  await db.transaction('rw', db.settings, async () => {
    const existing = await db.settings.get(DISMISSED_ALERTS_KEY);
    const map =
      existing && typeof existing.value === 'object' && existing.value !== null
        ? (existing.value as Record<string, string>)
        : {};

    const cleaned: Record<string, string> = {};
    for (const [k, d] of Object.entries(map)) {
      if (d === todayDate) {
        cleaned[k] = d;
      }
    }
    cleaned[alertKey] = todayDate;

    await db.settings.put({
      key: DISMISSED_ALERTS_KEY,
      value: cleaned,
    });
  });
}

/**
 * Clears all dismissed alerts from settings.
 */
export async function clearDismissedAlerts(
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await db.settings.put({
    key: DISMISSED_ALERTS_KEY,
    value: {},
  });
}

/**
 * Removes a triggered reminder from its associated entity (Task, Project, or Milestone)
 * when marked as complete/done by the user from the Notification Drawer.
 */
export async function completeReminderAlert(
  alertId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  // Format: "reminder:entityType:entityId" or "reminder:entityType:entityId:reminderId"
  const parts = alertId.split(':');
  if (parts.length < 3 || parts[0] !== 'reminder') return;

  const entityType = parts[1];
  const entityId = parts[2];
  const reminderId = parts[3];

  if (!entityId) return;

  if (entityType === 'task') {
    const task = await db.tasks.get(entityId);
    if (!task) return;
    if (reminderId && task.reminders) {
      const updatedReminders = task.reminders.filter((r) => r.id !== reminderId);
      await updateTask(entityId, { reminders: updatedReminders }, db);
    } else {
      // Legacy single reminder removal
      await updateTask(
        entityId,
        {
          reminderDate: undefined,
          reminderNote: undefined,
          reminders: [],
        },
        db
      );
    }
  } else if (entityType === 'project') {
    const project = await db.projects.get(entityId);
    if (!project) return;
    if (reminderId && project.reminders) {
      const updatedReminders = project.reminders.filter((r) => r.id !== reminderId);
      await updateProject(entityId, { reminders: updatedReminders }, db);
    } else {
      await updateProject(
        entityId,
        {
          reminderDate: undefined,
          reminderNote: undefined,
          reminders: [],
        },
        db
      );
    }
  } else if (entityType === 'milestone') {
    const milestone = await db.milestones.get(entityId);
    if (!milestone) return;
    if (reminderId && milestone.reminders) {
      const updatedReminders = milestone.reminders.filter((r) => r.id !== reminderId);
      await updateMilestone(entityId, { reminders: updatedReminders }, db);
    } else {
      await updateMilestone(
        entityId,
        {
          reminderDate: undefined,
          reminderNote: undefined,
          reminders: [],
        },
        db
      );
    }
  }
}
