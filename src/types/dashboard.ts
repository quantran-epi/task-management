import type { Task } from './models';
import type { DayCapacityMetrics } from '../utils/capacity';

export type ForecastHorizon = 7 | 14 | 30;

export type AttentionCategory = 'overdue' | 'due-today' | 'scheduled-today';

export interface AttentionTaskItem {
  task: Task;
  category: AttentionCategory;
  daysOverdue?: number;
  scheduledMinutes?: number;
}

export interface HorizonDayData {
  date: string;
  dayOfWeek: number;
  dayName: string;
  isToday: boolean;
  metrics: DayCapacityMetrics;
  excessMinutes: number;
}

export interface DashboardForecastState {
  todayDate: string;
  todayMetrics: DayCapacityMetrics | null;
  attentionTasks: AttentionTaskItem[];
  horizon: ForecastHorizon;
  horizonDays: HorizonDayData[];
  overloadedDays: Array<{ date: string; excessMinutes: number }>;
  totalExcessMinutes: number;
  isLoading: boolean;
}
