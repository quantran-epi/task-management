import { describe, expect, it, vi } from 'vitest';
import {
  RetrievalService,
  readRetrievalTimeouts,
  type RetrievalServiceDependencies,
} from '../src/services/retrievalService.js';
import {
  DeterministicIndexGatewayStub,
  DeterministicEmbeddingStub,
  DeterministicPlannerStub,
  DeterministicGraphGatewayStub,
} from './fixtures/retrievalStubs.js';
import {
  StageDiagnosticSchema,
} from '../src/types/retrievalProtocol.js';
import type {
  RetrievalRequest,
  ChunkItem,
  EntityItem,
  EdgeItem,
  ClarificationCandidate,
} from '../src/types/retrievalProtocol.js';
import {
  URN_TABLE_FCL_CYCLE_COUNTER,
  URN_PROCESS_60000006,
  URN_CONTAINER_60000006,
  URN_SUBPROCESS_10000304,
  URN_PKG_FCL_CYCLE_COUNTER,
} from './fixtures/pilotGoldEntities.js';

describe('18-W0-03B: RetrievalService Pinned Parallel Orchestration & Timeouts', () => {
  const setId = 'test-set-1';
  const snapshotId = 'gsnap_abcdef12';

  const defaultRequest: RetrievalRequest = {
    query: 'explain FCL_CYCLE_COUNTER',
    limit: 20,
    includeInferred: false,
    recentTurns: [],
  };

  it('validates readRetrievalTimeouts with defaults and safe integer bounds 50-30000ms', () => {
    // Default values
    const defaults = readRetrievalTimeouts({});
    expect(defaults).toEqual({
      fulltextMs: 2000,
      vectorMs: 5000,
      graphMs: 10000,
    });

    // Valid env overrides
    const custom = readRetrievalTimeouts({
      RETRIEVAL_TIMEOUT_FULLTEXT_MS: '800',
      RETRIEVAL_TIMEOUT_VECTOR_MS: '2500',
      RETRIEVAL_TIMEOUT_GRAPH_MS: '3000',
    });
    expect(custom).toEqual({
      fulltextMs: 800,
      vectorMs: 2500,
      graphMs: 3000,
    });

    // Invalid non-integer or out of bounds (below 50 or above 30000) throws
    expect(() => readRetrievalTimeouts({ RETRIEVAL_TIMEOUT_FULLTEXT_MS: '49' })).toThrow();
    expect(() => readRetrievalTimeouts({ RETRIEVAL_TIMEOUT_VECTOR_MS: '30001' })).toThrow();
    expect(() => readRetrievalTimeouts({ RETRIEVAL_TIMEOUT_GRAPH_MS: 'abc' })).toThrow();
    expect(() => readRetrievalTimeouts({ RETRIEVAL_TIMEOUT_FULLTEXT_MS: '1.5' })).toThrow();
  });

  it('acquires lease; returns NO_EVIDENCE / PINNED_SNAPSHOT_UNAVAILABLE when no active snapshot without invoking planner or modalities', async () => {
    const indexGateway = new DeterministicIndexGatewayStub();
    indexGateway.activeSnapshotId = ''; // No active snapshot
    const embedding = new DeterministicEmbeddingStub();
    const planner = new DeterministicPlannerStub();
    const graphGateway = new DeterministicGraphGatewayStub();

    const service = new RetrievalService({
      indexGateway,
      embeddingProvider: embedding,
      queryPlanner: planner,
      graphGateway,
    });

    const response = await service.retrieve(setId, defaultRequest);
    expect(response.outcome).toBe('NO_EVIDENCE');
    expect(response.reason).toBe('PINNED_SNAPSHOT_UNAVAILABLE');
    expect(response.items).toHaveLength(0);
    expect(planner.planCalls).toHaveLength(0);
    expect(embedding.embedQueryCalls).toHaveLength(0);
  });

  it('proves fulltext, vector, and graph all start concurrently before any completes (parallel fan-out)', async () => {
    const indexGateway = new DeterministicIndexGatewayStub();
    indexGateway.activeSnapshotId = snapshotId;
    const embedding = new DeterministicEmbeddingStub();
    const planner = new DeterministicPlannerStub();
    const graphGateway = new DeterministicGraphGatewayStub();

    const startEvents: string[] = [];
    const finishEvents: string[] = [];

    // Deferred resolvers to control completion
    let resolveFulltext: (val: ChunkItem[]) => void;
    let resolveVector: (val: ChunkItem[]) => void;
    let resolveGraph: (val: any) => void;

    const fulltextPromise = new Promise<ChunkItem[]>((r) => { resolveFulltext = r; });
    const vectorPromise = new Promise<ChunkItem[]>((r) => { resolveVector = r; });
    const graphPromise = new Promise<any>((r) => { resolveGraph = r; });

    indexGateway.queryFulltext = async () => {
      startEvents.push('fulltext-start');
      const res = await fulltextPromise;
      finishEvents.push('fulltext-finish');
      return res;
    };

    embedding.embedQuery = async () => {
      startEvents.push('vector-start');
      await vectorPromise;
      finishEvents.push('vector-finish');
      return new Array(384).fill(0.1);
    };

    graphGateway.traverse = async () => {
      startEvents.push('graph-start');
      const res = await graphPromise;
      finishEvents.push('graph-finish');
      return res;
    };

    // Provide resolved candidate so planner builds plan with seed
    graphGateway.mockCandidates = [
      {
        urn: URN_TABLE_FCL_CYCLE_COUNTER,
        canonicalName: 'MAIN1.FCL_CYCLE_COUNTER',
        kind: 'DatabaseObject',
      },
    ];

    const service = new RetrievalService({
      indexGateway,
      embeddingProvider: embedding,
      queryPlanner: planner,
      graphGateway,
    });

    const retrievePromise = service.retrieve(setId, {
      query: 'MAIN1.FCL_CYCLE_COUNTER',
      limit: 20,
      includeInferred: false,
      recentTurns: [],
    });

    // Wait microtask tick for planner and parallel fan-out to start
    await new Promise((r) => setTimeout(r, 20));

    // Assert all 3 modalities started BEFORE any finished
    expect(startEvents).toContain('fulltext-start');
    expect(startEvents).toContain('vector-start');
    expect(startEvents).toContain('graph-start');
    expect(finishEvents).toHaveLength(0);

    // Resolve deferreds
    resolveFulltext!([]);
    resolveVector!([]);
    resolveGraph!({ entities: [], edges: [], truncated: false });

    const response = await retrievePromise;
    expect(response).toBeDefined();
    expect(indexGateway.activeLeases.size).toBe(0); // Lease released
  });

  it('handles timeout independently across modalities without rejecting retrieve', async () => {
    const indexGateway = new DeterministicIndexGatewayStub();
    indexGateway.activeSnapshotId = snapshotId;
    const embedding = new DeterministicEmbeddingStub();
    const planner = new DeterministicPlannerStub();
    const graphGateway = new DeterministicGraphGatewayStub();

    graphGateway.mockCandidates = [
      {
        urn: URN_TABLE_FCL_CYCLE_COUNTER,
        canonicalName: 'MAIN1.FCL_CYCLE_COUNTER',
        kind: 'DatabaseObject',
      },
    ];

    // Make fulltext hang forever
    indexGateway.queryFulltext = async (snap, crit, opts) => {
      return new Promise<ChunkItem[]>((_, reject) => {
        opts?.signal?.addEventListener('abort', () => {
          const err = new Error('Fulltext timeout');
          err.name = 'AbortError';
          reject(err);
        });
      });
    };

    // Vector finishes fast with 1 chunk
    indexGateway.queryVector = async () => [
      {
        type: 'chunk',
        id: 'chunk-vec-1',
        score: 0.9,
        modalitiesContributed: ['vector'],
        sourceDocumentId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
        sourceDocumentTitle: 'Credit calculations',
        publishedContentHash: 'a'.repeat(64),
        sectionAnchor: 'Sec',
        lineStart: 1,
        lineEnd: 5,
        rawSnippet: 'Vector snippet',
        snapshotId,
        hasConflict: false,
      },
    ];

    const service = new RetrievalService(
      {
        indexGateway,
        embeddingProvider: embedding,
        queryPlanner: planner,
        graphGateway,
      },
      {
        timeouts: {
          fulltextMs: 50, // Short timeout for test
          vectorMs: 1500,
          graphMs: 2000,
        },
      }
    );

    const response = await service.retrieve(setId, {
      query: 'MAIN1.FCL_CYCLE_COUNTER',
      limit: 20,
      includeInferred: false,
      recentTurns: [],
    });

    expect(response.modalityStatus.fulltext.status).toBe('timeout');
    expect(response.modalityStatus.fulltext.reason).toBe('TIMEOUT');
    expect(response.modalityStatus.vector.status).toBe('ok');
    expect(response.outcome).toBe('DEGRADED');
    expect(response.diagnostics.degraded).toBe(true);
    expect(response.items.length).toBeGreaterThan(0);
    expect(response.paths).toEqual([]);
    const chunk = response.items.find((item) => item.type === 'chunk');
    expect(chunk).toMatchObject({
      sourceDocumentTitle: 'Credit calculations',
      publishedContentHash: 'a'.repeat(64),
    });
    expect(indexGateway.activeLeases.size).toBe(0); // Lease released in finally
  });

  it('skips embedding query and returns MODEL_INDEX_MISMATCH when provider metadata differs from pinned index metadata', async () => {
    const indexGateway = new DeterministicIndexGatewayStub();
    indexGateway.activeSnapshotId = snapshotId;
    indexGateway.validateVectorIndexMetadata = async () => false; // Mismatch!

    const embedding = new DeterministicEmbeddingStub();
    const planner = new DeterministicPlannerStub();
    const graphGateway = new DeterministicGraphGatewayStub();
    graphGateway.mockCandidates = [
      {
        urn: URN_TABLE_FCL_CYCLE_COUNTER,
        canonicalName: 'MAIN1.FCL_CYCLE_COUNTER',
        kind: 'DatabaseObject',
      },
    ];

    const service = new RetrievalService({
      indexGateway,
      embeddingProvider: embedding,
      queryPlanner: planner,
      graphGateway,
    });

    const response = await service.retrieve(setId, defaultRequest);
    expect(response.modalityStatus.vector.status).toBe('unavailable');
    expect(response.modalityStatus.vector.reason).toBe('MODEL_INDEX_MISMATCH');
    expect(embedding.embedQueryCalls).toHaveLength(0); // No query embedding generated
  });

  it('graph without seed returns NO_GRAPH_SEED with zero Neo4j traverse gateway calls', async () => {
    const indexGateway = new DeterministicIndexGatewayStub();
    indexGateway.activeSnapshotId = snapshotId;
    const embedding = new DeterministicEmbeddingStub();
    const planner = new DeterministicPlannerStub();
    const graphGateway = new DeterministicGraphGatewayStub();
    graphGateway.mockCandidates = []; // No candidates -> no seed

    let traverseCalled = false;
    graphGateway.traverse = async () => {
      traverseCalled = true;
      return { entities: [], edges: [], truncated: false };
    };

    const service = new RetrievalService({
      indexGateway,
      embeddingProvider: embedding,
      queryPlanner: planner,
      graphGateway,
    });

    const response = await service.retrieve(setId, {
      query: 'what is this generic concept',
      limit: 20,
      includeInferred: false,
      recentTurns: [],
    });

    expect(traverseCalled).toBe(false);
    expect(response.modalityStatus.graph.status).toBe('unavailable');
    expect(response.modalityStatus.graph.reason).toBe('NO_GRAPH_SEED');
  });

  it('clarification starts all 3 modalities concurrently, passes empty seed to graph, and retains safe candidates', async () => {
    const indexGateway = new DeterministicIndexGatewayStub();
    indexGateway.activeSnapshotId = snapshotId;
    const embedding = new DeterministicEmbeddingStub();
    const planner = new DeterministicPlannerStub();
    const graphGateway = new DeterministicGraphGatewayStub();

    // Two candidates -> collision -> NEEDS_CLARIFICATION
    const candidate1: ClarificationCandidate = {
      urn: 'urn:plannermate:smartvista:ScheduledProcess:60000006',
      canonicalName: 'SHB - Credit calculations',
      kind: 'ScheduledProcess',
    };
    const candidate2: ClarificationCandidate = {
      urn: 'urn:plannermate:smartvista:ProcessStep:60000006',
      canonicalName: 'Step 20 - Grace period length cycle',
      kind: 'ProcessStep',
    };
    graphGateway.mockCandidates = [candidate1, candidate2];

    const starts: string[] = [];
    indexGateway.queryFulltext = async () => {
      starts.push('fulltext-start');
      return [
        {
          type: 'chunk',
          id: 'chunk-ft-1',
          score: 1.0,
          modalitiesContributed: ['fulltext'],
          sourceDocumentId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
          sourceDocumentTitle: 'Credit calculations',
          publishedContentHash: 'a'.repeat(64),
          sectionAnchor: 'Sec',
          lineStart: 1,
          lineEnd: 5,
          rawSnippet: 'Evidence for clarification',
          snapshotId,
          hasConflict: false,
        },
      ];
    };

    embedding.embedQuery = async () => {
      starts.push('vector-start');
      return new Array(384).fill(0.1);
    };

    let graphTraverseCalled = false;
    graphGateway.traverse = async () => {
      graphTraverseCalled = true;
      return { entities: [], edges: [], truncated: false };
    };

    const service = new RetrievalService({
      indexGateway,
      embeddingProvider: embedding,
      queryPlanner: planner,
      graphGateway,
    });

    const response = await service.retrieve(setId, {
      query: '60000006 ảnh hưởng gì?',
      limit: 20,
      includeInferred: false,
      recentTurns: [],
    });

    expect(starts).toContain('fulltext-start');
    expect(starts).toContain('vector-start');
    expect(graphTraverseCalled).toBe(false); // Empty seeds, zero traverse calls

    expect(response.outcome).toBe('NEEDS_CLARIFICATION');
    expect(response.candidates).toHaveLength(2);
    expect(response.modalityStatus.graph.status).toBe('unavailable');
    expect(response.modalityStatus.graph.reason).toBe('NO_GRAPH_SEED');
    expect(response.items.length).toBeGreaterThan(0); // Lexical evidence retained
    expect(indexGateway.activeLeases.size).toBe(0); // Lease released
  });

  it('returns an ordered path only when every hop citation survives fusion', async () => {
    const indexGateway = new DeterministicIndexGatewayStub();
    indexGateway.activeSnapshotId = snapshotId;
    const embedding = new DeterministicEmbeddingStub();
    const planner = new DeterministicPlannerStub();
    const graphGateway = new DeterministicGraphGatewayStub();
    graphGateway.mockCandidates = [{
      urn: URN_TABLE_FCL_CYCLE_COUNTER,
      canonicalName: 'MAIN1.FCL_CYCLE_COUNTER',
      kind: 'DatabaseObject',
    }];
    indexGateway.queryFulltext = async () => [{
      type: 'chunk',
      id: 'chunk-path-1',
      score: 1,
      modalitiesContributed: ['fulltext'],
      sourceDocumentId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      sourceDocumentTitle: 'Credit calculations',
      sectionAnchor: 'Flow',
      lineStart: 1,
      lineEnd: 3,
      rawSnippet: 'Path evidence',
      publishedContentHash: 'a'.repeat(64),
      snapshotId,
      hasConflict: false,
    }];
    graphGateway.traverse = async () => ({
      chunks: [{
        type: 'chunk',
        id: 'chunk-path-1',
        score: 1,
        modalitiesContributed: ['graph'],
        sourceDocumentId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
        sourceDocumentTitle: 'Credit calculations',
        sectionAnchor: 'Flow',
        lineStart: 1,
        lineEnd: 3,
        rawSnippet: 'Path evidence',
        publishedContentHash: 'a'.repeat(64),
        snapshotId,
        hasConflict: false,
      }],
      entities: [],
      edges: [],
      paths: [{
        nodeUrns: [
          'urn:plannermate:smartvista:PRC_PROCESS:60000006',
          'urn:plannermate:smartvista:PRC_CONTAINER:60000006',
        ],
        edgeFactKeys: ['a'.repeat(64)],
        hopClassifications: ['OBSERVED'],
        hopSupportingChunkIds: [['chunk-path-1']],
        edgeSnapshotIds: [snapshotId],
        hasConflict: false,
      }],
      truncated: false,
    });

    const service = new RetrievalService({
      indexGateway,
      embeddingProvider: embedding,
      queryPlanner: planner,
      graphGateway,
    });
    const closed = await service.retrieve(setId, defaultRequest);
    expect(closed.paths).toHaveLength(1);
    expect(closed.paths[0]?.hopCitationIds).toEqual([['chunk-path-1']]);

    indexGateway.queryFulltext = async () => [];
    graphGateway.traverse = async () => ({
      chunks: [],
      entities: [],
      edges: [],
      paths: [{
        nodeUrns: [
          'urn:plannermate:smartvista:PRC_PROCESS:60000006',
          'urn:plannermate:smartvista:PRC_CONTAINER:60000006',
        ],
        edgeFactKeys: ['a'.repeat(64)],
        hopClassifications: ['OBSERVED'],
        hopSupportingChunkIds: [['chunk-path-1']],
        edgeSnapshotIds: [snapshotId],
        hasConflict: false,
      }],
      truncated: false,
    });
    const dropped = await service.retrieve(setId, defaultRequest);
    expect(dropped.paths).toEqual([]);
  });

  it('returns null conflict scope proof when structured metadata is absent', async () => {
    const indexGateway = new DeterministicIndexGatewayStub();
    indexGateway.activeSnapshotId = snapshotId;
    const embedding = new DeterministicEmbeddingStub();
    const planner = new DeterministicPlannerStub();
    const graphGateway = new DeterministicGraphGatewayStub();
    graphGateway.mockCandidates = [{
      urn: URN_TABLE_FCL_CYCLE_COUNTER,
      canonicalName: 'MAIN1.FCL_CYCLE_COUNTER',
      kind: 'DatabaseObject',
    }];
    graphGateway.mockEdges = [
      {
        type: 'edge', id: 'a'.repeat(64), factKey: 'a'.repeat(64), score: 1,
        modalitiesContributed: ['graph'],
        sourceUrn: 'urn:plannermate:smartvista:ProcessStep:STEP_A',
        relationType: 'HAS_STATUS',
        targetUrn: 'urn:plannermate:smartvista:ProcessingStatus:RUNNING',
        evidenceClass: 'OBSERVED', supportingChunkIds: [], snapshotId, hasConflict: false,
      },
      {
        type: 'edge', id: 'b'.repeat(64), factKey: 'b'.repeat(64), score: 1,
        modalitiesContributed: ['graph'],
        sourceUrn: 'urn:plannermate:smartvista:ProcessStep:STEP_A',
        relationType: 'HAS_STATUS',
        targetUrn: 'urn:plannermate:smartvista:ProcessingStatus:FAILED',
        evidenceClass: 'OBSERVED', supportingChunkIds: [], snapshotId, hasConflict: false,
      },
    ];

    const service = new RetrievalService({
      indexGateway,
      embeddingProvider: embedding,
      queryPlanner: planner,
      graphGateway,
    });
    const response = await service.retrieve(setId, defaultRequest);

    expect(response.conflictGroups).toHaveLength(1);
    expect(response.conflictGroups[0]).toMatchObject({
      dimension: 'Unknown',
      scopeProof: null,
    });
  });

  it('releases lease in finally even when planner, modalities, or fusion throw', async () => {
    const indexGateway = new DeterministicIndexGatewayStub();
    indexGateway.activeSnapshotId = snapshotId;
    const embedding = new DeterministicEmbeddingStub();
    const planner = new DeterministicPlannerStub();
    const graphGateway = new DeterministicGraphGatewayStub();

    // Force planner to throw non-recoverable error
    graphGateway.resolveEntities = async () => {
      throw new Error('Fatal repository failure');
    };

    const service = new RetrievalService({
      indexGateway,
      embeddingProvider: embedding,
      queryPlanner: planner,
      graphGateway,
    });

    await expect(service.retrieve(setId, defaultRequest)).rejects.toThrow('Fatal repository failure');
    expect(indexGateway.activeLeases.size).toBe(0); // Lease released despite exception
  });

  describe('18-SERVICE-01: Strict Semantic Outcomes, Fusion, Promotion Race, and Redaction', () => {
    it('returns NO_EVIDENCE when non-fast-path retrieval only has weak uncorroborated candidates', async () => {
      const indexGateway = new DeterministicIndexGatewayStub();
      indexGateway.activeSnapshotId = snapshotId;
      const embedding = new DeterministicEmbeddingStub();
      const planner = new DeterministicPlannerStub();
      const graphGateway = new DeterministicGraphGatewayStub();
      graphGateway.mockCandidates = [{
        urn: URN_TABLE_FCL_CYCLE_COUNTER,
        canonicalName: 'MAIN1.FCL_CYCLE_COUNTER',
        kind: 'DatabaseObject',
      }];
      planner.scriptedResult = {
        type: 'plan',
        plan: {
          planId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          queryIntent: 'DEPENDENCY_CHECK',
          seedUrns: [URN_TABLE_FCL_CYCLE_COUNTER],
          traversalSteps: [],
          overallMaxDepth: 1,
          includeInferred: false,
          fulltextKeywords: ['unrelated topic'],
          semanticQuery: 'unrelated topic',
        },
      };
      const weakChunk: ChunkItem = {
        type: 'chunk',
        id: 'weak-noise',
        score: 0.55,
        modalitiesContributed: ['vector'],
        sourceDocumentId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
        sourceDocumentTitle: 'Credit calculations',
        publishedContentHash: 'a'.repeat(64),
        sectionAnchor: 'Sec',
        lineStart: 1,
        lineEnd: 5,
        rawSnippet: 'Unrelated evidence',
        snapshotId,
        hasConflict: false,
      };
      indexGateway.vectorChunks = [weakChunk];
      indexGateway.fulltextChunks = [{ ...weakChunk, modalitiesContributed: ['fulltext'] }];

      const response = await new RetrievalService({
        indexGateway,
        embeddingProvider: embedding,
        queryPlanner: planner,
        graphGateway,
      }).retrieve(setId, {
        query: 'unsupported natural language question',
        limit: 20,
        includeInferred: false,
        recentTurns: [],
      });

      expect(response.outcome).toBe('NO_EVIDENCE');
      expect(response.items).toEqual([]);
      expect(response.reason).toBe('NO_MATCHING_EVIDENCE');
    });

    it.each([
      'Thủ tục xử lý chuyển tiền quốc tế SWIFT MT103 trong container 60000006 hoạt động ra sao?',
      'Hãy phỏng đoán xem container 60000006 có thể hỗ trợ chuẩn SWIFT MT103 trong tương lai không?',
    ])('keeps graph evidence while gating uncorroborated fulltext and vector: %s', async (query) => {
      const indexGateway = new DeterministicIndexGatewayStub();
      indexGateway.activeSnapshotId = snapshotId;
      const embedding = new DeterministicEmbeddingStub();
      const planner = new DeterministicPlannerStub();
      const graphGateway = new DeterministicGraphGatewayStub();
      const processUrn = 'urn:plannermate:smartvista:ScheduledProcess:60000006';
      graphGateway.mockCandidates = [{
        urn: processUrn,
        canonicalName: 'SHB Credit calculations container 60000006',
        kind: 'ScheduledProcess',
      }];
      planner.scriptedResult = {
        type: 'plan',
        plan: {
          planId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          queryIntent: 'LOOKUP',
          seedUrns: [processUrn],
          traversalSteps: [{ relationType: 'CONTAINS_STEP', direction: 'OUTGOING', maxHops: 1 }],
          overallMaxDepth: 1,
          includeInferred: false,
          fulltextKeywords: ['SWIFT MT103'],
          semanticQuery: query,
        },
      };
      const graphChunk: ChunkItem = {
        type: 'chunk', id: 'credit-flow', score: 1, modalitiesContributed: ['graph'],
        sourceDocumentId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
        sourceDocumentTitle: 'Credit calculations', publishedContentHash: 'a'.repeat(64),
        sectionAnchor: 'Flow', lineStart: 1, lineEnd: 3,
        rawSnippet: 'Container executes credit calculation and billing cycles.', snapshotId,
        hasConflict: false,
      };
      graphGateway.traverse = async () => ({
        chunks: [graphChunk],
        entities: [{
          type: 'entity', id: processUrn, score: 1, modalitiesContributed: ['graph'],
          urn: processUrn, canonicalName: 'SHB Credit calculations container 60000006',
          kind: 'ScheduledProcess', snapshotId, hasConflict: false,
        }],
        edges: [], paths: [], truncated: false,
      });
      indexGateway.fulltextChunks = [{ ...graphChunk, modalitiesContributed: ['fulltext'], score: 0.2 }];
      indexGateway.vectorChunks = [{ ...graphChunk, modalitiesContributed: ['vector'], score: 0.55 }];

      const response = await new RetrievalService({
        indexGateway, embeddingProvider: embedding, queryPlanner: planner, graphGateway,
      }).retrieve(setId, { query, limit: 20, includeInferred: false, recentTurns: [] });

      // Graph evidence is exempt from the text-corroboration gate (D-01, T-24-06);
      // the same chunk arriving as fulltext/vector would still be gated out.
      expect(response.outcome).toBe('READY');
      expect(response.items.some((item) => item.type === 'entity' && item.urn === processUrn)).toBe(true);
      expect(response.paths).toEqual([]);
      expect(response.modalityStatus.graph.status).toBe('ok');
    });

    it('keeps cross-lingual semantic evidence at the calibrated multilingual floor', async () => {
      const indexGateway = new DeterministicIndexGatewayStub();
      indexGateway.activeSnapshotId = snapshotId;
      const embedding = new DeterministicEmbeddingStub();
      const planner = new DeterministicPlannerStub();
      const graphGateway = new DeterministicGraphGatewayStub();
      graphGateway.mockCandidates = [{
        urn: URN_TABLE_FCL_CYCLE_COUNTER,
        canonicalName: 'MAIN1.FCL_CYCLE_COUNTER',
        kind: 'DatabaseObject',
      }];
      const relevant: ChunkItem = {
        type: 'chunk',
        id: 'cross-lingual-hit',
        score: 0.69,
        modalitiesContributed: ['vector'],
        sourceDocumentId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
        sourceDocumentTitle: 'Credit calculations',
        publishedContentHash: 'a'.repeat(64),
        sectionAnchor: 'Data objects',
        lineStart: 1,
        lineEnd: 5,
        rawSnippet: 'English evidence for Vietnamese query',
        snapshotId,
        hasConflict: false,
      };
      indexGateway.vectorChunks = [relevant];

      const response = await new RetrievalService({
        indexGateway,
        embeddingProvider: embedding,
        queryPlanner: planner,
        graphGateway,
      }).retrieve(setId, {
        query: 'Các bảng dữ liệu và chu kỳ tính toán lãi suất container 60000006 là gì?',
        limit: 20,
        includeInferred: false,
        recentTurns: [],
      });

      expect(response.outcome).toBe('READY');
      expect(response.items.map((item) => item.id)).toContain(relevant.id);
    });

    it('returns READY when all modalities succeed and query returns items', async () => {
      const indexGateway = new DeterministicIndexGatewayStub();
      indexGateway.activeSnapshotId = snapshotId;
      const embedding = new DeterministicEmbeddingStub();
      const planner = new DeterministicPlannerStub();
      const graphGateway = new DeterministicGraphGatewayStub();

      graphGateway.mockCandidates = [
        {
          urn: URN_TABLE_FCL_CYCLE_COUNTER,
          canonicalName: 'MAIN1.FCL_CYCLE_COUNTER',
          kind: 'DatabaseObject',
        },
      ];

      indexGateway.queryFulltext = async () => [
        {
          type: 'chunk',
          id: 'chunk-ft-1',
          score: 1.0,
          modalitiesContributed: ['fulltext'],
          sourceDocumentId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
          sourceDocumentTitle: 'Credit calculations',
          publishedContentHash: 'a'.repeat(64),
          sectionAnchor: 'Sec',
          lineStart: 1,
          lineEnd: 5,
          rawSnippet: 'Ready snippet',
          snapshotId,
          hasConflict: false,
        },
      ];

      const service = new RetrievalService({
        indexGateway,
        embeddingProvider: embedding,
        queryPlanner: planner,
        graphGateway,
      });

      const response = await service.retrieve(setId, {
        query: 'MAIN1.FCL_CYCLE_COUNTER',
        limit: 20,
        includeInferred: false,
        recentTurns: [],
      });

      expect(response.outcome).toBe('READY');
      expect(response.diagnostics.degraded).toBe(false);
      expect(response.items).toHaveLength(1);
      expect(response.items[0]?.snapshotId).toBe(snapshotId);
    });

    it('returns DEGRADED when vector provider is unconfigured, yet retains and fuses fulltext and graph items', async () => {
      const indexGateway = new DeterministicIndexGatewayStub();
      indexGateway.activeSnapshotId = snapshotId;
      const planner = new DeterministicPlannerStub();
      const graphGateway = new DeterministicGraphGatewayStub();

      graphGateway.mockCandidates = [
        {
          urn: URN_TABLE_FCL_CYCLE_COUNTER,
          canonicalName: 'MAIN1.FCL_CYCLE_COUNTER',
          kind: 'DatabaseObject',
        },
      ];

      indexGateway.queryFulltext = async () => [
        {
          type: 'chunk',
          id: 'chunk-ft-1',
          score: 1.0,
          modalitiesContributed: ['fulltext'],
          sourceDocumentId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
          sourceDocumentTitle: 'Credit calculations',
          publishedContentHash: 'a'.repeat(64),
          sectionAnchor: 'Sec',
          lineStart: 1,
          lineEnd: 5,
          rawSnippet: 'Fulltext snippet',
          snapshotId,
          hasConflict: false,
        },
      ];

      graphGateway.traverse = async () => ({
        entities: [
          {
            type: 'entity',
            id: URN_TABLE_FCL_CYCLE_COUNTER,
            score: 1.0,
            modalitiesContributed: ['graph'],
            urn: URN_TABLE_FCL_CYCLE_COUNTER,
            canonicalName: 'MAIN1.FCL_CYCLE_COUNTER',
            kind: 'DatabaseObject',
            snapshotId,
            hasConflict: false,
          },
        ],
        edges: [],
        truncated: false,
      });

      // No embedding provider configured
      const service = new RetrievalService({
        indexGateway,
        embeddingProvider: undefined,
        queryPlanner: planner,
        graphGateway,
      });

      const response = await service.retrieve(setId, {
        query: 'MAIN1.FCL_CYCLE_COUNTER',
        limit: 20,
        includeInferred: false,
        recentTurns: [],
      });

      expect(response.outcome).toBe('DEGRADED');
      expect(response.diagnostics.degraded).toBe(true);
      expect(response.modalityStatus.vector.status).toBe('unavailable');
      expect(response.modalityStatus.vector.reason).toBe('UNCONFIGURED');
      expect(response.modalitiesUsed).not.toContain('vector');
      expect(response.modalitiesUsed).toEqual(expect.arrayContaining(['fulltext', 'graph']));
      expect(response.items.length).toBeGreaterThanOrEqual(2);
    });

    it('discards candidates from modality returning mismatched snapshotId during mid-query promotion race and marks that modality stale', async () => {
      const indexGateway = new DeterministicIndexGatewayStub();
      indexGateway.activeSnapshotId = 'gsnap_00000001'; // Leased generation
      const embedding = new DeterministicEmbeddingStub();
      const planner = new DeterministicPlannerStub();
      const graphGateway = new DeterministicGraphGatewayStub();

      graphGateway.mockCandidates = [
        {
          urn: URN_TABLE_FCL_CYCLE_COUNTER,
          canonicalName: 'MAIN1.FCL_CYCLE_COUNTER',
          kind: 'DatabaseObject',
        },
      ];

      // Fulltext correctly returns pinned snapshot
      indexGateway.queryFulltext = async () => [
        {
          type: 'chunk',
          id: 'chunk-ft-1',
          score: 1.0,
          modalitiesContributed: ['fulltext'],
          sourceDocumentId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
          sourceDocumentTitle: 'Credit calculations',
          publishedContentHash: 'a'.repeat(64),
          sectionAnchor: 'Sec',
          lineStart: 1,
          lineEnd: 5,
          rawSnippet: 'Pinned generation snippet',
          snapshotId: 'gsnap_00000001',
          hasConflict: false,
        },
      ];

      // Vector adapter raced and read from newly promoted generation 'gsnap_00000002'
      indexGateway.queryVector = async () => [
        {
          type: 'chunk',
          id: 'chunk-vec-mismatched',
          score: 1.0,
          modalitiesContributed: ['vector'],
          sourceDocumentId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
          sourceDocumentTitle: 'Credit calculations',
          publishedContentHash: 'a'.repeat(64),
          sectionAnchor: 'Sec',
          lineStart: 1,
          lineEnd: 5,
          rawSnippet: 'Raced snippet',
          snapshotId: 'gsnap_00000002', // Stale mismatch!
          hasConflict: false,
        },
      ];

      const service = new RetrievalService({
        indexGateway,
        embeddingProvider: embedding,
        queryPlanner: planner,
        graphGateway,
      });

      const response = await service.retrieve(setId, {
        query: 'MAIN1.FCL_CYCLE_COUNTER',
        limit: 20,
        includeInferred: false,
        recentTurns: [],
      });

      expect(response.snapshotId).toBe('gsnap_00000001');
      expect(response.modalityStatus.vector.status).toBe('stale');
      expect(response.modalityStatus.vector.reason).toBe('PINNED_SNAPSHOT_UNAVAILABLE');
      // Mismatched vector item discarded
      expect(response.items.find((i) => i.id === 'chunk-vec-mismatched')).toBeUndefined();
      expect(response.items.every((i) => i.snapshotId === 'gsnap_00000001')).toBe(true);
    });

    it('returns UNSUPPORTED outcome when query planner encounters unsupported query construct', async () => {
      const indexGateway = new DeterministicIndexGatewayStub();
      indexGateway.activeSnapshotId = snapshotId;
      const embedding = new DeterministicEmbeddingStub();
      const planner = new DeterministicPlannerStub();
      const graphGateway = new DeterministicGraphGatewayStub();

      graphGateway.mockCandidates = [
        {
          urn: URN_TABLE_FCL_CYCLE_COUNTER,
          canonicalName: 'MAIN1.FCL_CYCLE_COUNTER',
          kind: 'DatabaseObject',
        },
      ];

      planner.scriptedResult = {
        type: 'unsupported',
        reason: 'Recursive cycle aggregation query unsupported in Phase 18',
        unsupportedConstructs: ['RECURSIVE_CYCLE_AGGREGATION'],
      };

      const service = new RetrievalService({
        indexGateway,
        embeddingProvider: embedding,
        queryPlanner: planner,
        graphGateway,
      });

      const response = await service.retrieve(setId, {
        query: 'find all recursive cycles in 60000006',
        limit: 20,
        includeInferred: false,
        recentTurns: [],
      });

      expect(response.outcome).toBe('UNSUPPORTED');
      expect(response.reason).toBe('Recursive cycle aggregation query unsupported in Phase 18');
      expect(response.unsupportedConstructs).toEqual(['RECURSIVE_CYCLE_AGGREGATION']);
    });

    it('redacts any provider secrets or endpoint URLs and ensures envelope passes strict schema validation', async () => {
      const indexGateway = new DeterministicIndexGatewayStub();
      indexGateway.activeSnapshotId = snapshotId;
      const planner = new DeterministicPlannerStub();
      const graphGateway = new DeterministicGraphGatewayStub();

      graphGateway.mockCandidates = [
        {
          urn: URN_TABLE_FCL_CYCLE_COUNTER,
          canonicalName: 'MAIN1.FCL_CYCLE_COUNTER',
          kind: 'DatabaseObject',
        },
      ];

      // Provider stub with accidental secret properties
      const contaminatedProvider: any = {
        describe() {
          return {
            provider: 'remote-openai',
            model: 'text-embedding-3-small',
            revision: 'v1',
            dimensions: 1536,
            policyVersion: '2026.10.1',
            apiKey: 'sk-secret-token-12345',
            endpointUrl: 'https://api.openai.com/v1/embeddings',
          };
        },
        async embedDocuments() { return []; },
        async embedQuery() { return new Array(1536).fill(0.1); },
      };

      indexGateway.validateVectorIndexMetadata = async () => true;

      const service = new RetrievalService({
        indexGateway,
        embeddingProvider: contaminatedProvider,
        queryPlanner: planner,
        graphGateway,
      });

      const response = await service.retrieve(setId, {
        query: 'MAIN1.FCL_CYCLE_COUNTER',
        limit: 20,
        includeInferred: false,
        recentTurns: [],
      });

      // Assert secrets not leaked
      expect((response.embeddingProvider as any).apiKey).toBeUndefined();
      expect((response.embeddingProvider as any).endpointUrl).toBeUndefined();
      const serialized = JSON.stringify(response);
      expect(serialized).not.toContain('sk-secret-token-12345');
      expect(serialized).not.toContain('https://api.openai.com');
    });

    it('preserves conflict groups and tags across divergent functional targets in final response', async () => {
      const indexGateway = new DeterministicIndexGatewayStub();
      indexGateway.activeSnapshotId = snapshotId;
      const embedding = new DeterministicEmbeddingStub();
      const planner = new DeterministicPlannerStub();
      const graphGateway = new DeterministicGraphGatewayStub();

      graphGateway.mockCandidates = [
        {
          urn: URN_TABLE_FCL_CYCLE_COUNTER,
          canonicalName: 'MAIN1.FCL_CYCLE_COUNTER',
          kind: 'DatabaseObject',
        },
      ];

      const factKey1 = 'a'.repeat(64);
      const factKey2 = 'b'.repeat(64);

      // Two conflicting edges with divergent targets for functional HAS_STATUS
      const edge1: EdgeItem = {
        type: 'edge',
        id: factKey1,
        score: 1.0,
        modalitiesContributed: ['graph'],
        factKey: factKey1,
        sourceUrn: 'urn:plannermate:smartvista:ProcessStep:STEP_A',
        relationType: 'HAS_STATUS',
        targetUrn: 'urn:plannermate:smartvista:ProcessingStatus:STATUS_RUNNING',
        evidenceClass: 'OBSERVED',
        supportingChunkIds: [],
        snapshotId,
        hasConflict: false,
      };

      const edge2: EdgeItem = {
        type: 'edge',
        id: factKey2,
        score: 0.9,
        modalitiesContributed: ['graph'],
        factKey: factKey2,
        sourceUrn: 'urn:plannermate:smartvista:ProcessStep:STEP_A',
        relationType: 'HAS_STATUS',
        targetUrn: 'urn:plannermate:smartvista:ProcessingStatus:STATUS_FAILED',
        evidenceClass: 'OBSERVED',
        supportingChunkIds: [],
        snapshotId,
        hasConflict: false,
      };

      graphGateway.traverse = async () => ({
        entities: [],
        edges: [edge1, edge2],
        truncated: false,
      });

      const service = new RetrievalService({
        indexGateway,
        embeddingProvider: embedding,
        queryPlanner: planner,
        graphGateway,
      });

      const response = await service.retrieve(setId, {
        query: 'MAIN1.FCL_CYCLE_COUNTER',
        limit: 20,
        includeInferred: false,
        recentTurns: [],
      });

      const conflictingEdges = response.items.filter((i) => i.type === 'edge' && i.hasConflict);
      expect(conflictingEdges).toHaveLength(2);
      expect(conflictingEdges[0]?.conflictGroupId).toBeDefined();
      expect(conflictingEdges[0]?.conflictGroupId).toBe(conflictingEdges[1]?.conflictGroupId);
    });

    it('T4 regression: corroborates multi-hop technical terms across returned evidence pool without requiring all terms per chunk', async () => {
      const indexGateway = new DeterministicIndexGatewayStub();
      indexGateway.activeSnapshotId = snapshotId;
      const embedding = new DeterministicEmbeddingStub();
      const planner = new DeterministicPlannerStub();
      const graphGateway = new DeterministicGraphGatewayStub();

      const query = 'Quy trình thực thi của container 60000006 diễn ra theo các bước nào từ Scheduler đến PL/SQL?';

      graphGateway.mockCandidates = [
        {
          urn: URN_CONTAINER_60000006,
          canonicalName: 'Step 20 - Grace period length cycle',
          kind: 'ProcessStep',
        },
      ];

      planner.scriptedResult = {
        type: 'plan',
        plan: {
          planId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          queryIntent: 'FLOW_TRAVERSAL',
          seedUrns: [URN_CONTAINER_60000006],
          traversalSteps: [
            // ProcessStep may only INVOKE outbound; CALLS requires a SoftwareComponent seed.
            { relationType: 'INVOKES', direction: 'OUTGOING', maxHops: 1 },
          ],
          overallMaxDepth: 1,
          includeInferred: false,
          fulltextKeywords: ['container 60000006', 'Scheduler', 'PL/SQL'],
          semanticQuery: query,
        },
      };

      // Chunk 1 from 01-wiring.md contains Scheduler and Container but not PL/SQL
      const chunkWiring: ChunkItem = {
        type: 'chunk',
        id: 'chunk-wiring-01',
        score: 0.95,
        modalitiesContributed: ['fulltext'],
        sourceDocumentId: '00000000-0000-4000-8000-000000000001',
        sourceDocumentTitle: '01-wiring.md',
        sectionAnchor: 'Scheduler to Container',
        lineStart: 1,
        lineEnd: 20,
        rawSnippet: 'Scheduler kích hoạt container 60000006 để bắt đầu quy trình thực thi.',
        publishedContentHash: 'a'.repeat(64),
        snapshotId,
        hasConflict: false,
      };

      // Chunk 2 from 03-call-chain.md contains PL/SQL and package call but not Scheduler
      const chunkCallChain: ChunkItem = {
        type: 'chunk',
        id: 'chunk-callchain-03',
        score: 0.9,
        modalitiesContributed: ['graph'],
        sourceDocumentId: '00000000-0000-4000-8000-000000000002',
        sourceDocumentTitle: '03-call-chain.md',
        sectionAnchor: 'PL/SQL Call Chain',
        lineStart: 10,
        lineEnd: 30,
        rawSnippet: 'Quy trình bước này gọi PL/SQL package procedure MAIN1.FCL_PRC_CYCLE_COUNTER_PKG.PROCESS.',
        publishedContentHash: 'b'.repeat(64),
        snapshotId,
        hasConflict: false,
      };

      indexGateway.fulltextChunks = [chunkWiring];
      indexGateway.vectorChunks = [chunkWiring];

      const edgeFactKey = 'f'.repeat(64);
      graphGateway.traverse = async () => ({
        chunks: [chunkCallChain],
        entities: [
          {
            type: 'entity',
            id: URN_CONTAINER_60000006,
            score: 1.0,
            modalitiesContributed: ['graph'],
            urn: URN_CONTAINER_60000006,
            canonicalName: 'Step 20 - Grace period length cycle',
            kind: 'ProcessStep',
            snapshotId,
            hasConflict: false,
          },
          {
            type: 'entity',
            id: URN_PKG_FCL_CYCLE_COUNTER,
            score: 1.0,
            modalitiesContributed: ['graph'],
            urn: URN_PKG_FCL_CYCLE_COUNTER,
            canonicalName: 'MAIN1.FCL_PRC_CYCLE_COUNTER_PKG.PROCESS',
            kind: 'SoftwareComponent',
            snapshotId,
            hasConflict: false,
          },
        ],
        edges: [
          {
            type: 'edge',
            id: edgeFactKey,
            score: 1.0,
            modalitiesContributed: ['graph'],
            factKey: edgeFactKey,
            sourceUrn: URN_CONTAINER_60000006,
            relationType: 'INVOKES',
            targetUrn: URN_PKG_FCL_CYCLE_COUNTER,
            evidenceClass: 'OBSERVED',
            supportingChunkIds: ['chunk-callchain-03'],
            snapshotId,
            hasConflict: false,
          },
        ],
        paths: [
          {
            nodeUrns: [URN_CONTAINER_60000006, URN_PKG_FCL_CYCLE_COUNTER],
            edgeFactKeys: [edgeFactKey],
            hopClassifications: ['OBSERVED'],
            hopSupportingChunkIds: [['chunk-callchain-03']],
            edgeSnapshotIds: [snapshotId],
            hasConflict: false,
          },
        ],
        truncated: false,
      });

      const service = new RetrievalService({
        indexGateway,
        embeddingProvider: embedding,
        queryPlanner: planner,
        graphGateway,
      });

      const response = await service.retrieve(setId, {
        query,
        limit: 20,
        includeInferred: false,
        recentTurns: [],
      });

      expect(response.outcome).toBe('READY');
      expect(response.items.length).toBeGreaterThan(0);
      expect(response.paths).toHaveLength(1);
      expect(response.paths[0]?.nodeUrns).toEqual([URN_CONTAINER_60000006, URN_PKG_FCL_CYCLE_COUNTER]);
      expect(response.paths[0]?.hopCitationIds).toEqual([['chunk-callchain-03']]);
    });

    it('T5 regression: preserves a planner IMPACT_ANALYSIS DatabaseObject plan without rewriting it', async () => {
      const indexGateway = new DeterministicIndexGatewayStub();
      indexGateway.activeSnapshotId = snapshotId;
      const embedding = new DeterministicEmbeddingStub();
      const planner = new DeterministicPlannerStub();
      const graphGateway = new DeterministicGraphGatewayStub();

      const query = 'Nếu thay đổi cấu trúc bảng MAIN1.FCL_CYCLE_COUNTER thì những package và quy trình nào bị ảnh hưởng?';

      graphGateway.mockCandidates = [
        {
          urn: URN_TABLE_FCL_CYCLE_COUNTER,
          canonicalName: 'MAIN1.FCL_CYCLE_COUNTER',
          kind: 'DatabaseObject',
        },
      ];

      // Server no longer rewrites impact plans; the planner's per-seed steps survive verbatim.
      planner.scriptedResult = {
        type: 'plan',
        plan: {
          planId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
          queryIntent: 'IMPACT_ANALYSIS',
          seedUrns: [URN_TABLE_FCL_CYCLE_COUNTER],
          traversalSteps: [
            { relationType: 'READS_FROM', direction: 'INCOMING', maxHops: 1 },
            { relationType: 'WRITES_TO', direction: 'INCOMING', maxHops: 1 },
          ],
          overallMaxDepth: 1,
          includeInferred: false,
          fulltextKeywords: ['MAIN1.FCL_CYCLE_COUNTER'],
          semanticQuery: query,
        },
      };

      const chunkImpact: ChunkItem = {
        type: 'chunk',
        id: 'chunk-impact-01',
        score: 0.95,
        modalitiesContributed: ['fulltext'],
        sourceDocumentId: '00000000-0000-4000-8000-000000000003',
        sourceDocumentTitle: 'Data Dictionary',
        sectionAnchor: 'FCL_CYCLE_COUNTER',
        lineStart: 1,
        lineEnd: 15,
        rawSnippet: 'Bảng MAIN1.FCL_CYCLE_COUNTER được đọc và cập nhật bởi gói thủ tục chu kỳ.',
        publishedContentHash: 'c'.repeat(64),
        snapshotId,
        hasConflict: false,
      };

      indexGateway.fulltextChunks = [chunkImpact];
      indexGateway.vectorChunks = [chunkImpact];

      const factKey1 = '1'.repeat(64);
      const factKey2 = '2'.repeat(64);
      const factKey3 = '3'.repeat(64);

      let traversedCriteria: any = null;
      graphGateway.traverse = async (_snapshotId, criteria) => {
        traversedCriteria = criteria;
        return {
          chunks: [chunkImpact],
          entities: [
            {
              type: 'entity',
              id: URN_TABLE_FCL_CYCLE_COUNTER,
              score: 1.0,
              modalitiesContributed: ['graph'],
              urn: URN_TABLE_FCL_CYCLE_COUNTER,
              canonicalName: 'MAIN1.FCL_CYCLE_COUNTER',
              kind: 'DatabaseObject',
              snapshotId,
              hasConflict: false,
            },
            {
              type: 'entity',
              id: URN_PKG_FCL_CYCLE_COUNTER,
              score: 1.0,
              modalitiesContributed: ['graph'],
              urn: URN_PKG_FCL_CYCLE_COUNTER,
              canonicalName: 'MAIN1.FCL_PRC_CYCLE_COUNTER_PKG.PROCESS',
              kind: 'SoftwareComponent',
              snapshotId,
              hasConflict: false,
            },
            {
              type: 'entity',
              id: URN_SUBPROCESS_10000304,
              score: 1.0,
              modalitiesContributed: ['graph'],
              urn: URN_SUBPROCESS_10000304,
              canonicalName: 'Switch cycle',
              kind: 'SoftwareComponent',
              snapshotId,
              hasConflict: false,
            },
            {
              type: 'entity',
              id: URN_CONTAINER_60000006,
              score: 1.0,
              modalitiesContributed: ['graph'],
              urn: URN_CONTAINER_60000006,
              canonicalName: 'Step 20 - Grace period length cycle',
              kind: 'ProcessStep',
              snapshotId,
              hasConflict: false,
            },
          ],
          edges: [
            {
              type: 'edge',
              id: factKey1,
              score: 1.0,
              modalitiesContributed: ['graph'],
              factKey: factKey1,
              sourceUrn: URN_PKG_FCL_CYCLE_COUNTER,
              relationType: 'READS_FROM',
              targetUrn: URN_TABLE_FCL_CYCLE_COUNTER,
              evidenceClass: 'OBSERVED',
              supportingChunkIds: ['chunk-impact-01'],
              snapshotId,
              hasConflict: false,
            },
            {
              type: 'edge',
              id: factKey2,
              score: 1.0,
              modalitiesContributed: ['graph'],
              factKey: factKey2,
              sourceUrn: URN_SUBPROCESS_10000304,
              relationType: 'CALLS',
              targetUrn: URN_PKG_FCL_CYCLE_COUNTER,
              evidenceClass: 'OBSERVED',
              supportingChunkIds: ['chunk-impact-01'],
              snapshotId,
              hasConflict: false,
            },
            {
              type: 'edge',
              id: factKey3,
              score: 1.0,
              modalitiesContributed: ['graph'],
              factKey: factKey3,
              sourceUrn: URN_CONTAINER_60000006,
              relationType: 'INVOKES',
              targetUrn: URN_SUBPROCESS_10000304,
              evidenceClass: 'OBSERVED',
              supportingChunkIds: ['chunk-impact-01'],
              snapshotId,
              hasConflict: false,
            },
          ],
          paths: [
            {
              nodeUrns: [
                URN_TABLE_FCL_CYCLE_COUNTER,
                URN_PKG_FCL_CYCLE_COUNTER,
                URN_SUBPROCESS_10000304,
                URN_CONTAINER_60000006,
              ],
              edgeFactKeys: [factKey1, factKey2, factKey3],
              hopClassifications: ['OBSERVED', 'OBSERVED', 'OBSERVED'],
              hopSupportingChunkIds: [['chunk-impact-01'], ['chunk-impact-01'], ['chunk-impact-01']],
              edgeSnapshotIds: [snapshotId, snapshotId, snapshotId],
              hasConflict: false,
            },
          ],
          truncated: false,
        };
      };

      const service = new RetrievalService({
        indexGateway,
        embeddingProvider: embedding,
        queryPlanner: planner,
        graphGateway,
      });

      const response = await service.retrieve(setId, {
        query,
        limit: 20,
        includeInferred: false,
        recentTurns: [],
      });

      expect(response.outcome).toBe('READY');
      expect(traversedCriteria.plan.traversalSteps).toEqual([
        {
          relationType: 'READS_FROM',
          direction: 'INCOMING',
          maxHops: 1,
        },
        {
          relationType: 'WRITES_TO',
          direction: 'INCOMING',
          maxHops: 1,
        },
      ]);
      expect(traversedCriteria.plan.overallMaxDepth).toBe(1);
      expect(response.paths).toHaveLength(1);
    });

    it('GRAPH-RETRIEVE-01: retrieves graph items and paths when natural language query matches ProcessStep entity', async () => {
      const indexGateway = new DeterministicIndexGatewayStub();
      indexGateway.activeSnapshotId = snapshotId;
      const embedding = new DeterministicEmbeddingStub();
      const planner = new DeterministicPlannerStub();
      const graphGateway = new DeterministicGraphGatewayStub();

      const query = 'quy trình thanh toán hoá đơn diễn ra thế nào?';
      const stepUrn = 'urn:plannermate:process:ProcessStep:step_khoi_tao_thanh_toan';
      const tableUrn = 'urn:plannermate:oracle:DatabaseObject:MAIN1.TBL_PAYMENT_LOG';
      const edgeFactKey = 'f'.repeat(64);

      const stepCandidate: ClarificationCandidate = {
        urn: stepUrn,
        canonicalName: 'Khởi tạo giao dịch thanh toán',
        kind: 'ProcessStep',
      };

      // Mock resolveEntities to return stepCandidate when tokens include thanh toan
      graphGateway.resolveEntities = async (_s, tokens) => {
        const matches = tokens.some((t) => t.toLowerCase().includes('thanh toan') || t.toLowerCase().includes('thanh toán'));
        return matches ? [stepCandidate] : [];
      };

      planner.scriptedResult = {
        type: 'plan',
        plan: {
          planId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a99',
          queryIntent: 'LOOKUP',
          seedUrns: [stepUrn],
          // A ProcessStep seed has no outbound WRITES_TO; the seed itself still yields evidence.
          traversalSteps: [],
          overallMaxDepth: 1,
          includeInferred: false,
          fulltextKeywords: ['thanh toán', 'hoá đơn'],
          semanticQuery: query,
        },
      };

      indexGateway.queryFulltext = async () => [
        {
          type: 'chunk',
          id: 'chunk-step-01',
          score: 1.0,
          modalitiesContributed: ['fulltext'],
          sourceDocumentId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
          sourceDocumentTitle: 'Quy trình thanh toán hoá đơn',
          publishedContentHash: 'a'.repeat(64),
          sectionAnchor: 'Sec',
          lineStart: 1,
          lineEnd: 5,
          rawSnippet: 'Khởi tạo giao dịch thanh toán hoá đơn diễn ra bằng cách ghi vào MAIN1.TBL_PAYMENT_LOG',
          snapshotId,
          hasConflict: false,
        },
      ];

      graphGateway.traverse = async () => ({
        entities: [
          {
            type: 'entity',
            id: stepUrn,
            score: 1.0,
            modalitiesContributed: ['graph'],
            urn: stepUrn,
            canonicalName: 'Khởi tạo giao dịch thanh toán',
            kind: 'ProcessStep',
            snapshotId,
            hasConflict: false,
          },
          {
            type: 'entity',
            id: tableUrn,
            score: 1.0,
            modalitiesContributed: ['graph'],
            urn: tableUrn,
            canonicalName: 'MAIN1.TBL_PAYMENT_LOG',
            kind: 'DatabaseObject',
            snapshotId,
            hasConflict: false,
          },
        ],
        edges: [
          {
            type: 'edge',
            id: edgeFactKey,
            score: 1.0,
            modalitiesContributed: ['graph'],
            factKey: edgeFactKey,
            sourceUrn: stepUrn,
            relationType: 'WRITES_TO',
            targetUrn: tableUrn,
            evidenceClass: 'OBSERVED',
            supportingChunkIds: ['chunk-step-01'],
            snapshotId,
            hasConflict: false,
          },
        ],
        paths: [
          {
            nodeUrns: [stepUrn, tableUrn],
            edgeFactKeys: [edgeFactKey],
            hopClassifications: ['OBSERVED'],
            hopSupportingChunkIds: [['chunk-step-01']],
            edgeSnapshotIds: [snapshotId],
            hasConflict: false,
          },
        ],
        truncated: false,
      });

      const service = new RetrievalService({
        indexGateway,
        embeddingProvider: embedding,
        queryPlanner: planner,
        graphGateway,
      });

      const response = await service.retrieve(setId, {
        query,
        limit: 20,
        includeInferred: false,
        recentTurns: [],
      });

      expect(response.outcome).toBe('READY');
      const graphItems = response.items.filter((item) => item.modalitiesContributed.includes('graph'));
      expect(graphItems.length).toBeGreaterThan(0);
      expect(response.modalitiesUsed).toContain('graph');
      expect(response.modalityStatus.graph.status).toBe('ok');
      expect(response.modalityStatus.graph.itemCount).toBeGreaterThan(0);
      expect(response.paths).toHaveLength(1);
      expect(response.paths[0]?.nodeUrns).toEqual([stepUrn, tableUrn]);
    });

    it('selects SEED_ONLY when there are entities but zero edges and zero paths', async () => {
      const indexGateway = new DeterministicIndexGatewayStub();
      indexGateway.activeSnapshotId = snapshotId;
      const embedding = new DeterministicEmbeddingStub();
      const planner = new DeterministicPlannerStub();
      const graphGateway = new DeterministicGraphGatewayStub();

      graphGateway.mockCandidates = [{
        urn: URN_TABLE_FCL_CYCLE_COUNTER,
        canonicalName: 'MAIN1.FCL_CYCLE_COUNTER',
        kind: 'DatabaseObject',
      }];
      planner.scriptedResult = {
        type: 'plan',
        plan: {
          planId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          queryIntent: 'LOOKUP',
          seedUrns: [URN_TABLE_FCL_CYCLE_COUNTER],
          traversalSteps: [],
          overallMaxDepth: 1,
          includeInferred: false,
          fulltextKeywords: ['MAIN1.FCL_CYCLE_COUNTER'],
          semanticQuery: 'MAIN1.FCL_CYCLE_COUNTER',
        },
      };
      graphGateway.mockSeedEntities = [{
        type: 'entity',
        id: URN_TABLE_FCL_CYCLE_COUNTER,
        score: 1,
        modalitiesContributed: ['graph'],
        urn: URN_TABLE_FCL_CYCLE_COUNTER,
        canonicalName: 'MAIN1.FCL_CYCLE_COUNTER',
        kind: 'DatabaseObject',
        snapshotId,
        hasConflict: false,
      }];

      const response = await new RetrievalService({
        indexGateway,
        embeddingProvider: embedding,
        queryPlanner: planner,
        graphGateway,
      }).retrieve(setId, defaultRequest);

      expect(response.outcome).toBe('SEED_ONLY');
      expect(response.reason).toBe('SEED_FOUND_NO_RELATION');
      expect(response.items).toHaveLength(1);
      expect(response.items[0]?.type).toBe('entity');
      expect(response.paths).toEqual([]);
      expect(response.conflictGroups).toEqual([]);
      expect(response.suggestedRefinements?.length).toBeGreaterThan(0);
      expect(response.modalityStatus.graph.entityCount).toBe(1);
      expect(response.modalityStatus.graph.edgeCount).toBe(0);
      expect(response.modalityStatus.graph.pathCount).toBe(0);
      expect(response.diagnostics.graphAfterFusion).toEqual({ entity: 1, edge: 0, path: 0 });
    });

    it('reports failedSeeds for a dropped seed while valid seed evidence survives', async () => {
      const indexGateway = new DeterministicIndexGatewayStub();
      indexGateway.activeSnapshotId = snapshotId;
      const embedding = new DeterministicEmbeddingStub();
      const planner = new DeterministicPlannerStub();
      const graphGateway = new DeterministicGraphGatewayStub();

      const unknownUrn = 'urn:plannermate:oracle:ORACLE_TABLE:MAIN1.DOES_NOT_EXIST' as const;
      graphGateway.mockCandidates = [{
        urn: URN_TABLE_FCL_CYCLE_COUNTER,
        canonicalName: 'MAIN1.FCL_CYCLE_COUNTER',
        kind: 'DatabaseObject',
      }];
      planner.scriptedResult = {
        type: 'plan',
        plan: {
          planId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          queryIntent: 'LOOKUP',
          seedUrns: [URN_TABLE_FCL_CYCLE_COUNTER, unknownUrn],
          traversalSteps: [],
          overallMaxDepth: 1,
          includeInferred: false,
          fulltextKeywords: ['MAIN1.FCL_CYCLE_COUNTER'],
          semanticQuery: 'MAIN1.FCL_CYCLE_COUNTER',
        },
      };
      graphGateway.mockSeedEntities = [{
        type: 'entity',
        id: URN_TABLE_FCL_CYCLE_COUNTER,
        score: 1,
        modalitiesContributed: ['graph'],
        urn: URN_TABLE_FCL_CYCLE_COUNTER,
        canonicalName: 'MAIN1.FCL_CYCLE_COUNTER',
        kind: 'DatabaseObject',
        snapshotId,
        hasConflict: false,
      }];

      const response = await new RetrievalService({
        indexGateway,
        embeddingProvider: embedding,
        queryPlanner: planner,
        graphGateway,
      }).retrieve(setId, defaultRequest);

      expect(response.diagnostics.failedSeeds).toEqual([
        { urn: unknownUrn, reasonCode: 'SEED_NOT_FOUND' },
      ]);
      expect(response.items.some((item) => item.type === 'entity' && item.urn === URN_TABLE_FCL_CYCLE_COUNTER)).toBe(true);
    });

    it('omits failedSeeds when every seed resolves', async () => {
      const indexGateway = new DeterministicIndexGatewayStub();
      indexGateway.activeSnapshotId = snapshotId;
      const embedding = new DeterministicEmbeddingStub();
      const planner = new DeterministicPlannerStub();
      const graphGateway = new DeterministicGraphGatewayStub();

      graphGateway.mockCandidates = [{
        urn: URN_TABLE_FCL_CYCLE_COUNTER,
        canonicalName: 'MAIN1.FCL_CYCLE_COUNTER',
        kind: 'DatabaseObject',
      }];
      graphGateway.mockSeedEntities = [{
        type: 'entity',
        id: URN_TABLE_FCL_CYCLE_COUNTER,
        score: 1,
        modalitiesContributed: ['graph'],
        urn: URN_TABLE_FCL_CYCLE_COUNTER,
        canonicalName: 'MAIN1.FCL_CYCLE_COUNTER',
        kind: 'DatabaseObject',
        snapshotId,
        hasConflict: false,
      }];

      const response = await new RetrievalService({
        indexGateway,
        embeddingProvider: embedding,
        queryPlanner: planner,
        graphGateway,
      }).retrieve(setId, defaultRequest);

      expect(response.diagnostics.failedSeeds ?? []).toEqual([]);
    });

    it('never returns SEED_ONLY when the graph status is error, timeout, or stale', async () => {
      for (const failure of ['error', 'timeout', 'stale'] as const) {
        const indexGateway = new DeterministicIndexGatewayStub();
        indexGateway.activeSnapshotId = snapshotId;
        const embedding = new DeterministicEmbeddingStub();
        const planner = new DeterministicPlannerStub();
        const graphGateway = new DeterministicGraphGatewayStub();

        graphGateway.mockCandidates = [{
          urn: URN_TABLE_FCL_CYCLE_COUNTER,
          canonicalName: 'MAIN1.FCL_CYCLE_COUNTER',
          kind: 'DatabaseObject',
        }];
        graphGateway.traverse = async () => {
          if (failure === 'timeout') {
            const err = new Error('timeout');
            err.name = 'AbortError';
            throw err;
          }
          if (failure === 'stale') throw new Error('stale snapshot');
          throw new Error('provider blew up');
        };

        const response = await new RetrievalService({
          indexGateway,
          embeddingProvider: embedding,
          queryPlanner: planner,
          graphGateway,
        }).retrieve(setId, defaultRequest);

        expect(response.outcome).not.toBe('SEED_ONLY');
      }
    });

    it('emits bounded stage diagnostics with truncation and fallback flags', async () => {
      const indexGateway = new DeterministicIndexGatewayStub();
      indexGateway.activeSnapshotId = snapshotId;
      const embedding = new DeterministicEmbeddingStub();
      const planner = new DeterministicPlannerStub();
      const graphGateway = new DeterministicGraphGatewayStub();

      graphGateway.mockCandidates = [{
        urn: URN_TABLE_FCL_CYCLE_COUNTER,
        canonicalName: 'MAIN1.FCL_CYCLE_COUNTER',
        kind: 'DatabaseObject',
      }];
      graphGateway.mockSeedEntities = [{
        type: 'entity',
        id: URN_TABLE_FCL_CYCLE_COUNTER,
        score: 1,
        modalitiesContributed: ['graph'],
        urn: URN_TABLE_FCL_CYCLE_COUNTER,
        canonicalName: 'MAIN1.FCL_CYCLE_COUNTER',
        kind: 'DatabaseObject',
        snapshotId,
        hasConflict: false,
      }];
      graphGateway.isTruncated = true;

      const response = await new RetrievalService({
        indexGateway,
        embeddingProvider: embedding,
        queryPlanner: planner,
        graphGateway,
      }).retrieve(setId, defaultRequest);

      const rows = response.diagnostics.stageDiagnostics ?? [];
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(StageDiagnosticSchema.safeParse(row).success).toBe(true);
        expect(typeof row.truncated).toBe('boolean');
        expect(typeof row.fallback).toBe('boolean');
      }

      const traversalRow = rows.find((row) => row.stage === 'neo4j_traversal');
      expect(traversalRow?.truncated).toBe(true);

      const serialized = JSON.stringify(response);
      expect(serialized).not.toContain('MATCH (');
      expect(serialized).not.toContain('SELECT ');
    });

    it('marks planning fallback row with FALLBACK_ONE_HOP when the deterministic plan is active', async () => {
      const indexGateway = new DeterministicIndexGatewayStub();
      indexGateway.activeSnapshotId = snapshotId;
      const embedding = new DeterministicEmbeddingStub();
      const planner = new DeterministicPlannerStub();
      const graphGateway = new DeterministicGraphGatewayStub();

      graphGateway.mockCandidates = [{
        urn: URN_TABLE_FCL_CYCLE_COUNTER,
        canonicalName: 'MAIN1.FCL_CYCLE_COUNTER',
        kind: 'DatabaseObject',
      }];
      graphGateway.mockSeedEntities = [{
        type: 'entity',
        id: URN_TABLE_FCL_CYCLE_COUNTER,
        score: 1,
        modalitiesContributed: ['graph'],
        urn: URN_TABLE_FCL_CYCLE_COUNTER,
        canonicalName: 'MAIN1.FCL_CYCLE_COUNTER',
        kind: 'DatabaseObject',
        snapshotId,
        hasConflict: false,
      }];
      // Invalid relation forces one repair attempt, then the deterministic fallback.
      planner.scriptedResult = {
        type: 'plan',
        plan: {
          planId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          queryIntent: 'LOOKUP',
          seedUrns: [URN_TABLE_FCL_CYCLE_COUNTER],
          traversalSteps: [{ relationType: 'NOT_A_RELATION' as any, direction: 'OUTGOING', maxHops: 1 }],
          overallMaxDepth: 1,
          includeInferred: false,
          fulltextKeywords: ['MAIN1.FCL_CYCLE_COUNTER'],
          semanticQuery: 'MAIN1.FCL_CYCLE_COUNTER',
        },
      };

      const response = await new RetrievalService({
        indexGateway,
        embeddingProvider: embedding,
        queryPlanner: planner,
        graphGateway,
      }).retrieve(setId, defaultRequest);

      const planningRow = (response.diagnostics.stageDiagnostics ?? [])
        .find((row) => row.stage === 'planning');
      expect(planningRow?.fallback).toBe(true);
      expect(planningRow?.fallbackReason).toBe('FALLBACK_ONE_HOP');
    });
  });
});
