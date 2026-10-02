export interface EstimateVsActualItem {
  task: string;
  type: 'Ước tính (giờ)' | 'Thực tế (giờ)';
  hours: number;
}

export interface WorkTypeBreakdownItem {
  type: string;
  minutes: number;
  hours: number;
}

export interface ProductivityHeatmapItem {
  day: string;
  hour: string;
  minutes: number;
  hours: number;
}

export type AnalyticsPeriod = '7d' | '14d' | '30d' | 'all';
