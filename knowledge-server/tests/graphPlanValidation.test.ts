import { describe, expect, it } from 'vitest';
import {
  STATIC_TRAVERSAL_QUERIES,
  runBoundedGraphTraversal,
  validateTraversalPlan,
} from '../src/retrieval/graphTraversal.js';
import { PLAN_VALIDATION_REASON_CODES } from '../src/retrieval/retrievalPlanDerivation.js';
import { LogicalQueryPlanSchema, type LogicalQueryPlan } from '../src/types/retrievalProtocol.js';
import type {
  GraphRetrievalGateway,
  GraphTraversalCriteria,
  GraphTraversalResult,
} from '../src/retrieval/contracts.js';

const URN_DB_OBJECT = 'urn:plannermate:oracle:ORACLE_TABLE:MAIN1.EVT_EVENT';
const URN_PROCESS = 'urn:plannermate:smartvista:PRC_PROCESS:60000006';
const URN_COMPONENT = 'urn:plannermate:plsql:PLSQL_PROCEDURE:MAIN1.WRITER_PKG.PROCESS';
const PINNED_SNAPSHOT = 'snapshot-pinned-01';

class SpyGateway implements GraphRetrievalGateway {
  public traverseCalls: Array<{ snapshotId: string; criteria: GraphTraversalCriteria }> = [];

  async resolveEntities(): Promise<[]> {
    return [];
  }

  async traverse(
    snapshotId: string,
    criteria: GraphTraversalCriteria
  ): Promise<GraphTraversalResult> {
    this.traverseCalls.push({ snapshotId, criteria });
    return { entities: [], edges: [], paths: [], truncated: false };
  }
}

function buildPlan(overrides?: Partial<LogicalQueryPlan>): LogicalQueryPlan {
  return {
    planId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
    queryIntent: 'IMPACT_ANALYSIS',
    seedUrns: [URN_DB_OBJECT],
    traversalSteps: [
      { relationType: 'READS_FROM', direction: 'INCOMING', maxHops: 1 },
      { relationType: 'WRITES_TO', direction: 'INCOMING', maxHops: 1 },
    ],
    overallMaxDepth: 1,
    includeInferred: false,
    fulltextKeywords: ['EVT_EVENT'],
    semanticQuery: 'who writes EVT_EVENT',
    ...overrides,
  };
}

const seedKinds = {
  [URN_DB_OBJECT]: 'DatabaseObject' as const,
  [URN_PROCESS]: 'ScheduledProcess' as const,
  [URN_COMPONENT]: 'SoftwareComponent' as const,
};

function expectStableReason(reason: string | undefined) {
  expect(reason).toBeDefined();
  expect(PLAN_VALIDATION_REASON_CODES).toContain(reason as never);
  expect(reason).not.toContain('urn:');
  expect(reason).not.toContain('MATCH');
  expect(reason).not.toContain('Cypher');
}

