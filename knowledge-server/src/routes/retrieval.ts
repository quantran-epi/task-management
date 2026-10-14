import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  RetrievalRequestSchema,
  RetrievalResponseSchema,
  FederatedRetrievalRequestSchema,
  FederatedRetrievalResponseSchema,
} from '../types/retrievalProtocol.js';
import type { RetrievalService } from '../services/retrievalService.js';
import {
  runFederatedRetrieval,
  type FederatedRetrievalDependencies,
} from '../services/federatedRetrievalService.js';
import { createRetrievalLogger } from '../retrieval/retrievalLogger.js';

const uuid = z.string().uuid();
const SetParamsSchema = z.object({ setId: uuid }).strict();

function invalid(reply: FastifyReply) {
  return reply.code(400).send({
    error: { code: 'INVALID_REQUEST', message: 'Request could not be processed.' },
  });
}

export function registerRetrievalRoutes(
  app: FastifyInstance,
  retrievalService: Pick<RetrievalService, 'retrieve'>,
  federatedDeps?: FederatedRetrievalDependencies
) {
  // POST /api/v1/sets/:setId/retrieve
  app.post('/api/v1/sets/:setId/retrieve', async (request, reply) => {
    const params = SetParamsSchema.safeParse(request.params);
    const body = RetrievalRequestSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return invalid(reply);
    }

    const startedAt = Date.now();
    const correlationHeader = request.headers['x-correlation-id'];
    const correlationId = Array.isArray(correlationHeader) ? correlationHeader[0] : correlationHeader;
    const phaseLogger = createRetrievalLogger('[RETRIEVE]', correlationId ? { correlationId } : {});

    try {
      const response = await retrievalService.retrieve(params.data.setId, body.data);
      const validated = RetrievalResponseSchema.parse(response);
      phaseLogger.log({
        outcome: validated.outcome === 'DEGRADED' ? 'degraded' : 'ok',
        latencyMs: Date.now() - startedAt,
        safeIds: [params.data.setId, validated.snapshotId],
        counts: {
          items: validated.items.length,
          totalCandidates: validated.totalCandidates,
          modalitiesUsed: validated.modalitiesUsed.length,
        },
        metadata: {
          outcome: validated.outcome,
          fastPath: validated.planTrace.fastPath,
          degraded: validated.diagnostics.degraded,
        },
      });
      return reply.code(200).send(validated);
    } catch {
      phaseLogger.log({
        outcome: 'error',
        latencyMs: Date.now() - startedAt,
        safeIds: params.success ? [params.data.setId] : [],
        counts: {},
        metadata: { code: 'INTERNAL_ERROR' },
      });
      request.log.error({ code: 'INTERNAL_ERROR', setId: params.data.setId, correlationId: phaseLogger.correlationId }, 'Retrieval failed');
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Request could not be processed.' },
      });
    }
  });

  // POST /api/v1/retrieve
  app.post('/api/v1/retrieve', async (request, reply) => {
    const body = FederatedRetrievalRequestSchema.safeParse(request.body);
    if (!body.success) {
      return invalid(reply);
    }

    const deps: FederatedRetrievalDependencies = federatedDeps ?? {
      retrievePerSet: (setId, req) => retrievalService.retrieve(setId, req),
    };

    try {
      const response = await runFederatedRetrieval(body.data, deps);
      const validated = FederatedRetrievalResponseSchema.parse(response);
      return reply.code(200).send(validated);
    } catch {
      request.log.error({ code: 'INTERNAL_ERROR' }, 'Federated retrieval failed');
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Request could not be processed.' },
      });
    }
  });
}
