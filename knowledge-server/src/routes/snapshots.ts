import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { ProjectionSnapshot } from '../indexing/incrementalProjector.js';
import type { AttemptService } from '../services/attemptService.js';

const SetParamsSchema = z.object({ setId: z.string().uuid() }).strict();

function invalid(reply: FastifyReply) {
  return reply.code(400).send({
    error: { code: 'INVALID_REQUEST', message: 'Request could not be processed.' },
  });
}

export function serializeSnapshot(snapshot: ProjectionSnapshot) {
  return {
    snapshotId: snapshot.snapshotId,
    setId: snapshot.setId,
    chunkingPolicyVersion: snapshot.chunkingPolicyVersion,
    documents: snapshot.documents.map((document) => ({
      documentId: document.documentId,
      contentHash: document.contentHash,
      chunks: document.chunks.map((chunk) => ({
        occurrenceId: chunk.occurrenceId,
        contentHash: chunk.contentHash,
        chunkIndex: chunk.chunkIndex,
        headingPath: chunk.headingPath,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        startOffset: chunk.startOffset,
        endOffset: chunk.endOffset,
      })),
    })),
  };
}

export function registerSnapshotRoutes(app: FastifyInstance, attemptService: AttemptService) {
  app.get('/api/v1/sets/:setId/snapshot', async (request, reply) => {
    const params = SetParamsSchema.safeParse(request.params);
    if (!params.success) return invalid(reply);
    const snapshot = attemptService.getActiveSnapshot(params.data.setId);
    if (!snapshot) {
      return reply.code(404).send({
        error: { code: 'SNAPSHOT_NOT_FOUND', message: 'Active snapshot was not found.' },
      });
    }
    return serializeSnapshot(snapshot);
  });
}
