import { describe, expect, it, vi } from 'vitest';
import {
  runBoundedGraphTraversal,
  type BoundedGraphTraversalResult,
} from '../src/retrieval/graphTraversal.js';
import { Neo4jRepository } from '../src/graph/neo4jRepository.js';
import type {
  GraphRetrievalGateway,
  GraphTraversalCriteria,
  GraphTraversalResult,
  OperationOptions,
} from '../src/retrieval/contracts.js';
import type {
  LogicalQueryPlan,
  EntityItem,
  EdgeItem,
  ClarificationCandidate,
} from '../src/types/retrievalProtocol.js';
import {
  URN_PROCESS_60000006,
  URN_CONTAINER_60000005,
  URN_TABLE_FCL_CYCLE_COUNTER,
  URN_TABLE_EVT_EVENT,
  URN_PKG_EVT_EVENT_WRITER,
  PILOT_GOLD_EVT_EVENT_NODES,
  PILOT_GOLD_EVT_EVENT_RELATIONS,
  PILOT_GOLD_SUPPORTING_CHUNKS,
} from './fixtures/pilotGoldEntities.js';
import { RETRIEVAL_ONTOLOGY_REGISTRY } from '../src/graph/ontology.js';

const pinnedSnapshot = 'gsnap_abcdef12';

function plan(overrides?: Partial<LogicalQueryPlan>): LogicalQueryPlan {
  return {
    planId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
    queryIntent: 'LOOKUP',
    seedUrns: [URN_TABLE_FCL_CYCLE_COUNTER],
    traversalSteps: [{ relationType: 'WRITES_TO', direction: 'INCOMING', maxHops: 1 }],
    overallMaxDepth: 1,
    includeInferred: false,
    fulltextKeywords: ['FCL_CYCLE_COUNTER'],
    semanticQuery: 'table writer',
    ...overrides,
  };
}

function entity(urn: string, name: string, kind: EntityItem['kind']): EntityItem {
  return {
    type: 'entity',
    id: urn as EntityItem['id'],
    score: 1,
    modalitiesContributed: ['graph'],
    urn: urn as EntityItem['urn'],
    canonicalName: name,
    kind,
    snapshotId: pinnedSnapshot,
    hasConflict: false,
  };
}

class SeedStubGateway implements GraphRetrievalGateway {
  public traverseCalls = 0;
  constructor(private readonly result: GraphTraversalResult) {}

  async resolveEntities(): Promise<ClarificationCandidate[]> {
    return [];
  }

  async traverse(
    _snapshotId: string,
    _criteria: GraphTraversalCriteria,
    _options?: OperationOptions
  ): Promise<GraphTraversalResult> {
    this.traverseCalls += 1;
    return this.result;
  }
}

