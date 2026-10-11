import { describe, expect, it } from 'vitest';
import {
  RetrievalRequestSchema,
  LogicalQueryPlanSchema,
  RetrievalResponseSchema,
  RetrievalItemSchema,
  ChunkItemSchema,
  EntityItemSchema,
  EdgeItemSchema,
  RetrievalOutcomeSchema,
  ModalityStatusDetailSchema,
  ModalityStatusValueSchema,
  EmbeddingProviderMetadataSchema,
  PlanTraceSchema,
  RETRIEVAL_OUTCOMES,
  MODALITY_STATUS_VALUES,
  REASON_CODES,
} from '../src/types/retrievalProtocol.js';
import {
  DeterministicEmbeddingStub,
  DeterministicPlannerStub,
  DeterministicIndexGatewayStub,
  DeterministicGraphGatewayStub,
} from './fixtures/retrievalStubs.js';
import type {
  EmbeddingProvider,
  QueryPlanner,
  RetrievalIndexGateway,
  GraphRetrievalGateway,
} from '../src/retrieval/contracts.js';

describe('RetrievalProtocol Schema Suite (Task 18-W0-01)', () => {
  const validSnapshotId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  const validDocumentId = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
  const validFactKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const validUrn1 = 'urn:plannermate:oracle:DatabaseObject:MAIN1.AML_RISK';
  const validUrn2 = 'urn:plannermate:smartvista:ScheduledProcess:60000006';

  describe('RetrievalRequestSchema', () => {
    it('accepts valid request with default values', () => {
      const parsed = RetrievalRequestSchema.parse({
        query: 'AML_RISK đổi tên ảnh hưởng gì',
      });
      expect(parsed.query).toBe('AML_RISK đổi tên ảnh hưởng gì');
      expect(parsed.limit).toBe(20);
      expect(parsed.includeInferred).toBe(false);
      expect(parsed.recentTurns).toEqual([]);
    });

    it('clamps limit to 10-50 range and rejects out-of-range', () => {
      expect(() =>
        RetrievalRequestSchema.parse({ query: 'test', limit: 9 })
      ).toThrow();
      expect(() =>
        RetrievalRequestSchema.parse({ query: 'test', limit: 51 })
      ).toThrow();

      const parsedMin = RetrievalRequestSchema.parse({ query: 'test', limit: 10 });
      expect(parsedMin.limit).toBe(10);
      const parsedMax = RetrievalRequestSchema.parse({ query: 'test', limit: 50 });
      expect(parsedMax.limit).toBe(50);
    });

    it('rejects query exceeding 4,000 characters', () => {
      const oversized = 'a'.repeat(4001);
      expect(() => RetrievalRequestSchema.parse({ query: oversized })).toThrow();
    });

    it('enforces turn bounds (max 3 turns, max 5 URNs per turn, max 2000 chars per turn text)', () => {
      const valid = {
        query: 'next question',
        recentTurns: [
          {
            role: 'user' as const,
            text: 'prior question 1',
            resolvedUrns: [validUrn1],
          },
          {
            role: 'assistant' as const,
            text: 'prior answer 1',
            resolvedUrns: [validUrn2],
          },
          {
            role: 'user' as const,
            text: 'prior question 2',
            resolvedUrns: [],
          },
        ],
      };
      expect(RetrievalRequestSchema.parse(valid)).toEqual(expect.objectContaining({ limit: 20 }));

      // > 3 turns rejected
      expect(() =>
        RetrievalRequestSchema.parse({
          ...valid,
          recentTurns: [
            ...valid.recentTurns,
            { role: 'assistant', text: 'turn 4', resolvedUrns: [] },
          ],
        })
      ).toThrow();

      // > 5 URNs in a turn rejected
      expect(() =>
        RetrievalRequestSchema.parse({
          query: 'test',
          recentTurns: [
            {
              role: 'user',
              text: 'hello',
              resolvedUrns: [
                validUrn1,
                validUrn2,
                'urn:plannermate:smartvista:PRC_CONTAINER:60000005',
                'urn:plannermate:smartvista:PRC_CONTAINER:60000006',
                'urn:plannermate:smartvista:PRC_CONTAINER:60000007',
                'urn:plannermate:smartvista:PRC_CONTAINER:60000012',
              ],
            },
          ],
        })
      ).toThrow();
    });

    it('strictly rejects unexpected fields (e.g. apiKey, credentials)', () => {
      expect(() =>
        RetrievalRequestSchema.parse({
          query: 'test',
          apiKey: 'sk-secret-12345',
        })
      ).toThrow();
    });
  });

  describe('LogicalQueryPlanSchema', () => {
    it('accepts valid logical plan referencing registered ontology and resolved URNs', () => {
      const plan = {
        planId: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
        queryIntent: 'IMPACT_ANALYSIS' as const,
        seedUrns: [validUrn1],
        traversalSteps: [
          {
            relationType: 'READS_FROM' as const,
            direction: 'INCOMING' as const,
            maxHops: 3,
            targetKind: 'SoftwareComponent' as const,
          },
        ],
        overallMaxDepth: 3,
        includeInferred: false,
        fulltextKeywords: ['AML_RISK'],
        semanticQuery: 'AML_RISK impact',
      };
      const parsed = LogicalQueryPlanSchema.parse(plan);
      expect(parsed.overallMaxDepth).toBe(3);
      expect(parsed.traversalSteps).toHaveLength(1);
    });

    it('rejects raw cypher field per D-02 / T-18-02', () => {
      const planWithCypher = {
        planId: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
        queryIntent: 'LOOKUP' as const,
        seedUrns: [validUrn1],
        traversalSteps: [],
        overallMaxDepth: 1,
        includeInferred: false,
        fulltextKeywords: ['AML_RISK'],
        semanticQuery: 'lookup',
        cypher: 'MATCH (n) RETURN n',
      };
      expect(() => LogicalQueryPlanSchema.parse(planWithCypher)).toThrow();
    });

    it('rejects unknown relation types or node kinds', () => {
      expect(() =>
        LogicalQueryPlanSchema.parse({
          planId: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
          queryIntent: 'LOOKUP' as const,
          seedUrns: [validUrn1],
          traversalSteps: [
            {
              relationType: 'NON_EXISTENT_RELATION',
              direction: 'OUTGOING',
              maxHops: 1,
            },
          ],
          overallMaxDepth: 1,
          includeInferred: false,
          fulltextKeywords: ['test'],
          semanticQuery: 'test',
        })
      ).toThrow();
    });

    it('enforces traversal step caps (max 5 steps) and depth bounds (1-3)', () => {
      const step = {
        relationType: 'CALLS' as const,
        direction: 'OUTGOING' as const,
        maxHops: 1,
      };
      expect(() =>
        LogicalQueryPlanSchema.parse({
          planId: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
          queryIntent: 'FLOW_TRAVERSAL' as const,
          seedUrns: [validUrn1],
          traversalSteps: [step, step, step, step, step, step], // 6 steps
          overallMaxDepth: 3,
          includeInferred: false,
          fulltextKeywords: ['test'],
          semanticQuery: 'test',
        })
      ).toThrow();

      expect(() =>
        LogicalQueryPlanSchema.parse({
          planId: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
          queryIntent: 'FLOW_TRAVERSAL' as const,
          seedUrns: [validUrn1],
          traversalSteps: [step],
          overallMaxDepth: 4, // > 3
          includeInferred: false,
          fulltextKeywords: ['test'],
          semanticQuery: 'test',
        })
      ).toThrow();
    });
  });

  describe('RetrievalItemSchema (Chunk / Entity / Edge)', () => {
    it('validates Chunk item with sourceDocumentId, sectionAnchor, lineStart, lineEnd, snapshotId', () => {
      const chunkItem = {
        type: 'chunk' as const,
        id: 'chunk-sha-1234',
        score: 0.033,
        modalitiesContributed: ['fulltext' as const, 'vector' as const],
        sourceDocumentId: validDocumentId,
        sourceDocumentTitle: 'AML risk overview',
        sectionAnchor: 'section-overview',
        lineStart: 10,
        lineEnd: 25,
        rawSnippet: 'Evidence text snippet',
        publishedContentHash: 'a'.repeat(64),
        snapshotId: validSnapshotId,
        hasConflict: false,
      };
      const parsed = ChunkItemSchema.parse(chunkItem);
      expect(parsed.type).toBe('chunk');
      expect(RetrievalItemSchema.parse(chunkItem)).toEqual(parsed);
    });

    it('validates Entity item with urn, canonicalName, kind, snapshotId', () => {
      const entityItem = {
        type: 'entity' as const,
        id: validUrn1,
        score: 0.016,
        modalitiesContributed: ['graph' as const],
        urn: validUrn1,
        canonicalName: 'AML_RISK',
        kind: 'DatabaseObject' as const,
        snapshotId: validSnapshotId,
        firstSeenInDoc: validDocumentId,
        hasConflict: false,
      };
      const parsed = EntityItemSchema.parse(entityItem);
      expect(parsed.type).toBe('entity');
      expect(RetrievalItemSchema.parse(entityItem)).toEqual(parsed);
    });

    it('validates Edge item referencing supportingChunkIds without duplicating raw text (D-22)', () => {
      const edgeItem = {
        type: 'edge' as const,
        id: validFactKey,
        score: 0.016,
        modalitiesContributed: ['graph' as const],
        factKey: validFactKey,
        sourceUrn: validUrn2,
        relationType: 'READS_FROM' as const,
        targetUrn: validUrn1,
        evidenceClass: 'OBSERVED' as const,
        supportingChunkIds: ['chunk-sha-1234'],
        snapshotId: validSnapshotId,
        hasConflict: false,
      };
      const parsed = EdgeItemSchema.parse(edgeItem);
      expect(parsed.type).toBe('edge');
      expect(parsed.supportingChunkIds).toEqual(['chunk-sha-1234']);

      // Rejects extra text duplication or secret fields
      expect(() =>
        EdgeItemSchema.parse({
          ...edgeItem,
          rawSnippetDuplicated: 'bad duplication',
        })
      ).toThrow();
    });

    it('rejects vectors or vector embeddings inside retrieval items (T-18-01)', () => {
      expect(() =>
        ChunkItemSchema.parse({
          type: 'chunk',
          id: 'chunk-sha-1234',
          score: 0.033,
          modalitiesContributed: ['vector'],
          sourceDocumentId: validDocumentId,
          sectionAnchor: 'section-overview',
          lineStart: 10,
          lineEnd: 25,
          rawSnippet: 'Evidence text snippet',
          snapshotId: validSnapshotId,
          hasConflict: false,
          vector: [0.1, 0.2, 0.3], // Prohibited!
        })
      ).toThrow();
    });
  });

  describe('RetrievalResponseSchema Envelopes and Invariants', () => {
    const baseModalityStatus = {
      fulltext: {
        status: 'ok' as const,
        latencyMs: 12,
        itemCount: 5,
      },
      vector: {
        status: 'ok' as const,
        latencyMs: 45,
        itemCount: 8,
      },
      graph: {
        status: 'ok' as const,
        latencyMs: 30,
        itemCount: 3,
      },
    };

    const baseProviderMetadata = {
      provider: 'local-onnx' as const,
      model: 'multilingual-e5-small',
      revision: 'v1.0.0',
      dimensions: 384,
      policyVersion: '2026.10.1',
    };

    const basePlanTrace = {
      fastPath: false,
      degradedFallback: false,
      intent: 'IMPACT_ANALYSIS',
      resolvedUrns: [validUrn1],
      depth: 3,
      reasonCode: undefined,
    };

    it('requires all 3 modalities in modalityStatus; rejects if one is missing', () => {
      const responseMissingGraph = {
        outcome: 'READY',
        snapshotId: validSnapshotId,
        embeddingProvider: baseProviderMetadata,
        items: [],
        totalCandidates: 0,
        modalitiesUsed: ['fulltext', 'vector'],
        modalityStatus: {
          fulltext: baseModalityStatus.fulltext,
          vector: baseModalityStatus.vector,
          // graph missing!
        },
        diagnostics: { degraded: false },
        planTrace: basePlanTrace,
      };
      expect(() => RetrievalResponseSchema.parse(responseMissingGraph)).toThrow();
    });

    it('validates READY outcome response with flat items', () => {
      const response = {
        outcome: 'READY' as const,
        snapshotId: validSnapshotId,
        embeddingProvider: baseProviderMetadata,
        items: [
          {
            type: 'chunk' as const,
            id: 'chunk-sha-1234',
            score: 0.033,
            modalitiesContributed: ['fulltext' as const],
            sourceDocumentId: validDocumentId,
            sourceDocumentTitle: 'AML risk overview',
            sectionAnchor: 'anchor',
            lineStart: 1,
            lineEnd: 10,
            rawSnippet: 'snippet',
            publishedContentHash: 'a'.repeat(64),
            snapshotId: validSnapshotId,
            hasConflict: false,
          },
        ],
        totalCandidates: 1,
        modalitiesUsed: ['fulltext' as const, 'vector' as const, 'graph' as const],
        modalityStatus: baseModalityStatus,
        diagnostics: { degraded: false },
        planTrace: basePlanTrace,
      };
      const parsed = RetrievalResponseSchema.parse(response);
      expect(parsed.outcome).toBe('READY');
      expect(parsed.items).toHaveLength(1);
    });

    it('enforces outcome refinements: NEEDS_CLARIFICATION requires candidates', () => {
      const validClarification = {
        outcome: 'NEEDS_CLARIFICATION' as const,
        snapshotId: validSnapshotId,
        embeddingProvider: baseProviderMetadata,
        items: [],
        totalCandidates: 0,
        modalitiesUsed: ['fulltext' as const, 'vector' as const, 'graph' as const],
        modalityStatus: baseModalityStatus,
        diagnostics: { degraded: false },
        planTrace: basePlanTrace,
        candidates: [
          {
            urn: validUrn1,
            canonicalName: 'AML_RISK',
            kind: 'DatabaseObject' as const,
          },
        ],
      };
      expect(RetrievalResponseSchema.parse(validClarification).outcome).toBe('NEEDS_CLARIFICATION');

      // Without candidates, fails
      const invalidClarification = {
        ...validClarification,
        candidates: undefined,
      };
      expect(() => RetrievalResponseSchema.parse(invalidClarification)).toThrow();
    });

    it('enforces outcome refinements: NO_EVIDENCE requires reason and suggestedRefinements', () => {
      const validNoEvidence = {
        outcome: 'NO_EVIDENCE' as const,
        snapshotId: validSnapshotId,
        embeddingProvider: baseProviderMetadata,
        items: [],
        totalCandidates: 0,
        modalitiesUsed: ['fulltext' as const, 'vector' as const, 'graph' as const],
        modalityStatus: baseModalityStatus,
        diagnostics: { degraded: false },
        planTrace: basePlanTrace,
        reason: 'No evidence found matching criteria',
        suggestedRefinements: ['Try searching with qualified Oracle table name'],
      };
      expect(RetrievalResponseSchema.parse(validNoEvidence).outcome).toBe('NO_EVIDENCE');

      // Missing reason fails
      expect(() =>
        RetrievalResponseSchema.parse({
          ...validNoEvidence,
          reason: undefined,
        })
      ).toThrow();
    });

    it('enforces outcome refinements: UNSUPPORTED requires unsupportedConstructs', () => {
      const validUnsupported = {
        outcome: 'UNSUPPORTED' as const,
        snapshotId: validSnapshotId,
        embeddingProvider: baseProviderMetadata,
        items: [],
        totalCandidates: 0,
        modalitiesUsed: ['fulltext' as const, 'vector' as const, 'graph' as const],
        modalityStatus: baseModalityStatus,
        diagnostics: { degraded: false },
        planTrace: basePlanTrace,
        reason: 'Construct not supported by ontology',
        unsupportedConstructs: ['Cyclic arbitrary-depth traversal'],
      };
      expect(RetrievalResponseSchema.parse(validUnsupported).outcome).toBe('UNSUPPORTED');

      // Missing unsupportedConstructs fails
      expect(() =>
        RetrievalResponseSchema.parse({
          ...validUnsupported,
          unsupportedConstructs: undefined,
        })
      ).toThrow();
    });

    it('enforces outcome refinements: DEGRADED requires diagnostics.degraded = true', () => {
      const degradedStatus = {
        ...baseModalityStatus,
        vector: {
          status: 'unavailable' as const,
          latencyMs: 1,
          itemCount: 0,
          reason: 'UNCONFIGURED' as const,
        },
      };
      const validDegraded = {
        outcome: 'DEGRADED' as const,
        snapshotId: validSnapshotId,
        embeddingProvider: baseProviderMetadata,
        items: [],
        totalCandidates: 0,
        modalitiesUsed: ['fulltext' as const, 'graph' as const],
        modalityStatus: degradedStatus,
        diagnostics: {
          degraded: true,
          degradedReasons: ['Vector modality unavailable: UNCONFIGURED'],
        },
        planTrace: {
          ...basePlanTrace,
          degradedFallback: true,
          reasonCode: 'UNCONFIGURED',
        },
      };
      expect(RetrievalResponseSchema.parse(validDegraded).outcome).toBe('DEGRADED');

      // If diagnostics.degraded is false, fails refinement
      expect(() =>
        RetrievalResponseSchema.parse({
          ...validDegraded,
          diagnostics: { degraded: false },
        })
      ).toThrow();
    });

    it('serializes to JSON without leaking API keys, authorization headers or endpoint credentials (T-18-01)', () => {
      const response = {
        outcome: 'READY' as const,
        snapshotId: validSnapshotId,
        embeddingProvider: baseProviderMetadata,
        items: [],
        totalCandidates: 0,
        modalitiesUsed: ['fulltext' as const, 'vector' as const, 'graph' as const],
        modalityStatus: baseModalityStatus,
        diagnostics: { degraded: false },
        planTrace: basePlanTrace,
      };

      const parsed = RetrievalResponseSchema.parse(response);
      const jsonStr = JSON.stringify(parsed);

      const forbiddenTokens = ['apiKey', 'authorization', 'bearer', 'sk-', 'password', 'token'];
      for (const token of forbiddenTokens) {
        expect(jsonStr.toLowerCase()).not.toContain(`"${token}"`);
      }
    });
  });

  describe('Provider-Neutral Collaborator Stubs and Invariants (Task 18-CONTRACT-01)', () => {
    it('DeterministicEmbeddingStub produces exactly 384 finite numbers without network/model', async () => {
      const stub: EmbeddingProvider = new DeterministicEmbeddingStub();
      const meta = stub.describe();
      expect(meta.dimensions).toBe(384);
      expect(meta.provider).toBe('local-onnx');

      const vec = await stub.embedQuery('AML_RISK lookup');
      expect(vec).toHaveLength(384);
      expect(vec.every((n) => Number.isFinite(n))).toBe(true);

      const docs = await stub.embedDocuments(['chunk 1', 'chunk 2']);
      expect(docs).toHaveLength(2);
      expect(docs[0]).toHaveLength(384);
      expect(docs[1]).toHaveLength(384);
    });

    it('DeterministicEmbeddingStub respects AbortSignal', async () => {
      const stub = new DeterministicEmbeddingStub();
      stub.simulatedLatencyMs = 20;

      const controller = new AbortController();
      controller.abort();

      await expect(
        stub.embedQuery('test', { signal: controller.signal })
      ).rejects.toThrow('aborted');
    });

    it('DeterministicPlannerStub records calls and emits valid plan or clarification', async () => {
      const planner: QueryPlanner = new DeterministicPlannerStub();
      const req = RetrievalRequestSchema.parse({ query: 'AML_RISK' });
      const context = {
        resolvedCandidates: [
          {
            urn: validUrn1,
            canonicalName: 'AML_RISK',
            kind: 'DatabaseObject' as const,
          },
        ],
        registeredNodeKinds: ['DatabaseObject' as const],
        registeredRelationTypes: ['READS_FROM' as const],
      };

      const result = await planner.plan(req, context);
      expect(result.type).toBe('plan');
      if (result.type === 'plan') {
        expect(result.plan.seedUrns).toEqual([validUrn1]);
        expect(LogicalQueryPlanSchema.safeParse(result.plan).success).toBe(true);
      }
    });

    it('DeterministicIndexGatewayStub acquires and releases snapshot lease', async () => {
      const indexGateway: RetrievalIndexGateway = new DeterministicIndexGatewayStub();
      const lease = await indexGateway.acquirePinnedSnapshot('test-set-01');
      expect(lease).not.toBeNull();
      expect(lease?.snapshotId).toBe('snapshot-test-01');

      await lease?.release();
      const validMeta = await indexGateway.validateVectorIndexMetadata('snapshot-test-01', {
        provider: 'local-onnx',
        model: 'multilingual-e5-small',
        revision: 'v1.0.0',
        dimensions: 384,
        policyVersion: '2026.10.1',
      });
      expect(validMeta).toBe(true);
    });

    it('DeterministicGraphGatewayStub resolves candidates and traverses with caps', async () => {
      const graphGateway: GraphRetrievalGateway = new DeterministicGraphGatewayStub();
      const candidates = await graphGateway.resolveEntities('snapshot-test-01', ['AML_RISK']);
      expect(candidates).toEqual([]);

      const traversal = await graphGateway.traverse('snapshot-test-01', {
        seedUrns: [validUrn1],
        plan: {
          planId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          queryIntent: 'LOOKUP',
          seedUrns: [validUrn1],
          traversalSteps: [],
          overallMaxDepth: 1,
          includeInferred: false,
          fulltextKeywords: ['AML_RISK'],
          semanticQuery: 'AML_RISK',
        },
        evidenceClasses: ['OBSERVED'],
        limitNodes: 100,
        limitEdges: 200,
      });
      expect(traversal.entities).toEqual([]);
      expect(traversal.edges).toEqual([]);
      expect(traversal.truncated).toBe(false);
    });
  });
});

