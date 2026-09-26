import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import type {
  PlannedAllocation,
  Task,
  CapacityOverride,
} from '../types/models';
import {
  getEffectiveDailyCapacity,
  calculateDayMetrics,
  type DayCapacityMetrics,
} from '../utils/capacity';
import { isTaskActive } from '../db/repositories/allocationRepo';
import { getTodayDateString } from '../utils/date';

dayjs.extend(isoWeek);

export interface DayPlannerData {
  date: string; // YYYY-MM-DD
  dayOfWeek: number; // 0 = Sun, 1 = Mon, ..., 6 = Sat
  dayName: string; // 'Monday', 'Tuesday', ...
  isToday: boolean;
  override?: CapacityOverride;
  metrics: DayCapacityMetrics;
  allocations: Array<PlannedAllocation & { task: Task; isActive: boolean }>;
}

export interface WeeklyPlannerState {
  weekStartDate: string;
  weekEndDate: string;
  days: DayPlannerData[];
  totalWeeklyCapacity: number;
  totalWeeklyAllocated: number;
  totalWeeklyBalance: number;
  isLoading: boolean;
}

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export function useWeeklyPlanner(
  currentDate: string,
  targetDb: TaskPlannerDatabase = defaultDb
): WeeklyPlannerState {
  const { weekStartDate, weekEndDate, weekDates } = useMemo(() => {
    const parsed = dayjs(currentDate, 'YYYY-MM-DD').isValid()
      ? dayjs(currentDate, 'YYYY-MM-DD')
      : dayjs();

    const start = parsed.startOf('isoWeek');
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      dates.push(start.add(i, 'day').format('YYYY-MM-DD'));
    }

    return {
      weekStartDate: dates[0]!,
      weekEndDate: dates[6]!,
      weekDates: dates,
    };
  }, [currentDate]);

  const liveData = useLiveQuery(
    async () => {
      // 1. Fetch capacity rules
      const rules = await targetDb.capacityRules.toArray();

      // 2. Fetch overrides in week range
      const overrides = await targetDb.capacityOverrides
        .where('date')
        .between(weekStartDate, weekEndDate, true, true)
        .toArray();
      const overrideMap = new Map<string, CapacityOverride>(
        overrides.map((o) => [o.date, o])
      );

      // 3. Fetch allocations in week range
      const allocations = await targetDb.plannedAllocations
        .where('date')
        .between(weekStartDate, weekEndDate, true, true)
        .toArray();

      // 4. Batch-fetch tasks for allocations
      const taskIds = Array.from(new Set(allocations.map((a) => a.taskId)));
      const tasks = taskIds.length > 0 ? await targetDb.tasks.where('id').anyOf(taskIds).toArray() : [];
      const taskMap = new Map<string, Task>(tasks.map((t) => [t.id, t]));

      const todayStr = getTodayDateString();

      const days: DayPlannerData[] = weekDates.map((date) => {
        const d = dayjs(date, 'YYYY-MM-DD');
        const dayOfWeek = d.day();
        const dayName = DAY_NAMES[dayOfWeek] ?? 'Unknown';
        const isToday = date === todayStr;
        const override = overrideMap.get(date);

        const effectiveCapacity = getEffectiveDailyCapacity(date, rules, overrides);

        const dayAllocations = allocations.filter((a) => a.date === date);
        const joinedAllocations = dayAllocations.map((alloc) => {
          const task = taskMap.get(alloc.taskId);
          const fallbackTask: Task = {
            id: alloc.taskId,
            name: 'Deleted / Unknown Task',
            status: 'Cancelled',
            progress: 0,
            priority: 'Medium',
            estimateMinutes: 0,
            createdAt: '',
            updatedAt: '',
          };
          const resolvedTask = task ?? fallbackTask;
          return {
            ...alloc,
            task: resolvedTask,
            isActive: isTaskActive(resolvedTask.status),
          };
        });

        let activeAllocatedMinutes = 0;
        let inactiveAllocatedMinutes = 0;
        const activeTaskIds = new Set<string>();

        for (const item of joinedAllocations) {
          if (item.isActive) {
            activeAllocatedMinutes += item.allocatedMinutes;
            activeTaskIds.add(item.taskId);
          } else {
            inactiveAllocatedMinutes += item.allocatedMinutes;
          }
        }

        const metrics = calculateDayMetrics(
          date,
          effectiveCapacity,
          activeAllocatedMinutes,
          inactiveAllocatedMinutes,
          activeTaskIds.size
        );

        return {
          date,
          dayOfWeek,
          dayName,
          isToday,
          ...(override ? { override } : {}),
          metrics,
          allocations: joinedAllocations,
        };
      });

      const totalWeeklyCapacity = days.reduce(
        (sum, d) => sum + d.metrics.effectiveCapacityMinutes,
        0
      );
      const totalWeeklyAllocated = days.reduce(
        (sum, d) => sum + d.metrics.activeAllocatedMinutes,
        0
      );
      const totalWeeklyBalance = totalWeeklyCapacity - totalWeeklyAllocated;

      return {
        weekStartDate,
        weekEndDate,
        days,
        totalWeeklyCapacity,
        totalWeeklyAllocated,
        totalWeeklyBalance,
      };
    },
    [weekStartDate, weekEndDate, targetDb]
  );

  if (!liveData) {
    const todayStr = getTodayDateString();
    const fallbackDays: DayPlannerData[] = weekDates.map((date) => {
      const d = dayjs(date, 'YYYY-MM-DD');
      const dayOfWeek = d.day();
      const dayName = DAY_NAMES[dayOfWeek] ?? 'Unknown';
      return {
        date,
        dayOfWeek,
        dayName,
        isToday: date === todayStr,
        metrics: {
          date,
          dayOfWeek,
          effectiveCapacityMinutes: 0,
          activeAllocatedMinutes: 0,
          inactiveAllocatedMinutes: 0,
          netBalanceMinutes: 0,
          loadState: 'no-capacity',
          percent: 0,
          isOverloaded: false,
          activeTaskCount: 0,
          isHighContextSwitching: false,
        },
        allocations: [],
      };
    });

    return {
      weekStartDate,
      weekEndDate,
      days: fallbackDays,
      totalWeeklyCapacity: 0,
      totalWeeklyAllocated: 0,
      totalWeeklyBalance: 0,
      isLoading: true,
    };
  }

  return {
    ...liveData,
    isLoading: false,
  };
}
