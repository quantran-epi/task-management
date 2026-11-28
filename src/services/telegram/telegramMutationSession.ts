import type { TaskPlannerDatabase } from '../../db';
import { db as defaultDb } from '../../db';
import {
  AI_DATABASE_TOOLS,
  SSH_READ_TOOLS,
  ORACLE_READ_TOOLS,
  executeAiTool,
  isMutationTool,
  describeToolMutationWithContext,
  normalizeToolName,
  formatFieldChanges,
} from '../ai/aiTools';
import { getGatedAddenda } from '../ai/chatTurnTools';
import { getOracleToolConfig } from '../ai/oracleSqlclService';
import { getSshFsToolConfig } from '../ai/sshFsToolService';
import { discoverAllMcpTools } from '../ai/mcpClient';
import { streamChatEvents } from '../ai/nineRouterClient';
import type { ChatCompletionMessage, ToolCall } from '../ai/types';
import { getTodayDateString } from '../../utils/date';
import dayjs from 'dayjs';

export const MUTATION_TTL_MS = 10 * 60 * 1000;

export interface PendingMutation {
  chatId: string;
  toolName: string;
  args: Record<string, any>;
  summary: string;
  createdAt: number;
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  isMcp?: boolean | undefined;
  serverName?: string | undefined;
  identity?: string | undefined;
}

export interface PendingMutationOptions {
  identity?: string | undefined;
  key?: string | undefined;
  expectedKey?: string | undefined;
}

interface PendingMutationEntry {
  mutation: PendingMutation;
  expiresAt: number;
  timer: ReturnType<typeof setTimeout>;
}

const pendingMutations = new Map<string, PendingMutationEntry>();

