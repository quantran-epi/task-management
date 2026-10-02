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
  tick?: number;
}

export const TimerContext = createContext<TimerContextValue | undefined>(undefined);

export interface TimerProviderProps {
  children: React.ReactNode;
  database?: TaskPlannerDatabase;
}

const MAX_CONCURRENT_TIMERS = 20;
export const TIMER_SYNC_CHANNEL = 'task_timer_sync';

function broadcastTimerSync(type: string, taskId: string) {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    try {
      const channel = new BroadcastChannel(TIMER_SYNC_CHANNEL);
      channel.postMessage({ type, taskId, timestamp: Date.now() });
      channel.close();
    } catch {
      // Ignore broadcast errors
    }
  }
}

export const TimerProvider: React.FC<TimerProviderProps> = ({
  children,
  database = db,
}) => {
  // Reactive query from Dexie - survives reload (D-04, D-05)
  const activeTimers = useLiveQuery(() => database.activeTimers.toArray(), [database]) ?? [];

  // Local ticker state for re-rendering UI subscribers every second
  // Does NOT write to IndexedDB per second (D-06)
  const [tick, setTick] = useState<number>(0);

  // Cross-window synchronization via BroadcastChannel (Tauri multi-window & browser popout)
  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
    try {
      const channel = new BroadcastChannel(TIMER_SYNC_CHANNEL);
      channel.onmessage = () => {
        setTick((prev) => prev + 1);
      };
      return () => {
        channel.close();
      };
    } catch {
      return undefined;
    }
  }, []);

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
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();

      await database.transaction('rw', [database.activeTimers, database.tasks], async () => {
        // Safe status automation: Open -> In Progress only (D-02)
        const task = await database.tasks.get(taskId);
        if (task && task.status === 'Open') {
          task.status = 'In Progress';
          task.updatedAt = nowIso;
          await database.tasks.put(task);
        }

        const existing = await database.activeTimers.get(taskId);

        if (!existing) {
          // T-12.1-05: Enforce cap of 20 concurrent active timers
          const totalActive = await database.activeTimers.count();
          if (totalActive >= MAX_CONCURRENT_TIMERS) {
            throw new Error(`Đã đạt giới hạn tối đa ${MAX_CONCURRENT_TIMERS} bộ đếm hoạt động đồng thời.`);
          }

          const newTimer: ActiveTimer = {
            taskId,
            status: 'running',
            startedAt: nowMs,
            accumulatedMs: 0,
            sessionStartTime: nowIso,
            segments: [{ startTime: nowIso }],
          };
          await database.activeTimers.put(newTimer);
        } else if (existing.status === 'paused') {
          // Resume paused timer: append new segment with current timestamp (D-01)
          const updatedSegments = [...(existing.segments || []), { startTime: nowIso }];
          const updated: ActiveTimer = {
            ...existing,
            status: 'running',
            startedAt: nowMs,
            segments: updatedSegments,
          };
          await database.activeTimers.put(updated);
        }
      });

      broadcastTimerSync('START', taskId);
    },
    [database]
  );

  const pauseTimer = useCallback(
    async (taskId: string): Promise<void> => {
      const existing = await database.activeTimers.get(taskId);
      if (!existing || existing.status !== 'running') return;

      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      const delta = Math.max(0, nowMs - existing.startedAt);

      // Close the latest open segment with endTime (D-01)
      const updatedSegments = [...(existing.segments || [])];
      if (updatedSegments.length > 0 && !updatedSegments[updatedSegments.length - 1]!.endTime) {
        updatedSegments[updatedSegments.length - 1] = {
          ...updatedSegments[updatedSegments.length - 1]!,
          endTime: nowIso,
        };
      }

      const updated: ActiveTimer = {
        ...existing,
        status: 'paused',
        accumulatedMs: existing.accumulatedMs + delta,
        startedAt: nowMs,
        segments: updatedSegments,
      };
      await database.activeTimers.put(updated);
      broadcastTimerSync('PAUSE', taskId);
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

          const nowMs = Date.now();
          const nowIso = new Date(nowMs).toISOString();

          // D-03: If paused, use the last segment's endTime instead of current click time
          const lastSegment = existing.segments?.[existing.segments.length - 1];
          const isPaused = existing.status === 'paused';
          const endTime = isPaused && lastSegment?.endTime ? lastSegment.endTime : nowIso;

          // If running when finished, close the open segment
          const updatedSegments = [...(existing.segments || [])];
          if (!isPaused && updatedSegments.length > 0 && !updatedSegments[updatedSegments.length - 1]!.endTime) {
            updatedSegments[updatedSegments.length - 1] = {
              ...updatedSegments[updatedSegments.length - 1]!,
              endTime: nowIso,
            };
          }

          const currentRun = !isPaused ? Math.max(0, nowMs - existing.startedAt) : 0;
          const totalMs = existing.accumulatedMs + currentRun;
          const durationMinutes = Math.max(1, Math.round(totalMs / 60000));

          const task = await database.tasks.get(taskId);
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
            endTime,
            date,
            durationMinutes,
            segments: updatedSegments.length > 0 ? updatedSegments : undefined,
            createdAt: nowIso,
            updatedAt: nowIso,
          };

          if (note !== undefined && note.trim() !== '') {
            session.note = note.trim();
          }

          await database.workSessions.add(session);
          await database.activeTimers.delete(taskId);
          broadcastTimerSync('FINISH', taskId);
          return session;
        }
      );
    },
    [database]
  );

  const cancelTimer = useCallback(
    async (taskId: string): Promise<void> => {
      await database.activeTimers.delete(taskId);
      broadcastTimerSync('CANCEL', taskId);
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
      tick,
    }),
    [
      activeTimers,
      getTimerForTask,
      getElapsedSeconds,
      startTimer,
      pauseTimer,
      finishTimer,
      cancelTimer,
      tick,
    ]
  );

  return <TimerContext.Provider value={value}>{children}</TimerContext.Provider>;
};
