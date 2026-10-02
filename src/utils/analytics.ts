import type { Task, WorkSession } from '../types/models';
import type {
  EstimateVsActualItem,
  WorkTypeBreakdownItem,
  ProductivityHeatmapItem,
  AnalyticsPeriod,
  WorkTypeAccuracyItem,
  WorkTypeAccuracyChartItem,
  WorkTypeAccuracySummary,
  EstimationBias,
} from '../types/analytics';
import dayjs from 'dayjs';

export const WORK_TYPE_LABELS: Record<string, string> = {
  code: 'Lập trình',
  document: 'Tài liệu',
  meeting: 'Họp',
  support_testing: 'Hỗ trợ & Kiểm thử',
  investigate: 'Nghiên cứu & Điều tra',
  configuration: 'Cấu hình',
  review_code: 'Đánh giá mã nguồn',
  unspecified: 'Chưa phân loại',
};

const DAY_LABELS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];

/**
 * Filter sessions by period relative to reference date (YYYY-MM-DD).
 */
export function filterSessionsByPeriod(
  sessions: WorkSession[],
  period: AnalyticsPeriod,
  referenceDate: string = dayjs().format('YYYY-MM-DD')
): WorkSession[] {
  if (period === 'all') return sessions;

  const days = period === '7d' ? 7 : period === '14d' ? 14 : 30;
  const cutoff = dayjs(referenceDate).subtract(days - 1, 'day').format('YYYY-MM-DD');

  return sessions.filter((s) => {
    const sDate = s.date || (s.startTime ? s.startTime.slice(0, 10) : '');
    return sDate >= cutoff && sDate <= referenceDate;
  });
}

/**
 * Aggregate task estimate vs actual time spent.
 */
export function aggregateEstimateVsActual(
  tasks: Task[],
  sessions: WorkSession[],
  limit = 15
): EstimateVsActualItem[] {
  const actualMinutesByTask = new Map<string, number>();

  for (const s of sessions) {
    if (!s.taskId) continue;
    actualMinutesByTask.set(s.taskId, (actualMinutesByTask.get(s.taskId) ?? 0) + s.durationMinutes);
  }

  // Find tasks that have either estimate or actual work
  const taskData = tasks
    .filter((t) => (t.estimateMinutes ?? 0) > 0 || (actualMinutesByTask.get(t.id) ?? 0) > 0)
    .map((t) => {
      const estimateMins = t.estimateMinutes ?? 0;
      const actualMins = actualMinutesByTask.get(t.id) ?? 0;
      return {
        taskName: t.name,
        estimateHours: Math.round((estimateMins / 60) * 10) / 10,
        actualHours: Math.round((actualMins / 60) * 10) / 10,
        totalMins: estimateMins + actualMins,
      };
    })
    // Sort by total effort descending and take top N
    .sort((a, b) => b.totalMins - a.totalMins)
    .slice(0, limit);

  const result: EstimateVsActualItem[] = [];
  for (const item of taskData) {
    if (item.estimateHours > 0) {
      result.push({
        task: item.taskName,
        type: 'Ước tính (giờ)',
        hours: item.estimateHours,
      });
    }
    if (item.actualHours > 0) {
      result.push({
        task: item.taskName,
        type: 'Thực tế (giờ)',
        hours: item.actualHours,
      });
    }
  }

  return result;
}

/**
 * Aggregate work duration by workType.
 */
