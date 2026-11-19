import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TaskPlannerDatabase } from '../../../src/db';
import type { ConfigurationProfile } from '../../../src/services/configProfiles/types';
import {
  buildProfileExportPayload,
  exportProfileToFile,
} from '../../../src/services/configProfiles/exportProfile';
import { getSecretFields } from '../../../src/services/configProfiles/catalog';
import { isSafeBackupSetting } from '../../../src/services/backup/exportBackup';

const SECRET = 'sk-live-export-secret-9999';
const TELEGRAM = 'telegram-token-must-not-appear';

function profile(): ConfigurationProfile {
  return {
    id: 'profile-export-1',
    name: 'Cấu hình / thử nghiệm',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    config: {
      settings: {
        ninerouter_api_key: SECRET,
        jira_api_token: SECRET,
        github_owner: 'acme-owner',
        knowledge_server_base_url: 'http://127.0.0.1:3001',
        global_conventions: 'no execution during import',
      },
      capacityRules: [{ dayOfWeek: 1, workMinutes: 480 }],
      capacityOverrides: [],
      ghostDevConfig: {
        masterModel: 'sonnet',
        workerModel: 'haiku',
        concurrencyCap: 6,
        claudePath: '/opt/claude/bin',
      },
      secretFields: {},
    },
  };
}

describe('exportProfile hardening', () => {
  const dbs: TaskPlannerDatabase[] = [];
  afterEach(() => {
    for (const db of dbs.splice(0)) void db.delete();
    delete (window as any).showSaveFilePicker;
    vi.restoreAllMocks();
  });

  it('blanks every catalog secret, preserves machine values and omits Telegram', () => {
    const db = new TaskPlannerDatabase('ExportProfile_' + Math.random());
    dbs.push(db);
    void db.settings.put({ key: 'ninerouter_api_key', value: SECRET });
    void db.settings.put({ key: 'telegramSettings', value: { botToken: TELEGRAM } });

    const payload = buildProfileExportPayload(profile(), () => '2026-11-19T00:00:00.000Z');
    const json = JSON.stringify(payload);
    expect(json).not.toContain(SECRET);
    expect(json).not.toContain(TELEGRAM);
    expect(json).not.toContain('telegramSettings');
    for (const key of getSecretFields()) {
      if (key in payload.profile.config.settings) {
        expect(payload.profile.config.settings[key]).toBe('');
      }
      if (key in payload.profile.config.secretFields) {
        expect(payload.profile.config.secretFields[key]).toBe('');
      }
    }
    expect(payload.profile.config.settings.github_owner).toBe('acme-owner');
    expect(payload.profile.config.settings.knowledge_server_base_url).toBe('http://127.0.0.1:3001');
    expect(payload.profile.config.ghostDevConfig?.claudePath).toBe('/opt/claude/bin');
  });

  it('saves one profile through the picker with a .json filter and the profile name', async () => {
    const writable = { write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };
    const handle = { createWritable: vi.fn().mockResolvedValue(writable) };
    const picker = vi.fn().mockResolvedValue(handle);
    (window as any).showSaveFilePicker = picker;

    const result = await exportProfileToFile(profile());
    expect(result.saved).toBe(true);
    expect(picker).toHaveBeenCalledWith(expect.objectContaining({ suggestedName: 'Cấu hình _ thử nghiệm.json' }));
    const blob = writable.write.mock.calls[0]?.[0] as Blob;
    expect(blob.type).toBe('application/json');
    const text = await blob.text();
    expect(text).not.toContain(SECRET);
    expect(JSON.parse(text).profile.name).toBe('Cấu hình / thử nghiệm');
  });

  it('denylists the profile list from plaintext backups', () => {
    expect(isSafeBackupSetting('configuration_profiles')).toBe(false);
  });
});
