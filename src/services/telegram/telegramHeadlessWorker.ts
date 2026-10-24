import { useEffect } from 'react';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import {
  getTelegramSettings,
  saveTelegramSettings,
  checkAndConsumeQuota,
  checkAndConsumeCommandQuota,
  logTelegramSession,
  resetTelegramUserSession,
  getTelegramChatHistory,
  recordPendingTelegramUser,
  getWhitelistUser,
  refundQuota,
} from './telegramSettingsService';
import {
  getPendingMutation,
  clearPendingMutation,
  isConfirmationMessage,
  isCancellationMessage,
  executeAdminMutationTurn,
} from './telegramMutationSession';
import {
  AI_DATABASE_TOOLS,
  executeAiTool,
  isMutationTool,
} from '../ai/aiTools';
import { runAiOrchestratorLoop } from '../ai/aiOrchestratorLoop';
import { sendDesktopNotification } from '../../utils/desktopNotification';
import type {
  TelegramInboundEvent,
  TelegramConflictEvent,
  TelegramDataScope,
  TelegramBroadcastResult,
} from './telegramTypes';
import type { ChatCompletionMessage } from '../ai/types';
import { isTauriApp } from '../../utils/timerPopout';
import { getNineRouterConfig, getNineRouterApiKey } from '../ai/nineRouterTokenService';
import { stripThinkingBlocks } from '../ai/nineRouterClient';
import { markdownToTelegramHtml } from './telegramHtml';
import { buildGlobalContextPrompt } from '../ai/contextGrounding';
import { rankBM25, tokenize, type BM25Document } from '../../utils/bm25';
import type { Note } from '../../types/models';
import { handleAdminCommand } from './telegramAdminWizard';
import { routeIntent, type RouteIntentResult, type IntentLabel } from '../ai/intentRouter';
import { getTodayDateString } from '../../utils/date';
import dayjs from 'dayjs';
import { createDefaultGroundedTurnDeps } from '../ai/groundedTurnDeps';
import { runGroundedTurn } from '../ai/groundedTurn';
import { fetchSetCatalog } from '../../db/repositories/documentSetRepo';
import type { ChatMessageGrounding } from '../ai/groundedAnswerSchemas';
import { getEnabledMcpCapabilitySummaries, executeDynamicMcpTool } from '../ai/mcpClient';

export const TELEGRAM_MAX_MESSAGE_LENGTH = 4000; // Telegram hard limit is 4096, buffer to 4000

export async function sendTelegramDirectMessage(
  token: string,
  chatId: string,
  text: string,
  replyToMessageId?: number
): Promise<void> {
  const htmlText = markdownToTelegramHtml(text);
  if (isTauriApp()) {
    const api = await import('@tauri-apps/api/core');
    await api.invoke('send_telegram_reply', {
      token,
      chatId,
      text: htmlText,
      replyToMessageId,
    });
  } else {
    // Fallback for non-tauri or testing
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: htmlText,
        reply_to_message_id: replyToMessageId,
        parse_mode: 'HTML',
      }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData?.description || `Telegram API error: ${res.status}`);
    }
  }
}

export async function broadcastTelegramMessage(
  token: string,
  chatIds: string[],
  text: string
): Promise<TelegramBroadcastResult> {
  let successCount = 0;
  let failureCount = 0;
  const failures: Array<{ chatId: string; error: string }> = [];

  for (const chatId of chatIds) {
    try {
      await sendTelegramDirectMessage(token, chatId, text);
      successCount++;
    } catch (err: any) {
      failureCount++;
      failures.push({ chatId, error: err?.message || String(err) });
    }
  }

  return {
    total: chatIds.length,
    successCount,
    failureCount,
    failures,
  };
}

export function splitTelegramMessage(text: string, maxLen = TELEGRAM_MAX_MESSAGE_LENGTH): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }

    // Try finding paragraph break or newline
    let splitIdx = remaining.lastIndexOf('\n\n', maxLen);
    if (splitIdx === -1 || splitIdx < maxLen / 2) {
      splitIdx = remaining.lastIndexOf('\n', maxLen);
    }
    if (splitIdx === -1 || splitIdx < maxLen / 2) {
      splitIdx = remaining.lastIndexOf(' ', maxLen);
    }
    if (splitIdx === -1) {
      splitIdx = maxLen;
    }

    chunks.push(remaining.slice(0, splitIdx).trim());
    remaining = remaining.slice(splitIdx).trim();
  }

  return chunks;
}

export interface GroundedContextResult {
  contextText: string;
  matchedSourceTitles: string[];
}

