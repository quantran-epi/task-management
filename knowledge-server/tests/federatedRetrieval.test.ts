/// <reference types="node" />
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { buildKnowledgeServer } from '../src/server.js';
import {
  runFederatedRetrieval,
  type FederatedRetrievalOptions,
} from '../src/services/federatedRetrievalService.js';
import type {
  RetrievalResponse,
  FederatedRetrievalRequest,
  FederatedRetrievalResponse,
  ResolvedFederatedRetrievalRequest,
} from '../src/types/retrievalProtocol.js';
import { registerRetrievalRoutes } from '../src/routes/retrieval.js';
import Fastify from 'fastify';

const ORIGIN = 'https://planner.example';
const TOKEN = 'server-test-token-very-secret';
const SET_ID_1 = '00000000-0000-4000-8000-000000000001';
const SET_ID_2 = '00000000-0000-4000-8000-000000000002';
const SET_ID_3 = '00000000-0000-4000-8000-000000000003';
const SET_ID_4 = '00000000-0000-4000-8000-000000000004';

const SNAP_1 = 'gsnap_11111111';
const SNAP_2 = 'gsnap_22222222';
const SNAP_3 = 'gsnap_33333333';

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

/**
 * 28-01 narrowed the wire to {query, limit?, setIds?}. Orchestration tests
 * call the fan-out with the resolved internal contract directly; the
 * resolver-sourced snapshot map is supplied explicitly in fixtures.
 */
function resolveDirect(
  payload: {
    query: string;
    setTierAssignments: ResolvedFederatedRetrievalRequest['setTierAssignments'];
    comparisonMode: ResolvedFederatedRetrievalRequest['comparisonMode'];
    budgets: ResolvedFederatedRetrievalRequest['budgets'];
    limit?: number;
    includeInferred?: boolean;
    recentTurns?: ResolvedFederatedRetrievalRequest['recentTurns'];
    publishedSnapshotIdBySet?: Record<string, string>;
  }
): ResolvedFederatedRetrievalRequest {
  return {
    query: payload.query,
    setTierAssignments: payload.setTierAssignments,
    comparisonMode: payload.comparisonMode,
    budgets: payload.budgets,
    limit: payload.limit ?? 20,
    includeInferred: payload.includeInferred ?? false,
    recentTurns: payload.recentTurns ?? [],
    ...(payload.publishedSnapshotIdBySet ? { publishedSnapshotIdBySet: payload.publishedSnapshotIdBySet } : {}),
  } as unknown as ResolvedFederatedRetrievalRequest;
}

async function runDirect(
  payload: Parameters<typeof resolveDirect>[0],
  retrieveMock: ReturnType<typeof vi.fn>,
  options?: FederatedRetrievalOptions
): Promise<FederatedRetrievalResponse> {
  return runFederatedRetrieval(
    resolveDirect(payload),
    { retrievePerSet: retrieveMock },
    options
  );
}

const baseBudgets = {
  concurrency: 2,
  elapsedMs: 2000,
  maxSets: 10,
  maxItems: 20,
  maxEvidenceChars: 10000,
};

