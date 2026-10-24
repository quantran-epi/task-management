import { describe, it, expect, vi } from 'vitest';
import {
  STATIC_TRAVERSAL_QUERIES,
  validateTraversalPlan,
  runBoundedGraphTraversal,
  type ValidatedTraversalPlan,
  type BoundedGraphTraversalResult,
} from '../src/retrieval/graphTraversal.js';
import {
  RELATION_TYPES,
  RETRIEVAL_ONTOLOGY_REGISTRY,
  type TraversalDirection,
} from '../src/graph/ontology.js';
import type {
  LogicalQueryPlan,
  EntityItem,
  EdgeItem,
} from '../types/retrievalProtocol.js';
import type {
  GraphRetrievalGateway,
  GraphTraversalCriteria,
  GraphTraversalResult,
  OperationOptions,
} from '../src/retrieval/contracts.js';
import {
  URN_PROCESS_60000006,
  URN_CONTAINER_60000005,
  URN_CONTAINER_60000006,
  URN_SUBPROCESS_10000304,
  URN_PKG_FCL_CYCLE_COUNTER,
  URN_TABLE_FCL_CYCLE_COUNTER,
} from './fixtures/pilotGoldEntities.js';

describe('18-W0-02C: Static Bounded Cypher Templates & Plan Validation', () => {
  describe('STATIC_TRAVERSAL_QUERIES Catalog', () => {
    it('covers all 10 relation types across supported directions and depths up to ontology bounds', () => {
      const directions: TraversalDirection[] = ['OUTGOING', 'INCOMING', 'BOTH'];

      for (const rel of RELATION_TYPES) {
        const entry = RETRIEVAL_ONTOLOGY_REGISTRY[rel];
        expect(entry).toBeDefined();

        for (const dir of directions) {
          for (let hop = 1; hop <= entry.maxHops; hop++) {
            const key = `${rel}:${dir}:${hop}`;
            const cypher = STATIC_TRAVERSAL_QUERIES[key];
            expect(cypher).toBeDefined();
            expect(typeof cypher).toBe('string');
            expect(cypher.length).toBeGreaterThan(20);
          }
        }
      }
    });

    it('contains zero runtime string interpolations (${) across all templates', () => {
      for (const [key, cypher] of Object.entries(STATIC_TRAVERSAL_QUERIES)) {
        expect(cypher).not.toContain('${');
        expect(typeof key).toBe('string');
      }
    });

    it('contains no unrestricted MATCH path in any template', () => {
      for (const cypher of Object.values(STATIC_TRAVERSAL_QUERIES)) {
        // Must not have bare unrestricted MATCH path = (n)-[*]-(m)
        expect(cypher).not.toMatch(/MATCH\s+path\s*=\s*\([^)]*\)\s*-\s*\[\s*\*?\s*\]\s*->/i);
        expect(cypher).not.toMatch(/MATCH\s+path\s*=\s*\([^)]*\)\s*-\s*\[\s*\*?\s*\]\s*-\s*\(/i);
      }
    });

    it('enforces snapshot property on path nodes, topology relations, facts, and chunks', () => {
      for (const cypher of Object.values(STATIC_TRAVERSAL_QUERIES)) {
        expect(cypher).toContain('graphSnapshotId: $snapshotId');
        expect(cypher).toContain('n.graphSnapshotId = $snapshotId');
        expect(cypher).toContain('fact:Fact {graphSnapshotId: $snapshotId');
        expect(cypher).toContain('chunk:Chunk {graphSnapshotId: $snapshotId');
      }
    });

    it('enforces evidence classification allowlist on authoritative Fact nodes', () => {
      for (const cypher of Object.values(STATIC_TRAVERSAL_QUERIES)) {
        expect(cypher).toContain('fact.effectiveClassification IN $evidenceClasses');
      }
    });

    it('enforces simple-path node uniqueness in every template', () => {
      for (const cypher of Object.values(STATIC_TRAVERSAL_QUERIES)) {
        // Enforces simple path: ALL(n IN nodes(path) WHERE single(m IN nodes(path) WHERE m = n))
        expect(cypher).toContain('single(m IN nodes(path) WHERE m = n)');
      }
    });

    it('enforces in-query path and edge limit clauses ($pathLimit, $maxEdges) in every template', () => {
      for (const cypher of Object.values(STATIC_TRAVERSAL_QUERIES)) {
        expect(cypher).toContain('LIMIT $pathLimit');
        expect(cypher).toContain('LIMIT $maxEdges');
      }
    });
  });

  describe('validateTraversalPlan', () => {
    const allowedSeedSet = new Set([
      URN_PROCESS_60000006,
      URN_CONTAINER_60000006,
      URN_TABLE_FCL_CYCLE_COUNTER,
    ]);

    const createBasePlan = (): LogicalQueryPlan => ({
      planId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      queryIntent: 'FLOW_TRAVERSAL',
      seedUrns: [URN_PROCESS_60000006],
      traversalSteps: [
        {
          relationType: 'CONTAINS_STEP',
          direction: 'OUTGOING',
          maxHops: 1,
        },
      ],
      overallMaxDepth: 1,
      includeInferred: false,
      fulltextKeywords: ['credit'],
      semanticQuery: 'process flow',
    });

    it('accepts valid plan and returns ValidatedTraversalPlan with default OBSERVED and BUSINESS_APPROVED evidence classes', () => {
      const plan = createBasePlan();
      const validated = validateTraversalPlan(plan, allowedSeedSet, {
        [URN_PROCESS_60000006]: 'ScheduledProcess',
      });

      expect(validated.valid).toBe(true);
      if (validated.valid) {
        expect(validated.plan.seedUrns).toEqual([URN_PROCESS_60000006]);
        expect(validated.plan.evidenceClasses).toEqual(['OBSERVED', 'BUSINESS_APPROVED']);
        expect(validated.plan.validatedDepth).toBe(1);
        expect(validated.plan.steps.length).toBe(1);
        expect(validated.plan.steps[0]!.queryKey).toBe('CONTAINS_STEP:OUTGOING:1');
      }
    });

    it('includes INFERRED when includeInferred is true', () => {
      const plan = createBasePlan();
      plan.includeInferred = true;
      const validated = validateTraversalPlan(plan, allowedSeedSet);

      expect(validated.valid).toBe(true);
      if (validated.valid) {
        expect(validated.plan.evidenceClasses).toEqual([
          'OBSERVED',
          'BUSINESS_APPROVED',
          'INFERRED',
        ]);
      }
    });

    it('returns empty seeds indicator without errors when seedUrns is empty or has NO_GRAPH_SEED marker', () => {
      const plan = createBasePlan();
      (plan as any).seedUrns = [];
      const validated = validateTraversalPlan(plan, allowedSeedSet);

      expect(validated.valid).toBe(false);
      expect(validated.reason).toBe('NO_GRAPH_SEED');
    });

    it('rejects seed URNs not in allowedSeedSet with SEED_NOT_FOUND', () => {
      const plan = createBasePlan();
      plan.seedUrns = ['urn:plannermate:smartvista:PRC_PROCESS:99999999' as any];
      const validated = validateTraversalPlan(plan, allowedSeedSet);

      expect(validated.valid).toBe(false);
      expect(validated.reason).toBe('SEED_NOT_FOUND');
    });

    it('rejects more than 5 traversal steps with PLAN_REJECTED', () => {
      const plan = createBasePlan();
      plan.traversalSteps = [
        { relationType: 'CONTAINS_STEP', direction: 'OUTGOING', maxHops: 1 },
        { relationType: 'PRECEDES', direction: 'OUTGOING', maxHops: 1 },
        { relationType: 'INVOKES', direction: 'OUTGOING', maxHops: 1 },
        { relationType: 'CALLS', direction: 'OUTGOING', maxHops: 1 },
        { relationType: 'READS_FROM', direction: 'OUTGOING', maxHops: 1 },
        { relationType: 'WRITES_TO', direction: 'OUTGOING', maxHops: 1 },
      ];
      const validated = validateTraversalPlan(plan, allowedSeedSet);

      expect(validated.valid).toBe(false);
      expect(validated.reason).toBe('PLAN_REJECTED');
    });

    it('rejects overall depth 5 with HOP_LIMIT_EXCEEDED instead of clamping', () => {
      const plan = createBasePlan();
      (plan as any).overallMaxDepth = 5;
      const validated = validateTraversalPlan(plan, allowedSeedSet);

      expect(validated.valid).toBe(false);
      expect(validated.reason).toBe('HOP_LIMIT_EXCEEDED');
    });

    it('rejects step maxHops above the registry ceiling with HOP_LIMIT_EXCEEDED instead of clamping', () => {
      const plan = createBasePlan();
      // CONTAINS_STEP registry maxHops is 1
      plan.traversalSteps = [
        { relationType: 'CONTAINS_STEP', direction: 'OUTGOING', maxHops: 3 },
      ];
      const validated = validateTraversalPlan(plan, allowedSeedSet);

      expect(validated.valid).toBe(false);
      expect(validated.reason).toBe('HOP_LIMIT_EXCEEDED');
    });

    it('rejects unknown relation type with INVALID_RELATION', () => {
      const plan = createBasePlan();
      (plan.traversalSteps[0] as any).relationType = 'UNKNOWN_RELATION';
      const validated = validateTraversalPlan(plan, allowedSeedSet);

      expect(validated.valid).toBe(false);
      expect(validated.reason).toBe('INVALID_RELATION');
    });
  });

  describe('18-GRAPH-01: runBoundedGraphTraversal', () => {
    const pinnedSnapshot = 'snapshot-pinned-01';

    const createPlan = (overrides?: Partial<LogicalQueryPlan>): LogicalQueryPlan => ({
      planId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      queryIntent: 'FLOW_TRAVERSAL',
      seedUrns: [URN_PROCESS_60000006],
      traversalSteps: [
        {
          relationType: 'CONTAINS_STEP',
          direction: 'OUTGOING',
          maxHops: 1,
        },
      ],
      overallMaxDepth: 1,
      includeInferred: false,
      fulltextKeywords: ['credit'],
      semanticQuery: 'process flow',
      ...overrides,
    });

    class StubGateway implements GraphRetrievalGateway {
      public traverseCalls: Array<{ snapshotId: string; criteria: GraphTraversalCriteria }> = [];
      public mockEntities: EntityItem[] = [];
      public mockEdges: EdgeItem[] = [];
      public mockPaths: NonNullable<GraphTraversalResult['paths']> = [];
      public isTruncated: boolean = false;
      public throwError: Error | null = null;

      async resolveEntities() {
        return [];
      }

      async traverse(
        snapshotId: string,
        criteria: GraphTraversalCriteria,
        options?: OperationOptions
      ): Promise<GraphTraversalResult> {
        if (options?.signal?.aborted) {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          throw err;
        }
        if (this.throwError) {
          throw this.throwError;
        }
        this.traverseCalls.push({ snapshotId, criteria });
        return {
          entities: this.mockEntities.slice(0, criteria.limitNodes),
          edges: this.mockEdges.slice(0, criteria.limitEdges),
          paths: this.mockPaths,
          truncated: this.isTruncated,
          truncationReason: this.isTruncated ? 'RESULT_LIMIT_REACHED' : undefined,
        };
      }
    }

    it('returns unavailable / NO_GRAPH_SEED with zero gateway calls when seeds are empty', async () => {
      const gateway = new StubGateway();
      const plan = createPlan({ seedUrns: [] });

      const result = await runBoundedGraphTraversal(plan, pinnedSnapshot, gateway);

      expect(gateway.traverseCalls.length).toBe(0);
      expect(result.status.status).toBe('unavailable');
      expect(result.status.reason).toBe('NO_GRAPH_SEED');
      expect(result.entities).toEqual([]);
      expect(result.edges).toEqual([]);
    });

    it('executes 1-hop flow path returning deduplicated entities and edges with citations', async () => {
      const gateway = new StubGateway();
      gateway.mockEntities = [
        {
          type: 'entity',
          id: URN_PROCESS_60000006,
          score: 1.0,
          modalitiesContributed: ['graph'],
          urn: URN_PROCESS_60000006,
          canonicalName: 'SHB - Credit calculations',
          kind: 'ScheduledProcess',
          snapshotId: pinnedSnapshot,
          hasConflict: false,
        },
        {
          type: 'entity',
          id: URN_CONTAINER_60000005,
          score: 1.0,
          modalitiesContributed: ['graph'],
          urn: URN_CONTAINER_60000005,
          canonicalName: 'Step 10 - Due date period cycle',
          kind: 'ProcessStep',
          snapshotId: pinnedSnapshot,
          hasConflict: false,
        },
      ];
      gateway.mockEdges = [
        {
          type: 'edge',
          id: 'fact-1',
          score: 1.0,
          modalitiesContributed: ['graph'],
          factKey: 'fact-1',
          sourceUrn: URN_PROCESS_60000006,
          relationType: 'CONTAINS_STEP',
          targetUrn: URN_CONTAINER_60000005,
          evidenceClass: 'OBSERVED',
          supportingChunkIds: ['chunk-101'],
          snapshotId: pinnedSnapshot,
          hasConflict: false,
        },
      ];

      const plan = createPlan();
      const result = await runBoundedGraphTraversal(plan, pinnedSnapshot, gateway);

      expect(gateway.traverseCalls.length).toBe(1);
      expect(result.status.status).toBe('ok');
      expect(result.status.itemCount).toBe(3);
      expect(result.entities.length).toBe(2);
      expect(result.edges.length).toBe(1);

      const edge = result.edges[0]!;
      expect(edge.factKey).toBe('fact-1');
      expect(edge.evidenceClass).toBe('OBSERVED');
      expect(edge.supportingChunkIds).toEqual(['chunk-101']);
      expect(edge.snapshotId).toBe(pinnedSnapshot);
    });

    it('omits undefined optional entity provenance before response validation', async () => {
      const gateway = new StubGateway();
      gateway.mockEntities = [
        {
          type: 'entity',
          id: URN_PROCESS_60000006,
          score: 1.0,
          modalitiesContributed: ['graph'],
          urn: URN_PROCESS_60000006,
          canonicalName: 'SHB - Credit calculations',
          kind: 'ScheduledProcess',
          snapshotId: pinnedSnapshot,
          firstSeenInDoc: undefined,
          hasConflict: false,
        } as EntityItem,
      ];

      const result = await runBoundedGraphTraversal(createPlan(), pinnedSnapshot, gateway);

      expect(result.entities).toHaveLength(1);
      expect(result.entities[0]).not.toHaveProperty('firstSeenInDoc');
    });

    it('executes 2-hop call chain path returning intermediate process and component', async () => {
      const gateway = new StubGateway();
      gateway.mockEntities = [
        {
          type: 'entity',
          id: URN_CONTAINER_60000006,
          score: 1.0,
          modalitiesContributed: ['graph'],
          urn: URN_CONTAINER_60000006,
          canonicalName: 'Step 20 - Grace period length cycle',
          kind: 'ProcessStep',
          snapshotId: pinnedSnapshot,
          hasConflict: false,
        },
        {
          type: 'entity',
          id: URN_SUBPROCESS_10000304,
          score: 1.0,
          modalitiesContributed: ['graph'],
          urn: URN_SUBPROCESS_10000304,
          canonicalName: 'Switch cycle',
          kind: 'ScheduledProcess',
          snapshotId: pinnedSnapshot,
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
          snapshotId: pinnedSnapshot,
          hasConflict: false,
        },
      ];
      gateway.mockEdges = [
        {
          type: 'edge',
          id: 'fact-invokes',
          score: 1.0,
          modalitiesContributed: ['graph'],
          factKey: 'fact-invokes',
          sourceUrn: URN_CONTAINER_60000006,
          relationType: 'INVOKES',
          targetUrn: URN_SUBPROCESS_10000304,
          evidenceClass: 'OBSERVED',
          supportingChunkIds: ['chunk-102'],
          snapshotId: pinnedSnapshot,
          hasConflict: false,
        },
        {
          type: 'edge',
          id: 'fact-calls',
          score: 1.0,
          modalitiesContributed: ['graph'],
          factKey: 'fact-calls',
          sourceUrn: URN_SUBPROCESS_10000304,
          relationType: 'CALLS',
          targetUrn: URN_PKG_FCL_CYCLE_COUNTER,
          evidenceClass: 'OBSERVED',
          supportingChunkIds: ['chunk-103'],
          snapshotId: pinnedSnapshot,
          hasConflict: false,
        },
      ];

      const plan = createPlan({
        seedUrns: [URN_CONTAINER_60000006],
        traversalSteps: [
          { relationType: 'INVOKES', direction: 'OUTGOING', maxHops: 1 },
          { relationType: 'CALLS', direction: 'OUTGOING', maxHops: 1 },
        ],
        overallMaxDepth: 2,
      });

      const result = await runBoundedGraphTraversal(plan, pinnedSnapshot, gateway);

      expect(result.status.status).toBe('ok');
      expect(result.entities.length).toBe(3);
      expect(result.edges.length).toBe(2);
      expect(result.edges.map((e) => e.relationType)).toEqual(['INVOKES', 'CALLS']);
    });

    it('preserves ordered 2-hop path provenance', async () => {
      const gateway = new StubGateway();
      gateway.mockPaths = [{
        nodeUrns: [URN_CONTAINER_60000006, URN_SUBPROCESS_10000304, URN_PKG_FCL_CYCLE_COUNTER],
        edgeFactKeys: ['fact-invokes', 'fact-calls'],
        hopClassifications: ['OBSERVED', 'OBSERVED'],
        hopSupportingChunkIds: [['chunk-102'], ['chunk-103']],
        edgeSnapshotIds: [pinnedSnapshot, pinnedSnapshot],
        hasConflict: false,
      }];

      const result = await runBoundedGraphTraversal(createPlan(), pinnedSnapshot, gateway);

      expect(result.paths).toHaveLength(1);
      expect(result.paths[0]!.nodeUrns).toHaveLength(3);
      expect(result.paths[0]!.edgeFactKeys).toEqual(['fact-invokes', 'fact-calls']);
      expect(result.paths[0]!.hopSupportingChunkIds).toEqual([['chunk-102'], ['chunk-103']]);
    });

    it('drops paths containing an edge from another graph snapshot', async () => {
      const gateway = new StubGateway();
      gateway.mockPaths = [{
        nodeUrns: [URN_CONTAINER_60000006, URN_SUBPROCESS_10000304, URN_PKG_FCL_CYCLE_COUNTER],
        edgeFactKeys: ['fact-invokes', 'fact-calls'],
        hopClassifications: ['OBSERVED', 'OBSERVED'],
        hopSupportingChunkIds: [['chunk-102'], ['chunk-103']],
        edgeSnapshotIds: [pinnedSnapshot, 'snapshot-foreign'],
        hasConflict: false,
      }];

      const result = await runBoundedGraphTraversal(createPlan(), pinnedSnapshot, gateway);

      expect(result.paths).toEqual([]);
    });

    it('caps ordered paths at 20 entries', async () => {
      const gateway = new StubGateway();
      gateway.mockPaths = Array.from({ length: 25 }, (_, index) => ({
        nodeUrns: [URN_PROCESS_60000006, URN_CONTAINER_60000005],
        edgeFactKeys: [`fact-${index}`],
        hopClassifications: ['OBSERVED'] as const,
        hopSupportingChunkIds: [[`chunk-${index}`]],
        edgeSnapshotIds: [pinnedSnapshot],
        hasConflict: false,
      }));

      const result = await runBoundedGraphTraversal(createPlan(), pinnedSnapshot, gateway);

      expect(result.paths).toHaveLength(20);
    });

    it('executes 3-hop reverse impact path starting from DatabaseObject', async () => {
      const gateway = new StubGateway();
      gateway.mockEntities = [
        {
          type: 'entity',
          id: URN_TABLE_FCL_CYCLE_COUNTER,
          score: 1.0,
          modalitiesContributed: ['graph'],
          urn: URN_TABLE_FCL_CYCLE_COUNTER,
          canonicalName: 'MAIN1.FCL_CYCLE_COUNTER',
          kind: 'DatabaseObject',
          snapshotId: pinnedSnapshot,
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
          snapshotId: pinnedSnapshot,
          hasConflict: false,
        },
        {
          type: 'entity',
          id: URN_SUBPROCESS_10000304,
          score: 1.0,
          modalitiesContributed: ['graph'],
          urn: URN_SUBPROCESS_10000304,
          canonicalName: 'Switch cycle',
          kind: 'ScheduledProcess',
          snapshotId: pinnedSnapshot,
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
          snapshotId: pinnedSnapshot,
          hasConflict: false,
        },
      ];
      gateway.mockEdges = [
        {
          type: 'edge',
          id: 'fact-impact-1',
          score: 1.0,
          modalitiesContributed: ['graph'],
          factKey: 'fact-impact-1',
          sourceUrn: URN_PKG_FCL_CYCLE_COUNTER,
          relationType: 'READS_FROM',
          targetUrn: URN_TABLE_FCL_CYCLE_COUNTER,
          evidenceClass: 'OBSERVED',
          supportingChunkIds: ['chunk-104'],
          snapshotId: pinnedSnapshot,
          hasConflict: false,
        },
        {
          type: 'edge',
          id: 'fact-impact-2',
          score: 1.0,
          modalitiesContributed: ['graph'],
          factKey: 'fact-impact-2',
          sourceUrn: URN_SUBPROCESS_10000304,
          relationType: 'CALLS',
          targetUrn: URN_PKG_FCL_CYCLE_COUNTER,
          evidenceClass: 'OBSERVED',
          supportingChunkIds: ['chunk-105'],
          snapshotId: pinnedSnapshot,
          hasConflict: false,
        },
        {
          type: 'edge',
          id: 'fact-impact-3',
          score: 1.0,
          modalitiesContributed: ['graph'],
          factKey: 'fact-impact-3',
          sourceUrn: URN_CONTAINER_60000006,
          relationType: 'INVOKES',
          targetUrn: URN_SUBPROCESS_10000304,
          evidenceClass: 'OBSERVED',
          supportingChunkIds: ['chunk-106'],
          snapshotId: pinnedSnapshot,
          hasConflict: false,
        },
      ];

      const plan = createPlan({
        seedUrns: [URN_TABLE_FCL_CYCLE_COUNTER],
        traversalSteps: [
          { relationType: 'READS_FROM', direction: 'INCOMING', maxHops: 3 },
        ],
        overallMaxDepth: 3,
      });

      const result = await runBoundedGraphTraversal(plan, pinnedSnapshot, gateway);

      expect(result.status.status).toBe('ok');
      expect(result.entities.length).toBe(4);
      expect(result.edges.length).toBe(3);
    });

    it('filters out INFERRED edges when includeInferred is false', async () => {
      const gateway = new StubGateway();
      gateway.mockEntities = [
        {
          type: 'entity',
          id: URN_PROCESS_60000006,
          score: 1.0,
          modalitiesContributed: ['graph'],
          urn: URN_PROCESS_60000006,
          canonicalName: 'SHB - Credit calculations',
          kind: 'ScheduledProcess',
          snapshotId: pinnedSnapshot,
          hasConflict: false,
        },
      ];
      gateway.mockEdges = [
        {
          type: 'edge',
          id: 'fact-observed',
          score: 1.0,
          modalitiesContributed: ['graph'],
          factKey: 'fact-observed',
          sourceUrn: URN_PROCESS_60000006,
          relationType: 'CONTAINS_STEP',
          targetUrn: URN_CONTAINER_60000005,
          evidenceClass: 'OBSERVED',
          supportingChunkIds: ['c1'],
          snapshotId: pinnedSnapshot,
          hasConflict: false,
        },
        {
          type: 'edge',
          id: 'fact-inferred',
          score: 1.0,
          modalitiesContributed: ['graph'],
          factKey: 'fact-inferred',
          sourceUrn: URN_PROCESS_60000006,
          relationType: 'CONTAINS_STEP',
          targetUrn: URN_CONTAINER_60000006,
          evidenceClass: 'INFERRED',
          supportingChunkIds: ['c2'],
          snapshotId: pinnedSnapshot,
          hasConflict: false,
        },
      ];

      const plan = createPlan({ includeInferred: false });
      const result = await runBoundedGraphTraversal(plan, pinnedSnapshot, gateway);

      expect(result.edges.length).toBe(1);
      expect(result.edges[0]!.factKey).toBe('fact-observed');
    });

    it('allows INFERRED edges when includeInferred is true', async () => {
      const gateway = new StubGateway();
      gateway.mockEdges = [
        {
          type: 'edge',
          id: 'fact-inferred',
          score: 1.0,
          modalitiesContributed: ['graph'],
          factKey: 'fact-inferred',
          sourceUrn: URN_PROCESS_60000006,
          relationType: 'CONTAINS_STEP',
          targetUrn: URN_CONTAINER_60000006,
          evidenceClass: 'INFERRED',
          supportingChunkIds: ['c2'],
          snapshotId: pinnedSnapshot,
          hasConflict: false,
        },
      ];

      const plan = createPlan({ includeInferred: true });
      const result = await runBoundedGraphTraversal(plan, pinnedSnapshot, gateway);

      expect(result.edges.length).toBe(1);
      expect(result.edges[0]!.evidenceClass).toBe('INFERRED');
    });

    it('enforces 100 node cap and reports truncated / RESULT_LIMIT_REACHED on overflow', async () => {
      const gateway = new StubGateway();
      // Generate 105 mock entities
      for (let i = 0; i < 105; i++) {
        const urn = `urn:plannermate:smartvista:ProcessStep:step-${i}` as any;
        gateway.mockEntities.push({
          type: 'entity',
          id: urn,
          score: 1.0,
          modalitiesContributed: ['graph'],
          urn,
          canonicalName: `Step ${i}`,
          kind: 'ProcessStep',
          snapshotId: pinnedSnapshot,
          hasConflict: false,
        });
      }

      const plan = createPlan();
      const result = await runBoundedGraphTraversal(plan, pinnedSnapshot, gateway);

      expect(result.status.status).toBe('truncated');
      expect(result.status.reason).toBe('RESULT_LIMIT_REACHED');
      expect(result.entities.length).toBe(100);
    });

    it('enforces 200 edge cap and reports truncated / RESULT_LIMIT_REACHED on overflow', async () => {
      const gateway = new StubGateway();
      // Generate 205 mock edges
      for (let i = 0; i < 205; i++) {
        const factKey = `fact-${i}`;
        gateway.mockEdges.push({
          type: 'edge',
          id: factKey,
          score: 1.0,
          modalitiesContributed: ['graph'],
          factKey,
          sourceUrn: URN_PROCESS_60000006,
          relationType: 'CONTAINS_STEP',
          targetUrn: `urn:plannermate:smartvista:ProcessStep:step-${i}` as any,
          evidenceClass: 'OBSERVED',
          supportingChunkIds: [`c-${i}`],
          snapshotId: pinnedSnapshot,
          hasConflict: false,
        });
      }

      const plan = createPlan();
      const result = await runBoundedGraphTraversal(plan, pinnedSnapshot, gateway);

      expect(result.status.status).toBe('truncated');
      expect(result.status.reason).toBe('RESULT_LIMIT_REACHED');
      expect(result.edges.length).toBe(200);
    });

    it('maps gateway timeout or abort to timeout status without leaking internal query or error text', async () => {
      const gateway = new StubGateway();
      const controller = new AbortController();
      controller.abort();

      const plan = createPlan();
      const result = await runBoundedGraphTraversal(plan, pinnedSnapshot, gateway, controller.signal);

      expect(result.status.status).toBe('timeout');
      expect(result.status.reason).toBe('TIMEOUT');
      expect(result.status.reason).not.toContain('Cypher');
      expect(result.status.reason).not.toContain('SELECT');
      expect(result.entities).toEqual([]);
      expect(result.edges).toEqual([]);
    });

    it('maps missing or stale snapshot error to stale / PINNED_SNAPSHOT_UNAVAILABLE', async () => {
      const gateway = new StubGateway();
      gateway.throwError = new Error('Pinned snapshot lease expired / stale snapshot');

      const plan = createPlan();
      const result = await runBoundedGraphTraversal(plan, pinnedSnapshot, gateway);

      expect(result.status.status).toBe('stale');
      expect(result.status.reason).toBe('PINNED_SNAPSHOT_UNAVAILABLE');
      expect(result.status.reason).not.toContain('Cypher');
      expect(result.entities).toEqual([]);
    });

    it('maps unknown provider error to error / PROVIDER_ERROR without leaking raw error text', async () => {
      const gateway = new StubGateway();
      gateway.throwError = new Error('Neo4j connection reset by peer at cypher MATCH (n) FAIL');

      const plan = createPlan();
      const result = await runBoundedGraphTraversal(plan, pinnedSnapshot, gateway);

      expect(result.status.status).toBe('error');
      expect(result.status.reason).toBe('PROVIDER_ERROR');
      expect(result.status.reason).not.toContain('Neo4j');
      expect(result.status.reason).not.toContain('cypher');
      expect(result.entities).toEqual([]);
    });
  });
});

