import { describe, it, expect, vi } from 'vitest';
import { Neo4jRepository, CYPHER_QUERIES } from '../src/graph/neo4jRepository.js';
import type { GraphCandidate } from '../src/types/graphProtocol.js';
import type { ProjectionSnapshot } from '../src/indexing/snapshotStore.js';
import {
  URN_PROCESS_60000006,
  URN_SUBPROCESS_10000304,
  URN_TABLE_FCL_CYCLE_COUNTER,
  URN_PKG_FCL_CYCLE_COUNTER,
  URN_CONTAINER_60000006,
} from './fixtures/pilotGoldEntities.js';
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
  it('defines idempotent composite indexes and instanceKey constraints in CYPHER_QUERIES', () => {
    // Assert instanceKey constraints on Entity, Chunk, Fact, and GraphSnapshot
    const constraints = CYPHER_QUERIES.CREATE_CONSTRAINTS;
    expect(constraints.some((c) => c.includes('Entity') && c.includes('instanceKey'))).toBe(true);
    expect(constraints.some((c) => c.includes('Chunk') && c.includes('instanceKey'))).toBe(true);
    expect(constraints.some((c) => c.includes('Fact') && c.includes('instanceKey'))).toBe(true);
    expect(constraints.some((c) => c.includes('GraphSnapshot') && c.includes('graphSnapshotId'))).toBe(true);
    expect(constraints.every((c) => !c.includes('NODE KEY'))).toBe(true);

    // Assert composite indexes in CREATE_INDEXES (Community compatible)
    const indexes = (CYPHER_QUERIES as any).CREATE_INDEXES;
    expect(Array.isArray(indexes)).toBe(true);
    expect(indexes.some((i: string) => i.includes('Entity') && i.includes('graphSnapshotId') && i.includes('urn'))).toBe(true);
    expect(indexes.some((i: string) => i.includes('Chunk') && i.includes('graphSnapshotId') && i.includes('chunkId'))).toBe(true);
    expect(indexes.some((i: string) => i.includes('Fact') && i.includes('graphSnapshotId') && i.includes('factKey'))).toBe(true);
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

  it('deduplicates support rows and excludes touching half-open offsets without line overlap', async () => {
    const { mockDriver, mockTx } = makeMockDriver();
    const repo = new Neo4jRepository({ uri: 'bolt://test', driver: mockDriver as any });
    const factKey = '2'.repeat(64);
    const candidate = {
      graphSnapshotId: 'gsnap_abcdef12',
      sourceSnapshotId: 'src-1',
      setId: 'set-1',
      ontologyVersion: '2026.10.1',
      normalizedProjectionHash: 'hash',
      nodes: [],
      relations: [{
        factKey,
        ontologyVersion: '2026.10.1',
        subjectUrn: URN_PROCESS_60000006,
        relation: 'INVOKES' as const,
        objectUrn: URN_SUBPROCESS_10000304,
        qualifiers: {},
        effectiveClassification: 'OBSERVED' as const,
        hasConflict: false,
        sourceMissing: false,
      }],
      evidence: [
        {
          evidenceId: '00000000-0000-4000-8000-000000000001',
          factKey,
          documentId: 'doc-1',
          documentTitle: 'Doc',
          sectionHeadingPath: [],
          startLine: 1,
          endLine: 1,
          startOffset: 10,
          endOffset: 20,
          rawSnippet: 'one',
          extractionMethod: 'DETERMINISTIC_TABLE' as const,
          classification: 'OBSERVED' as const,
          confidence: 1,
          observedAt: new Date().toISOString(),
        },
        {
          evidenceId: '00000000-0000-4000-8000-000000000002',
          factKey,
          documentId: 'doc-1',
          documentTitle: 'Doc',
          sectionHeadingPath: [],
          startLine: 2,
          endLine: 2,
          startOffset: 12,
          endOffset: 18,
          rawSnippet: 'duplicate overlap',
          extractionMethod: 'DETERMINISTIC_TABLE' as const,
          classification: 'OBSERVED' as const,
          confidence: 1,
          observedAt: new Date().toISOString(),
        },
      ],
      conflicts: [],
      approvals: [],
      quarantines: [],
      createdAt: new Date().toISOString(),
    } satisfies GraphCandidate;
    const sourceSnapshot = {
      snapshotId: 'src-1',
      setId: 'set-1',
      createdAt: new Date().toISOString(),
      documents: [{
        documentId: 'doc-1',
        title: 'Doc',
        contentHash: 'a'.repeat(64),
        sourcePath: 'doc.md',
        updatedAt: new Date().toISOString(),
        chunks: [
          { occurrenceId: 'overlap', headingPath: [], startLine: 1, endLine: 2, startOffset: 10, endOffset: 20, rawContent: 'overlap' },
          { occurrenceId: 'touching', headingPath: [], startLine: 5, endLine: 5, startOffset: 20, endOffset: 30, rawContent: 'touching' },
        ],
      }],
    } satisfies ProjectionSnapshot;

    await repo.buildRetrievalGeneration(candidate, sourceSnapshot);

    const linkCall = mockTx.run.mock.calls.find((call) => call[0] === CYPHER_QUERIES.LINK_FACT_CHUNK_SUPPORT);
    expect(linkCall?.[1].rows).toEqual([{ factKey, chunkKey: 'overlap', chunkId: 'overlap' }]);
  });

  it.each([
    { eligible: 2, closed: 2, invalid: 0, expected: true },
    { eligible: 2, closed: 1, invalid: 0, expected: false },
    { eligible: 2, closed: 2, invalid: 1, expected: false },
  ])('validates complete same-snapshot citation closure %#', async ({ eligible, closed, invalid, expected }) => {
    const { mockDriver, mockRun } = makeMockDriver();
    mockRun.mockImplementation(async (query: string) => {
      if (query === CYPHER_QUERIES.SHOW_INDEX_BY_NAME) {
        return { records: [{ get: (key: string) => key === 'state' ? 'ONLINE' : null }] };
      }
      if (query === CYPHER_QUERIES.VALIDATE_CITATION_CLOSURE) {
        return { records: [{ get: (key: string) => ({
          eligibleFactCount: eligible,
          closedFactCount: closed,
          invalidSupportCount: invalid,
        }[key]) }] };
      }
      return { records: [] };
    });
    const repo = new Neo4jRepository({ uri: 'bolt://test', driver: mockDriver as any });
    (repo as any).localGenerationMetadata.set('gsnap_abcdef12', {
      graphSnapshotId: 'gsnap_abcdef12',
      sourceSnapshotId: 'src-1',
      fulltextIndexName: 'ft',
      vectorIndexName: 'vec',
      chunkCount: 1,
      hasVectors: false,
      builtAt: new Date().toISOString(),
    });

    await expect(repo.validateRetrievalGeneration('gsnap_abcdef12')).resolves.toBe(expected);
  });

  it('fails candidate validation when Neo4j integrity query errors', async () => {
    const { mockDriver, mockRun } = makeMockDriver();
    mockRun.mockRejectedValue(new Error('database unavailable'));
    const repo = new Neo4jRepository({ uri: 'bolt://test', driver: mockDriver as any });
    (repo as any).localGenerationMetadata.set('gsnap_abcdef12', {
      graphSnapshotId: 'gsnap_abcdef12', sourceSnapshotId: 'src-1', fulltextIndexName: 'ft',
      vectorIndexName: 'vec', chunkCount: 1, hasVectors: false, builtAt: new Date().toISOString(),
    });

    await expect(repo.validateRetrievalGeneration('gsnap_abcdef12')).resolves.toBe(false);
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
              supportingChunks: [{
                chunkId: 'chunk-101',
                sourceDocumentId: '60000006-0000-4000-8000-000000000001',
                sourceDocumentTitle: 'Call chain',
                publishedContentHash: 'a'.repeat(64),
                headingPath: ['Flow'],
                lineStart: 1,
                lineEnd: 3,
                rawSnippet: 'flow evidence',
              }],
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
    expect(query).toContain('MATCH (fact:Fact');
    expect(query).toContain('SUPPORTED_BY');
  });

  it('composes ordered traversal steps using prior endpoints and returns one complete path', async () => {
    const urnStep = 'urn:plannermate:smartvista:PRC_CONTAINER:60000006';
    const urnComponent = 'urn:plannermate:smartvista:PLSQL:MAIN1.SWITCH_CYCLE';
    const urnTarget = 'urn:plannermate:smartvista:PLSQL:MAIN1.FCL_PRC_CYCLE_COUNTER_PKG.PROCESS';
    const factKeys = ['1'.repeat(64), '2'.repeat(64), '3'.repeat(64)];
    const makeRecord = (nodes: any[], factKey: string, relationType: string, subjectUrn: string, objectUrn: string) => ({
      get: (key: string) => key === 'pathNodes' ? nodes : key === 'pathEdges' ? [{
        factKey,
        subjectUrn,
        relationType,
        objectUrn,
        evidenceClass: 'OBSERVED',
        hasConflict: false,
        supportingChunks: [{
          chunkId: `chunk-${relationType}`,
          sourceDocumentId: '60000006-0000-4000-8000-000000000001',
          sourceDocumentTitle: 'Call chain',
          publishedContentHash: 'a'.repeat(64),
          headingPath: ['Flow'],
          lineStart: 1,
          lineEnd: 3,
          rawSnippet: 'flow evidence',
        }],
        graphSnapshotId: 'snap-1',
      }] : null,
    });
    const responses = [
      [makeRecord([
        { urn: URN_PROCESS_60000006, canonicalName: 'Process', kind: 'ScheduledProcess' },
        { urn: urnStep, canonicalName: 'Step', kind: 'ProcessStep' },
      ], factKeys[0]!, 'CONTAINS_STEP', URN_PROCESS_60000006, urnStep)],
      [makeRecord([
        { urn: urnStep, canonicalName: 'Step', kind: 'ProcessStep' },
        { urn: urnComponent, canonicalName: 'Component', kind: 'SoftwareComponent' },
      ], factKeys[1]!, 'INVOKES', urnStep, urnComponent)],
      [makeRecord([
        { urn: urnComponent, canonicalName: 'Component', kind: 'SoftwareComponent' },
        { urn: urnTarget, canonicalName: 'Target', kind: 'SoftwareComponent' },
      ], factKeys[2]!, 'CALLS', urnComponent, urnTarget)],
    ];
    let call = 0;
    const { mockDriver, mockRun } = makeMockDriver();
    mockRun.mockImplementation(async () => ({ records: responses[call++] ?? [] }));
    const repo = new Neo4jRepository({ uri: 'bolt://test', driver: mockDriver as any });

    const result = await repo.traverse('snap-1', {
      seedUrns: [URN_PROCESS_60000006],
      plan: {
        planId: '00000000-0000-0000-0000-000000000001',
        queryIntent: 'FLOW_TRAVERSAL',
        seedUrns: [URN_PROCESS_60000006],
        traversalSteps: [
          { relationType: 'CONTAINS_STEP', direction: 'OUTGOING', maxHops: 1 },
          { relationType: 'INVOKES', direction: 'OUTGOING', maxHops: 1 },
          { relationType: 'CALLS', direction: 'OUTGOING', maxHops: 1 },
        ],
        overallMaxDepth: 3,
        includeInferred: false,
        fulltextKeywords: ['flow'],
        semanticQuery: 'flow',
      },
      evidenceClasses: ['OBSERVED'],
      limitNodes: 100,
      limitEdges: 200,
    });

    expect(
      mockRun.mock.calls
        .filter((entry) => entry[1]?.seedUrns !== undefined)
        .map((entry) => entry[1].seedUrns)
    ).toEqual([
      [URN_PROCESS_60000006],
      [urnStep],
      [urnComponent],
    ]);
    expect(result.paths).toHaveLength(1);
    expect(result.paths?.[0]?.nodeUrns).toEqual([URN_PROCESS_60000006, urnStep, urnComponent, urnTarget]);
    expect(result.paths?.[0]?.edgeFactKeys).toEqual(factKeys);
    expect(result.edges).toHaveLength(3);
    expect(result.chunks).toHaveLength(3);
  });

  it('forms connected heterogeneous reverse paths from DatabaseObject through READS_FROM, CALLS, INVOKES for IMPACT_ANALYSIS', async () => {
    const factKeys = ['1'.repeat(64), '2'.repeat(64), '3'.repeat(64)];
    const makeRecord = (nodes: any[], factKey: string, relationType: string, subjectUrn: string, objectUrn: string) => ({
      get: (key: string) =>
        key === 'pathNodes'
          ? nodes
          : key === 'pathEdges'
          ? [
              {
                factKey,
                subjectUrn,
                relationType,
                objectUrn,
                evidenceClass: 'OBSERVED',
                hasConflict: false,
                supportingChunks: [
                  {
                    chunkId: `chunk-${relationType}`,
                    sourceDocumentId: 'doc-1',
                    sourceDocumentTitle: 'Evidence',
                    publishedContentHash: 'a'.repeat(64),
                    headingPath: ['Impact'],
                    lineStart: 1,
                    lineEnd: 5,
                    rawSnippet: 'impact evidence',
                  },
                ],
                graphSnapshotId: 'snap-1',
              },
            ]
          : null,
    });

    const responses = [
      // Hop 1: DatabaseObject <-[:READS_FROM]- SoftwareComponent
      [
        makeRecord(
          [
            { urn: URN_TABLE_FCL_CYCLE_COUNTER, canonicalName: 'Table', kind: 'DatabaseObject' },
            { urn: URN_PKG_FCL_CYCLE_COUNTER, canonicalName: 'Pkg', kind: 'SoftwareComponent' },
          ],
          factKeys[0]!,
          'READS_FROM',
          URN_PKG_FCL_CYCLE_COUNTER,
          URN_TABLE_FCL_CYCLE_COUNTER
        ),
      ],
      // Hop 2: SoftwareComponent <-[:CALLS]- SoftwareComponent (Subprocess)
      [
        makeRecord(
          [
            { urn: URN_PKG_FCL_CYCLE_COUNTER, canonicalName: 'Pkg', kind: 'SoftwareComponent' },
            { urn: URN_SUBPROCESS_10000304, canonicalName: 'SubProc', kind: 'SoftwareComponent' },
          ],
          factKeys[1]!,
          'CALLS',
          URN_SUBPROCESS_10000304,
          URN_PKG_FCL_CYCLE_COUNTER
        ),
      ],
      // Hop 3: SoftwareComponent <-[:INVOKES]- ProcessStep (Container)
      [
        makeRecord(
          [
            { urn: URN_SUBPROCESS_10000304, canonicalName: 'SubProc', kind: 'SoftwareComponent' },
            { urn: URN_CONTAINER_60000006, canonicalName: 'Container', kind: 'ProcessStep' },
          ],
          factKeys[2]!,
          'INVOKES',
          URN_CONTAINER_60000006,
          URN_SUBPROCESS_10000304
        ),
      ],
    ];

    let call = 0;
    const { mockDriver, mockRun } = makeMockDriver();
    mockRun.mockImplementation(async (query: string) => {
      // IMPACT_ANALYSIS step 1 runs READS_FROM, then WRITES_TO for the same step.
      if (typeof query === 'string' && query.includes('WRITES_TO')) {
        return { records: [] };
      }
      return { records: responses[call++] ?? [] };
    });
    const repo = new Neo4jRepository({ uri: 'bolt://test', driver: mockDriver as any });

    const result = await repo.traverse('snap-1', {
      seedUrns: [URN_TABLE_FCL_CYCLE_COUNTER],
      plan: {
        planId: '00000000-0000-0000-0000-000000000005',
        queryIntent: 'IMPACT_ANALYSIS',
        seedUrns: [URN_TABLE_FCL_CYCLE_COUNTER],
        traversalSteps: [
          { relationType: 'READS_FROM', direction: 'INCOMING', maxHops: 1 },
          { relationType: 'CALLS', direction: 'INCOMING', maxHops: 1 },
          { relationType: 'INVOKES', direction: 'INCOMING', maxHops: 1 },
        ],
        overallMaxDepth: 3,
        includeInferred: false,
        fulltextKeywords: ['impact'],
        semanticQuery: 'impact',
      },
      evidenceClasses: ['OBSERVED'],
      limitNodes: 100,
      limitEdges: 200,
    });

    expect(result.paths).toHaveLength(1);
    expect(result.paths?.[0]?.nodeUrns).toEqual([
      URN_TABLE_FCL_CYCLE_COUNTER,
      URN_PKG_FCL_CYCLE_COUNTER,
      URN_SUBPROCESS_10000304,
      URN_CONTAINER_60000006,
    ]);
    expect(result.paths?.[0]?.edgeFactKeys).toEqual(factKeys);
    expect(result.edges).toHaveLength(3);
    expect(result.chunks).toHaveLength(3);
  });

  it('keeps cited one-hop impact paths when no caller relation exists', async () => {
    const factKey = '4'.repeat(64);
    const makeRecord = (relationType: 'READS_FROM' | 'WRITES_TO') => ({
      get: (key: string) => key === 'pathNodes'
        ? [
            { urn: URN_TABLE_FCL_CYCLE_COUNTER, canonicalName: 'Table', kind: 'DatabaseObject' },
            { urn: 'urn:plannermate:plsql:PLSQL_PROCEDURE:FCL_API_CYCLE_PKG.SWITCH_CYCLE', canonicalName: 'Switch', kind: 'SoftwareComponent' },
          ]
        : key === 'pathEdges'
        ? [{
            factKey,
            subjectUrn: 'urn:plannermate:plsql:PLSQL_PROCEDURE:FCL_API_CYCLE_PKG.SWITCH_CYCLE',
            relationType,
            objectUrn: URN_TABLE_FCL_CYCLE_COUNTER,
            evidenceClass: 'OBSERVED',
            hasConflict: false,
            supportingChunks: [{
              chunkId: 'chunk-impact',
              sourceDocumentId: 'doc-1',
              sourceDocumentTitle: 'Evidence',
              publishedContentHash: 'a'.repeat(64),
              headingPath: ['Impact'],
              lineStart: 1,
              lineEnd: 5,
              rawSnippet: 'impact evidence',
            }],
            graphSnapshotId: 'snap-1',
          }]
        : null,
    });
    const { mockDriver, mockRun } = makeMockDriver();
    mockRun.mockImplementation(async (query: string) => ({
      records: query.includes('WRITES_TO') ? [] : [makeRecord('READS_FROM')],
    }));
    const repo = new Neo4jRepository({ uri: 'bolt://test', driver: mockDriver as any });

    const result = await repo.traverse('snap-1', {
      seedUrns: [URN_TABLE_FCL_CYCLE_COUNTER],
      plan: {
        planId: '00000000-0000-0000-0000-000000000006',
        queryIntent: 'IMPACT_ANALYSIS',
        seedUrns: [URN_TABLE_FCL_CYCLE_COUNTER],
        traversalSteps: [{ relationType: 'READS_FROM', direction: 'INCOMING', maxHops: 1, targetKind: 'SoftwareComponent' }],
        overallMaxDepth: 1,
        includeInferred: false,
        fulltextKeywords: ['impact'],
        semanticQuery: 'impact',
      },
      evidenceClasses: ['OBSERVED'],
      limitNodes: 100,
      limitEdges: 200,
    });

    expect(result.paths).toHaveLength(1);
    expect(result.edges).toHaveLength(1);
    expect(result.chunks).toHaveLength(1);
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


