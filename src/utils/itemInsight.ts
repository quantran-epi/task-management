import type { Task, Project, Milestone, WorkSession, PlannedAllocation, CapacityRule, Note } from '../types/models';
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

export interface ProjectInsightMetrics {
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
  milestonesCount: number;
  approachingMilestonesCount: number;
}

export interface ProjectInsightAnalysis {
  metrics: ProjectInsightMetrics;
  recommendations: InsightRecommendation[];
}

export interface MilestoneInsightMetrics {
  totalTasks: number;
  doneTasks: number;
  openTasks: number;
  inProgressTasks: number;
  overdueTasks: number;
  completionRate: number;
  remainingEstimateMinutes: number;
  daysRemaining: number | null;
  dailyCapacityMinutes: number;
  capacityNeededDailyMinutes: number;
  highOrUrgentOpenTasks: number;
}

export interface MilestoneInsightAnalysis {
  metrics: MilestoneInsightMetrics;
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
 * Project Insight analysis:
 * - Task completion & distribution
 * - Time budget (estimate vs actual vs planned)
 * - Milestone tracking
 * - Pre-implementation bottlenecks
 */
export function analyzeProjectInsight(
  project: Project,
  projectTasks: Task[],
  projectMilestones: Milestone[],
  allWorkSessions: WorkSession[],
  allPlannedAllocations: PlannedAllocation[]
): ProjectInsightAnalysis {
  const totalTasks = projectTasks.length;
  const doneTasks = projectTasks.filter((t) => t.status === 'Done').length;
  const inProgressTasks = projectTasks.filter((t) => t.status === 'In Progress').length;
  const openTasks = projectTasks.filter((t) => t.status === 'Open' || t.status === 'Pending').length;

  const today = getTodayDateString();
  const overdueTasks = projectTasks.filter((t) => {
    if (t.status === 'Done' || t.status === 'Cancelled' || !t.deadline) return false;
    return t.deadline < today;
  }).length;

  const completionRate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const unestimatedTaskCount = projectTasks.filter(
    (t) => t.status !== 'Done' && t.status !== 'Cancelled' && (!t.estimateMinutes || t.estimateMinutes === 0)
  ).length;

  const totalEstimatedMinutes = projectTasks.reduce((sum, t) => sum + (t.estimateMinutes || 0), 0);

  const taskIds = new Set(projectTasks.map((t) => t.id));
  const actualSpentMinutes = allWorkSessions
    .filter((s) => taskIds.has(s.taskId))
    .reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
  const plannedMinutes = allPlannedAllocations
    .filter((a) => taskIds.has(a.taskId))
    .reduce((sum, a) => sum + (a.allocatedMinutes || 0), 0);

  const milestonesCount = projectMilestones.length;
  const approachingMilestonesCount = projectMilestones.filter((m) => {
    if (m.status === 'Done' || m.status === 'Cancelled' || !m.deadline) return false;
    const diff = dayjs(m.deadline).diff(dayjs(today), 'day');
    return diff >= 0 && diff <= 7;
  }).length;

  const recommendations: InsightRecommendation[] = [];

  if (project.deadline && isValidCalendarDate(project.deadline)) {
    const diffDays = dayjs(project.deadline).diff(dayjs(today), 'day');
    if (diffDays < 0 && project.status !== 'Done' && project.status !== 'Cancelled') {
      recommendations.push({
        id: 'proj-overdue',
        severity: 'danger',
        title: 'Dự án đã quá hạn chót',
        description: `Hạn chót dự án là ${project.deadline} (${Math.abs(diffDays)} ngày trước). Cần đánh giá lại tiến độ tổng thể.`,
      });
    }
  }

  if (totalTasks === 0) {
    recommendations.push({
      id: 'proj-no-tasks',
      severity: 'warning',
      title: 'Dự án chưa có tác vụ nào',
      description: 'Hãy phân rã mục tiêu dự án thành các tác vụ cụ thể để bắt đầu lập kế hoạch.',
      actionText: 'Tạo tác vụ mới',
      actionKey: 'create-task',
    });
  }

  if (unestimatedTaskCount > 0) {
    recommendations.push({
      id: 'proj-unestimated-tasks',
      severity: 'warning',
      title: `${unestimatedTaskCount} tác vụ chưa được ước lượng thời gian`,
      description: 'Nhiều tác vụ thiếu ước lượng khiến tổng khối lượng công việc và tiến độ dự án không thể dự báo chính xác.',
      actionText: 'Xem danh sách tác vụ',
      actionKey: 'view-tasks',
    });
  }

  if (overdueTasks > 0) {
    recommendations.push({
      id: 'proj-overdue-tasks',
      severity: 'danger',
      title: `Có ${overdueTasks} tác vụ bị quá hạn`,
      description: 'Dự án đang có tác vụ trễ deadline. Cần rà soát và điều chỉnh thứ tự ưu tiên hoặc ngày hoàn thành.',
      actionText: 'Xem tác vụ',
      actionKey: 'view-tasks',
    });
  }

  if (milestonesCount === 0 && totalTasks > 5) {
    recommendations.push({
      id: 'proj-no-milestones',
      severity: 'info',
      title: 'Chưa thiết lập cột mốc (Milestone)',
      description: 'Dự án có trên 5 tác vụ nhưng chưa có cột mốc kiểm soát. Tạo milestone giúp chia nhỏ chặng đường và theo dõi burndown dễ dàng hơn.',
      actionText: 'Tạo cột mốc',
      actionKey: 'create-milestone',
    });
  }

  if (approachingMilestonesCount > 0) {
    recommendations.push({
      id: 'proj-approaching-milestones',
      severity: 'warning',
      title: `Có ${approachingMilestonesCount} cột mốc sắp đến hạn trong vòng 7 ngày`,
      description: 'Kiểm tra khối lượng công việc còn lại của các mốc này để đảm bảo bàn giao đúng cam kết.',
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      id: 'proj-healthy',
      severity: 'success',
      title: 'Tiến độ dự án đang ổn định',
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
      milestonesCount,
      approachingMilestonesCount,
    },
    recommendations,
  };
}

/**
 * Milestone Insight analysis:
 * - Scope & progress distribution
 * - Schedule feasibility vs capacity
 * - Priority focus
 */
export function analyzeMilestoneInsight(
  milestone: Milestone,
  milestoneTasks: Task[],
  capacityRules: CapacityRule[] = []
): MilestoneInsightAnalysis {
  const totalTasks = milestoneTasks.length;
  const doneTasks = milestoneTasks.filter((t) => t.status === 'Done').length;
  const inProgressTasks = milestoneTasks.filter((t) => t.status === 'In Progress').length;
  const openTasks = milestoneTasks.filter((t) => t.status === 'Open' || t.status === 'Pending').length;

  const today = getTodayDateString();
  const overdueTasks = milestoneTasks.filter((t) => {
    if (t.status === 'Done' || t.status === 'Cancelled' || !t.deadline) return false;
    return t.deadline < today;
  }).length;

  const completionRate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const remainingTasks = milestoneTasks.filter((t) => t.status !== 'Done' && t.status !== 'Cancelled');
  const remainingEstimateMinutes = remainingTasks.reduce((sum, t) => sum + (t.estimateMinutes || 0), 0);

  const highOrUrgentOpenTasks = remainingTasks.filter(
    (t) => t.priority === 'High' || t.priority === 'Urgent'
  ).length;

  let daysRemaining: number | null = null;
  if (milestone.deadline && isValidCalendarDate(milestone.deadline)) {
    const dTarget = dayjs(milestone.deadline);
    const dToday = dayjs(today);
    daysRemaining = dTarget.diff(dToday, 'day');
  }

  // Calculate average daily capacity from capacityRules (default to 480m / 8h if empty)
  const activeRules = capacityRules.filter((r) => r.workMinutes > 0);
  const dailyCapacityMinutes = activeRules.length > 0
    ? Math.round(activeRules.reduce((sum, r) => sum + r.workMinutes, 0) / activeRules.length)
    : 480;

  const capacityNeededDailyMinutes = daysRemaining !== null && daysRemaining > 0
    ? Math.round(remainingEstimateMinutes / daysRemaining)
    : remainingEstimateMinutes;

  const recommendations: InsightRecommendation[] = [];

  if (totalTasks === 0) {
    recommendations.push({
      id: 'ms-no-tasks',
      severity: 'warning',
      title: 'Cột mốc chưa gắn tác vụ',
      description: 'Chưa có tác vụ nào thuộc cột mốc này. Gắn các tác vụ tương ứng để theo dõi tiến độ.',
      actionText: 'Thêm tác vụ',
      actionKey: 'create-task',
    });
  }

  if (daysRemaining !== null && daysRemaining < 0 && milestone.status !== 'Done') {
    recommendations.push({
      id: 'ms-overdue',
      severity: 'danger',
      title: 'Cột mốc đã trễ hạn',
      description: `Hạn của cột mốc là ${milestone.deadline} (${Math.abs(daysRemaining)} ngày trước) nhưng vẫn còn ${remainingTasks.length} tác vụ chưa xong.`,
      actionText: 'Cập nhật mốc',
      actionKey: 'edit-milestone',
    });
  } else if (daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= 3 && remainingTasks.length > 0) {
    recommendations.push({
      id: 'ms-deadline-close',
      severity: 'warning',
      title: 'Hạn mốc rất cận kề (≤ 3 ngày)',
      description: `Còn ${daysRemaining} ngày và ${remainingTasks.length} tác vụ (${(remainingEstimateMinutes / 60).toFixed(1)}h công việc) chưa hoàn thành.`,
      actionText: 'Xem tiến độ',
      actionKey: 'view-burndown',
    });
  }

  if (daysRemaining !== null && daysRemaining > 0 && capacityNeededDailyMinutes > dailyCapacityMinutes) {
    recommendations.push({
      id: 'ms-capacity-overload',
      severity: 'danger',
      title: 'Nguy cơ quá tải thời gian hàng ngày',
      description: `Cần ${(capacityNeededDailyMinutes / 60).toFixed(1)}h mỗi ngày để kịp mốc, trong khi dung lượng làm việc trung bình là ${(dailyCapacityMinutes / 60).toFixed(1)}h. Cân nhắc giảm phạm vi hoặc kéo giãn thời hạn.`,
      actionText: 'Xem Burndown',
      actionKey: 'view-burndown',
    });
  }

  if (highOrUrgentOpenTasks > 0) {
    recommendations.push({
      id: 'ms-high-priority',
      severity: 'info',
      title: `Có ${highOrUrgentOpenTasks} tác vụ ưu tiên Cao / Khẩn cấp cần giải quyết`,
      description: 'Ưu tiên xếp lịch các tác vụ này trước để giảm thiểu rủi ro cho cột mốc.',
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      id: 'ms-on-track',
      severity: 'success',
      title: 'Cột mốc đang bám sát tiến độ',
      description: 'Thời gian và khối lượng công việc nằm trong dung lượng khả thi. Tiếp tục triển khai.',
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
      daysRemaining,
      dailyCapacityMinutes,
      capacityNeededDailyMinutes,
      highOrUrgentOpenTasks,
    },
    recommendations,
  };
}
