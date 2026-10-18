import type { TaskPlannerDatabase } from '../../db';
import type { ChatMessage } from '../../types/models';
import { getMessagesByThreadId, saveMessage } from '../../db/repositories/chatRepo';
import { completeJson } from './nineRouterClient';

export interface CompactionConfig {
  /** Maximum uncompacted messages before triggering compaction. Default 16 */
  triggerMessageThreshold?: number;
  /** Maximum total characters before triggering compaction. Default 24000 */
  triggerCharThreshold?: number;
  /** Number of recent messages to keep intact (not summarized). Default 6 */
  keepRecentCount?: number;
}

export const DEFAULT_COMPACTION_CONFIG: Required<CompactionConfig> = {
  triggerMessageThreshold: 16,
  triggerCharThreshold: 24000,
  keepRecentCount: 6,
};

export const COMPACTION_SYSTEM_PROMPT = `You are the conversation context compressor for TaskMate, a personal task and knowledge management assistant.
Your goal is to summarize past conversation turns into a dense, structured, factual context summary so that subsequent turns maintain full continuity without exceeding context token limits (similar to Claude Code context compaction).

Follow these strict rules:
1. Preserve all key entities, project names, task names, milestone titles, IDs, dates, and technical identifiers mentioned.
2. Preserve what was requested, what was decided, what actions were taken (mutations made to tasks/projects/notes), and what questions/topics were explored or answered.
3. If documented processes, knowledge items, or system codes were retrieved, briefly record what was found so follow-up queries know the ground truth.
4. Keep the summary dense, organized with bullet points, and concise (under 800 words).
5. Output plain markdown summary only. Do not add conversational greetings, introductions, or code fences.`;

export interface CompactContextOptions {
  threadId: string;
  db: TaskPlannerDatabase;
  endpoint: string;
  apiKey?: string;
  model: string;
  config?: CompactionConfig;
  signal?: AbortSignal;
}

export interface CompactContextResult {
  compacted: boolean;
  boundaryMessageId?: string;
  summaryText?: string;
  prunedCount?: number;
}

/**
 * Extracts plain text content from a ChatMessage, including grounded answer conclusions and claims if content is empty.
 */
export function extractMessageText(msg: ChatMessage): string {
  if (msg.content && msg.content.trim()) {
    return msg.content.trim();
  }
  if (msg.grounding) {
    if (msg.grounding.answer?.conclusion && msg.grounding.answer.conclusion.trim()) {
      return msg.grounding.answer.conclusion.trim();
    }
    if (msg.grounding.answer?.claims && msg.grounding.answer.claims.length > 0) {
      return msg.grounding.answer.claims
        .map((c) => `- ${c.text}`)
        .join('\n');
    }
    if (msg.grounding.outcome === 'NEEDS_CLARIFICATION') {
      return '[Yêu cầu làm rõ đối tượng/thực thể tra cứu]';
    }
    if (msg.grounding.outcome === 'NO_EVIDENCE') {
      return '[Không tìm thấy tài liệu phù hợp trong kho tri thức]';
    }
    if (msg.grounding.coverageWarnings && msg.grounding.coverageWarnings.length > 0) {
      return `[Tra cứu tri thức: ${msg.grounding.coverageWarnings.join(', ')}]`;
    }
  }
  return '';
}

/**
 * Checks whether the current thread requires compaction based on message count or character volume.
 */
export async function shouldCompactThread(
  threadId: string,
  db: TaskPlannerDatabase,
  config: CompactionConfig = {}
): Promise<{ needed: boolean; messagesToCompact: ChatMessage[]; messagesToKeep: ChatMessage[] }> {
  const triggerMsgs = config.triggerMessageThreshold ?? DEFAULT_COMPACTION_CONFIG.triggerMessageThreshold;
  const triggerChars = config.triggerCharThreshold ?? DEFAULT_COMPACTION_CONFIG.triggerCharThreshold;
  const keepRecent = config.keepRecentCount ?? DEFAULT_COMPACTION_CONFIG.keepRecentCount;

  const allMsgs = await getMessagesByThreadId(threadId, db);
  if (allMsgs.length === 0) {
    return { needed: false, messagesToCompact: [], messagesToKeep: [] };
  }

  // Find last context boundary
  let lastBoundaryIdx = -1;
  for (let i = allMsgs.length - 1; i >= 0; i--) {
    if (allMsgs[i]?.isContextBoundary) {
      lastBoundaryIdx = i;
      break;
    }
  }

  const activeSegment = lastBoundaryIdx >= 0 ? allMsgs.slice(lastBoundaryIdx + 1) : allMsgs;
  if (activeSegment.length <= keepRecent + 2) {
    return { needed: false, messagesToCompact: [], messagesToKeep: [] };
  }

  const totalChars = activeSegment.reduce((acc, m) => acc + extractMessageText(m).length, 0);

  if (activeSegment.length >= triggerMsgs || totalChars >= triggerChars) {
    const compactEndIdx = activeSegment.length - keepRecent;
    const messagesToCompact = activeSegment.slice(0, compactEndIdx);
    const messagesToKeep = activeSegment.slice(compactEndIdx);
    return { needed: true, messagesToCompact, messagesToKeep };
  }

  return { needed: false, messagesToCompact: [], messagesToKeep: [] };
}

/**
 * Compacts the conversation history when threshold is reached, creating a context boundary summary.
 */
export async function compactThreadContext(
  options: CompactContextOptions
): Promise<CompactContextResult> {
  const { threadId, db, endpoint, apiKey, model, config = {}, signal } = options;

  const check = await shouldCompactThread(threadId, db, config);
  if (!check.needed || check.messagesToCompact.length === 0) {
    return { compacted: false };
  }

  // Format messages to be summarized
  const transcriptLines: string[] = [];
  for (const msg of check.messagesToCompact) {
    const roleLabel = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'AI Assistant' : 'System';
    const text = extractMessageText(msg);
    if (text) {
      transcriptLines.push(`${roleLabel}: ${text}`);
    }
  }

  if (transcriptLines.length === 0) {
    return { compacted: false };
  }

  const userPrompt = `Summarize the following previous conversation transcript concisely into key facts, decisions, referenced topics, and actions:\n\n${transcriptLines.join('\n\n')}`;

  try {
    const rawSummary = await completeJson({
      endpoint,
      apiKey,
      model,
      temperature: 0.2,
      maxTokens: 1000,
      messages: [
        { role: 'system', content: COMPACTION_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      signal: signal ?? new AbortController().signal,
    });

    let summaryText = '';
    if (typeof rawSummary === 'string') {
      summaryText = rawSummary;
    } else if (rawSummary && typeof rawSummary === 'object') {
      // In case completeJson parsed JSON or returned object
      summaryText = (rawSummary as any).summary || (rawSummary as any).content || JSON.stringify(rawSummary);
    }

    if (!summaryText || !summaryText.trim()) {
      return { compacted: false };
    }

    const boundaryContent = `### Tóm tắt ngữ cảnh trước đó (Compact Context)\n${summaryText.trim()}`;

    // Save as context boundary message
    const boundaryMsg = await saveMessage(
      {
        threadId,
        role: 'system',
        content: boundaryContent,
        isContextBoundary: true,
      },
      db
    );

    return {
      compacted: true,
      boundaryMessageId: boundaryMsg.id,
      summaryText: boundaryContent,
      prunedCount: check.messagesToCompact.length,
    };
  } catch (err) {
    console.warn('[contextCompaction] Failed to compact thread context:', err);
    return { compacted: false };
  }
}
