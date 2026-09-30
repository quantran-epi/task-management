import type { WorkType } from './models';

export type BurndownUnit = 'hours' | 'count';
export type VelocityWindowWeeks = 2 | 4 | 8 | 12;
export type WorkloadDimension = 'opsOwners' | 'businessAnalysts' | 'workType';

export interface BurndownDayPoint {
  date: string;
  dayIndex: number;
  idealRemaining: number;
  actualRemaining: number | null; // null for future dates past Today
}

export interface MilestoneBurndownSeries {
  milestoneId: string;
  startDate: string;
  endDate: string;
  totalScope: number;
  unit: BurndownUnit;
  points: BurndownDayPoint[];
}

export interface WeeklyVelocityBucket {
  weekLabel: string; // e.g. "Tuần 38 (15/09 - 21/09)"
  startDate: string;
  endDate: string;
  completedTasksCount: number;
  completedHours: number;
}

export interface ProjectStatusMetrics {
  projectId: string;
  projectName: string;
  counts: Record<string, number>;
  totalTasks: number;
  openTasksCount: number;
  remainingHours: number;
  velocityTasksPerWeek: number;
  velocityHoursPerWeek: number;
  weeklyBuckets: WeeklyVelocityBucket[];
}

export interface WorkloadDistributionItem {
  key: string;
  label: string;
  workType?: WorkType | undefined;
  taskCount: number;
  hours: number;
  percentage: number;
  taskIds: string[];
}
