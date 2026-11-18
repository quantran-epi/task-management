import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  RetrievalRequestSchema,
  RetrievalResponseSchema,
  FederatedRetrievalRequestSchema,
  FederatedRetrievalResponseSchema,
  type FederatedSetCoverage,
} from '../types/retrievalProtocol.js';
import type { RetrievalService } from '../services/retrievalService.js';
import {
  runFederatedRetrieval,
  type FederatedRetrievalDependencies,
} from '../services/federatedRetrievalService.js';
import { resolveQueryOnlyScope, type PublishedSetEntry } from '../services/publishedSetDiscovery.js';
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

export interface QueryOnlyRouteDependencies {
  listPublishedSets(): PublishedSetEntry[];
}

function noPublishedSetsResponse() {
  return FederatedRetrievalResponseSchema.parse({
    outcome: 'NO_PUBLISHED_SETS',
    items: [],
    paths: [],
    conflictGroups: [],
    modalityStatus: {
      fulltext: { status: 'unavailable', latencyMs: 0, itemCount: 0, reason: 'NO_PUBLISHED_SETS' },
      vector: { status: 'unavailable', latencyMs: 0, itemCount: 0, reason: 'NO_PUBLISHED_SETS' },
      graph: { status: 'unavailable', latencyMs: 0, itemCount: 0, reason: 'NO_PUBLISHED_SETS' },
    },
    diagnostics: { degraded: false, coverageWarnings: [], coverage: [] },
  });
}

function degradedCoverageResponse(coverage: FederatedSetCoverage[]) {
  const unavailableStatus = {
    status: 'unavailable' as const,
    reason: 'NO_SEARCHABLE_SETS',
    itemCount: 0,
    latencyMs: 0,
  };
  return FederatedRetrievalResponseSchema.parse({
    outcome: 'DEGRADED',
    items: [],
    paths: [],
    conflictGroups: [],
    modalityStatus: {
      fulltext: unavailableStatus,
      vector: unavailableStatus,
      graph: unavailableStatus,
    },
    diagnostics: { degraded: true, coverageWarnings: [], coverage },
  });
}

export function registerRetrievalRoutes(
  app: FastifyInstance,
  retrievalService: Pick<RetrievalService, 'retrieve'> | undefined,
  federatedDeps?: FederatedRetrievalDependencies,
  queryOnlyDeps?: QueryOnlyRouteDependencies
) {
  // POST /api/v1/sets/:setId/retrieve
  app.post('/api/v1/sets/:setId/retrieve', async (request, reply) => {
    if (!retrievalService) {
      return reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'Route not available.' },
      });
    }
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
        ...(requestSignal ? [{ signal: requestSignal }] : [])
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

  // POST /api/v1/retrieve — query-only request, server-authoritative discovery.
  app.post('/api/v1/retrieve', async (request, reply) => {
    const body = FederatedRetrievalRequestSchema.safeParse(request.body);
    if (!body.success) {
      return invalid(reply);
    }

    const deps: FederatedRetrievalDependencies = federatedDeps ?? {
      retrievePerSet: (setId, req, signal) => {
        if (!retrievalService) throw new Error('RETRIEVAL_SERVICE_UNAVAILABLE');
        return retrievalService.retrieve(setId, req, signal ? { signal } : undefined);
      },
    };

    const requestSignal = (request.raw as any)?.signal as AbortSignal | undefined;

    try {
      const listPublishedSets =
        queryOnlyDeps?.listPublishedSets ?? (() => [] as PublishedSetEntry[]);
      const scope = await resolveQueryOnlyScope(body.data, { listPublishedSets });

      let response;
      if (scope.resolved === null && scope.outcome === 'NO_PUBLISHED_SETS') {
        response = noPublishedSetsResponse();
      } else if (scope.resolved === null && scope.outcome === 'DEGRADED') {
        // All requested ids were unknown: keep the full UNAVAILABLE ledger and
        // never collapse it into NO_EVIDENCE or NO_PUBLISHED_SETS (T-28-16).
        response = degradedCoverageResponse(scope.coverage);
      } else if (scope.resolved === null) {
        throw new Error('UNRESOLVED_SCOPE');
      } else {
        response = await runFederatedRetrieval(
          scope.resolved,
          deps,
          requestSignal ? { signal: requestSignal } : undefined
        );
        // Preserve the resolver's server-authoritative UNAVAILABLE rows (e.g.
        // an unknown id in a mixed explicit restriction) and its budget-overflow
        // NOT_SEARCHED_BUDGET rows. The fan-out ledger now owns every assigned
        // set exactly once, so add only resolver rows for sets the fan-out did
        // not see — never duplicate an assigned set.
        if (scope.coverage.length > 0) {
          const seen = new Set(response.diagnostics.coverage.map((row) => row.setId));
          const extra = scope.coverage.filter((row) => !seen.has(row.setId)).slice(0, 50 - response.diagnostics.coverage.length);
          if (extra.length > 0) {
            response = {
              ...response,
              diagnostics: {
                ...response.diagnostics,
                coverage: [...response.diagnostics.coverage, ...extra],
              },
            };
          }
        }
      }
      const validated = FederatedRetrievalResponseSchema.parse(response);
      request.log.info(
        { code: 'RETRIEVE_OK', setCount: scope.resolved?.setTierAssignments.length ?? 0, outcome: validated.outcome },
        'Federated retrieval completed'
      );
      return reply.code(200).send(validated);
    } catch {
      request.log.error({ code: 'INTERNAL_ERROR' }, 'Federated retrieval failed');
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Request could not be processed.' },
      });
    }
  });
}