describe('24-02-T1: seed preservation and separate graph counts', () => {
  it('keeps a resolved seed with zero edges in seedEntities and entities', async () => {
    const seed = entity(URN_TABLE_FCL_CYCLE_COUNTER, 'MAIN1.FCL_CYCLE_COUNTER', 'DatabaseObject');
    const gateway = new SeedStubGateway({ entities: [], seedEntities: [seed], edges: [], truncated: false });

    const result = await runBoundedGraphTraversal(plan(), pinnedSnapshot, gateway);

    expect(result.entities).toHaveLength(1);
    expect(result.seedEntities).toHaveLength(1);
    expect(result.seedEntities[0]!.urn).toBe(seed.urn);
    expect(result.status.entityCount).toBe(1);
    expect(result.status.edgeCount).toBe(0);
    expect(result.status.pathCount).toBe(0);
    expect(result.status.reason).toBe('SEED_FOUND_NO_RELATION');
  });

  it('counts a seed plus one edge and one path as 2/1/1 without double-counting the seed', async () => {
    const seedEntity = entity(URN_TABLE_FCL_CYCLE_COUNTER, 'MAIN1.FCL_CYCLE_COUNTER', 'DatabaseObject');
    const writer = entity(URN_PROCESS_60000006, 'MAIN1.EVT_EVENT_PKG.PROCESS', 'SoftwareComponent');
    const edge: EdgeItem = {
      type: 'edge',
      id: 'a'.repeat(64),
      score: 1,
      modalitiesContributed: ['graph'],
      factKey: 'a'.repeat(64),
      sourceUrn: URN_PROCESS_60000006,
      relationType: 'WRITES_TO',
      targetUrn: URN_TABLE_FCL_CYCLE_COUNTER,
      evidenceClass: 'OBSERVED',
      supportingChunkIds: ['chunk-evt-1'],
      snapshotId: pinnedSnapshot,
      hasConflict: false,
    };
    const gateway = new SeedStubGateway({
      entities: [writer],
      seedEntities: [seedEntity],
      edges: [edge],
      paths: [{
        nodeUrns: [URN_PROCESS_60000006, URN_TABLE_FCL_CYCLE_COUNTER],
        edgeFactKeys: [edge.factKey],
        hopClassifications: ['OBSERVED'],
        hopSupportingChunkIds: [['chunk-evt-1']],
        edgeSnapshotIds: [pinnedSnapshot],
        hasConflict: false,
      }],
      truncated: false,
    });

    const result = await runBoundedGraphTraversal(plan(), pinnedSnapshot, gateway);

    expect(result.status.entityCount).toBe(2);
    expect(result.status.edgeCount).toBe(1);
    expect(result.status.pathCount).toBe(1);
    expect(result.entities.filter((item) => item.urn === seedEntity.urn)).toHaveLength(1);
    expect(result.status.reason).toBeUndefined();
  });

  it('renders a seed absent from traversal node output exactly once', async () => {
    const seedEntity = entity(URN_TABLE_FCL_CYCLE_COUNTER, 'MAIN1.FCL_CYCLE_COUNTER', 'DatabaseObject');
    const other = entity(URN_CONTAINER_60000005, 'Step 10', 'ProcessStep');
    const gateway = new SeedStubGateway({
      entities: [other],
      seedEntities: [seedEntity],
      edges: [],
      truncated: false,
    });

    const result = await runBoundedGraphTraversal(plan(), pinnedSnapshot, gateway);

    const seedHits = result.entities.filter((item) => item.urn === seedEntity.urn);
    expect(seedHits).toHaveLength(1);
    expect(result.entities.map((item) => item.urn)).toEqual([seedEntity.urn, other.urn]);
  });

  it('keeps a traversal-discovered entity whose URN is not a seed', async () => {
    const other = entity(URN_CONTAINER_60000005, 'Step 10', 'ProcessStep');
    const gateway = new SeedStubGateway({ entities: [other], seedEntities: [], edges: [], truncated: false });

    const result: BoundedGraphTraversalResult = await runBoundedGraphTraversal(
      plan({ seedUrns: [URN_PROCESS_60000006] }),
      pinnedSnapshot,
      gateway
    );

    expect(result.entities.map((item) => item.urn)).toEqual([other.urn]);
  });

  it('keeps itemCount as the legacy sum of chunks, entities, and edges', async () => {
    const seedEntity = entity(URN_TABLE_FCL_CYCLE_COUNTER, 'MAIN1.FCL_CYCLE_COUNTER', 'DatabaseObject');
    const chunk = {
      type: 'chunk' as const,
      id: 'chunk-evt-1',
      score: 1,
      modalitiesContributed: ['graph' as const],
      sourceDocumentId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      sourceDocumentTitle: 'EVT_EVENT spec',
      sectionAnchor: 'Writers',
      lineStart: 1,
      lineEnd: 4,
      rawSnippet: 'EVT_EVENT writers',
      publishedContentHash: 'b'.repeat(64),
      snapshotId: pinnedSnapshot,
      hasConflict: false,
    };
    const gateway = new SeedStubGateway({
      chunks: [chunk],
      entities: [],
      seedEntities: [seedEntity],
      edges: [],
      truncated: false,
    });

    const result = await runBoundedGraphTraversal(plan(), pinnedSnapshot, gateway);

    expect(result.status.itemCount).toBe(2);
    expect(result.status.itemCount).toBe(
      result.chunks.length + result.entities.length + result.edges.length
    );
  });

  it('surfaces the plan-01 stable code and makes zero gateway calls on an invalid plan', async () => {
    const gateway = new SeedStubGateway({ entities: [], edges: [], truncated: false });

    const result = await runBoundedGraphTraversal(
      plan({ traversalSteps: [{ relationType: 'NOT_A_RELATION' as any, direction: 'OUTGOING', maxHops: 1 }] }),
      pinnedSnapshot,
      gateway
    );

    expect(result.status.status).toBe('error');
    expect(result.status.reason).toBe('INVALID_RELATION');
    expect(gateway.traverseCalls).toBe(0);
  });
});