export function aggregateWorkTypeBreakdown(
  tasks: Task[],
  sessions: WorkSession[]
): WorkTypeBreakdownItem[] {
  const taskTypeMap = new Map<string, string>();
  for (const t of tasks) {
    taskTypeMap.set(t.id, t.workType || 'unspecified');
  }

  const typeMinutes = new Map<string, number>();

  for (const s of sessions) {
    const wType = taskTypeMap.get(s.taskId) || 'unspecified';
    typeMinutes.set(wType, (typeMinutes.get(wType) ?? 0) + s.durationMinutes);
  }

  const totalMinutes = Array.from(typeMinutes.values()).reduce((sum, m) => sum + m, 0);
  if (totalMinutes === 0) return [];

  return Array.from(typeMinutes.entries())
    .map(([wType, mins]) => ({
      type: WORK_TYPE_LABELS[wType] || wType,
      minutes: mins,
      hours: Math.round((mins / 60) * 10) / 10,
    }))
    .filter((item) => item.minutes > 0 && item.hours > 0)
    .sort((a, b) => b.minutes - a.minutes);
}

/**
 * Aggregate work session activity into Day-of-Week (Mon-Sun) x Hour-of-Day (0-23) matrix.
 */
export function aggregateProductivityHeatmap(
  sessions: WorkSession[]
): ProductivityHeatmapItem[] {
  // 7 days x 24 hours grid
  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));

  for (const s of sessions) {
    if (s.segments && s.segments.length > 0) {
      for (const seg of s.segments) {
        if (!seg.startTime || !seg.endTime) continue;
        let cur = new Date(seg.startTime);
        const end = new Date(seg.endTime);
        if (isNaN(cur.getTime()) || isNaN(end.getTime()) || cur >= end) continue;

        while (cur < end) {
          const nextHour = new Date(cur);
          nextHour.setMinutes(0, 0, 0);
          nextHour.setHours(nextHour.getHours() + 1);
          const sliceEnd = end < nextHour ? end : nextHour;
          const mins = Math.max(1, Math.round((sliceEnd.getTime() - cur.getTime()) / 60000));
          const dayIdx = (cur.getDay() + 6) % 7; // Mon=0 .. Sun=6
          const hourIdx = cur.getHours();
          if (grid[dayIdx] && grid[dayIdx][hourIdx] !== undefined) {
            grid[dayIdx][hourIdx] += mins;
          }
          cur = sliceEnd;
        }
      }
    } else if (s.startTime) {
      let cur = new Date(s.startTime);
      if (!isNaN(cur.getTime())) {
        let remaining = s.durationMinutes;
        while (remaining > 0) {
          const nextHour = new Date(cur);
          nextHour.setMinutes(0, 0, 0);
          nextHour.setHours(nextHour.getHours() + 1);
          const minsToNextHour = Math.max(1, Math.round((nextHour.getTime() - cur.getTime()) / 60000));
          const mins = Math.min(remaining, minsToNextHour);
          const dayIdx = (cur.getDay() + 6) % 7;
          const hourIdx = cur.getHours();
          if (grid[dayIdx] && grid[dayIdx][hourIdx] !== undefined) {
            grid[dayIdx][hourIdx] += mins;
          }
          remaining -= mins;
          cur = nextHour;
        }
      }
    } else if (s.date) {
      const d = dayjs(s.date).toDate();
      const dayIdx = (d.getDay() + 6) % 7;
      if (grid[dayIdx]) {
        grid[dayIdx][9] = (grid[dayIdx][9] ?? 0) + s.durationMinutes;
      }
    }
  }

  const items: ProductivityHeatmapItem[] = [];
  for (let h = 0; h < 24; h++) {
    const hourLabel = `${String(h).padStart(2, '0')}:00`;
    for (let d = 0; d < 7; d++) {
      const mins = grid[d]?.[h] ?? 0;
      if (mins <= 0) continue;
      const dayLabel = DAY_LABELS[d] ?? `Thứ ${d + 2}`;
      items.push({
        day: dayLabel,
        hour: hourLabel,
        minutes: mins,
        hours: Math.round((mins / 60) * 10) / 10,
      });
    }
  }

  return items;
}

/**
 * Calculate estimation accuracy and bias (non vs già) per workType.
 */
