import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  RetrievalRequestSchema,
  RetrievalResponseSchema,
} from '../types/retrievalProtocol.js';
import type { RetrievalService } from '../services/retrievalService.js';

const uuid = z.string().uuid();
const SetParamsSchema = z.object({ setId: uuid }).strict();

function invalid(reply: FastifyReply) {
  return reply.code(400).send({
    error: { code: 'INVALID_REQUEST', message: 'Request could not be processed.' },
  });
}

export function registerRetrievalRoutes(
  app: FastifyInstance,
  retrievalService: Pick<RetrievalService, 'retrieve'>
) {
  // POST /api/v1/sets/:setId/retrieve
  app.post('/api/v1/sets/:setId/retrieve', async (request, reply) => {
    const params = SetParamsSchema.safeParse(request.params);
    const body = RetrievalRequestSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return invalid(reply);
    }

    try {
      const response = await retrievalService.retrieve(params.data.setId, body.data);
      const validated = RetrievalResponseSchema.parse(response);
      return reply.code(200).send(validated);
    } catch {
      request.log.error({ code: 'INTERNAL_ERROR', setId: params.data.setId }, 'Retrieval failed');
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Request could not be processed.' },
      });
    }
  });
}
