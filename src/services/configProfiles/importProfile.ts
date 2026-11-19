import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import type { Setting } from '../../types/models';
import { generateId } from '../../utils/uuid';
import { setGhostDevConfig } from '../agents/ghostDevConfig';
import { isSafeBackupSetting } from '../backup/exportBackup';
import {
  ConfigProfileEnvelopeSchema,
  validateConfigProfilePayload,
} from '../../validation/configProfileSchemas';
import type { ConfigurationProfile } from './types';

export const CONFIGURATION_PROFILES_SETTING_KEY = 'configuration_profiles';

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
}

function isBlankSecretKey(key: string): boolean {
  return !isSafeBackupSetting(key);
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
    return { applied: false, errors: validation.errors, appliedSettingKeys: [], skippedBlankSecrets: [] };
  }
  const envelope = validation.envelope;

  // Parse again through the schema (same result) to obtain the typed profile shape.
  const parsed = ConfigProfileEnvelopeSchema.parse(envelope);
  const config = parsed.profile.config;
  const timestamp = new Date().toISOString();

  // Snapshot of the settings/capacity state being touched, captured before any write.
  const [settingsBefore, rulesBefore, overridesBefore] = await Promise.all([
    db.settings.toArray(),
    db.capacityRules.toArray(),
    db.capacityOverrides.toArray(),
  ]);
  const snapshot = {
    timestamp,
    settings: settingsBefore,
    capacityRules: rulesBefore,
    capacityOverrides: overridesBefore,
  };

  const incoming: Setting[] = [];
  const skippedBlankSecrets: string[] = [];
  for (const [key, value] of Object.entries(config.settings)) {
    if (value === '' && isBlankSecretKey(key)) {
      skippedBlankSecrets.push(key);
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

  await db.transaction('rw', db.settings, db.capacityRules, db.capacityOverrides, async () => {
    // Guardrail verbatim intent: settings are replaced key-by-key, never cleared wholesale.
    if (incoming.length > 0) {
      await db.settings.bulkDelete(incoming.map((setting) => setting.key));
      for (const setting of incoming) await db.settings.put(setting);
    }
    await db.settings.put({ key: 'last_pre_import_snapshot', value: snapshot });

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
  };
}