describe('24-02-T1: repository traversal preserves zero-edge seeds', () => {
  function makeRecord(values: Record<string, unknown>) {
    return { get: (key: string) => values[key] ?? null };
  }

  function makeDriver(handler: (query: string) => Promise<any[]>) {
    const run = vi.fn(async (query: string) => ({ records: await handler(query) }));
    const session = { run, close: vi.fn().mockResolvedValue(undefined), executeWrite: vi.fn() };
    const driver = { session: vi.fn().mockReturnValue(session), close: vi.fn().mockResolvedValue(undefined) };
    return { driver, session, run };
  }

  const criteria = (steps: GraphTraversalCriteria['plan']['traversalSteps']): GraphTraversalCriteria => ({
    seedUrns: [URN_TABLE_FCL_CYCLE_COUNTER],
    plan: plan({ traversalSteps: steps }),
    evidenceClasses: ['OBSERVED'],
    limitNodes: 100,
    limitEdges: 200,
  });

  it('returns a seed with no matching edges instead of dropping it', async () => {
    const { driver } = makeDriver(async (query) => {
      if (query.includes('RESOLVE_ENTITIES') || query.includes('UNWIND $tokens')) {
        return [makeRecord({
          urn: URN_TABLE_FCL_CYCLE_COUNTER,
          canonicalName: 'MAIN1.FCL_CYCLE_COUNTER',
          kind: 'DatabaseObject',
        })];
      }
      return [];
    });
    const repo = new Neo4jRepository({ uri: 'bolt://test', driver: driver as any });

    const result = await repo.traverse(
      pinnedSnapshot,
      criteria([{ relationType: 'WRITES_TO', direction: 'INCOMING', maxHops: 1 }])
    );

    expect(result.entities.map((item) => item.urn)).toEqual([URN_TABLE_FCL_CYCLE_COUNTER]);
    expect(result.seedEntities?.map((item) => item.urn)).toEqual([URN_TABLE_FCL_CYCLE_COUNTER]);
    expect(result.edges).toEqual([]);
    expect(result.paths).toEqual([]);
  });

  it('issues no WRITES_TO query when the plan has no WRITES_TO step', async () => {
    const { driver, run } = makeDriver(async (query) => {
      if (query.includes('UNWIND $tokens')) {
        return [makeRecord({
          urn: URN_TABLE_FCL_CYCLE_COUNTER,
          canonicalName: 'MAIN1.FCL_CYCLE_COUNTER',
          kind: 'DatabaseObject',
        })];
      }
      return [];
    });
    const repo = new Neo4jRepository({ uri: 'bolt://test', driver: driver as any });

    await repo.traverse(
      pinnedSnapshot,
      criteria([{ relationType: 'READS_FROM', direction: 'INCOMING', maxHops: 1 }])
    );

    const executedQueries = run.mock.calls.map((call) => String(call[0]));
    expect(executedQueries.some((query) => query.includes('WRITES_TO'))).toBe(false);
  });
});

