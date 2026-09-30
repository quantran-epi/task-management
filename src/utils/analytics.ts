import dayjs from 'dayjs';
import type { Milestone, Task } from '../types/models';
import type {
  BurndownDayPoint,
  MilestoneBurndownSeries,
  BurndownUnit,
} from '../types/analytics';

/**
 * Calculates daily burndown series (ideal pace vs actual remaining) for a milestone.
 * Conforms to D-01 (hours vs count unit), D-02 (timeline start/end with 14-day fallback),
 * D-03 (actual remaining stops at todayStr), and T-13-02 (clamping duration to avoid DoS).
 */
export function calculateMilestoneBurndown(
  milestone: Milestone,
  tasks: Task[],
  options: {
    unit: BurndownUnit;
    todayStr: string;
  }
): MilestoneBurndownSeries {
  const { unit, todayStr } = options;

  // Determine milestone start date: earliest of milestone.createdAt (YYYY-MM-DD) or task actualStartDate
  const msCreated = milestone.createdAt ? milestone.createdAt.slice(0, 10) : todayStr;
  const earliestTaskStart = tasks.reduce<string | null>((earliest, t) => {
    const d = t.actualStartDate || (t.createdAt ? t.createdAt.slice(0, 10) : null);
    if (!d) return earliest;
    return !earliest || d < earliest ? d : earliest;
  }, null);

  const startDate = earliestTaskStart && earliestTaskStart < msCreated ? earliestTaskStart : msCreated;

  // Determine milestone deadline with fallback per D-02
  let endDate = milestone.deadline;
  if (!endDate) {
    const latestTaskDeadline = tasks.reduce<string | null>((latest, t) => {
      if (!t.deadline) return latest;
      return !latest || t.deadline > latest ? t.deadline : latest;
    }, null);
    endDate = latestTaskDeadline && latestTaskDeadline > startDate
      ? latestTaskDeadline
      : dayjs(startDate).add(14, 'day').format('YYYY-MM-DD');
  }

  // Guard against endDate <= startDate
  if (endDate <= startDate) {
    endDate = dayjs(startDate).add(14, 'day').format('YYYY-MM-DD');
  }

  const startDay = dayjs(startDate);
  const endDay = dayjs(endDate);
  // T-13-02: Clamp max duration to 365 days
  const totalDays = Math.min(365, Math.max(1, endDay.diff(startDay, 'day')));
  const clampedEndDate = startDay.add(totalDays, 'day').format('YYYY-MM-DD');

  // Compute total initial scope
  const totalScope = tasks.reduce((sum, t) => {
    if (unit === 'hours') {
      return sum + (t.estimateMinutes ? t.estimateMinutes / 60 : 0);
    }
    return sum + 1;
  }, 0);

  const points: BurndownDayPoint[] = [];

  for (let i = 0; i <= totalDays; i++) {
    const currentDate = startDay.add(i, 'day').format('YYYY-MM-DD');
    const idealRemaining = Number(Math.max(0, totalScope * (1 - i / totalDays)).toFixed(2));

    let actualRemaining: number | null = null;
    if (currentDate <= todayStr) {
      const completedScope = tasks.reduce((sum, t) => {
        const isDoneOrResolved = t.status === 'Done' || t.status === 'Resolved';
        if (!isDoneOrResolved) return sum;

        const completionDate = t.actualEndDate || (t.updatedAt ? t.updatedAt.slice(0, 10) : null);
        if (completionDate && completionDate <= currentDate) {
          return sum + (unit === 'hours' ? (t.estimateMinutes ? t.estimateMinutes / 60 : 0) : 1);
        }
        return sum;
      }, 0);

      actualRemaining = Number(Math.max(0, totalScope - completedScope).toFixed(2));
    }

    points.push({
      date: currentDate,
      dayIndex: i,
      idealRemaining,
      actualRemaining,
    });
  }

  return {
    milestoneId: milestone.id,
    startDate,
    endDate: clampedEndDate,
    totalScope: Number(totalScope.toFixed(2)),
    unit,
    points,
  };
}
