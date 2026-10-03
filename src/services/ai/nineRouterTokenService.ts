import { isTauriApp } from '../../utils/timerPopout';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import {
  KEYRING_KEYS,
  getKeyringCredential,
  storeKeyringCredential,
  deleteKeyringCredential,
} from '../keyringService';
import type { NineRouterConfig } from './types';
import { testNineRouterConnection } from './nineRouterClient';

export const DEFAULT_NINEROUTER_ENDPOINT = 'http://localhost:20128';
export const DEFAULT_NINEROUTER_MODEL = 'gpt-4o';
export const DEFAULT_NINEROUTER_CHAR_LIMIT = 12000;

// Module-level in-memory cache for fast read during UI interactions
let memoryNineRouterApiKey: string | null = null;

export function clearNineRouterMemoryCache(): void {
  memoryNineRouterApiKey = null;
}

export async function getNineRouterApiKey(
  db: TaskPlannerDatabase = defaultDb
): Promise<string> {
  if (memoryNineRouterApiKey !== null) {
    return memoryNineRouterApiKey;
  }

  if (isTauriApp()) {
    const key = await getKeyringCredential(KEYRING_KEYS.NINEROUTER_API_KEY);
    if (key) {
      memoryNineRouterApiKey = key;
      return key;
    }
  }

  // Fallback to IndexedDB (Web/PWA)
  const rec = await db.settings.get('ninerouter_api_key');
  const key = typeof rec?.value === 'string' ? rec.value : '';
  if (key) {
    memoryNineRouterApiKey = key;
  }
  return key;
}

export async function setNineRouterApiKey(
  key: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  const trimmed = key.trim();
  memoryNineRouterApiKey = trimmed;

  if (isTauriApp()) {
    if (trimmed) {
      await storeKeyringCredential(KEYRING_KEYS.NINEROUTER_API_KEY, trimmed);
    } else {
      await deleteKeyringCredential(KEYRING_KEYS.NINEROUTER_API_KEY);
    }
    await db.settings.delete('ninerouter_api_key');
  } else {
    if (trimmed) {
      await db.settings.put({ key: 'ninerouter_api_key', value: trimmed });
    } else {
      await db.settings.delete('ninerouter_api_key');
    }
  }
}

export async function forgetNineRouterApiKey(
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  memoryNineRouterApiKey = '';
  if (isTauriApp()) {
    await deleteKeyringCredential(KEYRING_KEYS.NINEROUTER_API_KEY);
  }
  await db.settings.delete('ninerouter_api_key');
}

export async function isNineRouterApiKeyStored(
  db: TaskPlannerDatabase = defaultDb
): Promise<boolean> {
  if (memoryNineRouterApiKey && memoryNineRouterApiKey.length > 0) return true;
  if (isTauriApp()) {
    const cred = await getKeyringCredential(KEYRING_KEYS.NINEROUTER_API_KEY);
    if (cred) {
      memoryNineRouterApiKey = cred;
      return true;
    }
  }
  const rec = await db.settings.get('ninerouter_api_key');
  return typeof rec?.value === 'string' && rec.value.trim().length > 0;
}

export async function getNineRouterConfig(
  db: TaskPlannerDatabase = defaultDb
): Promise<NineRouterConfig> {
  const [endpointRec, modelRec, charLimitRec] = await Promise.all([
    db.settings.get('ninerouter_endpoint'),
    db.settings.get('ninerouter_default_model'),
    db.settings.get('ninerouter_char_limit'),
  ]);

  return {
    endpoint:
      typeof endpointRec?.value === 'string' && endpointRec.value.trim()
        ? endpointRec.value.trim()
        : DEFAULT_NINEROUTER_ENDPOINT,
    defaultModel:
      typeof modelRec?.value === 'string' && modelRec.value.trim()
        ? modelRec.value.trim()
        : DEFAULT_NINEROUTER_MODEL,
    charLimit:
      typeof charLimitRec?.value === 'number' && charLimitRec.value > 0
        ? charLimitRec.value
        : DEFAULT_NINEROUTER_CHAR_LIMIT,
  };
}

export async function setNineRouterConfig(
  config: Partial<NineRouterConfig>,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  if (config.endpoint !== undefined) {
    const cleaned = config.endpoint.trim().replace(/\/+$/, '');
    await db.settings.put({ key: 'ninerouter_endpoint', value: cleaned });
  }
  if (config.defaultModel !== undefined) {
    await db.settings.put({
      key: 'ninerouter_default_model',
      value: config.defaultModel.trim(),
    });
  }
  if (config.charLimit !== undefined) {
    await db.settings.put({
      key: 'ninerouter_char_limit',
      value: config.charLimit,
    });
  }
}

export async function fetchAvailableModels(
  db: TaskPlannerDatabase = defaultDb
): Promise<string[]> {
  const config = await getNineRouterConfig(db);
  const apiKey = await getNineRouterApiKey(db);

  try {
    const res = await testNineRouterConnection({
      endpoint: config.endpoint,
      apiKey: apiKey || '',
    });
    if (res.ok && Array.isArray(res.models) && res.models.length > 0) {
      await db.settings.put({
        key: 'ninerouter_cached_models',
        value: res.models,
      });
      return res.models;
    }
  } catch (err) {
    console.warn('[nineRouter] fetchAvailableModels failed:', err);
  }

  const rec = await db.settings.get('ninerouter_cached_models');
  if (Array.isArray(rec?.value) && rec.value.length > 0) {
    return rec.value as string[];
  }
  return [];
}
