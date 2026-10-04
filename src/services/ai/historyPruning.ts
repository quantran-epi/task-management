import type { ChatCompletionMessage } from './types';

export const DEFAULT_MAX_HISTORY_CHARS = 30000;
export const DEFAULT_MAX_HISTORY_MESSAGES = 20;
export const DEFAULT_MAX_OLD_TOOL_CHARS = 500;

/**
 * Truncates a string to maxChars and appends a truncation notice if exceeded.
 */
export function truncateToolOutput(
  content: string,
  maxChars: number = DEFAULT_MAX_OLD_TOOL_CHARS
): string {
  if (!content || content.length <= maxChars) return content;
  return `${content.slice(0, maxChars)}\n... [Tool output truncated to preserve context budget]`;
}

/**
 * Prunes older tool result messages in a message list.
 * Keeps the most recent `keepRecentCount` tool outputs full.
 * Truncates older tool outputs exceeding `maxOldChars` (default 500).
 */
export function pruneToolOutputsInMessages(
  messages: ChatCompletionMessage[],
  keepRecentCount: number = 2,
  maxOldChars: number = DEFAULT_MAX_OLD_TOOL_CHARS
): ChatCompletionMessage[] {
  // Find indices of tool messages
  const toolIndices: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (messages[i]?.role === 'tool') {
      toolIndices.push(i);
    }
  }

  if (toolIndices.length <= keepRecentCount) {
    return messages;
  }

  // Indices of the latest tool outputs that should be kept full
  const recentToolIndices = new Set(toolIndices.slice(-keepRecentCount));

  return messages.map((msg, idx) => {
    if (msg.role === 'tool' && !recentToolIndices.has(idx) && msg.content) {
      if (msg.content.length > maxOldChars) {
        return {
          ...msg,
          content: truncateToolOutput(msg.content, maxOldChars),
        };
      }
    }
    return msg;
  });
}

export interface SelectHistoryOptions {
  maxMessages?: number | undefined;
  maxTotalChars?: number | undefined;
}

/**
 * Selects recent messages up to maxMessages while respecting a cumulative character budget.
 * Iterates backwards from newest to oldest. Guarantees at least the newest message is included.
 * Returns messages in chronological order.
 */
export function selectMessagesWithinBudget<T extends { content?: string | null }>(
  messages: T[],
  options: SelectHistoryOptions = {}
): T[] {
  const maxMessages = options.maxMessages ?? DEFAULT_MAX_HISTORY_MESSAGES;
  const maxTotalChars = options.maxTotalChars ?? DEFAULT_MAX_HISTORY_CHARS;

  if (messages.length === 0) return [];

  const selected: T[] = [];
  let currentChars = 0;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!;
    const msgLen = msg.content?.length || 0;

    // Always include the latest message even if it alone exceeds the budget
    if (selected.length === 0) {
      selected.unshift(msg);
      currentChars += msgLen;
      continue;
    }

    if (selected.length >= maxMessages) {
      break;
    }

    if (currentChars + msgLen > maxTotalChars) {
      break;
    }

    selected.unshift(msg);
    currentChars += msgLen;
  }

  return selected;
}
