import { describe, expect, it } from 'vitest';
import {
  BaseRetrievalResponseSchema,
  ChunkItemSchema,
  ConflictGroupSchema,
  OrderedPathSchema,
  ScopeProofSchema,
} from '../src/types/retrievalProtocol.js';

const snapshotId = 'gsnap_01234567';
const otherSnapshotId = 'gsnap_89abcdef';
const documentId = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
const hash = 'a'.repeat(64);
const factKeyA = '1'.repeat(64);
const factKeyB = '2'.repeat(64);
const urns = [
  'urn:plannermate:smartvista:ScheduledProcess:60000006',
  'urn:plannermate:smartvista:SoftwareComponent:CALCULATOR',
  'urn:plannermate:oracle:DatabaseObject:MAIN1.CREDIT_DATA',
];

function validPath() {
  return {
    pathId: 'P1',
    snapshotId,
    nodeUrns: urns,
    edgeFactKeys: [factKeyA, factKeyB],
    hopClassifications: ['OBSERVED', 'INFERRED'],
    hopCitationIds: [['S1'], ['S2']],
    hasConflict: false,
    classification: 'INFERRED',
  };
}

function validChunk(id = 'S1') {
  return {
    type: 'chunk',
    id,
    score: 1,
    modalitiesContributed: ['fulltext'],
    sourceDocumentId: documentId,
    sourceDocumentTitle: 'Credit calculation flow',
    sectionAnchor: 'flow',
    lineStart: 1,
    lineEnd: 3,
    rawSnippet: 'Evidence',
    publishedContentHash: hash,
    snapshotId,
    hasConflict: false,
  };
}

function validResponse() {
  return {
    outcome: 'READY',
    snapshotId,
    embeddingProvider: {
      provider: 'local-onnx',
      model: 'multilingual-e5-small',
      revision: 'v1',
      dimensions: 384,
      policyVersion: '2026.10.1',
    },
    items: [validChunk('S1'), validChunk('S2')],
    paths: [validPath()],
    totalCandidates: 2,
    modalitiesUsed: ['fulltext', 'graph'],
    modalityStatus: {
      fulltext: { status: 'ok', latencyMs: 1, itemCount: 2 },
      vector: { status: 'unavailable', latencyMs: 0, itemCount: 0 },
      graph: { status: 'ok', latencyMs: 1, itemCount: 2 },
    },
    diagnostics: { degraded: false },
    planTrace: { fastPath: false, degradedFallback: false },
  };
}

function validConflictGroup() {
  return { conflictGroupId: 'conflict-1', dimension: 'Unknown' };
}

describe('retrieval path protocol', () => {
  it('accepts an ordered two-hop path', () => {
    expect(OrderedPathSchema.safeParse(validPath()).success).toBe(true);
  });

  it('rejects broken node and edge adjacency', () => {
    const result = OrderedPathSchema.safeParse({ ...validPath(), edgeFactKeys: [factKeyA] });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(['edgeFactKeys']);
  });

  it('rejects misaligned hop classifications', () => {
    const result = OrderedPathSchema.safeParse({ ...validPath(), hopClassifications: ['OBSERVED'] });
    expect(result.success).toBe(false);
  });

  it('rejects empty hop citation groups', () => {
    const result = OrderedPathSchema.safeParse({ ...validPath(), hopCitationIds: [[], ['S2']] });
    expect(result.success).toBe(false);
  });

  it('rejects path citations absent from returned chunks', () => {
    const response = validResponse();
    response.paths[0] = { ...validPath(), hopCitationIds: [['S1'], ['missing']] };
    expect(BaseRetrievalResponseSchema.safeParse(response).success).toBe(false);
  });

  it('rejects path snapshots outside response snapshot', () => {
    const response = validResponse();
    response.paths[0] = { ...validPath(), snapshotId: otherSnapshotId };
    expect(BaseRetrievalResponseSchema.safeParse(response).success).toBe(false);
  });

  it('rejects chunk without immutable source title or content hash', () => {
    const { sourceDocumentTitle: _title, ...withoutTitle } = validChunk();
    const { publishedContentHash: _hash, ...withoutHash } = validChunk();
    expect(ChunkItemSchema.safeParse(withoutTitle).success).toBe(false);
    expect(ChunkItemSchema.safeParse(withoutHash).success).toBe(false);
  });

  it.each([hash.toUpperCase(), hash.slice(1), `${'a'.repeat(63)}z`])(
    'rejects malformed published content hash %s',
    (publishedContentHash) => {
      expect(ChunkItemSchema.safeParse({ ...validChunk(), publishedContentHash }).success).toBe(false);
    }
  );

  it('rejects invented conflict dimensions', () => {
    const result = ScopeProofSchema.safeParse({
      dimension: 'License',
      environment: null,
      version: null,
      overrideRelation: null,
    });
    expect(result.success).toBe(false);
  });

  it('rejects details attached to Unknown conflict scope', () => {
    const result = ConflictGroupSchema.safeParse({
      ...validConflictGroup(),
      scopeProof: {
        dimension: 'Unknown',
        environment: 'PROD',
        version: null,
        overrideRelation: null,
      },
    });
    expect(result.success).toBe(false);
  });

  it('accepts conflict group without scope proof', () => {
    expect(ConflictGroupSchema.safeParse(validConflictGroup()).success).toBe(true);
  });

  it('accepts conflicted path while conflict metadata remains separate', () => {
    expect(OrderedPathSchema.safeParse({ ...validPath(), hasConflict: true }).success).toBe(true);
  });
});
