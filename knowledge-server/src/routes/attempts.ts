import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  AttemptService,
  SetPublishInProgressError,
  type AttemptResource,
} from '../services/attemptService.js';
import { PublishAttemptRequestSchema } from '../types/protocol.js';

const uuid = z.string().uuid();
const SetParamsSchema = z.object({ setId: uuid }).strict();
const AttemptParamsSchema = z.object({ attemptId: uuid }).strict();
const AttemptKeyHeadersSchema = z.object({ 'x-attempt-key': uuid }).passthrough();
const AttemptResponseSchema = z
  .object({
    attemptId: uuid,
    setId: uuid,
    status: z.enum(['Publishing', 'In sync', 'Failed']),
    startedAt: z.iso.datetime(),
    completedAt: z.iso.datetime().optional(),
    metrics: z
      .object({
        addedCount: z.number().int().nonnegative(),
        changedCount: z.number().int().nonnegative(),
        removedCount: z.number().int().nonnegative(),
        unchangedCount: z.number().int().nonnegative(),
        warningCount: z.number().int().nonnegative(),
        durationMs: z.number().int().nonnegative().optional(),
      })
      .strict(),
    error: z
      .object({
        code: z.string().max(80),
        message: z.string().max(240),
        documentId: uuid.optional(),
        line: z.number().int().positive().optional(),
        column: z.number().int().positive().optional(),
      })
      .strict()
      .optional(),
    activeSnapshotId: uuid.optional(),
  })
  .strict();

const SAFE_MESSAGE = 'Request could not be processed.';

function metrics(attempt: AttemptResource) {
  return {
    addedCount: attempt.metrics.documentsAdded,
    changedCount: attempt.metrics.documentsChanged,
    removedCount: attempt.metrics.documentsRemoved,
    unchangedCount: attempt.metrics.documentsUnchanged,
    warningCount: 0,
    ...(attempt.completedAt
      ? {
          durationMs: Math.max(
            0,
            new Date(attempt.completedAt).getTime() - new Date(attempt.startedAt).getTime()
          ),
        }
      : {}),
  };
}

export function serializeAttempt(attempt: AttemptResource) {
  return AttemptResponseSchema.parse({
    attemptId: attempt.attemptId,
    setId: attempt.setId,
    status: attempt.status,
    startedAt: attempt.startedAt,
    ...(attempt.completedAt ? { completedAt: attempt.completedAt } : {}),
    metrics: metrics(attempt),
    ...(attempt.error
      ? {
          error: {
            code: attempt.error.code,
            message: attempt.error.message,
            ...(attempt.error.documentId ? { documentId: attempt.error.documentId } : {}),
            ...(attempt.error.line ? { line: attempt.error.line } : {}),
            ...(attempt.error.column ? { column: attempt.error.column } : {}),
          },
        }
      : {}),
    ...(attempt.activeSnapshotId ? { activeSnapshotId: attempt.activeSnapshotId } : {}),
  });
}

function invalid(reply: FastifyReply) {
  return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: SAFE_MESSAGE } });
}

export function registerAttemptRoutes(app: FastifyInstance, attemptService: AttemptService) {
  app.post('/api/v1/sets/:setId/attempts', async (request, reply) => {
    const params = SetParamsSchema.safeParse(request.params);
    const headers = AttemptKeyHeadersSchema.safeParse(request.headers);
    const body = PublishAttemptRequestSchema.safeParse(request.body);
    if (!params.success || !headers.success || !body.success) return invalid(reply);

    try {
      const attempt = attemptService.accept(
        params.data.setId,
        headers.data['x-attempt-key'],
        body.data
      );
      return reply.code(202).send(serializeAttempt(attempt));
    } catch (error: unknown) {
      if (error instanceof SetPublishInProgressError) {
        return reply.code(409).send({
          error: {
            code: error.code,
            message: 'A publish attempt is already active for this document set.',
          },
        });
      }
      throw error;
    }
  });

  app.get('/api/v1/attempts/:attemptId', async (request, reply) => {
    const params = AttemptParamsSchema.safeParse(request.params);
    if (!params.success) return invalid(reply);
    const attempt = attemptService.getAttempt(params.data.attemptId);
    if (!attempt) {
      return reply.code(404).send({
        error: { code: 'ATTEMPT_NOT_FOUND', message: 'Publish attempt was not found.' },
      });
    }
    return serializeAttempt(attempt);
  });
}
