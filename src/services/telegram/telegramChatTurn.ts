import type { TaskPlannerDatabase } from '../../db';
import { createOrGetThread, saveMessage } from '../../db/repositories/chatRepo';
import { getTodayDateString } from '../../utils/date';
import dayjs from 'dayjs';
import { APP_NAME } from '../../constants/app';
import { dispatchAiToolCall } from '../ai/aiOrchestratorLoop';
import { AI_DATABASE_TOOLS, isMutationTool, normalizeToolName } from '../ai/aiTools';
import { CHAT_HISTORY_TOOL_NAMES, executeChatHistoryTool } from '../ai/chatHistoryTools';
import { getGlobalConventions } from '../../services/conventionService';
import { buildConventionsSegment } from '../ai/conventionsSegment';
import { getGraphitiSkillSegment } from '../ai/graphitiRules';
import type { ChatCompletionMessage } from '../ai/types';
import type { ChatGeneratedFile, ChatTokenUsage } from '../../types/models';
import type { TelegramDataScope } from './telegramTypes';
import {
  buildTelegramTurnTools,
  readTelegramToolConfig,
  withTelegramTranscriptTools,
} from './telegramChatTurnTools';
import {
  KNOWLEDGE_SERVER_EMPTY_NOTICE,
  detectKnowledgeToolOutcome,
} from '../ai/knowledgeOutcome';

/**
 * Telegram-only host adapter around the shared `runAiOrchestratorLoop`.
 *
 * It deliberately mirrors the AI Chat panel's loop options (pruning, compaction, transcript
 * discovery) without importing the React chat runtime. Telegram keeps its own security shell:
 * per-chat whitelist/quota, scope gate, admin mutation preview, and session logs.
 */

export interface TelegramChatTurnParams {
  chatId: string;
  text: string;
  dataScope: TelegramDataScope;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  contextText: string;
  endpoint: string;
  apiKey: string;
  model: string;
  contextWindowTokens?: number | undefined;
  db: TaskPlannerDatabase;
}

export interface TelegramChatTurnResult {
  replyMarkdown: string;
  tokenUsage: ChatTokenUsage;
  generatedFiles: ChatGeneratedFile[];
  loopLimitReached: boolean;
  serverEmptyNotice: string | null;
}

const SCOPE_HINT: Record<TelegramDataScope, string> = {
  full: 'Phạm vi dữ liệu: Tasks, Change Requests, Notes và Knowledge Docs.',
  knowledge_only: 'Phạm vi dữ liệu: chỉ Notes và Knowledge Docs. Không truy cập dữ liệu công việc.',
  tasks_only: 'Phạm vi dữ liệu: chỉ Tasks, Change Requests và Systems. Không truy cập tài liệu/tri thức.',
  pure_llm: 'Phạm vi dữ liệu: chỉ suy luận chung. Không có công cụ dữ liệu TaskMate.',
};

function buildSystemPrompt(
  params: TelegramChatTurnParams,
  contextText: string,
  graphitiSkill: string,
  conventionsSegment: string
): string {
  const todayStr = getTodayDateString();
  const now = dayjs();
  const capabilities = [
    '- Khi cần dữ liệu công việc/lịch/ghi chú/tài liệu, hãy gọi công cụ tương ứng để lấy dữ liệu thực; không suy đoán.',
    '- Với câu hỏi tra cứu tri thức, dùng các công cụ truy xuất có sẵn (như `retrieve_knowledge`) khi cần, với truy vấn ngắn, tập trung (<= 200 ký tự). Nếu kết quả chỉ có tên thực thể, có thể tra cứu lại bằng chính tên đó.',
    '- Khi tạo DOCX/PPTX có hình minh hoạ, dùng `generate_image` và `generate_pptx` khi cần; `generate_file` không khả dụng trên Telegram.',
    '- Khi có bằng chứng tài liệu, kết thúc bằng danh sách "Nguồn" ngắn gọn.',
    '- Không tạo file hoặc ảnh nếu người dùng không yêu cầu.',
  ].join('\n');

  const parts = [
    `You are ${APP_NAME} Telegram Assistant, a precise personal AI assistant integrated with the user's local TaskMate app.`,
    `Current Date: ${todayStr} (${now.format('dddd')}). Time: ${now.format('HH:mm')}.`,
    SCOPE_HINT[params.dataScope],
    '',
    'CRITICAL ANTI-HALLUCINATION RULES:',
    '1. NEVER GUESS, ASSUME, OR INVENT DATA.',
    '2. Every statement regarding tasks, change requests, statuses, deadlines, logged work sessions, planned allocations, capacity limits, notes, reminders, recurring schedules, or system sync state MUST be grounded in tool results or the injected context.',
    '3. If the user asks about anything not present in the initial context, use the relevant tools when the needed data is not already in context.',
    '4. If an item or detail is missing, null, empty, or not recorded, EXPLICITLY STATE THAT IT IS NOT RECORDED. Never extrapolate.',
    '5. If no relevant records are found after calling tools, say so clearly.',
    '6. Mutations are unavailable in this turn. Never claim a task, note, timer, or document was changed.',
    '7. Format Markdown cleanly for Telegram. Avoid deep nesting.',
    '',
    '[ANALYSIS MODE ACTIVE] — PREFER READ-ONLY:',
    capabilities,
  ];

  if (graphitiSkill) parts.push('', graphitiSkill);
  if (contextText.trim()) {
    parts.push('', '<ground_truth_context>', contextText.trim(), '</ground_truth_context>');
  }
  if (conventionsSegment) parts.push('', conventionsSegment);
  return parts.join('\n');
}

