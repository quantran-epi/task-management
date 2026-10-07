import type { Task } from '../types/models';

export function generateGhostDevMasterPrompt(task: Task, repoPath: string): string {
  const parts: string[] = [
    `You are the Master/Lead Agent responsible for planning, decomposing tasks, and coordinating execution for task: "${task.name}".`,
    `Project root directory: ${repoPath}`,
    'You are working directly in an isolated Git worktree directory (current working directory). All file edits, creations, or reads must be performed within this worktree directory using relative paths.',
  ];

  if (task.description?.trim()) {
    parts.push(`Detailed description:\n${task.description.trim()}`);
  }

  const pendingChecklist = (task.checklist || []).filter((item) => !item.done);
  if (pendingChecklist.length > 0) {
    parts.push('Goals to complete:');
    pendingChecklist.forEach((item) => parts.push(`- ${item.text}`));
  }

  parts.push(
    'When you need to delegate subtasks to parallel workers (up to 2 concurrent workers), you can call native tool `Task(description, prompt, subagent_type)` or `dispatch_subtask(role, task_prompt, model)`.'
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
