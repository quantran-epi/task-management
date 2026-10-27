/// <reference types="node" />
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { buildKnowledgeServer } from '../src/server.js';
import type {
  RetrievalResponse,
  FederatedRetrievalRequest,
  FederatedRetrievalResponse,
} from '../src/types/retrievalProtocol.js';
import { registerRetrievalRoutes } from '../src/routes/retrieval.js';
import Fastify from 'fastify';

const ORIGIN = 'https://planner.example';
const TOKEN = 'server-test-token-very-secret';
const SET_ID_1 = '00000000-0000-4000-8000-000000000001';
const SET_ID_2 = '00000000-0000-4000-8000-000000000002';
const SET_ID_3 = '00000000-0000-4000-8000-000000000003';
const SET_ID_4 = '00000000-0000-4000-8000-000000000004';

function mockSingleSetResponse(
  snapshotId: string,
  items: any[] = [],
  paths: any[] = [],
  conflictGroups: any[] = []
): RetrievalResponse {
  return {
    outcome: 'READY',
    snapshotId,
    embeddingProvider: {
      provider: 'local-onnx',
      model: 'Xenova/multilingual-e5-small',
      revision: 'v1.0.0',
      dimensions: 384,
      policyVersion: '2026.10.1',
    },
    items,
    paths,
    conflictGroups,
    totalCandidates: items.length,
    modalitiesUsed: ['fulltext'],
    modalityStatus: {
      fulltext: { status: 'ok', latencyMs: 5, itemCount: items.length },
      vector: { status: 'ok', latencyMs: 10, itemCount: 0 },
      graph: { status: 'ok', latencyMs: 15, itemCount: paths.length },
    },
    diagnostics: { degraded: false },
    planTrace: { fastPath: true, degradedFallback: false },
  };
}

function mockChunkItem(id: string, snapshotId: string, score: number = 0.9): any {
  return {
    type: 'chunk',
    id,
    score,
    modalitiesContributed: ['fulltext'],
    sourceDocumentId: randomUUID(),
    sourceDocumentTitle: `Doc ${id}`,
    sectionAnchor: 'intro',
    lineStart: 1,
    lineEnd: 5,
    rawSnippet: `Snippet content for ${id}`,
    publishedContentHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    snapshotId,
    hasConflict: false,
  };
}

function mockEntityItem(id: string, snapshotId: string): any {
  return {
    type: 'entity',
    id,
    score: 1,
    modalitiesContributed: ['graph'],
    urn: id,
    canonicalName: id,
    kind: 'DatabaseObject',
    snapshotId,
    hasConflict: false,
  };
}

