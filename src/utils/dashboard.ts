import dayjs from 'dayjs';
import type { Task, PlannedAllocation, CapacityRule, CapacityOverride } from '../types/models';
import { getEffectiveDailyCapacity, calculateDayMetrics } from './capacity';
import { isTaskActive } from '../db/repositories/allocationRepo';
import type { AttentionTaskItem, HorizonDayData } from '../types/dashboard';

/**
 * Categorizes active tasks into Overdue, Due Today, and Scheduled Today groups per D-09 & D-10.
 *
 * Sorting:
 * - Overdue: sorted by daysOverdue descending (most overdue first)
 * - Due Today: sorted by priority weight (Urgent -> High -> Medium -> Low)
 * - Scheduled Today: sorted by scheduledMinutes descending
 */
export function categorizeAttentionTasks(
  tasks: Task[],
  todayAllocations: PlannedAllocation[],
  today: string
): AttentionTaskItem[] {
  const allocationMap = new Map<string, number>();
  for (const alloc of todayAllocations) {
    allocationMap.set(alloc.taskId, (allocationMap.get(alloc.taskId) ?? 0) + alloc.allocatedMinutes);
  }

  const overdue: AttentionTaskItem[] = [];
  const dueToday: AttentionTaskItem[] = [];
  const scheduledToday: AttentionTaskItem[] = [];

  const priorityWeight: Record<Task['priority'], number> = {
    Urgent: 4,
    High: 3,
    Medium: 2,
    Low: 1,
  };

  for (const task of tasks) {
    if (!isTaskActive(task.status)) continue;
    const scheduledMins = allocationMap.get(task.id) ?? 0;

    if (task.deadline && task.deadline < today) {
      const daysOverdue = dayjs(today, 'YYYY-MM-DD').diff(dayjs(task.deadline, 'YYYY-MM-DD'), 'day');
      overdue.push({ task, category: 'overdue', daysOverdue, scheduledMinutes: scheduledMins });
    } else if (task.deadline && task.deadline === today) {
      dueToday.push({ task, category: 'due-today', scheduledMinutes: scheduledMins });
    } else if (scheduledMins > 0) {
      scheduledToday.push({ task, category: 'scheduled-today', scheduledMinutes: scheduledMins });
    }
  }

  overdue.sort((a, b) => (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0));
  dueToday.sort((a, b) => priorityWeight[b.task.priority] - priorityWeight[a.task.priority]);
  scheduledToday.sort((a, b) => (b.scheduledMinutes ?? 0) - (a.scheduledMinutes ?? 0));

  return [...overdue, ...dueToday, ...scheduledToday];
}

/**
 * Generates an array of canonical YYYY-MM-DD calendar dates starting from startDate (D-05, D-08).
 * Uses explicit format manipulation to prevent timezone drift across midnight boundaries.
 */
export function getHorizonDates(startDate: string, daysCount: number): string[] {
  const start = dayjs(startDate, 'YYYY-MM-DD');
  const dates: string[] = [];
  for (let i = 0; i < daysCount; i++) {
    dates.push(start.add(i, 'day').format('YYYY-MM-DD'));
  }
  return dates;
}

/**
 * Calculates horizon day metrics and excess overload minutes across a list of dates (D-06, D-07, D-08).
 */
export function calculateHorizonMetrics(
  dates: string[],
  rules: CapacityRule[],
  overridesMap: Map<string, CapacityOverride>,
  allocationsByDate: Map<string, PlannedAllocation[]>,
  today: string
): HorizonDayData[] {
  return dates.map((date) => {
    const d = dayjs(date, 'YYYY-MM-DD');
    const dayOfWeek = d.day();
    const dayName = d.format('ddd'); // localized day abbreviation
    const isToday = date === today;

    const capacityMinutes = getEffectiveDailyCapacity(date, rules, overridesMap);
    const dayAllocs = allocationsByDate.get(date) ?? [];

    const activeAllocatedMinutes = dayAllocs.reduce((sum, a) => sum + a.allocatedMinutes, 0);
    const inactiveAllocatedMinutes = 0;
    const activeTaskCount = dayAllocs.length;

    const metrics = calculateDayMetrics(
      date,
      capacityMinutes,
      activeAllocatedMinutes,
      inactiveAllocatedMinutes,
      activeTaskCount
    );

    const excessMinutes = metrics.isOverloaded ? activeAllocatedMinutes - capacityMinutes : 0;

    return {
      date,
      dayOfWeek,
      dayName,
      isToday,
      metrics,
      excessMinutes,
    };
  });
}
