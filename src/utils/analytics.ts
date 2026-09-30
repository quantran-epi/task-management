import dayjs from 'dayjs';
import type { Milestone, Task, Project, WorkType } from '../types/models';
import { resolveInheritedTags } from '../domain/inheritance';
import type {
  BurndownDayPoint,
  MilestoneBurndownSeries,
  BurndownUnit,
  VelocityWindowWeeks,
  WeeklyVelocityBucket,
  ProjectStatusMetrics,
  WorkloadDimension,
  WorkloadDistributionItem,
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

/**
 * Calculates rolling weekly velocity (tasks & hours) per D-05, D-06, D-08.
 * Excludes Cancelled tasks.
 */
export function calculateCompletionVelocity(
  tasks: Task[],
  options: {
    windowWeeks: VelocityWindowWeeks;
    todayStr: string;
  }
): {
  averageTasksPerWeek: number;
  averageHoursPerWeek: number;
  buckets: WeeklyVelocityBucket[];
} {
  const { windowWeeks, todayStr } = options;
  const currentEnd = dayjs(todayStr);

  const buckets: WeeklyVelocityBucket[] = [];
  let totalTasks = 0;
  let totalMinutes = 0;

  for (let w = windowWeeks - 1; w >= 0; w--) {
    const wStart = currentEnd.subtract(w * 7 + 6, 'day').format('YYYY-MM-DD');
    const wEnd = currentEnd.subtract(w * 7, 'day').format('YYYY-MM-DD');
    const label = `${dayjs(wStart).format('DD/MM')} - ${dayjs(wEnd).format('DD/MM')}`;

    let weekCompletedTasks = 0;
    let weekCompletedMins = 0;

    for (const task of tasks) {
      if (task.status !== 'Done' && task.status !== 'Resolved') continue;

      const completionDate = task.actualEndDate || (task.updatedAt ? task.updatedAt.slice(0, 10) : null);
      if (completionDate && completionDate >= wStart && completionDate <= wEnd) {
        weekCompletedTasks += 1;
        weekCompletedMins += task.estimateMinutes ?? 0;
      }
    }

    buckets.push({
      weekLabel: label,
      startDate: wStart,
      endDate: wEnd,
      completedTasksCount: weekCompletedTasks,
      completedHours: Number((weekCompletedMins / 60).toFixed(1)),
    });

    totalTasks += weekCompletedTasks;
    totalMinutes += weekCompletedMins;
  }

  return {
    averageTasksPerWeek: Number((totalTasks / windowWeeks).toFixed(1)),
    averageHoursPerWeek: Number((totalMinutes / 60 / windowWeeks).toFixed(1)),
    buckets,
  };
}

/**
 * Computes status distributions, open task counts, remaining hours, and velocity per project (D-07).
 */
export function calculateProjectStatusMetrics(
  projects: Project[],
  allTasks: Task[],
  windowWeeks: VelocityWindowWeeks,
  todayStr: string = dayjs().format('YYYY-MM-DD')
): ProjectStatusMetrics[] {
  return projects.map((project) => {
    const projectTasks = allTasks.filter((t) => t.projectId === project.id);
    const counts: Record<string, number> = {
      Open: 0,
      'In Progress': 0,
      Resolved: 0,
      'In Review': 0,
      Done: 0,
      Cancelled: 0,
    };

    let remainingMinutes = 0;

    for (const task of projectTasks) {
      counts[task.status] = (counts[task.status] ?? 0) + 1;
      if (task.status !== 'Done' && task.status !== 'Cancelled') {
        remainingMinutes += task.estimateMinutes ?? 0;
      }
    }

    const velocity = calculateCompletionVelocity(projectTasks, {
      windowWeeks,
      todayStr,
    });

    return {
      projectId: project.id,
      projectName: project.name,
      counts,
      totalTasks: projectTasks.length,
      openTasksCount: (counts.Open ?? 0) + (counts['In Progress'] ?? 0) + (counts['In Review'] ?? 0) + (counts.Resolved ?? 0),
      remainingHours: Number((remainingMinutes / 60).toFixed(1)),
      velocityTasksPerWeek: velocity.averageTasksPerWeek,
      velocityHoursPerWeek: velocity.averageHoursPerWeek,
      weeklyBuckets: velocity.buckets,
    };
  });
}

/**
 * Aggregates workload across Ops Owners, Business Analysts, or Work Types (D-09, D-10, D-11).
 * Resolves tag inheritance from Milestones and Projects.
 */
export function calculateStakeholderWorkload(
  tasks: Task[],
  milestones: Milestone[],
  projects: Project[],
  options: {
    dimension: WorkloadDimension;
    includeDone?: boolean;
  }
): WorkloadDistributionItem[] {
  const { dimension, includeDone = false } = options;
  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const milestoneMap = new Map(milestones.map((m) => [m.id, m]));

  const filteredTasks = tasks.filter((t) => {
    if (t.status === 'Cancelled') return false;
    if (!includeDone && t.status === 'Done') return false;
    return true;
  });

  const bucketMap = new Map<
    string,
    { label: string; workType?: WorkType | undefined; taskIds: Set<string>; minutes: number }
  >();

  const getBucket = (key: string, label: string, workType?: WorkType | undefined) => {
    let b = bucketMap.get(key);
    if (!b) {
      b = { label, workType, taskIds: new Set(), minutes: 0 };
      bucketMap.set(key, b);
    }
    return b;
  };

  for (const task of filteredTasks) {
    const mins = task.estimateMinutes ?? 0;

    if (dimension === 'workType') {
      const wt = task.workType ?? 'code';
      const b = getBucket(wt, wt, wt);
      b.taskIds.add(task.id);
      b.minutes += mins;
    } else {
      const project = task.projectId ? projectMap.get(task.projectId) : undefined;
      const milestone = task.milestoneId ? milestoneMap.get(task.milestoneId) : undefined;
      const res = resolveInheritedTags(dimension, task, { project, milestone });

      if (res.tags.length === 0) {
        const b = getBucket('unassigned', 'Chưa phân công');
        b.taskIds.add(task.id);
        b.minutes += mins;
      } else {
        for (const tag of res.tags) {
          const b = getBucket(tag, tag);
          b.taskIds.add(task.id);
          b.minutes += mins;
        }
      }
    }
  }

  const totalMinutes = Array.from(bucketMap.values()).reduce((sum, b) => sum + b.minutes, 0);

  return Array.from(bucketMap.entries())
    .map(([key, data]) => ({
      key,
      label: data.label,
      workType: data.workType,
      taskCount: data.taskIds.size,
      hours: Number((data.minutes / 60).toFixed(1)),
      percentage: totalMinutes > 0 ? Number(((data.minutes / totalMinutes) * 100).toFixed(1)) : 0,
      taskIds: Array.from(data.taskIds),
    }))
    .sort((a, b) => b.hours - a.hours);
}
