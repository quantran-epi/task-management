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

export type EstimationBias =
  | 'underestimate' // Thực tế > Dự tính (estimate non)
  | 'overestimate'  // Thực tế < Dự tính (estimate già)
  | 'accurate'      // Sai số trong khoảng ±10%
  | 'no_estimate'   // Có làm nhưng không ước tính
  | 'no_actual';    // Có ước tính nhưng chưa làm

export interface WorkTypeAccuracyItem {
  workType: string;
  workTypeLabel: string;
  taskCount: number;
  estimateMinutes: number;
  estimateHours: number;
  actualMinutes: number;
  actualHours: number;
  varianceHours: number; // actualHours - estimateHours
  variancePercent: number; // ((actual - estimate) / estimate) * 100
  accuracyPercent: number; // 0 - 100%
  bias: EstimationBias;
  biasLabel: string;
}

export interface WorkTypeAccuracyChartItem {
  workType: string;
  type: 'Ước tính (giờ)' | 'Thực tế (giờ)';
  hours: number;
}

export interface WorkTypeAccuracySummary {
  items: WorkTypeAccuracyItem[];
  chartData: WorkTypeAccuracyChartItem[];
  overallEstimateHours: number;
  overallActualHours: number;
  overallVariancePercent: number;
  overallAccuracyPercent: number;
  overallBias: EstimationBias;
  overallBiasLabel: string;
  insightTip: string;
}