export function calculateWorkTypeAccuracy(
  tasks: Task[],
  sessions: WorkSession[],
  period: AnalyticsPeriod = 'all'
): WorkTypeAccuracySummary {
  const actualMinutesByTask = new Map<string, number>();
  for (const s of sessions) {
    if (!s.taskId) continue;
    actualMinutesByTask.set(s.taskId, (actualMinutesByTask.get(s.taskId) ?? 0) + s.durationMinutes);
  }

  // Filter tasks to consider:
  // If period !== 'all', only evaluate tasks with actual sessions in this period.
  // If period === 'all', evaluate tasks with either estimate > 0 or actual > 0.
  const relevantTasks = tasks.filter((t) => {
    const hasActual = (actualMinutesByTask.get(t.id) ?? 0) > 0;
    if (period === 'all') {
      return (t.estimateMinutes ?? 0) > 0 || hasActual;
    }
    return hasActual;
  });

  const groupMap = new Map<
    string,
    {
      workType: string;
      taskCount: number;
      estimateMinutes: number;
      actualMinutes: number;
    }
  >();

  for (const t of relevantTasks) {
    const wType = t.workType || 'unspecified';
    let group = groupMap.get(wType);
    if (!group) {
      group = {
        workType: wType,
        taskCount: 0,
        estimateMinutes: 0,
        actualMinutes: 0,
      };
      groupMap.set(wType, group);
    }
    group.taskCount += 1;
    group.estimateMinutes += t.estimateMinutes ?? 0;
    group.actualMinutes += actualMinutesByTask.get(t.id) ?? 0;
  }

  const items: WorkTypeAccuracyItem[] = [];
  const chartData: WorkTypeAccuracyChartItem[] = [];

  let totalEstimateMinutes = 0;
  let totalActualMinutes = 0;

  for (const group of groupMap.values()) {
    const estimateHours = Math.round((group.estimateMinutes / 60) * 10) / 10;
    const actualHours = Math.round((group.actualMinutes / 60) * 10) / 10;

    if (estimateHours === 0 && actualHours === 0) continue;

    totalEstimateMinutes += group.estimateMinutes;
    totalActualMinutes += group.actualMinutes;

    const varianceHours = Math.round((actualHours - estimateHours) * 10) / 10;
    let variancePercent = 0;
    let accuracyPercent = 0;
    let bias: EstimationBias = 'accurate';
    let biasLabel = 'Chuẩn xác (±10%)';

    if (estimateHours === 0 && actualHours > 0) {
      bias = 'no_estimate';
      biasLabel = 'Chưa ước tính';
      variancePercent = 100;
      accuracyPercent = 0;
    } else if (estimateHours > 0 && actualHours === 0) {
      bias = 'no_actual';
      biasLabel = 'Chưa thực hiện';
      variancePercent = -100;
      accuracyPercent = 0;
    } else {
      const diffPercent = ((actualHours - estimateHours) / estimateHours) * 100;
      variancePercent = Math.round(diffPercent);

      if (Math.abs(diffPercent) <= 10) {
        bias = 'accurate';
        biasLabel = 'Chuẩn xác (±10%)';
        accuracyPercent = Math.max(0, Math.round(100 - Math.abs(diffPercent)));
      } else if (diffPercent > 10) {
        bias = 'underestimate';
        biasLabel = `Ước tính non (+${Math.round(diffPercent)}%)`;
        accuracyPercent = Math.max(0, Math.min(100, Math.round((estimateHours / actualHours) * 100)));
      } else {
        bias = 'overestimate';
        biasLabel = `Ước tính già (${Math.round(diffPercent)}%)`;
        accuracyPercent = Math.max(0, Math.min(100, Math.round((actualHours / estimateHours) * 100)));
      }
    }

    const workTypeLabel = WORK_TYPE_LABELS[group.workType] || group.workType;

    const item: WorkTypeAccuracyItem = {
      workType: group.workType,
      workTypeLabel,
      taskCount: group.taskCount,
      estimateMinutes: group.estimateMinutes,
      estimateHours,
      actualMinutes: group.actualMinutes,
      actualHours,
      varianceHours,
      variancePercent,
      accuracyPercent,
      bias,
      biasLabel,
    };

    items.push(item);

    if (estimateHours > 0) {
      chartData.push({
        workType: workTypeLabel,
        type: 'Ước tính (giờ)',
        hours: estimateHours,
      });
    }
    if (actualHours > 0) {
      chartData.push({
        workType: workTypeLabel,
        type: 'Thực tế (giờ)',
        hours: actualHours,
      });
    }
  }

  // Sort by total hours descending
  items.sort((a, b) => b.estimateHours + b.actualHours - (a.estimateHours + a.actualHours));

  const overallEstimateHours = Math.round((totalEstimateMinutes / 60) * 10) / 10;
  const overallActualHours = Math.round((totalActualMinutes / 60) * 10) / 10;

  let overallVariancePercent = 0;
  let overallAccuracyPercent = 0;
  let overallBias: EstimationBias = 'accurate';
  let overallBiasLabel = 'Chuẩn xác';

  if (overallEstimateHours > 0 && overallActualHours > 0) {
    const overallDiff = ((overallActualHours - overallEstimateHours) / overallEstimateHours) * 100;
    overallVariancePercent = Math.round(overallDiff);

    if (Math.abs(overallDiff) <= 10) {
      overallBias = 'accurate';
      overallBiasLabel = 'Chuẩn xác (±10%)';
      overallAccuracyPercent = Math.max(0, Math.round(100 - Math.abs(overallDiff)));
    } else if (overallDiff > 10) {
      overallBias = 'underestimate';
      overallBiasLabel = `Ước tính non (+${Math.round(overallDiff)}%)`;
      overallAccuracyPercent = Math.max(0, Math.min(100, Math.round((overallEstimateHours / overallActualHours) * 100)));
    } else {
      overallBias = 'overestimate';
      overallBiasLabel = `Ước tính già (${Math.round(overallDiff)}%)`;
      overallAccuracyPercent = Math.max(0, Math.min(100, Math.round((overallActualHours / overallEstimateHours) * 100)));
    }
  }

  // Generate insight tip
  let insightTip = 'Chưa có đủ dữ liệu ước tính và phiên làm việc thực tế để kết luận.';
  if (items.length > 0 && overallEstimateHours > 0 && overallActualHours > 0) {
    const underTypes = items.filter((i) => i.bias === 'underestimate');
    const overTypes = items.filter((i) => i.bias === 'overestimate');

    if (overallBias === 'underestimate') {
      const topUnder = underTypes[0]?.workTypeLabel;
      insightTip = `Bạn có xu hướng ước tính non (thực tế tốn hơn dự tính khoảng ${Math.abs(overallVariancePercent)}%). Cân nhắc cộng thêm 20-30% thời gian dự phòng khi lập kế hoạch${topUnder ? `, đặc biệt ở mảng "${topUnder}"` : ''}.`;
    } else if (overallBias === 'overestimate') {
      const topOver = overTypes[0]?.workTypeLabel;
      insightTip = `Bạn có xu hướng ước tính già (thực tế hoàn thành nhanh hơn dự tính khoảng ${Math.abs(overallVariancePercent)}%). Bạn có thể tự tin nhận thêm khối lượng công việc${topOver ? `, nhất là ở nhóm "${topOver}"` : ''}.`;
    } else {
      insightTip = 'Khả năng ước tính thời gian của bạn rất chuẩn xác (độ lệch trong ngưỡng 10%). Hãy tiếp tục duy trì phương pháp lập kế hoạch này!';
    }
  }

  return {
    items,
    chartData,
    overallEstimateHours,
    overallActualHours,
    overallVariancePercent,
    overallAccuracyPercent,
    overallBias,
    overallBiasLabel,
    insightTip,
  };
}

