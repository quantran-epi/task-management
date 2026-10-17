import { z } from 'zod';

export const BenchmarkCategorySchema = z.enum([
  'multi_hop_path',
  'semantic_scope',
  'conflict_abstention',
  'security_integrity',
  'rebuild_offline',
]);

export type BenchmarkCategory = z.infer<typeof BenchmarkCategorySchema>;

export const GroundedReferenceExpectedSchema = z.strictObject({
  kind: z.enum([
    'operational',
    'clarify_intent',
    'clarify_entity',
    'refine',
    'grounded_answer',
    'local_fallback_results',
    'evidence_only',
    'error',
  ]),
  outcome: z
    .enum([
      'READY',
      'DEGRADED',
      'NEEDS_CLARIFICATION',
      'NO_EVIDENCE',
      'UNSUPPORTED',
      'LOCAL_FALLBACK_SYNTHESIS',
      'LOCAL_FALLBACK_RESULTS',
      'MODEL_UNAVAILABLE',
      'INVALID_GROUNDED_OUTPUT',
      'ERROR_AUTH',
      'ERROR_CONFIG',
      'ERROR_INVALID_RESPONSE',
    ])
    .nullable(),
  requiredCitationIds: z.array(z.string()),
  forbiddenClaims: z.array(z.string()),
  requiredFacts: z.array(z.string()),
  requiredPathIds: z.array(z.string()),
  requiredConflictBranches: z.number().int().nonnegative().optional(),
  requiredCoverageWarnings: z.array(z.string()),
  requiredFallbackReason: z.string().nullable(),
  requiredRefinementCount: z.number().int().nonnegative().nullable(),
  requiredCandidates: z
    .array(
      z.strictObject({
        canonicalName: z.string(),
        kind: z.string(),
      })
    )
    .nullable(),
  forbiddenFallback: z.boolean(),
  requiredResponseLanguage: z.enum(['vi', 'en']).optional(),
  requiredByteIdenticalQuotes: z.array(z.string()).optional(),
});

export const GroundedReferenceCaseSchema = z.strictObject({
  id: z.string().min(1),
  category: BenchmarkCategorySchema,
  language: z.enum(['vi', 'en', 'mixed']),
  query: z.string().min(1),
  recentTurns: z.array(
    z.strictObject({
      role: z.enum(['user', 'assistant']),
      content: z.string(),
    })
  ),
  routeOverride: z.enum(['knowledge', 'operational', 'mixed']).nullable(),
  capabilities: z.strictObject({
    serverEnabled: z.boolean(),
    modelConfigured: z.boolean(),
  }),
  retrievalMock: z
    .strictObject({
      outcome: z.string(),
      errorCode: z.string().nullable(),
      response: z.record(z.string(), z.unknown()),
    })
    .nullable(),
  localResultMock: z.record(z.string(), z.unknown()).nullable(),
  synthesisMock: z.record(z.string(), z.unknown()).nullable(),
  expected: GroundedReferenceExpectedSchema,
  rubricIds: z.array(z.string()),
});

export type GroundedReferenceCase = z.infer<typeof GroundedReferenceCaseSchema>;
