import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  UrnSchema,
  FactKeySchema,
  EvidenceClassificationSchema,
  ExtractionMethodSchema,
} from '../types/graphProtocol.js';
import {
  GraphBuildService,
  GraphBuildInProgressError,
  GraphCASConflictError,
  GraphRollbackError,
} from '../services/graphBuildService.js';

export {
  GraphBuildService,
  GraphBuildInProgressError,
  GraphCASConflictError,
  GraphRollbackError,
};

const uuid = z.string().uuid();
const SetParamsSchema = z.object({ setId: uuid }).strict();
const FactEvidenceParamsSchema = z.object({ setId: uuid, factKey: FactKeySchema }).strict();
const RebuildHeadersSchema = z.object({ 'x-rebuild-key': uuid }).passthrough();

/**
 * Graph build state and stage schemas per D-18, Pattern 7, UI Spec
 */
export const GraphStateSchema = z.enum([
  'Never built',
  'Building',
  'Active',
  'Active with warnings',
  'Failed',
]);
export type GraphState = z.infer<typeof GraphStateSchema>;

export const GraphBuildStageSchema = z.enum([
  'Preparing',
  'Structured extraction',
  'Prose extraction',
  'Validation',
  'Retrieval generation',
  'Activation',
]);
export type GraphBuildStage = z.infer<typeof GraphBuildStageSchema>;

export const CandidateStatusSchema = z.enum([
  'NONE',
  'PREPARING',
  'READY',
  'FAILED',
]);
export type CandidateStatus = z.infer<typeof CandidateStatusSchema>;

export const GraphStatusProgressSchema = z
  .object({
    processedChunks: z.number().int().nonnegative(),
    totalChunks: z.number().int().nonnegative(),
    percent: z.number().min(0).max(100),
    currentDocumentTitle: z.string().optional(),
    stageMessage: z.string().optional(),
  })
  .strict();
export type GraphStatusProgress = z.infer<typeof GraphStatusProgressSchema>;

