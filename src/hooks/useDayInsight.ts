import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import { getAllocationsForDate } from '../db/repositories/allocationRepo';
import { getEffectiveDailyCapacity } from '../utils/capacity';
import { buildDayInsight, type DayInsightData } from '../utils/dayInsight';
import type { Task } from '../types/models';

/**
 * Reactive Day Insight loader: planned + actual + capacity for one calendar date.
 * Live-updates whenever plannedAllocations, workSessions, capacityRules,
 * capacityOverrides, tasks, or projects change.
 */
export function useDayInsight(
  date: string,
  targetDb: TaskPlannerDatabase = defaultDb
): DayInsightData {
  const data = useLiveQuery(
    async () => {
      const [allocations, sessions, rules, overrides, projects] = await Promise.all([
        getAllocationsForDate(date, targetDb),
        targetDb.workSessions.where('date').equals(date).toArray(),
        targetDb.capacityRules.toArray(),
        targetDb.capacityOverrides.where('date').equals(date).toArray(),
        targetDb.projects.toArray(),
      ]);

      // Resolve tasks referenced only by sessions (allocations already carry task).
      const sessionOnlyTaskIds = Array.from(
        new Set(sessions.map((s) => s.taskId))
      ).filter((id) => !allocations.some((a) => a.taskId === id));

      const sessionOnlyTasks: Task[] =
        sessionOnlyTaskIds.length > 0
          ? await targetDb.tasks.where('id').anyOf(sessionOnlyTaskIds).toArray()
          : [];

      const taskMap = new Map<string, Task>(sessionOnlyTasks.map((t) => [t.id, t]));
      const projectNameById = new Map(projects.map((p) => [p.id, p.name]));

      const capacityMinutes = getEffectiveDailyCapacity(date, rules, overrides);

      return buildDayInsight({
        date,
        capacityMinutes,
        allocations,
        sessions,
        taskMap,
        projectNameById,
      });
    },
    [date, targetDb]
  );

  if (!data) {
    return {
      date,
      capacityMinutes: 0,
      totalPlannedMinutes: 0,
      totalActualMinutes: 0,
      rows: [],
      loading: true,
    };
  }
  return data;
}
