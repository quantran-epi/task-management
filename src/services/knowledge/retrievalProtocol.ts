import { z } from 'zod';

export const UrnSchema = z
  .string()
  .regex(
    /^urn:plannermate:[a-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_.~%:-]+$/,
    'Must be valid PlannerMate URN (urn:plannermate:<sourceSystem>:<nativeType>:<normalizedKey>)'
  );
export type Urn = z.infer<typeof UrnSchema>;

export const FactKeySchema = z
  .string()
  .regex(/^[0-9a-fA-F]{64}$/, 'Must be 64-character hex SHA-256 hash');
export type FactKey = z.infer<typeof FactKeySchema>;

export const NodeKindSchema = z.enum([
  'ScheduledProcess',
  'ProcessStep',
  'SoftwareComponent',
  'DatabaseObject',
  'CycleType',
  'Status',
  'SourceDocument',
]);
export type NodeKind = z.infer<typeof NodeKindSchema>;

export const RelationTypeSchema = z.enum([
  'CONTAINS_STEP',
  'PRECEDES',
  'CALLS',
  'INVOKES',
  'READS_FROM',
  'WRITES_TO',
  'EMITS',
  'CONSUMES',
  'USES_TYPE',
  'HAS_STATUS',
]);
export type RelationType = z.infer<typeof RelationTypeSchema>;

export const EvidenceClassificationSchema = z.enum([
  'OBSERVED',
  'INFERRED',
  'BUSINESS_APPROVED',
]);
export type EvidenceClassification = z.infer<typeof EvidenceClassificationSchema>;

/**
 * D-23: Controlled retrieval outcomes.
 */
export const RETRIEVAL_OUTCOMES = [
  'READY',
  'NEEDS_CLARIFICATION',
  'NO_EVIDENCE',
  'UNSUPPORTED',
  'DEGRADED',
] as const;

export const RetrievalOutcomeSchema = z.enum(RETRIEVAL_OUTCOMES);
export type RetrievalOutcome = z.infer<typeof RetrievalOutcomeSchema>;

/**
 * Modality kinds.
 */
export const MODALITY_KINDS = ['fulltext', 'vector', 'graph'] as const;
export const ModalityKindSchema = z.enum(MODALITY_KINDS);
export type ModalityKind = z.infer<typeof ModalityKindSchema>;

/**
 * Modality status values per D-11, D-15, D-24, D-25.
 */
export const MODALITY_STATUS_VALUES = [
  'ok',
  'unavailable',
  'timeout',
  'stale',
  'truncated',
  'error',
] as const;

export const ModalityStatusValueSchema = z.enum(MODALITY_STATUS_VALUES);
export type ModalityStatusValue = z.infer<typeof ModalityStatusValueSchema>;

/**
 * Controlled reason codes per D-11, D-12, D-15, D-23, D-25.
 */
export const REASON_CODES = [
  'NO_GRAPH_SEED',
  'TIMEOUT',
  'UNCONFIGURED',
  'PROVIDER_ERROR',
  'MODEL_INDEX_MISMATCH',
  'RESULT_LIMIT_REACHED',
  'PINNED_SNAPSHOT_UNAVAILABLE',
  'PLANNER_SCHEMA_FAILURE',
] as const;

export const ReasonCodeSchema = z.enum(REASON_CODES);
export type ReasonCode = z.infer<typeof ReasonCodeSchema>;

/**
 * Modality status diagnostic detail.
 */
export const ModalityStatusDetailSchema = z
  .object({
    status: ModalityStatusValueSchema,
    latencyMs: z.number().int().nonnegative(),
    itemCount: z.number().int().nonnegative(),
    reason: z.string().optional(),
  })
  .strict();

export type ModalityStatusDetail = z.infer<typeof ModalityStatusDetailSchema>;

/**
 * Complete exact modality status map across all 3 modalities (D-01).
 */
export const CompleteModalityStatusSchema = z
  .object({
    fulltext: ModalityStatusDetailSchema,
    vector: ModalityStatusDetailSchema,
    graph: ModalityStatusDetailSchema,
  })
  .strict();

export const ModalityStatusSchema = CompleteModalityStatusSchema;
export type CompleteModalityStatus = z.infer<typeof CompleteModalityStatusSchema>;
export type ModalityStatus = z.infer<typeof ModalityStatusSchema>;

/**
 * Traversal direction per D-16.
 */
