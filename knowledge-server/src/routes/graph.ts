import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  UrnSchema,
  FactKeySchema,
  EvidenceClassificationSchema,
  ExtractionMethodSchema,
} from '../types/graphProtocol.js';
import { GraphBuildService, GraphBuildInProgressError } from '../services/graphBuildService.js';

export { GraphBuildService, GraphBuildInProgressError };

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
  'Activation',
]);
export type GraphBuildStage = z.infer<typeof GraphBuildStageSchema>;

export const GraphStatusDTOSchema = z
  .object({
    setId: uuid,
    state: GraphStateSchema,
    activeGraphSnapshotId: uuid.optional(),
    currentStage: GraphBuildStageSchema.optional(),
    nodeCount: z.number().int().nonnegative(),
    factCount: z.number().int().nonnegative(),
    evidenceCount: z.number().int().nonnegative(),
    conflictCount: z.number().int().nonnegative(),
    quarantineCount: z.number().int().nonnegative(),
    ontologyVersion: z.string().min(1),
    rulesVersion: z.string().min(1),
    activatedAt: z.string().datetime().optional(),
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

export const RebuildAcceptedDTOSchema = z
  .object({
    setId: uuid,
    rebuildKey: uuid,
    status: z.literal('ACCEPTED'),
    candidateSnapshotId: uuid,
  })
  .strict();
export type RebuildAcceptedDTO = z.infer<typeof RebuildAcceptedDTOSchema>;

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
}
