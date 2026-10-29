import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { OntologyRegistryService } from '../services/ontologyRegistryService.js';

const uuid = z.string().uuid();
const SetParamsSchema = z.object({ setId: uuid }).strict();
const ProposalParamsSchema = z.object({ proposalId: uuid }).strict();
const ProposalListQuerySchema = z.object({ setId: uuid.optional() }).strict();

function invalid(reply: FastifyReply) {
  return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: 'Request could not be processed.' } });
}

function proposalError(reply: FastifyReply, error: unknown) {
  const code = error instanceof Error ? error.message : '';
  if (code === 'PROPOSAL_NOT_FOUND') {
    return reply.code(404).send({ error: { code, message: 'Ontology proposal was not found.' } });
  }
  if (code === 'PROPOSAL_ALREADY_REJECTED' || code === 'PROPOSAL_ALREADY_ACCEPTED') {
    return reply.code(409).send({ error: { code, message: 'Ontology proposal has already been decided.' } });
  }
  return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Request could not be processed.' } });
}

export function registerOntologyRoutes(app: FastifyInstance, registry: OntologyRegistryService) {
  app.get('/api/v1/ontology', async (_request, reply) => {
    return reply.code(200).send(await registry.getEffectiveOntology());
  });

  app.get('/api/v1/ontology/proposals', async (request, reply) => {
    const query = ProposalListQuerySchema.safeParse(request.query);
    if (!query.success) return invalid(reply);
    return reply.code(200).send({ proposals: await registry.listProposals(query.data.setId) });
  });

  app.post('/api/v1/ontology/proposals/:proposalId/accept', async (request, reply) => {
    const params = ProposalParamsSchema.safeParse(request.params);
    if (!params.success) return invalid(reply);
    try {
      const result = await registry.acceptProposal(params.data.proposalId);
      return reply.code(200).send(result);
    } catch (error: unknown) {
      return proposalError(reply, error);
    }
  });

  app.post('/api/v1/ontology/proposals/:proposalId/reject', async (request, reply) => {
    const params = ProposalParamsSchema.safeParse(request.params);
    if (!params.success) return invalid(reply);
    try {
      return reply.code(200).send({ proposal: await registry.rejectProposal(params.data.proposalId) });
    } catch (error: unknown) {
      return proposalError(reply, error);
    }
  });

  // Keeps route ownership explicit for clients that use set-scoped links.
  app.get('/api/v1/sets/:setId/ontology/proposals', async (request, reply) => {
    const params = SetParamsSchema.safeParse(request.params);
    if (!params.success) return invalid(reply);
    return reply.code(200).send({ proposals: await registry.listProposals(params.data.setId) });
  });
}
