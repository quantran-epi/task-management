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
import type {
  RetrievalRequest,
  ChunkItem,
  EntityItem,
  EdgeItem,
  ClarificationCandidate,
} from '../src/types/retrievalProtocol.js';
import { URN_TABLE_FCL_CYCLE_COUNTER } from './fixtures/pilotGoldEntities.js';

describe('18-W0-03B: RetrievalService Pinned Parallel Orchestration & Timeouts', () => {
  const setId = 'test-set-1';
  const snapshotId = 'snap-test-1';

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
      fulltextMs: 500,
      vectorMs: 1500,
      graphMs: 2000,
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
      indexGateway.activeSnapshotId = 'snap-gen-01'; // Leased generation
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
          sectionAnchor: 'Sec',
          lineStart: 1,
          lineEnd: 5,
          rawSnippet: 'Pinned generation snippet',
          snapshotId: 'snap-gen-01',
          hasConflict: false,
        },
      ];

      // Vector adapter raced and read from newly promoted generation 'snap-gen-02'
      indexGateway.queryVector = async () => [
        {
          type: 'chunk',
          id: 'chunk-vec-mismatched',
          score: 1.0,
          modalitiesContributed: ['vector'],
          sourceDocumentId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
          sectionAnchor: 'Sec',
          lineStart: 1,
          lineEnd: 5,
          rawSnippet: 'Raced snippet',
          snapshotId: 'snap-gen-02', // Stale mismatch!
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

      expect(response.snapshotId).toBe('snap-gen-01');
      expect(response.modalityStatus.vector.status).toBe('stale');
      expect(response.modalityStatus.vector.reason).toBe('PINNED_SNAPSHOT_UNAVAILABLE');
      // Mismatched vector item discarded
      expect(response.items.find((i) => i.id === 'chunk-vec-mismatched')).toBeUndefined();
      expect(response.items.every((i) => i.snapshotId === 'snap-gen-01')).toBe(true);
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
  });
});
