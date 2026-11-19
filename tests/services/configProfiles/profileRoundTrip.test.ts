import 'fake-indexeddb/auto';
import { describe, expect, it, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../../src/db';
import type { ConfigurationProfile } from '../../../src/services/configProfiles/types';
import {
  buildProfileExportPayload,
} from '../../../src/services/configProfiles/exportProfile';
import {
  applyConfigProfile,
  getProfiles,
  saveProfiles,
  CONFIGURATION_PROFILES_SETTING_KEY,
} from '../../../src/services/configProfiles/importProfile';
import { GHOST_DEV_CONFIG_KEY } from '../../../src/services/agents/ghostDevConfig';
import { validateConfigProfilePayload } from '../../../src/validation/configProfileSchemas';

const SECRET_VALUE = 'sk-live-tracer-secret-abc123';
const TELEGRAM_TOKEN = '123456:AA-tracer-telegram-token';

function makeProfile(): ConfigurationProfile {
  return {
    id: 'profile-tracer-1',
    name: 'Cấu hình tracer',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    config: {
      settings: {
        github_owner: 'example-owner',
        github_repo: 'example-repo',
        ninerouter_api_key: SECRET_VALUE,
      },
      capacityRules: [{ dayOfWeek: 1, workMinutes: 420 }],
      capacityOverrides: [{ date: '2026-11-23', workMinutes: 0, note: 'nghỉ' }],
      ghostDevConfig: {
        masterModel: 'sonnet',
        workerModel: 'haiku',
        concurrencyCap: 6,
        claudePath: '/usr/local/bin/claude',
      },
      secretFields: {},
    },
  };
}

describe('configuration profile round trip (tracer)', () => {
  const dbs: TaskPlannerDatabase[] = [];
  afterEach(async () => {
    for (const db of dbs.splice(0)) {
      await db.delete();
    }
    localStorage.removeItem(GHOST_DEV_CONFIG_KEY);
  });

  it('exports with blank secrets and imports key-by-key without touching Telegram', async () => {
    const db = new TaskPlannerDatabase('ProfileRoundTrip_' + Math.random());
    dbs.push(db);
    await db.settings.bulkPut([
      { key: 'github_owner', value: 'old-owner' },
      { key: 'ninerouter_api_key', value: 'recipient-real-secret' },
      { key: 'notification_settings', value: { dueSoonDays: 3 } },
    ]);
    await db.capacityRules.add({ id: 'existing-rule', dayOfWeek: 1, workMinutes: 480 });
    await db.capacityOverrides.add({ id: 'existing-override', date: '2026-11-23', workMinutes: 480 });
    const telegramRow = {
      id: 'default' as const,
      botToken: TELEGRAM_TOKEN,
      isEnabled: true,
      autoStartOnLaunch: false,
      defaultScope: 'full' as const,
      maxHistoryTurns: 7,
    };
    await db.telegramSettings.put(telegramRow);

    const profile = makeProfile();
    await saveProfiles([profile], db);

    const payload = buildProfileExportPayload(profile, () => '2026-11-19T00:00:00.000Z');
    const json = JSON.stringify(payload);
    expect(json).not.toContain(SECRET_VALUE);
    expect(json).not.toContain('telegramSettings');
    expect(payload.profile.config.secretFields.ninerouter_api_key).toBe('');

    const validation = validateConfigProfilePayload(JSON.parse(json));
    expect(validation.valid).toBe(true);
    if (!validation.valid) throw new Error(validation.errors.map((e) => e.message).join('; '));

    const result = await applyConfigProfile(JSON.parse(json), db);
    expect(result.applied).toBe(true);

    expect((await db.settings.get('github_owner'))?.value).toBe('example-owner');
    expect((await db.settings.get('ninerouter_api_key'))?.value).toBe('recipient-real-secret');
    expect((await db.settings.get('notification_settings'))?.value).toEqual({ dueSoonDays: 3 });
    // CR-01/WR-02: profile import is a key-by-key merge and never replaces the shared
    // backup snapshot used by rollback/download.
    expect(await db.settings.get('last_pre_import_snapshot')).toBeUndefined();
    expect(await db.settings.get('last_profile_import_snapshot')).toBeUndefined();

    const rules = await db.capacityRules.toArray();
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ dayOfWeek: 1, workMinutes: 420 });
    const overrides = await db.capacityOverrides.toArray();
    expect(overrides).toHaveLength(1);
    expect(overrides[0]).toMatchObject({ date: '2026-11-23', workMinutes: 0, note: 'nghỉ' });

    expect(JSON.parse(localStorage.getItem(GHOST_DEV_CONFIG_KEY) ?? '{}')).toMatchObject({
      masterModel: 'sonnet',
      claudePath: '/usr/local/bin/claude',
    });

    expect(await db.telegramSettings.get('default')).toEqual(telegramRow);
    expect((await db.settings.get(CONFIGURATION_PROFILES_SETTING_KEY))?.value).toEqual([profile]);
    expect((await getProfiles(db))[0]?.name).toBe('Cấu hình tracer');
  });
});
