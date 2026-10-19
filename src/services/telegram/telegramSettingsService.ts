import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import type {
  TelegramSettingsRecord,
  TelegramWhitelistUser,
  TelegramSessionLog,
} from './telegramTypes';
import { getTodayDateString } from '../../utils/date';
import { generateId } from '../../utils/uuid';

export const DEFAULT_TELEGRAM_SETTINGS: TelegramSettingsRecord = {
  id: 'default',
  botToken: '',
  isEnabled: false,
  autoStartOnLaunch: false,
  defaultScope: 'full',
  maxHistoryTurns: 5,
};

export async function getTelegramSettings(
  db: TaskPlannerDatabase = defaultDb
): Promise<TelegramSettingsRecord> {
  const record = await db.telegramSettings.get('default');
  if (!record) {
    return { ...DEFAULT_TELEGRAM_SETTINGS };
  }
  return { ...DEFAULT_TELEGRAM_SETTINGS, ...record };
}

export async function saveTelegramSettings(
  settings: Partial<TelegramSettingsRecord>,
  db: TaskPlannerDatabase = defaultDb
): Promise<TelegramSettingsRecord> {
  const current = await getTelegramSettings(db);
  const updated: TelegramSettingsRecord = {
    ...current,
    ...settings,
    id: 'default',
    updatedAt: new Date().toISOString(),
  };
  await db.telegramSettings.put(updated);
  return updated;
}

export async function getWhitelist(
  db: TaskPlannerDatabase = defaultDb
): Promise<TelegramWhitelistUser[]> {
  return await db.telegramWhitelist.toArray();
}

export async function getWhitelistUser(
  chatId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<TelegramWhitelistUser | undefined> {
  return await db.telegramWhitelist.get(chatId);
}

export async function upsertWhitelistUser(
  user: Partial<TelegramWhitelistUser> & { chatId: string },
  db: TaskPlannerDatabase = defaultDb
): Promise<TelegramWhitelistUser> {
  const existing = await db.telegramWhitelist.get(user.chatId);
  const now = new Date().toISOString();
  const today = getTodayDateString();

  const record: TelegramWhitelistUser = {
    chatId: user.chatId,
    name: user.name ?? existing?.name ?? `User_${user.chatId}`,
    status: user.status ?? existing?.status ?? 'active',
    dataScope: user.dataScope ?? existing?.dataScope ?? 'full',
    dailyLimit: user.dailyLimit ?? existing?.dailyLimit ?? 30,
    usedToday: user.usedToday ?? existing?.usedToday ?? 0,
    lastActiveDate: user.lastActiveDate ?? existing?.lastActiveDate ?? today,
    maxHistoryTurns: user.maxHistoryTurns ?? existing?.maxHistoryTurns ?? 5,
    sessionResetAt: user.sessionResetAt !== undefined ? user.sessionResetAt : existing?.sessionResetAt,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await db.telegramWhitelist.put(record);
  return record;
}

export async function deleteWhitelistUser(
  chatId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await db.telegramWhitelist.delete(chatId);
}

export interface QuotaCheckResult {
  allowed: boolean;
  reason?: 'not_whitelisted' | 'blocked' | 'quota_exceeded';
  user?: TelegramWhitelistUser;
  usedToday?: number;
  dailyLimit?: number;
}

/**
 * Checks if the user is authorized and has quota remaining.
 * Automatically resets `usedToday` if `lastActiveDate !== today`.
 * Increments `usedToday` atomically if allowed.
 */
export async function checkAndConsumeQuota(
  chatId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<QuotaCheckResult> {
  return await db.transaction('rw', db.telegramWhitelist, async () => {
    const user = await db.telegramWhitelist.get(chatId);
    if (!user) {
      return { allowed: false, reason: 'not_whitelisted' };
    }

    if (user.status === 'blocked') {
      return { allowed: false, reason: 'blocked', user };
    }

    const today = getTodayDateString();
    let usedToday = user.usedToday;

    // Reset quota if new day
    if (user.lastActiveDate !== today) {
      usedToday = 0;
    }

    if (usedToday >= user.dailyLimit) {
      return {
        allowed: false,
        reason: 'quota_exceeded',
        user,
        usedToday,
        dailyLimit: user.dailyLimit,
      };
    }

    usedToday += 1;
    const updatedUser: TelegramWhitelistUser = {
      ...user,
      usedToday,
      lastActiveDate: today,
      updatedAt: new Date().toISOString(),
    };

    await db.telegramWhitelist.put(updatedUser);

    return {
      allowed: true,
      user: updatedUser,
      usedToday,
      dailyLimit: user.dailyLimit,
    };
  });
}

export async function logTelegramSession(
  log: Omit<TelegramSessionLog, 'id' | 'createdAt'> & { id?: string; createdAt?: string },
  db: TaskPlannerDatabase = defaultDb
): Promise<TelegramSessionLog> {
  const fullLog: TelegramSessionLog = {
    id: log.id || generateId(),
    chatId: log.chatId,
    userName: log.userName,
    userMessage: log.userMessage,
    aiResponse: log.aiResponse,
    dataScopeUsed: log.dataScopeUsed,
    tokenCount: log.tokenCount,
    createdAt: log.createdAt || new Date().toISOString(),
  };

  await db.telegramSessionLogs.put(fullLog);
  return fullLog;
}

export async function getRecentTelegramLogs(
  limit = 50,
  db: TaskPlannerDatabase = defaultDb
): Promise<TelegramSessionLog[]> {
  return await db.telegramSessionLogs
    .orderBy('createdAt')
    .reverse()
    .limit(limit)
    .toArray();
}

export async function resetTelegramUserSession(
  chatId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<TelegramWhitelistUser | undefined> {
  const user = await db.telegramWhitelist.get(chatId);
  if (!user) return undefined;
  const now = new Date().toISOString();
  const updatedUser: TelegramWhitelistUser = {
    ...user,
    sessionResetAt: now,
    updatedAt: now,
  };
  await db.telegramWhitelist.put(updatedUser);
  return updatedUser;
}

export async function getTelegramChatHistory(
  chatId: string,
  maxTurns: number,
  sinceIso?: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  if (maxTurns <= 0) return [];

  let query = db.telegramSessionLogs
    .where('chatId')
    .equals(chatId);

  let logs = await query.toArray();

  if (sinceIso) {
    logs = logs.filter((log) => log.createdAt > sinceIso);
  }

  // Sort descending by createdAt
  logs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // Take up to maxTurns items
  const recentLogs = logs.slice(0, maxTurns);

  // Reverse back to chronological order (oldest first)
  recentLogs.reverse();

  const history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const log of recentLogs) {
    if (log.userMessage?.trim()) {
      history.push({ role: 'user', content: log.userMessage.trim() });
    }
    if (log.aiResponse?.trim()) {
      history.push({ role: 'assistant', content: log.aiResponse.trim() });
    }
  }

  return history;
}

