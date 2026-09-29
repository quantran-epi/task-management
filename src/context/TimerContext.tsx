import React, { createContext, useEffect, useState, useMemo, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type TaskPlannerDatabase } from '../db';
import type { ActiveTimer, WorkSession } from '../types/models';
import { generateId } from '../utils/uuid';

export interface TimerContextValue {
  activeTimers: ActiveTimer[];
  getTimerForTask: (taskId: string) => ActiveTimer | undefined;
  getElapsedSeconds: (taskId: string) => number;
  startTimer: (taskId: string) => Promise<void>;
  pauseTimer: (taskId: string) => Promise<void>;
  finishTimer: (taskId: string, note?: string) => Promise<WorkSession | null>;
  cancelTimer: (taskId: string) => Promise<void>;
}

export const TimerContext = createContext<TimerContextValue | undefined>(undefined);

export interface TimerProviderProps {
  children: React.ReactNode;
  database?: TaskPlannerDatabase;
}

const MAX_CONCURRENT_TIMERS = 20;

export const TimerProvider: React.FC<TimerProviderProps> = ({
  children,
  database = db,
}) => {
  // Reactive query from Dexie - survives reload (D-04, D-05)
  const activeTimers = useLiveQuery(() => database.activeTimers.toArray(), [database]) ?? [];

  // Local ticker state for re-rendering UI subscribers every second
  // Does NOT write to IndexedDB per second (D-06)
  const [, setTick] = useState<number>(0);

  const hasRunningTimer = useMemo(
    () => activeTimers.some((t) => t.status === 'running'),
    [activeTimers]
  );

  // T-12.1-04: Only run interval when at least 1 timer is running
  useEffect(() => {
    if (!hasRunningTimer) return;

    const intervalId = window.setInterval(() => {
      setTick((prev) => prev + 1);
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [hasRunningTimer]);

  const getTimerForTask = useCallback(
    (taskId: string): ActiveTimer | undefined => {
      return activeTimers.find((t) => t.taskId === taskId);
    },
    [activeTimers]
  );

  // D-04: Calculate elapsed seconds from wall-clock timestamps (immune to background tab throttling)
  const getElapsedSeconds = useCallback(
    (taskId: string): number => {
      const timer = activeTimers.find((t) => t.taskId === taskId);
      if (!timer) return 0;

      const currentRun = timer.status === 'running' ? Math.max(0, Date.now() - timer.startedAt) : 0;
      return Math.floor((timer.accumulatedMs + currentRun) / 1000);
    },
    [activeTimers]
  );

  const startTimer = useCallback(
    async (taskId: string): Promise<void> => {
      const existing = await database.activeTimers.get(taskId);

      if (!existing) {
        // T-12.1-05: Enforce cap of 20 concurrent active timers
        const totalActive = await database.activeTimers.count();
        if (totalActive >= MAX_CONCURRENT_TIMERS) {
          throw new Error(`Đã đạt giới hạn tối đa ${MAX_CONCURRENT_TIMERS} bộ đếm hoạt động đồng thời.`);
        }

        const now = Date.now();
        const newTimer: ActiveTimer = {
          taskId,
          status: 'running',
          startedAt: now,
          accumulatedMs: 0,
          sessionStartTime: new Date(now).toISOString(),
        };
        await database.activeTimers.put(newTimer);
        return;
      }

      if (existing.status === 'paused') {
        // Resume paused timer
        const updated: ActiveTimer = {
          ...existing,
          status: 'running',
          startedAt: Date.now(),
        };
        await database.activeTimers.put(updated);
      }
    },
    [database]
  );

  const pauseTimer = useCallback(
    async (taskId: string): Promise<void> => {
      const existing = await database.activeTimers.get(taskId);
      if (!existing || existing.status !== 'running') return;

      const delta = Math.max(0, Date.now() - existing.startedAt);
      const updated: ActiveTimer = {
        ...existing,
        status: 'paused',
        accumulatedMs: existing.accumulatedMs + delta,
        startedAt: Date.now(),
      };
      await database.activeTimers.put(updated);
    },
    [database]
  );

  const finishTimer = useCallback(
    async (taskId: string, note?: string): Promise<WorkSession | null> => {
      return await database.transaction(
        'rw',
        [database.activeTimers, database.workSessions, database.tasks],
        async () => {
          const existing = await database.activeTimers.get(taskId);
          if (!existing) return null;

          const currentRun =
            existing.status === 'running' ? Math.max(0, Date.now() - existing.startedAt) : 0;
          const totalMs = existing.accumulatedMs + currentRun;
          const durationMinutes = Math.max(1, Math.round(totalMs / 60000));

          const task = await database.tasks.get(taskId);
          const nowIso = new Date().toISOString();
          if (task) {
            task.updatedAt = nowIso;
            await database.tasks.put(task);
          }

          // Format session calendar date YYYY-MM-DD
          const sessionStart = new Date(existing.sessionStartTime);
          const year = sessionStart.getFullYear();
          const month = String(sessionStart.getMonth() + 1).padStart(2, '0');
          const day = String(sessionStart.getDate()).padStart(2, '0');
          const date = `${year}-${month}-${day}`;

          const session: WorkSession = {
            id: generateId(),
            taskId,
            startTime: existing.sessionStartTime,
            endTime: nowIso,
            date,
            durationMinutes,
            createdAt: nowIso,
            updatedAt: nowIso,
          };

          if (note !== undefined && note.trim() !== '') {
            session.note = note.trim();
          }

          await database.workSessions.add(session);
          await database.activeTimers.delete(taskId);
          return session;
        }
      );
    },
    [database]
  );

  const cancelTimer = useCallback(
    async (taskId: string): Promise<void> => {
      await database.activeTimers.delete(taskId);
    },
    [database]
  );

  const value = useMemo<TimerContextValue>(
    () => ({
      activeTimers,
      getTimerForTask,
      getElapsedSeconds,
      startTimer,
      pauseTimer,
      finishTimer,
      cancelTimer,
    }),
    [
      activeTimers,
      getTimerForTask,
      getElapsedSeconds,
      startTimer,
      pauseTimer,
      finishTimer,
      cancelTimer,
    ]
  );

  return <TimerContext.Provider value={value}>{children}</TimerContext.Provider>;
};
