import { z } from 'zod';
import {
  EvidenceClassificationSchema,
  FactKeySchema,
  ModalityStatusSchema,
  ScopeProofSchema,
  UrnSchema,
} from '../knowledge/retrievalProtocol';

const CitationIdSchema = z.string().regex(/^(S|L)[1-9][0-9]*$/);
const PathIdSchema = z.string().regex(/^P[1-9][0-9]*$/);
const SnapshotIdSchema = z.string().regex(/^gsnap_[0-9a-f]{8,}$/);
const HashSchema = z.string().regex(/^[0-9a-f]{64}$/);
const ServerEvidenceClassificationSchema = z.enum([
  'OBSERVED',
  'INFERRED',
  'BUSINESS_APPROVED',
]);

function validateClaimPath(
  claim: { classification: 'DIRECT' | 'INFERRED'; pathId: string | null },
  ctx: z.RefinementCtx,
  pathPrefix: PropertyKey[] = []
): void {
  if (claim.classification === 'INFERRED' && claim.pathId === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [...pathPrefix, 'pathId'],
      message: 'INFERRED claim requires validated pathId',
    });
  }
  if (claim.classification === 'DIRECT' && claim.pathId !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [...pathPrefix, 'pathId'],
      message: 'DIRECT claim must not claim a graph derivation',
    });
  }
}

export const GroundedClaimSchema = z
  .object({
    id: z.string().regex(/^C[1-9][0-9]*$/),
    text: z.string().min(1).max(800),
    classification: z.enum(['DIRECT', 'INFERRED']),
    citationIds: z.array(CitationIdSchema).min(1).max(8),
    pathId: PathIdSchema.nullable(),
  })
  .strip()
  .superRefine(validateClaimPath);

export const GroundedAnswerSchema = z
  .object({
    schemaVersion: z.literal(1),
    language: z.string().min(2).max(16),
    conclusion: z.string().min(1).max(1200),
    claims: z.array(GroundedClaimSchema).max(12),
    unsupportedParts: z.array(z.string().min(1).max(300)).max(5),
  })
  .strip()
  .superRefine((answer, ctx) => {
    answer.claims.forEach((claim, index) => {
      validateClaimPath(claim, ctx, ['claims', index]);
    });
  });

export const GroundedAnswerJsonSchema = z.toJSONSchema(GroundedAnswerSchema);

export const PersistedCitationSchema = z
  .strictObject({
    citationId: CitationIdSchema,
    documentId: z.string().uuid(),
    documentTitle: z.string().min(1).max(400),
    sectionAnchor: z.string().min(1).max(256).nullable(),
    lineStart: z.number().int().positive(),
    lineEnd: z.number().int().positive(),
    authority: z.enum(['server', 'local']),
    evidenceClass: EvidenceClassificationSchema.or(z.literal('LOCAL')),
    snapshotId: SnapshotIdSchema.nullable(),
    publishedContentHash: HashSchema.nullable(),
    citedExcerpt: z.string().min(1).max(1200),
    evidenceKind: z
      .enum(['policy_change', 'release_note', 'migration_record', 'other'])
      .optional(),
  })
  .superRefine((citation, ctx) => {
    if (citation.lineEnd < citation.lineStart) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lineEnd'],
        message: 'lineEnd must be greater than or equal to lineStart',
      });
    }
    if (citation.authority === 'server') {
      if (
        citation.snapshotId === null ||
        citation.publishedContentHash === null ||
        citation.evidenceClass === 'LOCAL'
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['authority'],
          message: 'Server citation requires immutable snapshot provenance',
        });
      }
    } else if (
      citation.snapshotId !== null ||
      citation.publishedContentHash !== null ||
      citation.evidenceClass !== 'LOCAL'
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['authority'],
        message: 'Local citation must remain current-local authority',
      });
    }
  });

export const PersistedPathSchema = z
  .strictObject({
    pathId: PathIdSchema,
    snapshotId: SnapshotIdSchema,
    nodeUrns: z.array(UrnSchema).min(2).max(4),
    edgeFactKeys: z.array(FactKeySchema).min(1).max(3),
    hopClassifications: z.array(ServerEvidenceClassificationSchema).min(1).max(3),
    hopCitationIds: z.array(z.array(CitationIdSchema).min(1)).min(1).max(3),
    hasConflict: z.boolean(),
    classification: ServerEvidenceClassificationSchema,
  })
  .superRefine((path, ctx) => {
    const edgeCount = path.edgeFactKeys.length;
    if (
      path.nodeUrns.length !== edgeCount + 1 ||
      path.hopClassifications.length !== edgeCount ||
      path.hopCitationIds.length !== edgeCount
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['edgeFactKeys'],
        message: 'Path nodes, edges, classifications, and citations must align',
      });
    }
  });