describe('Federated Retrieval Route and Orchestration (Task 2)', () => {
  const baseBudgets = {
    concurrency: 2,
    elapsedMs: 2000,
    maxSets: 10,
    maxItems: 20,
    maxEvidenceChars: 10000,
  };

  // Test Case 1: REQUIRED-only path: single set, outcome READY, coverageWarnings empty.
  it('REQUIRED-only path: single set, outcome READY, coverageWarnings empty', async () => {
    const chunk = mockChunkItem('c1', 'gsnap_abcdef12');
    const setResp = mockSingleSetResponse('gsnap_abcdef12', [chunk]);

    const retrieveMock = vi.fn().mockResolvedValue(setResp);
    const app = buildKnowledgeServer({
      token: TOKEN,
      allowedOrigins: [ORIGIN],
      retrievalService: { retrieve: retrieveMock },
    }).app;

    const payload: FederatedRetrievalRequest = {
      query: 'test query',
      setTierAssignments: [
        { setId: SET_ID_1, tier: 'REQUIRED', roleGroup: 'baseline' },
      ],
      comparisonMode: 'single',
      budgets: baseBudgets,
      limit: 20,
      includeInferred: false,
      recentTurns: [],
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/retrieve',
      headers: {
        origin: ORIGIN,
        authorization: `Bearer ${TOKEN}`,
      },
      payload,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as FederatedRetrievalResponse;
    expect(body.outcome).toBe('READY');
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.setId).toBe(SET_ID_1);
    expect(body.items[0]!.snapshotId).toBe('gsnap_abcdef12');
    expect(body.diagnostics.coverageWarnings).toHaveLength(0);
    expect(retrieveMock).toHaveBeenCalledTimes(1);
  });

  // Test Case 2: Progressive expansion: REQUIRED insufficient coverage, LIKELY tier adds items, outcome READY.
  it('Progressive expansion: REQUIRED insufficient coverage, LIKELY tier adds items, outcome READY', async () => {
    // maxItems is 10, so 60% coverage threshold is 6 items.
    // REQUIRED returns 1 item (< 6), so it expands to LIKELY.
    const chunk1 = mockChunkItem('c1', 'gsnap_abcdef12');
    const chunk2 = mockChunkItem('c2', 'gsnap_abcdef34');
    const resp1 = mockSingleSetResponse('gsnap_abcdef12', [chunk1]);
    const resp2 = mockSingleSetResponse('gsnap_abcdef34', [chunk2]);

    const retrieveMock = vi.fn().mockImplementation((setId: string) => {
      if (setId === SET_ID_1) return Promise.resolve(resp1);
      if (setId === SET_ID_2) return Promise.resolve(resp2);
      throw new Error('Unknown setId');
    });

    const app = buildKnowledgeServer({
      token: TOKEN,
      allowedOrigins: [ORIGIN],
      retrievalService: { retrieve: retrieveMock },
    }).app;

    const payload: FederatedRetrievalRequest = {
      query: 'test query',
      setTierAssignments: [
        { setId: SET_ID_1, tier: 'REQUIRED', roleGroup: 'baseline' },
        { setId: SET_ID_2, tier: 'LIKELY', roleGroup: 'scope_diff' },
      ],
      comparisonMode: 'single',
      budgets: { ...baseBudgets, maxItems: 10 },
      limit: 20,
      includeInferred: false,
      recentTurns: [],
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/retrieve',
      headers: {
        origin: ORIGIN,
        authorization: `Bearer ${TOKEN}`,
      },
      payload,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as FederatedRetrievalResponse;
    expect(body.outcome).toBe('READY');
    expect(body.items).toHaveLength(2);
    expect(retrieveMock).toHaveBeenCalledWith(SET_ID_1, expect.anything(), expect.anything());
    expect(retrieveMock).toHaveBeenCalledWith(SET_ID_2, expect.anything(), expect.anything());
  });

  // Test Case 3: Partial failure: 2 REQUIRED sets, 1 rejects, outcome DEGRADED, coverageWarnings[0].setId matches rejected set.
  it('Partial failure: 2 REQUIRED sets, 1 rejects, outcome DEGRADED, coverageWarnings[0].setId matches rejected set', async () => {
    const chunk1 = mockChunkItem('c1', 'gsnap_abcdef12');
    const resp1 = mockSingleSetResponse('gsnap_abcdef12', [chunk1]);

    const retrieveMock = vi.fn().mockImplementation((setId: string) => {
      if (setId === SET_ID_1) return Promise.resolve(resp1);
      if (setId === SET_ID_2) return Promise.reject(new Error('Internal database error'));
      throw new Error('Unknown setId');
    });

    const app = buildKnowledgeServer({
      token: TOKEN,
      allowedOrigins: [ORIGIN],
      retrievalService: { retrieve: retrieveMock },
    }).app;

    const payload: FederatedRetrievalRequest = {
      query: 'test query',
      setTierAssignments: [
        { setId: SET_ID_1, tier: 'REQUIRED', roleGroup: 'baseline' },
        { setId: SET_ID_2, tier: 'REQUIRED', roleGroup: 'scope_diff' },
      ],
      comparisonMode: 'single',
      budgets: baseBudgets,
      limit: 20,
      includeInferred: false,
      recentTurns: [],
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/retrieve',
      headers: {
        origin: ORIGIN,
        authorization: `Bearer ${TOKEN}`,
      },
      payload,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as FederatedRetrievalResponse;
    expect(body.outcome).toBe('DEGRADED');
    expect(body.diagnostics.degraded).toBe(true);
    expect(body.items).toHaveLength(1);
    expect(body.diagnostics.coverageWarnings).toHaveLength(1);
    expect(body.diagnostics.coverageWarnings[0]!.setId).toBe(SET_ID_2);
    expect(body.diagnostics.coverageWarnings[0]!.code).toBe('ERROR');
  });

  // Test Case 4: Snapshot isolation: response items retain distinct snapshotId per setId; test asserts cross-set snapshotId never shared.
  it('Snapshot isolation: response items retain distinct snapshotId per setId', async () => {
    const chunk1 = mockChunkItem('c1', 'gsnap_11111111');
    const chunk2 = mockChunkItem('c2', 'gsnap_22222222');
    const resp1 = mockSingleSetResponse('gsnap_11111111', [chunk1]);
    const resp2 = mockSingleSetResponse('gsnap_22222222', [chunk2]);

    const retrieveMock = vi.fn().mockImplementation((setId: string) => {
      if (setId === SET_ID_1) return Promise.resolve(resp1);
      if (setId === SET_ID_2) return Promise.resolve(resp2);
      throw new Error('Unknown setId');
    });

    const app = buildKnowledgeServer({
      token: TOKEN,
      allowedOrigins: [ORIGIN],
      retrievalService: { retrieve: retrieveMock },
    }).app;

    const payload: FederatedRetrievalRequest = {
      query: 'test query',
      setTierAssignments: [
        { setId: SET_ID_1, tier: 'REQUIRED', roleGroup: 'baseline' },
        { setId: SET_ID_2, tier: 'REQUIRED', roleGroup: 'scope_diff' },
      ],
      comparisonMode: 'baseline_vs_scope',
      budgets: baseBudgets,
      limit: 20,
      includeInferred: false,
      recentTurns: [],
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/retrieve',
      headers: {
        origin: ORIGIN,
        authorization: `Bearer ${TOKEN}`,
      },
      payload,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as FederatedRetrievalResponse;
    const item1 = body.items.find((i) => i.setId === SET_ID_1);
    const item2 = body.items.find((i) => i.setId === SET_ID_2);
    expect(item1).toBeDefined();
    expect(item2).toBeDefined();
    expect(item1!.snapshotId).toBe('gsnap_11111111');
    expect(item2!.snapshotId).toBe('gsnap_22222222');
    expect(item1!.snapshotId).not.toBe(item2!.snapshotId);
  });

  // Test Case 5: Role-group ranking: baseline items appear before scope_diff items in items[].
  it('Role-group ranking: baseline items appear before scope_diff items in items[]', async () => {
    const chunkDiff = mockChunkItem('cdiff', 'gsnap_22222222', 0.99); // higher score
    const chunkBase = mockChunkItem('cbase', 'gsnap_11111111', 0.10); // lower score
    const respBase = mockSingleSetResponse('gsnap_11111111', [chunkBase]);
    const respDiff = mockSingleSetResponse('gsnap_22222222', [chunkDiff]);

    const retrieveMock = vi.fn().mockImplementation((setId: string) => {
      if (setId === SET_ID_1) return Promise.resolve(respBase);
      if (setId === SET_ID_2) return Promise.resolve(respDiff);
      throw new Error('Unknown setId');
    });

    const app = buildKnowledgeServer({
      token: TOKEN,
      allowedOrigins: [ORIGIN],
      retrievalService: { retrieve: retrieveMock },
    }).app;

    const payload: FederatedRetrievalRequest = {
      query: 'test query',
      setTierAssignments: [
        { setId: SET_ID_2, tier: 'REQUIRED', roleGroup: 'scope_diff' },
        { setId: SET_ID_1, tier: 'REQUIRED', roleGroup: 'baseline' },
      ],
      comparisonMode: 'baseline_vs_scope',
      budgets: baseBudgets,
      limit: 20,
      includeInferred: false,
      recentTurns: [],
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/retrieve',
      headers: {
        origin: ORIGIN,
        authorization: `Bearer ${TOKEN}`,
      },
      payload,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as FederatedRetrievalResponse;
    expect(body.items).toHaveLength(2);
    expect(body.items[0]!.roleGroup).toBe('baseline');
    expect(body.items[0]!.setId).toBe(SET_ID_1);
    expect(body.items[1]!.roleGroup).toBe('scope_diff');
    expect(body.items[1]!.setId).toBe(SET_ID_2);
  });

  // Test Case 6: Budget stop: maxSets=1, 3 REQUIRED sets requested — only first processed, coverageWarnings names BUDGET_SETS.
  it('Budget stop: maxSets=1, 3 REQUIRED sets requested — only first processed, coverageWarnings names BUDGET_SETS', async () => {
    const chunk1 = mockChunkItem('c1', 'gsnap_11111111');
    const resp1 = mockSingleSetResponse('gsnap_11111111', [chunk1]);

    const retrieveMock = vi.fn().mockResolvedValue(resp1);
    const app = buildKnowledgeServer({
      token: TOKEN,
      allowedOrigins: [ORIGIN],
      retrievalService: { retrieve: retrieveMock },
    }).app;

    const payload: FederatedRetrievalRequest = {
      query: 'test query',
      setTierAssignments: [
        { setId: SET_ID_1, tier: 'REQUIRED', roleGroup: 'baseline' },
        { setId: SET_ID_2, tier: 'REQUIRED', roleGroup: 'scope_diff' },
        { setId: SET_ID_3, tier: 'REQUIRED', roleGroup: 'scope_diff' },
      ],
      comparisonMode: 'baseline_vs_scope',
      budgets: { ...baseBudgets, maxSets: 1 },
      limit: 20,
      includeInferred: false,
      recentTurns: [],
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/retrieve',
      headers: {
        origin: ORIGIN,
        authorization: `Bearer ${TOKEN}`,
      },
      payload,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as FederatedRetrievalResponse;
    expect(body.outcome).toBe('DEGRADED');
    expect(body.diagnostics.degraded).toBe(true);
    expect(retrieveMock).toHaveBeenCalledTimes(1);
    expect(retrieveMock).toHaveBeenCalledWith(SET_ID_1, expect.anything(), expect.anything());
    expect(body.diagnostics.coverageWarnings.some((w) => w.code === 'BUDGET_SETS')).toBe(true);
  });

  // Test Case 7: Request body missing setTierAssignments fails with 400 and safe error.
  it('Request body missing setTierAssignments fails with 400', async () => {
    const retrieveMock = vi.fn();
    const app = buildKnowledgeServer({
      token: TOKEN,
      allowedOrigins: [ORIGIN],
      retrievalService: { retrieve: retrieveMock },
    }).app;

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/retrieve',
      headers: {
        origin: ORIGIN,
        authorization: `Bearer ${TOKEN}`,
      },
      payload: {
        query: 'test query',
        // missing setTierAssignments
        budgets: baseBudgets,
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: { code: 'INVALID_REQUEST', message: 'Request could not be processed.' },
    });
    expect(retrieveMock).not.toHaveBeenCalled();
  });

  // Test Case 8: Auth header missing fails with 401 (reuse existing preHandler behavior).
  it('Auth header missing fails with 401', async () => {
    const retrieveMock = vi.fn();
    const app = buildKnowledgeServer({
      token: TOKEN,
      allowedOrigins: [ORIGIN],
      retrievalService: { retrieve: retrieveMock },
    }).app;

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/retrieve',
      headers: {
        origin: ORIGIN,
        // missing authorization header
      },
      payload: {
        query: 'test query',
        setTierAssignments: [
          { setId: SET_ID_1, tier: 'REQUIRED', roleGroup: 'baseline' },
        ],
        comparisonMode: 'single',
        budgets: baseBudgets,
      },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Valid bearer authorization is required.' },
    });
    expect(retrieveMock).not.toHaveBeenCalled();
  });

  it('allows REQUIRED retrieval to use the remaining global deadline', async () => {
    vi.useFakeTimers();
    try {
      const response = mockSingleSetResponse('gsnap_abcdef12', [
        mockChunkItem('c1', 'gsnap_abcdef12'),
      ]);
      const retrieveMock = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(response), 70))
      );
      const app = buildKnowledgeServer({
        token: TOKEN,
        allowedOrigins: [ORIGIN],
        retrievalService: { retrieve: retrieveMock },
      }).app;

      const responsePromise = app.inject({
        method: 'POST',
        url: '/api/v1/retrieve',
        headers: {
          origin: ORIGIN,
          authorization: `Bearer ${TOKEN}`,
        },
        payload: {
          query: 'slow but within budget',
          setTierAssignments: [
            { setId: SET_ID_1, tier: 'REQUIRED', roleGroup: 'baseline' },
          ],
          comparisonMode: 'single',
          budgets: { ...baseBudgets, elapsedMs: 100 },
        },
      });
      await vi.advanceTimersByTimeAsync(70);
      const res = await responsePromise;

      expect(res.statusCode).toBe(200);
      const body = res.json() as FederatedRetrievalResponse;
      expect(body.outcome).toBe('READY');
      expect(body.items).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('marks all modalities as timeout when every set times out', async () => {
    // The route adapter forwards { signal }, so the abort handle is on the third arg's .signal.
    const retrieveMock = vi.fn().mockImplementation(
      (_setId: string, _request: unknown, opts?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          opts?.signal?.addEventListener('abort', () => reject(new DOMException('Timed out', 'AbortError')));
        })
    );
    const app = buildKnowledgeServer({
      token: TOKEN,
      allowedOrigins: [ORIGIN],
      retrievalService: { retrieve: retrieveMock },
    }).app;

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/retrieve',
      headers: {
        origin: ORIGIN,
        authorization: `Bearer ${TOKEN}`,
      },
      payload: {
        query: 'slow query',
        setTierAssignments: [
          { setId: SET_ID_1, tier: 'REQUIRED', roleGroup: 'baseline' },
        ],
        comparisonMode: 'single',
        budgets: { ...baseBudgets, elapsedMs: 100 },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as FederatedRetrievalResponse;
    expect(body.outcome).toBe('DEGRADED');
    expect(body.items).toHaveLength(0);
    expect(body.modalityStatus.fulltext.status).toBe('timeout');
    expect(body.modalityStatus.vector.status).toBe('timeout');
    expect(body.modalityStatus.graph.status).toBe('timeout');
    expect(body.diagnostics.coverageWarnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'TIMEOUT', setId: SET_ID_1 })])
    );
  });
});

