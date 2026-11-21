import {
  UNSAFE_OR_EPHEMERAL_SETTING_KEYS,
  isSafeBackupSetting,
} from '../backup/exportBackup';
import { KEYRING_KEYS } from '../keyringService';
import { SSH_CONFIGS_SETTING_KEY } from '../../types/ssh';
import {
  ORACLE_TOOL_CONFIG_KEY,
  ORACLE_TOOL_CONFIG_LIST_KEY,
} from '../../types/oracleSqlcl';
import { CONFIGURATION_PROFILES_SETTING_KEY } from './importProfile';

export type ProfileKeyClassification =
  | 'portable'
  | 'secret-blank'
  | 'machine-specific'
  | 'excluded';

/**
 * Complete inventory of settings keys from 46-RESEARCH §1b, classified exactly once.
 * Secret and portability decisions reuse the backup denylist / suffix rule / keyring list
 * as source of truth instead of inventing a parallel list.
 */
export const PROFILE_KEY_CATALOG: Record<string, ProfileKeyClassification> = {
  // Portable application settings.
  github_branch: 'portable',
  github_auto_sync_enabled: 'portable',
  github_auto_sync_mode: 'portable',
  github_auto_sync_interval_minutes: 'portable',
  github_auto_sync_daily_time: 'portable',
  jira_domain: 'portable',
  jira_email: 'portable',
  jira_cors_proxy: 'portable',
  jira_default_project: 'portable',
  jira_default_issue_type: 'portable',
  jira_status_mappings: 'portable',
  jira_account_id: 'portable',
  ninerouter_default_model: 'portable',
  ninerouter_char_limit: 'portable',
  ninerouter_context_window_tokens: 'portable',
  ninerouter_cached_models: 'portable',
  utility_tool_ai_models: 'portable',
  image_model: 'portable',
  image_cached_models: 'portable',
  graphiti_mcp_enabled: 'portable',
  global_conventions: 'portable',
  ai_budget_warn_threshold_pct: 'portable',
  notification_settings: 'portable',
  system_type_options: 'portable',
  knowledge_server_enabled: 'portable',
  // Machine-specific values: preserved in JSON but flagged for review.
  github_owner: 'machine-specific',
  github_repo: 'machine-specific',
  ninerouter_endpoint: 'machine-specific',
  image_endpoint: 'machine-specific',
  graphiti_mcp_endpoint: 'machine-specific',
  knowledge_server_base_url: 'machine-specific',
  // Secrets: blank on export, never overwritten by a blank on import.
  jira_api_token: 'secret-blank',
  github_pat: 'secret-blank',
  github_token: 'secret-blank',
  github_passphrase: 'secret-blank',
  backup_passphrase: 'secret-blank',
  ninerouter_api_key: 'secret-blank',
  image_api_key: 'secret-blank',
  knowledge_server_token: 'secret-blank',
  mcp_servers: 'secret-blank',
  // Machine + secret: connectionString holds user/password; whole string blanked.
  [SSH_CONFIGS_SETTING_KEY]: 'secret-blank',
  [ORACLE_TOOL_CONFIG_LIST_KEY]: 'secret-blank',
  [ORACLE_TOOL_CONFIG_KEY]: 'secret-blank',
  // Excluded: bookkeeping, self-reference, operational or out-of-scope data.
  [CONFIGURATION_PROFILES_SETTING_KEY]: 'excluded',
  ai_teams_docs_root: 'excluded',
  plannedAllocations: 'excluded',
  telegramSettings: 'excluded',
  telegramWhitelist: 'excluded',
};

// Bookkeeping keys from the backup denylist that never belong in a profile.
for (const key of UNSAFE_OR_EPHEMERAL_SETTING_KEYS) {
  if (!(key in PROFILE_KEY_CATALOG)) PROFILE_KEY_CATALOG[key] = 'excluded';
}
for (const key of Object.values(KEYRING_KEYS)) {
  if (!(key in PROFILE_KEY_CATALOG)) PROFILE_KEY_CATALOG[key] = 'secret-blank';
}

/** Declared secret field names (keys classified `secret-blank`, plus suffix-rule keys). */
export function getSecretFields(): string[] {
  return Object.entries(PROFILE_KEY_CATALOG)
    .filter(([key, classification]) => classification === 'secret-blank' || !isSafeBackupSetting(key))
    .map(([key]) => key);
}

/**
 * Secret fields actually declared by a profile, intersected with the known catalog so an
 * unknown key from an untrusted file cannot masquerade as a catalog secret in the UI.
 */
export function getDeclaredProfileSecretFields(declared: Record<string, unknown>): string[] {
  const catalog = new Set(getSecretFields());
  return Object.keys(declared).filter((key) => catalog.has(key));
}

/** Machine-specific field names whose values are preserved but must be reviewed on import. */
export function getMachineSpecificFields(): string[] {
  const keys = Object.entries(PROFILE_KEY_CATALOG)
    .filter(([, classification]) => classification === 'machine-specific')
    .map(([key]) => key);
  keys.push('ghostDevConfig.claudePath');
  return keys;
}

/**
 * Machine-specific fields actually declared by a profile, intersected with the known
 * catalog so an unknown key from an untrusted file cannot appear in review lists.
 */
export function getDeclaredProfileMachineFields(
  config: {
    settings: Record<string, unknown>;
    ghostDevConfig?: { [key: string]: unknown; claudePath?: string | undefined } | null | undefined;
  }
): string[] {
  const catalog = new Set(getMachineSpecificFields());
  const declared = Object.keys(config.settings);
  if (config.ghostDevConfig?.claudePath !== undefined) {
    declared.push('ghostDevConfig.claudePath');
  }
  return declared.filter((key) => catalog.has(key));
}

/** All keys belonging to one classification bucket, for inventory tests. */
export function getKeysByClassification(classification: ProfileKeyClassification): string[] {
  return Object.entries(PROFILE_KEY_CATALOG)
    .filter(([, value]) => value === classification)
    .map(([key]) => key);
}