describe('24-02-T3: MAIN1.EVT_EVENT regression fixture', () => {
  const supportingChunk = PILOT_GOLD_SUPPORTING_CHUNKS[0];

  function seedChunk() {
    return {
      type: 'chunk' as const,
      id: supportingChunk.chunkId,
      score: 1,
      modalitiesContributed: ['graph' as const],
      sourceDocumentId: supportingChunk.documentId,
      sourceDocumentTitle: supportingChunk.documentTitle,
      sectionAnchor: supportingChunk.headingPath.join(' > '),
      lineStart: supportingChunk.startLine,
      lineEnd: supportingChunk.endLine,
      rawSnippet: supportingChunk.rawSnippet,
      publishedContentHash: supportingChunk.publishedContentHash,
      snapshotId: pinnedSnapshot,
      hasConflict: false,
    };
  }

  function evtEventTrace() {
    const seedEntity = entity(URN_TABLE_EVT_EVENT, 'MAIN1.EVT_EVENT', 'DatabaseObject');
    const writerEntity = entity(
      URN_PKG_EVT_EVENT_WRITER,
      'MAIN1.EVT_EVENT_PKG.PROCESS',
      'SoftwareComponent'
    );
    const relation = PILOT_GOLD_EVT_EVENT_RELATIONS[0]!;
    const edge: EdgeItem = {
      type: 'edge',
      id: relation.factKey,
      score: 1,
      modalitiesContributed: ['graph'],
      factKey: relation.factKey,
      sourceUrn: URN_PKG_EVT_EVENT_WRITER,
      relationType: 'WRITES_TO',
      targetUrn: URN_TABLE_EVT_EVENT,
      evidenceClass: 'OBSERVED',
      supportingChunkIds: [supportingChunk.chunkId],
      snapshotId: pinnedSnapshot,
      hasConflict: false,
    };
    return {
      chunks: [seedChunk()],
      entities: [writerEntity],
      seedEntities: [seedEntity],
      edges: [edge],
      paths: [{
        nodeUrns: [URN_PKG_EVT_EVENT_WRITER, URN_TABLE_EVT_EVENT],
        edgeFactKeys: [relation.factKey],
        hopClassifications: ['OBSERVED' as const],
        hopSupportingChunkIds: [[supportingChunk.chunkId]],
        edgeSnapshotIds: [pinnedSnapshot],
        hasConflict: false,
      }],
      truncated: false,
    };
  }

  it('exports an EVT_EVENT table, a WRITES_TO writer, and a supporting chunk', () => {
    const table = PILOT_GOLD_EVT_EVENT_NODES.find((node) => node.urn === URN_TABLE_EVT_EVENT);
    const writer = PILOT_GOLD_EVT_EVENT_NODES.find((node) => node.urn === URN_PKG_EVT_EVENT_WRITER);
    const relation = PILOT_GOLD_EVT_EVENT_RELATIONS.find(
      (rel) => rel.relation === 'WRITES_TO' && rel.objectUrn === URN_TABLE_EVT_EVENT
    );

    expect(table?.kind).toBe('DatabaseObject');
    expect(table?.subkind).toBe('ORACLE_TABLE');
    expect(writer?.kind).toBe('SoftwareComponent');
    expect(relation?.subjectUrn).toBe(URN_PKG_EVT_EVENT_WRITER);
    expect(relation?.effectiveClassification).toBe('OBSERVED');
    expect(supportingChunk.factKey).toBe(relation?.factKey);
  });

  it('satisfies the WRITES_TO ontology endpoint rules', () => {
    const entry = RETRIEVAL_ONTOLOGY_REGISTRY.WRITES_TO;
    const writer = PILOT_GOLD_EVT_EVENT_NODES.find((node) => node.urn === URN_PKG_EVT_EVENT_WRITER);
    const table = PILOT_GOLD_EVT_EVENT_NODES.find((node) => node.urn === URN_TABLE_EVT_EVENT);

    expect(entry.allowedSourceKinds).toContain(writer!.kind);
    expect(entry.allowedTargetKinds).toContain(table!.kind);
  });

  it('emits no URN with diacritics that would break the URN regex', async () => {
    const { URN_REGEX } = await import('../src/types/graphProtocol.js');
    for (const node of PILOT_GOLD_EVT_EVENT_NODES) {
      expect(URN_REGEX.test(node.urn)).toBe(true);
      expect(node.urn).not.toMatch(/[^\x00-\x7F]/);
    }
  });

  it('returns the seed entity, writer, WRITES_TO edge, and a citation-closed path', async () => {
    const gateway = new SeedStubGateway(evtEventTrace());

    const result = await runBoundedGraphTraversal(
      plan({
        queryIntent: 'IMPACT_ANALYSIS',
        seedUrns: [URN_TABLE_EVT_EVENT],
        traversalSteps: [{ relationType: 'WRITES_TO', direction: 'INCOMING', maxHops: 1 }],
      }),
      pinnedSnapshot,
      gateway
    );

    expect(result.status.entityCount).toBe(2);
    expect(result.status.edgeCount).toBe(1);
    expect(result.status.pathCount).toBe(1);
    expect(result.entities.map((item) => item.urn).sort()).toEqual(
      [URN_PKG_EVT_EVENT_WRITER, URN_TABLE_EVT_EVENT].sort()
    );
    expect(result.edges[0]?.relationType).toBe('WRITES_TO');
    expect(result.paths[0]?.hopSupportingChunkIds[0]).toEqual([supportingChunk.chunkId]);
  });

  it('degrades to SEED_ONLY with entity count 1 when the same fixture has no edges', async () => {
    const seedEntity = entity(URN_TABLE_EVT_EVENT, 'MAIN1.EVT_EVENT', 'DatabaseObject');
    const gateway = new SeedStubGateway({
      entities: [],
      seedEntities: [seedEntity],
      edges: [],
      truncated: false,
    });

    const result = await runBoundedGraphTraversal(
      plan({
        seedUrns: [URN_TABLE_EVT_EVENT],
        traversalSteps: [{ relationType: 'WRITES_TO', direction: 'INCOMING', maxHops: 1 }],
      }),
      pinnedSnapshot,
      gateway
    );

    expect(result.status.entityCount).toBe(1);
    expect(result.status.edgeCount).toBe(0);
    expect(result.status.reason).toBe('SEED_FOUND_NO_RELATION');
    expect(result.entities[0]?.urn).toBe(URN_TABLE_EVT_EVENT);
  });

  it('returns table evidence plus one failedSeeds entry for an unknown seed', async () => {
    const gateway = new SeedStubGateway(evtEventTrace());
    const { buildQueryExecutionPlan } = await import('../src/retrieval/queryPlanning.js');
    const unknownUrn = 'urn:plannermate:oracle:ORACLE_TABLE:MAIN1.UNKNOWN_EVT' as const;

    const outcome = await buildQueryExecutionPlan({
      request: {
        query: 'MAIN1.EVT_EVENT writers',
        limit: 20,
        includeInferred: false,
        recentTurns: [],
      },
      pinnedSnapshotId: pinnedSnapshot,
      gateway: {
        resolveEntities: async () => [
          { urn: URN_TABLE_EVT_EVENT, canonicalName: 'MAIN1.EVT_EVENT', kind: 'DatabaseObject' as const },
        ],
        traverse: gateway.traverse.bind(gateway),
      },
      planner: {
        plan: async () => ({
          type: 'plan' as const,
          plan: plan({
            queryIntent: 'IMPACT_ANALYSIS',
            seedUrns: [URN_TABLE_EVT_EVENT, unknownUrn],
            traversalSteps: [{ relationType: 'WRITES_TO', direction: 'INCOMING', maxHops: 1 }],
          }),
        }),
      },
    });

    expect(outcome.status).toBe('executable');
    if (outcome.status !== 'executable') return;
    expect(outcome.plan.seedUrns).toEqual([URN_TABLE_EVT_EVENT]);
    expect(outcome.failedSeeds).toEqual([{ urn: unknownUrn, reasonCode: 'SEED_NOT_FOUND' }]);
  });
});
