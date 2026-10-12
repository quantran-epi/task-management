import { z } from 'zod';
import { CompleteModalityStatusSchema } from '../types/retrievalProtocol.js';

/**
 * Strict disallow list for sensitive/content fields (D-23).
 */
const FORBIDDEN_KEYS = new Set([
  'excerpt',
  'body',
  'snippet',
  'rawSnippet',
  'content',
  'markdown',
  'token',
  'password',
  'key',
  'apiKey',
  'secret',
  'authorization',
]);

function deepCheckNoForbiddenKeys(obj: unknown, path = ''): void {
  if (!obj || typeof obj !== 'object') return;

  for (const [key, value] of Object.entries(obj)) {
    const currentPath = path ? `${path}.${key}` : key;
    if (FORBIDDEN_KEYS.has(key)) {
      throw new Error(`Smoke evidence violation: forbidden content/secret key '${currentPath}' detected.`);
    }
    if (typeof value === 'object' && value !== null) {
      deepCheckNoForbiddenKeys(value, currentPath);
    }
  }
}

/**
 * Case summary metadata schema.
 */
export const SmokeCaseSummarySchema = z
  .object({
    caseId: z.string().min(1),
    status: z.enum(['PASS', 'FAIL']),
    fastPath: z.boolean(),
    intent: z.string().optional(),
    modalityStatus: CompleteModalityStatusSchema,
    durationMs: z.number().int().nonnegative(),
    citationsCount: z.number().int().nonnegative(),
    pathsCount: z.number().int().nonnegative().optional(),
    outcome: z.string().optional(),
    failureReason: z.string().optional(),
  })
  .strict();

export type SmokeCaseSummary = z.infer<typeof SmokeCaseSummarySchema>;

/**
 * Restart persistence check metadata schema.
 */
export const RestartPersistenceSchema = z
  .object({
    status: z.enum(['PASS', 'FAIL', 'SKIPPED']),
    preRestartSnapshotId: z.string().min(1),
    postRestartSnapshotId: z.string().min(1),
    indexesOnline: z.boolean(),
    details: z.string().optional(),
  })
  .strict();

export type RestartPersistence = z.infer<typeof RestartPersistenceSchema>;

/**
 * Metadata-only Acceptance Evidence Schema adhering strictly to D-23.
 */
export const SmokeEvidenceSchema = z
  .object({
    executedAt: z.string().datetime(),
    environment: z.string().min(1),
    activeSnapshotId: z.string().min(1),
    counts: z
      .object({
        nodeCount: z.number().int().nonnegative(),
        factCount: z.number().int().nonnegative(),
        quarantineCount: z.number().int().nonnegative(),
        conflictCount: z.number().int().nonnegative(),
      })
      .strict(),
    cases: z.array(SmokeCaseSummarySchema).min(1),
    restartPersistence: RestartPersistenceSchema,
  })
  .strict()
  .superRefine((val, ctx) => {
    try {
      deepCheckNoForbiddenKeys(val);
    } catch (err) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

export type SmokeEvidence = z.infer<typeof SmokeEvidenceSchema>;

/**
 * Helper to validate and format smoke evidence.
 */
export function validateAndFormatEvidence(raw: unknown): SmokeEvidence {
  deepCheckNoForbiddenKeys(raw);
  return SmokeEvidenceSchema.parse(raw);
}
