import { describe, expect, it } from 'vitest';
import * as client from '../../src/services/knowledge/retrievalProtocol';
import * as server from '../../knowledge-server/src/types/retrievalProtocol';

/**
 * The client mirror is strict, so any drift from the server rejects a valid
 * response and silently degrades grounded answers to BM25 (Pitfall 8).
 * These tests fail the build instead of letting that drift ship.
 */
describe('retrieval protocol server/client parity', () => {
  it('mirrors retrieval outcomes in the same declaration order', () => {
    expect(client.RETRIEVAL_OUTCOMES).toEqual(server.RETRIEVAL_OUTCOMES);
    expect(client.RETRIEVAL_OUTCOMES).toContain('SEED_ONLY');
  });

  it('mirrors reason codes in the same declaration order', () => {
    expect(client.REASON_CODES).toEqual(server.REASON_CODES);
    for (const code of [
      'INVALID_RELATION',
      'INVALID_DIRECTION',
      'INVALID_ENDPOINT_KIND',
      'HOP_LIMIT_EXCEEDED',
      'SEED_NOT_FOUND',
      'PLAN_REJECTED',
      'SEED_FOUND_NO_RELATION',
      'FALLBACK_ONE_HOP',
      'MISSING_SUPPORTING_CHUNK',
    ]) {
      expect(client.REASON_CODES).toContain(code);
    }
  });

  it('mirrors stage names in the same declaration order', () => {
    expect(client.STAGE_NAMES).toEqual(server.STAGE_NAMES);
  });

  it('mirrors the model depth input cap', () => {
    expect(client.MODEL_DEPTH_INPUT_CAP).toBe(server.MODEL_DEPTH_INPUT_CAP);
    expect(client.MODEL_DEPTH_INPUT_CAP).toBe(10);
  });

  it('mirrors stage diagnostic and failed seed key sets', () => {
    expect(Object.keys(client.StageDiagnosticSchema.shape).sort()).toEqual(
      Object.keys(server.StageDiagnosticSchema.shape).sort()
    );
    expect(Object.keys(client.FailedSeedSchema.shape).sort()).toEqual(
      Object.keys(server.FailedSeedSchema.shape).sort()
    );
    expect(Object.keys(client.GraphRetainedCountsSchema.shape).sort()).toEqual(
      Object.keys(server.GraphRetainedCountsSchema.shape).sort()
    );
  });

  it('mirrors modality status detail and retrieval diagnostics key sets', () => {
    expect(Object.keys(client.ModalityStatusDetailSchema.shape).sort()).toEqual(
      Object.keys(server.ModalityStatusDetailSchema.shape).sort()
    );
    expect(Object.keys(client.RetrievalDiagnosticsSchema.shape).sort()).toEqual(
      Object.keys(server.RetrievalDiagnosticsSchema.shape).sort()
    );
  });

  it('mirrors federated diagnostics key sets', () => {
    expect(Object.keys(client.FederatedRetrievalResponseSchema.shape.diagnostics.shape).sort()).toEqual(
      Object.keys(server.FederatedRetrievalResponseSchema.shape.diagnostics.shape).sort()
    );
  });
});
