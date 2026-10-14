import { describe, it, expect, vi } from 'vitest';
import { Neo4jRepository, CYPHER_QUERIES } from '../src/graph/neo4jRepository.js';
import type { GraphCandidate } from '../src/types/graphProtocol.js';
import type { ProjectionSnapshot } from '../src/indexing/snapshotStore.js';
import { URN_PROCESS_60000006, URN_SUBPROCESS_10000304 } from './fixtures/pilotGoldEntities.js';

function makeMockDriver(records: any[] = []) {
  const mockRun = vi.fn().mockResolvedValue({ records });
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

describe('19.2-06-T1: Neo4j Constraints, Indexes, and SUPPORTED_BY Closure', () => {
  it('defines idempotent composite node keys and index queries in CYPHER_QUERIES', () => {
    // Assert composite constraints on (Entity.graphSnapshotId, Entity.urn) and (Chunk.graphSnapshotId, Chunk.chunkId)
    const constraints = CYPHER_QUERIES.CREATE_CONSTRAINTS;
    expect(constraints.some((c) => c.includes('Entity') && c.includes('graphSnapshotId') && c.includes('urn'))).toBe(true);
    expect(constraints.some((c) => c.includes('Chunk') && c.includes('graphSnapshotId') && c.includes('chunkId'))).toBe(true);
    expect(constraints.some((c) => c.includes('Fact') && c.includes('graphSnapshotId') && c.includes('factKey'))).toBe(true);

    // Assert indexes in CREATE_INDEXES
    const indexes = (CYPHER_QUERIES as any).CREATE_INDEXES;
    expect(Array.isArray(indexes)).toBe(true);
    expect(indexes.some((i: string) => i.includes('Entity') && i.includes('canonicalName'))).toBe(true);
    expect(indexes.some((i: string) => i.includes('Entity') && i.includes('normalizedKey'))).toBe(true);
    expect(indexes.some((i: string) => i.includes('Chunk') && i.includes('lineStart') && i.includes('lineEnd'))).toBe(true);
  });

  it('runs all constraints and indexes idempotently in initializeSchemaConstraints', async () => {
    const { mockDriver, mockRun } = makeMockDriver();
    const repo = new Neo4jRepository({ uri: 'bolt://test', driver: mockDriver as any });

    await repo.initializeSchemaConstraints();
    expect(mockRun).toHaveBeenCalled();
    const executedQueries = mockRun.mock.calls.map((c) => c[0]);

    // Verify each constraint and index was run
    for (const c of CYPHER_QUERIES.CREATE_CONSTRAINTS) {
      expect(executedQueries).toContain(c);
    }
    for (const idx of (CYPHER_QUERIES as any).CREATE_INDEXES) {
      expect(executedQueries).toContain(idx);
    }
  });

  it('creates SUPPORTED_BY relationship between Fact and overlapping Chunk nodes during buildRetrievalGeneration', async () => {
    const { mockDriver, mockTx, mockRun } = makeMockDriver([
      { get: (k: string) => (k === 'state' ? 'ONLINE' : null) }
    ]);
    const repo = new Neo4jRepository({ uri: 'bolt://test', driver: mockDriver as any });

    const candidateSnapshotId = 'gsnap-test-closure-1';
    const docId = '60000006-0000-4000-8000-000000000001';
    const factKey = '1'.repeat(64);
    const chunkId = 'chunk-test-101';

    const candidate: GraphCandidate = {
      graphSnapshotId: candidateSnapshotId,
      sourceSnapshotId: 'src-snap-1',
      setId: 'set-pilot-1',
      ontologyVersion: '2026.10.1',
      normalizedProjectionHash: 'hash1',
      nodes: [
        {
          urn: URN_PROCESS_60000006,
          canonicalName: 'Test Process',
          kind: 'ScheduledProcess',
          sourceSystem: 'TEST',
          nativeType: 'PROC',
          normalizedKey: 'TEST_PROCESS',
        },
      ],
      relations: [
        {
          factKey,
          ontologyVersion: '2026.10.1',
          subjectUrn: URN_PROCESS_60000006,
          relation: 'INVOKES',
          objectUrn: URN_SUBPROCESS_10000304,
          qualifiers: {},
          effectiveClassification: 'OBSERVED',
          hasConflict: false,
          sourceMissing: false,
        },
      ],
      evidence: [
        {
          evidenceId: '00000000-0000-0000-0000-000000000001',
          factKey,
          documentId: docId,
          documentTitle: 'Test Doc',
          sectionHeadingPath: ['Header'],
          startLine: 10,
          endLine: 12,
          startOffset: 100,
          endOffset: 150,
          rawSnippet: 'evidence text snippet',
          extractionMethod: 'DETERMINISTIC_TABLE',
          classification: 'OBSERVED',
          confidence: 1.0,
          observedAt: new Date().toISOString(),
        },
      ],
      conflicts: [],
      approvals: [],
      quarantines: [],
      createdAt: new Date().toISOString(),
    };

    const sourceSnapshot: ProjectionSnapshot = {
      snapshotId: 'src-snap-1',
      setId: 'set-pilot-1',
      createdAt: new Date().toISOString(),
      documents: [
        {
          documentId: docId,
          title: 'Test Doc',
          contentHash: 'contenthash1',
          sourcePath: 'test.md',
          updatedAt: new Date().toISOString(),
          chunks: [
            {
              occurrenceId: chunkId,
              headingPath: ['Header'],
              startLine: 9,
              endLine: 15,
              startOffset: 80,
              endOffset: 200,
              rawContent: 'full chunk content containing evidence',
            },
          ],
        },
      ],
    };

    await repo.buildRetrievalGeneration(candidate, sourceSnapshot);

    // Verify LINK_FACT_CHUNK_SUPPORT was executed in transaction
    const txCalls = mockTx.run.mock.calls;
    const linkCall = txCalls.find((call) => call[0] === (CYPHER_QUERIES as any).LINK_FACT_CHUNK_SUPPORT);
    expect(linkCall).toBeDefined();
    expect(linkCall[1]).toEqual({
      graphSnapshotId: candidateSnapshotId,
      rows: [
        {
          factKey,
          chunkKey: chunkId,
          chunkId,
        },
      ],
    });
  });
});
