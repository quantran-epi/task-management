import type { Task, WorkSession } from '../types/models';
import type {
  EstimateVsActualItem,
  WorkTypeBreakdownItem,
  ProductivityHeatmapItem,
  AnalyticsPeriod,
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
  for (let d = 0; d < 7; d++) {
    const dayLabel = DAY_LABELS[d] ?? `Thứ ${d + 2}`;
    for (let h = 0; h < 24; h++) {
      const mins = grid[d]?.[h] ?? 0;
      if (mins <= 0) continue;
      const hourLabel = `${String(h).padStart(2, '0')}:00`;
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
