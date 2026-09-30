import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import { getAllocationsForDate } from '../db/repositories/allocationRepo';
import { getEffectiveDailyCapacity } from '../utils/capacity';
import { buildDayInsight, type DayInsightData } from '../utils/dayInsight';
import { useTimer } from './useTimer';
import type { Task } from '../types/models';

/**
 * Derives the calendar date (YYYY-MM-DD, local wall clock) for a session start
 * ISO string — matches the convention used by workSessionRepo / TimerContext.
 */
function toLocalDate(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Reactive Day Insight loader: planned + actual + capacity for one calendar date.
 * Live-updates whenever plannedAllocations, workSessions, capacityRules,
 * capacityOverrides, tasks, or projects change.
 */
export function useDayInsight(
  date: string,
  targetDb: TaskPlannerDatabase = defaultDb
): DayInsightData {
  const { activeTimers, tick } = useTimer();

  // Fold running/paused timers into per-task minutes for the target date.
  // Recomputed on every tick so a running timer's contribution updates live.
  const runningMinutesByTask = useMemo(() => {
    void tick; // ensure re-eval on ticker
    const map = new Map<string, number>();
    const now = Date.now();
    for (const timer of activeTimers) {
      if (toLocalDate(timer.sessionStartTime) !== date) continue;
      const currentRun =
        timer.status === 'running' ? Math.max(0, now - timer.startedAt) : 0;
      const totalMs = timer.accumulatedMs + currentRun;
      if (totalMs <= 0) continue;
      const minutes = totalMs / 60000; // fractional — accumulates smoothly
      map.set(timer.taskId, (map.get(timer.taskId) ?? 0) + minutes);
    }
    return map;
  }, [activeTimers, tick, date]);

  const data = useLiveQuery(
    async () => {
      const [allocations, sessions, rules, overrides, projects] = await Promise.all([
        getAllocationsForDate(date, targetDb),
        targetDb.workSessions.where('date').equals(date).toArray(),
        targetDb.capacityRules.toArray(),
        targetDb.capacityOverrides.where('date').equals(date).toArray(),
        targetDb.projects.toArray(),
      ]);

      // Resolve tasks referenced only by sessions or active timers (allocations already carry task).
      const knownIds = new Set(allocations.map((a) => a.taskId));
      const extraTaskIds = new Set<string>();
      for (const s of sessions) {
        if (!knownIds.has(s.taskId)) extraTaskIds.add(s.taskId);
      }
      for (const [taskId] of runningMinutesByTask) {
        if (!knownIds.has(taskId)) extraTaskIds.add(taskId);
      }

      const extraTasks: Task[] =
        extraTaskIds.size > 0
          ? await targetDb.tasks.where('id').anyOf(Array.from(extraTaskIds)).toArray()
          : [];

      const taskMap = new Map<string, Task>(extraTasks.map((t) => [t.id, t]));
      const projectNameById = new Map(projects.map((p) => [p.id, p.name]));

      const capacityMinutes = getEffectiveDailyCapacity(date, rules, overrides);

      return buildDayInsight({
        date,
        capacityMinutes,
        allocations,
        sessions,
        taskMap,
        projectNameById,
        runningMinutesByTask,
      });
    },
    [date, targetDb, runningMinutesByTask]
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
