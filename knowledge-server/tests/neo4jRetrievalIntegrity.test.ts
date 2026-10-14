import { describe, it, expect, vi } from 'vitest';
import { Neo4jRepository, CYPHER_QUERIES } from '../src/graph/neo4jRepository.js';
import type { GraphCandidate } from '../src/types/graphProtocol.js';
import type { ProjectionSnapshot } from '../src/indexing/snapshotStore.js';
import { URN_PROCESS_60000006, URN_SUBPROCESS_10000304 } from './fixtures/pilotGoldEntities.js';
import { resolveQueryEntities, buildQueryExecutionPlan } from '../src/retrieval/queryPlanning.js';
import { NineRouterQueryPlanner } from '../src/retrieval/nineRouterQueryPlanner.js';
import type { GraphRetrievalGateway, QueryPlanner } from '../src/retrieval/contracts.js';

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

describe('19.2-06-T2: Multi-hop Plan-Driven Traversal and Deletion of Catch-All Query', () => {
  it('verifies CYPHER_QUERIES does not define TRAVERSE_FROM_SEEDS catch-all query', () => {
    expect((CYPHER_QUERIES as any).TRAVERSE_FROM_SEEDS).toBeUndefined();
  });

  it('executes ordered traversal steps with simple-path cycle prevention, caps, and returns GraphTraversalPathRecord', async () => {
    const record1 = {
      get: (k: string) => {
        if (k === 'pathNodes') {
          return [
            { urn: URN_PROCESS_60000006, canonicalName: 'Credit Proc', kind: 'ScheduledProcess' },
            { urn: URN_SUBPROCESS_10000304, canonicalName: 'Sub Proc', kind: 'ProcessStep' },
          ];
        }
        if (k === 'pathEdges') {
          return [
            {
              factKey: 'f'.repeat(64),
              subjectUrn: URN_PROCESS_60000006,
              relationType: 'CONTAINS_STEP',
              objectUrn: URN_SUBPROCESS_10000304,
              evidenceClass: 'OBSERVED',
              hasConflict: false,
              supportingChunkIds: ['chunk-101'],
              graphSnapshotId: 'snap-1',
            },
          ];
        }
        return null;
      },
    };

    const { mockDriver, mockSession, mockRun } = makeMockDriver([record1]);
    const repo = new Neo4jRepository({ uri: 'bolt://test', driver: mockDriver as any });

    const criteria = {
      seedUrns: [URN_PROCESS_60000006],
      plan: {
        planId: '00000000-0000-0000-0000-000000000001',
        queryIntent: 'FLOW_TRAVERSAL' as const,
        seedUrns: [URN_PROCESS_60000006],
        traversalSteps: [
          {
            relationType: 'CONTAINS_STEP' as const,
            direction: 'OUTGOING' as const,
            maxHops: 1,
          },
        ],
        overallMaxDepth: 1,
        includeInferred: false,
        fulltextKeywords: ['credit'],
        semanticQuery: 'credit process',
      },
      evidenceClasses: ['OBSERVED' as const],
      limitNodes: 100,
      limitEdges: 200,
    };

    const result = await repo.traverse('snap-1', criteria);

    expect(result.entities).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]!.supportingChunkIds).toEqual(['chunk-101']);
    expect(result.paths).toBeDefined();
    expect(result.paths).toHaveLength(1);
    expect(result.paths![0]!.nodeUrns).toEqual([URN_PROCESS_60000006, URN_SUBPROCESS_10000304]);
    expect(result.paths![0]!.hopSupportingChunkIds).toEqual([['chunk-101']]);

    // Verify session.run called with parameterized query containing simple path cycle check
    expect(mockRun).toHaveBeenCalled();
    const query = mockRun.mock.calls[0][0];
    expect(query).toContain('ALL(n IN nodes(path) WHERE n.graphSnapshotId = $snapshotId AND single(m IN nodes(path) WHERE m = n))');
    expect(query).toContain('CONTAINS_STEP');
  });
});

describe('19.2-06-T3: Delete Keyword Heuristics and Implement Candidate Disambiguation', () => {
  const candidateProc = {
    urn: URN_PROCESS_60000006,
    canonicalName: 'SHB - Credit calculations',
    kind: 'ScheduledProcess' as const,
  };
  const candidateStep = {
    urn: 'urn:plannermate:test:ProcessStep:60000006',
    canonicalName: 'Step Container 60000006',
    kind: 'ProcessStep' as const,
  };

  it('forwards all matching candidates as ambiguous without keyword heuristics', async () => {
    const mockGateway: GraphRetrievalGateway = {
      resolveEntities: vi.fn().mockResolvedValue([candidateProc, candidateStep]),
      traverse: vi.fn(),
    };

    const res = await resolveQueryEntities(
      mockGateway,
      'snap-1',
      'quy trình 60000006'
    );

    expect(res.status).toBe('ambiguous');
    expect(res.candidates).toHaveLength(2);
    expect(res.candidates).toEqual([candidateProc, candidateStep]);
  });

  it('routes multiple candidate URNs to planner and successfully executes when planner disambiguates', async () => {
    const mockGateway: GraphRetrievalGateway = {
      resolveEntities: vi.fn().mockResolvedValue([candidateProc, candidateStep]),
      traverse: vi.fn(),
    };

    const mockPlanner: QueryPlanner = {
      plan: vi.fn().mockResolvedValue({
        type: 'plan',
        plan: {
          planId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
          queryIntent: 'LOOKUP',
          seedUrns: [URN_PROCESS_60000006],
          traversalSteps: [],
          overallMaxDepth: 1,
          includeInferred: false,
          fulltextKeywords: ['credit'],
          semanticQuery: 'credit process',
        },
      }),
    };

    const outcome = await buildQueryExecutionPlan({
      request: {
        query: 'chi tiết quy trình 60000006',
        limit: 20,
        includeInferred: false,
        recentTurns: [],
      },
      pinnedSnapshotId: 'snap-1',
      gateway: mockGateway,
      planner: mockPlanner,
    });

    expect(outcome.status).toBe('executable');
    if (outcome.status === 'executable') {
      expect(outcome.plan.seedUrns).toEqual([URN_PROCESS_60000006]);
    }

    // Verify planner was called with resolvedCandidates containing both collision candidates
    expect(mockPlanner.plan).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        resolvedCandidates: [candidateProc, candidateStep],
      }),
      undefined
    );
  });

  it('falls back to needsClarification when planner cannot disambiguate or returns clarification', async () => {
    const mockGateway: GraphRetrievalGateway = {
      resolveEntities: vi.fn().mockResolvedValue([candidateProc, candidateStep]),
      traverse: vi.fn(),
    };

    const mockPlanner: QueryPlanner = {
      plan: vi.fn().mockResolvedValue({
        type: 'clarification',
        candidates: [candidateProc, candidateStep],
      }),
    };

    const outcome = await buildQueryExecutionPlan({
      request: {
        query: 'thông tin 60000006',
        limit: 20,
        includeInferred: false,
        recentTurns: [],
      },
      pinnedSnapshotId: 'snap-1',
      gateway: mockGateway,
      planner: mockPlanner,
    });

    expect(outcome.status).toBe('needsClarification');
    if (outcome.status === 'needsClarification') {
      expect(outcome.safeCandidates).toEqual([candidateProc, candidateStep]);
      expect(outcome.semanticOutcome).toBe('NEEDS_CLARIFICATION');
    }
  });
});


