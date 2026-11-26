import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import type {
  TelegramSettingsRecord,
  TelegramWhitelistUser,
  TelegramSessionLog,
} from './telegramTypes';
import { getTodayDateString } from '../../utils/date';
import { generateId } from '../../utils/uuid';
import type { TelegramDeviceStatus, TelegramRemoteSettings } from './telegramTypes';

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
    dailyLimit: user.dailyLimit ?? existing?.dailyLimit ?? 10,
    usedToday: user.usedToday ?? existing?.usedToday ?? 0,
    lastActiveDate: user.lastActiveDate ?? existing?.lastActiveDate ?? today,
    isAdmin: user.isAdmin !== undefined ? user.isAdmin : existing?.isAdmin,
    maxHistoryTurns: user.maxHistoryTurns ?? existing?.maxHistoryTurns ?? 5,
    sessionResetAt: user.sessionResetAt !== undefined ? user.sessionResetAt : existing?.sessionResetAt,
    overQuotaCommandsUsed: user.overQuotaCommandsUsed ?? existing?.overQuotaCommandsUsed ?? 0,
    overQuotaAttempts: user.overQuotaAttempts ?? existing?.overQuotaAttempts ?? 0,
    aiModel: user.aiModel !== undefined ? user.aiModel : existing?.aiModel,
    telegramUserId: user.telegramUserId !== undefined ? user.telegramUserId : existing?.telegramUserId,
    deviceStatus: user.deviceStatus !== undefined ? user.deviceStatus : existing?.deviceStatus,
    allowedModels: user.allowedModels !== undefined ? user.allowedModels : existing?.allowedModels,
    remoteSettings: user.remoteSettings !== undefined ? user.remoteSettings : existing?.remoteSettings,
    pairingCode: user.pairingCode !== undefined ? user.pairingCode : existing?.pairingCode,
    pairingCodeExpiresAt:
      user.pairingCodeExpiresAt !== undefined ? user.pairingCodeExpiresAt : existing?.pairingCodeExpiresAt,
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

