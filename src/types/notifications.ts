import type { Task } from './models';

export const NOTIFICATION_SETTINGS_KEY = 'notification_settings';

export interface NotificationCategoryConfig {
  overdue: boolean;
  dueSoon: boolean;
  overload: boolean;
  stale: boolean;
  reminders: boolean;
  timer: boolean;
}

export interface NotificationSettings {
  browserNotificationsEnabled: boolean;
  requireInteractionEnabled: boolean;
  dueSoonDays: number; // 1, 2, 3, 5 (default: 1)
  staleTaskDays: number; // 3, 5, 7, 14 (default: 5)
  capacityOverloadThreshold: number; // 100, 110, 120 (default: 100)
  enabledCategories: NotificationCategoryConfig;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  browserNotificationsEnabled: false,
  requireInteractionEnabled: true,
  dueSoonDays: 1,
  staleTaskDays: 5,
  capacityOverloadThreshold: 100,
  enabledCategories: {
    overdue: true,
    dueSoon: true,
    overload: true,
    stale: true,
    reminders: true,
    timer: true,
  },
};

export type AlertCategory = 'overdue' | 'overload' | 'due-soon' | 'stale' | 'reminder';
export type NotificationTabKey = 'all' | 'deadline' | 'overload' | 'stale' | 'reminders';
export type NotificationEntityType = 'task' | 'project' | 'milestone' | 'capacity';

export interface AlertNotificationItem {
  id: string; // e.g. "overdue:task:123", "overload:date:2026-09-29", "stale:task:456", "reminder:task:789"
  category: AlertCategory;
  title: string;
  subtitle?: string | undefined;
  date?: string | undefined;
  tagColor: 'error' | 'warning' | 'processing' | 'blue' | 'purple' | 'gold';
  tagLabel: string;
  entityType: NotificationEntityType;
  entityId?: string | undefined;
  canDismiss: boolean;
  priorityOrder: number; // 1: overdue, 2: overload, 3: due-soon, 4: stale, 5: reminder
  task?: Task | undefined;
}

export interface NotificationState {
  items: AlertNotificationItem[];
  activeCount: number;
  categoryCounts: Record<AlertCategory, number>;
  isLoading: boolean;
}
