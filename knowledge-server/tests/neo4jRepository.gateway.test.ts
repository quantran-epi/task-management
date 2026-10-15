import { describe, it, expect, vi } from 'vitest';
import { Neo4jRepository, CYPHER_QUERIES } from '../src/graph/neo4jRepository.js';
import type { EmbeddingProviderMetadata } from '../src/types/retrievalProtocol.js';
import type { GraphTraversalCriteria } from '../src/retrieval/contracts.js';

/**
 * Phase 19.1 Bug 1: Neo4jRepository must actually implement the retrieval gateway
 * methods that were previously missing (masked by `as unknown as` casts in main.ts):
 * validateVectorIndexMetadata, resolveEntities, traverse.
 *
 * These are mock-driver unit tests: they verify parameterization, signature, and
 * result-shape. They do NOT verify live Cypher semantics (requires real Neo4j).
 */

const META_384: EmbeddingProviderMetadata = {
  provider: 'local-onnx',
  model: 'multilingual-e5-small',
  revision: 'v1.0.0',
  dimensions: 384,
  policyVersion: '2026.10.1',
};

function makeRepo(mockRun: ReturnType<typeof vi.fn>): Neo4jRepository {
  const mockSession = { run: mockRun, close: vi.fn().mockResolvedValue(undefined) };
  const mockDriver = {
    session: vi.fn().mockReturnValue(mockSession),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return new Neo4jRepository({ uri: 'bolt://x', driver: mockDriver as any });
}

const rec = (data: Record<string, any>) => ({ get: (k: string) => data[k] });

describe('Neo4jRepository retrieval gateway methods (Phase 19.1 Bug 1)', () => {
  describe('validateVectorIndexMetadata', () => {
    it('returns true when persisted dimensions match query provider dimensions', async () => {
      const mockRun = vi.fn().mockResolvedValue({
        records: [
          rec({ embeddingMetadataJson: JSON.stringify({ dimensions: 384 }), hasVectors: true }),
        ],
      });
      const repo = makeRepo(mockRun);
      await expect(repo.validateVectorIndexMetadata('gsnap_abc', META_384)).resolves.toBe(true);
      const call = mockRun.mock.calls.find(
        (c) => c[0] === CYPHER_QUERIES.GET_GENERATION_META_BY_SNAPSHOT
      );
      expect(call).toBeDefined();
      expect(call![1]).toEqual({ snapshotId: 'gsnap_abc' });
    });

    it('returns false on dimension mismatch (MODEL_INDEX_MISMATCH case)', async () => {
      const mockRun = vi.fn().mockResolvedValue({
        records: [
          rec({ embeddingMetadataJson: JSON.stringify({ dimensions: 768 }), hasVectors: true }),
        ],
      });
      const repo = makeRepo(mockRun);
      await expect(repo.validateVectorIndexMetadata('gsnap_abc', META_384)).resolves.toBe(false);
    });

    it('returns false when snapshot has no vectors', async () => {
      const mockRun = vi.fn().mockResolvedValue({
        records: [rec({ embeddingMetadataJson: null, hasVectors: false })],
      });
      const repo = makeRepo(mockRun);
      await expect(repo.validateVectorIndexMetadata('gsnap_abc', META_384)).resolves.toBe(false);
    });

    it('returns false when snapshot not found', async () => {
      const mockRun = vi.fn().mockResolvedValue({ records: [] });
      const repo = makeRepo(mockRun);
      await expect(repo.validateVectorIndexMetadata('gsnap_missing', META_384)).resolves.toBe(
        false
      );
    });
  });

  describe('resolveEntities', () => {
    it('maps records to ClarificationCandidate shape and passes tokens param', async () => {
      const mockRun = vi.fn().mockResolvedValue({
        records: [
          rec({ urn: 'urn:test:a', canonicalName: 'Alpha', kind: 'PRC_PROCESS' }),
          rec({ urn: 'urn:test:b', canonicalName: 'Beta', kind: 'PRC_PROCESS' }),
        ],
      });
      const repo = makeRepo(mockRun);
      const out = await repo.resolveEntities('gsnap_abc', ['alpha', 'beta']);
      expect(out).toEqual([
        { urn: 'urn:test:a', canonicalName: 'Alpha', kind: 'PRC_PROCESS' },
        { urn: 'urn:test:b', canonicalName: 'Beta', kind: 'PRC_PROCESS' },
      ]);
      const call = mockRun.mock.calls.find((c) => c[0] === CYPHER_QUERIES.RESOLVE_ENTITIES);
      expect(call![1]).toEqual({ snapshotId: 'gsnap_abc', tokens: ['alpha', 'beta'] });
    });

    it('short-circuits with empty token list (no DB call)', async () => {
      const mockRun = vi.fn().mockResolvedValue({ records: [] });
      const repo = makeRepo(mockRun);
      await expect(repo.resolveEntities('gsnap_abc', [])).resolves.toEqual([]);
      expect(mockRun).not.toHaveBeenCalled();
    });

    it('throws when aborted', async () => {
      const mockRun = vi.fn();
      const repo = makeRepo(mockRun);
      const ctrl = new AbortController();
      ctrl.abort();
      await expect(
        repo.resolveEntities('gsnap_abc', ['x'], { signal: ctrl.signal })
      ).rejects.toThrow('Entity resolution aborted');
    });
  });

  describe('traverse', () => {
    const criteria: GraphTraversalCriteria = {
      seedUrns: ['urn:test:a'],
      plan: {
        planId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        queryIntent: 'LOOKUP',
        seedUrns: ['urn:test:a'],
        traversalSteps: [],
        overallMaxDepth: 1,
        includeInferred: false,
        fulltextKeywords: ['alpha'],
        semanticQuery: 'alpha',
      },
      evidenceClasses: ['OBSERVED'],
      limitNodes: 10,
      limitEdges: 10,
    };

    it('returns distinct neighbor entities and Fact-backed edges', async () => {
      const mockRun = vi.fn().mockResolvedValue({
        records: [
          rec({
            pathNodes: [
              { urn: 'urn:test:a', canonicalName: 'Alpha', kind: 'PRC_PROCESS' },
              { urn: 'urn:test:b', canonicalName: 'Beta', kind: 'PRC_PROCESS' },
            ],
            pathEdges: [
              {
                factKey: 'f'.repeat(64),
                subjectUrn: 'urn:test:a',
                relationType: 'CONTAINS_STEP',
                objectUrn: 'urn:test:b',
                evidenceClass: 'OBSERVED',
                hasConflict: false,
                graphSnapshotId: 'gsnap_abc',
                supportingChunks: [
                  {
                    chunkId: 'chunk-1',
                    sourceDocumentId: 'doc-1',
                    sourceDocumentTitle: 'Doc 1',
                    publishedContentHash: 'h'.repeat(64),
                    headingPath: ['Heading'],
                    lineStart: 1,
                    lineEnd: 5,
                    rawSnippet: 'snippet',
                  },
                ],
              },
            ],
          }),
        ],
      });
      const repo = makeRepo(mockRun);
      const out = await repo.traverse('gsnap_abc', criteria);
      expect(out.truncated).toBe(false);
      expect(out.entities).toHaveLength(2);
      expect(out.entities.find((e) => e.urn === 'urn:test:b')).toMatchObject({
        type: 'entity',
        urn: 'urn:test:b',
        canonicalName: 'Beta',
        kind: 'PRC_PROCESS',
        modalitiesContributed: ['graph'],
      });
      expect(out.edges).toHaveLength(1);
      expect(out.edges[0]).toMatchObject({
        type: 'edge',
        factKey: 'f'.repeat(64),
        sourceUrn: 'urn:test:a',
        relationType: 'CONTAINS_STEP',
        targetUrn: 'urn:test:b',
        evidenceClass: 'OBSERVED',
      });
      expect(mockRun).toHaveBeenCalled();
      const call = mockRun.mock.calls[0];
      expect(call![1].snapshotId).toBe('gsnap_abc');
      expect(call![1].seedUrns).toEqual(['urn:test:a']);
    });

    it('flags truncated when neighbor count exceeds limitNodes', async () => {
      const records = Array.from({ length: 3 }, (_, i) =>
        rec({
          pathNodes: [
            { urn: 'urn:test:a', canonicalName: 'Alpha', kind: 'PRC_PROCESS' },
            { urn: `urn:test:n${i}`, canonicalName: `N${i}`, kind: 'PRC_PROCESS' },
          ],
          pathEdges: [
            {
              factKey: `${i}`.repeat(64),
              subjectUrn: 'urn:test:a',
              relationType: 'CONTAINS_STEP',
              objectUrn: `urn:test:n${i}`,
              evidenceClass: 'OBSERVED',
              hasConflict: false,
              graphSnapshotId: 'gsnap_abc',
              supportingChunks: [
                {
                  chunkId: `chunk-${i}`,
                  sourceDocumentId: 'doc-1',
                  sourceDocumentTitle: 'Doc 1',
                  publishedContentHash: 'h'.repeat(64),
                  headingPath: ['Heading'],
                  lineStart: 1,
                  lineEnd: 5,
                  rawSnippet: 'snippet',
                },
              ],
            },
          ],
        })
      );
      const mockRun = vi.fn().mockResolvedValue({ records });
      const repo = makeRepo(mockRun);
      const out = await repo.traverse('gsnap_abc', { ...criteria, limitNodes: 2, limitEdges: 2 });
      expect(out.truncated).toBe(true);
      expect(out.entities.length).toBeLessThanOrEqual(2);
      expect(out.edges.length).toBeLessThanOrEqual(2);
    });

    it('returns empty result for empty seed list (no DB call)', async () => {
      const mockRun = vi.fn().mockResolvedValue({ records: [] });
      const repo = makeRepo(mockRun);
      const out = await repo.traverse('gsnap_abc', { ...criteria, seedUrns: [] });
      expect(out).toEqual({ chunks: [], entities: [], edges: [], paths: [], truncated: false });
      expect(mockRun).not.toHaveBeenCalled();
    });
  });
});
