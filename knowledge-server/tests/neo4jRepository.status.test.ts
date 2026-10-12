import { describe, it, expect, vi } from 'vitest';
import { Neo4jRepository, CYPHER_QUERIES } from '../src/graph/neo4jRepository.js';
import { GraphCandidate, GraphRelation } from '../src/types/graphProtocol.js';

/**
 * Phase 19.1 Plan 01 Task 1 (D-20, WR-01)
 * GraphSnapshot persists real nodeCount/relationCount/factCount/conflictCount/
 * quarantineCount/approvedFactCount; getActiveGraph reads them from Neo4j.
 */
describe('Neo4jRepository persistent GraphSnapshot status counts (WR-01, D-20)', () => {
  const makeCandidate = (): GraphCandidate => {
    const relations: GraphRelation[] = [
      {
        factKey: 'f'.repeat(64),
        ontologyVersion: '2026.10.1',
        subjectUrn: 'urn:test:a',
        relation: 'INVOKES',
        objectUrn: 'urn:test:b',
        qualifiers: {},
        effectiveClassification: 'BUSINESS_APPROVED',
        hasConflict: false,
        sourceMissing: false,
      },
      {
        factKey: 'e'.repeat(64),
        ontologyVersion: '2026.10.1',
        subjectUrn: 'urn:test:a',
        relation: 'CALLS',
        objectUrn: 'urn:test:c',
        qualifiers: {},
        effectiveClassification: 'OBSERVED',
        hasConflict: true,
        sourceMissing: false,
      },
    ];
    return {
      graphSnapshotId: 'snap-status-1',
      sourceSnapshotId: 'src-1',
      setId: 'set-1',
      ontologyVersion: '2026.10.1',
      normalizedProjectionHash: 'hash-1',
      nodes: [
        {
          urn: 'urn:test:a',
          kind: 'PRC_PROCESS',
          canonicalName: 'A',
          sourceSystem: 'test',
          nativeType: 'proc',
          normalizedKey: 'a',
          aliases: [],
          properties: {},
        } as any,
        {
          urn: 'urn:test:b',
          kind: 'PRC_PROCESS',
          canonicalName: 'B',
          sourceSystem: 'test',
          nativeType: 'proc',
          normalizedKey: 'b',
          aliases: [],
          properties: {},
        } as any,
        {
          urn: 'urn:test:c',
          kind: 'PRC_PROCESS',
          canonicalName: 'C',
          sourceSystem: 'test',
          nativeType: 'proc',
          normalizedKey: 'c',
          aliases: [],
          properties: {},
        } as any,
      ],
      relations,
      evidence: [],
      conflicts: [
        {
          conflictId: 'c-1',
          factKeyA: relations[0]!.factKey,
          factKeyB: relations[1]!.factKey,
          subjectUrn: 'urn:test:a',
          relation: 'CALLS',
          conflictType: 'FUNCTIONAL',
          detectedAt: '2026-10-12T00:00:00.000Z',
          resolved: false,
        } as any,
      ],
      approvals: [],
      quarantines: [
        { token: 'bad', kind: 'ORACLE_UNQUALIFIED', reason: 'missing schema' } as any,
      ],
      createdAt: '2026-10-12T00:00:00.000Z',
    };
  };

  it('writeCandidate passes real counts into INSERT_GRAPH_SNAPSHOT', async () => {
    const mockRun = vi.fn().mockResolvedValue({ records: [] });
    const mockExecuteWrite = vi.fn().mockImplementation(async (cb) => {
      return cb({ run: mockRun });
    });
    const mockSession = {
      run: mockRun,
      executeWrite: mockExecuteWrite,
      close: vi.fn().mockResolvedValue(undefined),
    };
    const mockDriver = {
      session: vi.fn().mockReturnValue(mockSession),
      close: vi.fn().mockResolvedValue(undefined),
    };

    const repo = new Neo4jRepository({ uri: 'bolt://x', driver: mockDriver as any });
    const candidate = makeCandidate();
    await repo.writeCandidate(candidate);

    // Assert INSERT_GRAPH_SNAPSHOT Cypher text sets each count prop
    expect(CYPHER_QUERIES.INSERT_GRAPH_SNAPSHOT).toContain('s.nodeCount = $nodeCount');
    expect(CYPHER_QUERIES.INSERT_GRAPH_SNAPSHOT).toContain('s.relationCount = $relationCount');
    expect(CYPHER_QUERIES.INSERT_GRAPH_SNAPSHOT).toContain('s.factCount = $factCount');
    expect(CYPHER_QUERIES.INSERT_GRAPH_SNAPSHOT).toContain('s.conflictCount = $conflictCount');
    expect(CYPHER_QUERIES.INSERT_GRAPH_SNAPSHOT).toContain('s.quarantineCount = $quarantineCount');
    expect(CYPHER_QUERIES.INSERT_GRAPH_SNAPSHOT).toContain('s.approvedFactCount = $approvedFactCount');

    // Find the INSERT_GRAPH_SNAPSHOT call
    const insertCall = mockRun.mock.calls.find(
      (c) => c[0] === CYPHER_QUERIES.INSERT_GRAPH_SNAPSHOT
    );
    expect(insertCall).toBeDefined();
    const params = insertCall![1];
    expect(params.nodeCount).toBe(3);
    expect(params.relationCount).toBe(2);
    expect(params.factCount).toBe(2);
    expect(params.conflictCount).toBe(1);
    expect(params.quarantineCount).toBe(1);
    expect(params.approvedFactCount).toBe(1);
  });

  it('getActiveGraph projects persisted counts from Neo4j record', async () => {
    const makeRecord = (data: Record<string, any>) => ({
      get: (k: string) => data[k],
    });
    const activeData = {
      setId: 'set-1',
      graphSnapshotId: 'snap-status-1',
      sourceSnapshotId: 'src-1',
      ontologyVersion: '2026.10.1',
      normalizedProjectionHash: 'hash-1',
      activatedAt: '2026-10-12T00:00:00.000Z',
      fulltextIndexName: null,
      vectorIndexName: null,
      embeddingMetadataJson: null,
      chunkCount: 0,
      hasVectors: false,
      retrievalBuiltAt: null,
      nodeCount: 3,
      relationCount: 2,
      factCount: 2,
      conflictCount: 1,
      quarantineCount: 1,
      approvedFactCount: 1,
    };
    const mockRun = vi.fn().mockResolvedValue({ records: [makeRecord(activeData)] });
    const mockSession = {
      run: mockRun,
      close: vi.fn().mockResolvedValue(undefined),
    };
    const mockDriver = {
      session: vi.fn().mockReturnValue(mockSession),
      close: vi.fn().mockResolvedValue(undefined),
    };

    const repo = new Neo4jRepository({ uri: 'bolt://x', driver: mockDriver as any });
    const active = await repo.getActiveGraph('set-1');
    expect(active).not.toBeNull();
    expect(active!.nodeCount).toBe(3);
    expect(active!.relationCount).toBe(2);
    expect(active!.factCount).toBe(2);
    expect(active!.conflictCount).toBe(1);
    expect(active!.quarantineCount).toBe(1);
    expect(active!.approvedFactCount).toBe(1);

    // Query text must return count projections
    expect(CYPHER_QUERIES.GET_ACTIVE_GRAPH).toContain('s.nodeCount AS nodeCount');
    expect(CYPHER_QUERIES.GET_ACTIVE_GRAPH).toContain('s.relationCount AS relationCount');
    expect(CYPHER_QUERIES.GET_ACTIVE_GRAPH).toContain('s.factCount AS factCount');
    expect(CYPHER_QUERIES.GET_ACTIVE_GRAPH).toContain('s.conflictCount AS conflictCount');
    expect(CYPHER_QUERIES.GET_ACTIVE_GRAPH).toContain('s.quarantineCount AS quarantineCount');
    expect(CYPHER_QUERIES.GET_ACTIVE_GRAPH).toContain('s.approvedFactCount AS approvedFactCount');
  });

  it('getActiveGraph handles Neo4j Integer-shaped count values via toNumber()', async () => {
    const neoInt = (n: number) => ({ toNumber: () => n });
    const data: Record<string, any> = {
      setId: 'set-1',
      graphSnapshotId: 'snap-status-1',
      sourceSnapshotId: 'src-1',
      ontologyVersion: '2026.10.1',
      normalizedProjectionHash: 'hash-1',
      activatedAt: '2026-10-12T00:00:00.000Z',
      fulltextIndexName: null,
      vectorIndexName: null,
      embeddingMetadataJson: null,
      chunkCount: 0,
      hasVectors: false,
      retrievalBuiltAt: null,
      nodeCount: neoInt(10),
      relationCount: neoInt(20),
      factCount: neoInt(20),
      conflictCount: neoInt(2),
      quarantineCount: neoInt(3),
      approvedFactCount: neoInt(5),
    };
    const mockRun = vi.fn().mockResolvedValue({
      records: [{ get: (k: string) => data[k] }],
    });
    const mockSession = { run: mockRun, close: vi.fn().mockResolvedValue(undefined) };
    const mockDriver = {
      session: vi.fn().mockReturnValue(mockSession),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const repo = new Neo4jRepository({ uri: 'bolt://x', driver: mockDriver as any });
    const active = await repo.getActiveGraph('set-1');
    expect(active!.nodeCount).toBe(10);
    expect(active!.relationCount).toBe(20);
    expect(active!.factCount).toBe(20);
    expect(active!.conflictCount).toBe(2);
    expect(active!.quarantineCount).toBe(3);
    expect(active!.approvedFactCount).toBe(5);
  });
});
