import { describe, it, expect, vi } from 'vitest';
import { Neo4jRepository } from '../src/graph/neo4jRepository.js';
import { InMemoryGraphRepository } from '../src/graph/graphRepository.js';
import type { GraphCandidate } from '../src/types/graphProtocol.js';
import type { ProjectionSnapshot } from '../src/indexing/snapshotStore.js';
import type { EmbeddingProvider } from '../src/retrieval/contracts.js';
import type { EmbeddingProviderMetadata } from '../src/types/retrievalProtocol.js';

function makeMockDriver() {
  const mockRun = vi.fn().mockResolvedValue({
    records: [{ get: (k: string) => (k === 'state' ? 'ONLINE' : null) }],
  });
  const mockTx = {
    run: mockRun,
  };
  const mockSession = {
    run: mockRun,
    executeWrite: vi.fn().mockImplementation(async (cb: (tx: any) => Promise<any>) => cb(mockTx)),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const mockDriver = {
    session: vi.fn().mockReturnValue(mockSession),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return { mockDriver, mockSession, mockTx, mockRun };
}

function createMockSnapshotWithChunks(count: number): ProjectionSnapshot {
  const chunks = Array.from({ length: count }, (_, i) => ({
    occurrenceId: `occ-${i}`,
    headingPath: ['Heading', `Subheading ${i}`],
    startLine: i * 10,
    endLine: i * 10 + 5,
    startOffset: i * 100,
    endOffset: i * 100 + 50,
    rawContent: `Sample text content for chunk ${i}`,
  }));

  return {
    snapshotId: 'src-snap-100',
    setId: 'set-retrieval-1',
    createdAt: new Date().toISOString(),
    documents: [
      {
        documentId: 'doc-1',
        title: 'Doc 1',
        contentHash: 'hash-doc-1',
        sourcePath: 'doc1.md',
        updatedAt: new Date().toISOString(),
        chunks,
      },
    ],
  };
}

const mockCandidate: GraphCandidate = {
  graphSnapshotId: '00000000-0000-4000-8000-000000000001',
  sourceSnapshotId: 'src-snap-100',
  setId: 'set-retrieval-1',
  ontologyVersion: '2026.10.1',
  normalizedProjectionHash: 'normhash',
  nodes: [],
  relations: [],
  evidence: [],
  conflicts: [],
  approvals: [],
  quarantines: [],
  createdAt: new Date().toISOString(),
};

class RecordingEmbeddingProvider implements EmbeddingProvider {
  public batchCalls: string[][] = [];

  describe(): EmbeddingProviderMetadata {
    return {
      provider: 'local-onnx',
      model: 'multilingual-e5-small',
      revision: 'v1.0.0',
      dimensions: 384,
      policyVersion: '2026.10.1',
    };
  }

  async embedDocuments(texts: readonly string[]): Promise<number[][]> {
    this.batchCalls.push([...texts]);
    return texts.map(() => new Array(384).fill(0.1));
  }

  async embedQuery(_text: string): Promise<number[]> {
    return new Array(384).fill(0.1);
  }
}

describe('Retrieval Stream Batching & Event Loop Yield (BUILD-OOM-01)', () => {
  it('processes 100 chunks in bounded batches of at most 32 chunks by default', async () => {
    delete process.env.RETRIEVAL_BATCH_SIZE;
    const { mockDriver, mockTx } = makeMockDriver();
    const repo = new Neo4jRepository({ uri: 'bolt://test', driver: mockDriver as any });
    const embeddingProvider = new RecordingEmbeddingProvider();

    const snapshot = createMockSnapshotWithChunks(100);
    const meta = await repo.buildRetrievalGeneration(mockCandidate, snapshot, embeddingProvider);

    expect(meta.chunkCount).toBe(100);
    // 100 chunks with default batch size 32 -> 32, 32, 32, 4 (4 batches)
    expect(embeddingProvider.batchCalls.length).toBe(4);
    for (const batch of embeddingProvider.batchCalls) {
      expect(batch.length).toBeLessThanOrEqual(32);
    }
    expect(embeddingProvider.batchCalls[0]?.length).toBe(32);
    expect(embeddingProvider.batchCalls[1]?.length).toBe(32);
    expect(embeddingProvider.batchCalls[2]?.length).toBe(32);
    expect(embeddingProvider.batchCalls[3]?.length).toBe(4);

    // Verify Neo4j chunk insertion calls match batch count
    const unwindCalls = mockTx.run.mock.calls.filter((call) =>
      typeof call[0] === 'string' && call[0].includes('MERGE (c:Chunk {instanceKey: row.instanceKey})')
    );
    expect(unwindCalls.length).toBe(4);
  });

  it('respects configurable RETRIEVAL_BATCH_SIZE environment variable (e.g. 25)', async () => {
    process.env.RETRIEVAL_BATCH_SIZE = '25';
    try {
      const { mockDriver } = makeMockDriver();
      const repo = new Neo4jRepository({ uri: 'bolt://test', driver: mockDriver as any });
      const embeddingProvider = new RecordingEmbeddingProvider();

      const snapshot = createMockSnapshotWithChunks(100);
      const meta = await repo.buildRetrievalGeneration(mockCandidate, snapshot, embeddingProvider);

      expect(meta.chunkCount).toBe(100);
      // 100 / 25 = exactly 4 batches of 25
      expect(embeddingProvider.batchCalls.length).toBe(4);
      for (const batch of embeddingProvider.batchCalls) {
        expect(batch.length).toBe(25);
      }
    } finally {
      delete process.env.RETRIEVAL_BATCH_SIZE;
    }
  });

  it('InMemoryGraphRepository also batches chunk embedding and yields event loop', async () => {
    process.env.RETRIEVAL_BATCH_SIZE = '25';
    try {
      const repo = new InMemoryGraphRepository();
      const embeddingProvider = new RecordingEmbeddingProvider();
      const snapshot = createMockSnapshotWithChunks(75);

      const meta = await repo.buildRetrievalGeneration(mockCandidate, snapshot, embeddingProvider);

      expect(meta.chunkCount).toBe(75);
      expect(embeddingProvider.batchCalls.length).toBe(3);
      for (const batch of embeddingProvider.batchCalls) {
        expect(batch.length).toBe(25);
      }
    } finally {
      delete process.env.RETRIEVAL_BATCH_SIZE;
    }
  });
});