export async function resolveScopedContext(
  scope: TelegramDataScope,
  query: string,
  db: TaskPlannerDatabase = defaultDb,
  intent?: IntentLabel,
  entities?: string[]
): Promise<GroundedContextResult> {
  const parts: string[] = [];
  const matchedSourceTitles: string[] = [];

  if (scope === 'pure_llm') {
    return { contextText: '', matchedSourceTitles: [] };
  }

  // 1. Tasks & Projects Scope
  const shouldIncludeTasks =
    (scope === 'full' || scope === 'tasks_only') &&
    (!intent || intent === 'query_taskmate' || intent === 'operate_taskmate' || intent === 'mixed');

  if (shouldIncludeTasks) {
    try {
      const globalOverview = await buildGlobalContextPrompt(db);
      if (globalOverview) {
        parts.push(globalOverview);
      }

      // Query tokens matching open tasks
      const searchTokens = Array.from(
        new Set([
          ...tokenize(query),
          ...(entities ? entities.flatMap((e) => tokenize(e)) : []),
        ])
      );
      const allTasks = await db.tasks
        .filter((t) => t.status !== 'Done' && t.status !== 'Cancelled')
        .toArray();

      let matchedTasks = allTasks;
      if (searchTokens.length > 0) {
        const filtered = allTasks.filter((t) => {
          const tText = `${t.name} ${t.description || ''} ${t.jiraKey || ''}`.toLowerCase();
          return searchTokens.some((token) => tText.includes(token));
        });
        if (filtered.length > 0) {
          matchedTasks = filtered;
        }
      }

      const tasksToInclude = matchedTasks.slice(0, 15);
      if (tasksToInclude.length > 0) {
        parts.push('## Matching Tasks in TaskMate:');
        for (const t of tasksToInclude) {
          parts.push(
            `- [${t.status}] [${t.priority}] **${t.name}** (Progress: ${t.progress}%${
              t.deadline ? `, Deadline: ${t.deadline}` : ''
            }${t.jiraKey ? `, Jira: ${t.jiraKey}` : ''})`
          );
        }
      }
    } catch (e) {
      console.warn('[telegramWorker] Failed to query tasks/projects context:', e);
    }
  }

  // 2. Knowledge Docs Scope with BM25 ranking
  const shouldIncludeKnowledge =
    (scope === 'full' || scope === 'knowledge_only') &&
    (!intent || intent === 'query_knowledge' || intent === 'mixed');

  if (shouldIncludeKnowledge) {
    try {
      const notes: Note[] = await db.notes.toArray();
      if (notes.length > 0) {
        const bm25Docs: BM25Document[] = notes.map((n) => ({
          id: n.id,
          title: n.title || 'Untitled',
          tags: n.tags || [],
          body: n.body || '',
          updatedAt: n.updatedAt,
        }));

        let selectedNotes: Note[] = [];
        const searchQuery = entities && entities.length > 0 ? `${query} ${entities.join(' ')}` : query;
        if (searchQuery && searchQuery.trim()) {
          const ranked = rankBM25(searchQuery, bm25Docs, { limit: 5 });
          const rankedPositive = ranked.filter((r) => r.score > 0);
          if (rankedPositive.length > 0) {
            const matchedIds = new Set(rankedPositive.map((r) => r.doc.id));
            selectedNotes = notes.filter((n) => matchedIds.has(n.id));
          }
        }

        // Strictly NO arbitrary fallback (notes.slice(0, 3)).
        // If no matching notes found for a knowledge query, state it explicitly.
        if (selectedNotes.length > 0) {
          parts.push('## Relevant Knowledge Notes & Docs:');
          for (const n of selectedNotes) {
            const title = n.title || 'Untitled';
            matchedSourceTitles.push(title);
            const bodyPreview = (n.body || '').slice(0, 500).trim();
            parts.push(`### [Doc] ${title}\n${bodyPreview}`);
          }
        } else if (intent === 'query_knowledge') {
          parts.push(
            '## Relevant Knowledge Notes & Docs:\n*(Không tìm thấy tài liệu hoặc ghi chú nào phù hợp với yêu cầu trong kho tri thức TaskMate)*'
          );
        }
      } else if (intent === 'query_knowledge') {
        parts.push(
          '## Relevant Knowledge Notes & Docs:\n*(Hệ thống hiện tại chưa có tài liệu hoặc ghi chú nào)*'
        );
      }
    } catch (e) {
      console.warn('[telegramWorker] Failed to query knowledge context:', e);
    }
  }

  return {
    contextText: parts.join('\n\n'),
    matchedSourceTitles,
  };
}

export function cleanCitationTags(text: string): string {
  // Strip tags like [S1], [S2], [M1], [Doc 1], etc. generated by retrieval models
  return text
    .replace(/\[S\d+\]/gi, '')
    .replace(/\[M\d+\]/gi, '')
    .replace(/\[Doc\s*\d+\]/gi, '')
    .replace(/\[Source\s*\d+\]/gi, '')
    .trim();
}

export function formatGroundedAnswerForTelegram(grounding: ChatMessageGrounding): string {
  const ans = grounding.answer;
  if (!ans) {
    return '*(Không tìm thấy câu trả lời phù hợp trong tài liệu)*';
  }
  const parts: string[] = [];
  const conclusionText = ans.conclusion?.trim() || '';
  const claims = ans.claims.filter((c) => c.text?.trim());

  // Structural parity with GroundedAnswerCard: claims replace conclusion when present.
  if (claims.length > 0) {
    parts.push(claims.map((c) => `- ${c.text.trim()}`).join('\n'));
  } else if (conclusionText) {
    parts.push(conclusionText);
  }

  const hypotheses = (ans as any).hypotheses;
  if (Array.isArray(hypotheses) && hypotheses.length > 0) {
    const hypTexts = hypotheses.map((h: any) => `💡 *Giả thuyết:* ${(h.text || '').trim()}`);
    parts.push(hypTexts.join('\n'));
  }
  if (grounding.citations && grounding.citations.length > 0) {
    const docCitations = grounding.citations.filter((c) => !/^M\d+/i.test(c.citationId));
    const mcpCitations = grounding.citations.filter((c) => /^M\d+/i.test(c.citationId));

    const uniqueDocs = Array.from(
      new Set(docCitations.map((c) => c.documentTitle).filter(Boolean))
    ).slice(0, 5);
    if (uniqueDocs.length > 0) {
      parts.push(`📚 **Nguồn tài liệu:** ${uniqueDocs.join(', ')}`);
    }

    const uniqueMcp = Array.from(
      new Set(mcpCitations.map((c) => c.documentTitle).filter(Boolean))
    ).slice(0, 5);
    if (uniqueMcp.length > 0) {
      parts.push(`🔌 **Dữ liệu thực tế từ MCP:** ${uniqueMcp.join(', ')}`);
    }
  }
  return parts.join('\n\n');
}

// In-memory set of recently processed update_ids to prevent duplicate execution from double listener/HMR
const processedUpdateIds = new Set<number>();

export function clearTelegramProcessedUpdateIdsForTesting(): void {
  processedUpdateIds.clear();
}

