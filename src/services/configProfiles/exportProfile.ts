import type { ConfigurationProfile, ProfileConfig } from './types';
import {
  CONFIG_PROFILE_APP_MARKER,
  CONFIG_PROFILE_SCHEMA_VERSION,
} from '../../validation/configProfileSchemas';
import { getSecretFields } from './catalog';
import { saveFileWithPicker } from '../../utils/fileExport';
import { sanitizeFilename } from '../../utils/fileExport';

export interface ConfigProfileExportPayload {
  app: typeof CONFIG_PROFILE_APP_MARKER;
  profileSchemaVersion: typeof CONFIG_PROFILE_SCHEMA_VERSION;
  exportedAt: string;
  profile: ConfigurationProfile;
}

/**
 * Secret keys that must never carry a value into a portable profile. Sourced from the
 * same denylist/keyring list used by backup export; no new hand-written list.
 */
export function getDeclaredSecretKeys(): string[] {
  return getSecretFields();
}

function isDeclaredSecretKey(key: string): boolean {
  return getSecretFields().includes(key);
}

/**
 * Build the JSON payload from an in-memory profile argument only — never from db,
 * localStorage or the OS keyring. Every declared secret field is blanked; machine-specific
 * values are preserved verbatim (the import UI flags them for review).
 */
export function buildProfileExportPayload(
  profile: ConfigurationProfile,
  now: () => string = () => new Date().toISOString()
): ConfigProfileExportPayload {
  const secretFields: Record<string, ''> = {};
  const settings: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(profile.config.settings)) {
    if (isDeclaredSecretKey(key)) {
      secretFields[key] = '';
    } else {
      settings[key] = value;
    }
  }
  for (const key of Object.keys(profile.config.secretFields)) {
    secretFields[key] = '';
  }
  const config: ProfileConfig = {
    settings,
    capacityRules: profile.config.capacityRules.map(({ dayOfWeek, workMinutes }) => ({ dayOfWeek, workMinutes })),
    capacityOverrides: profile.config.capacityOverrides.map(({ date, workMinutes, note }) => ({
      date,
      workMinutes,
      ...(note !== undefined ? { note } : {}),
    })),
    ...(profile.config.ghostDevConfig !== undefined && profile.config.ghostDevConfig !== null
      ? { ghostDevConfig: { ...profile.config.ghostDevConfig } }
      : {}),
    ...(profile.config.teamDefaults !== undefined ? { teamDefaults: { ...profile.config.teamDefaults } } : {}),
    secretFields,
  };
  return {
    app: CONFIG_PROFILE_APP_MARKER,
    profileSchemaVersion: CONFIG_PROFILE_SCHEMA_VERSION,
    exportedAt: now(),
    profile: { ...profile, config },
  };
}

/** Serialize and save exactly one selected profile through the 3-layer file picker. */
export async function exportProfileToFile(profile: ConfigurationProfile): Promise<{ saved: boolean; path?: string }> {
  const payload = buildProfileExportPayload(profile);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const name = sanitizeFilename(`${profile.name || 'config-profile'}.json`);
  return saveFileWithPicker(name, blob, {
    title: 'Lưu cấu hình profile',
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
}
