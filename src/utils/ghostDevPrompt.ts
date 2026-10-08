import type { Task } from '../types/models';

export function generateGhostDevMasterPrompt(task: Task, repoPath: string): string {
  const parts: string[] = [
    `You are the Master/Lead Agent for task: "${task.name}".`,
    `Project root directory: ${repoPath}`,
    'Work directly in current working directory using relative paths. Execute and edit files immediately without spending turns on planning or decomposition. When parallel workers are strictly required, you can call native tool `Task(description, prompt, subagent_type)` or `dispatch_subtask(role, task_prompt, model)`.',
  ];

  if (task.description?.trim()) {
    parts.push(`Detailed description:\n${task.description.trim()}`);
  }

  const pendingChecklist = (task.checklist || []).filter((item) => !item.done);
  if (pendingChecklist.length > 0) {
    parts.push('Goals to complete:');
    pendingChecklist.forEach((item) => parts.push(`- ${item.text}`));
  }

  return parts.join('\n\n');
}

export function formatInlineFeedbackPrompt(
  filePath: string,
  lineNumber: number,
  selectedCode: string,
  userComment: string
): string {
  if (lineNumber <= 0) {
    return formatFileFeedbackPrompt(filePath, userComment);
  }
  return `Vui lòng sửa mã nguồn theo phản hồi sau:
- Tập tin: \`${filePath}\`
- Dòng: ${lineNumber}
- Đoạn mã liên quan:
\`\`\`
${selectedCode}
\`\`\`
- Yêu cầu chỉnh sửa: ${userComment}`;
}

export function formatFileFeedbackPrompt(filePath: string, userComment: string): string {
  return `Vui lòng xem xét và sửa tập tin sau:
- Tập tin: \`${filePath}\`
- Yêu cầu chỉnh sửa: ${userComment}`;
}
