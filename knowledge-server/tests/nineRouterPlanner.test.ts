import { describe, it, expect, vi } from 'vitest';
import {
  NineRouterQueryPlanner,
  PlannerTransportError,
} from '../src/retrieval/nineRouterQueryPlanner.js';
import { buildQueryExecutionPlan } from '../src/retrieval/queryPlanning.js';
import type { GraphRetrievalGateway, QueryPlannerContext } from '../src/retrieval/contracts.js';
import type { RetrievalRequest } from '../src/types/retrievalProtocol.js';

const URN_TABLE_FCL_CYCLE_COUNTER =
  'urn:plannermate:oracle:table:MAIN1.FCL_CYCLE_COUNTER';
const URN_STEP_CREDIT =
  'urn:plannermate:smartvista:process_step:60000006:CREDIT_CALC';

const defaultContext: QueryPlannerContext = {
  resolvedCandidates: [
    {
      urn: URN_TABLE_FCL_CYCLE_COUNTER,
      canonicalName: 'MAIN1.FCL_CYCLE_COUNTER',
      kind: 'DatabaseObject',
    },
    {
      urn: URN_STEP_CREDIT,
      canonicalName: 'Step 60000006.CREDIT_CALC',
      kind: 'ProcessStep',
    },
  ],
  registeredNodeKinds: ['DatabaseObject', 'ProcessStep', 'SoftwareComponent'],
  registeredRelationTypes: ['READS_FROM', 'WRITES_TO', 'CALLS', 'CONTAINS_STEP'],
};

const defaultRequest: RetrievalRequest = {
  query: 'thủ tục nào đọc bảng FCL_CYCLE_COUNTER',
  limit: 20,
  includeInferred: false,
  recentTurns: [],
};

const validPlanObject = {
  planId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  queryIntent: 'LOOKUP',
  seedUrns: [URN_TABLE_FCL_CYCLE_COUNTER],
  traversalSteps: [
    {
      relationType: 'READS_FROM',
      direction: 'INCOMING',
      maxHops: 1,
      targetKind: 'SoftwareComponent',
    },
  ],
  overallMaxDepth: 1,
  includeInferred: false,
  fulltextKeywords: ['FCL_CYCLE_COUNTER', 'READS_FROM'],
  semanticQuery: 'thủ tục nào đọc bảng FCL_CYCLE_COUNTER',
};

function createJsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

