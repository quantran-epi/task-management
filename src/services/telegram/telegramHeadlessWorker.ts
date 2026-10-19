import { useEffect, useRef } from 'react';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import {
  getTelegramSettings,
  saveTelegramSettings,
  checkAndConsumeQuota,
  logTelegramSession,
  resetTelegramUserSession,
  getTelegramChatHistory,
} from './telegramSettingsService';
import type {
  TelegramInboundEvent,
  TelegramConflictEvent,
  TelegramDataScope,
} from './telegramTypes';
import type { ChatCompletionMessage } from '../ai/types';
import { isTauriApp } from '../../utils/timerPopout';
import { getNineRouterConfig, getNineRouterApiKey } from '../ai/nineRouterTokenService';
import { streamChatEvents } from '../ai/nineRouterClient';
import { markdownToTelegramHtml } from './telegramHtml';
import { buildGlobalContextPrompt } from '../ai/contextGrounding';
import { rankBM25, tokenize, type BM25Document } from '../../utils/bm25';
import type { Note } from '../../types/models';

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
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: htmlText,
        reply_to_message_id: replyToMessageId,
        parse_mode: 'HTML',
      }),
    });
  }
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

export async function processTelegramInboundMessage(
  event: TelegramInboundEvent,
  botToken: string,
  db: TaskPlannerDatabase = defaultDb,
  sendReplyFn?: (token: string, chatId: string, text: string, replyTo?: number) => Promise<void>,
  sendActionFn?: (token: string, chatId: string, action: string) => Promise<void>
): Promise<void> {
  const { chat_id, from_name, text, message_id } = event;

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

  // Step 1: Whitelist & Authorization Check
  const quota = await checkAndConsumeQuota(chat_id, db);

  if (!quota.allowed) {
    if (quota.reason === 'not_whitelisted') {
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
      const rawMsg = `⏳ **Hết hạn mức trong ngày**\n\nBạn đã sử dụng hết hạn mức ${quota.dailyLimit} tin nhắn/ngày. Hạn mức sẽ được đặt lại vào 00:00 ngày mai.`;
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

  const user = quota.user!;
  const dataScope = user.dataScope || 'full';

  // Step 2: Conversational Slash Command Handlers (/reset, /clear, /start, /help)
  // These commands do NOT call AI and should preserve user quota
  if (lowerText === '/reset' || lowerText === '/clear') {
    await resetTelegramUserSession(chat_id, db);
    const replyMd = `🔄 **Đã đặt lại phiên trò chuyện!**\n\nLịch sử hội thoại trước đây của bạn đã được xoá khỏi ngữ cảnh. Bạn có thể bắt đầu chủ đề mới.`;
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
    const remainingQuota = Math.max(0, user.dailyLimit - user.usedToday);
    const scopeDescriptions: Record<TelegramDataScope, string> = {
      full: 'Toàn bộ (Tasks + Projects + Docs)',
      knowledge_only: 'Chỉ Docs & Notes',
      tasks_only: 'Chỉ Tasks & Projects',
      pure_llm: 'Chỉ LLM (Không dữ liệu TaskMate)',
    };

    const replyMd = [
      `🤖 **TaskMate AI Bot — Trợ lý Thông minh**`,
      ``,
      `Xin chào **${user.name}**! Tôi là bot hỗ trợ quản lý công việc và tra cứu tài liệu từ TaskMate cá nhân của bạn.`,
      ``,
      `📊 **Thông tin tài khoản:**`,
      `- Phạm vi dữ liệu: \`${scopeDescriptions[dataScope]}\``,
      `- Lượt nhớ hội thoại: \`${user.maxHistoryTurns ?? 5} lượt\``,
      `- Hạn mức hôm nay: \`${remainingQuota} / ${user.dailyLimit} tin nhắn còn lại\``,
      ``,
      `⚡ **Lệnh nhanh:**`,
      `- \`/help\` hoặc \`/start\`: Xem thông tin trợ giúp và hạn mức`,
      `- \`/reset\` hoặc \`/clear\`: Xoá ngữ cảnh hội thoại, bắt đầu phiên mới`,
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

  // Step 3: Send typing action
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
  const isInitialized = useRef(false);

  useEffect(() => {
    if (!isTauriApp() || isInitialized.current) return;
    isInitialized.current = true;

    let unlistenInbound: (() => void) | undefined;
    let unlistenConflict: (() => void) | undefined;

    const setup = async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const { invoke } = await import('@tauri-apps/api/core');

        // Check settings and auto-start if configured
        const settings = await getTelegramSettings(db);
        if (settings.isEnabled && settings.autoStartOnLaunch && settings.botToken) {
          try {
            await invoke('start_telegram_polling', { token: settings.botToken });
          } catch (err) {
            console.warn('[telegramWorker] Failed auto-start polling:', err);
          }
        }

        // Listen for 409 Conflict
        unlistenConflict = await listen<TelegramConflictEvent>(
          'telegram-conflict-detected',
          async (event) => {
            console.warn('[telegramWorker] Conflict detected:', event.payload);
            await saveTelegramSettings({ isEnabled: false }, db);
          }
        );

        // Listen for Inbound updates
        unlistenInbound = await listen<TelegramInboundEvent>(
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
      } catch (err) {
        console.warn('[telegramWorker] Failed to setup listeners:', err);
      }
    };

    setup();

    return () => {
      if (unlistenInbound) unlistenInbound();
      if (unlistenConflict) unlistenConflict();
    };
  }, [db]);
}