function stableStringify(value: any): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const object = value as Record<string, any>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
    .join(',')}}`;
}

function hashString(value: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let index = 0; index < value.length; index++) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}

export function pendingMutationKey(mutation: PendingMutation): string {
  return `${mutation.chatId}\u0000${normalizeToolName(mutation.toolName)}\u0000${hashString(
    stableStringify(mutation.args)
  )}`;
}

function activeEntriesForChat(chatId: string): Array<[string, PendingMutationEntry]> {
  const now = Date.now();
  const active: Array<[string, PendingMutationEntry]> = [];
  for (const [key, entry] of pendingMutations) {
    if (entry.mutation.chatId !== chatId) continue;
    if (entry.expiresAt <= now) {
      clearTimeout(entry.timer);
      pendingMutations.delete(key);
      continue;
    }
    active.push([key, entry]);
  }
  return active;
}

function matchesOptions(entry: PendingMutationEntry, opts: PendingMutationOptions): boolean {
  const { identity, key } = opts;
  if (identity && entry.mutation.identity && identity !== entry.mutation.identity) return false;
  if (key && key !== pendingMutationKey(entry.mutation)) return false;
  return true;
}

export function getPendingMutation(
  chatId: string,
  opts: PendingMutationOptions = {}
): PendingMutation | undefined {
  const matches = activeEntriesForChat(chatId).filter(([, entry]) => matchesOptions(entry, opts));
  // More than one candidate with the supplied filters is ambiguous: never pick one silently.
  if (matches.length !== 1) return undefined;
  return matches[0]![1].mutation;
}

export function setPendingMutation(
  mutation: PendingMutation,
  opts: PendingMutationOptions = {}
): boolean {
  const expiresAt = mutation.createdAt + MUTATION_TTL_MS;
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;
  if (opts.identity && mutation.identity && opts.identity !== mutation.identity) return false;

  const active = activeEntriesForChat(mutation.chatId);
  if (active.length > 0) {
    if (active.length !== 1) return false;
    const [existingKey, existing] = active[0]!;
    if (opts.expectedKey !== existingKey) return false;
    if (opts.identity && existing.mutation.identity && opts.identity !== existing.mutation.identity) {
      return false;
    }
    clearTimeout(existing.timer);
    pendingMutations.delete(existingKey);
  }

  const key = pendingMutationKey(mutation);
  let entry!: PendingMutationEntry;
  const timer = setTimeout(() => {
    if (pendingMutations.get(key) === entry) {
      pendingMutations.delete(key);
    }
  }, Math.max(0, expiresAt - Date.now()));
  if (typeof timer === 'object' && 'unref' in timer) {
    (timer as { unref?: () => void }).unref?.();
  }
  entry = { mutation, expiresAt, timer };
  pendingMutations.set(key, entry);
  return true;
}

export function clearPendingMutation(
  chatId: string,
  opts: PendingMutationOptions = {}
): boolean {
  const matches = activeEntriesForChat(chatId).filter(([, entry]) => matchesOptions(entry, opts));
  if (matches.length !== 1) return false;
  const [key, entry] = matches[0]!;
  clearTimeout(entry.timer);
  pendingMutations.delete(key);
  return true;
}

export function clearAllPendingMutationsForTesting(): void {
  for (const entry of pendingMutations.values()) {
    clearTimeout(entry.timer);
  }
  pendingMutations.clear();
}

/**
 * Checks if the user message signifies affirmative confirmation to execute pending mutation.
 */
export function isConfirmationMessage(text: string): boolean {
  const clean = text.trim().toLowerCase().replace(/[.!?,:;]/g, '');
  const confirmWords = new Set([
    'ok',
    'oke',
    'okee',
    'okay',
    'yes',
    'y',
    'xác nhận',
    'xac nhan',
    'đồng ý',
    'dong y',
    'tiến hành',
    'tien hanh',
    'thực hiện',
    'thuc hien',
    'duyệt',
    'duyet',
    'confirm',
    'apply',
    'chấp nhận',
    'chap nhan',
    'làm đi',
    'lam di',
  ]);
  return confirmWords.has(clean);
}

/**
 * Checks if the user message signifies cancellation of pending mutation.
 */
export function isCancellationMessage(text: string): boolean {
  const clean = text.trim().toLowerCase().replace(/[.!?,:;]/g, '');
  const cancelWords = new Set([
    'hủy',
    'huy',
    'hủy thao tác',
    'huy thao tac',
    'hủy bỏ',
    'huy bo',
    'hủy lệnh',
    'huy lenh',
  ]);
  if (cancelWords.has(clean)) return true;
  // Also check if message starts with clear cancellation phrases
  if (
    clean.startsWith('hủy') ||
    clean.startsWith('huy') ||
    clean.startsWith('cancel') ||
    clean.startsWith('bỏ qua') ||
    clean.startsWith('bo qua')
  ) {
    return true;
  }
  return false;
}

/**
 * Formats a clear, structured preview message for Telegram users with next actions.
 */
export function formatMutationPreviewMessage(
  toolName: string,
  args: Record<string, any>,
  summary: string,
  isUpdate = false
): string {
  const normalized = normalizeToolName(toolName);
  const changes = formatFieldChanges(args);
  const header = isUpdate
    ? '📝 **Đã cập nhật đề xuất thao tác**'
    : '📝 **Xác nhận thao tác TaskMate**';

  const lines = [
    header,
    '',
    'Bạn có chắc chắn muốn thực hiện thay đổi sau?',
    `👉 **${summary}**`,
    '',
    `- **Thao tác:** \`${normalized}\``,
  ];

  if (changes) {
    lines.push(`- **Chi tiết:** ${changes}`);
  }

  lines.push(
    '',
    '────────────────────',
    '👉 Gõ **OK** hoặc **Xác nhận** để thực hiện',
    '👉 Gõ **Hủy** để huỷ bỏ',
    '👉 Hoặc gửi tin nhắn chỉnh sửa (ví dụ: *"Đổi deadline sang thứ 6"* hoặc *"Tăng ước tính lên 2h"*)'
  );

  return lines.join('\n');
}

export function formatMcpMutationPreviewMessage(
  toolName: string,
  args: Record<string, any>,
  serverName?: string
): string {
  const lines = [
    '⚠️ **Xác nhận thực thi MCP Tool:**',
    serverName ? `- Server: ${serverName}` : null,
    `- Tool: ${toolName}`,
    '- Tham số:',
    '```json',
    JSON.stringify(args, null, 2),
    '```',
    '────────────────────',
    '👉 Gõ **OK** hoặc **Xác nhận** để thực hiện',
    '👉 Gõ **Hủy** để huỷ bỏ',
  ].filter(Boolean) as string[];

  return lines.join('\n');
}

export interface AdminMutationTurnParams {
  chatId: string;
  userMessage: string;
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  aiConfig: { endpoint: string; defaultModel: string };
  apiKey: string;
  db?: TaskPlannerDatabase;
  existingPending?: PendingMutation;
  identity?: string | undefined;
  contextText?: string;
  streamChatEventsFn?: typeof streamChatEvents;
}

