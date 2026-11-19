import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TaskPlannerDatabase } from '../../../src/db';
import { GHOST_DEV_CONFIG_KEY } from '../../../src/services/agents/ghostDevConfig';
import {
  AI_TEAM_DEFAULTS_SETTING_KEY,
  applyConfigProfile,
} from '../../../src/services/configProfiles/importProfile';

const TELEGRAM = {
  id: 'default' as const,
  botToken: 'owner-machine-telegram-token',
  isEnabled: true,
  autoStartOnLaunch: false,
  defaultScope: 'full' as const,
  maxHistoryTurns: 9,
};

function envelope() {
  return {
    app: 'taskmate-config-profile',
    profileSchemaVersion: 1,
    exportedAt: '2026-11-19T00:00:00.000Z',
    profile: {
      id: 'p-import',
      name: 'Import profile',
      createdAt: '2026-11-19T00:00:00.000Z',
      updatedAt: '2026-11-19T00:00:00.000Z',
      config: {
        settings: {
          github_owner: 'new-owner',
          ninerouter_api_key: '',
          global_conventions: 'untrusted instruction text',
        },
        capacityRules: [{ dayOfWeek: 1, workMinutes: 420 }],
        capacityOverrides: [{ date: '2026-11-23', workMinutes: 0 }],
        ghostDevConfig: {
          masterModel: 'sonnet',
          workerModel: 'haiku',
          concurrencyCap: 6,
          claudePath: '/opt/new/claude',
        },
        teamDefaults: { budgetTokens: 100000, budgetWarnThresholdPct: null },
        secretFields: { ninerouter_api_key: '' as const },
      },
    },
  };
}

