import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import dayjs from 'dayjs';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import { getEffectiveDailyCapacity, calculateDayMetrics } from '../utils/capacity';
import { isTaskActive } from '../db/repositories/allocationRepo';
import { getTodayDateString } from '../utils/date';
import { categorizeAttentionTasks, getHorizonDates } from '../utils/dashboard';
import type { ForecastHorizon, DashboardForecastState, HorizonDayData } from '../types/dashboard';
import type { Task, PlannedAllocation } from '../types/models';

/**
 * Reactive Dexie live query hook loading rules, overrides, allocations, and tasks
 * across active forecasting horizons (D-05, D-08, D-09).
 */
export function useDashboardForecast(
  targetDb: TaskPlannerDatabase = defaultDb,
  initialHorizon: ForecastHorizon = 7
): DashboardForecastState & { setHorizon: (h: ForecastHorizon) => void } {
  // Cap max forecast horizon at 30 days per T-05-05
  const validHorizon: ForecastHorizon =
    initialHorizon === 14 || initialHorizon === 30 ? initialHorizon : 7;
  const [horizon, setHorizon] = useState<ForecastHorizon>(validHorizon);
  const todayDate = useMemo(() => getTodayDateString(), []);

  const dates = useMemo(() => getHorizonDates(todayDate, horizon), [todayDate, horizon]);
  const horizonStartDate = dates[0]!;
  const horizonEndDate = dates[dates.length - 1]!;

  const liveData = useLiveQuery(
    async () => {
      // 1. Fetch capacity rules
      const rules = await targetDb.capacityRules.toArray();

      // 2. Fetch overrides in horizon range [startDate, endDate]
      const overrides = await targetDb.capacityOverrides
        .where('date')
        .between(horizonStartDate, horizonEndDate, true, true)
        .toArray();

      // 3. Fetch allocations in horizon range [startDate, endDate]
      const allocations = await targetDb.plannedAllocations
        .where('date')
        .between(horizonStartDate, horizonEndDate, true, true)
        .toArray();

      // 4. Batch-fetch tasks for allocations to check active status
      const taskIds = Array.from(new Set(allocations.map((a) => a.taskId)));
      const allocTasks =
        taskIds.length > 0 ? await targetDb.tasks.where('id').anyOf(taskIds).toArray() : [];
      const taskMap = new Map<string, Task>(allocTasks.map((t) => [t.id, t]));

      // 5. Fetch all tasks for attention list
      const allTasks = await targetDb.tasks.toArray();

      // 6. Group allocations by date
      const allocationsByDate = new Map<string, PlannedAllocation[]>();
      for (const a of allocations) {
        const list = allocationsByDate.get(a.date) ?? [];
        list.push(a);
        allocationsByDate.set(a.date, list);
      }

      const todayAllocations = allocationsByDate.get(todayDate) ?? [];
      const attentionTasks = categorizeAttentionTasks(allTasks, todayAllocations, todayDate);

      // 7. Calculate metrics for each date in horizon
      const horizonDays: HorizonDayData[] = dates.map((date) => {
        const d = dayjs(date, 'YYYY-MM-DD');
        const dayOfWeek = d.day();
        const dayName = d.format('ddd');
        const isToday = date === todayDate;

        const capacityMinutes = getEffectiveDailyCapacity(date, rules, overrides);
        const dayAllocs = allocationsByDate.get(date) ?? [];

        let activeAllocatedMinutes = 0;
        let inactiveAllocatedMinutes = 0;
        const activeTaskIds = new Set<string>();

        for (const alloc of dayAllocs) {
          const task = taskMap.get(alloc.taskId);
          // Inactive tasks (Done/Cancelled) do not contribute to active allocated load
          const isActive = task ? isTaskActive(task.status) : false;
          if (isActive) {
            activeAllocatedMinutes += alloc.allocatedMinutes;
            activeTaskIds.add(alloc.taskId);
          } else {
            inactiveAllocatedMinutes += alloc.allocatedMinutes;
          }
        }

        const metrics = calculateDayMetrics(
          date,
          capacityMinutes,
          activeAllocatedMinutes,
          inactiveAllocatedMinutes,
          activeTaskIds.size
        );

        const excessMinutes = metrics.isOverloaded
          ? Math.max(0, activeAllocatedMinutes - capacityMinutes)
          : 0;

        return {
          date,
          dayOfWeek,
          dayName,
          isToday,
          metrics,
          excessMinutes,
        };
      });

      const todayDay = horizonDays.find((d) => d.date === todayDate);
      const todayMetrics = todayDay ? todayDay.metrics : null;

      const overloadedDays = horizonDays
        .filter((d) => d.metrics.isOverloaded)
        .map((d) => ({ date: d.date, excessMinutes: d.excessMinutes }));

      const totalExcessMinutes = overloadedDays.reduce((sum, d) => sum + d.excessMinutes, 0);

      return {
        todayDate,
        todayMetrics,
        attentionTasks,
        horizon,
        horizonDays,
        overloadedDays,
        totalExcessMinutes,
      };
    },
    [horizonStartDate, horizonEndDate, todayDate, horizon, targetDb]
  );

  if (!liveData) {
    const fallbackDays: HorizonDayData[] = dates.map((date) => {
      const d = dayjs(date, 'YYYY-MM-DD');
      return {
        date,
        dayOfWeek: d.day(),
        dayName: d.format('ddd'),
        isToday: date === todayDate,
        metrics: {
          date,
          dayOfWeek: d.day(),
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
        excessMinutes: 0,
      };
    });

    return {
      todayDate,
      todayMetrics: null,
      attentionTasks: [],
      horizon,
      horizonDays: fallbackDays,
      overloadedDays: [],
      totalExcessMinutes: 0,
      isLoading: true,
      setHorizon,
    };
  }

  return {
    ...liveData,
    isLoading: false,
    setHorizon,
  };
}
