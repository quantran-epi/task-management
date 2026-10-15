import { z } from 'zod';
import {
  RetrievalOutcomeSchema,
  SnapshotIdSchema,
} from '../types/retrievalProtocol.js';

export const AcceptanceCaseResultSchema = z.strictObject({
  caseId: z.string().regex(/^T(1[0-6]|[1-9])$|^E-(0[1-9]|1[0-9]|20)$/),
  intent: z.enum([
    'operate_taskmate',
    'query_taskmate',
    'query_knowledge',
    'mixed',
    'clarify',
    'error',
  ]),
  outcome: RetrievalOutcomeSchema.or(z.enum(['PASSED', 'FAILED', 'BLOCKED'])),
  fastPath: z.boolean(),
  latencyMs: z.number().nonnegative(),
  chunkCount: z.number().int().nonnegative(),
  pathCount: z.number().int().nonnegative(),
  snapshotId: SnapshotIdSchema.nullable(),
  citationsVerified: z.boolean(),
  errorCodes: z.array(z.string()).default([]),
});

export type AcceptanceCaseResult = z.infer<typeof AcceptanceCaseResultSchema>;

export const AcceptanceEvidenceSchema = z.strictObject({
  timestamp: z.string().datetime(),
  gitCommit: z.string().regex(/^[0-9a-f]{7,40}$/),
  environment: z.enum(['local', 'canary', 'staging', 'production']),
  totalCases: z.number().int().positive(),
  passedCases: z.number().int().nonnegative(),
  failedCases: z.number().int().nonnegative(),
  blockedCases: z.number().int().nonnegative().default(0),
  results: z.array(AcceptanceCaseResultSchema),
});

export type AcceptanceEvidence = z.infer<typeof AcceptanceEvidenceSchema>;

export const SmokeCliOptionsSchema = z.strictObject({
  endpoint: z.string().url(),
  setIds: z.array(z.string().uuid()).min(1),
  strict: z.boolean().default(false),
  timeout: z.number().int().positive().default(15000),
  outPath: z.string().optional(),
});

export type SmokeCliOptions = z.infer<typeof SmokeCliOptionsSchema>;