export const TRAVERSAL_DIRECTIONS = ['OUTGOING', 'INCOMING', 'BOTH'] as const;
export const TraversalDirectionSchema = z.enum(TRAVERSAL_DIRECTIONS);
export type TraversalDirection = z.infer<typeof TraversalDirectionSchema>;

/**
 * Traversal step in logical query plan per D-16.
 */
export const TraversalStepSchema = z
  .object({
    relationType: RelationTypeSchema,
    direction: TraversalDirectionSchema.default('OUTGOING'),
    maxHops: z.number().int().min(1).max(3).default(1),
    targetKind: NodeKindSchema.optional(),
  })
  .strict();

export type TraversalStep = z.infer<typeof TraversalStepSchema>;

/**
 * Query intent options.
 */
export const QUERY_INTENTS = [
  'LOOKUP',
  'FLOW_TRAVERSAL',
  'IMPACT_ANALYSIS',
  'DEPENDENCY_CHECK',
] as const;

export const QueryIntentSchema = z.enum(QUERY_INTENTS);
export type QueryIntent = z.infer<typeof QueryIntentSchema>;

/**
 * Logical Query Plan per D-02, D-16, T-18-02.
 * Strictly forbids raw cypher and restricts traversal entries to at most 5 and depth 1-3.
 */
export const LogicalQueryPlanSchema = z
  .object({
    planId: z.string().uuid(),
    queryIntent: QueryIntentSchema,
    seedUrns: z.array(UrnSchema).min(1).max(5),
    traversalSteps: z.array(TraversalStepSchema).max(5),
    overallMaxDepth: z.number().int().min(1).max(3).default(3),
    includeInferred: z.boolean().default(false),
    fulltextKeywords: z.array(z.string().min(1)).min(1),
    semanticQuery: z.string().min(1),
  })
  .strict();

export type LogicalQueryPlan = z.infer<typeof LogicalQueryPlanSchema>;

/**
 * Prior turn conversation representation bounded per D-05.
 */
export const ConversationTurnSchema = z
  .object({
    role: z.enum(['user', 'assistant']),
    text: z.string().max(2000),
    resolvedUrns: z.array(UrnSchema).max(5).default([]),
  })
  .strict();

export type ConversationTurn = z.infer<typeof ConversationTurnSchema>;

/**
 * Retrieval request schema per D-05, D-19.
 */
export const RetrievalRequestSchema = z
  .object({
    query: z.string().trim().min(1).max(4000),
    limit: z.number().int().min(10).max(50).default(20),
    includeInferred: z.boolean().default(false),
    recentTurns: z.array(ConversationTurnSchema).max(3).default([]),
  })
  .strict();

export type RetrievalRequest = z.infer<typeof RetrievalRequestSchema>;

const SnapshotIdSchema = z.string().regex(/^gsnap_[0-9a-f]{8,}$/);
const PublishedContentHashSchema = z.string().regex(/^[0-9a-f]{64}$/);
const PathIdSchema = z.string().regex(/^P[1-9][0-9]*$/);

/**
 * Structured proof for scope variation and conflict dimensions (D-17, D-25, D-29).
 * Deliberately contains no free-text field: callers must derive this data from metadata.
 */
export const ScopeProofSchema = z.strictObject({
  dimension: z.enum(['Version', 'Environment', 'Behavior', 'Unknown']),
  environment: z.string().max(32).nullable(),
  version: z.string().max(32).nullable(),
  overrideRelation: z.enum(['EXTENDS', 'SUPPLEMENTS', 'SUPERSEDES']).nullable(),
});

export type ScopeProof = z.infer<typeof ScopeProofSchema>;

/** Immutable source identity retained with cited evidence. */
export const SourceRefSchema = z
  .strictObject({
    documentId: z.string().uuid(),
    documentTitle: z.string().min(1).max(400),
    sectionAnchor: z.string().min(1).max(256).nullable(),
    lineStart: z.number().int().positive(),
    lineEnd: z.number().int().positive(),
    publishedContentHash: PublishedContentHashSchema,
    snapshotId: SnapshotIdSchema,
    scope: ScopeProofSchema.nullable(),
  })
  .superRefine((source, ctx) => {
    if (source.lineEnd < source.lineStart) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lineEnd'],
        message: 'lineEnd must be greater than or equal to lineStart',
      });
    }
  });

export type SourceRef = z.infer<typeof SourceRefSchema>;