export async function processTelegramInboundMessage(
  event: TelegramInboundEvent,
  botToken: string,
  db: TaskPlannerDatabase = defaultDb,
  sendReplyFn?: (token: string, chatId: string, text: string, replyTo?: number) => Promise<void>,
  sendActionFn?: (token: string, chatId: string, action: string) => Promise<void>
): Promise<void> {
  const { update_id, chat_id, from_name, text, message_id } = event;

  // Deduplicate incoming update_id
  if (update_id && processedUpdateIds.has(update_id)) {
    console.warn(`[telegramWorker] Dropping duplicate inbound update_id: ${update_id}`);
    return;
  }
  if (update_id) {
    processedUpdateIds.add(update_id);
    if (processedUpdateIds.size > 1000) {
      const oldest = Array.from(processedUpdateIds).slice(0, 500);
      for (const id of oldest) {
        processedUpdateIds.delete(id);
      }
    }
  }

  const defaultSendReply = async (token: string, cid: string, replyText: string, rId?: number) => {
    if (isTauriApp()) {
      const api = await import('@tauri-apps/api/core');
      await api.invoke('send_telegram_reply', {
        token,
        chatId: cid,
        text: replyText,
        replyToMessageId: rId,
      });
    }
  };

  const defaultSendAction = async (token: string, cid: string, action: string) => {
    if (isTauriApp()) {
      const api = await import('@tauri-apps/api/core');
      await api.invoke('send_telegram_action', {
        token,
        chatId: cid,
        action,
      });
    }
  };

  const sendReply = sendReplyFn || defaultSendReply;
  const sendAction = sendActionFn || defaultSendAction;

  const trimmedText = (text || '').trim();
  const lowerText = trimmedText.toLowerCase();

  // Step 0: Check for Admin multi-step conversation or admin commands
  const adminResult = await handleAdminCommand(chat_id, trimmedText, db);
  if (adminResult.handled) {
    if (adminResult.replyText) {
      const htmlReply = markdownToTelegramHtml(adminResult.replyText);
      await sendReply(botToken, chat_id, htmlReply, message_id);
      await logTelegramSession(
        {
          chatId: chat_id,
          userName: from_name,
          userMessage: text,
          aiResponse: adminResult.replyText,
          dataScopeUsed: 'pure_llm',
          tokenCount: 0,
        },
        db
      );
    }

    // If an approval was made via admin wizard, notify the approved user immediately
    if (adminResult.approvedUser && botToken.trim()) {
      try {
        const u = adminResult.approvedUser;
        const welcomeMsg = `🎉 **Tài khoản của bạn đã được phê duyệt!**\n\nXin chào ${u.name}, quản trị viên đã phê duyệt quyền truy cập TaskMate AI Bot cho bạn.\n\n📊 **Hạn mức:** ${u.dailyLimit} tin nhắn/ngày\n🔍 **Phạm vi:** ${u.dataScope}\n🧠 **Lịch sử:** ${u.maxHistoryTurns ?? 5} lượt\n\n💡 *Gõ /help để xem hướng dẫn hoặc đặt câu hỏi trực tiếp.*`;
        await sendTelegramDirectMessage(botToken.trim(), u.chatId, welcomeMsg);
      } catch (notifyErr) {
        console.warn('Failed to send Telegram approval notice from admin wizard:', notifyErr);
      }
    }
    return;
  }

  // Step 0b: Check if Admin is in an active pending mutation confirmation/adjustment flow
  const pendingMutation = getPendingMutation(chat_id);
  const callerUser = await getWhitelistUser(chat_id, db);
  if (pendingMutation && callerUser?.isAdmin && callerUser.status === 'active') {
    // 1. Affirmative Confirmation ("OK", "Xác nhận", "Đồng ý", etc.)
    if (isConfirmationMessage(trimmedText)) {
      try {
        const rawResult = pendingMutation.isMcp
          ? await executeDynamicMcpTool(pendingMutation.toolName, pendingMutation.args, db)
          : await executeAiTool(pendingMutation.toolName, pendingMutation.args, db);
        let parsedResult: any = {};
        try {
          parsedResult = JSON.parse(rawResult);
        } catch {
          parsedResult = { message: rawResult };
        }

        clearPendingMutation(chat_id);

        let replyMd = '';
        if (parsedResult.error) {
          replyMd = `❌ **Thao tác không thành công:** ${parsedResult.error}`;
        } else {
          replyMd = [
            `✅ **Đã thực hiện thành công!**`,
            ``,
            `👉 **${pendingMutation.summary}**`,
            parsedResult.message ? `\n_${parsedResult.message}_` : '',
          ]
            .filter(Boolean)
            .join('\n');
        }

        const htmlReply = markdownToTelegramHtml(replyMd);
        await sendReply(botToken, chat_id, htmlReply, message_id);
        await logTelegramSession(
          {
            chatId: chat_id,
            userName: from_name,
            userMessage: text,
            aiResponse: replyMd,
            dataScopeUsed: 'full',
            tokenCount: 0,
          },
          db
        );
        return;
      } catch (err: any) {
        clearPendingMutation(chat_id);
        const errMsg = `❌ **Lỗi khi thực thi thao tác:** ${err?.message || String(err)}`;
        await sendReply(botToken, chat_id, markdownToTelegramHtml(errMsg), message_id);
        return;
      }
    }

    // 2. Cancellation ("Hủy", "Cancel", "Bỏ qua", etc.)
    if (isCancellationMessage(trimmedText)) {
      clearPendingMutation(chat_id);
      const cancelMd = `🚫 **Đã hủy thao tác.** Không có dữ liệu nào trong TaskMate bị thay đổi.`;
      const htmlReply = markdownToTelegramHtml(cancelMd);
      await sendReply(botToken, chat_id, htmlReply, message_id);
      await logTelegramSession(
        {
          chatId: chat_id,
          userName: from_name,
          userMessage: text,
          aiResponse: cancelMd,
          dataScopeUsed: 'full',
          tokenCount: 0,
        },
        db
      );
      return;
    }

    // 3. Adjustment: Admin wants to adjust the draft parameters
    const aiConfig = await getNineRouterConfig(db);
    const apiKey = await getNineRouterApiKey(db);
    if (apiKey && aiConfig.endpoint) {
      try {
        await sendAction(botToken, chat_id, 'typing');
      } catch {}

      const scoped = await resolveScopedContext('full', trimmedText, db);
      const adjResult = await executeAdminMutationTurn({
        chatId: chat_id,
        userMessage: trimmedText,
        chatHistory: pendingMutation.chatHistory || [],
        aiConfig: { endpoint: aiConfig.endpoint, defaultModel: aiConfig.defaultModel },
        apiKey,
        db,
        existingPending: pendingMutation,
        contextText: scoped.contextText,
      });

      const htmlMsg = markdownToTelegramHtml(adjResult.replyMarkdown);
      const chunks = splitTelegramMessage(htmlMsg);
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (chunk) {
          await sendReply(botToken, chat_id, chunk, i === 0 ? message_id : undefined);
        }
      }

      await logTelegramSession(
        {
          chatId: chat_id,
          userName: from_name,
          userMessage: text,
          aiResponse: adjResult.replyMarkdown,
          dataScopeUsed: 'full',
          tokenCount: adjResult.tokenCount || 0,
        },
        db
      );
      return;
    }
  }

  const isSlashCommand =
    lowerText === '/reset' ||
    lowerText === '/clear' ||
    lowerText === '/help' ||
    lowerText === '/start';

  // Helper to handle and notify unauthorized (pending) users
  const handleUnauthorizedUser = async () => {
    const { isNew } = await recordPendingTelegramUser(chat_id, from_name, db);
    if (isNew) {
      try {
        await sendDesktopNotification({
          title: 'Telegram Bot: Người dùng mới yêu cầu cấp quyền',
          body: `${from_name} (Chat ID: ${chat_id}): "${text}"`,
          tag: `telegram-pending-${chat_id}`,
        });
      } catch (notifErr) {
        console.warn('Failed to send desktop notification for new pending user:', notifErr);
      }
    }
  };

  // Step 1: Whitelist & Authorization Check
  if (isSlashCommand) {
    const cmdAccess = await checkAndConsumeCommandQuota(chat_id, db);
    if (!cmdAccess.allowed) {
      if (cmdAccess.reason === 'not_whitelisted') {
        await handleUnauthorizedUser();
        const rawMsg = `⚠️ **Chưa được phân quyền truy cập**\n\nXin chào ${from_name}, bạn chưa được phân quyền sử dụng TaskMate AI Bot.\n\n🆔 **Chat ID của bạn:** \`${chat_id}\`\n\nVui lòng cung cấp ID của bạn cho admin @quan_tr96 để được phân quyền.`;
        const htmlMsg = markdownToTelegramHtml(rawMsg);
        await sendReply(botToken, chat_id, htmlMsg, message_id);
        await logTelegramSession(
          {
            chatId: chat_id,
            userName: from_name,
            userMessage: text,
            aiResponse: rawMsg,
            dataScopeUsed: 'pure_llm',
            tokenCount: 0,
          },
          db
        );
        return;
      }
      if (cmdAccess.reason === 'blocked') {
        const rawMsg = `⛔ **Tài khoản bị tạm khoá**\n\nChat ID \`${chat_id}\` đã bị tạm ngưng quyền truy cập TaskMate AI Bot.`;
        const htmlMsg = markdownToTelegramHtml(rawMsg);
        await sendReply(botToken, chat_id, htmlMsg, message_id);
        await logTelegramSession(
          {
            chatId: chat_id,
            userName: from_name,
            userMessage: text,
            aiResponse: rawMsg,
            dataScopeUsed: 'pure_llm',
            tokenCount: 0,
          },
          db
        );
        return;
      }
      if (cmdAccess.reason === 'quota_exceeded') {
        const rawMsg = `⏳ **Hết hạn mức trong ngày**\n\nBạn đã sử dụng hết hạn mức trong ngày và đã dùng hết 3 lượt lệnh (/help, /start, /reset) bổ sung. Vui lòng quay lại vào 00:00 ngày mai.`;
        const htmlMsg = markdownToTelegramHtml(rawMsg);
        await sendReply(botToken, chat_id, htmlMsg, message_id);
        await logTelegramSession(
          {
            chatId: chat_id,
            userName: from_name,
            userMessage: text,
            aiResponse: rawMsg,
            dataScopeUsed: 'pure_llm',
            tokenCount: 0,
          },
          db
        );
        return;
      }
    }

    const cmdUser = cmdAccess.user!;
    const dataScope = cmdUser.dataScope || 'full';

    // Step 2: Conversational Slash Command Handlers (/reset, /clear, /start, /help)
    if (lowerText === '/reset' || lowerText === '/clear') {
      await resetTelegramUserSession(chat_id, db);
      const graceNote = cmdAccess.isOverQuota
        ? `\n\n⚠️ *(Bạn đã hết hạn mức tin nhắn chính, còn ${cmdAccess.overQuotaCommandsRemaining ?? 0}/3 lượt lệnh hôm nay)*`
        : '';
      const replyMd = `🔄 **Đã đặt lại phiên trò chuyện!**\n\nLịch sử hội thoại trước đây của bạn đã được xoá khỏi ngữ cảnh. Bạn có thể bắt đầu chủ đề mới.${graceNote}`;
      const replyHtml = markdownToTelegramHtml(replyMd);
      await sendReply(botToken, chat_id, replyHtml, message_id);
      await logTelegramSession(
        {
          chatId: chat_id,
          userName: from_name,
          userMessage: text,
          aiResponse: replyMd,
          dataScopeUsed: dataScope,
          tokenCount: 0,
        },
        db
      );
      return;
    }

    if (lowerText === '/help' || lowerText === '/start') {
      const remainingQuota = Math.max(0, cmdUser.dailyLimit - cmdUser.usedToday);
      const isOver = cmdUser.usedToday >= cmdUser.dailyLimit;
      const scopeDescriptions: Record<TelegramDataScope, string> = {
        full: 'Toàn bộ (Tasks + Projects + Docs)',
        knowledge_only: 'Chỉ Docs & Notes',
        tasks_only: 'Chỉ Tasks & Projects',
        pure_llm: 'Chỉ LLM (Không dữ liệu TaskMate)',
      };

      const quotaStatusLine = isOver
        ? `- Hạn mức hôm nay: \`0 / ${cmdUser.dailyLimit} (đã hết hạn mức - còn ${cmdAccess.overQuotaCommandsRemaining ?? 0}/3 lượt lệnh trợ giúp/reset)\``
        : `- Hạn mức hôm nay: \`${remainingQuota} / ${cmdUser.dailyLimit} tin nhắn còn lại\``;

      const replyMd = [
        `🤖 **TaskMate AI Bot — Trợ lý Thông minh**`,
        ``,
        `Xin chào **${cmdUser.name}**! Tôi là bot hỗ trợ quản lý công việc và tra cứu tài liệu từ TaskMate cá nhân của bạn.`,
        ``,
        `📊 **Thông tin tài khoản:**`,
        `- Phạm vi dữ liệu: \`${scopeDescriptions[dataScope]}\``,
        `- Lượt nhớ hội thoại: \`${cmdUser.maxHistoryTurns ?? 5} lượt\``,
        quotaStatusLine,
        ``,
        `⚡ **Lệnh nhanh:**`,
        `- \`/help\` hoặc \`/start\`: Xem thông tin trợ giúp và hạn mức (không tốn hạn mức chat)`,
        `- \`/reset\` hoặc \`/clear\`: Xoá ngữ cảnh hội thoại, bắt đầu phiên mới (không tốn hạn mức chat)`,
        ``,
        `💡 *Hãy đặt câu hỏi trực tiếp, ví dụ: "Hôm nay tôi có task nào gấp?" hoặc "Tóm tắt ghi chú kiến trúc bot".*`,
      ].join('\n');

      const replyHtml = markdownToTelegramHtml(replyMd);
      await sendReply(botToken, chat_id, replyHtml, message_id);
      await logTelegramSession(
        {
          chatId: chat_id,
          userName: from_name,
          userMessage: text,
          aiResponse: replyMd,
          dataScopeUsed: dataScope,
          tokenCount: 0,
        },
        db
      );
      return;
    }
  }

  // Regular chat message: check and consume quota
  const quota = await checkAndConsumeQuota(chat_id, db);

  if (!quota.allowed) {
    if (quota.reason === 'not_whitelisted') {
      await handleUnauthorizedUser();
      const rawMsg = `⚠️ **Chưa được phân quyền truy cập**\n\nXin chào ${from_name}, bạn chưa được phân quyền sử dụng TaskMate AI Bot.\n\n🆔 **Chat ID của bạn:** \`${chat_id}\`\n\nVui lòng cung cấp ID của bạn cho admin @quan_tr96 để được phân quyền.`;
      const htmlMsg = markdownToTelegramHtml(rawMsg);
      await sendReply(botToken, chat_id, htmlMsg, message_id);
      await logTelegramSession(
        {
          chatId: chat_id,
          userName: from_name,
          userMessage: text,
          aiResponse: rawMsg,
          dataScopeUsed: 'pure_llm',
          tokenCount: 0,
        },
        db
      );
      return;
    }

    if (quota.reason === 'blocked') {
      const rawMsg = `⛔ **Tài khoản bị tạm khoá**\n\nChat ID \`${chat_id}\` đã bị tạm ngưng quyền truy cập TaskMate AI Bot.`;
      const htmlMsg = markdownToTelegramHtml(rawMsg);
      await sendReply(botToken, chat_id, htmlMsg, message_id);
      await logTelegramSession(
        {
          chatId: chat_id,
          userName: from_name,
          userMessage: text,
          aiResponse: rawMsg,
          dataScopeUsed: 'pure_llm',
          tokenCount: 0,
        },
        db
      );
      return;
    }

    if (quota.reason === 'quota_exceeded') {
      // Admins are exempt from daily limit blockades for TaskMate management
      if (!quota.user?.isAdmin) {
        const attempts = quota.overQuotaAttempts || 1;
        let rawMsg = '';

        if (attempts === 1) {
          rawMsg = `⏳ **Hết hạn mức trong ngày**\n\nBạn đã sử dụng hết hạn mức ${quota.dailyLimit} tin nhắn/ngày. Hạn mức sẽ được đặt lại vào 00:00 ngày mai.\n\n💡 *Gõ /help hoặc /reset nếu cần xem thông tin hoặc đặt lại phiên.*`;
        } else if (attempts <= 3) {
          rawMsg = `⚠️ **Cảnh báo spam (${attempts}/3): Hết hạn mức**\n\nBạn đã hết hạn mức ${quota.dailyLimit} tin nhắn/ngày. Vui lòng dừng gửi tin nhắn lặp lại để tránh bị hệ thống chặn. Hạn mức sẽ mở lại vào 00:00 ngày mai.\n\n💡 *Gõ /help hoặc /reset nếu cần xem thông tin.*`;
        } else {
          rawMsg = `⛔ **Cảnh báo spam: Tạm ngưng phản hồi**\n\nBạn đã gửi tin nhắn vượt hạn mức quá nhiều lần (${attempts} lần). Hệ thống đã ngừng ghi nhận phiên của bạn hôm nay để bảo vệ tài nguyên.`;
        }

        const htmlMsg = markdownToTelegramHtml(rawMsg);
        await sendReply(botToken, chat_id, htmlMsg, message_id);

        // Only log if within spam threshold to prevent junk logs from flooding DB
        if (!quota.shouldDropLog) {
          await logTelegramSession(
            {
              chatId: chat_id,
              userName: from_name,
              userMessage: text,
              aiResponse: rawMsg,
              dataScopeUsed: 'pure_llm',
              tokenCount: 0,
            },
            db
          );
        }
        return;
      }
    }
  }

  const user = quota.user!;
  const dataScope = user.dataScope || 'full';

  // Step 3: Send typing action so user knows AI is working
  try {
    await sendAction(botToken, chat_id, 'typing');
  } catch (err) {
    console.warn('[telegramWorker] sendAction failed:', err);
  }

  // Step 4: Gather history & configuration
  const aiConfig = await getNineRouterConfig(db);
  const apiKey = await getNineRouterApiKey(db);

  const settings = await getTelegramSettings(db);
  const userTurns = user.maxHistoryTurns !== undefined ? user.maxHistoryTurns : settings.maxHistoryTurns ?? 5;
  const historyTurns = Math.min(20, Math.max(0, userTurns));

  let chatHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  if (historyTurns > 0) {
    chatHistory = await getTelegramChatHistory(chat_id, historyTurns, user.sessionResetAt, db);
  }

  // Step 5: Intent routing via LLM (matching AI Chat Drawer architecture)
  let routedIntent: RouteIntentResult | null = null;
  if (apiKey && aiConfig.endpoint && dataScope !== 'pure_llm') {
    try {
      const mcpCapabilities = await getEnabledMcpCapabilitySummaries(db);
      // Bound history to at most 3 recent turns for intent classification to prevent prompt pollution
      const routerRecentTurns = chatHistory.slice(-3);
      routedIntent = await routeIntent(trimmedText, {
        completeJsonArgs: {
          endpoint: aiConfig.endpoint,
          apiKey,
          model: aiConfig.defaultModel,
        },
        recentTurns: routerRecentTurns,
        mcpCapabilities,
      });
    } catch (intentErr) {
      console.warn('[telegramWorker] routeIntent error, proceeding with heuristic context:', intentErr);
    }
  }

  // Handle clarification intent directly per AI-SPEC D-06
  if (routedIntent?.intent === 'clarify' && routedIntent.clarify_question) {
    const clarifyMsg = routedIntent.clarify_question;
    const htmlClarify = markdownToTelegramHtml(clarifyMsg);
    await sendReply(botToken, chat_id, htmlClarify, message_id);
    await logTelegramSession(
      {
        chatId: chat_id,
        userName: from_name,
        userMessage: text,
        aiResponse: clarifyMsg,
        dataScopeUsed: dataScope,
        tokenCount: 0,
      },
      db
    );
    return;
  }

  // Scope Security Gate: enforce user dataScope against detected intent & MCP tool usage
  if (dataScope === 'tasks_only' && (routedIntent?.intent === 'query_knowledge' || routedIntent?.require_mcp === true)) {
    const scopeRefusal = routedIntent?.require_mcp === true
      ? `⚠️ Bạn chỉ có quyền truy cập dữ liệu công việc (tasks_only), không thể tra cứu công cụ hệ thống bên ngoài.`
      : `⚠️ **Phạm vi truy cập bị giới hạn**\n\nTài khoản của bạn được cấu hình phạm vi **Chỉ Tasks & Projects** (\`tasks_only\`), không có quyền truy cập hệ thống tài liệu và tri thức (Knowledge Docs).\n\n💡 *Vui lòng chỉ đặt câu hỏi liên quan đến công việc hoặc liên hệ quản trị viên để mở rộng phạm vi.*`;
    const htmlRefusal = markdownToTelegramHtml(scopeRefusal);
    await sendReply(botToken, chat_id, htmlRefusal, message_id);
    await logTelegramSession(
      {
        chatId: chat_id,
        userName: from_name,
        userMessage: text,
        aiResponse: scopeRefusal,
        dataScopeUsed: dataScope,
        tokenCount: 0,
      },
      db
    );
    return;
  }

  if (
    dataScope === 'knowledge_only' &&
    (routedIntent?.intent === 'query_taskmate' || routedIntent?.intent === 'operate_taskmate')
  ) {
    const scopeRefusal = `⚠️ **Phạm vi truy cập bị giới hạn**\n\nTài khoản của bạn được cấu hình phạm vi **Chỉ Docs & Notes** (\`knowledge_only\`), không có quyền truy cập hay thao tác dữ liệu công việc (Tasks & Projects).\n\n💡 *Vui lòng chỉ đặt câu hỏi liên quan đến tài liệu/kiến thức hoặc liên hệ quản trị viên để mở rộng phạm vi.*`;
    const htmlRefusal = markdownToTelegramHtml(scopeRefusal);
    await sendReply(botToken, chat_id, htmlRefusal, message_id);
    await logTelegramSession(
      {
        chatId: chat_id,
        userName: from_name,
        userMessage: text,
        aiResponse: scopeRefusal,
        dataScopeUsed: dataScope,
        tokenCount: 0,
      },
      db
    );
    return;
  }

  // Step 5b: Handle TaskMate Mutation Requests (operate_taskmate / mixed)
  if (routedIntent?.intent === 'operate_taskmate' || routedIntent?.intent === 'mixed') {
    if (!user.isAdmin) {
      const scopeRefusal = `⚠️ **Không có quyền thao tác dữ liệu**\n\nChỉ quản trị viên (Admin) mới có quyền yêu cầu tạo, cập nhật, hoặc xóa dữ liệu TaskMate qua Telegram.\n\n💡 *Vui lòng liên hệ quản trị viên hoặc thao tác trực tiếp trên ứng dụng TaskMate.*`;
      const htmlRefusal = markdownToTelegramHtml(scopeRefusal);
      await sendReply(botToken, chat_id, htmlRefusal, message_id);
      await logTelegramSession(
        {
          chatId: chat_id,
          userName: from_name,
          userMessage: text,
          aiResponse: scopeRefusal,
          dataScopeUsed: dataScope,
          tokenCount: 0,
        },
        db
      );
      return;
    }

    // User is Admin: exempt from quota, refund any deducted turn
    await refundQuota(chat_id, db);

    const scoped = await resolveScopedContext('full', trimmedText, db);
    const mutationResult = await executeAdminMutationTurn({
      chatId: chat_id,
      userMessage: trimmedText,
      chatHistory,
      aiConfig: { endpoint: aiConfig.endpoint, defaultModel: aiConfig.defaultModel },
      apiKey,
      db,
      contextText: scoped.contextText,
    });

    const htmlMsg = markdownToTelegramHtml(mutationResult.replyMarkdown);
    const chunks = splitTelegramMessage(htmlMsg);
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (chunk) {
        await sendReply(botToken, chat_id, chunk, i === 0 ? message_id : undefined);
      }
    }

    await logTelegramSession(
      {
        chatId: chat_id,
        userName: from_name,
        userMessage: text,
        aiResponse: mutationResult.replyMarkdown,
        dataScopeUsed: dataScope,
        tokenCount: mutationResult.tokenCount || 0,
      },
      db
    );
    return;
  }

  // Step 6: Knowledge Query -> Federated Retrieval via runGroundedTurn (Fulltext, Vector, Graphiti Neo4j)
  if (
    routedIntent?.intent === 'query_knowledge' &&
    (dataScope === 'full' || dataScope === 'knowledge_only')
  ) {
    try {
      const [enabledRec, baseUrlRec, tokenRec] = await Promise.all([
        db.settings.get('knowledge_server_enabled'),
        db.settings.get('knowledge_server_base_url'),
        db.settings.get('knowledge_server_token'),
      ]);
      const knowledgeConfig = {
        enabled: enabledRec?.value === true,
        baseUrl: typeof baseUrlRec?.value === 'string' ? baseUrlRec.value : '',
        token: typeof tokenRec?.value === 'string' ? tokenRec.value : '',
      };

      const capabilities = {
        serverEnabled: Boolean(knowledgeConfig.enabled && knowledgeConfig.baseUrl),
        modelConfigured: Boolean(apiKey && aiConfig.endpoint && aiConfig.defaultModel),
      };

      const catalog = await fetchSetCatalog(db);
      const deps = createDefaultGroundedTurnDeps({
        knowledgeBaseUrl: knowledgeConfig.baseUrl,
        knowledgeToken: knowledgeConfig.token,
        db,
      });

      const groundedResult = await runGroundedTurn(
        {
          query: trimmedText,
          recentTurns: chatHistory,
          signal: new AbortController().signal,
          capabilities,
          config: {
            endpoint: aiConfig.endpoint,
            apiKey,
            model: aiConfig.defaultModel,
            promptVersion: 'grounded-v1',
            routerVersion: 'router-v1',
          },
          catalog,
          recentSessionId: `telegram-${chat_id}`,
          preRoutedIntent: routedIntent ?? undefined,
        },
        deps
      );

      if (groundedResult.kind === 'grounded_answer') {
        const rawAnswer = formatGroundedAnswerForTelegram(groundedResult.grounding);
        const htmlAnswer = markdownToTelegramHtml(rawAnswer);
        const chunks = splitTelegramMessage(htmlAnswer);
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          if (chunk) {
            await sendReply(botToken, chat_id, chunk, i === 0 ? message_id : undefined);
          }
        }
        await logTelegramSession(
          {
            chatId: chat_id,
            userName: from_name,
            userMessage: text,
            aiResponse: rawAnswer,
            dataScopeUsed: dataScope,
            tokenCount: (groundedResult as any).tokenUsage?.totalTokens || 0,
          },
          db
        );
        return;
      }

      if (
        groundedResult.kind === 'local_fallback_results' ||
        groundedResult.kind === 'evidence_only'
      ) {
        let noEvidenceMsg =
          '*(Không tìm thấy tài liệu hoặc bằng chứng nào phù hợp với yêu cầu trong kho tri thức TaskMate)*';
        const citations = groundedResult.grounding?.citations;
        if (Array.isArray(citations) && citations.length > 0) {
          const titles = Array.from(
            new Set(citations.map((c) => c.documentTitle).filter(Boolean))
          ).slice(0, 3);
          if (titles.length > 0) {
            noEvidenceMsg += `\n\n📚 **Tài liệu tham khảo:** ${titles.join(', ')}`;
          }
        }
        const htmlFallback = markdownToTelegramHtml(noEvidenceMsg);
        await sendReply(botToken, chat_id, htmlFallback, message_id);
        await logTelegramSession(
          {
            chatId: chat_id,
            userName: from_name,
            userMessage: text,
            aiResponse: noEvidenceMsg,
            dataScopeUsed: dataScope,
            tokenCount: 0,
          },
          db
        );
        return;
      }

      if (groundedResult.kind === 'refine') {
        const noEvidenceMsg =
          '*(Không tìm thấy tài liệu hoặc bằng chứng nào phù hợp với yêu cầu trong kho tri thức TaskMate)*';
        const htmlFallback = markdownToTelegramHtml(noEvidenceMsg);
        await sendReply(botToken, chat_id, htmlFallback, message_id);
        await logTelegramSession(
          {
            chatId: chat_id,
            userName: from_name,
            userMessage: text,
            aiResponse: noEvidenceMsg,
            dataScopeUsed: dataScope,
            tokenCount: 0,
          },
          db
        );
        return;
      }
    } catch (groundedErr) {
      console.warn('[telegramWorker] runGroundedTurn failed, falling back to local context:', groundedErr);
    }
  }

  // Step 7: Filter available read/query tools based on dataScope
  // CRITICAL SECURITY: strictly exclude mutation tools and adhere to dataScope
  let availableTools = AI_DATABASE_TOOLS.filter((t) => !isMutationTool(t.function.name));
  if (dataScope === 'pure_llm') {
    availableTools = [];
  } else if (dataScope === 'tasks_only') {
    // Exclude note and knowledge search tools
    availableTools = availableTools.filter(
      (t) =>
        t.function.name !== 'query_notes' &&
        t.function.name !== 'search_knowledge_base' &&
        t.function.name !== 'get_document_details' &&
        t.function.name !== 'get_document_backlinks'
    );
  }

  // Step 8: Invoke AI with AIChatDrawer-style Read-Tool Loop and Anti-Hallucination rules
  const todayStr = getTodayDateString();
  const now = dayjs();
  const dayName = now.format('dddd');
  const timeStr = now.format('HH:mm');

  const systemPrompt = [
    `You are TaskMate Telegram Assistant, a helpful, precise personal AI assistant directly integrated with the user's local TaskMate productivity app.`,
    `Current Date: ${todayStr} (${dayName}). Time: ${timeStr}.`,
    ``,
    `CRITICAL ANTI-HALLUCINATION RULES:`,
    `1. NEVER GUESS, ASSUME, OR INVENT DATA.`,
    `2. Every statement regarding tasks, projects, milestones, statuses, deadlines, logged work sessions, actual hours, planned allocations, capacity limits, notes, reminders, recurring schedules, or system sync state MUST be strictly grounded in concrete evidence returned by your tools or recorded in the database.`,
    `3. If the user asks about tasks, projects, milestones, schedules, worklogs, or notes, YOU MUST CALL THE RELEVANT DATABASE TOOLS to fetch accurate, real-time data instead of assuming or extrapolating.`,
    `4. If a requested item or detail is missing, null, empty, or not recorded in the database, EXPLICITLY STATE THAT IT IS NOT RECORDED. Never extrapolate, approximate, or pretend data exists.`,
    `5. If no relevant records are found after calling tools, clearly state that no matching record exists in the system.`,
    `6. Format your markdown cleanly for Telegram reading. Avoid deep nesting and keep responses clear and structured.`,
  ].join('\n');

  let currentMessages: ChatCompletionMessage[] = [
    { role: 'system', content: systemPrompt },
    ...chatHistory,
    { role: 'user', content: trimmedText },
  ];

  let rawAiResponse = '';
  let tokenCount = 0;

  try {
    const loopResult = await runAiOrchestratorLoop({
      endpoint: aiConfig.endpoint,
      apiKey,
      model: aiConfig.defaultModel,
      messages: currentMessages,
      ...(availableTools.length > 0 ? { tools: availableTools } : {}),
      temperature: 0.1,
      maxLoops: 5,
      db,
      synthesisPrompt:
        'Dựa trên tất cả các kết quả công cụ và thông tin đã thu thập ở trên, hãy tổng hợp câu trả lời đầy đủ, chi tiết, chính xác và rõ ràng cho yêu cầu ban đầu.\n' +
        'Yêu cầu định dạng:\n' +
        '- Trình bày bằng Markdown hoàn chỉnh, mạch lạc, trực quan cho Telegram.\n' +
        '- In đậm các từ khóa, mã trạng thái, ID quan trọng.\n' +
        '- Nếu không tìm thấy thông tin, nêu rõ không có dữ liệu thay vì suy đoán.\n' +
        '- Không gọi thêm bất kỳ công cụ nào nữa.',
      onMutationCheck: async (toolName, args) => {
        if (isMutationTool(toolName, args)) {
          return {
            proceed: false,
            cancellationResult: JSON.stringify({
              error: 'Thao tác thay đổi dữ liệu yêu cầu quyền Admin hoặc lệnh cụ thể.',
            }),
          };
        }
        return { proceed: true };
      },
    });

    rawAiResponse = loopResult.fullResponse;
    tokenCount = loopResult.tokenUsage?.totalTokens || 0;
  } catch (aiErr: any) {
    console.error('[telegramWorker] AI generation error:', aiErr);
    rawAiResponse = `❌ Lỗi khi xử lý yêu cầu AI: ${aiErr?.message || 'Không thể kết nối đến máy chủ AI'}`;
  }

  rawAiResponse = stripThinkingBlocks(rawAiResponse);

  if (!rawAiResponse.trim()) {
    rawAiResponse = '*(Không có phản hồi từ mô hình AI)*';
  }

  // Post-processing: clean citation tags
  let processedResponse = cleanCitationTags(rawAiResponse);

  // Step 9: Convert to Telegram HTML and Split/Send replies
  const formattedHtml = markdownToTelegramHtml(processedResponse);
  const chunks = splitTelegramMessage(formattedHtml);
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (chunk) {
      await sendReply(botToken, chat_id, chunk, i === 0 ? message_id : undefined);
    }
  }

  // Step 10: Log Session
  await logTelegramSession(
    {
      chatId: chat_id,
      userName: from_name,
      userMessage: text,
      aiResponse: processedResponse,
      dataScopeUsed: dataScope,
      tokenCount: tokenCount || Math.round(processedResponse.length / 4),
    },
    db
  );
}

