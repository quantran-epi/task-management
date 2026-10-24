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
} from './fixtures/pilotGoldEntities.js';

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