export const PersistedConflictGroupSchema = z
  .strictObject({
    conflictId: z.string().min(1).max(200),
    dimension: z.enum(['Version', 'Environment', 'Behavior', 'Unknown']),
    branches: z
      .array(
        z.strictObject({
          factKey: FactKeySchema,
          claimIds: z.array(z.string().regex(/^C[1-9][0-9]*$/)).max(12),
          citationIds: z.array(CitationIdSchema).min(1).max(20),
        })
      )
      .min(2)
      .max(20),
    scopeProof: ScopeProofSchema.nullable(),
  })
  .superRefine((group, ctx) => {
    if (
      group.dimension === 'Unknown' &&
      group.scopeProof &&
      (group.scopeProof.environment !== null ||
        group.scopeProof.version !== null ||
        group.scopeProof.overrideRelation !== null)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scopeProof'],
        message: 'Unknown conflict scope must not carry invented scope details',
      });
    }
  });

const RoutedScopeSchema = z.strictObject({
  domain: z.string().max(100).nullable(),
  environment: z.string().max(32).nullable(),
  version: z.string().max(32).nullable(),
  comparisonMode: z.enum(['single', 'baseline_vs_scope']).nullable(),
});

const GroundingOutcomeSchema = z.enum([
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
]);

const FallbackReasonSchema = z.enum([
  'NONE',
  'SERVER_DISABLED',
  'SERVER_ABSENT',
  'NETWORK_ERROR',
  'TIMEOUT',
  'MODEL_UNAVAILABLE',
]);

export const ChatMessageGroundingSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    authority: z.enum(['server', 'local']),
    outcome: GroundingOutcomeSchema,
    answer: GroundedAnswerSchema.nullable(),
    citations: z.array(PersistedCitationSchema).max(20),
    paths: z.array(PersistedPathSchema).max(20).nullable(),
    conflicts: z.array(PersistedConflictGroupSchema).max(10).nullable(),
    scope: z
      .strictObject({
        setIds: z.array(z.string().uuid()).max(50),
        routedScope: RoutedScopeSchema,
      })
      .nullable(),
    modalityDiagnostics: ModalityStatusSchema.nullable(),
    coverageWarnings: z.array(z.string().min(1).max(300)).max(10),
    fallbackReason: FallbackReasonSchema,
    routerVersion: z.string().min(1).max(80).nullable(),
    promptVersion: z.string().min(1).max(80),
    modelId: z.string().min(1).max(200).nullable(),
    createdAt: z.iso.datetime(),
  })
  .superRefine((grounding, ctx) => {
    if (grounding.citations.some((citation) => citation.authority !== grounding.authority)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['citations'],
        message: 'Citation authority must match grounding authority',
      });
    }

    if (grounding.authority === 'server') {
      if (
        grounding.paths === null ||
        grounding.conflicts === null ||
        grounding.scope === null ||
        grounding.modalityDiagnostics === null ||
        grounding.routerVersion === null ||
        grounding.modelId === null ||
        grounding.citations.some((citation) => citation.snapshotId === null)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['authority'],
          message: 'Server grounding requires complete server provenance',
        });
      }
      if (grounding.fallbackReason !== 'NONE') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['fallbackReason'],
          message: 'Server grounding must not declare a fallback reason',
        });
      }
    } else {
      if (
        grounding.paths !== null ||
        grounding.conflicts !== null ||
        grounding.scope !== null ||
        grounding.routerVersion !== null
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['authority'],
          message: 'Local grounding must not claim server-only provenance',
        });
      }
      if (grounding.fallbackReason === 'NONE') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['fallbackReason'],
          message: 'Local grounding requires an explicit fallback reason',
        });
      }
    }
  });

export type GroundedClaim = z.infer<typeof GroundedClaimSchema>;
export type GroundedAnswer = z.infer<typeof GroundedAnswerSchema>;
export type PersistedCitation = z.infer<typeof PersistedCitationSchema>;
export type PersistedPath = z.infer<typeof PersistedPathSchema>;
export type PersistedConflictGroup = z.infer<typeof PersistedConflictGroupSchema>;
export type ChatMessageGrounding = z.infer<typeof ChatMessageGroundingSchema>;
