import type { Task, ChangeRequest, System, WorkSession, PlannedAllocation, Note } from '../types/models';
import { getTodayDateString, isValidCalendarDate } from './date';
import dayjs from 'dayjs';

export type InsightSeverity = 'danger' | 'warning' | 'info' | 'success';

export interface InsightRecommendation {
  id: string;
  severity: InsightSeverity;
  title: string;
  description: string;
  actionText?: string;
  actionKey?: string;
}

export interface TaskInsightMetrics {
  estimateMinutes: number;
  actualSpentMinutes: number;
  plannedMinutes: number;
  remainingMinutes: number;
  spentPercentOfEstimate: number;
  totalSubtasks: number;
  completedSubtasks: number;
  subtaskPercent: number;
  hasDeadline: boolean;
  isOverdue: boolean;
  daysUntilDeadline: number | null;
  activeInProgressCount: number;
  notesCount: number;
  hasJiraKey: boolean;
}

export interface TaskInsightAnalysis {
  metrics: TaskInsightMetrics;
  recommendations: InsightRecommendation[];
}

export interface ChangeRequestInsightMetrics {
  totalTasks: number;
  doneTasks: number;
  inProgressTasks: number;
  openTasks: number;
  overdueTasks: number;
  completionRate: number;
  totalEstimatedMinutes: number;
  actualSpentMinutes: number;
  plannedMinutes: number;
  unestimatedTaskCount: number;
  targetSystemsCount: number;
}

export interface ChangeRequestInsightAnalysis {
  metrics: ChangeRequestInsightMetrics;
  recommendations: InsightRecommendation[];
}

export interface SystemInsightMetrics {
  totalTasks: number;
  doneTasks: number;
  inProgressTasks: number;
  openTasks: number;
  overdueTasks: number;
  completionRate: number;
  remainingEstimateMinutes: number;
  changeRequestCount: number;
}

export interface SystemInsightAnalysis {
  metrics: SystemInsightMetrics;
  recommendations: InsightRecommendation[];
}

/**
 * Task Insight analysis:
 * - Estimate health (missing, > 4h split suggestion, spent exceeds estimate)
 * - Scheduling & feasibility (unscheduled, deadline proximity, overdue)
 * - Completeness (subtasks, notes, Jira)
 * - Multitasking risk (concurrent In Progress tasks)
 */
