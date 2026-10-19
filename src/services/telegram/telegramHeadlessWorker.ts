import { useEffect, useRef } from 'react';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import {
  getTelegramSettings,
  saveTelegramSettings,
  checkAndConsumeQuota,
  logTelegramSession,
  getWhitelistUser,
} from './telegramSettingsService';
import type {
  TelegramInboundEvent,
  TelegramConflictEvent,
  TelegramDataScope,
} from './telegramTypes';
import { isTauriApp } from '../../utils/timerPopout';
import { getNineRouterConfig, getNineRouterApiKey } from '../ai/nineRouterTokenService';
import { streamChatEvents } from '../ai/nineRouterClient';

export const TELEGRAM_MAX_MESSAGE_LENGTH = 4000; // Telegram hard limit is 4096, buffer to 4000

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

export async function resolveScopedContext(
  scope: TelegramDataScope,
  query: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<string> {
  const parts: string[] = [];

  if (scope === 'pure_llm') {
    return '';
  }

  // 1. Tasks & Projects Scope
  if (scope === 'full' || scope === 'tasks_only') {
    try {
      const openTasks = await db.tasks
        .filter((t) => t.status !== 'Done' && t.status !== 'Cancelled')
        .limit(20)
        .toArray();

      if (openTasks.length > 0) {
        parts.push('## Open Tasks in TaskMate:');
        for (const t of openTasks) {
          parts.push(`- [${t.status}] [${t.priority}] **${t.name}** (Progress: ${t.progress}%${t.deadline ? `, Deadline: ${t.deadline}` : ''})`);
        }
      }

      const activeProjects = await db.projects
        .filter((p) => p.status === 'In Progress' || p.status === 'Open')
        .limit(10)
        .toArray();

      if (activeProjects.length > 0) {
        parts.push('\n## Active Projects:');
        for (const p of activeProjects) {
          parts.push(`- **${p.name}** (${p.status})`);
        }
      }
    } catch (e) {
      console.warn('[telegramWorker] Failed to query tasks/projects context:', e);
    }
  }

  // 2. Knowledge Docs Scope
  if (scope === 'full' || scope === 'knowledge_only') {
    try {
      const notes = await db.notes
        .limit(15)
        .toArray();

      if (notes.length > 0) {
        parts.push('\n## Knowledge Notes & Docs:');
        for (const n of notes) {
          const bodyPreview = (n.body || '').slice(0, 300).trim();
          parts.push(`### ${n.title || 'Untitled'}\n${bodyPreview}`);
        }
      }
    } catch (e) {
      console.warn('[telegramWorker] Failed to query knowledge context:', e);
    }
  }

  return parts.join('\n\n');
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

  // Step 1: Whitelist & Quota Check
  const quota = await checkAndConsumeQuota(chat_id, db);

  if (!quota.allowed) {
    if (quota.reason === 'not_whitelisted') {
      const msg = `⚠️ **Chưa được cấp quyền truy cập**\n\nXin chào ${from_name}, tài khoản Telegram của bạn chưa nằm trong danh sách được phép sử dụng TaskMate AI Bot.\n\n🆔 **Chat ID của bạn:** \`${chat_id}\`\n\nVui lòng cung cấp Chat ID này cho quản trị viên TaskMate để được thêm vào Whitelist.`;
      await sendReply(botToken, chat_id, msg, message_id);
      return;
    }

    if (quota.reason === 'blocked') {
      const msg = `⛔ **Tài khoản bị tạm khoá**\n\nChat ID \`${chat_id}\` đã bị tạm ngưng quyền truy cập TaskMate AI Bot.`;
      await sendReply(botToken, chat_id, msg, message_id);
      return;
    }

    if (quota.reason === 'quota_exceeded') {
      const msg = `⏳ **Hết hạn mức trong ngày**\n\nBạn đã sử dụng hết hạn mức ${quota.dailyLimit} tin nhắn/ngày. Hạn mức sẽ được đặt lại vào 00:00 ngày mai.`;
      await sendReply(botToken, chat_id, msg, message_id);
      return;
    }
  }

  const user = quota.user!;
  const dataScope = user.dataScope || 'full';

  // Step 2: Send typing action
  try {
    await sendAction(botToken, chat_id, 'typing');
  } catch (err) {
    console.warn('[telegramWorker] sendAction failed:', err);
  }

  // Step 3: Gather scoped context
  const context = await resolveScopedContext(dataScope, text, db);

  // Step 4: Invoke AI
  const aiConfig = await getNineRouterConfig(db);
  const apiKey = await getNineRouterApiKey(db);

  const systemPrompt = [
    'You are TaskMate Telegram Assistant, a helpful, precise personal AI assistant directly integrated with the user\'s local TaskMate productivity app.',
    'Always answer concisely, helpfully, and format your markdown cleanly for Telegram reading.',
    context ? `\n\n--- LOCAL TASKMATE CONTEXT (${dataScope.toUpperCase()}) ---\n${context}\n------------------------------------------` : '',
  ].join('\n');

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: text },
  ];

  let fullAiResponse = '';
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
        fullAiResponse += chunk.delta;
      }
      if (chunk.type === 'usage' && chunk.usage?.total_tokens) {
        tokenCount = chunk.usage.total_tokens;
      }
    }
  } catch (aiErr: any) {
    console.error('[telegramWorker] AI generation error:', aiErr);
    fullAiResponse = `❌ Lỗi khi xử lý yêu cầu AI: ${aiErr?.message || 'Không thể kết nối đến máy chủ AI'}`;
  }

  if (!fullAiResponse.trim()) {
    fullAiResponse = '*(Không có phản hồi từ mô hình AI)*';
  }

  // Step 5: Split & Send replies
  const chunks = splitTelegramMessage(fullAiResponse);
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (chunk) {
      await sendReply(botToken, chat_id, chunk, i === 0 ? message_id : undefined);
    }
  }

  // Step 6: Log Session
  await logTelegramSession(
    {
      chatId: chat_id,
      userName: from_name,
      userMessage: text,
      aiResponse: fullAiResponse,
      dataScopeUsed: dataScope,
      tokenCount: tokenCount || Math.round(fullAiResponse.length / 4),
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

        // Listen for Inbound messages
        unlistenInbound = await listen<TelegramInboundEvent>(
          'telegram-inbound',
          async (event) => {
            try {
              const currentSettings = await getTelegramSettings(db);
              if (!currentSettings.botToken) return;
              await processTelegramInboundMessage(event.payload, currentSettings.botToken, db);
            } catch (err) {
              console.error('[telegramWorker] Error handling inbound message:', err);
            }
          }
        );
      } catch (err) {
        console.warn('[telegramWorker] Setup error:', err);
      }
    };

    setup();

    return () => {
      if (unlistenInbound) unlistenInbound();
      if (unlistenConflict) unlistenConflict();
    };
  }, [db]);
}