export interface AdminMutationTurnResult {
  kind: 'preview' | 'conversational';
  replyMarkdown: string;
  tokenCount?: number;
}

const PENDING_CONFLICT_REPLY =
  'Đang có thao tác khác đang chờ xác nhận; gõ OK để thực hiện hoặc Hủy để hủy trước';

/**
 * Executes an AI turn with full mutation and query tools enabled for Admin.
 * Intercepts any mutation tool calls to formulate a preview and pending state instead of writing immediately.
 */
export async function executeAdminMutationTurn(
  params: AdminMutationTurnParams
): Promise<AdminMutationTurnResult> {
  const {
    chatId,
    userMessage,
    chatHistory,
    aiConfig,
    apiKey,
    db = defaultDb,
    existingPending,
    identity,
    contextText,
    streamChatEventsFn = streamChatEvents,
  } = params;

  const todayStr = getTodayDateString();
  const now = dayjs();
  const dayName = now.format('dddd');
  const timeStr = now.format('HH:mm');

  const systemPrompt = [
    `You are TaskMate Telegram Assistant for the Admin. You have full access to database tools to query and mutate tasks, change requests, systems, notes, work sessions, timers, allocations, and capacity.`,
    `Current Date: ${todayStr} (${dayName}). Time: ${timeStr}.`,
    ``,
    `CRITICAL INSTRUCTIONS:`,
    `1. When the user asks to create, update, delete, move, or log anything in TaskMate, YOU MUST INVOKE the corresponding database tool with exact arguments.`,
    `2. Never output fake confirmations. The system will intercept your mutation tool call, show a preview to the user, and ask for their confirmation before applying to the database.`,
    `3. If you need item IDs or current details to fulfill the user's request (e.g. finding a task ID to update or delete), FIRST invoke query tools (such as query_tasks, query_change_requests, query_notes) to look them up.`,
    `4. If the user provides adjustments to a previously proposed action, invoke the mutation tool again with the updated parameters.`,
    contextText ? `\n--- LOCAL TASKMATE CONTEXT ---\n${contextText}\n-----------------------------` : '',
  ].join('\n');

  const messages: ChatCompletionMessage[] = [
    { role: 'system', content: systemPrompt },
    ...chatHistory,
  ];

  if (existingPending) {
    messages.push({
      role: 'assistant',
      content: `Tôi đã chuẩn bị thao tác: ${existingPending.summary} (tool: ${existingPending.toolName}, tham số: ${JSON.stringify(existingPending.args)}). Bạn có muốn thực hiện không?`,
    });
  }

  messages.push({ role: 'user', content: userMessage });

  let mcpTools: any[] = [];
  try {
    mcpTools = await discoverAllMcpTools(db);
  } catch (err) {
    console.warn('[telegramMutationSession] Failed to discover MCP tools for admin:', err);
  }

  // Quick cz2: Telegram has no team flag, so SSH/Oracle availability = connection config
  // existence. A tool whose connection is unconfigured never reaches the model payload.
  const [oracleCfg, sshFsCfg] = await Promise.all([
    getOracleToolConfig(db).catch(() => null),
    getSshFsToolConfig(db).catch(() => null),
  ]);
  const gatedAddenda = getGatedAddenda({
    sshConfigReady: Boolean(sshFsCfg?.sshConfigId),
    oracleConfigReady: Boolean(oracleCfg?.sshConfigId && oracleCfg?.connectionString),
  });
  const gatedNames = new Set(gatedAddenda.map((t) => normalizeToolName(t.function.name)));
  const disabledNames = new Set(
    [...SSH_READ_TOOLS, ...ORACLE_READ_TOOLS]
      .map((t) => normalizeToolName(t.function.name))
      .filter((name) => !gatedNames.has(name))
  );
  const allAvailableTools = [
    ...AI_DATABASE_TOOLS.filter((t) => !disabledNames.has(normalizeToolName(t.function.name))),
    ...mcpTools,
  ];
  const mcpToolNameSet = new Set(mcpTools.map((t) => t.function.name));

  let loopCount = 0;
  const MAX_LOOPS = 5;
  let fullResponse = '';
  let tokenCount = 0;

  while (loopCount < MAX_LOOPS) {
    loopCount++;
    fullResponse = '';
    let hasToolCalls = false;
    let toolCallsToRun: ToolCall[] = [];

    const stream = streamChatEventsFn({
      endpoint: aiConfig.endpoint,
      apiKey,
      payload: {
        model: aiConfig.defaultModel,
        messages,
        tools: allAvailableTools,
        temperature: 0.1,
      },
    });

    for await (const chunk of stream) {
      if (chunk.type === 'text') {
        fullResponse += chunk.delta;
      } else if (chunk.type === 'tool_calls') {
        hasToolCalls = true;
        toolCallsToRun = chunk.calls;
      } else if (chunk.type === 'usage' && chunk.usage?.totalTokens) {
        tokenCount = chunk.usage.totalTokens;
      }
    }

    if (!hasToolCalls || toolCallsToRun.length === 0) {
      break;
    }

    messages.push({
      role: 'assistant',
      content: fullResponse || null,
      tool_calls: toolCallsToRun,
    });

    // Check if any tool call is an MCP tool call (treat all MCP tool calls in admin turn as requiring preview/approval)
    const mcpCall = toolCallsToRun.find((tc) => mcpToolNameSet.has(tc.function.name));
    if (mcpCall) {
      let args: Record<string, any> = {};
      try {
        args = JSON.parse(mcpCall.function.arguments || '{}');
      } catch {}

      const toolMeta = mcpTools.find((t) => t.function.name === mcpCall.function.name);
      let serverName: string | undefined;
      const desc = toolMeta?.function?.description || '';
      const serverPrefixMatch = desc.match(/^\[([^\]]+)\]/);
      if (serverPrefixMatch) {
        serverName = serverPrefixMatch[1];
      }

      const stored = setPendingMutation(
        {
          chatId,
          toolName: mcpCall.function.name,
          args,
          summary: `Thực thi công cụ MCP: ${mcpCall.function.name}`,
          createdAt: Date.now(),
          chatHistory: [...chatHistory, { role: 'user', content: userMessage }],
          isMcp: true,
          serverName,
          identity,
        },
        {
          identity,
          expectedKey: existingPending ? pendingMutationKey(existingPending) : undefined,
        }
      );
      if (!stored) {
        return { kind: 'conversational', replyMarkdown: PENDING_CONFLICT_REPLY, tokenCount };
      }

      const previewMd = formatMcpMutationPreviewMessage(
        mcpCall.function.name,
        args,
        serverName
      );

      return {
        kind: 'preview',
        replyMarkdown: previewMd,
        tokenCount,
      };
    }

    // Check if any tool call is a TaskMate mutation tool
    const mutationCall = toolCallsToRun.find((tc) => isMutationTool(tc.function.name));
    if (mutationCall) {
      let args: Record<string, any> = {};
      try {
        args = JSON.parse(mutationCall.function.arguments || '{}');
      } catch {}

      const summary = await describeToolMutationWithContext(mutationCall.function.name, args, db);
      const stored = setPendingMutation(
        {
          chatId,
          toolName: mutationCall.function.name,
          args,
          summary,
          createdAt: Date.now(),
          chatHistory: [...chatHistory, { role: 'user', content: userMessage }],
          identity,
        },
        {
          identity,
          expectedKey: existingPending ? pendingMutationKey(existingPending) : undefined,
        }
      );
      if (!stored) {
        return { kind: 'conversational', replyMarkdown: PENDING_CONFLICT_REPLY, tokenCount };
      }

      const previewMd = formatMutationPreviewMessage(
        mutationCall.function.name,
        args,
        summary,
        Boolean(existingPending)
      );

      return {
        kind: 'preview',
        replyMarkdown: previewMd,
        tokenCount,
      };
    }

    // Otherwise, execute query/read tools and return results to LLM
    for (const tc of toolCallsToRun) {
      let args: Record<string, any> = {};
      try {
        args = JSON.parse(tc.function.arguments || '{}');
      } catch {}

      let toolResult = '';
      try {
        toolResult = await executeAiTool(tc.function.name, args, db);
      } catch (err: any) {
        toolResult = JSON.stringify({ error: err?.message || String(err) });
      }

      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        name: tc.function.name,
        content: toolResult,
      });
    }
  }

  return {
    kind: 'conversational',
    replyMarkdown: fullResponse || '*(Không có phản hồi từ mô hình AI)*',
    tokenCount,
  };
}