export function analyzeTaskInsight(
  task: Task,
  workSessions: WorkSession[],
  plannedAllocations: PlannedAllocation[],
  allTasks: Task[],
  notes: Note[] = []
): TaskInsightAnalysis {
  const actualSpentMinutes = workSessions.reduce((acc, s) => acc + (s.durationMinutes || 0), 0);
  const plannedMinutes = plannedAllocations.reduce((acc, a) => acc + (a.allocatedMinutes || 0), 0);
  const estimateMinutes = task.estimateMinutes || 0;
  const remainingMinutes = Math.max(0, estimateMinutes - actualSpentMinutes);
  const spentPercentOfEstimate = estimateMinutes > 0 ? Math.round((actualSpentMinutes / estimateMinutes) * 100) : 0;

  const checklist = task.checklist || [];
  const totalSubtasks = checklist.length;
  const completedSubtasks = checklist.filter((item) => item.done).length;
  const subtaskPercent = totalSubtasks > 0 ? Math.round((completedSubtasks / totalSubtasks) * 100) : 0;

  const today = getTodayDateString();
  const hasDeadline = Boolean(task.deadline && isValidCalendarDate(task.deadline));
  let isOverdue = false;
  let daysUntilDeadline: number | null = null;

  if (hasDeadline && task.deadline) {
    const dTarget = dayjs(task.deadline);
    const dToday = dayjs(today);
    daysUntilDeadline = dTarget.diff(dToday, 'day');
    if (daysUntilDeadline < 0 && task.status !== 'Done' && task.status !== 'Cancelled') {
      isOverdue = true;
    }
  }

  // Active in progress tasks excluding current task
  const activeInProgressCount = allTasks.filter(
    (t) => t.id !== task.id && t.status === 'In Progress'
  ).length;

  const taskNotes = notes.filter((n) => n.entityId === task.id || (n.entityType === 'task' && n.entityId === task.id));

  const recommendations: InsightRecommendation[] = [];

  // 1. Estimate Health
  if (estimateMinutes === 0) {
    recommendations.push({
      id: 'task-no-estimate',
      severity: 'warning',
      title: 'Chưa ước lượng thời gian',
      description: 'Tác vụ chưa có thời lượng ước tính. Ước lượng thời gian giúp phân bổ lịch và dự báo quá tải chính xác.',
      actionText: 'Ước lượng ngay',
      actionKey: 'edit-task',
    });
  } else if (estimateMinutes > 240) {
    recommendations.push({
      id: 'task-oversized',
      severity: 'warning',
      title: 'Tác vụ có quy mô lớn (> 4 giờ)',
      description: `Ước tính ${(estimateMinutes / 60).toFixed(1)}h. Khuyến nghị phân rã thành các checklist hoặc tác vụ nhỏ hơn để tránh tắc nghẽn và cải thiện độ tập trung.`,
      actionText: 'Thêm checklist',
      actionKey: 'open-checklist',
    });
  }

  if (estimateMinutes > 0 && actualSpentMinutes > estimateMinutes) {
    recommendations.push({
      id: 'task-spent-exceeded',
      severity: 'danger',
      title: 'Thời gian làm thực tế vượt ước tính',
      description: `Đã làm ${actualSpentMinutes} phút (${spentPercentOfEstimate}% so với ước tính ${estimateMinutes} phút). Cần đánh giá lại phạm vi hoặc điều chỉnh ước lượng.`,
      actionText: 'Cập nhật ước lượng',
      actionKey: 'edit-task',
    });
  }

  // 2. Deadline & Scheduling
  if (isOverdue) {
    recommendations.push({
      id: 'task-overdue',
      severity: 'danger',
      title: 'Tác vụ đã trễ hạn chót',
      description: `Hạn chót là ${task.deadline} (${Math.abs(daysUntilDeadline ?? 0)} ngày trước). Cần ưu tiên xử lý dứt điểm hoặc dời deadline khả thi.`,
      actionText: 'Xem lịch phân bổ',
      actionKey: 'go-planner',
    });
  } else if (daysUntilDeadline !== null && daysUntilDeadline <= 2 && task.status !== 'Done') {
    recommendations.push({
      id: 'task-deadline-imminent',
      severity: 'warning',
      title: 'Hạn chót sắp tới',
      description: `Chỉ còn ${daysUntilDeadline} ngày trước hạn chót (${task.deadline}). Kiểm tra phân bổ lịch làm việc để đảm bảo kịp tiến độ.`,
      actionText: 'Phân bổ lịch',
      actionKey: 'go-planner',
    });
  }

  if (task.status !== 'Done' && task.status !== 'Cancelled' && plannedMinutes === 0) {
    recommendations.push({
      id: 'task-unscheduled',
      severity: 'info',
      title: 'Chưa có phân bổ trên lịch làm việc',
      description: 'Tác vụ chưa được gán giờ làm việc cụ thể trong tuần. Hãy xếp lịch trên trang Planner để đảm bảo hoàn thành.',
      actionText: 'Xếp lịch trên Planner',
      actionKey: 'go-planner',
    });
  }

  // 3. Completeness & Prerequisites
  if (totalSubtasks > 0 && completedSubtasks < totalSubtasks) {
    recommendations.push({
      id: 'task-checklist-incomplete',
      severity: 'info',
      title: `Checklist chưa hoàn tất (${completedSubtasks}/${totalSubtasks})`,
      description: `Còn ${totalSubtasks - completedSubtasks} mục trong checklist cần kiểm tra và đánh dấu.`,
    });
  }

  if (!task.jiraKey && !task.description && totalSubtasks === 0) {
    recommendations.push({
      id: 'task-missing-details',
      severity: 'info',
      title: 'Thiếu mô tả hoặc tiêu chí nghiệm thu',
      description: 'Tác vụ chưa có mô tả chi tiết, checklist hoặc mã Jira. Nên bổ sung tiêu chí hoàn thành trước khi bắt tay làm.',
      actionText: 'Chỉnh sửa tác vụ',
      actionKey: 'edit-task',
    });
  }

  // 4. Multitasking
  if (task.status === 'In Progress' && activeInProgressCount >= 2) {
    recommendations.push({
      id: 'task-multitasking-risk',
      severity: 'warning',
      title: 'Nguy cơ phân tán do đa nhiệm',
      description: `Đang có ${activeInProgressCount} tác vụ khác cùng ở trạng thái "Đang làm". Khuyến nghị tập trung hoàn thành dứt điểm 1 việc (Single-tasking).`,
    });
  }

  // If everything looks clear
  if (recommendations.length === 0) {
    recommendations.push({
      id: 'task-ready',
      severity: 'success',
      title: 'Sẵn sàng triển khai',
      description: 'Tác vụ có đầy đủ ước tính thời gian, phân bổ và tiêu chí rõ ràng. Bạn có thể bấm bắt đầu làm ngay.',
      actionText: 'Bắt đầu làm',
      actionKey: 'start-timer',
    });
  }

  return {
    metrics: {
      estimateMinutes,
      actualSpentMinutes,
      plannedMinutes,
      remainingMinutes,
      spentPercentOfEstimate,
      totalSubtasks,
      completedSubtasks,
      subtaskPercent,
      hasDeadline,
      isOverdue,
      daysUntilDeadline,
      activeInProgressCount,
      notesCount: taskNotes.length,
      hasJiraKey: Boolean(task.jiraKey),
    },
    recommendations,
  };
}