describe('NineRouterQueryPlanner (D-11..D-17)', () => {
  it('throws descriptive error if endpoint, model, or apiKey is missing (D-13, D-14)', () => {
    expect(
      () =>
        new NineRouterQueryPlanner({
          enabled: true,
          endpoint: '',
          model: 'qwen2.5-72b-instruct',
          apiKey: 'key',
          allowedHosts: ['9router.internal.shb.vn'],
        })
    ).toThrow(/Missing endpoint/);

    expect(
      () =>
        new NineRouterQueryPlanner({
          enabled: true,
          endpoint: 'https://9router.internal.shb.vn',
          model: '',
          apiKey: 'key',
          allowedHosts: ['9router.internal.shb.vn'],
        })
    ).toThrow(/Missing.*model/);

    expect(
      () =>
        new NineRouterQueryPlanner({
          enabled: true,
          endpoint: 'https://9router.internal.shb.vn',
          model: 'qwen2.5-72b-instruct',
          apiKey: '',
          allowedHosts: ['9router.internal.shb.vn'],
        })
    ).toThrow(/Missing.*API key/);
  });

  it('rejects invalid or unapproved hosts per D-14', () => {
    expect(
      () =>
        new NineRouterQueryPlanner({
          enabled: true,
          endpoint: 'https://evil.external.com',
          model: 'qwen2.5-72b-instruct',
          apiKey: 'key',
          allowedHosts: ['9router.internal.shb.vn'],
        })
    ).toThrow(/allowed hosts/);
  });

  it('valid completion response parses to QueryPlanResult with type plan and repaired=false (D-11, D-12)', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      createJsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify(validPlanObject),
            },
          },
        ],
      })
    );

    const planner = new NineRouterQueryPlanner(
      {
        enabled: true,
        endpoint: 'https://9router.internal.shb.vn',
        model: 'qwen2.5-72b-instruct',
        apiKey: 'secret-key-123',
        allowedHosts: ['9router.internal.shb.vn'],
      },
      mockFetch as unknown as typeof fetch
    );

    const result = await planner.plan(defaultRequest, defaultContext);

    expect(result.type).toBe('plan');
    if (result.type === 'plan') {
      expect(result.repaired).toBe(false);
      expect(result.plan.planId).toBe('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
      expect(result.plan.queryIntent).toBe('LOOKUP');
      expect(result.plan.seedUrns).toEqual([URN_TABLE_FCL_CYCLE_COUNTER]);
    }
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [calledUrl, calledInit] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe('https://9router.internal.shb.vn/v1/chat/completions');
    expect(calledInit.method).toBe('POST');
    expect((calledInit.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer secret-key-123'
    );
  });

  it('sends an exact JSON and intent contract to the model', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      createJsonResponse({ choices: [{ message: { content: JSON.stringify(validPlanObject) } }] })
    );
    const planner = new NineRouterQueryPlanner(
      {
        enabled: true,
        endpoint: 'https://9router.internal.shb.vn',
        model: 'qwen2.5-72b-instruct',
        apiKey: 'secret-key-123',
        allowedHosts: ['9router.internal.shb.vn'],
      },
      mockFetch as unknown as typeof fetch
    );

    await planner.plan(defaultRequest, defaultContext);

    const body = JSON.parse((mockFetch.mock.calls[0]![1] as RequestInit).body as string);
    const prompt = body.messages[0].content as string;
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.stream).toBe(false);
    expect(prompt).toContain('REQUIRED JSON SHAPE:');
    expect(prompt).toContain('Return exactly one complete JSON object');
    expect(prompt).toContain('LOOKUP: entity properties, catalog details, data tables, or calculation cycles');
    expect(prompt).toContain('FLOW_TRAVERSAL: ordered execution steps');
    expect(prompt).toContain('IMPACT_ANALYSIS: upstream/downstream effects');
    expect(prompt).not.toContain('DEPEDENCY_CHECK');
    expect(prompt).toContain('DEPENDENCY_CHECK: whether named entities have a direct dependency');
    expect(prompt).toContain(URN_TABLE_FCL_CYCLE_COUNTER);
    expect(prompt).toContain('READS_FROM: maxHops=');
  });

  it('throws a content-free transport error for HTTP, malformed envelope, and empty response', async () => {
    const config = {
      enabled: true,
      endpoint: 'https://9router.internal.shb.vn',
      model: 'qwen2.5-72b-instruct',
      apiKey: 'secret-key-123',
      allowedHosts: ['9router.internal.shb.vn'],
    } as const;

    for (const response of [
      createJsonResponse({ message: 'secret upstream detail' }, 503),
      { ok: true, status: 200, text: async () => '{broken' },
      createJsonResponse({ choices: [] }),
    ]) {
      const planner = new NineRouterQueryPlanner(
        config,
        vi.fn().mockResolvedValue(response) as unknown as typeof fetch
      );
      await expect(planner.plan(defaultRequest, defaultContext)).rejects.toEqual(
        expect.objectContaining({ name: 'PlannerTransportError', message: 'PLANNER_TRANSPORT_FAILURE' })
      );
    }
  });

  it('maps planner transport failure to deterministic degraded execution instead of UNSUPPORTED', async () => {
    const planner = new NineRouterQueryPlanner(
      {
        enabled: true,
        endpoint: 'https://9router.internal.shb.vn',
        model: 'qwen2.5-72b-instruct',
        apiKey: 'secret-key-123',
        allowedHosts: ['9router.internal.shb.vn'],
      },
      vi.fn().mockRejectedValue(new PlannerTransportError()) as unknown as typeof fetch
    );
    const gateway: GraphRetrievalGateway = {
      resolveEntities: vi.fn().mockResolvedValue([defaultContext.resolvedCandidates[0]]),
      traverse: vi.fn(),
    };

    const outcome = await buildQueryExecutionPlan({
      request: defaultRequest,
      pinnedSnapshotId: 'snapshot-1',
      gateway,
      planner,
    });

    expect(outcome.status).toBe('executable');
    if (outcome.status === 'executable') {
      expect(outcome.isDegraded).toBe(true);
      expect(outcome.planTrace.degradedFallback).toBe(true);
    }
  });

  it('triggers exactly one repair completion call on schema mismatch and succeeds with repaired=true (D-15, D-16)', async () => {
    const invalidPlan = {
      ...validPlanObject,
      queryIntent: 'INVALID_INTENT_NOT_ALLOWED',
    };

    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return createJsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify(invalidPlan),
              },
            },
          ],
        });
      }
      return createJsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify(validPlanObject),
            },
          },
        ],
      });
    });

    const planner = new NineRouterQueryPlanner(
      {
        enabled: true,
        endpoint: 'https://9router.internal.shb.vn',
        model: 'qwen2.5-72b-instruct',
        apiKey: 'secret-key-123',
        allowedHosts: ['9router.internal.shb.vn'],
      },
      mockFetch as unknown as typeof fetch
    );

    const result = await planner.plan(defaultRequest, defaultContext);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.type).toBe('plan');
    if (result.type === 'plan') {
      expect(result.repaired).toBe(true);
      expect(result.plan.queryIntent).toBe('LOOKUP');
    }

    // Verify repair payload carried error string and previous output
    const secondCallInit = mockFetch.mock.calls[1]![1] as RequestInit;
    const body = JSON.parse(secondCallInit.body as string);
    const messages = body.messages as Array<{ role: string; content: string }>;
    expect(messages.length).toBe(4); // system, user (query), assistant (prev), user (repair feedback)
    expect(messages[2]!.content).toContain('INVALID_INTENT_NOT_ALLOWED');
    expect(messages[3]!.content).toContain('queryIntent');
  });

  it('returns unsupported with reason PLANNER_SCHEMA_FAILURE if repair also fails (D-16, D-17)', async () => {
    const invalidPlan = {
      ...validPlanObject,
      seedUrns: ['urn:plannermate:unresolved:unknown:id'], // un-resolved seed violates D-15/D-16
    };

    const mockFetch = vi.fn().mockResolvedValue(
      createJsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify(invalidPlan),
            },
          },
        ],
      })
    );

    const planner = new NineRouterQueryPlanner(
      {
        enabled: true,
        endpoint: 'https://9router.internal.shb.vn',
        model: 'qwen2.5-72b-instruct',
        apiKey: 'secret-key-123',
        allowedHosts: ['9router.internal.shb.vn'],
      },
      mockFetch as unknown as typeof fetch
    );

    const result = await planner.plan(defaultRequest, defaultContext);

    expect(mockFetch).toHaveBeenCalledTimes(2); // Initial + exactly one repair
    expect(result.type).toBe('unsupported');
    if (result.type === 'unsupported') {
      expect(result.reason).toBe('PLANNER_SCHEMA_FAILURE');
      expect(result.unsupportedConstructs.length).toBeGreaterThan(0);
      expect(result.unsupportedConstructs[0]).toContain('not in server-resolved candidate allowlist');
    }
  });

  it('never emits or accepts raw Cypher query strings (D-12, T-19.1-01)', async () => {
    const maliciousPlanWithCypher = {
      ...validPlanObject,
      cypher: 'MATCH (n) DETACH DELETE n',
    };

    const mockFetch = vi.fn().mockResolvedValue(
      createJsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify(maliciousPlanWithCypher),
            },
          },
        ],
      })
    );

    const planner = new NineRouterQueryPlanner(
      {
        enabled: true,
        endpoint: 'https://9router.internal.shb.vn',
        model: 'qwen2.5-72b-instruct',
        apiKey: 'secret-key-123',
        allowedHosts: ['9router.internal.shb.vn'],
      },
      mockFetch as unknown as typeof fetch
    );

    const result = await planner.plan(defaultRequest, defaultContext);

    // Schema is strict; unrecognized extra property `cypher` fails Zod strict validation
    expect(result.type).toBe('unsupported');
    if (result.type === 'unsupported') {
      expect(result.reason).toBe('PLANNER_SCHEMA_FAILURE');
      expect(result.unsupportedConstructs.some((c) => c.includes('Unrecognized key'))).toBe(true);
    }
  });

  it('clamps hops to 1..3 and validates relation types against closed ontology allowlist (D-15, D-16)', async () => {
    const planWithInvalidRelation = {
      ...validPlanObject,
      traversalSteps: [
        {
          relationType: 'UNKNOWN_RELATION_NOT_IN_ONTOLOGY',
          direction: 'OUTGOING',
          maxHops: 5,
        },
      ],
    };

    const mockFetch = vi.fn().mockResolvedValue(
      createJsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify(planWithInvalidRelation),
            },
          },
        ],
      })
    );

    const planner = new NineRouterQueryPlanner(
      {
        enabled: true,
        endpoint: 'https://9router.internal.shb.vn',
        model: 'qwen2.5-72b-instruct',
        apiKey: 'secret-key-123',
        allowedHosts: ['9router.internal.shb.vn'],
      },
      mockFetch as unknown as typeof fetch
    );

    const result = await planner.plan(defaultRequest, defaultContext);
    expect(result.type).toBe('unsupported');
    if (result.type === 'unsupported') {
      expect(result.reason).toBe('PLANNER_SCHEMA_FAILURE');
    }
  });
});