/**
 * Headless background worker hook mounted at AppShell
 */
export function useTelegramHeadlessWorker(db: TaskPlannerDatabase = defaultDb) {
  useEffect(() => {
    if (!isTauriApp()) return;

    let unlistenInbound: (() => void) | undefined;
    let unlistenConflict: (() => void) | undefined;
    let isDisposed = false;

    const setup = async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const { invoke } = await import('@tauri-apps/api/core');

        if (isDisposed) return;

        // Check settings and auto-start if configured
        const settings = await getTelegramSettings(db);
        if (settings.isEnabled && settings.autoStartOnLaunch && settings.botToken) {
          try {
            await invoke('start_telegram_polling', { token: settings.botToken });
          } catch (err) {
            console.warn('[telegramWorker] Failed auto-start polling:', err);
          }
        }

        if (isDisposed) return;

        // Listen for 409 Conflict
        const cleanupConflict = await listen<TelegramConflictEvent>(
          'telegram-conflict-detected',
          async (event) => {
            console.warn('[telegramWorker] Conflict detected:', event.payload);
            await saveTelegramSettings({ isEnabled: false }, db);
          }
        );
        if (isDisposed) {
          cleanupConflict();
          return;
        }
        unlistenConflict = cleanupConflict;

        // Listen for Inbound updates
        const cleanupInbound = await listen<TelegramInboundEvent>(
          'telegram-inbound',
          async (event) => {
            const currentSettings = await getTelegramSettings(db);
            if (!currentSettings.isEnabled || !currentSettings.botToken) {
              return;
            }
            try {
              await processTelegramInboundMessage(
                event.payload,
                currentSettings.botToken,
                db
              );
            } catch (err) {
              console.error('[telegramWorker] Error handling inbound message:', err);
            }
          }
        );
        if (isDisposed) {
          cleanupInbound();
          return;
        }
        unlistenInbound = cleanupInbound;
      } catch (err) {
        console.warn('[telegramWorker] Failed to setup listeners:', err);
      }
    };

    setup();

    return () => {
      isDisposed = true;
      if (unlistenInbound) unlistenInbound();
      if (unlistenConflict) unlistenConflict();
    };
  }, [db]);
}