export const GraphStatusDTOSchema = z
  .object({
    setId: uuid,
    state: GraphStateSchema,
    activeGraphSnapshotId: uuid.optional(),
    currentStage: GraphBuildStageSchema.optional(),
    progress: GraphStatusProgressSchema.optional(),
    nodeCount: z.number().int().nonnegative(),
    factCount: z.number().int().nonnegative(),
    evidenceCount: z.number().int().nonnegative(),
    conflictCount: z.number().int().nonnegative(),
    quarantineCount: z.number().int().nonnegative(),
    ontologyVersion: z.string().min(1),
    rulesVersion: z.string().min(1),
    activatedAt: z.string().datetime().optional(),
    candidateSnapshotId: uuid.optional(),
    candidateStatus: CandidateStatusSchema.optional(),
    priorSnapshotId: uuid.optional(),
    rollbackExpiresAt: z.string().datetime().optional(),
    canRollback: z.boolean().default(false),
    error: z
      .object({
        code: z.string().max(80),
        message: z.string().max(240),
        details: z.string().max(400).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type GraphStatusDTO = z.infer<typeof GraphStatusDTOSchema>;

export const FactSummaryDTOSchema = z
  .object({
    factKey: FactKeySchema,
    subjectUrn: UrnSchema,
    subjectName: z.string(),
    subjectKind: z.string(),
    relation: z.string(),
    objectUrn: UrnSchema,
    objectName: z.string(),
    objectKind: z.string(),
    effectiveClassification: EvidenceClassificationSchema,
    evidenceCount: z.number().int().nonnegative(),
    hasConflict: z.boolean(),
    qualifiers: z.record(z.string(), z.string()),
  })
  .strict();
export type FactSummaryDTO = z.infer<typeof FactSummaryDTOSchema>;

export const FactsListDTOSchema = z
  .object({
    setId: uuid,
    graphSnapshotId: uuid,
    totalFacts: z.number().int().nonnegative(),
    facts: z.array(FactSummaryDTOSchema),
  })
  .strict();
export type FactsListDTO = z.infer<typeof FactsListDTOSchema>;

export const EvidenceRecordDTOSchema = z
  .object({
    evidenceId: uuid,
    documentId: uuid,
    documentTitle: z.string(),
    headingPath: z.array(z.string()),
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().nonnegative(),
    method: ExtractionMethodSchema,
    classification: EvidenceClassificationSchema,
    confidence: z.number().min(0).max(1),
    quote: z.string(),
    environment: z.string().optional(),
    conflictBranch: z.enum(['A', 'B']).optional(),
  })
  .strict();
export type EvidenceRecordDTO = z.infer<typeof EvidenceRecordDTOSchema>;

export const FactEvidenceDetailDTOSchema = z
  .object({
    setId: uuid,
    factKey: FactKeySchema,
    subjectUrn: UrnSchema,
    relation: z.string(),
    objectUrn: UrnSchema,
    effectiveClassification: EvidenceClassificationSchema,
    hasConflict: z.boolean(),
    qualifiers: z.record(z.string(), z.string()),
    occurrences: z.array(EvidenceRecordDTOSchema),
  })
  .strict();
export type FactEvidenceDetailDTO = z.infer<typeof FactEvidenceDetailDTOSchema>;

export const QuarantineItemDTOSchema = z
  .object({
    rawIdentifier: z.string(),
    reason: z.string(),
    documentId: uuid,
    headingPath: z.array(z.string()),
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
    method: ExtractionMethodSchema,
    candidateMatches: z.array(z.string()),
  })
  .strict();
export type QuarantineItemDTO = z.infer<typeof QuarantineItemDTOSchema>;

export const QuarantineListDTOSchema = z
  .object({
    setId: uuid,
    graphSnapshotId: uuid,
    totalQuarantines: z.number().int().nonnegative(),
    quarantines: z.array(QuarantineItemDTOSchema),
  })
  .strict();
export type QuarantineListDTO = z.infer<typeof QuarantineListDTOSchema>;

export const RetryChunksBodySchema = z
  .object({
    chunkIds: z.array(z.string()).optional(),
  })
  .strict();
export type RetryChunksBody = z.infer<typeof RetryChunksBodySchema>;

export const ChunkStatusItemDTOSchema = z
  .object({
    chunkId: z.string(),
    documentId: uuid,
    documentTitle: z.string(),
    chunkIndex: z.number().int().nonnegative(),
    totalChunksInDoc: z.number().int().nonnegative(),
    status: z.enum(['PENDING', 'EXTRACTING', 'SUCCESS', 'FAILED']),
    error: z.string().optional(),
    updatedAt: z.string(),
    nodesCount: z.number().int().nonnegative(),
    factsCount: z.number().int().nonnegative(),
  })
  .strict();
export type ChunkStatusItemDTO = z.infer<typeof ChunkStatusItemDTOSchema>;

export const ChunksListDTOSchema = z
  .object({
    setId: uuid,
    total: z.number().int().nonnegative(),
    success: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    extracting: z.number().int().nonnegative(),
    chunks: z.array(ChunkStatusItemDTOSchema),
  })
  .strict();
export type ChunksListDTO = z.infer<typeof ChunksListDTOSchema>;

export const RebuildAcceptedDTOSchema = z
  .object({
    setId: uuid,
    rebuildKey: uuid,
    status: z.literal('ACCEPTED'),
    candidateSnapshotId: uuid,
  })
  .strict();
export type RebuildAcceptedDTO = z.infer<typeof RebuildAcceptedDTOSchema>;

export const ActivateCandidateBodySchema = z
  .object({
    candidateSnapshotId: uuid,
    expectedPriorSnapshotId: uuid.optional(),
  })
  .strict();
export type ActivateCandidateBody = z.infer<typeof ActivateCandidateBodySchema>;

function invalid(reply: FastifyReply) {
  return reply.code(400).send({
    error: { code: 'INVALID_REQUEST', message: 'Request could not be processed.' },
  });
}

export function registerGraphRoutes(app: FastifyInstance, buildService: GraphBuildService) {
  // 1. POST /api/v1/sets/:setId/graph/rebuild
  app.post('/api/v1/sets/:setId/graph/rebuild', async (request, reply) => {
    const params = SetParamsSchema.safeParse(request.params);
    const headers = RebuildHeadersSchema.safeParse(request.headers);
    if (!params.success || !headers.success) return invalid(reply);

    try {
      const result = await buildService.triggerRebuild(
        params.data.setId,
        headers.data['x-rebuild-key']
      );
      return reply.code(202).send(RebuildAcceptedDTOSchema.parse(result));
    } catch (err: unknown) {
      if (err instanceof GraphBuildInProgressError) {
        return reply.code(409).send({
          error: {
            code: err.code,
            message: 'A graph rebuild is already in progress for this document set.',
          },
        });
      }
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Request could not be processed.' },
      });
    }
  });

  // 1b. POST /api/v1/sets/:setId/graph/activate
  app.post('/api/v1/sets/:setId/graph/activate', async (request, reply) => {
    const params = SetParamsSchema.safeParse(request.params);
    const body = ActivateCandidateBodySchema.safeParse(request.body);
    if (!params.success || !body.success) return invalid(reply);

    try {
      await buildService.activateCandidate(
        params.data.setId,
        body.data.candidateSnapshotId,
        body.data.expectedPriorSnapshotId
      );
      const status = await buildService.getStatus(params.data.setId);
      return reply.code(200).send(GraphStatusDTOSchema.parse(status));
    } catch (err: unknown) {
      if (err instanceof GraphCASConflictError) {
        return reply.code(409).send({
          error: {
            code: err.code,
            message: err.message,
          },
        });
      }
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Request could not be processed.' },
      });
    }
  });

  // 1c. POST /api/v1/sets/:setId/graph/rollback
  app.post('/api/v1/sets/:setId/graph/rollback', async (request, reply) => {
    const params = SetParamsSchema.safeParse(request.params);
    if (!params.success) return invalid(reply);

    try {
      await buildService.rollbackCandidate(params.data.setId);
      const status = await buildService.getStatus(params.data.setId);
      return reply.code(200).send(GraphStatusDTOSchema.parse(status));
    } catch (err: unknown) {
      if (err instanceof GraphRollbackError) {
        const statusCode = err.code === 'ROLLBACK_EXPIRED' ? 409 : 400;
        return reply.code(statusCode).send({
          error: {
            code: err.code,
            message: err.message,
          },
        });
      }
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Request could not be processed.' },
      });
    }
  });

  // 2. GET /api/v1/sets/:setId/graph/status
  app.get('/api/v1/sets/:setId/graph/status', async (request, reply) => {
    const params = SetParamsSchema.safeParse(request.params);
    if (!params.success) return invalid(reply);

    const status = await buildService.getStatus(params.data.setId);
    return reply.code(200).send(GraphStatusDTOSchema.parse(status));
  });

  // 3. GET /api/v1/sets/:setId/graph/facts
  app.get('/api/v1/sets/:setId/graph/facts', async (request, reply) => {
    const params = SetParamsSchema.safeParse(request.params);
    if (!params.success) return invalid(reply);

    try {
      const facts = await buildService.getFacts(params.data.setId);
      return reply.code(200).send(FactsListDTOSchema.parse(facts));
    } catch (err: any) {
      if (err?.message === 'ACTIVE_GRAPH_NOT_FOUND') {
        return reply.code(404).send({
          error: { code: 'GRAPH_NOT_FOUND', message: 'No active graph for this document set.' },
        });
      }
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Request could not be processed.' },
      });
    }
  });

  // 4. GET /api/v1/sets/:setId/graph/facts/:factKey/evidence
  app.get('/api/v1/sets/:setId/graph/facts/:factKey/evidence', async (request, reply) => {
    const params = FactEvidenceParamsSchema.safeParse(request.params);
    if (!params.success) return invalid(reply);

    try {
      const evidence = await buildService.getEvidence(params.data.setId, params.data.factKey);
      return reply.code(200).send(FactEvidenceDetailDTOSchema.parse(evidence));
    } catch (err: any) {
      if (err?.message === 'ACTIVE_GRAPH_NOT_FOUND') {
        return reply.code(404).send({
          error: { code: 'GRAPH_NOT_FOUND', message: 'No active graph for this document set.' },
        });
      }
      if (err?.message === 'FACT_NOT_FOUND') {
        return reply.code(404).send({
          error: { code: 'FACT_NOT_FOUND', message: 'Fact not found in active graph.' },
        });
      }
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Request could not be processed.' },
      });
    }
  });

  // 5. GET /api/v1/sets/:setId/graph/quarantine
  app.get('/api/v1/sets/:setId/graph/quarantine', async (request, reply) => {
    const params = SetParamsSchema.safeParse(request.params);
    if (!params.success) return invalid(reply);

    try {
      const quarantines = await buildService.getQuarantines(params.data.setId);
      return reply.code(200).send(QuarantineListDTOSchema.parse(quarantines));
    } catch (err: any) {
      if (err?.message === 'ACTIVE_GRAPH_NOT_FOUND') {
        return reply.code(404).send({
          error: { code: 'GRAPH_NOT_FOUND', message: 'No active graph for this document set.' },
        });
      }
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Request could not be processed.' },
      });
    }
  });

  // 6. GET /api/v1/sets/:setId/graph/chunks
  app.get('/api/v1/sets/:setId/graph/chunks', async (request, reply) => {
    const params = SetParamsSchema.safeParse(request.params);
    if (!params.success) return invalid(reply);

    const chunkData = buildService.getChunkStatusList(params.data.setId);
    return reply.code(200).send(ChunksListDTOSchema.parse(chunkData));
  });

  // 7. POST /api/v1/sets/:setId/graph/retry-chunks
  app.post('/api/v1/sets/:setId/graph/retry-chunks', async (request, reply) => {
    const params = SetParamsSchema.safeParse(request.params);
    const headers = RebuildHeadersSchema.safeParse(request.headers);
    const body = RetryChunksBodySchema.safeParse(request.body || {});
    if (!params.success || !headers.success || !body.success) return invalid(reply);

    try {
      const result = await buildService.triggerRetryChunks(
        params.data.setId,
        headers.data['x-rebuild-key'],
        body.data.chunkIds
      );
      return reply.code(202).send(RebuildAcceptedDTOSchema.parse(result));
    } catch (err: unknown) {
      if (err instanceof GraphBuildInProgressError) {
        return reply.code(409).send({
          error: {
            code: err.code,
            message: 'A graph build or retry is already in progress.',
          },
        });
      }
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Request could not be processed.' },
      });
    }
  });
}
