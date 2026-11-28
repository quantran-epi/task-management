import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import { getAllocationsForDate } from '../db/repositories/allocationRepo';
import { getEffectiveDailyCapacity } from '../utils/capacity';
import { buildDayInsight, type DayInsightData } from '../utils/dayInsight';
import { useTimer } from './useTimer';
import { useTimerTick } from './useTimerTick';
import type { PlannedAllocationWithTask } from '../db/repositories/allocationRepo';
import type { Task, WorkSession } from '../types/models';

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

interface DayInsightSnapshot {
  capacityMinutes: number;
  allocations: PlannedAllocationWithTask[];
  sessions: WorkSession[];
  taskMap: Map<string, Task>;
  crNameById: Map<string, string>;
  /** Stable ids of tasks only referenced by timers/sessions on this date. */
  timerTaskIds: string[];
  date: string;
}

/**
 * Reactive Day Insight loader: planned + actual + capacity for one calendar date.
 * Live-updates whenever plannedAllocations, workSessions, capacityRules,
 * capacityOverrides, tasks, or change requests change. Running timers are folded
 * in on each tick WITHOUT re-reading IndexedDB.
 */
export function useDayInsight(
  date: string,
  targetDb: TaskPlannerDatabase = defaultDb
): DayInsightData {
  const { activeTimers } = useTimer();
  const tick = useTimerTick();

  const timerTaskIds = useMemo(
    () =>
      Array.from(
        new Set(
          activeTimers
            .filter((t) => toLocalDate(t.sessionStartTime) === date)
            .map((t) => t.taskId)
        )
      ).sort(),
    [activeTimers, date]
  );

  // DB query deps are date/db/timer ids only — never the per-second tick.
  const snapshot = useLiveQuery<DayInsightSnapshot>(
    async () => {
      const [allocations, sessions, rules, overrides, changeRequests] = await Promise.all([
        getAllocationsForDate(date, targetDb),
        targetDb.workSessions.where('date').equals(date).toArray(),
        targetDb.capacityRules.toArray(),
        targetDb.capacityOverrides.where('date').equals(date).toArray(),
        targetDb.changeRequests.toArray(),
      ]);

      const knownIds = new Set(allocations.map((a) => a.taskId));
      const extraTaskIds = new Set<string>();
      for (const s of sessions) {
        if (!knownIds.has(s.taskId)) extraTaskIds.add(s.taskId);
      }
      for (const taskId of timerTaskIds) {
        if (!knownIds.has(taskId)) extraTaskIds.add(taskId);
      }

      const extraTasks: Task[] =
        extraTaskIds.size > 0
          ? await targetDb.tasks.where('id').anyOf(Array.from(extraTaskIds)).toArray()
          : [];

      return {
        capacityMinutes: getEffectiveDailyCapacity(date, rules, overrides),
        allocations,
        sessions,
        taskMap: new Map<string, Task>(extraTasks.map((t) => [t.id, t])),
        crNameById: new Map(changeRequests.map((cr) => [cr.id, cr.name])),
        timerTaskIds,
        date,
      };
    },
    [date, targetDb, timerTaskIds]
  );

  const data = useMemo(() => {
    if (!snapshot || snapshot.date !== date) return undefined;

    // Only derived data is recomputed on every tick; no IndexedDB re-read.
    void tick;
    const runningMinutesByTask = new Map<string, number>();
    const now = Date.now();
    for (const timer of activeTimers) {
      if (toLocalDate(timer.sessionStartTime) !== date) continue;
      const currentRun =
        timer.status === 'running' ? Math.max(0, now - timer.startedAt) : 0;
      const totalMs = timer.accumulatedMs + currentRun;
      if (totalMs <= 0) continue;
      const minutes = totalMs / 60000;
      runningMinutesByTask.set(timer.taskId, (runningMinutesByTask.get(timer.taskId) ?? 0) + minutes);
    }

    return buildDayInsight({
      date,
      capacityMinutes: snapshot.capacityMinutes,
      allocations: snapshot.allocations,
      sessions: snapshot.sessions,
      taskMap: snapshot.taskMap,
      crNameById: snapshot.crNameById,
      runningMinutesByTask,
    });
  }, [activeTimers, date, tick, snapshot]);

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
