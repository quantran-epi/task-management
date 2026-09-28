import type { Task } from './models';

export type AlertCategory = 'overdue' | 'overload' | 'due-soon' | 'stale' | 'reminder';
export type NotificationTabKey = 'all' | 'deadline' | 'overload' | 'stale' | 'reminders';
export type NotificationEntityType = 'task' | 'project' | 'milestone' | 'capacity';

export interface AlertNotificationItem {
  id: string; // e.g. "overdue:task:123", "overload:date:2026-09-29", "stale:task:456", "reminder:task:789"
  category: AlertCategory;
  title: string;
  subtitle?: string;
  date?: string;
  tagColor: 'error' | 'warning' | 'processing' | 'blue' | 'purple' | 'gold';
  tagLabel: string;
  entityType: NotificationEntityType;
  entityId?: string;
  canDismiss: boolean;
  priorityOrder: number; // 1: overdue, 2: overload, 3: due-soon, 4: stale, 5: reminder
  task?: Task;
}

export interface NotificationState {
  items: AlertNotificationItem[];
  activeCount: number;
  categoryCounts: Record<AlertCategory, number>;
  isLoading: boolean;
}