/**
 * Change Request Insight analysis:
 * - Task completion & distribution across the CR's tasks
 * - Time budget (estimate vs actual vs planned)
 * - Target subsystem coverage
 * - Pre-implementation bottlenecks
 */
export function analyzeChangeRequestInsight(
  changeRequest: ChangeRequest,
  crTasks: Task[],
  targetSystems: System[],
  allWorkSessions: WorkSession[],
  allPlannedAllocations: PlannedAllocation[]
): ChangeRequestInsightAnalysis {
  const totalTasks = crTasks.length;
  const doneTasks = crTasks.filter((t) => t.status === 'Done').length;
  const inProgressTasks = crTasks.filter((t) => t.status === 'In Progress').length;
  const openTasks = crTasks.filter((t) => t.status === 'Open' || t.status === 'Pending').length;

  const today = getTodayDateString();
  const overdueTasks = crTasks.filter((t) => {
    if (t.status === 'Done' || t.status === 'Cancelled' || !t.deadline) return false;
    return t.deadline < today;
  }).length;

  const completionRate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const unestimatedTaskCount = crTasks.filter(
    (t) => t.status !== 'Done' && t.status !== 'Cancelled' && (!t.estimateMinutes || t.estimateMinutes === 0)
  ).length;

  const totalEstimatedMinutes = crTasks.reduce((sum, t) => sum + (t.estimateMinutes || 0), 0);

  const taskIds = new Set(crTasks.map((t) => t.id));
  const actualSpentMinutes = allWorkSessions
    .filter((s) => taskIds.has(s.taskId))
    .reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
  const plannedMinutes = allPlannedAllocations
    .filter((a) => taskIds.has(a.taskId))
    .reduce((sum, a) => sum + (a.allocatedMinutes || 0), 0);

  const targetSystemsCount = targetSystems.length;

  const recommendations: InsightRecommendation[] = [];

  if (changeRequest.deadline && isValidCalendarDate(changeRequest.deadline)) {
    const diffDays = dayjs(changeRequest.deadline).diff(dayjs(today), 'day');
    if (diffDays < 0 && changeRequest.status !== 'Done' && changeRequest.status !== 'Cancelled') {
      recommendations.push({
        id: 'cr-overdue',
        severity: 'danger',
        title: 'Change Request đã quá hạn chót',
        description: `Hạn chót CR là ${changeRequest.deadline} (${Math.abs(diffDays)} ngày trước). Cần đánh giá lại tiến độ tổng thể.`,
      });
    }
  }

  if (totalTasks === 0) {
    recommendations.push({
      id: 'cr-no-tasks',
      severity: 'warning',
      title: 'CR chưa có tác vụ nào',
      description: 'Hãy phân rã mục tiêu CR thành các tác vụ cụ thể để bắt đầu lập kế hoạch.',
      actionText: 'Tạo tác vụ mới',
      actionKey: 'create-task',
    });
  }

  if (unestimatedTaskCount > 0) {
    recommendations.push({
      id: 'cr-unestimated-tasks',
      severity: 'warning',
      title: `${unestimatedTaskCount} tác vụ chưa được ước lượng thời gian`,
      description: 'Nhiều tác vụ thiếu ước lượng khiến tổng khối lượng công việc và tiến độ CR không thể dự báo chính xác.',
      actionText: 'Xem danh sách tác vụ',
      actionKey: 'view-tasks',
    });
  }

  if (overdueTasks > 0) {
    recommendations.push({
      id: 'cr-overdue-tasks',
      severity: 'danger',
      title: `Có ${overdueTasks} tác vụ bị quá hạn`,
      description: 'CR đang có tác vụ trễ deadline. Cần rà soát và điều chỉnh thứ tự ưu tiên hoặc ngày hoàn thành.',
      actionText: 'Xem tác vụ',
      actionKey: 'view-tasks',
    });
  }

  if (targetSystemsCount === 0) {
    recommendations.push({
      id: 'cr-no-targets',
      severity: 'info',
      title: 'CR chưa gắn subsystem nào',
      description: 'Chưa có subsystem mục tiêu nên không thể triển khai hay tạo nhánh tính năng theo hệ thống.',
      actionText: 'Gắn subsystem',
      actionKey: 'edit-cr',
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      id: 'cr-healthy',
      severity: 'success',
      title: 'Tiến độ CR đang ổn định',
      description: 'Các tác vụ đều được ước lượng và bám sát kế hoạch. Tiếp tục duy trì nhịp độ làm việc.',
    });
  }

  return {
    metrics: {
      totalTasks,
      doneTasks,
      inProgressTasks,
      openTasks,
      overdueTasks,
      completionRate,
      totalEstimatedMinutes,
      actualSpentMinutes,
      plannedMinutes,
      unestimatedTaskCount,
      targetSystemsCount,
    },
    recommendations,
  };
}