describe('24-01: reject-not-clamp graph plan validation', () => {
  it('parses depth 5 then rejects traversal with HOP_LIMIT_EXCEEDED and zero gateway calls', async () => {
    const parsed = LogicalQueryPlanSchema.safeParse(buildPlan({ overallMaxDepth: 5 }));
    expect(parsed.success).toBe(true);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const gateway = new SpyGateway();
    const result = await runBoundedGraphTraversal(parsed.data, PINNED_SNAPSHOT, gateway);

    expect(result.status.status).toBe('error');
    expect(result.status.reason).toBe('HOP_LIMIT_EXCEEDED');
    expect(gateway.traverseCalls).toHaveLength(0);
    expectStableReason(result.status.reason);
  });

  it('rejects a step maxHops above the registry ceiling with HOP_LIMIT_EXCEEDED', async () => {
    const gateway = new SpyGateway();
    const result = await runBoundedGraphTraversal(
      buildPlan({
        traversalSteps: [
          { relationType: 'READS_FROM', direction: 'INCOMING', maxHops: 4 },
        ],
      }),
      PINNED_SNAPSHOT,
      gateway,
      { allowedSeedSet: new Set([URN_DB_OBJECT]), seedKinds }
    );

    expect(result.status.reason).toBe('HOP_LIMIT_EXCEEDED');
    expect(gateway.traverseCalls).toHaveLength(0);
  });

  it('rejects CONTAINS_STEP BOTH on a ScheduledProcess seed with INVALID_DIRECTION', async () => {
    const gateway = new SpyGateway();
    const result = await runBoundedGraphTraversal(
      buildPlan({
        seedUrns: [URN_PROCESS],
        traversalSteps: [{ relationType: 'CONTAINS_STEP', direction: 'BOTH', maxHops: 1 }],
      }),
      PINNED_SNAPSHOT,
      gateway,
      { allowedSeedSet: new Set([URN_PROCESS]), seedKinds }
    );

    expect(result.status.reason).toBe('INVALID_DIRECTION');
    expect(gateway.traverseCalls).toHaveLength(0);
  });

  it('rejects READS_FROM OUTGOING on a DatabaseObject seed with INVALID_DIRECTION', async () => {
    const gateway = new SpyGateway();
    const result = await runBoundedGraphTraversal(
      buildPlan({
        traversalSteps: [{ relationType: 'READS_FROM', direction: 'OUTGOING', maxHops: 1 }],
      }),
      PINNED_SNAPSHOT,
      gateway,
      { allowedSeedSet: new Set([URN_DB_OBJECT]), seedKinds }
    );

    expect(result.status.reason).toBe('INVALID_DIRECTION');
    expect(gateway.traverseCalls).toHaveLength(0);
  });

  it('rejects WRITES_TO with targetKind ScheduledProcess with INVALID_ENDPOINT_KIND', async () => {
    const gateway = new SpyGateway();
    const result = await runBoundedGraphTraversal(
      buildPlan({
        traversalSteps: [
          {
            relationType: 'WRITES_TO',
            direction: 'INCOMING',
            maxHops: 1,
            targetKind: 'ScheduledProcess',
          },
        ],
      }),
      PINNED_SNAPSHOT,
      gateway,
      { allowedSeedSet: new Set([URN_DB_OBJECT]), seedKinds }
    );

    expect(result.status.reason).toBe('INVALID_ENDPOINT_KIND');
    expect(gateway.traverseCalls).toHaveLength(0);
  });

  it('rejects a loose step with relation NOT_A_RELATION with INVALID_RELATION', async () => {
    const gateway = new SpyGateway();
    const loosePlan = buildPlan({
      traversalSteps: [{ relationType: 'NOT_A_RELATION' as never, maxHops: 1 }],
    });
    const result = await runBoundedGraphTraversal(loosePlan, PINNED_SNAPSHOT, gateway, {
      allowedSeedSet: new Set([URN_DB_OBJECT]),
      seedKinds,
    });

    expect(result.status.reason).toBe('INVALID_RELATION');
    expect(gateway.traverseCalls).toHaveLength(0);
  });

  it('rejects an unallowlisted seed with SEED_NOT_FOUND', async () => {
    const gateway = new SpyGateway();
    const result = await runBoundedGraphTraversal(buildPlan(), PINNED_SNAPSHOT, gateway, {
      allowedSeedSet: new Set([URN_PROCESS]),
      seedKinds,
    });

    expect(result.status.reason).toBe('SEED_NOT_FOUND');
    expect(gateway.traverseCalls).toHaveLength(0);
  });

  it('keeps every rejection reason inside PLAN_VALIDATION_REASON_CODES with no content leakage', () => {
    const rejections = [
      validateTraversalPlan(buildPlan({ overallMaxDepth: 5 }), new Set([URN_DB_OBJECT]), seedKinds),
      validateTraversalPlan(
        buildPlan({ traversalSteps: [{ relationType: 'CALLS', direction: 'INCOMING', maxHops: 1 }] }),
        new Set([URN_DB_OBJECT]),
        seedKinds
      ),
      validateTraversalPlan(buildPlan(), new Set([URN_PROCESS]), seedKinds),
    ];

    for (const rejection of rejections) {
      expect(rejection.valid).toBe(false);
      if (!rejection.valid) {
        expectStableReason(rejection.reason);
        expect(rejection.reason).not.toBe('NO_GRAPH_SEED');
      }
    }
  });

  it('validates a per-seed DatabaseObject plan and resolves both static query keys', async () => {
    const plan = buildPlan();
    const validated = validateTraversalPlan(plan, new Set([URN_DB_OBJECT]), seedKinds);

    expect(validated.valid).toBe(true);
    if (validated.valid) {
      expect(validated.plan.steps.map((step) => step.queryKey)).toEqual([
        'READS_FROM:INCOMING:1',
        'WRITES_TO:INCOMING:1',
      ]);
    }
    expect(STATIC_TRAVERSAL_QUERIES['READS_FROM:INCOMING:1']).toBeDefined();
    expect(STATIC_TRAVERSAL_QUERIES['WRITES_TO:INCOMING:1']).toBeDefined();

    const gateway = new SpyGateway();
    const result = await runBoundedGraphTraversal(plan, PINNED_SNAPSHOT, gateway, {
      allowedSeedSet: new Set([URN_DB_OBJECT]),
      seedKinds,
    });
    expect(result.status.status).toBe('ok');
    expect(gateway.traverseCalls).toHaveLength(1);
  });
});