async function resolveTelegramTranscript(
  chatId: string,
  params: TelegramChatTurnParams
): Promise<string> {
  // One durable thread per Telegram chat, mirroring the panel's transcript tools. The worker
  // still owns the session-log history; this thread is only the tool-bound transcript view.
  const thread = await createOrGetThread(
    { scopeType: 'remote', entityId: `telegram:${chatId}`, title: `Telegram: ${chatId}` },
    params.db
  );
  try {
    await saveMessage(
      { threadId: thread.id, role: 'user', content: params.text },
      params.db
    );
  } catch (err) {
    console.warn('[telegramChatTurn] transcript user write failed:', err);
  }
  return thread.id;
}

function executeTelegramTool(
  name: string,
  args: Record<string, any>,
  db: TaskPlannerDatabase,
  signal: AbortSignal | undefined,
  _options: unknown,
  callId: string | undefined,
  threadId: string
): Promise<string> {
  const normalized = normalizeToolName(name);
  if (CHAT_HISTORY_TOOL_NAMES.has(normalized)) {
    return executeChatHistoryTool(normalized, args, threadId, db);
  }
  // `generate_image` can persist an attachment into a note via `saveToDocId`. That write has
  // no approval UI on Telegram, so strip it from model-supplied args; image generation itself
  // remains available and the result stays in the chat response.
  const safeArgs = normalized === 'generate_image' ? { ...args, saveToDocId: undefined } : args;
  return dispatchAiToolCall(name, safeArgs, db, signal, {
    ...(callId ? { callId } : {}),
    threadId,
  });
}

export async function runTelegramChatTurn(
  params: TelegramChatTurnParams,
  runLoop: typeof import('../ai/aiOrchestratorLoop').runAiOrchestratorLoop
): Promise<TelegramChatTurnResult> {
  const { chatId, db, text, history } = params;
  const threadId = await resolveTelegramTranscript(chatId, params);

  const [globalConventions, graphitiSkill, toolConfig] = await Promise.all([
    getGlobalConventions(db).catch(() => ''),
    getGraphitiSkillSegment(db, text).catch(() => ''),
    readTelegramToolConfig(db),
  ]);

  const tools = await buildTelegramTurnTools({
    db,
    dataScope: params.dataScope,
    sshConfigReady: toolConfig.sshConfigReady,
    oracleConfigReady: toolConfig.oracleConfigReady,
  });
  const fullTools = withTelegramTranscriptTools(tools);

  const systemPrompt = buildSystemPrompt(
    params,
    params.contextText,
    graphitiSkill,
    buildConventionsSegment({ global: globalConventions })
  );

  const messages: ChatCompletionMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: text },
  ];

  const generatedFiles: ChatGeneratedFile[] = [];
  let serverEmptyNotice: string | null = null;
  const toolNames = new Map<string, string>();

  const result = await runLoop({
    endpoint: params.endpoint,
    apiKey: params.apiKey,
    model: params.model,
    messages,
    ...(fullTools.length > 0 ? { tools: fullTools as any[] } : {}),
    temperature: 0.1,
    // Headless turns keep the existing 30-round ceiling: no UI Stop control exists here.
    maxLoops: 30,
    db,
    keepRecentToolOutputs: 20,
    maxOldToolChars: 100_000,
    compactAtRatio: 0.9,
    ...(params.contextWindowTokens ? { contextWindowTokens: params.contextWindowTokens } : {}),
    onToolCall: (call) => {
      toolNames.set(call.id, normalizeToolName(call.name));
    },
    onToolResult: (callId, toolResult) => {
      if (serverEmptyNotice) return;
      const toolName = toolNames.get(callId) ?? '';
      if (detectKnowledgeToolOutcome(toolName, toolResult) === 'NO_PUBLISHED_SETS') {
        serverEmptyNotice = KNOWLEDGE_SERVER_EMPTY_NOTICE;
      }
    },
    executeToolFn: (name, args, toolDb, signal, _options, callId) =>
      executeTelegramTool(name, args, toolDb, signal, _options, callId, threadId),
    onFileGenerated: (file) => {
      generatedFiles.push(file);
    },
    onMutationCheck: async (name, args) => {
      const normalized = normalizeToolName(name);
      if (
        CHAT_HISTORY_TOOL_NAMES.has(normalized) ||
        AI_DATABASE_TOOLS.some((t) => normalizeToolName(t.function.name) === normalized && !isMutationTool(name, args))
      ) {
        return { proceed: true };
      }
      return {
        proceed: false,
        cancellationResult: JSON.stringify({
          cancelled: true,
          error: 'Thao tác thay đổi dữ liệu yêu cầu quyền Admin hoặc lệnh cụ thể.',
        }),
      };
    },
  });

  const artifactLines = generatedFiles.map((file) => {
    const label = file.format === 'image/png' || file.format === 'png' ? 'Ảnh' : 'Tệp';
    return `📎 **${label} đã tạo:** \`${file.filename}\`. Mở AI Chat trong TaskMate để xem/tải nội dung đầy đủ.`;
  });
  const replyMarkdown = [result.cleanResponse, ...artifactLines].filter(Boolean).join('\n\n');

  try {
    await saveMessage(
      {
        threadId,
        role: 'assistant',
        content: replyMarkdown,
        ...(generatedFiles.length > 0 ? { generatedFiles } : {}),
        ...(result.tokenUsage.totalTokens !== undefined ? { tokenUsage: result.tokenUsage } : {}),
      },
      db
    );
  } catch (err) {
    // Transcript is a derived view. A write failure must never swallow a model answer that
    // the worker is about to deliver to the user.
    console.warn('[telegramChatTurn] transcript assistant write failed:', err);
  }

  return {
    replyMarkdown,
    tokenUsage: result.tokenUsage,
    generatedFiles,
    loopLimitReached: result.loopLimitReached,
    serverEmptyNotice,
  };
}