describe('Federated Retrieval orchestration (migrated to resolved contract)', () => {
  it('REQUIRED-only path: single set, outcome READY, coverageWarnings empty', async () => {
    const chunk = mockChunkItem('c1', SNAP_1);
    const setResp = mockSingleSetResponse(SNAP_1, [chunk]);
    const retrieveMock = vi.fn().mockResolvedValue(setResp);

    const body = await runDirect(
      {
        query: 'test query',
        setTierAssignments: [{ setId: SET_ID_1, tier: 'REQUIRED', roleGroup: 'baseline' }],
        comparisonMode: 'single',
        budgets: baseBudgets,
        publishedSnapshotIdBySet: { [SET_ID_1]: SNAP_1 },
      },
      retrieveMock
    );

    expect(body.outcome).toBe('READY');
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.setId).toBe(SET_ID_1);
    expect(body.items[0]!.snapshotId).toBe(SNAP_1);
    expect(body.diagnostics.coverageWarnings).toHaveLength(0);
    expect(retrieveMock).toHaveBeenCalledTimes(1);
  });

  it('Progressive expansion: REQUIRED insufficient coverage, LIKELY tier adds items, outcome READY', async () => {
    const resp1 = mockSingleSetResponse(SNAP_1, [mockChunkItem('c1', SNAP_1)]);
    const resp2 = mockSingleSetResponse(SNAP_2, [mockChunkItem('c2', SNAP_2)]);
    const retrieveMock = vi.fn().mockImplementation((setId: string) => {
      if (setId === SET_ID_1) return Promise.resolve(resp1);
      if (setId === SET_ID_2) return Promise.resolve(resp2);
      throw new Error('Unknown setId');
    });

    const body = await runDirect(
      {
        query: 'test query',
        setTierAssignments: [
          { setId: SET_ID_1, tier: 'REQUIRED', roleGroup: 'baseline' },
          { setId: SET_ID_2, tier: 'LIKELY', roleGroup: 'scope_diff' },
        ],
        comparisonMode: 'single',
        budgets: { ...baseBudgets, maxItems: 10 },
      },
      retrieveMock
    );

    expect(body.outcome).toBe('READY');
    expect(body.items).toHaveLength(2);
    expect(retrieveMock).toHaveBeenCalledWith(SET_ID_1, expect.anything(), expect.anything());
    expect(retrieveMock).toHaveBeenCalledWith(SET_ID_2, expect.anything(), expect.anything());
  });

  it('Partial failure: 2 REQUIRED sets, 1 rejects, outcome DEGRADED, coverageWarnings[0].setId matches rejected set', async () => {
    const resp1 = mockSingleSetResponse(SNAP_1, [mockChunkItem('c1', SNAP_1)]);
    const retrieveMock = vi.fn().mockImplementation((setId: string) => {
      if (setId === SET_ID_1) return Promise.resolve(resp1);
      if (setId === SET_ID_2) return Promise.reject(new Error('Internal database error'));
      throw new Error('Unknown setId');
    });

    const body = await runDirect(
      {
        query: 'test query',
        setTierAssignments: [
          { setId: SET_ID_1, tier: 'REQUIRED', roleGroup: 'baseline' },
          { setId: SET_ID_2, tier: 'REQUIRED', roleGroup: 'scope_diff' },
        ],
        comparisonMode: 'single',
        budgets: baseBudgets,
      },
      retrieveMock
    );

    expect(body.outcome).toBe('DEGRADED');
    expect(body.diagnostics.degraded).toBe(true);
    expect(body.items).toHaveLength(1);
    expect(body.diagnostics.coverageWarnings).toHaveLength(1);
    expect(body.diagnostics.coverageWarnings[0]!.setId).toBe(SET_ID_2);
    expect(body.diagnostics.coverageWarnings[0]!.code).toBe('ERROR');
  });

  it('Snapshot isolation: response items retain distinct snapshotId per setId', async () => {
    const resp1 = mockSingleSetResponse(SNAP_1, [mockChunkItem('c1', SNAP_1)]);
    const resp2 = mockSingleSetResponse(SNAP_2, [mockChunkItem('c2', SNAP_2)]);
    const retrieveMock = vi.fn().mockImplementation((setId: string) => {
      if (setId === SET_ID_1) return Promise.resolve(resp1);
      if (setId === SET_ID_2) return Promise.resolve(resp2);
      throw new Error('Unknown setId');
    });

    const body = await runDirect(
      {
        query: 'test query',
        setTierAssignments: [
          { setId: SET_ID_1, tier: 'REQUIRED', roleGroup: 'baseline' },
          { setId: SET_ID_2, tier: 'REQUIRED', roleGroup: 'scope_diff' },
        ],
        comparisonMode: 'baseline_vs_scope',
        budgets: baseBudgets,
      },
      retrieveMock
    );

    const item1 = body.items.find((i) => i.setId === SET_ID_1);
    const item2 = body.items.find((i) => i.setId === SET_ID_2);
    expect(item1).toBeDefined();
    expect(item2).toBeDefined();
    expect(item1!.snapshotId).toBe(SNAP_1);
    expect(item2!.snapshotId).toBe(SNAP_2);
    expect(item1!.snapshotId).not.toBe(item2!.snapshotId);
  });

  it('Role-group ranking: baseline items appear before scope_diff items in items[]', async () => {
    const respBase = mockSingleSetResponse(SNAP_1, [mockChunkItem('cbase', SNAP_1, 0.10)]);
    const respDiff = mockSingleSetResponse(SNAP_2, [mockChunkItem('cdiff', SNAP_2, 0.99)]);
    const retrieveMock = vi.fn().mockImplementation((setId: string) => {
      if (setId === SET_ID_1) return Promise.resolve(respBase);
      if (setId === SET_ID_2) return Promise.resolve(respDiff);
      throw new Error('Unknown setId');
    });

    const body = await runDirect(
      {
        query: 'test query',
        setTierAssignments: [
          { setId: SET_ID_2, tier: 'REQUIRED', roleGroup: 'scope_diff' },
          { setId: SET_ID_1, tier: 'REQUIRED', roleGroup: 'baseline' },
        ],
        comparisonMode: 'baseline_vs_scope',
        budgets: baseBudgets,
      },
      retrieveMock
    );

    expect(body.items).toHaveLength(2);
    expect(body.items[0]!.roleGroup).toBe('baseline');
    expect(body.items[0]!.setId).toBe(SET_ID_1);
    expect(body.items[1]!.roleGroup).toBe('scope_diff');
    expect(body.items[1]!.setId).toBe(SET_ID_2);
  });

  it('Budget stop: maxSets=1, 3 REQUIRED sets requested — only first processed, coverageWarnings names BUDGET_SETS', async () => {
    const resp1 = mockSingleSetResponse(SNAP_1, [mockChunkItem('c1', SNAP_1)]);
    const retrieveMock = vi.fn().mockResolvedValue(resp1);

    const body = await runDirect(
      {
        query: 'test query',
        setTierAssignments: [
          { setId: SET_ID_1, tier: 'REQUIRED', roleGroup: 'baseline' },
          { setId: SET_ID_2, tier: 'REQUIRED', roleGroup: 'scope_diff' },
          { setId: SET_ID_3, tier: 'REQUIRED', roleGroup: 'scope_diff' },
        ],
        comparisonMode: 'baseline_vs_scope',
        budgets: { ...baseBudgets, maxSets: 1 },
      },
      retrieveMock
    );

    expect(body.outcome).toBe('DEGRADED');
    expect(body.diagnostics.degraded).toBe(true);
    expect(retrieveMock).toHaveBeenCalledTimes(1);
    expect(retrieveMock).toHaveBeenCalledWith(SET_ID_1, expect.anything(), expect.anything());
    expect(body.diagnostics.coverageWarnings.some((w) => w.code === 'BUDGET_SETS')).toBe(true);
  });

  it('allows REQUIRED retrieval to use the remaining global deadline', async () => {
    const response = mockSingleSetResponse(SNAP_1, [mockChunkItem('c1', SNAP_1)]);
    const retrieveMock = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(response), 70))
    );

    const body = await runDirect(
      {
        query: 'slow but within budget',
        setTierAssignments: [{ setId: SET_ID_1, tier: 'REQUIRED', roleGroup: 'baseline' }],
        comparisonMode: 'single',
        budgets: { ...baseBudgets, elapsedMs: 100 },
      },
      retrieveMock
    );

    expect(body.outcome).toBe('READY');
    expect(body.items).toHaveLength(1);
  });

  it('marks all modalities as timeout when every set times out', async () => {
    const retrieveMock = vi.fn().mockImplementation(
      (_setId: string, _request: unknown, opts?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          opts?.signal?.addEventListener('abort', () => reject(new DOMException('Timed out', 'AbortError')));
        })
    );

    const body = await runDirect(
      {
        query: 'slow query',
        setTierAssignments: [{ setId: SET_ID_1, tier: 'REQUIRED', roleGroup: 'baseline' }],
        comparisonMode: 'single',
        budgets: { ...baseBudgets, elapsedMs: 100 },
      },
      retrieveMock
    );

    expect(body.outcome).toBe('DEGRADED');
    expect(body.items).toHaveLength(0);
    expect(body.modalityStatus.fulltext.status).toBe('timeout');
    expect(body.modalityStatus.vector.status).toBe('timeout');
    expect(body.modalityStatus.graph.status).toBe('timeout');
    expect(body.diagnostics.coverageWarnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'TIMEOUT', setId: SET_ID_1 })])
    );
  });

  it('rejects a query-only request with legacy orchestration fields at the route (400)', async () => {
    const retrieveMock = vi.fn();
    const app = buildKnowledgeServer({
      token: TOKEN,
      allowedOrigins: [ORIGIN],
      retrievalService: { retrieve: retrieveMock },
    }).app;

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/retrieve',
      headers: { origin: ORIGIN, authorization: `Bearer ${TOKEN}` },
      payload: { query: 'test query', budgets: baseBudgets },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: { code: 'INVALID_REQUEST', message: 'Request could not be processed.' },
    });
    expect(retrieveMock).not.toHaveBeenCalled();
  });

  it('rejects a query-only request with a missing auth header (401)', async () => {
    const retrieveMock = vi.fn();
    const app = buildKnowledgeServer({
      token: TOKEN,
      allowedOrigins: [ORIGIN],
      retrievalService: { retrieve: retrieveMock },
    }).app;

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/retrieve',
      headers: { origin: ORIGIN },
      payload: { query: 'test query' },
    });

    expect(res.statusCode).toBe(401);
    expect(retrieveMock).not.toHaveBeenCalled();
  });
});

