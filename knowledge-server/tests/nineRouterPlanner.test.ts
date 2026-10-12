import { describe, it, expect, vi } from 'vitest';
import { NineRouterQueryPlanner } from '../src/retrieval/nineRouterQueryPlanner.js';
import type { QueryPlannerContext } from '../src/retrieval/contracts.js';
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