describe('Federated aggregation: counts, severity, stages, seeds (24-03)', () => {
  const URN_A = 'urn:plannermate:test:Entity:A';
  const URN_B = 'urn:plannermate:test:Entity:B';
  const URN_C = 'urn:plannermate:test:Entity:C';
  const URN_DUP = 'urn:plannermate:test:Entity:DUP';
  const FACT_1 = 'a'.repeat(64);
  const FACT_DUP = 'b'.repeat(64);
  const budgets = {
    concurrency: 2,
    elapsedMs: 2000,
    maxSets: 10,
    maxItems: 20,
    maxEvidenceChars: 10000,
  };

  const entityItem = (urn: string, snapshotId: string): any => ({
    type: 'entity',
    id: urn,
    score: 1,
    modalitiesContributed: ['graph'],
    urn,
    canonicalName: urn,
    kind: 'DatabaseObject',
    snapshotId,
    hasConflict: false,
  });

  const edgeItem = (factKey: string, snapshotId: string, source: string, target: string): any => ({
    type: 'edge',
    id: factKey,
    score: 1,
    modalitiesContributed: ['graph'],
    factKey,
    sourceUrn: source,
    relationType: 'READS_FROM',
    targetUrn: target,
    evidenceClass: 'OBSERVED',
    supportingChunkIds: [],
    snapshotId,
    hasConflict: false,
  });

  const graphPath = (pathId: string, snapshotId: string, nodeUrns: string[], factKeys: string[]): any => ({
    pathId,
    snapshotId,
    nodeUrns,
    edgeFactKeys: factKeys,
    hopClassifications: factKeys.map(() => 'OBSERVED'),
    hopCitationIds: factKeys.map((key) => [`chunk-${key}`]),
    hasConflict: false,
    classification: 'OBSERVED',
  });

  const setResponse = (overrides: Partial<RetrievalResponse> & { snapshotId: string }): RetrievalResponse => ({
    outcome: 'READY',
    embeddingProvider: {
      provider: 'local-onnx',
      model: 'Xenova/multilingual-e5-small',
      revision: 'v1.0.0',
      dimensions: 384,
      policyVersion: '2026.10.1',
    },
    items: [],
    paths: [],
    conflictGroups: [],
    totalCandidates: 0,
    modalitiesUsed: ['graph'],
    modalityStatus: {
      fulltext: { status: 'ok', latencyMs: 5, itemCount: 0 },
      vector: { status: 'ok', latencyMs: 5, itemCount: 0 },
      graph: {
        status: 'ok',
        latencyMs: 5,
        itemCount: 0,
        entityCount: 0,
        edgeCount: 0,
        pathCount: 0,
      },
    },
    diagnostics: { degraded: false },
    planTrace: { fastPath: true, degradedFallback: false },
    ...overrides,
  } as RetrievalResponse);

  const runFederation = async (
    responses: Record<string, RetrievalResponse>,
    assignments = [
      { setId: SET_ID_1, tier: 'REQUIRED' as const, roleGroup: 'baseline' as const },
      { setId: SET_ID_2, tier: 'REQUIRED' as const, roleGroup: 'scope_diff' as const },
    ]
  ) => {
    const retrieveMock = vi.fn().mockImplementation((setId: string) => {
      const response = responses[setId];
      if (!response) throw new Error('Unknown setId');
      return Promise.resolve(response);
    });
    const app = buildKnowledgeServer({
      token: TOKEN,
      allowedOrigins: [ORIGIN],
      retrievalService: { retrieve: retrieveMock },
    }).app;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/retrieve',
      headers: { origin: ORIGIN, authorization: `Bearer ${TOKEN}` },
      payload: {
        query: 'graph query',
        setTierAssignments: assignments,
        comparisonMode: 'baseline_vs_scope',
        budgets,
      },
    });
    expect(res.statusCode).toBe(200);
    return res.json() as FederatedRetrievalResponse;
  };

  it('sums distinct retained graph identities across sets', async () => {
    const body = await runFederation({
      [SET_ID_1]: setResponse({
        snapshotId: 'gsnap_11111111',
        items: [entityItem(URN_A, 'gsnap_11111111')],
        modalityStatus: {
          fulltext: { status: 'ok', latencyMs: 1, itemCount: 0 },
          vector: { status: 'ok', latencyMs: 1, itemCount: 0 },
          graph: { status: 'ok', latencyMs: 1, itemCount: 1, entityCount: 1, edgeCount: 0, pathCount: 0 },
        },
      }),
      [SET_ID_2]: setResponse({
        snapshotId: 'gsnap_22222222',
        items: [
          entityItem(URN_B, 'gsnap_22222222'),
          entityItem(URN_C, 'gsnap_22222222'),
          edgeItem(FACT_1, 'gsnap_22222222', URN_B, URN_C),
        ],
        modalityStatus: {
          fulltext: { status: 'ok', latencyMs: 1, itemCount: 0 },
          vector: { status: 'ok', latencyMs: 1, itemCount: 0 },
          graph: { status: 'ok', latencyMs: 1, itemCount: 3, entityCount: 2, edgeCount: 1, pathCount: 0 },
        },
      }),
    });

    expect(body.modalityStatus.graph.entityCount).toBe(3);
    expect(body.modalityStatus.graph.edgeCount).toBe(1);
    expect(body.modalityStatus.graph.pathCount).toBe(0);
  });

  it('retains duplicate graph identities exactly once across sets', async () => {
    const snapshotId = 'gsnap_11111111';
    const duplicate = {
      items: [
        entityItem(URN_DUP, snapshotId),
        edgeItem(FACT_DUP, snapshotId, URN_DUP, URN_DUP),
      ],
      paths: [graphPath('P1', snapshotId, [URN_DUP, URN_DUP], [FACT_DUP])],
    };
    const body = await runFederation({
      [SET_ID_1]: setResponse({
        snapshotId,
        ...duplicate,
        modalityStatus: {
          fulltext: { status: 'ok', latencyMs: 1, itemCount: 0 },
          vector: { status: 'ok', latencyMs: 1, itemCount: 0 },
          graph: { status: 'ok', latencyMs: 1, itemCount: 2, entityCount: 1, edgeCount: 1, pathCount: 1 },
        },
      }),
      [SET_ID_2]: setResponse({
        snapshotId,
        ...duplicate,
        modalityStatus: {
          fulltext: { status: 'ok', latencyMs: 1, itemCount: 0 },
          vector: { status: 'ok', latencyMs: 1, itemCount: 0 },
          graph: { status: 'ok', latencyMs: 1, itemCount: 2, entityCount: 1, edgeCount: 1, pathCount: 1 },
        },
      }),
    });

    expect(body.modalityStatus.graph.entityCount).toBe(1);
    expect(body.modalityStatus.graph.edgeCount).toBe(1);
    expect(body.modalityStatus.graph.pathCount).toBe(1);
    expect(body.items).toHaveLength(2);
  });

  it('never lets a later ok overwrite an earlier timeout', async () => {
    const body = await runFederation({
      [SET_ID_1]: setResponse({
        snapshotId: 'gsnap_11111111',
        items: [entityItem(URN_A, 'gsnap_11111111')],
        modalityStatus: {
          fulltext: { status: 'timeout', latencyMs: 1, itemCount: 0, reason: 'TIMEOUT' },
          vector: { status: 'ok', latencyMs: 1, itemCount: 0 },
          graph: { status: 'ok', latencyMs: 1, itemCount: 1, entityCount: 1, edgeCount: 0, pathCount: 0 },
        },
      }),
      [SET_ID_2]: setResponse({
        snapshotId: 'gsnap_22222222',
        items: [entityItem(URN_B, 'gsnap_22222222')],
        modalityStatus: {
          fulltext: { status: 'ok', latencyMs: 1, itemCount: 0 },
          vector: { status: 'ok', latencyMs: 1, itemCount: 0 },
          graph: { status: 'ok', latencyMs: 1, itemCount: 1, entityCount: 1, edgeCount: 0, pathCount: 0 },
        },
      }),
    });

    expect(body.modalityStatus.fulltext.status).toBe('timeout');
    expect(body.outcome).toBe('DEGRADED');
  });

  it('yields SEED_ONLY when every set is seed-only and READY when mixed with graph evidence', async () => {
    const seedOnly = (snapshotId: string) =>
      setResponse({
        snapshotId,
        outcome: 'SEED_ONLY',
        reason: 'SEED_FOUND_NO_RELATION',
        items: [entityItem(`urn:plannermate:test:Entity:seed-${snapshotId.replace(/[^a-z0-9]/g,'')}`, snapshotId)],
        modalityStatus: {
          fulltext: { status: 'ok', latencyMs: 1, itemCount: 0 },
          vector: { status: 'ok', latencyMs: 1, itemCount: 0 },
          graph: { status: 'ok', latencyMs: 1, itemCount: 1, entityCount: 1, edgeCount: 0, pathCount: 0 },
        },
      });

    const allSeed = await runFederation({
      [SET_ID_1]: seedOnly('gsnap_11111111'),
      [SET_ID_2]: seedOnly('gsnap_22222222'),
    });
    expect(allSeed.outcome).toBe('SEED_ONLY');
    expect(allSeed.items.some((i) => i.item.type === 'entity')).toBe(true);

    const mixed = await runFederation({
      [SET_ID_1]: seedOnly('gsnap_11111111'),
      [SET_ID_2]: setResponse({
        snapshotId: 'gsnap_22222222',
        items: [
          entityItem(URN_B, 'gsnap_22222222'),
          edgeItem(FACT_1, 'gsnap_22222222', URN_B, URN_B),
        ],
        modalityStatus: {
          fulltext: { status: 'ok', latencyMs: 1, itemCount: 0 },
          vector: { status: 'ok', latencyMs: 1, itemCount: 0 },
          graph: { status: 'ok', latencyMs: 1, itemCount: 2, entityCount: 1, edgeCount: 1, pathCount: 0 },
        },
      }),
    });
    expect(mixed.outcome).toBe('READY');
    expect(mixed.items.some((i) => i.item.type === 'entity')).toBe(true);
  });

  it('yields NO_EVIDENCE when all sets are empty', async () => {
    const empty = (snapshotId: string) => setResponse({ snapshotId, outcome: 'NO_EVIDENCE', reason: 'NO_MATCHING_EVIDENCE', suggestedRefinements: ['broaden'] });
    const body = await runFederation({
      [SET_ID_1]: empty('gsnap_11111111'),
      [SET_ID_2]: empty('gsnap_22222222'),
    });
    expect(body.outcome).toBe('NO_EVIDENCE');
  });

  it('merges, dedupes, and caps failedSeeds at 5', async () => {
    const seeds = (prefix: string) =>
      Array.from({ length: 4 }, (_, i) => ({ urn: `urn:plannermate:test:Entity:${prefix}${i}`, reasonCode: 'SEED_NOT_FOUND' as const }));
    const body = await runFederation({
      [SET_ID_1]: setResponse({
        snapshotId: 'gsnap_11111111',
        diagnostics: { degraded: false, failedSeeds: seeds('x').slice(0, 3) },
      }),
      [SET_ID_2]: setResponse({
        snapshotId: 'gsnap_22222222',
        diagnostics: { degraded: false, failedSeeds: [seeds('x')[0]!, ...seeds('y')] },
      }),
    });

    const failed = body.diagnostics.failedSeeds ?? [];
    expect(failed.length).toBeLessThanOrEqual(5);
    expect(new Set(failed.map((s) => `${s.urn}|${s.reasonCode}`)).size).toBe(failed.length);
  });

  it('preserves stage truncation and fallback flags across sets and has no free text', async () => {
    const stageRow = (overrides: Record<string, unknown>) => ({
      stage: 'neo4j_traversal',
      status: 'ok',
      latencyMs: 4,
      accepted: 2,
      rejected: 0,
      truncated: false,
      fallback: false,
      reasonCodes: [],
      ...overrides,
    });

    const body = await runFederation({
      [SET_ID_1]: setResponse({
        snapshotId: 'gsnap_11111111',
        diagnostics: {
          degraded: false,
          stageDiagnostics: [
            stageRow({ truncated: true, status: 'truncated' }) as any,
            stageRow({ stage: 'planning', fallback: true, fallbackReason: 'FALLBACK_ONE_HOP', status: 'truncated' }) as any,
          ],
        },
      }),
      [SET_ID_2]: setResponse({
        snapshotId: 'gsnap_22222222',
        diagnostics: {
          degraded: false,
          stageDiagnostics: [stageRow({}) as any],
        },
      }),
    });

    const stages = body.diagnostics.stageDiagnostics ?? [];
    expect(stages.some((row) => row.truncated === true)).toBe(true);
    expect(
      stages.some((row) => row.fallback === true && row.fallbackReason === 'FALLBACK_ONE_HOP')
    ).toBe(true);
    expect(stages.length).toBeLessThanOrEqual(20);
    const serialized = JSON.stringify(body.diagnostics);
    expect(serialized).not.toContain('"message"');
  });
});

