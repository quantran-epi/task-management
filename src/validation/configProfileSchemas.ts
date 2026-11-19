import { z } from 'zod';

/**
 * Independent, versioned schema for portable configuration profiles.
 *
 * Do NOT reuse `findForbiddenBackupKey` from `backupSchemas.ts`: that regex rejects every
 * `*_token` / `*_key` / `*_secret` field even when blank, which would make every valid
 * profile fail. Here secret fields are declared explicitly and must be `''`.
 */
export const CONFIG_PROFILE_SCHEMA_VERSION = 1 as const;
export const CONFIG_PROFILE_APP_MARKER = 'taskmate-config-profile' as const;

export const CapacityRuleProfileSchema = z.strictObject({
  dayOfWeek: z.number().int().min(0).max(6),
  workMinutes: z.number().int().min(0).max(1440),
});

export const CapacityOverrideProfileSchema = z.strictObject({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'),
  workMinutes: z.number().int().min(0).max(1440),
  note: z.string().optional(),
});

export const GhostDevProfileSchema = z.strictObject({
  masterModel: z.string(),
  workerModel: z.string(),
  concurrencyCap: z.number().int().min(1).max(12),
  claudePath: z.string().optional(),
});

export const AiTeamDefaultsTemplateSchema = z.strictObject({
  budgetTokens: z.number().int().nonnegative(),
  concurrencyLimit: z.number().int().min(1).optional(),
  autoSplitEnabled: z.boolean().optional(),
  autoApproveMutations: z.boolean().optional(),
  mcpEnabled: z.boolean().optional(),
  sshFsToolsEnabled: z.boolean().optional(),
  oracleToolsEnabled: z.boolean().optional(),
  budgetWarnThresholdPct: z.number().int().min(1).max(100).nullable().optional(),
});

/**
 * strictObject at config level: an unknown section such as `telegramSettings` is rejected.
 * Telegram is excluded by explicit user decision (owner-machine-only).
 */
export const ProfileConfigSchema = z.strictObject({
  settings: z.record(z.string(), z.unknown()),
  capacityRules: z.array(CapacityRuleProfileSchema).default([]),
  capacityOverrides: z.array(CapacityOverrideProfileSchema).default([]),
  ghostDevConfig: GhostDevProfileSchema.nullable().optional(),
  teamDefaults: AiTeamDefaultsTemplateSchema.optional(),
  secretFields: z.record(z.string(), z.literal('')),
});

export const ConfigurationProfileSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  config: ProfileConfigSchema,
});

export const ConfigProfileEnvelopeSchema = z.strictObject({
  app: z.literal(CONFIG_PROFILE_APP_MARKER),
  profileSchemaVersion: z.literal(CONFIG_PROFILE_SCHEMA_VERSION),
  exportedAt: z.string(),
  profile: ConfigurationProfileSchema,
});

export type ConfigProfileValidationResult =
  | { valid: true; envelope: z.infer<typeof ConfigProfileEnvelopeSchema>; errors: [] }
  | { valid: false; envelope?: undefined; errors: Array<{ field: string; message: string }> };

/** Validate an untrusted import payload at the trust boundary — before any db write. */
export function validateConfigProfilePayload(raw: unknown): ConfigProfileValidationResult {
  const parsed = ConfigProfileEnvelopeSchema.safeParse(raw);
  if (parsed.success) {
    return { valid: true, envelope: parsed.data, errors: [] };
  }
  return {
    valid: false,
    errors: parsed.error.issues.map((issue) => ({
      field: issue.path.join('.') || 'envelope',
      message: issue.message,
    })),
  };
}
