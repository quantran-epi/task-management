import type { ChatCompletionMessage } from './types';
import { COMPACTION_SYSTEM_PROMPT } from './contextCompaction';
import { completeJson as defaultCompleteJson } from './nineRouterClient';

/**
 * In-loop context compaction.
 *
 * The pre-turn compactor (`compactThreadContext`) only runs before a turn starts.
 * Inside a long tool loop the history keeps growing; `pruneToolOutputsInMessages`
 * bounds message COUNT but not total characters, so a 30-loop analysis turn can
 * exceed any model context window. This helper summarizes the middle of the
 * in-memory message list once the reported prompt-token count crosses the
 * user-configured budget.
 */

export interface InLoopCompactionInput {
  messages: readonly ChatCompletionMessage[];
  /** Prompt tokens reported by the model for the most recent round. */
  promptTokens: number;
  /** Token budget derived from the app's "safe character budget" setting (chars / 4). */
  tokenBudget: number;
  endpoint: string;
  apiKey?: string;
  model: string;
  signal?: AbortSignal;
  /** Messages kept verbatim at the tail. Default 6. */
  keepRecentMessages?: number;
  /** Injectable for tests. */
  summarize?: typeof defaultCompleteJson;
}

export interface InLoopCompactionResult {
  messages: ChatCompletionMessage[];
  compacted: boolean;
  summarizedCount: number;
}

/**
 * Picks a tail start index that never orphans `tool` results from the assistant
 * message that produced the tool_calls.
 */
function findSafeTailStart(
  messages: readonly ChatCompletionMessage[],
  desiredStart: number
): number {
  let start = Math.max(1, desiredStart);
  while (start < messages.length && messages[start]?.role === 'tool') {
    start++;
  }
  return start;
}

function formatTranscript(messages: readonly ChatCompletionMessage[]): string {
  const lines: string[] = [];
  for (const msg of messages) {
    if (msg.role === 'system') continue;
    const text = typeof msg.content === 'string' ? msg.content : '';
    if (!text.trim()) continue;
    const label =
      msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'AI Assistant' : 'Tool result';
    lines.push(`${label}: ${text.trim()}`);
  }
  return lines.join('\n\n');
}

export async function compactMessagesInLoop(
  input: InLoopCompactionInput
): Promise<InLoopCompactionResult> {
  const unchanged: InLoopCompactionResult = {
    messages: [...input.messages],
    compacted: false,
    summarizedCount: 0,
  };

  if (input.tokenBudget <= 0) return unchanged;
  if (input.promptTokens <= input.tokenBudget) return unchanged;

  const keepRecent = Math.max(2, input.keepRecentMessages ?? 6);
  const desiredStart = input.messages.length - keepRecent;
  const tailStart = findSafeTailStart(input.messages, desiredStart);

  // Nothing meaningful to summarize: system prompt + original request + tail.
  if (tailStart <= 2) return unchanged;

  const head = input.messages[0];
  if (!head) return unchanged;

  const middle = input.messages.slice(1, tailStart);
  const transcript = formatTranscript(middle);
  if (!transcript.trim()) return unchanged;

  const summarize = input.summarize ?? defaultCompleteJson;
  try {
    const raw = await summarize({
      endpoint: input.endpoint,
      apiKey: input.apiKey,
      model: input.model,
      temperature: 0.2,
      maxTokens: 1000,
      messages: [
        { role: 'system', content: COMPACTION_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Summarize the following in-progress tool-use transcript into key facts, findings, decisions, and remaining work:\n\n${transcript}`,
        },
      ],
      signal: input.signal ?? new AbortController().signal,
    });

    const summaryText =
      typeof raw === 'string'
        ? raw
        : raw && typeof raw === 'object'
          ? ((raw as any).summary ?? (raw as any).content ?? JSON.stringify(raw))
          : '';

    if (!summaryText || !String(summaryText).trim()) return unchanged;

    const summaryMessage: ChatCompletionMessage = {
      role: 'system',
      content: `### Tóm tắt ngữ cảnh giữa lượt (In-loop compaction)\n${String(summaryText).trim()}`,
    };

    return {
      messages: [head, summaryMessage, ...input.messages.slice(tailStart)],
      compacted: true,
      summarizedCount: middle.length,
    };
  } catch {
    // Best-effort: a failed compaction must never break the turn.
    return unchanged;
  }
}