describe('Federated budget accounting (261027-htc)', () => {
  const accountingBudgets = {
    concurrency: 4,
    elapsedMs: 2000,
    maxSets: 10,
    maxItems: 50,
    maxEvidenceChars: 10000,
  };

  const injectFederation = async (
    responses: Record<string, RetrievalResponse>,
    assignments: FederatedRetrievalRequest['setTierAssignments'],
    budgets = accountingBudgets
  ) => {
    const retrieveMock = vi.fn().mockImplementation((setId: string) => {
      const response = responses[setId];
      if (!response) return Promise.reject(new Error('Unknown setId'));
      return Promise.resolve(response);
    });
    const app = buildKnowledgeServer({
      token: TOKEN,
      allowedOrigins: [ORIGIN],
      retrievalService: { retrieve: retrieveMock },
    }).app;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/retrieve',
      headers: { origin: ORIGIN, authorization: `Bearer ${TOKEN}` },
      payload: {
        query: 'budget accounting query',
        setTierAssignments: assignments,
        comparisonMode: 'single',
        budgets,
        limit: 20,
        includeInferred: false,
        recentTurns: [],
      },
    });
    expect(res.statusCode).toBe(200);
    return { body: res.json() as FederatedRetrievalResponse, retrieveMock };
  };

  const sharedEntities = (snapshotId: string) =>
    Array.from({ length: 20 }, (_, i) =>
      mockEntityItem(`urn:plannermate:test:Entity:E${i}`, snapshotId)
    );

  it('does not charge duplicate graph identities to the item budget (no false BUDGET_ITEMS)', async () => {
    const assignments: FederatedRetrievalRequest['setTierAssignments'] = [
      { setId: SET_ID_1, tier: 'REQUIRED', roleGroup: 'baseline' },
      { setId: SET_ID_2, tier: 'REQUIRED', roleGroup: 'baseline' },
      { setId: SET_ID_3, tier: 'REQUIRED', roleGroup: 'baseline' },
      { setId: SET_ID_4, tier: 'REQUIRED', roleGroup: 'baseline' },
    ];
    const snapId = 'gsnap_11111111';
    const responses: Record<string, RetrievalResponse> = {
      [SET_ID_1]: mockSingleSetResponse(snapId, [
        ...sharedEntities(snapId),
        mockChunkItem('c-set-1', snapId),
      ]),
      [SET_ID_2]: mockSingleSetResponse(snapId, [
        ...sharedEntities(snapId),
        mockChunkItem('c-set-2', snapId),
      ]),
      [SET_ID_3]: mockSingleSetResponse(snapId, [
        ...sharedEntities(snapId),
        mockChunkItem('c-set-3', snapId),
      ]),
      [SET_ID_4]: mockSingleSetResponse(snapId, [
        ...sharedEntities(snapId),
        mockChunkItem('c-set-4', snapId),
      ]),
    };

    const { body, retrieveMock } = await injectFederation(responses, assignments);

    expect(retrieveMock).toHaveBeenCalledTimes(4);
    expect(body.items).toHaveLength(24);
    expect(body.diagnostics.coverageWarnings).toHaveLength(0);
    expect(body.outcome).toBe('READY');
  });

  it('admits distinct LIKELY evidence when packed survivors are below the coverage threshold', async () => {
    const snapId = 'gsnap_11111111';
    const distinctChunks = (prefix: string) =>
      Array.from({ length: 20 }, (_, i) =>
        mockChunkItem(`${prefix}-c${i}`, snapId)
      );

    const treatmentAssignments: FederatedRetrievalRequest['setTierAssignments'] = [
      { setId: SET_ID_1, tier: 'REQUIRED', roleGroup: 'baseline' },
      { setId: SET_ID_2, tier: 'REQUIRED', roleGroup: 'baseline' },
      { setId: SET_ID_3, tier: 'LIKELY', roleGroup: 'baseline' },
      { setId: SET_ID_4, tier: 'LIKELY', roleGroup: 'baseline' },
    ];
    const responses: Record<string, RetrievalResponse> = {
      [SET_ID_1]: mockSingleSetResponse(snapId, sharedEntities(snapId)),
      [SET_ID_2]: mockSingleSetResponse(snapId, sharedEntities(snapId)),
      [SET_ID_3]: mockSingleSetResponse(snapId, distinctChunks('s3')),
      [SET_ID_4]: mockSingleSetResponse(snapId, distinctChunks('s4')),
    };

    const treatment = await injectFederation(responses, treatmentAssignments);
    const control = await injectFederation(responses, [
      { setId: SET_ID_1, tier: 'REQUIRED', roleGroup: 'baseline' },
    ]);

    expect(control.body.items).toHaveLength(20);
    expect(treatment.body.items).toHaveLength(50);
    expect(treatment.body.items.length).toBeGreaterThan(control.body.items.length);
    const retrievedSetIds = treatment.retrieveMock.mock.calls.map((call) => call[0]);
    expect(retrievedSetIds).toEqual(expect.arrayContaining([SET_ID_3, SET_ID_4]));
  });
});