/** Ưu tiên danh tính Telegram; fallback row legacy khóa theo chatId. */
export async function findWhitelistByIdentity(
  identity: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<TelegramWhitelistUser | undefined> {
  if (!identity.trim()) return undefined;
  const byIdentity = await db.telegramWhitelist.where('telegramUserId').equals(identity).first();
  if (byIdentity) return byIdentity;
  return await db.telegramWhitelist.get(identity);
}

function createPairingCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

/** Xoay mã ghép cặp mỗi lần gọi /policy; hết hạn sau 24h. */
export async function rotateDevicePairingCode(
  identity: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<{ pairingCode: string; pairingCodeExpiresAt: string }> {
  const row = await findWhitelistByIdentity(identity, db);
  if (!row) throw new Error('Thiết bị chưa được đăng ký.');
  const next = {
    pairingCode: createPairingCode(),
    pairingCodeExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };
  await db.telegramWhitelist.put({ ...row, ...next, updatedAt: new Date().toISOString() });
  return next;
}

/** Mutation duy nhất cho admin approve/revoke/gán model thiết bị. */
export async function upsertDeviceEnrollment(input: {
  telegramUserId: string;
  chatId: string;
  deviceStatus: TelegramDeviceStatus;
  allowedModels?: string[] | undefined;
  remoteSettings?: TelegramRemoteSettings | undefined;
  botToken?: string | undefined;
}, db: TaskPlannerDatabase = defaultDb): Promise<TelegramWhitelistUser> {
  const identity = input.telegramUserId.trim();
  const existing = identity ? await findWhitelistByIdentity(identity, db) : undefined;
  const targetChatId = existing?.chatId ?? input.chatId;
  const approved = input.deviceStatus === 'approved';

  return await db.transaction('rw', db.telegramWhitelist, async () => {
    const current = await db.telegramWhitelist.get(targetChatId);
    const now = new Date().toISOString();
    const record: TelegramWhitelistUser = {
      chatId: targetChatId,
      name: current?.name ?? `User_${targetChatId}`,
      status: approved ? 'active' : current?.status ?? 'active',
      dataScope: current?.dataScope ?? 'full',
      dailyLimit: current?.dailyLimit ?? 10,
      usedToday: current?.usedToday ?? 0,
      lastActiveDate: current?.lastActiveDate ?? getTodayDateString(),
      maxHistoryTurns: current?.maxHistoryTurns ?? 5,
      overQuotaCommandsUsed: current?.overQuotaCommandsUsed ?? 0,
      overQuotaAttempts: current?.overQuotaAttempts ?? 0,
      aiModel: current?.aiModel,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
      ...(existing ? { telegramUserId: identity } : {}),
      deviceStatus: input.deviceStatus,
      allowedModels: input.allowedModels ?? current?.allowedModels ?? [],
      remoteSettings: input.remoteSettings ?? current?.remoteSettings,
      ...(approved
        ? {
            pairingCode: createPairingCode(),
            pairingCodeExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          }
        : {
            pairingCode: current?.pairingCode,
            pairingCodeExpiresAt: current?.pairingCodeExpiresAt,
          }),
    };
    await db.telegramWhitelist.put(record);
    return record;
  });
}

/**
 * Records an unauthorized incoming user as a pending user in telegramWhitelist.
 * If user does not exist in telegramWhitelist, inserts record with status 'pending' and returns { user, isNew: true }.
 * If user already exists (e.g. pending or blocked or active), returns { user, isNew: false }.
 */
export async function recordPendingTelegramUser(
  chatId: string,
  name?: string,
  db: TaskPlannerDatabase = defaultDb,
  telegramUserId?: string
): Promise<{ user: TelegramWhitelistUser; isNew: boolean }> {
  const settings = await getTelegramSettings(db);
  const identity = telegramUserId?.trim();
  return await db.transaction('rw', db.telegramWhitelist, async () => {
    let existing = await db.telegramWhitelist.get(chatId);
    if (!existing && identity) existing = await findWhitelistByIdentity(identity, db);
    if (existing) {
      // Một Telegram user = một row thiết bị; cập nhật địa chỉ reply mới nhất, giữ trạng thái.
      if (identity && existing.chatId !== chatId) {
        const moved = { ...existing, chatId, updatedAt: new Date().toISOString() };
        await db.telegramWhitelist.delete(existing.chatId);
        await db.telegramWhitelist.put(moved);
        return { user: moved, isNew: false };
      }
      return { user: existing, isNew: false };
    }

    const now = new Date().toISOString();
    const today = getTodayDateString();
    const newUser: TelegramWhitelistUser = {
      chatId,
      name: name?.trim() || `User_${chatId}`,
      status: 'pending',
      dataScope: settings.defaultScope || 'full',
      dailyLimit: 10,
      usedToday: 0,
      lastActiveDate: today,
      maxHistoryTurns: 5,
      overQuotaCommandsUsed: 0,
      overQuotaAttempts: 0,
      ...(identity ? { telegramUserId: identity } : {}),
      deviceStatus: 'pending',
      createdAt: now,
      updatedAt: now,
    };

    await db.telegramWhitelist.put(newUser);
    return { user: newUser, isNew: true };
  });
}

export async function getPendingTelegramUsers(
  db: TaskPlannerDatabase = defaultDb
): Promise<TelegramWhitelistUser[]> {
  return await db.telegramWhitelist.where('status').equals('pending').toArray();
}

export async function approvePendingUser(
  chatId: string,
  overrides?: Partial<TelegramWhitelistUser>,
  db: TaskPlannerDatabase = defaultDb
): Promise<TelegramWhitelistUser> {
  const existing = await db.telegramWhitelist.get(chatId);
  const settings = await getTelegramSettings(db);
  const resolvedScope =
    overrides?.dataScope ??
    (existing && existing.status !== 'pending' ? existing.dataScope : settings.defaultScope);

  return await upsertWhitelistUser(
    {
      chatId,
      status: 'active',
      ...overrides,
      dataScope: resolvedScope,
    },
    db
  );
}

export async function blockPendingUser(
  chatId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<TelegramWhitelistUser> {
  const existing = await db.telegramWhitelist.get(chatId);
  return await upsertWhitelistUser(
    {
      chatId,
      status: 'blocked',
      ...(existing?.telegramUserId ? { deviceStatus: 'revoked' as const } : {}),
    },
    db
  );
}

export async function unblockUser(
  chatId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<TelegramWhitelistUser> {
  return await upsertWhitelistUser(
    {
      chatId,
      status: 'active',
      overQuotaAttempts: 0,
      overQuotaCommandsUsed: 0,
    },
    db
  );
}

export const TELEGRAM_COMMAND_OVER_QUOTA_GRACE = 3;
export const TELEGRAM_OVER_QUOTA_SPAM_LOG_THRESHOLD = 3;

export interface QuotaCheckResult {
  allowed: boolean;
  reason?: 'not_whitelisted' | 'blocked' | 'quota_exceeded' | undefined;
  user?: TelegramWhitelistUser | undefined;
  usedToday?: number | undefined;
  dailyLimit?: number | undefined;
  isOverQuota?: boolean | undefined;
  overQuotaAttempts?: number | undefined;
  isSpamming?: boolean | undefined;
  shouldDropLog?: boolean | undefined;
}

/**
 * Checks if the user is authorized and has quota remaining.
 * Automatically resets `usedToday`, `overQuotaCommandsUsed`, and `overQuotaAttempts` if `lastActiveDate !== today`.
 * Increments `usedToday` atomically if allowed.
 * Increments `overQuotaAttempts` if over quota. Drops logging if attempts exceed threshold.
 */
export async function checkAndConsumeQuota(
  chatId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<QuotaCheckResult> {
  return await db.transaction('rw', db.telegramWhitelist, async () => {
    const user = await db.telegramWhitelist.get(chatId);
    if (!user || user.status === 'pending') {
      return { allowed: false, reason: 'not_whitelisted', user: user ?? undefined };
    }

    if (user.status === 'blocked') {
      return { allowed: false, reason: 'blocked', user };
    }

    const today = getTodayDateString();
    let usedToday = user.usedToday;
    let overQuotaAttempts = user.overQuotaAttempts ?? 0;
    let overQuotaCommandsUsed = user.overQuotaCommandsUsed ?? 0;

    // Reset quota if new day
    if (user.lastActiveDate !== today) {
      usedToday = 0;
      overQuotaAttempts = 0;
      overQuotaCommandsUsed = 0;
    }

    if (usedToday >= user.dailyLimit) {
      overQuotaAttempts += 1;
      const updatedUser: TelegramWhitelistUser = {
        ...user,
        usedToday,
        overQuotaAttempts,
        overQuotaCommandsUsed,
        lastActiveDate: today,
        updatedAt: new Date().toISOString(),
      };
      await db.telegramWhitelist.put(updatedUser);

      const isSpamming = overQuotaAttempts > 1;
      const shouldDropLog = overQuotaAttempts > TELEGRAM_OVER_QUOTA_SPAM_LOG_THRESHOLD;

      return {
        allowed: false,
        reason: 'quota_exceeded',
        user: updatedUser,
        usedToday,
        dailyLimit: user.dailyLimit,
        isOverQuota: true,
        overQuotaAttempts,
        isSpamming,
        shouldDropLog,
      };
    }

    usedToday += 1;
    const updatedUser: TelegramWhitelistUser = {
      ...user,
      usedToday,
      overQuotaCommandsUsed,
      overQuotaAttempts: 0,
      lastActiveDate: today,
      updatedAt: new Date().toISOString(),
    };

    await db.telegramWhitelist.put(updatedUser);

    return {
      allowed: true,
      user: updatedUser,
      usedToday,
      dailyLimit: user.dailyLimit,
      isOverQuota: false,
      overQuotaAttempts: 0,
      isSpamming: false,
      shouldDropLog: false,
    };
  });
}

export interface CommandAccessResult {
  allowed: boolean;
  reason?: 'not_whitelisted' | 'blocked' | 'quota_exceeded' | undefined;
  user?: TelegramWhitelistUser | undefined;
  isOverQuota?: boolean | undefined;
  overQuotaCommandsRemaining?: number | undefined;
}

/**
 * Checks authorization for slash commands (/help, /reset, /start, /clear).
 * Slash commands do NOT consume dailyLimit.
 * If user has exhausted dailyLimit, they get TELEGRAM_COMMAND_OVER_QUOTA_GRACE (3) extra command executions.
 */
export async function checkAndConsumeCommandQuota(
  chatId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<CommandAccessResult> {
  return await db.transaction('rw', db.telegramWhitelist, async () => {
    const user = await db.telegramWhitelist.get(chatId);
    if (!user || user.status === 'pending') {
      return { allowed: false, reason: 'not_whitelisted', user: user ?? undefined };
    }

    if (user.status === 'blocked') {
      return { allowed: false, reason: 'blocked', user };
    }

    const today = getTodayDateString();
    let usedToday = user.usedToday;
    let overQuotaCommandsUsed = user.overQuotaCommandsUsed ?? 0;

    if (user.lastActiveDate !== today) {
      usedToday = 0;
      overQuotaCommandsUsed = 0;
    }

    const isOverQuota = usedToday >= user.dailyLimit;

    if (isOverQuota) {
      if (overQuotaCommandsUsed >= TELEGRAM_COMMAND_OVER_QUOTA_GRACE) {
        return {
          allowed: false,
          reason: 'quota_exceeded',
          user,
          isOverQuota: true,
          overQuotaCommandsRemaining: 0,
        };
      }

      overQuotaCommandsUsed += 1;
      const updatedUser: TelegramWhitelistUser = {
        ...user,
        usedToday,
        overQuotaCommandsUsed,
        lastActiveDate: today,
        updatedAt: new Date().toISOString(),
      };
      await db.telegramWhitelist.put(updatedUser);

      return {
        allowed: true,
        user: updatedUser,
        isOverQuota: true,
        overQuotaCommandsRemaining: Math.max(0, TELEGRAM_COMMAND_OVER_QUOTA_GRACE - overQuotaCommandsUsed),
      };
    }

    return {
      allowed: true,
      user,
      isOverQuota: false,
      overQuotaCommandsRemaining: TELEGRAM_COMMAND_OVER_QUOTA_GRACE,
    };
  });
}

/**
 * Refunds 1 used turn to the user's dailyLimit, e.g. when an admin executes a mutation
 * or a turn is classified as exempt from quota limits.
 */
export async function refundQuota(
  chatId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await db.transaction('rw', db.telegramWhitelist, async () => {
    const user = await db.telegramWhitelist.get(chatId);
    if (!user) return;
    const usedToday = Math.max(0, (user.usedToday || 0) - 1);
    await db.telegramWhitelist.put({
      ...user,
      usedToday,
      updatedAt: new Date().toISOString(),
    });
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