describe('Federated aggregation: counts, severity, stages, seeds', () => {
  const URN_A = 'urn:plannermate:test:Entity:A';
  const URN_B = 'urn:plannermate:test:Entity:B';
  const URN_C = 'urn:plannermate:test:Entity:C';
  const URN_DUP = 'urn:plannermate:test:Entity:DUP';
  const FACT_1 = 'a'.repeat(64);
  const FACT_DUP = 'b'.repeat(64);

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
        status: 'ok', latencyMs: 5, itemCount: 0, entityCount: 0, edgeCount: 0, pathCount: 0,
      },
    },
    diagnostics: { degraded: false },
    planTrace: { fastPath: true, degradedFallback: false },
    ...overrides,
  } as RetrievalResponse);

  // Hop citations must reference a returned chunk item of the same set
  // (server closure rule, T-28-08), so each path is paired with that chunk.
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
  const pathChunk = (factKey: string, snapshotId: string) => ({
    ...mockChunkItem(`chunk-${factKey}`, snapshotId),
    publishedContentHash: factKey,
  });

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
    return runDirect(
      { query: 'graph query', setTierAssignments: assignments, comparisonMode: 'baseline_vs_scope', budgets: baseBudgets },
      retrieveMock
    );
  };

  it('sums distinct retained graph identities across sets', async () => {
    const body = await runFederation({
      [SET_ID_1]: setResponse({
        snapshotId: SNAP_1,
        items: [mockEntityItem(URN_A, SNAP_1)],
        modalityStatus: {
          fulltext: { status: 'ok', latencyMs: 1, itemCount: 0 },
          vector: { status: 'ok', latencyMs: 1, itemCount: 0 },
          graph: { status: 'ok', latencyMs: 1, itemCount: 1, entityCount: 1, edgeCount: 0, pathCount: 0 },
        },
      }),
      [SET_ID_2]: setResponse({
        snapshotId: SNAP_2,
        items: [
          mockEntityItem(URN_B, SNAP_2),
          mockEntityItem(URN_C, SNAP_2),
          { type: 'edge', id: FACT_1, score: 1, modalitiesContributed: ['graph'], factKey: FACT_1, sourceUrn: URN_B, relationType: 'READS_FROM', targetUrn: URN_C, evidenceClass: 'OBSERVED', supportingChunkIds: [], snapshotId: SNAP_2, hasConflict: false },
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
    const duplicate = {
      items: [
        mockEntityItem(URN_DUP, SNAP_1),
        { type: 'edge', id: FACT_DUP, score: 1, modalitiesContributed: ['graph'], factKey: FACT_DUP, sourceUrn: URN_DUP, relationType: 'READS_FROM', targetUrn: URN_DUP, evidenceClass: 'OBSERVED', supportingChunkIds: [], snapshotId: SNAP_1, hasConflict: false },
        pathChunk(FACT_DUP, SNAP_1),
      ],
      paths: [graphPath('P1', SNAP_1, [URN_DUP, URN_DUP], [FACT_DUP])],
    };
    const body = await runFederation({
      [SET_ID_1]: setResponse({ snapshotId: SNAP_1, ...duplicate }),
      [SET_ID_2]: setResponse({ snapshotId: SNAP_1, ...duplicate }),
    });
    expect(body.modalityStatus.graph.entityCount).toBe(1);
    expect(body.modalityStatus.graph.edgeCount).toBe(1);
    expect(body.modalityStatus.graph.pathCount).toBe(1);
    // Graph identities collapse across sets; closure chunks remain set-scoped.
    expect(body.items.filter((i) => i.item.type === 'entity')).toHaveLength(1);
    expect(body.items.filter((i) => i.item.type === 'edge')).toHaveLength(1);
    expect(body.items.filter((i) => i.item.type === 'chunk')).toHaveLength(2);
  });

  it('never lets a later ok overwrite an earlier timeout', async () => {
    const body = await runFederation({
      [SET_ID_1]: setResponse({
        snapshotId: SNAP_1,
        items: [mockEntityItem(URN_A, SNAP_1)],
        modalityStatus: {
          fulltext: { status: 'timeout', latencyMs: 1, itemCount: 0, reason: 'TIMEOUT' },
          vector: { status: 'ok', latencyMs: 1, itemCount: 0 },
          graph: { status: 'ok', latencyMs: 1, itemCount: 1, entityCount: 1, edgeCount: 0, pathCount: 0 },
        },
      }),
      [SET_ID_2]: setResponse({
        snapshotId: SNAP_2,
        items: [mockEntityItem(URN_B, SNAP_2)],
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
        items: [mockEntityItem(`urn:plannermate:test:Entity:seed-${snapshotId.replace(/[^a-z0-9]/g, '')}`, snapshotId)],
        modalityStatus: {
          fulltext: { status: 'ok', latencyMs: 1, itemCount: 0 },
          vector: { status: 'ok', latencyMs: 1, itemCount: 0 },
          graph: { status: 'ok', latencyMs: 1, itemCount: 1, entityCount: 1, edgeCount: 0, pathCount: 0 },
        },
      });

    const allSeed = await runFederation({ [SET_ID_1]: seedOnly(SNAP_1), [SET_ID_2]: seedOnly(SNAP_2) });
    expect(allSeed.outcome).toBe('SEED_ONLY');
    expect(allSeed.items.some((i) => i.item.type === 'entity')).toBe(true);

    const mixed = await runFederation({
      [SET_ID_1]: seedOnly(SNAP_1),
      [SET_ID_2]: setResponse({
        snapshotId: SNAP_2,
        items: [mockEntityItem(URN_B, SNAP_2), { type: 'edge', id: FACT_1, score: 1, modalitiesContributed: ['graph'], factKey: FACT_1, sourceUrn: URN_B, relationType: 'READS_FROM', targetUrn: URN_B, evidenceClass: 'OBSERVED', supportingChunkIds: [], snapshotId: SNAP_2, hasConflict: false }],
        modalityStatus: {
          fulltext: { status: 'ok', latencyMs: 1, itemCount: 0 },
          vector: { status: 'ok', latencyMs: 1, itemCount: 0 },
          graph: { status: 'ok', latencyMs: 1, itemCount: 2, entityCount: 1, edgeCount: 1, pathCount: 0 },
        },
      }),
    });
    expect(mixed.outcome).toBe('READY');
  });

  it('yields NO_EVIDENCE when all sets are empty', async () => {
    const empty = (snapshotId: string) => setResponse({ snapshotId, outcome: 'NO_EVIDENCE', reason: 'NO_MATCHING_EVIDENCE', suggestedRefinements: ['broaden'] });
    const body = await runFederation({ [SET_ID_1]: empty(SNAP_1), [SET_ID_2]: empty(SNAP_2) });
    expect(body.outcome).toBe('NO_EVIDENCE');
  });

  it('merges, dedupes, and caps failedSeeds at 5', async () => {
    const seeds = (prefix: string) =>
      Array.from({ length: 4 }, (_, i) => ({ urn: `urn:plannermate:test:Entity:${prefix}${i}`, reasonCode: 'SEED_NOT_FOUND' as const }));
    const body = await runFederation({
      [SET_ID_1]: setResponse({ snapshotId: SNAP_1, diagnostics: { degraded: false, failedSeeds: seeds('x').slice(0, 3) } }),
      [SET_ID_2]: setResponse({ snapshotId: SNAP_2, diagnostics: { degraded: false, failedSeeds: [seeds('x')[0]!, ...seeds('y')] } }),
    });
    const failed = body.diagnostics.failedSeeds ?? [];
    expect(failed.length).toBeLessThanOrEqual(5);
    expect(new Set(failed.map((s) => `${s.urn}|${s.reasonCode}`)).size).toBe(failed.length);
  });

  it('preserves stage truncation and fallback flags across sets and has no free text', async () => {
    const stageRow = (overrides: Record<string, unknown>) => ({
      stage: 'neo4j_traversal', status: 'ok', latencyMs: 4, accepted: 2, rejected: 0,
      truncated: false, fallback: false, reasonCodes: [], ...overrides,
    });
    const body = await runFederation({
      [SET_ID_1]: setResponse({
        snapshotId: SNAP_1,
        diagnostics: {
          degraded: false,
          stageDiagnostics: [
            stageRow({ truncated: true, status: 'truncated' }) as any,
            stageRow({ stage: 'planning', fallback: true, fallbackReason: 'FALLBACK_ONE_HOP', status: 'truncated' }) as any,
          ],
        },
      }),
      [SET_ID_2]: setResponse({ snapshotId: SNAP_2, diagnostics: { degraded: false, stageDiagnostics: [stageRow({}) as any] } }),
    });
    const stages = body.diagnostics.stageDiagnostics ?? [];
    expect(stages.some((row) => row.truncated === true)).toBe(true);
    expect(stages.some((row) => row.fallback === true && row.fallbackReason === 'FALLBACK_ONE_HOP')).toBe(true);
    expect(stages.length).toBeLessThanOrEqual(20);
    expect(JSON.stringify(body.diagnostics)).not.toContain('"message"');
  });
});

describe('Federated budget accounting', () => {
  const accountingBudgets = {
    concurrency: 4,
    elapsedMs: 2000,
    maxSets: 10,
    maxItems: 50,
    maxEvidenceChars: 10000,
  };

  const sharedEntities = (snapshotId: string) =>
    Array.from({ length: 20 }, (_, i) => mockEntityItem(`urn:plannermate:test:Entity:E${i}`, snapshotId));

  it('does not charge duplicate graph identities to the item budget (no false BUDGET_ITEMS)', async () => {
    const assignments: FederatedRetrievalRequest['setTierAssignments'] = [
      { setId: SET_ID_1, tier: 'REQUIRED', roleGroup: 'baseline' },
      { setId: SET_ID_2, tier: 'REQUIRED', roleGroup: 'baseline' },
      { setId: SET_ID_3, tier: 'REQUIRED', roleGroup: 'baseline' },
      { setId: SET_ID_4, tier: 'REQUIRED', roleGroup: 'baseline' },
    ];
    const responses: Record<string, RetrievalResponse> = {
      [SET_ID_1]: mockSingleSetResponse(SNAP_1, [...sharedEntities(SNAP_1), mockChunkItem('c-set-1', SNAP_1)]),
      [SET_ID_2]: mockSingleSetResponse(SNAP_1, [...sharedEntities(SNAP_1), mockChunkItem('c-set-2', SNAP_1)]),
      [SET_ID_3]: mockSingleSetResponse(SNAP_1, [...sharedEntities(SNAP_1), mockChunkItem('c-set-3', SNAP_1)]),
      [SET_ID_4]: mockSingleSetResponse(SNAP_1, [...sharedEntities(SNAP_1), mockChunkItem('c-set-4', SNAP_1)]),
    };
    const retrieveMock = vi.fn().mockImplementation((setId: string) => {
      const response = responses[setId];
      if (!response) return Promise.reject(new Error('Unknown setId'));
      return Promise.resolve(response);
    });
    const body = await runDirect(
      { query: 'budget accounting query', setTierAssignments: assignments as any, comparisonMode: 'single', budgets: accountingBudgets },
      retrieveMock
    );
    expect(retrieveMock).toHaveBeenCalledTimes(4);
    expect(body.items).toHaveLength(24);
    expect(body.diagnostics.coverageWarnings).toHaveLength(0);
    expect(body.outcome).toBe('READY');
  });

  it('admits distinct LIKELY evidence when packed survivors are below the coverage threshold', async () => {
    const distinctChunks = (prefix: string) => Array.from({ length: 20 }, (_, i) => mockChunkItem(`${prefix}-c${i}`, SNAP_1));
    const responses: Record<string, RetrievalResponse> = {
      [SET_ID_1]: mockSingleSetResponse(SNAP_1, sharedEntities(SNAP_1)),
      [SET_ID_2]: mockSingleSetResponse(SNAP_1, sharedEntities(SNAP_1)),
      [SET_ID_3]: mockSingleSetResponse(SNAP_1, distinctChunks('s3')),
      [SET_ID_4]: mockSingleSetResponse(SNAP_1, distinctChunks('s4')),
    };
    const retrieveFor = (ids: string[]) => vi.fn().mockImplementation((setId: string) => {
      const response = responses[setId];
      if (!response) return Promise.reject(new Error('Unknown setId'));
      return Promise.resolve(response);
    });
    const assignments = [
      { setId: SET_ID_1, tier: 'REQUIRED' as const, roleGroup: 'baseline' as const },
      { setId: SET_ID_2, tier: 'REQUIRED' as const, roleGroup: 'baseline' as const },
      { setId: SET_ID_3, tier: 'LIKELY' as const, roleGroup: 'baseline' as const },
      { setId: SET_ID_4, tier: 'LIKELY' as const, roleGroup: 'baseline' as const },
    ];
    const treatmentMock = retrieveFor(['1', '2', '3', '4']);
    const treatment = await runDirect(
      { query: 'q', setTierAssignments: assignments, comparisonMode: 'single', budgets: accountingBudgets },
      treatmentMock
    );
    const control = await runDirect(
      { query: 'q', setTierAssignments: [assignments[0]!], comparisonMode: 'single', budgets: accountingBudgets },
      retrieveFor(['1'])
    );
    expect(control.items).toHaveLength(20);
    expect(treatment.items).toHaveLength(50);
    const retrievedSetIds = treatmentMock.mock.calls.map((call) => call[0]);
    expect(retrievedSetIds).toEqual(expect.arrayContaining([SET_ID_3, SET_ID_4]));
  });
});

describe('Phase 28-03: truthful budgets, coverage ledger and path closure', () => {
  const snapshotMap = {
    [SET_ID_1]: SNAP_1,
    [SET_ID_2]: SNAP_2,
    [SET_ID_3]: SNAP_3,
  };

  it('deadline/queued work: a set that cannot start before the deadline is never called and is NOT_SEARCHED_BUDGET', async () => {
    let clock = 0;
    const now = () => clock;
    const response = mockSingleSetResponse(SNAP_1, [mockChunkItem('c1', SNAP_1)]);
    const retrieveMock = vi.fn().mockImplementation(async () => {
      await Promise.resolve();
      clock += 70;
      return response;
    });
    const body = await runFederatedRetrieval(
      resolveDirect({
        query: 'deadline query',
        setTierAssignments: [
          { setId: SET_ID_1, tier: 'REQUIRED', roleGroup: 'baseline' },
          { setId: SET_ID_2, tier: 'REQUIRED', roleGroup: 'baseline' },
          { setId: SET_ID_3, tier: 'REQUIRED', roleGroup: 'baseline' },
        ],
        comparisonMode: 'single',
        budgets: { ...baseBudgets, elapsedMs: 70, concurrency: 1 },
        publishedSnapshotIdBySet: snapshotMap,
      }),
      { retrievePerSet: retrieveMock, now }
    );

    expect(retrieveMock).toHaveBeenCalledTimes(1);
    expect(clock).toBeLessThan(70 * 3);
    const bySet = new Map(body.diagnostics.coverage.map((row) => [row.setId, row]));
    expect(bySet.get(SET_ID_1)?.state).toBe('CONTRIBUTED');
    expect(bySet.get(SET_ID_2)?.state).toBe('NOT_SEARCHED_BUDGET');
    expect(bySet.get(SET_ID_3)?.state).toBe('NOT_SEARCHED_BUDGET');
  });

  it('maxEvidenceChars:10 with one 100-char chunk retains zero items and emits BUDGET_EVIDENCE', async () => {
    const bigChunk = { ...mockChunkItem('big', SNAP_1), rawSnippet: 'x'.repeat(100) };
    const body = await runDirect(
      {
        query: 'oversized chunk',
        setTierAssignments: [{ setId: SET_ID_1, tier: 'REQUIRED', roleGroup: 'baseline' }],
        comparisonMode: 'single',
        budgets: { ...baseBudgets, maxEvidenceChars: 10 },
      },
      vi.fn().mockResolvedValue(mockSingleSetResponse(SNAP_1, [bigChunk]))
    );
    expect(body.items).toHaveLength(0);
    expect(body.diagnostics.coverageWarnings.some((w) => w.code === 'BUDGET_EVIDENCE')).toBe(true);
  });

  it('maxItems:2 with five chunks retains exactly two and records BUDGET_ITEMS (not SEARCHED_NO_EVIDENCE)', async () => {
    const chunks = Array.from({ length: 5 }, (_, i) => mockChunkItem(`c${i}`, SNAP_1));
    const body = await runDirect(
      {
        query: 'item cap',
        setTierAssignments: [{ setId: SET_ID_1, tier: 'REQUIRED', roleGroup: 'baseline' }],
        comparisonMode: 'single',
        budgets: { ...baseBudgets, maxItems: 2, maxEvidenceChars: 100000 },
        publishedSnapshotIdBySet: snapshotMap,
      },
      vi.fn().mockResolvedValue(mockSingleSetResponse(SNAP_1, chunks))
    );
    expect(body.items).toHaveLength(2);
    expect(body.diagnostics.coverageWarnings.some((w) => w.code === 'BUDGET_ITEMS')).toBe(true);
    expect(body.diagnostics.coverage).toHaveLength(1);
    expect(body.diagnostics.coverage[0]!.state).toBe('CONTRIBUTED');
  });

  it('coverage ledger: one contributing set and one empty set with ok modalities → [CONTRIBUTED, SEARCHED_NO_EVIDENCE], READY', async () => {
    const body = await runDirect(
      {
        query: 'mixed coverage',
        setTierAssignments: [
          { setId: SET_ID_1, tier: 'REQUIRED', roleGroup: 'baseline' },
          { setId: SET_ID_2, tier: 'REQUIRED', roleGroup: 'baseline' },
        ],
        comparisonMode: 'single',
        budgets: baseBudgets,
        publishedSnapshotIdBySet: snapshotMap,
      },
      vi.fn().mockImplementation((setId: string) =>
        Promise.resolve(mockSingleSetResponse(
          setId === SET_ID_1 ? SNAP_1 : SNAP_2,
          setId === SET_ID_1 ? [mockChunkItem('c1', SNAP_1)] : []
        ))
      )
    );
    expect(body.outcome).toBe('READY');
    expect(body.diagnostics.coverage.map((row) => row.state)).toEqual(['CONTRIBUTED', 'SEARCHED_NO_EVIDENCE']);
  });

  it('all-failed: two rejecting sets → DEGRADED, all modality statuses non-ok, ledger both FAILED', async () => {
    const body = await runDirect(
      {
        query: 'all failed',
        setTierAssignments: [
          { setId: SET_ID_1, tier: 'REQUIRED', roleGroup: 'baseline' },
          { setId: SET_ID_2, tier: 'REQUIRED', roleGroup: 'baseline' },
        ],
        comparisonMode: 'single',
        budgets: baseBudgets,
        publishedSnapshotIdBySet: snapshotMap,
      },
      vi.fn().mockRejectedValue(new Error('boom'))
    );
    expect(body.outcome).toBe('DEGRADED');
    expect(body.diagnostics.degraded).toBe(true);
    for (const modality of ['fulltext', 'vector', 'graph'] as const) {
      expect(body.modalityStatus[modality].status).not.toBe('ok');
    }
    expect(body.diagnostics.coverage.map((row) => row.state)).toEqual(['FAILED', 'FAILED']);
  });

  it('all-timeout: two timing-out sets → all modalities timeout, ledger both TIMED_OUT', async () => {
    const body = await runDirect(
      {
        query: 'all timeout',
        setTierAssignments: [
          { setId: SET_ID_1, tier: 'REQUIRED', roleGroup: 'baseline' },
          { setId: SET_ID_2, tier: 'REQUIRED', roleGroup: 'baseline' },
        ],
        comparisonMode: 'single',
        budgets: { ...baseBudgets, elapsedMs: 100 },
        publishedSnapshotIdBySet: snapshotMap,
      },
      vi.fn().mockImplementation(
        (_setId: string, _request: unknown, opts?: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            opts?.signal?.addEventListener('abort', () => reject(new DOMException('Timed out', 'AbortError')));
          })
      )
    );
    expect(body.outcome).toBe('DEGRADED');
    for (const modality of ['fulltext', 'vector', 'graph'] as const) {
      expect(body.modalityStatus[modality].status).toBe('timeout');
    }
    expect(body.diagnostics.coverage.map((row) => row.state)).toEqual(['TIMED_OUT', 'TIMED_OUT']);
  });

  it('a failed set keeps publishedSnapshotId from the resolver and has null retrievalSnapshotId', async () => {
    const body = await runDirect(
      {
        query: 'attribution on failure',
        setTierAssignments: [{ setId: SET_ID_1, tier: 'REQUIRED', roleGroup: 'baseline' }],
        comparisonMode: 'single',
        budgets: baseBudgets,
        publishedSnapshotIdBySet: { [SET_ID_1]: SNAP_1 },
      },
      vi.fn().mockRejectedValue(new Error('boom'))
    );
    const row = body.diagnostics.coverage[0]!;
    expect(row.publishedSnapshotId).toBe(SNAP_1);
    expect(row.retrievalSnapshotId).toBeNull();
    expect(row.staleIndex).toBe(false);
  });

  it('every resolved assignment appears exactly once in the ledger, in assignment order', async () => {
    const body = await runDirect(
      {
        query: 'ledger uniqueness',
        setTierAssignments: [
          { setId: SET_ID_3, tier: 'REQUIRED', roleGroup: 'baseline' },
          { setId: SET_ID_1, tier: 'REQUIRED', roleGroup: 'baseline' },
          { setId: SET_ID_2, tier: 'REQUIRED', roleGroup: 'baseline' },
        ],
        comparisonMode: 'single',
        budgets: baseBudgets,
        publishedSnapshotIdBySet: snapshotMap,
      },
      vi.fn().mockImplementation((setId: string) =>
        Promise.resolve(mockSingleSetResponse(setId === SET_ID_3 ? SNAP_3 : setId === SET_ID_1 ? SNAP_1 : SNAP_2, [mockChunkItem(`c-${setId}`, SNAP_1)]))
      )
    );
    expect(body.diagnostics.coverage.map((row) => row.setId)).toEqual([SET_ID_3, SET_ID_1, SET_ID_2]);
    expect(new Set(body.diagnostics.coverage.map((row) => row.setId)).size).toBe(3);
  });
});
