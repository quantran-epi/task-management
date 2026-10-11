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
    expect(retrieveMock).toHaveBeenCalledWith(SET_ID_1, expect.anything());
    expect(retrieveMock).toHaveBeenCalledWith(SET_ID_2, expect.anything());
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
    expect(retrieveMock).toHaveBeenCalledWith(SET_ID_1, expect.anything());
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
});