describe('importProfile hardening', () => {
  const dbs: TaskPlannerDatabase[] = [];
  afterEach(async () => {
    for (const db of dbs.splice(0)) await db.delete();
    localStorage.removeItem(GHOST_DEV_CONFIG_KEY);
  });

  function freshDb(): TaskPlannerDatabase {
    const db = new TaskPlannerDatabase('ImportProfile_' + Math.random());
    dbs.push(db);
    return db;
  }

  it('merges key-by-key, skips blank secrets and never replaces the shared snapshot', async () => {
    const db = freshDb();
    const backupSnapshot = {
      timestamp: '2026-11-18T00:00:00.000Z',
      tables: { settings: [{ key: 'github_owner', value: 'backup-time-owner' }] },
      counts: { settings: 1 },
    };
    await db.settings.bulkPut([
      { key: 'github_owner', value: 'old-owner' },
      { key: 'ninerouter_api_key', value: 'recipient-real-secret' },
      { key: 'notification_settings', value: { dueSoonDays: 5 } },
      { key: 'last_pre_import_snapshot', value: backupSnapshot },
    ]);
    const result = await applyConfigProfile(envelope(), db);
    expect(result.applied).toBe(true);
    expect(result.skippedBlankSecrets).toContain('ninerouter_api_key');
    expect((await db.settings.get('github_owner'))?.value).toBe('new-owner');
    expect((await db.settings.get('ninerouter_api_key'))?.value).toBe('recipient-real-secret');
    expect((await db.settings.get('notification_settings'))?.value).toEqual({ dueSoonDays: 5 });
    // CR-01/WR-02: the backup snapshot stays byte-for-byte valid and unchanged.
    expect((await db.settings.get('last_pre_import_snapshot'))?.value).toEqual(backupSnapshot);
    expect((await db.settings.get('last_profile_import_snapshot'))).toBeUndefined();
    // No secret value is copied into any NEW row written by profile import.
    for (const key of result.appliedSettingKeys) {
      expect(JSON.stringify(await db.settings.get(key))).not.toContain('recipient-real-secret');
    }
  });

  it('rejects every secret-like setting key regardless of value (CR-01/WR-01/WR-02)', async () => {
    const db = freshDb();
    await db.settings.put({ key: 'github_pat', value: 'recipient-real-pat' });
    const payload = envelope() as unknown as Record<string, unknown>;
    const config = (payload.profile as Record<string, unknown>).config as Record<string, unknown>;
    const settings = config.settings as Record<string, unknown>;
    settings.github_pat = 'attacker-supplied-secret';
    // Non-blank secret-like keys are rejected at the schema trust boundary (WR-01) with
    // zero writes, while `applyConfigProfile` also skips secret-like keys regardless of value.
    const result = await applyConfigProfile(payload, db);
    expect(result.applied).toBe(false);
    expect(result.errors.some((error) => /secret/i.test(error.message))).toBe(true);
    expect((await db.settings.get('github_pat'))?.value).toBe('recipient-real-pat');
    expect((await db.settings.get('ninerouter_api_key'))?.value).toBeUndefined();
    const allSettings = JSON.stringify(await db.settings.toArray());
    expect(allSettings).not.toContain('attacker-supplied-secret');
  });

  it('persists teamDefaults as a portable template row (WR-03)', async () => {
    const db = freshDb();
    const payload = envelope() as unknown as Record<string, unknown>;
    const config = (payload.profile as Record<string, unknown>).config as Record<string, unknown>;
    config.teamDefaults = {
      budgetTokens: 250000,
      concurrencyLimit: 5,
      autoSplitEnabled: true,
      autoApproveMutations: false,
      mcpEnabled: true,
      sshFsToolsEnabled: false,
      oracleToolsEnabled: true,
      budgetWarnThresholdPct: 70,
    };

    const result = await applyConfigProfile(payload, db);
    expect(result.applied).toBe(true);
    expect((await db.settings.get(AI_TEAM_DEFAULTS_SETTING_KEY))?.value).toEqual(config.teamDefaults);
    expect(result.appliedSettingKeys).toContain(AI_TEAM_DEFAULTS_SETTING_KEY);
  });

  it('upserts capacity rows by natural key with no duplicates on double import', async () => {
    const db = freshDb();
    await applyConfigProfile(envelope(), db);
    await applyConfigProfile(envelope(), db);
    const rules = await db.capacityRules.toArray();
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ dayOfWeek: 1, workMinutes: 420 });
    const overrides = await db.capacityOverrides.toArray();
    expect(overrides).toHaveLength(1);
    expect(overrides[0]).toMatchObject({ date: '2026-11-23', workMinutes: 0 });
  });

  it('writes Ghost Dev localStorage when available, skipping cleanly when absent', async () => {
    const db = freshDb();
    await applyConfigProfile(envelope(), db);
    expect(JSON.parse(localStorage.getItem(GHOST_DEV_CONFIG_KEY) ?? '{}')).toMatchObject({
      claudePath: '/opt/new/claude',
    });

    const original = globalThis.window;
    // @ts-expect-error simulate a non-browser environment
    globalThis.window = undefined;
    try {
      const db2 = freshDb();
      const result = await applyConfigProfile(envelope(), db2);
      expect(result.applied).toBe(true);
    } finally {
      globalThis.window = original;
    }
  });

  it('never reads or writes the Telegram row', async () => {
    const db = freshDb();
    await db.telegramSettings.put(TELEGRAM);
    const tableSpy = vi.spyOn(db.telegramSettings, 'put');
    await applyConfigProfile(envelope(), db);
    expect(tableSpy).not.toHaveBeenCalled();
    expect(await db.telegramSettings.get('default')).toEqual(TELEGRAM);
    tableSpy.mockRestore();
  });

  it('writes nothing on invalid input', async () => {
    const db = freshDb();
    await db.settings.put({ key: 'github_owner', value: 'keep-me' });
    const payload = envelope() as unknown as Record<string, unknown>;
    const config = (payload.profile as Record<string, unknown>).config as Record<string, unknown>;
    config.telegramSettings = { botToken: 'evil' };

    const result = await applyConfigProfile(payload, db);
    expect(result.applied).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect((await db.settings.get('github_owner'))?.value).toBe('keep-me');
    expect(await db.settings.get('last_pre_import_snapshot')).toBeUndefined();
    expect(await db.capacityRules.count()).toBe(0);
    expect(await db.capacityOverrides.count()).toBe(0);
  });
});
