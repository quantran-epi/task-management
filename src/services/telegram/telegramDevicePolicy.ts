import { z } from 'zod';
import type { TaskPlannerDatabase } from '../../db/index';
import type { TelegramDeviceStatus, TelegramWhitelistUser } from './telegramTypes';

// Policy là client-side qua Telegram; không phải chữ ký/mật mã học.
export const POLICY_TOKEN_PREFIX = 'TMMATE_POLICY_V1:';
export const DEVICE_POLICY_SETTINGS_KEY = 'telegram:devicePolicy';

const remoteSettingsSchema = z.strictObject({
  defaultModel: z.string().min(1).optional(),
  maxHistoryTurns: z.number().int().nonnegative().optional(),
  dataScope: z.enum(['full', 'knowledge_only', 'tasks_only', 'pure_llm']).optional(),
});

export const devicePolicySchema = z.strictObject({
  version: z.literal(1),
  telegramUserId: z.string().min(1),
  status: z.literal('approved'),
  allowedModels: z.array(z.string().min(1)).nonempty(),
  remoteSettings: remoteSettingsSchema,
  issuedAt: z.string().min(1),
  expiresAt: z.string().min(1),
});

export type TelegramDevicePolicy = z.infer<typeof devicePolicySchema>;
export type PolicyState = 'unmanaged' | 'active' | 'expired' | 'blocked';

function encodeToken(value: unknown): string {
  const json = JSON.stringify(value);
  const base64 = btoa(unescape(encodeURIComponent(json)));
  return `${POLICY_TOKEN_PREFIX}${base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

export function buildPolicyPayload(
  row: TelegramWhitelistUser,
  expiresAt: string,
  status: TelegramDeviceStatus = 'approved'
): string {
  if (row.deviceStatus !== 'approved' || status !== 'approved') {
    throw new Error('Thiết bị chưa được duyệt, không thể phát policy.');
  }
  if (!row.telegramUserId?.trim()) {
    throw new Error('Thiếu Telegram User ID, không thể phát policy.');
  }
  if (!row.allowedModels?.length) {
    throw new Error('Thiếu whitelist model, không thể phát policy.');
  }

  return encodeToken({
    version: 1,
    telegramUserId: row.telegramUserId,
    status: 'approved',
    allowedModels: row.allowedModels,
    remoteSettings: row.remoteSettings ?? {},
    issuedAt: new Date().toISOString(),
    expiresAt,
  });
}

export function parsePolicyPayload(text: string): TelegramDevicePolicy {
  const token = text.match(/TMMATE_POLICY_V1:([A-Za-z0-9_-]+)/)?.[1];
  if (!token) throw new Error('Không tìm thấy token policy TMMATE_POLICY_V1 trong nội dung đã dán.');

  const padded = token.replace(/-/g, '+').replace(/_/g, '/');
  const base64 = padded + '='.repeat((4 - (padded.length % 4)) % 4);
  let json: string;
  try {
    json = decodeURIComponent(escape(atob(base64)));
  } catch {
    throw new Error('Token policy không phải base64 hợp lệ.');
  }

  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('Nội dung policy không phải JSON hợp lệ.');
  }

  const parsed = devicePolicySchema.parse(raw);
  if (Date.parse(parsed.expiresAt) <= Date.now()) {
    throw new Error('Policy đã hết hạn. Nhờ admin gửi /policy mới.');
  }
  return parsed;
}

export function isModelAllowed(policy: TelegramDevicePolicy | undefined, model: string): boolean {
  if (!policy || policy.status !== 'approved') return false;
  if (Date.parse(policy.expiresAt) <= Date.now()) return false;
  return policy.allowedModels.includes(model.trim());
}

// standalone hiện chưa áp dụng remoteSettings (defaultModel/maxHistoryTurns/dataScope); helper
// chỉ trả config để sau này wired vào send boundary. Policy vẫn khóa model qua isModelAllowed.
export function resolveEffectiveChatConfig<T extends { defaultModel: string }>(
  local: T,
  policy: TelegramDevicePolicy | undefined
): T & { policyState: PolicyState } {
  if (!policy) return { ...local, policyState: 'unmanaged' };
  if (Date.parse(policy.expiresAt) <= Date.now() || policy.status !== 'approved') {
    return { ...local, policyState: 'expired' };
  }

  const { defaultModel, maxHistoryTurns, dataScope } = policy.remoteSettings;
  return {
    ...local,
    ...(defaultModel !== undefined ? { defaultModel } : {}),
    ...(maxHistoryTurns !== undefined ? { maxHistoryTurns } : {}),
    ...(dataScope !== undefined ? { dataScope } : {}),
    policyState: 'active',
  } as T & { policyState: PolicyState };
}

export async function saveDevicePolicy(
  db: TaskPlannerDatabase,
  policy: TelegramDevicePolicy
): Promise<void> {
  await db.settings.put({ key: DEVICE_POLICY_SETTINGS_KEY, value: policy });
}

export async function loadDevicePolicy(db: TaskPlannerDatabase): Promise<TelegramDevicePolicy | undefined> {
  const row = await db.settings.get(DEVICE_POLICY_SETTINGS_KEY);
  if (!row) return undefined;
  const parsed = devicePolicySchema.safeParse(row.value);
  return parsed.success ? parsed.data : undefined;
}

export async function clearDevicePolicy(db: TaskPlannerDatabase): Promise<void> {
  await db.settings.delete(DEVICE_POLICY_SETTINGS_KEY);
}
