import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import type { Setting } from '../../types/models';
import { generateId } from '../../utils/uuid';
import { setGhostDevConfig } from '../agents/ghostDevConfig';
import { isSafeBackupSetting } from '../backup/exportBackup';
import { getSecretFields } from './catalog';
import {
  ConfigProfileEnvelopeSchema,
  validateConfigProfilePayload,
} from '../../validation/configProfileSchemas';
import type { ConfigurationProfile } from './types';

export const CONFIGURATION_PROFILES_SETTING_KEY = 'configuration_profiles';
/**
 * Portable template row for future AI teams. No runtime team-creation surface consumes this
 * key today, so the post-import checklist explicitly lists the template as a manual step.
 */
export const AI_TEAM_DEFAULTS_SETTING_KEY = 'ai_team_defaults';

export async function getProfiles(db: TaskPlannerDatabase = defaultDb): Promise<ConfigurationProfile[]> {
  const record = await db.settings.get(CONFIGURATION_PROFILES_SETTING_KEY);
  if (!record || !Array.isArray(record.value)) return [];
  return record.value as ConfigurationProfile[];
}

/** Upsert by stable id in one settings row — no Dexie version bump. */
export async function saveProfiles(
  profiles: ConfigurationProfile[],
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await db.settings.put({ key: CONFIGURATION_PROFILES_SETTING_KEY, value: profiles });
}

export interface ApplyProfileResult {
  applied: boolean;
  errors: Array<{ field: string; message: string }>;
  appliedSettingKeys: string[];
  skippedBlankSecrets: string[];
  /** Secret-like settings found with a non-blank value — rejected without being written. */
  rejectedSecretKeys: string[];
}

/** Secret-like keys are rejected on sight, regardless of the value carried in the profile. */
function isBlankSecretKey(key: string): boolean {
  return !isSafeBackupSetting(key) || getSecretFields().includes(key);
}

/**
 * Validate → snapshot → key-by-key merge in ONE rw transaction.
 *
 * No `settings.clear()`, no keyring writes, and no read or write of `db.telegramSettings`
 * (owner-machine-only, excluded by explicit user decision). Ghost Dev localStorage is
 * written only after the Dexie transaction commits and is guarded for absent storage.
 */
export async function applyConfigProfile(
  raw: unknown,
  db: TaskPlannerDatabase = defaultDb
): Promise<ApplyProfileResult> {
  const validation = validateConfigProfilePayload(raw);
  if (!validation.valid || !validation.envelope) {
    return {
      applied: false,
      errors: validation.errors,
      appliedSettingKeys: [],
      skippedBlankSecrets: [],
      rejectedSecretKeys: [],
    };
  }
  const envelope = validation.envelope;

  // Parse again through the schema (same result) to obtain the typed profile shape.
  const parsed = ConfigProfileEnvelopeSchema.parse(envelope);
  const config = parsed.profile.config;

  const incoming: Setting[] = [];
  const skippedBlankSecrets: string[] = [];
  const rejectedSecretKeys: string[] = [];
  for (const [key, value] of Object.entries(config.settings)) {
    if (isBlankSecretKey(key)) {
      if (value === '') skippedBlankSecrets.push(key);
      else rejectedSecretKeys.push(key);
      // No profile secret may ever be written to db.settings, whatever its value.
      continue;
    }
    incoming.push({ key, value });
  }
  for (const [key, value] of Object.entries(config.secretFields)) {
    // Declared blank secrets never overwrite a recipient's real value.
    if (value === '') {
      skippedBlankSecrets.push(key);
    }
  }

  // WR-03: persist the clean AI-team template instead of silently dropping it. Team records
  // already in db.aiTeams are never touched; the value is a template for future teams.
  const teamDefaults = config.teamDefaults;
  if (teamDefaults !== undefined) {
    incoming.push({ key: AI_TEAM_DEFAULTS_SETTING_KEY, value: teamDefaults });
  }

  await db.transaction('rw', db.settings, db.capacityRules, db.capacityOverrides, async () => {
    // Guardrail verbatim intent: settings are replaced key-by-key, never cleared wholesale.
    if (incoming.length > 0) {
      await db.settings.bulkDelete(incoming.map((setting) => setting.key));
      for (const setting of incoming) await db.settings.put(setting);
    }
    // CR-01/WR-02: profile import never writes the shared `last_pre_import_snapshot` key.
    // A profile is a key-by-key merge, so no global rollback point is created here — and any
    // valid SnapshotData from a backup import must survive untouched.

    // Upsert by natural key; generate a fresh id for any new row so recipient rows cannot collide.
    for (const rule of config.capacityRules) {
      const existing = await db.capacityRules.where('dayOfWeek').equals(rule.dayOfWeek).first();
      if (existing) {
        await db.capacityRules.update(existing.id, { workMinutes: rule.workMinutes });
      } else {
        await db.capacityRules.add({
          id: generateId(),
          dayOfWeek: rule.dayOfWeek,
          workMinutes: rule.workMinutes,
        });
      }
    }
    for (const override of config.capacityOverrides) {
      const existing = await db.capacityOverrides.where('date').equals(override.date).first();
      if (existing) {
        const updated = {
          ...existing,
          workMinutes: override.workMinutes,
          ...(override.note !== undefined ? { note: override.note } : {}),
        };
        if (override.note === undefined) delete updated.note;
        await db.capacityOverrides.put(updated);
      } else {
        await db.capacityOverrides.add({
          id: generateId(),
          date: override.date,
          workMinutes: override.workMinutes,
          ...(override.note !== undefined ? { note: override.note } : {}),
        });
      }
    }
  });

  // Ghost Dev lives in localStorage, outside Dexie. Write only after the transaction commits
  // and degrade cleanly when storage is absent (jsdom/Node test env).
  if (config.ghostDevConfig && typeof window !== 'undefined') {
    try {
      setGhostDevConfig(config.ghostDevConfig);
    } catch {
      // No localStorage: the rest of the profile was applied; UI checklist covers review.
    }
  }

  return {
    applied: true,
    errors: [],
    appliedSettingKeys: incoming.map((setting) => setting.key),
    skippedBlankSecrets,
    rejectedSecretKeys,
  };
}