/**
 * Subsystem Insight analysis:
 * - Task scope & progress for the subsystem
 * - Remaining effort
 * - Change Request coverage
 */
export function analyzeSystemInsight(
  system: System,
  systemTasks: Task[],
  changeRequests: ChangeRequest[]
): SystemInsightAnalysis {
  const totalTasks = systemTasks.length;
  const doneTasks = systemTasks.filter((t) => t.status === 'Done').length;
  const inProgressTasks = systemTasks.filter((t) => t.status === 'In Progress').length;
  const openTasks = systemTasks.filter((t) => t.status === 'Open' || t.status === 'Pending').length;

  const today = getTodayDateString();
  const overdueTasks = systemTasks.filter((t) => {
    if (t.status === 'Done' || t.status === 'Cancelled' || !t.deadline) return false;
    return t.deadline < today;
  }).length;

  const completionRate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const remainingTasks = systemTasks.filter((t) => t.status !== 'Done' && t.status !== 'Cancelled');
  const remainingEstimateMinutes = remainingTasks.reduce((sum, t) => sum + (t.estimateMinutes || 0), 0);

  const changeRequestCount = changeRequests.filter((cr) =>
    cr.targets.some((target) => target.systemId === system.id)
  ).length;

  const recommendations: InsightRecommendation[] = [];

  if (totalTasks === 0) {
    recommendations.push({
      id: 'sys-no-tasks',
      severity: 'warning',
      title: 'Subsystem chưa gắn tác vụ',
      description: 'Chưa có tác vụ nào thuộc subsystem này. Gắn tác vụ tương ứng để theo dõi tiến độ.',
      actionText: 'Thêm tác vụ',
      actionKey: 'create-task',
    });
  }

  if (overdueTasks > 0) {
    recommendations.push({
      id: 'sys-overdue-tasks',
      severity: 'danger',
      title: `Có ${overdueTasks} tác vụ bị quá hạn`,
      description: 'Subsystem đang có tác vụ trễ deadline. Cần rà soát và điều chỉnh thứ tự ưu tiên.',
      actionText: 'Xem tác vụ',
      actionKey: 'view-tasks',
    });
  }

  if (changeRequestCount === 0) {
    recommendations.push({
      id: 'sys-no-crs',
      severity: 'info',
      title: 'Subsystem chưa thuộc Change Request nào',
      description: 'Subsystem chưa là mục tiêu của CR nào nên chưa có luồng bàn giao chính thức.',
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      id: 'sys-on-track',
      severity: 'success',
      title: 'Subsystem đang bám sát tiến độ',
      description: 'Khối lượng công việc nằm trong dung lượng khả thi. Tiếp tục triển khai.',
    });
  }

  return {
    metrics: {
      totalTasks,
      doneTasks,
      openTasks,
      inProgressTasks,
      overdueTasks,
      completionRate,
      remainingEstimateMinutes,
      changeRequestCount,
    },
    recommendations,
  };
}