/** Ordered, snapshot-isolated 1-3 hop graph path (D-14). */
export const OrderedPathSchema = z
  .strictObject({
    pathId: PathIdSchema,
    snapshotId: SnapshotIdSchema,
    nodeUrns: z.array(UrnSchema).min(2).max(4).readonly(),
    edgeFactKeys: z.array(FactKeySchema).min(1).max(3).readonly(),
    hopClassifications: z.array(EvidenceClassificationSchema).min(1).max(3).readonly(),
    hopCitationIds: z.array(z.array(z.string().min(1)).min(1).readonly()).min(1).max(3).readonly(),
    hasConflict: z.boolean(),
    classification: EvidenceClassificationSchema,
  })
  .superRefine((path, ctx) => {
    if (path.nodeUrns.length !== path.edgeFactKeys.length + 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['edgeFactKeys'],
        message: 'nodeUrns must contain exactly one more entry than edgeFactKeys',
      });
    }
    if (path.hopClassifications.length !== path.edgeFactKeys.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['hopClassifications'],
        message: 'hopClassifications must align with edgeFactKeys',
      });
    }
    if (path.hopCitationIds.length !== path.edgeFactKeys.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['hopCitationIds'],
        message: 'hopCitationIds must align with edgeFactKeys',
      });
    }
  });

export type OrderedPath = z.infer<typeof OrderedPathSchema>;

/**
 * Chunk citation & retrieval item per D-18, D-20, D-22.
 */
export const ChunkItemSchema = z
  .object({
    type: z.literal('chunk'),
    id: z.string().min(1),
    score: z.number().positive(),
    modalitiesContributed: z.array(ModalityKindSchema).min(1),
    sourceDocumentId: z.string().uuid(),
    sourceDocumentTitle: z.string().min(1).max(400),
    sectionAnchor: z.string(),
    lineStart: z.number().int().positive(),
    lineEnd: z.number().int().positive(),
    rawSnippet: z.string(),
    publishedContentHash: PublishedContentHashSchema,
    snapshotId: z.string().min(1),
    conflictGroupId: z.string().optional(),
    hasConflict: z.boolean().default(false),
  })
  .strict();

export type ChunkItem = z.infer<typeof ChunkItemSchema>;

/**
 * Entity citation & retrieval item per D-18, D-20, D-22.
 */
export const EntityItemSchema = z
  .object({
    type: z.literal('entity'),
    id: UrnSchema,
    score: z.number().positive(),
    modalitiesContributed: z.array(ModalityKindSchema).min(1),
    urn: UrnSchema,
    canonicalName: z.string().min(1),
    kind: NodeKindSchema,
    snapshotId: z.string().min(1),
    firstSeenInDoc: z.string().uuid().optional(),
    conflictGroupId: z.string().optional(),
    hasConflict: z.boolean().default(false),
  })
  .strict();

export type EntityItem = z.infer<typeof EntityItemSchema>;

/**
 * Edge citation & retrieval item per D-18, D-20, D-22.
 * Supporting chunks are reference-based by ID (no duplicated text).
 */
export const EdgeItemSchema = z
  .object({
    type: z.literal('edge'),
    id: FactKeySchema,
    score: z.number().positive(),
    modalitiesContributed: z.array(ModalityKindSchema).min(1),
    factKey: FactKeySchema,
    sourceUrn: UrnSchema,
    relationType: RelationTypeSchema,
    targetUrn: UrnSchema,
    evidenceClass: EvidenceClassificationSchema,
    supportingChunkIds: z.array(z.string()).default([]),
    snapshotId: z.string().min(1),
    conflictGroupId: z.string().optional(),
    hasConflict: z.boolean().default(false),
  })
  .strict();

export type EdgeItem = z.infer<typeof EdgeItemSchema>;

/**
 * Flat discriminated union item per D-20.
 */
export const RetrievalItemSchema = z.discriminatedUnion('type', [
  ChunkItemSchema,
  EntityItemSchema,
  EdgeItemSchema,
]);

export type RetrievalItem = z.infer<typeof RetrievalItemSchema>;

/**
 * Safe provider metadata schema per D-09, D-10.
 * Strictly limited to non-secret configuration attributes.
 */
export const EmbeddingProviderMetadataSchema = z
  .object({
    provider: z.enum(['local-onnx', 'remote-openai']),
    model: z.string().min(1),
    revision: z.string().min(1),
    dimensions: z.number().int().positive(),
    policyVersion: z.string().min(1),
  })
  .strict();

export type EmbeddingProviderMetadata = z.infer<typeof EmbeddingProviderMetadataSchema>;

/**
 * Bounded content-free plan trace per D-23.
 */
