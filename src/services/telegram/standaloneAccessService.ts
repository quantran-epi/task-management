import { z } from 'zod';
import type { TaskPlannerDatabase } from '../../db';
import { isTauriApp } from '../../utils/timerPopout';
import {
  clearDevicePolicy,
  loadDevicePolicy,
  parsePolicyPayload,
  saveDevicePolicy,
} from './telegramDevicePolicy';

// Bridge là điều khiển local trên cùng máy, không phải chữ ký/mật mã học.
export const ACCESS_STATE_SETTINGS_KEY = 'telegram:accessState';
export const STANDALONE_ACCESS_POLL_MS = 2000;

const identitySchema = z.string().regex(/^\d{6,12}$/, 'Telegram User ID không hợp lệ (cần 6-12 chữ số).');

const accessStatusSchema = z.enum(['pending', 'approved', 'denied', 'revoked']);
export type StandaloneAccessStatus = z.infer<typeof accessStatusSchema> | 'expired';

const bridgeRecordSchema = z.object({
  telegramUserId: identitySchema,
  status: accessStatusSchema,
  requestedAt: z.string().optional(),
  policyToken: z.string().optional(),
  issuedAt: z.string().optional(),
  updatedAt: z.string(),
});

export type StandaloneAccessRecord = z.infer<typeof bridgeRecordSchema>;

const accessStateSchema = z.object({
  status: accessStatusSchema.or(z.literal('expired')),
  telegramUserId: identitySchema,
  requestedAt: z.string().optional(),
});

export interface StandaloneAccessState extends z.infer<typeof accessStateSchema> {}

function identity(input: string): string {
  return identitySchema.parse(input.trim());
}

async function invokeBridge<T>(command: string, args: Record<string, unknown>): Promise<T | undefined> {
  if (!isTauriApp()) return undefined;
  const { invoke } = await import('@tauri-apps/api/core');
  return await invoke<T>(command, args);
}

/** Ghi record pending lên bridge và lưu trạng thái local; browser chỉ lưu state. */
export async function requestStandaloneAccess(
  db: TaskPlannerDatabase,
  telegramUserId: string,
  requestedAt = new Date().toISOString()
): Promise<void> {
  const id = identity(telegramUserId);
  await invokeBridge('standalone_access_request', { telegramUserId: id, requestedAt });
  await saveAccessState(db, { status: 'pending', telegramUserId: id, requestedAt });
}

export async function saveAccessState(db: TaskPlannerDatabase, state: StandaloneAccessState): Promise<void> {
  await db.settings.put({ key: ACCESS_STATE_SETTINGS_KEY, value: accessStateSchema.parse(state) });
}

export async function readAccessState(db: TaskPlannerDatabase): Promise<StandaloneAccessState | undefined> {
  const row = await db.settings.get(ACCESS_STATE_SETTINGS_KEY);
  const parsed = accessStateSchema.safeParse(row?.value);
  return parsed.success ? parsed.data : undefined;
}

/** Gỡ liên kết: marker revoked trên bridge, xoá policy và state local ngay. */
export async function clearStandaloneAccess(db: TaskPlannerDatabase, telegramUserId: string): Promise<void> {
  const id = identity(telegramUserId);
  await invokeBridge('standalone_access_apply', { telegramUserId: id, status: 'revoked' });
  await clearDevicePolicy(db);
  await db.settings.delete(ACCESS_STATE_SETTINGS_KEY);
}

/**
 * Poll bridge mỗi 2s. Approved + token hợp lệ + issuedAt mới hơn policy cache -> save policy.
 * Các trạng thái khác clear policy. Khi record mất, giữ policy cache còn hạn (offline).
 * Trả cleanup function cho interval.
 */
export function pollStandaloneAccess(
  db: TaskPlannerDatabase,
  telegramUserId: string,
  onState?: (state: StandaloneAccessState) => void
): () => void {
  if (!isTauriApp()) return () => {};

  const id = identity(telegramUserId);
  let active = true;

  const poll = async () => {
    try {
      const records = await invokeBridge<unknown[]>('standalone_access_list', {});
      if (!active || !records) return;
      const record = bridgeRecordSchema.safeParse(
        records.find((value) => {
          const candidate = value as { telegramUserId?: unknown } | null;
          return candidate?.telegramUserId === id;
        })
      );
      if (!record.success) return;
      await applyBridgeRecord(db, id, record.data, onState);
    } catch {
      // Bridge unavailable: keep cached policy, expiry still enforced by parsePolicyPayload.
    }
  };

  const timer = setInterval(() => { void poll(); }, STANDALONE_ACCESS_POLL_MS);
  return () => {
    active = false;
    clearInterval(timer);
  };
}

/** Một lần poll ngay (dùng khi cần đồng bộ tức thì, không tạo interval). */
export async function pollStandaloneAccessOnce(
  db: TaskPlannerDatabase,
  telegramUserId: string,
  onState?: (state: StandaloneAccessState) => void
): Promise<void> {
  if (!isTauriApp()) return;
  const id = identity(telegramUserId);
  const records = await invokeBridge<unknown[]>('standalone_access_list', {});
  if (!records) return;
  const record = bridgeRecordSchema.safeParse(
    records.find((value) => (value as { telegramUserId?: unknown } | null)?.telegramUserId === id)
  );
  if (record.success) await applyBridgeRecord(db, id, record.data, onState);
}

async function applyBridgeRecord(
  db: TaskPlannerDatabase,
  id: string,
  record: StandaloneAccessRecord,
  onState?: (state: StandaloneAccessState) => void
): Promise<void> {
  if (record.status === 'approved') {
    if (!record.policyToken) return;
    let policy;
    try {
      policy = parsePolicyPayload(record.policyToken);
    } catch {
      return; // Token hỏng/expired: không nâng quyền.
    }
    if (policy.telegramUserId !== id) return;
    const cached = await loadDevicePolicy(db);
    if (cached?.issuedAt && policy.issuedAt <= cached.issuedAt) return;
    await saveDevicePolicy(db, policy);
    await saveAccessState(db, { status: 'approved', telegramUserId: id, requestedAt: record.requestedAt });
    onState?.({ status: 'approved', telegramUserId: id });
    return;
  }

  await clearDevicePolicy(db);
  const state: StandaloneAccessState = {
    status: record.status,
    telegramUserId: id,
    ...(record.requestedAt ? { requestedAt: record.requestedAt } : {}),
  };
  await saveAccessState(db, state);
  onState?.(state);
}
