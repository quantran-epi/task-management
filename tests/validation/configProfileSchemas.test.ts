import { describe, expect, it, vi } from 'vitest';
import { validateConfigProfilePayload } from '../../src/validation/configProfileSchemas';
import { buildDefaultProfileConfig } from '../../src/services/configProfiles/defaults';
import {
  PROFILE_KEY_CATALOG,
  getSecretFields,
  getMachineSpecificFields,
} from '../../src/services/configProfiles/catalog';
import { db } from '../../src/db';

function fixture() {
  return {
    app: 'taskmate-config-profile',
    profileSchemaVersion: 1,
    exportedAt: '2026-11-19T00:00:00.000Z',
    profile: {
      id: 'p-1',
      name: 'Profile',
      createdAt: '2026-11-19T00:00:00.000Z',
      updatedAt: '2026-11-19T00:00:00.000Z',
      config: {
        settings: { github_owner: 'acme', ninerouter_api_key: '' } as Record<string, unknown>,
        capacityRules: [{ dayOfWeek: 1, workMinutes: 480 }],
        capacityOverrides: [{ date: '2026-11-23', workMinutes: 0, note: 'nghỉ' }],
        ghostDevConfig: {
          masterModel: 'sonnet',
          workerModel: 'haiku',
          concurrencyCap: 6,
          claudePath: '/usr/local/bin/claude',
        },
        teamDefaults: { budgetTokens: 100000, budgetWarnThresholdPct: null },
        secretFields: { ninerouter_api_key: '' } as Record<string, ''>,
      },
    },
  };
}

describe('config profile schemas', () => {
  it('accepts a minimal valid profile', () => {
    expect(validateConfigProfilePayload(fixture()).valid).toBe(true);
  });

  it('rejects a backup envelope', () => {
    const result = validateConfigProfilePayload({
      app: 'personal-task-planner',
      schemaVersion: 13,
      exportedAt: '2026-11-19T00:00:00.000Z',
      tables: {},
      counts: {},
    });
    expect(result.valid).toBe(false);
  });

  it('rejects a non-empty secret field', () => {
    const payload = fixture();
    payload.profile.config.secretFields.ninerouter_api_key = 'real-secret' as never;
    expect(validateConfigProfilePayload(payload).valid).toBe(false);
  });

  it('accepts an empty *_token / *_key field', () => {
    const payload = fixture();
    payload.profile.config.settings.jira_api_token = '';
    payload.profile.config.secretFields.jira_api_token = '';
    expect(validateConfigProfilePayload(payload).valid).toBe(true);
  });

  it('rejects a non-blank secret-like key in config.settings (WR-01)', () => {
    const payload = fixture();
    payload.profile.config.settings.github_pat = 'attacker';
    const result = validateConfigProfilePayload(payload);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((error) => /secret/i.test(error.message))).toBe(true);
    }
  });

  it('accepts teamDefaults.budgetWarnThresholdPct: null', () => {
    expect(validateConfigProfilePayload(fixture()).valid).toBe(true);
  });

  it('rejects a telegramSettings section', () => {
    const payload = fixture() as unknown as Record<string, unknown>;
    const config = (payload.profile as Record<string, unknown>).config as Record<string, unknown>;
    config.telegramSettings = { botToken: '' };
    expect(validateConfigProfilePayload(payload).valid).toBe(false);
  });

  it('round-trips capacity rules/overrides and ghostDevConfig', () => {
    const result = validateConfigProfilePayload(fixture());
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.envelope.profile.config.capacityRules[0]).toEqual({ dayOfWeek: 1, workMinutes: 480 });
    expect(result.envelope.profile.config.capacityOverrides[0]?.note).toBe('nghỉ');
    expect(result.envelope.profile.config.ghostDevConfig?.claudePath).toBe('/usr/local/bin/claude');
  });

  it('classifies every research-inventory key exactly once, with Telegram excluded', () => {
    const inventory = [
      'github_owner', 'github_repo', 'github_branch', 'github_auto_sync_enabled',
      'github_auto_sync_mode', 'github_auto_sync_interval_minutes', 'github_auto_sync_daily_time',
      'jira_domain', 'jira_email', 'jira_cors_proxy', 'jira_default_project',
      'jira_default_issue_type', 'jira_status_mappings', 'jira_account_id',
      'ninerouter_endpoint', 'ninerouter_default_model', 'ninerouter_char_limit',
      'ninerouter_context_window_tokens', 'ninerouter_cached_models', 'image_endpoint',
      'image_model', 'image_cached_models', 'mcp_servers', 'graphiti_mcp_enabled',
      'graphiti_mcp_endpoint', 'global_conventions', 'ai_budget_warn_threshold_pct',
      'notification_settings', 'system_type_options', 'knowledge_server_enabled',
      'knowledge_server_base_url', 'jira_api_token', 'github_pat', 'github_token',
      'github_passphrase', 'backup_passphrase', 'ninerouter_api_key',
      'knowledge_server_token', 'image_api_key', 'ssh_configurations',
      'oracle_ai_tool_config_list', 'oracle_ai_tool_config', 'ai_teams_docs_root',
      'tauri_keyring_migrated', 'tauri_sqlite_queue', 'tauri_sqlite_last_flush_at',
      'tauri_sqlite_missing_path', 'tauri_sqlite_path', 'tauri_sqlite_enabled',
      'last_synced_sha', 'last_synced_at', 'github_auto_sync_last_run_at',
      'github_auto_sync_last_attempt_at', 'github_auto_sync_last_error',
      'github_auto_sync_state', 'github_auto_sync_dirty_since',
      'github_auto_sync_missed_due_at', 'last_pre_import_snapshot',
      'plannedAllocations', 'telegramSettings', 'telegramWhitelist',
      'configuration_profiles',
    ];
    for (const key of inventory) {
      expect(PROFILE_KEY_CATALOG[key], `missing catalog key: ${key}`).toBeDefined();
    }
    expect(PROFILE_KEY_CATALOG.telegramSettings).toBe('excluded');
    expect(PROFILE_KEY_CATALOG.telegramWhitelist).toBe('excluded');
    expect(PROFILE_KEY_CATALOG.plannedAllocations).toBe('excluded');
    expect(getSecretFields()).toContain('jira_api_token');
    expect(getMachineSpecificFields()).toContain('github_owner');
    expect(getMachineSpecificFields()).toContain('ghostDevConfig.claudePath');
  });
});

describe('default profile config purity', () => {
  it('reads no db, localStorage or keyring values and contains no Telegram default', async () => {
    const dbSpy = vi.spyOn(db.settings, 'get');
    const storageSpy = vi.spyOn(Storage.prototype, 'getItem');
    const config = buildDefaultProfileConfig();
    expect(dbSpy).not.toHaveBeenCalled();
    expect(storageSpy).not.toHaveBeenCalled();
    expect(JSON.stringify(config)).not.toContain('telegram');
    expect(config.capacityRules).toHaveLength(7);
    expect(config.capacityRules.filter((r) => r.workMinutes === 480)).toHaveLength(5);
    expect(config.secretFields.jira_api_token).toBe('');
    dbSpy.mockRestore();
    storageSpy.mockRestore();
  });
});
