import type { Task } from '../types/models';

export type GhostDevPromptLanguage = 'vi' | 'en';

export function generateGhostDevMasterPrompt(
  task: Task,
  repoPath: string,
  language: GhostDevPromptLanguage = 'vi'
): string {
  const isEn = language === 'en';

  const parts: string[] = isEn
    ? [
        `You are the Master/Lead Agent responsible for planning, decomposing tasks, and coordinating execution for task: "${task.name}".`,
        `Project root directory: ${repoPath}`,
        'You are working directly in an isolated Git worktree directory (current working directory). All file edits, creations, or reads must be performed within this worktree directory using relative paths.',
      ]
    : [
        `Bạn là Master/Lead Agent chịu trách nhiệm lập kế hoạch, phân rã công việc và điều phối giải quyết tác vụ: "${task.name}".`,
        `Thư mục gốc dự án: ${repoPath}`,
        'Bạn đang làm việc trực tiếp trong thư mục Git worktree riêng biệt (thư mục làm việc hiện tại). Mọi thao tác chỉnh sửa, tạo file hoặc đọc mã nguồn phải được thực hiện trong thư mục worktree này theo đường dẫn tương đối.',
      ];

  if (task.description?.trim()) {
    parts.push(
      isEn
        ? `Detailed description:\n${task.description.trim()}`
        : `Mô tả chi tiết:\n${task.description.trim()}`
    );
  }

  const pendingChecklist = (task.checklist || []).filter((item) => !item.done);
  if (pendingChecklist.length > 0) {
    parts.push(isEn ? 'Goals to complete:' : 'Mục tiêu cần hoàn thành:');
    pendingChecklist.forEach((item) => parts.push(`- ${item.text}`));
  }

  parts.push(
    isEn
      ? 'When you need to delegate subtasks to parallel workers (up to 2 concurrent workers), you can call native tool `Task(description, prompt, subagent_type)` or `dispatch_subtask(role, task_prompt, model)`.'
      : 'Khi cần phân chia tác vụ nhỏ hơn cho worker song song (tối đa 2 worker đồng thời), bạn có thể gọi native tool `Task(description, prompt, subagent_type)` hoặc `dispatch_subtask(role, task_prompt, model)`.'
  );

  return parts.join('\n\n');
}

export function formatInlineFeedbackPrompt(
  filePath: string,
  lineNumber: number,
  selectedCode: string,
  userComment: string
): string {
  return `Vui lòng sửa mã nguồn theo phản hồi sau:
- Tập tin: \`${filePath}\`
- Dòng: ${lineNumber}
- Đoạn mã liên quan:
\`\`\`
${selectedCode}
\`\`\`
- Yêu cầu chỉnh sửa: ${userComment}`;
}
