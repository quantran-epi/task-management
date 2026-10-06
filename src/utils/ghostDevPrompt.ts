import type { Task } from '../types/models';

export function generateGhostDevMasterPrompt(task: Task, repoPath: string): string {
  const parts: string[] = [
    `Bạn là Master/Lead Agent chịu trách nhiệm lập kế hoạch, phân rã công việc và điều phối giải quyết tác vụ: "${task.name}".`,
    `Thư mục làm việc: ${repoPath}`,
  ];

  if (task.description?.trim()) {
    parts.push(`Mô tả chi tiết:\n${task.description.trim()}`);
  }

  const pendingChecklist = (task.checklist || []).filter((item) => !item.done);
  if (pendingChecklist.length > 0) {
    parts.push('Mục tiêu cần hoàn thành:');
    pendingChecklist.forEach((item) => parts.push(`- ${item.text}`));
  }

  parts.push(
    'Khi cần phân chia tác vụ nhỏ hơn cho worker song song (tối đa 2 worker đồng thời), bạn có thể gọi tool: `Agent(prompt, description, model)` hoặc `dispatch_subtask(role, task_prompt, model)`.'
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
