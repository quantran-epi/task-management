import type { Milestone, Project, Task, WorkType } from '../types/models';
import { resolveInheritedTags } from '../domain/inheritance';
import { getTodayDateString } from './date';

export const VIETNAMESE_WORK_TYPE_LABELS: Record<WorkType, string> = {
  code: 'Lập trình',
  document: 'Tài liệu',
  meeting: 'Họp',
  support_testing: 'Hỗ trợ / Kiểm thử',
  investigate: 'Điều tra lỗi',
  configuration: 'Cấu hình',
  review_code: 'Duyệt mã nguồn',
};

export interface StandupTaskContext {
  projectMap?: Map<string, Project>;
  milestoneMap?: Map<string, Milestone>;
  todayStr?: string;
}

/**
 * Formats a list of tasks into a standardized Vietnamese Markdown standup report (SRCH-04, D-08, D-09, D-10).
 * Groups tasks by status (Done, In Progress / In Review / Resolved, Open) and resolves project names and inherited tags.
 * Excludes Cancelled tasks.
 */
export function formatStandupSummary(
  tasks: Task[],
  context: StandupTaskContext = {}
): string {
  const { projectMap, milestoneMap, todayStr = getTodayDateString() } = context;

  // Filter out Cancelled tasks
  const eligibleTasks = tasks.filter((t) => t.status !== 'Cancelled');

  const doneTasks = eligibleTasks.filter((t) => t.status === 'Done');
  const inProgressTasks = eligibleTasks.filter(
    (t) => t.status === 'In Progress' || t.status === 'In Review' || t.status === 'Resolved'
  );
  const pendingTasks = eligibleTasks.filter((t) => t.status === 'Open');

  const header = `# BÁO CÁO STANDUP NGÀY ${todayStr}`;

  if (doneTasks.length === 0 && inProgressTasks.length === 0 && pendingTasks.length === 0) {
    return `${header}\n\nKhông có tác vụ nào để báo cáo standup.`;
  }

  const sections: string[] = [header];

  function formatTaskLine(task: Task): string {
    const workTypeLabel = task.workType ? VIETNAMESE_WORK_TYPE_LABELS[task.workType] : 'Khác';
    const jiraPart = task.jiraKey ? `[${task.jiraKey}]` : '';
    const projectName = (task.projectId ? projectMap?.get(task.projectId)?.name : undefined) ?? 'Cá nhân';
    const deadline = task.deadline || 'Không có';

    const ancestors =
      projectMap || milestoneMap
        ? {
            project: task.projectId ? projectMap?.get(task.projectId) : undefined,
            milestone: task.milestoneId ? milestoneMap?.get(task.milestoneId) : undefined,
          }
        : {};

    const opsTags = resolveInheritedTags('opsOwners', task, ancestors).tags;
    const baTags = resolveInheritedTags('businessAnalysts', task, ancestors).tags;

    const opsPart = opsTags.length > 0 ? `Ops: ${opsTags.join(', ')}` : '';
    const baPart = baTags.length > 0 ? `BA: ${baTags.join(', ')}` : '';
    const assigneeStr = [opsPart, baPart].filter(Boolean).join(' | ') || 'Chưa gán';

    let line = `- [${workTypeLabel}]${jiraPart} ${task.name} (Dự án: ${projectName} | Hạn: ${deadline} | Phụ trách: ${assigneeStr})`;

    if (task.priority === 'Urgent') {
      line += '\n  - ⚠️ Ưu tiên khẩn cấp';
    }

    return line;
  }

  if (doneTasks.length > 0) {
    const lines = doneTasks.map(formatTaskLine).join('\n');
    sections.push(`### ✅ Đã hoàn thành\n${lines}`);
  }

  if (inProgressTasks.length > 0) {
    const lines = inProgressTasks.map(formatTaskLine).join('\n');
    sections.push(`### 🔄 Đang thực hiện\n${lines}`);
  }

  if (pendingTasks.length > 0) {
    const lines = pendingTasks.map(formatTaskLine).join('\n');
    sections.push(`### 📋 Kế hoạch / Đang chờ\n${lines}`);
  }

  return sections.join('\n\n');
}
