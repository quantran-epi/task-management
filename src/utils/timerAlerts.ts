import type { Task } from '../types/models';
import type { AlertNotificationItem } from '../types/notifications';

export interface TaskSpentAlertResult {
  shouldAlert: boolean;
  message: string;
  severity: 'warning' | 'info';
}

export interface DailyFeasibilityAlertParams {
  date: string;
  dailySpentMinutes: number;
  dailyCapacityMinutes: number;
  pendingTasksEstimateMinutes: number;
}

export interface DailyFeasibilityAlertResult {
  isAtRisk: boolean;
  remainingCapacity: number;
  pendingEstimate: number;
  message?: string;
}

/**
 * Tier 1: Task Spent vs Estimate Alert (Toast notification)
 * Triggers when spent time on a task meets or exceeds its estimate.
 * Informational and non-blocking (D-07, D-08, TIMER-03).
 */
export function evaluateTaskSpentAlert(
  task: Task,
  spentMinutes: number
): TaskSpentAlertResult {
  const safeSpent = Math.max(0, Math.floor(spentMinutes || 0));
  const estimate = Math.max(0, Math.floor(task.estimateMinutes || 0));

  if (estimate > 0 && safeSpent >= estimate) {
    return {
      shouldAlert: true,
      message: `Tác vụ "${task.name}" đã dùng ${safeSpent}m, vượt quá thời gian ước lượng (${estimate}m).`,
      severity: 'warning',
    };
  }

  return {
    shouldAlert: false,
    message: '',
    severity: 'info',
  };
}

/**
 * Live Running Timer vs Estimate Alert (Toast notification)
 * Triggers when total duration (historical spent + active running session) meets or exceeds estimate.
 * Informational and non-blocking (D-07, D-08, TIMER-03, G-12.1-6).
 */
export function evaluateLiveTaskAlert(
  task: Task,
  spentMinutes: number,
  currentRunSeconds: number
): TaskSpentAlertResult {
  const safeSpent = Math.max(0, Math.floor(spentMinutes || 0));
  const safeRunMinutes = Math.floor(Math.max(0, currentRunSeconds || 0) / 60);
  const totalSpentMinutes = safeSpent + safeRunMinutes;

  return evaluateTaskSpentAlert(task, totalSpentMinutes);
}

/**
 * Live Running Timer vs Daily Planned Allocation Alert
 * Triggers when total daily duration (recorded sessions today + active running session)
 * meets or exceeds daily planned allocation. If no daily allocation exists, falls back
 * to task estimate.
 */
export function evaluateLiveTaskDailyAllocationAlert(
  task: Task,
  todayAllocatedMinutes: number | undefined,
  todaySpentMinutes: number,
  currentRunSeconds: number,
  totalHistoricalSpentMinutes?: number
): TaskSpentAlertResult {
  const safeTodaySpent = Math.max(0, Math.floor(todaySpentMinutes || 0));
  const safeRunMinutes = Math.floor(Math.max(0, currentRunSeconds || 0) / 60);
  const currentTotalToday = safeTodaySpent + safeRunMinutes;
  const safeAllocated = Math.max(0, Math.floor(todayAllocatedMinutes || 0));

  if (safeAllocated > 0) {
    if (currentTotalToday >= safeAllocated) {
      return {
        shouldAlert: true,
        message: `Tác vụ "${task.name}" đã chạy ${currentTotalToday}m hôm nay, vượt quá thời gian phân bổ (${safeAllocated}m).`,
        severity: 'warning',
      };
    }
    return {
      shouldAlert: false,
      message: '',
      severity: 'info',
    };
  }

  // Fallback to task total estimate if no daily allocation set
  return evaluateLiveTaskAlert(
    task,
    totalHistoricalSpentMinutes ?? safeTodaySpent,
    currentRunSeconds
  );
}

/**
 * Tier 2: Daily Capacity Overload from Recorded Work Sessions (Notification Drawer)
 * Triggers when recorded spent minutes on a date exceeds effective daily capacity.
 * Informational and non-blocking (D-07, D-08, TIMER-06).
 */
export function evaluateDailyCapacitySpentAlert(
  date: string,
  dailySpentMinutes: number,
  dailyCapacityMinutes: number
): AlertNotificationItem | null {
  const safeSpent = Math.max(0, Math.floor(dailySpentMinutes || 0));
  const safeCapacity = Math.max(0, Math.floor(dailyCapacityMinutes || 0));

  if (safeCapacity > 0 && safeSpent > safeCapacity) {
    const spentHours = Math.round((safeSpent / 60) * 10) / 10;
    const capHours = Math.round((safeCapacity / 60) * 10) / 10;
    const percent = Math.round((safeSpent / safeCapacity) * 100);

    return {
      id: `overload:spent:${date}`,
      category: 'overload',
      title: `Thời gian làm việc ghi nhận ngày ${date} (${safeSpent}m) đã vượt quá công suất làm việc (${safeCapacity}m).`,
      subtitle: `Thực tế: ${safeSpent}m (${spentHours}h), Định mức: ${safeCapacity}m (${capHours}h)`,
      date,
      tagColor: 'warning',
      tagLabel: `Vượt công suất ${percent}%`,
      entityType: 'capacity',
      canDismiss: false,
      priorityOrder: 2,
    };
  }

  return null;
}

/**
 * Tier 3: Daily Feasibility Risk Alert
 * Triggers when remaining daily capacity is insufficient to finish remaining pending tasks for the day.
 * Informational and non-blocking (D-07, D-08, TIMER-07).
 */
export function evaluateDailyFeasibilityAlert(
  params: DailyFeasibilityAlertParams
): DailyFeasibilityAlertResult {
  const { dailySpentMinutes, dailyCapacityMinutes, pendingTasksEstimateMinutes } = params;

  const safeSpent = Math.max(0, Math.floor(dailySpentMinutes || 0));
  const safeCapacity = Math.max(0, Math.floor(dailyCapacityMinutes || 0));
  const safePending = Math.max(0, Math.floor(pendingTasksEstimateMinutes || 0));

  const remainingCapacity = Math.max(0, safeCapacity - safeSpent);

  if (safePending > 0 && remainingCapacity < safePending) {
    return {
      isAtRisk: true,
      remainingCapacity,
      pendingEstimate: safePending,
      message: `Tổng thời gian còn lại của các tác vụ hôm nay (${safePending}m) vượt quá thời gian làm việc còn lại (${remainingCapacity}m).`,
    };
  }

  return {
    isAtRisk: false,
    remainingCapacity,
    pendingEstimate: safePending,
  };
}
