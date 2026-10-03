import { message } from 'antd';
import type { Task } from '../../types/models';
import { isLocalPath, normalizeLocalPath } from '../../utils/documentLinks';
import { isTauriApp } from '../../utils/timerPopout';

/**
 * Escapes a string safely for shell arguments inside single quotes.
 * ' becomes '\''
 */
function escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

/**
 * Builds a prompt for Claude Code CLI using task name, uncompleted checklist items,
 * and associated local file paths per D-13.
 */
export function generateClaudeCliPrompt(task: Task): string {
  const parts: string[] = [`Task: ${task.name}`];

  if (task.description?.trim()) {
    parts.push(`Description: ${task.description.trim()}`);
  }

  const pendingChecklist = (task.checklist || []).filter((item) => !item.done);
  if (pendingChecklist.length > 0) {
    parts.push('Goals:');
    for (const item of pendingChecklist) {
      parts.push(`- ${item.text}`);
    }
  }

  const localFiles = (task.documentLinks || [])
    .filter((link) => isLocalPath(link))
    .map((link) => normalizeLocalPath(link));

  if (localFiles.length > 0) {
    parts.push(`Files:\n${localFiles.join('\n')}`);
  }

  return parts.join('\n\n');
}

/**
 * Generates shell-escaped command `claude "..."`
 */
export function generateClaudeCliCommand(task: Task): string {
  const prompt = generateClaudeCliPrompt(task);
  return `claude ${escapeShellArg(prompt)}`;
}

export interface LaunchClaudeTerminalOptions {
  task: Task;
  isTauri?: boolean;
  tauriInvoker?: (command: string, args?: Record<string, unknown>) => Promise<any>;
}

export interface LaunchClaudeTerminalResult {
  launched: boolean;
  copied: boolean;
  command: string;
}

/**
 * Launches external OS terminal on Tauri Desktop or copies command to clipboard on Web per D-13.
 */
export async function launchClaudeTerminal(
  options: LaunchClaudeTerminalOptions
): Promise<LaunchClaudeTerminalResult> {
  const { task, isTauri = isTauriApp(), tauriInvoker } = options;
  const command = generateClaudeCliCommand(task);

  if (isTauri) {
    try {
      if (tauriInvoker) {
        await tauriInvoker('launch_claude_terminal', { commandStr: command });
      } else {
        const api = await import('@tauri-apps/api/core');
        await api.invoke('launch_claude_terminal', { commandStr: command });
      }
      return { launched: true, copied: false, command };
    } catch (err: any) {
      console.warn('[claudeCliService] Tauri terminal spawn failed, falling back to clipboard:', err);
    }
  }

  // Web / PWA fallback: copy to clipboard
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(command);
      message.success('Đã sao chép lệnh Claude Code vào bộ nhớ tạm');
      return { launched: false, copied: true, command };
    }
  } catch (err) {
    console.warn('[claudeCliService] Failed to copy to clipboard:', err);
  }

  return { launched: false, copied: false, command };
}
