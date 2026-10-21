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

type SafeRetrievalErrorCode =
  | 'RESPONSE_VALIDATION_ERROR'
  | 'CANDIDATE_INTEGRITY_MISMATCH'
  | 'NEO4J_ERROR'
  | 'TYPE_ERROR'
  | 'ABORT_ERROR'
  | 'INTERNAL_ERROR';

function safeZodIssues(error: z.ZodError): Array<{ code: string; path: string }> {
  return error.issues.slice(0, 5).map((issue) => ({
    code: issue.code,
    path: issue.path
      .slice(0, 5)
      .map((segment) => {
        const value = String(segment);
        return /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : '[field]';
      })
      .join('.'),
  }));
}

function classifyRetrievalError(error: unknown): {
  errorCode: SafeRetrievalErrorCode;
  issues?: Array<{ code: string; path: string }>;
} {
  if (error instanceof z.ZodError) {
    return { errorCode: 'RESPONSE_VALIDATION_ERROR', issues: safeZodIssues(error) };
  }
  if (error instanceof Error && error.message === 'CANDIDATE_INTEGRITY_MISMATCH') {
    return { errorCode: 'CANDIDATE_INTEGRITY_MISMATCH' };
  }
  if (error instanceof Error && error.name === 'Neo4jError') {
    return { errorCode: 'NEO4J_ERROR' };
  }
  if (error instanceof Error && error.name === 'TypeError') {
    return { errorCode: 'TYPE_ERROR' };
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return { errorCode: 'ABORT_ERROR' };
  }
  return { errorCode: 'INTERNAL_ERROR' };
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

    const requestSignal = (request.raw as any)?.signal as AbortSignal | undefined;

    try {
      const response = await retrievalService.retrieve(
        params.data.setId,
        body.data,
        requestSignal ? { signal: requestSignal } : undefined
      );
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
    } catch (error: unknown) {
      const diagnostic = classifyRetrievalError(error);
      phaseLogger.log({
        outcome: 'error',
        latencyMs: Date.now() - startedAt,
        safeIds: params.success ? [params.data.setId] : [],
        counts: {},
        metadata: diagnostic,
      });
      request.log.error(
        {
          code: 'INTERNAL_ERROR',
          setId: params.data.setId,
          correlationId: phaseLogger.correlationId,
          ...diagnostic,
        },
        'Retrieval failed'
      );
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
      retrievePerSet: (setId, req, signal) =>
        retrievalService.retrieve(setId, req, signal ? { signal } : undefined),
    };

    const requestSignal = (request.raw as any)?.signal as AbortSignal | undefined;

    try {
      const response = await runFederatedRetrieval(
        body.data,
        deps,
        requestSignal ? { signal: requestSignal } : undefined
      );
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