export const PlanTraceSchema = z
  .object({
    fastPath: z.boolean(),
    degradedFallback: z.boolean().default(false),
    intent: QueryIntentSchema.or(z.string()).optional(),
    resolvedUrns: z.array(UrnSchema).optional(),
    depth: z.number().int().min(1).max(3).optional(),
    reasonCode: ReasonCodeSchema.or(z.string()).optional(),
  })
  .strict();

export type PlanTrace = z.infer<typeof PlanTraceSchema>;

/**
 * Diagnostic payload.
 */
export const RetrievalDiagnosticsSchema = z
  .object({
    degraded: z.boolean(),
    degradedReasons: z.array(z.string()).optional(),
  })
  .strict();

export type RetrievalDiagnostics = z.infer<typeof RetrievalDiagnosticsSchema>;

/**
 * Candidate entity for clarification per D-04, D-23.
 */
export const ClarificationCandidateSchema = z
  .object({
    urn: UrnSchema,
    canonicalName: z.string().min(1),
    kind: NodeKindSchema,
  })
  .strict();

export type ClarificationCandidate = z.infer<typeof ClarificationCandidateSchema>;

/** Structured conflict group; branches remain represented by tagged retrieval items. */
export const ConflictGroupSchema = z
  .strictObject({
    conflictGroupId: z.string().min(1),
    dimension: z.enum(['Version', 'Environment', 'Behavior', 'Unknown']),
    scopeProof: ScopeProofSchema.nullable().optional(),
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

export type ConflictGroup = z.infer<typeof ConflictGroupSchema>;

/**
 * Base envelope shape. Exported so server-out callers can validate before returning.
 */
export const BaseRetrievalResponseSchema = z
  .object({
    outcome: RetrievalOutcomeSchema,
    snapshotId: z.string().min(1),
    embeddingProvider: EmbeddingProviderMetadataSchema,
    items: z.array(RetrievalItemSchema),
    paths: z.array(OrderedPathSchema).max(20).default([]),
    conflictGroups: z.array(ConflictGroupSchema).default([]),
    totalCandidates: z.number().int().nonnegative(),
    modalitiesUsed: z.array(ModalityKindSchema),
    modalityStatus: CompleteModalityStatusSchema,
    diagnostics: RetrievalDiagnosticsSchema,
    planTrace: PlanTraceSchema,
    candidates: z.array(ClarificationCandidateSchema).optional(),
    reason: z.string().optional(),
    suggestedRefinements: z.array(z.string()).optional(),
    unsupportedConstructs: z.array(z.string()).optional(),
  })
  .strict()
  .superRefine((response, ctx) => {
    const citationIds = new Set(
      response.items.filter((item) => item.type === 'chunk').map((item) => item.id)
    );

    response.paths.forEach((path, pathIndex) => {
      if (path.snapshotId !== response.snapshotId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['paths', pathIndex, 'snapshotId'],
          message: 'Path snapshotId must match response snapshotId',
        });
      }

      path.hopCitationIds.forEach((hopIds, hopIndex) => {
        hopIds.forEach((citationId, citationIndex) => {
          if (!citationIds.has(citationId)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['paths', pathIndex, 'hopCitationIds', hopIndex, citationIndex],
              message: 'Path citation must reference a returned chunk item',
            });
          }
        });
      });
    });
  });

/**
 * Super-refined Retrieval Response Envelope adhering to D-23 invariants:
 * - NEEDS_CLARIFICATION requires candidates
 * - NO_EVIDENCE requires reason and suggestedRefinements
 * - UNSUPPORTED requires unsupportedConstructs
 * - DEGRADED requires diagnostics.degraded === true
 */
export const RetrievalResponseSchema = BaseRetrievalResponseSchema.superRefine((val, ctx) => {
  if (val.outcome === 'NEEDS_CLARIFICATION') {
    if (!val.candidates || val.candidates.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['candidates'],
        message: 'NEEDS_CLARIFICATION outcome requires at least one candidate entity',
      });
    }
  }

  if (val.outcome === 'NO_EVIDENCE') {
    if (!val.reason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message: 'NO_EVIDENCE outcome requires a reason',
      });
    }
    if (!val.suggestedRefinements || val.suggestedRefinements.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['suggestedRefinements'],
        message: 'NO_EVIDENCE outcome requires suggestedRefinements',
      });
    }
  }

  if (val.outcome === 'UNSUPPORTED') {
    if (!val.unsupportedConstructs || val.unsupportedConstructs.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['unsupportedConstructs'],
        message: 'UNSUPPORTED outcome requires unsupportedConstructs list',
      });
    }
  }

  if (val.outcome === 'DEGRADED') {
    if (!val.diagnostics.degraded) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['diagnostics', 'degraded'],
        message: 'DEGRADED outcome requires diagnostics.degraded to be true',
      });
    }
  }
});

