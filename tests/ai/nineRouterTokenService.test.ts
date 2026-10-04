import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db';
import {
  getNineRouterApiKey,
  setNineRouterApiKey,
  forgetNineRouterApiKey,
  getNineRouterConfig,
  setNineRouterConfig,
  clearNineRouterMemoryCache,
  fetchAvailableModels,
} from '../../src/services/ai/nineRouterTokenService';
import * as nineRouterClient from '../../src/services/ai/nineRouterClient';

vi.mock('../../src/utils/timerPopout', () => ({
  isTauriApp: vi.fn(() => false),
}));

vi.mock('../../src/services/keyringService', () => ({
  KEYRING_KEYS: {
    NINEROUTER_API_KEY: 'ninerouter_api_key',
  },
  getKeyringCredential: vi.fn(),
  storeKeyringCredential: vi.fn(),
  deleteKeyringCredential: vi.fn(),
}));

describe('nineRouterTokenService (Web mode)', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    clearNineRouterMemoryCache();
    db = new TaskPlannerDatabase(`test-ninerouter-token-${Date.now()}-${Math.random()}`);
  });

  it('stores and retrieves API key in Dexie settings on Web', async () => {
    let key = await getNineRouterApiKey(db);
    expect(key).toBe('');

    await setNineRouterApiKey('nr-test-secret-key-12345', db);
    key = await getNineRouterApiKey(db);
    expect(key).toBe('nr-test-secret-key-12345');

    // Confirm stored in Dexie settings
    const setting = await db.settings.get('ninerouter_api_key');
    expect(setting?.value).toBe('nr-test-secret-key-12345');

    await forgetNineRouterApiKey(db);
    key = await getNineRouterApiKey(db);
    expect(key).toBe('');
    expect(await db.settings.get('ninerouter_api_key')).toBeUndefined();
  });

  it('reads and writes endpoint and model config from db.settings', async () => {
    const defaultConfig = await getNineRouterConfig(db);
    expect(defaultConfig.endpoint).toBe('http://localhost:20128');
    expect(defaultConfig.defaultModel).toBe('gpt-4o');

    await setNineRouterConfig(
      {
        endpoint: 'https://custom.router.com/v1',
        defaultModel: 'claude-3-5-sonnet',
      },
      db
    );

    const updated = await getNineRouterConfig(db);
    expect(updated.endpoint).toBe('https://custom.router.com/v1');
    expect(updated.defaultModel).toBe('claude-3-5-sonnet');
  });

  it('supports freely configurable charLimit (including large limits for frontier models)', async () => {
    // Default limit
    const initialConfig = await getNineRouterConfig(db);
    expect(initialConfig.charLimit).toBe(12000);

    // Set large frontier model budget (500k chars ~ 125k tokens)
    await setNineRouterConfig({ charLimit: 500000 }, db);
    const updated = await getNineRouterConfig(db);
    expect(updated.charLimit).toBe(500000);

    // Set 1M chars ~ 250k tokens
    await setNineRouterConfig({ charLimit: 1000000 }, db);
    const largeConfig = await getNineRouterConfig(db);
    expect(largeConfig.charLimit).toBe(1000000);
  });

  it('fetchAvailableModels calls testNineRouterConnection and caches results to db.settings', async () => {
    const testSpy = vi.spyOn(nineRouterClient, 'testNineRouterConnection').mockResolvedValue({
      ok: true,
      status: 200,
      models: ['cc-high', 'ag/claude-sonnet-4-6'],
    });

    const models = await fetchAvailableModels(db);
    expect(testSpy).toHaveBeenCalled();
    expect(models).toEqual(['cc-high', 'ag/claude-sonnet-4-6']);

    const cached = await db.settings.get('ninerouter_cached_models');
    expect(cached?.value).toEqual(['cc-high', 'ag/claude-sonnet-4-6']);
  });

  it('fetchAvailableModels falls back to cached models if network call fails', async () => {
    await db.settings.put({
      key: 'ninerouter_cached_models',
      value: ['fallback-model-1'],
    });

    vi.spyOn(nineRouterClient, 'testNineRouterConnection').mockRejectedValue(new Error('Network error'));

    const models = await fetchAvailableModels(db);
    expect(models).toEqual(['fallback-model-1']);
  });
});
