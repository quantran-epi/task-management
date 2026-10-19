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
} from './telegramSettingsService';
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
import { streamChatEvents } from '../ai/nineRouterClient';
import { markdownToTelegramHtml } from './telegramHtml';
import { buildGlobalContextPrompt } from '../ai/contextGrounding';
import { rankBM25, tokenize, type BM25Document } from '../../utils/bm25';
import type { Note } from '../../types/models';
import { handleAdminCommand } from './telegramAdminWizard';

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
  db: TaskPlannerDatabase = defaultDb
): Promise<GroundedContextResult> {
  const parts: string[] = [];
  const matchedSourceTitles: string[] = [];

  if (scope === 'pure_llm') {
    return { contextText: '', matchedSourceTitles: [] };
  }

  // 1. Tasks & Projects Scope
  if (scope === 'full' || scope === 'tasks_only') {
    try {
      const globalOverview = await buildGlobalContextPrompt(db);
      if (globalOverview) {
        parts.push(globalOverview);
      }

      // Query tokens matching open tasks
      const qTokens = tokenize(query);
      const allTasks = await db.tasks
        .filter((t) => t.status !== 'Done' && t.status !== 'Cancelled')
        .toArray();

      let matchedTasks = allTasks;
      if (qTokens.length > 0) {
        const filtered = allTasks.filter((t) => {
          const tText = `${t.name} ${t.description || ''} ${t.jiraKey || ''}`.toLowerCase();
          return qTokens.some((token) => tText.includes(token));
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
  if (scope === 'full' || scope === 'knowledge_only') {
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
        if (query && query.trim()) {
          const ranked = rankBM25(query, bm25Docs, { limit: 5 });
          const rankedPositive = ranked.filter((r) => r.score > 0);
          if (rankedPositive.length > 0) {
            const matchedIds = new Set(rankedPositive.map((r) => r.doc.id));
            selectedNotes = notes.filter((n) => matchedIds.has(n.id));
          }
        }

        // If no BM25 matches or query is empty/generic, take up to 3 pinned or recently updated notes
        if (selectedNotes.length === 0) {
          selectedNotes = notes.slice(0, 3);
        }

        if (selectedNotes.length > 0) {
          parts.push('## Relevant Knowledge Notes & Docs:');
          for (const n of selectedNotes) {
            const title = n.title || 'Untitled';
            matchedSourceTitles.push(title);
            const bodyPreview = (n.body || '').slice(0, 500).trim();
            parts.push(`### [Doc] ${title}\n${bodyPreview}`);
          }
        }
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
  // Strip tags like [S1], [S2], [Doc 1], etc. generated by retrieval models
  return text
    .replace(/\[S\d+\]/gi, '')
    .replace(/\[Doc\s*\d+\]/gi, '')
    .replace(/\[Source\s*\d+\]/gi, '')
    .trim();
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

  const user = quota.user!;
  const dataScope = user.dataScope || 'full';

  // Step 3: Send typing action so user knows AI is working
  try {
    await sendAction(botToken, chat_id, 'typing');
  } catch (err) {
    console.warn('[telegramWorker] sendAction failed:', err);
  }

  // Step 4: Gather grounded context & history
  const { contextText, matchedSourceTitles } = await resolveScopedContext(dataScope, trimmedText, db);

  const settings = await getTelegramSettings(db);
  const userTurns = user.maxHistoryTurns !== undefined ? user.maxHistoryTurns : settings.maxHistoryTurns ?? 5;
  const historyTurns = Math.min(20, Math.max(0, userTurns));

  let chatHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  if (historyTurns > 0) {
    chatHistory = await getTelegramChatHistory(chat_id, historyTurns, user.sessionResetAt, db);
  }

  // Step 5: Invoke AI
  const aiConfig = await getNineRouterConfig(db);
  const apiKey = await getNineRouterApiKey(db);

  const systemPrompt = [
    'You are TaskMate Telegram Assistant, a helpful, precise personal AI assistant directly integrated with the user\'s local TaskMate productivity app.',
    'Always answer concisely, helpfully, and format your markdown cleanly for Telegram reading.',
    contextText
      ? `\n\n--- LOCAL TASKMATE CONTEXT (${dataScope.toUpperCase()}) ---\n${contextText}\n------------------------------------------`
      : '',
  ].join('\n');

  const messages: ChatCompletionMessage[] = [
    { role: 'system', content: systemPrompt },
    ...chatHistory,
    { role: 'user', content: trimmedText },
  ];

  let rawAiResponse = '';
  let tokenCount = 0;

  try {
    const generator = streamChatEvents({
      endpoint: aiConfig.endpoint,
      apiKey,
      payload: {
        model: aiConfig.defaultModel,
        messages,
        temperature: 0.7,
      },
    });

    for await (const chunk of generator) {
      if (chunk.type === 'text') {
        rawAiResponse += chunk.delta;
      }
      if (chunk.type === 'usage' && chunk.usage?.totalTokens) {
        tokenCount = chunk.usage.totalTokens;
      }
    }
  } catch (aiErr: any) {
    console.error('[telegramWorker] AI generation error:', aiErr);
    rawAiResponse = `❌ Lỗi khi xử lý yêu cầu AI: ${aiErr?.message || 'Không thể kết nối đến máy chủ AI'}`;
  }

  if (!rawAiResponse.trim()) {
    rawAiResponse = '*(Không có phản hồi từ mô hình AI)*';
  }

  // Post-processing: clean citation tags and append compact sources footer
  let processedResponse = cleanCitationTags(rawAiResponse);
  if (matchedSourceTitles.length > 0 && (dataScope === 'full' || dataScope === 'knowledge_only')) {
    const uniqueTitles = Array.from(new Set(matchedSourceTitles)).slice(0, 3);
    processedResponse += `\n\n📚 **Nguồn:** ${uniqueTitles.join(', ')}`;
  }

  // Step 6: Convert to Telegram HTML and Split/Send replies
  const formattedHtml = markdownToTelegramHtml(processedResponse);
  const chunks = splitTelegramMessage(formattedHtml);
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (chunk) {
      await sendReply(botToken, chat_id, chunk, i === 0 ? message_id : undefined);
    }
  }

  // Step 7: Log Session
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
