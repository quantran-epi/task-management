import type { WorkSession } from '../types/models';

/**
 * Format local date YYYY-MM-DD from a Date object.
 */
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Splits an ISO interval across calendar midnights, returning calendar date string YYYY-MM-DD
 * and integer minutes (per D-30).
 * Capped at 30 days to prevent infinite loops on corrupted start/end timestamps (T-13.1-11).
 */
export function splitSegmentByMidnight(
  startIso: string,
  endIso: string
): Array<{ date: string; minutes: number }> {
  const start = new Date(startIso);
  const end = new Date(endIso);

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
    return [];
  }

  const results: Array<{ date: string; minutes: number }> = [];
  let current = new Date(start);
  let iterations = 0;
  const MAX_DAYS = 30; // T-13.1-11 DoS cap

  while (current < end && iterations < MAX_DAYS) {
    iterations++;
    // Next local midnight: 00:00:00.000 of next day
    const nextMidnight = new Date(
      current.getFullYear(),
      current.getMonth(),
      current.getDate() + 1,
      0,
      0,
      0,
      0
    );

    const segmentEnd = end < nextMidnight ? end : nextMidnight;
    const diffMs = segmentEnd.getTime() - current.getTime();
    const diffMinutes = Math.max(1, Math.round(diffMs / 60000));

    results.push({
      date: toLocalDateStr(current),
      minutes: diffMinutes,
    });

    current = segmentEnd;
  }

  return results;
}

/**
 * Aggregates WorkSession records per task and date (taskId -> (date -> actualMinutes)).
 * Treats WorkSession as single source of truth without double-counting paused intervals (D-28, D-30).
 * If session has discrete segments, each segment is processed; if not, startTime to endTime (or durationMinutes) is used.
 */
export function aggregateTaskActualMinutesByDate(
  sessions: WorkSession[]
): Map<string, Map<string, number>> {
  const result = new Map<string, Map<string, number>>();

  for (const session of sessions) {
    if (!result.has(session.taskId)) {
      result.set(session.taskId, new Map<string, number>());
    }
    const taskDateMap = result.get(session.taskId)!;

    if (session.segments && session.segments.length > 0) {
      for (const seg of session.segments) {
        if (!seg.endTime) continue; // Skip unclosed segment if any
        const splits = splitSegmentByMidnight(seg.startTime, seg.endTime);
        for (const split of splits) {
          taskDateMap.set(split.date, (taskDateMap.get(split.date) ?? 0) + split.minutes);
        }
      }
    } else if (session.startTime && session.endTime) {
      const splits = splitSegmentByMidnight(session.startTime, session.endTime);
      for (const split of splits) {
        taskDateMap.set(split.date, (taskDateMap.get(split.date) ?? 0) + split.minutes);
      }
    } else {
      // Fallback: attribution to session.date
      const d = session.date || (session.startTime ? toLocalDateStr(new Date(session.startTime)) : '');
      if (d) {
        taskDateMap.set(d, (taskDateMap.get(d) ?? 0) + session.durationMinutes);
      }
    }
  }

  return result;
}

/**
 * Formats a duration in minutes into e.g. "2h30m", "45m", "0m".
 */
export function formatMinutes(minutes: number): string {
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h${m}m`;
}

/**
 * Formats signed variance e.g. "+30m", "-1h15m", "0m".
 */
export function formatVariance(varianceMinutes: number): string {
  if (varianceMinutes === 0) return '0m';
  const sign = varianceMinutes > 0 ? '+' : '-';
  return `${sign}${formatMinutes(varianceMinutes)}`;
}

export interface VarianceResult {
  varianceMinutes: number;
  formatted: string;
  isOver: boolean;
  status: 'neutral' | 'warning';
}

/**
 * Computes variance between actual and planned minutes.
 * Status is 'warning' (orange) when actual > planned, and 'neutral' (gray) when actual <= planned (D-31).
 */
export function computeVariance(actualMinutes: number, plannedMinutes: number): VarianceResult {
  const varianceMinutes = actualMinutes - plannedMinutes;
  const isOver = varianceMinutes > 0;
  return {
    varianceMinutes,
    formatted: formatVariance(varianceMinutes),
    isOver,
    status: isOver ? 'warning' : 'neutral',
  };
}