export type RetrievalResponse = z.infer<typeof RetrievalResponseSchema>;

export const FederatedSetTierAssignmentSchema = z.strictObject({
  setId: z.string().uuid(),
  tier: z.enum(['REQUIRED', 'LIKELY', 'OPTIONAL']),
  roleGroup: z.enum(['baseline', 'scope_diff']),
});

export const FederatedRetrievalBudgetsSchema = z.strictObject({
  concurrency: z.number().int().min(1).max(10),
  elapsedMs: z.number().int().min(100).max(120_000),
  maxSets: z.number().int().min(1).max(50),
  maxItems: z.number().int().min(1).max(200),
  maxEvidenceChars: z.number().int().min(1).max(100_000),
});

export const RetrievalContextHintsSchema = z.strictObject({
  setIds: z.array(z.string().uuid()).default([]),
  urns: z.array(z.string().min(1)).default([]),
  docIds: z.array(z.string().uuid()).default([]),
});

export type RetrievalContextHints = z.infer<typeof RetrievalContextHintsSchema>;

export const FederatedRetrievalRequestSchema = z.strictObject({
  query: z.string().trim().min(1).max(4000),
  setTierAssignments: z.array(FederatedSetTierAssignmentSchema).min(1).max(50),
  comparisonMode: z.enum(['single', 'baseline_vs_scope']).nullable(),
  budgets: FederatedRetrievalBudgetsSchema,
  limit: z.number().int().min(10).max(50).default(20),
  includeInferred: z.boolean().default(false),
  recentTurns: z.array(ConversationTurnSchema).max(3).default([]),
  contextHints: RetrievalContextHintsSchema.optional(),
});

export type FederatedRetrievalRequest = z.infer<typeof FederatedRetrievalRequestSchema>;

export const FederatedRetrievalItemSchema = z.strictObject({
  setId: z.string().uuid(),
  snapshotId: SnapshotIdSchema,
  roleGroup: z.enum(['baseline', 'scope_diff']),
  item: RetrievalItemSchema,
});

export const FederatedRetrievalPathSchema = z.strictObject({
  setId: z.string().uuid(),
  snapshotId: SnapshotIdSchema,
  roleGroup: z.enum(['baseline', 'scope_diff']),
  path: OrderedPathSchema,
});

export const FederatedConflictGroupSchema = z.strictObject({
  setId: z.string().uuid(),
  snapshotId: SnapshotIdSchema,
  roleGroup: z.enum(['baseline', 'scope_diff']),
  conflictGroup: ConflictGroupSchema,
});

export const FederatedCoverageWarningSchema = z.strictObject({
  code: z.enum(['TIMEOUT', 'STALE', 'ERROR', 'BUDGET_SETS', 'BUDGET_ITEMS', 'BUDGET_EVIDENCE', 'BUDGET_ELAPSED']),
  setId: z.string().uuid().nullable(),
  message: z.string().min(1).max(300),
});

export const FederatedRetrievalResponseSchema = z
  .strictObject({
    outcome: RetrievalOutcomeSchema,
    items: z.array(FederatedRetrievalItemSchema).max(200),
    paths: z.array(FederatedRetrievalPathSchema).max(100),
    conflictGroups: z.array(FederatedConflictGroupSchema).max(100),
    modalityStatus: ModalityStatusSchema,
    diagnostics: z.strictObject({
      degraded: z.boolean(),
      coverageWarnings: z.array(FederatedCoverageWarningSchema).max(100),
    }),
  })
  .superRefine((response, ctx) => {
    const snapshotsBySet = new Map<string, string>();
    const entries = [...response.items, ...response.paths, ...response.conflictGroups];
    entries.forEach((entry, index) => {
      const pinned = snapshotsBySet.get(entry.setId);
      if (pinned && pinned !== entry.snapshotId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', index, 'snapshotId'],
          message: 'One setId must not contain multiple snapshotIds',
        });
      } else {
        snapshotsBySet.set(entry.setId, entry.snapshotId);
      }
    });
    if (response.outcome === 'DEGRADED' && !response.diagnostics.degraded) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['diagnostics', 'degraded'],
        message: 'DEGRADED outcome requires diagnostics.degraded to be true',
      });
    }
  });

export type FederatedRetrievalResponse = z.infer<typeof FederatedRetrievalResponseSchema>;
