import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db';
import {
  getNineRouterApiKey,
  setNineRouterApiKey,
  forgetNineRouterApiKey,
  getNineRouterConfig,
  setNineRouterConfig,
  clearNineRouterMemoryCache,
} from '../../src/services/ai/nineRouterTokenService';

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
});
