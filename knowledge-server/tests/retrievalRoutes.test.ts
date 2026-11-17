/// <reference types="node" />
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { buildKnowledgeServer } from '../src/server.js';
import { SnapshotStore } from '../src/indexing/snapshotStore.js';
import { createPerSetRetriever } from '../src/services/perSetRetrievalRouter.js';
import type { ProjectionSnapshot } from '../src/indexing/incrementalProjector.js';
import type { FederatedRetrievalResponse, RetrievalResponse } from '../src/types/retrievalProtocol.js';
import { URN_TABLE_FCL_CYCLE_COUNTER } from './fixtures/pilotGoldEntities.js';

const ORIGIN = 'https://planner.example';
const TOKEN = 'server-test-token-very-secret';
const SET_ID = randomUUID();

function sampleResponse(outcome: RetrievalResponse['outcome'], overrides: Partial<RetrievalResponse> = {}): RetrievalResponse {
  const base: any = {
    outcome,
    snapshotId: 'gsnap_00000001',
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
    modalitiesUsed: ['fulltext'],
    modalityStatus: {
      fulltext: { status: 'ok', latencyMs: 5, itemCount: 0 },
      vector: { status: 'ok', latencyMs: 10, itemCount: 0 },
      graph: { status: 'ok', latencyMs: 15, itemCount: 0 },
    },
    diagnostics: { degraded: outcome === 'DEGRADED' },
    planTrace: { fastPath: true, degradedFallback: false },
    ...overrides,
  };

  if (outcome === 'NEEDS_CLARIFICATION' && !base.candidates) {
    base.candidates = [
      {
        urn: URN_TABLE_FCL_CYCLE_COUNTER,
        canonicalName: 'FCL_CYCLE_COUNTER',
        kind: 'DatabaseObject',
      },
    ];
  }

  if (outcome === 'NO_EVIDENCE') {
    if (!base.reason) base.reason = 'NO_RESULTS';
    if (!base.suggestedRefinements) base.suggestedRefinements = ['Try broader query terms'];
  }

  if (outcome === 'UNSUPPORTED' && !base.unsupportedConstructs) {
    base.unsupportedConstructs = ['REGEX_FILTER'];
  }

  return base as RetrievalResponse;
}

describe('Fastify retrieval routes (Task 1: 18-ROUTE-01, D-23, T-18-01, T-18-02)', () => {
  it('rejects unauthorized and wrong origin requests before invoking service', async () => {
    const retrieveMock = vi.fn();
    const fakeService: any = { retrieve: retrieveMock };

    const app = buildKnowledgeServer({
      token: TOKEN,
      allowedOrigins: [ORIGIN],
      retrievalService: fakeService,
    }).app;

    // 1. Missing bearer authorization
    const unauth = await app.inject({
      method: 'POST',
      url: `/api/v1/sets/${SET_ID}/retrieve`,
      headers: { origin: ORIGIN },
      payload: { query: 'test query' },
    });
    expect(unauth.statusCode).toBe(401);
    expect(unauth.json()).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Valid bearer authorization is required.' },
    });
    expect(retrieveMock).not.toHaveBeenCalled();

    // 2. Denied origin
    const deniedOrigin = await app.inject({
      method: 'POST',
      url: `/api/v1/sets/${SET_ID}/retrieve`,
      headers: {
        origin: 'https://evil.example',
        authorization: `Bearer ${TOKEN}`,
      },
      payload: { query: 'test query' },
    });
    expect(deniedOrigin.statusCode).toBe(403);
    expect(deniedOrigin.json()).toEqual({
      error: { code: 'ORIGIN_DENIED', message: 'Request origin is not allowed.' },
    });
    expect(retrieveMock).not.toHaveBeenCalled();
  });

  it('rejects invalid setId, empty/oversized query, limit out of bounds, unknown fields with safe 400', async () => {
    const retrieveMock = vi.fn();
    const fakeService: any = { retrieve: retrieveMock };

    const app = buildKnowledgeServer({
      token: TOKEN,
      allowedOrigins: [ORIGIN],
      retrievalService: fakeService,
    }).app;

    const testCases = [
      // Non-UUID setId
      { url: '/api/v1/sets/not-a-uuid/retrieve', payload: { query: 'valid' } },
      // Empty query
      { url: `/api/v1/sets/${SET_ID}/retrieve`, payload: { query: '   ' } },
      // Limit < 10
      { url: `/api/v1/sets/${SET_ID}/retrieve`, payload: { query: 'valid', limit: 5 } },
      // Limit > 50
      { url: `/api/v1/sets/${SET_ID}/retrieve`, payload: { query: 'valid', limit: 55 } },
      // Unknown body fields (strict schema)
      { url: `/api/v1/sets/${SET_ID}/retrieve`, payload: { query: 'valid', unknownField: true } },
      // Oversized recentTurns (> 3)
      {
        url: `/api/v1/sets/${SET_ID}/retrieve`,
        payload: {
          query: 'valid',
          recentTurns: [
            { role: 'user', text: '1' },
            { role: 'assistant', text: '2' },
            { role: 'user', text: '3' },
            { role: 'assistant', text: '4' },
          ],
        },
      },
    ];

    for (const tc of testCases) {
      const res = await app.inject({
        method: 'POST',
        url: tc.url,
        headers: {
          origin: ORIGIN,
          authorization: `Bearer ${TOKEN}`,
        },
        payload: tc.payload,
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({
        error: { code: 'INVALID_REQUEST', message: 'Request could not be processed.' },
      });
    }

    expect(retrieveMock).not.toHaveBeenCalled();
  });

  it('delegates once to retrievalService and returns HTTP 200 for all semantic outcomes', async () => {
    const outcomes: RetrievalResponse['outcome'][] = [
      'READY',
      'NEEDS_CLARIFICATION',
      'NO_EVIDENCE',
      'UNSUPPORTED',
      'DEGRADED',
    ];

    for (const outcome of outcomes) {
      const expectedEnvelope = sampleResponse(outcome);
      const retrieveMock = vi.fn().mockResolvedValue(expectedEnvelope);
      const fakeService: any = { retrieve: retrieveMock };

      const app = buildKnowledgeServer({
        token: TOKEN,
        allowedOrigins: [ORIGIN],
        retrievalService: fakeService,
      }).app;

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/sets/${SET_ID}/retrieve`,
        headers: {
          origin: ORIGIN,
          authorization: `Bearer ${TOKEN}`,
        },
        payload: {
          query: 'find transaction status',
          limit: 25,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(expectedEnvelope);
      expect(retrieveMock).toHaveBeenCalledTimes(1);
      expect(retrieveMock).toHaveBeenCalledWith(SET_ID, {
        query: 'find transaction status',
        limit: 25,
        includeInferred: false,
        recentTurns: [],
      });
    }
  });

  it('handles service errors with safe 500 without leaking query, stack, or canary secrets', async () => {
    const SECRET_QUERY = 'CONFIDENTIAL_QUERY_SECRET_ABC';
    const SECRET_ERROR_MSG = 'DATABASE_PASSWORD_LEAK_DEF';

    const retrieveMock = vi.fn().mockRejectedValue(new Error(SECRET_ERROR_MSG));
    const fakeService: any = { retrieve: retrieveMock };

    const logs: string[] = [];
    const app = buildKnowledgeServer({
      token: TOKEN,
      allowedOrigins: [ORIGIN],
      retrievalService: fakeService,
      logger: {
        stream: {
          write: (line: string) => {
            logs.push(line);
          },
        },
      },
    }).app;

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/sets/${SET_ID}/retrieve`,
      headers: {
        origin: ORIGIN,
        authorization: `Bearer ${TOKEN}`,
      },
      payload: { query: SECRET_QUERY },
    });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Request could not be processed.' },
    });

    // Verify safe redaction: response body and logs must omit secret query and error internals
    expect(res.body).not.toContain(SECRET_QUERY);
    expect(res.body).not.toContain(SECRET_ERROR_MSG);
    expect(res.body).not.toContain(TOKEN);

    const output = logs.join('');
    expect(output).not.toContain(SECRET_QUERY);
    expect(output).not.toContain(SECRET_ERROR_MSG);
    expect(output).not.toContain(TOKEN);
  });

  it('logs only bounded response-validation diagnostics', async () => {
    const SECRET_QUERY = 'CONFIDENTIAL_QUERY_SECRET_ZOD';
    const retrieveMock = vi.fn().mockResolvedValue({
      ...sampleResponse('READY'),
      snapshotId: 'invalid-snapshot',
    });

    const logs: string[] = [];
    const app = buildKnowledgeServer({
      token: TOKEN,
      allowedOrigins: [ORIGIN],
      retrievalService: { retrieve: retrieveMock } as any,
      logger: {
        stream: {
          write: (line: string) => {
            logs.push(line);
          },
        },
      },
    }).app;

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/sets/${SET_ID}/retrieve`,
      headers: {
        origin: ORIGIN,
        authorization: `Bearer ${TOKEN}`,
      },
      payload: { query: SECRET_QUERY },
    });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Request could not be processed.' },
    });

    const output = logs.join('');
    expect(output).toContain('RESPONSE_VALIDATION_ERROR');
    expect(output).toContain('snapshotId');
    expect(output).toContain('invalid_union');
    expect(output).not.toContain(SECRET_QUERY);
    expect(output).not.toContain('invalid-snapshot');
    expect(output).not.toContain(TOKEN);
    expect(output).not.toContain('stack');
  });

  it('logs fixed candidate-integrity code without leaking error internals', async () => {
    const SECRET_ERROR_MSG = 'DATABASE_PASSWORD_LEAK_DIAGNOSTIC';
    const integrityError = new Error('CANDIDATE_INTEGRITY_MISMATCH');
    integrityError.stack = SECRET_ERROR_MSG;
    const retrieveMock = vi.fn().mockRejectedValue(integrityError);

    const logs: string[] = [];
    const app = buildKnowledgeServer({
      token: TOKEN,
      allowedOrigins: [ORIGIN],
      retrievalService: { retrieve: retrieveMock } as any,
      logger: {
        stream: {
          write: (line: string) => {
            logs.push(line);
          },
        },
      },
    }).app;

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/sets/${SET_ID}/retrieve`,
      headers: {
        origin: ORIGIN,
        authorization: `Bearer ${TOKEN}`,
      },
      payload: { query: 'safe query' },
    });

    expect(res.statusCode).toBe(500);
    const output = logs.join('');
    expect(output).toContain('CANDIDATE_INTEGRITY_MISMATCH');
    expect(output).not.toContain(SECRET_ERROR_MSG);
    expect(output).not.toContain(TOKEN);
    expect(output).not.toContain('stack');
  });

  it('proves server composition without retrievalService leaves route unregistered (404)', async () => {
    const app = buildKnowledgeServer({
      token: TOKEN,
      allowedOrigins: [ORIGIN],
    }).app;

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/sets/${SET_ID}/retrieve`,
      headers: {
        origin: ORIGIN,
        authorization: `Bearer ${TOKEN}`,
      },
      payload: { query: 'test' },
    });

    expect(res.statusCode).toBe(404);
  });
});

const QUERY_ONLY_SET = '77777777-7777-4777-8777-777777777777';
const QUERY_ONLY_SNAPSHOT = '88888888-8888-4888-8888-888888888888';
const QUERY_ONLY_DOC = '99999999-9999-4999-8999-999999999999';

function publishedSnapshot(): ProjectionSnapshot {
  return {
    snapshotId: QUERY_ONLY_SNAPSHOT,
    setId: QUERY_ONLY_SET,
    chunkingPolicyVersion: 'v1',
    documents: [
      {
        documentId: QUERY_ONLY_DOC,
        title: 'Rủi ro tín dụng',
        contentHash: 'e'.repeat(64),
        chunks: [
          {
            occurrenceId: 'occ-query-only',
            representationId: 'rep-query-only',
            contentHash: 'f'.repeat(64),
            chunkIndex: 0,
            headingPath: ['Rủi ro'],
            startLine: 1,
            endLine: 4,
            startOffset: 0,
            endOffset: 45,
            rawContent: 'Quản trị rủi ro tín dụng định kỳ theo chính sách.',
          },
        ],
      },
    ],
  };
}

function buildQueryOnlyApp(withPublishedSet: boolean) {
  const snapshotStore = new SnapshotStore();
  if (withPublishedSet) {
    snapshotStore.registerActiveSnapshot(QUERY_ONLY_SET, publishedSnapshot());
  }
  const retriever = createPerSetRetriever({ snapshotStore });
  return buildKnowledgeServer({
    token: TOKEN,
    allowedOrigins: [ORIGIN],
    federatedDeps: { retrievePerSet: retriever.retrievePerSet },
    queryOnlyDeps: {
      listPublishedSets: () => snapshotStore.listActiveSnapshots(),
      getSetReadiness: async () => 'PUBLISHED_ONLY',
    },
  }).app;
}

function postRetrieve(app: ReturnType<typeof buildKnowledgeServer>['app'], payload: unknown) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/retrieve',
    headers: { origin: ORIGIN, authorization: `Bearer ${TOKEN}` },
    payload,
  });
}

describe('Phase 28 query-only retrieve route', () => {
  it('accepts only {query, limit} and returns attributed evidence from the published snapshot', async () => {
    const app = buildQueryOnlyApp(true);
    const res = await postRetrieve(app, { query: 'rui ro tin dung', limit: 20 });
    expect(res.statusCode).toBe(200);
    const body = res.json() as FederatedRetrievalResponse;
    expect(body.outcome).toBeDefined();
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items[0]?.setId).toBe(QUERY_ONLY_SET);
    expect(body.items[0]?.snapshotId).toBe(QUERY_ONLY_SNAPSHOT);
  });

  it('returns NO_PUBLISHED_SETS at HTTP 200 for an empty server', async () => {
    const app = buildQueryOnlyApp(false);
    const res = await postRetrieve(app, { query: 'rui ro' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as FederatedRetrievalResponse;
    expect(body.outcome).toBe('NO_PUBLISHED_SETS');
    expect(body.items).toEqual([]);
    expect(body.diagnostics.coverage).toEqual([]);
  });

  it('returns DEGRADED with a full UNAVAILABLE ledger for all-unknown explicit setIds', async () => {
    const unknown1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
    const unknown2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
    const app = buildQueryOnlyApp(true);
    const res = await postRetrieve(app, { query: 'rui ro', setIds: [unknown1, unknown2] });
    expect(res.statusCode).toBe(200);
    const body = res.json() as FederatedRetrievalResponse;
    expect(body.outcome).toBe('DEGRADED');
    expect(body.diagnostics.degraded).toBe(true);
    expect(body.diagnostics.coverage).toHaveLength(2);
    for (const row of body.diagnostics.coverage) {
      expect(row.state).toBe('UNAVAILABLE');
      expect(row.publishedSnapshotId).toBeNull();
      expect(row.retrievalSnapshotId).toBeNull();
    }
    expect(body.items).toEqual([]);
    expect(res.body).not.toContain('NO_PUBLISHED_SETS');
    expect(res.body).not.toContain('NO_EVIDENCE');
    expect(body.modalityStatus.fulltext.status).not.toBe('ok');
    expect(body.modalityStatus.vector.status).not.toBe('ok');
    expect(body.modalityStatus.graph.status).not.toBe('ok');
  });

  it('searches a known set and keeps an unknown id UNAVAILABLE in a mixed restriction', async () => {
    const unknown = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const app = buildQueryOnlyApp(true);
    const res = await postRetrieve(app, { query: 'rui ro', setIds: [QUERY_ONLY_SET, unknown] });
    expect(res.statusCode).toBe(200);
    const body = res.json() as FederatedRetrievalResponse;
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items[0]?.setId).toBe(QUERY_ONLY_SET);
    const coverageRow = body.diagnostics.coverage.find((row) => row.setId === unknown);
    expect(coverageRow?.state).toBe('UNAVAILABLE');
    expect(coverageRow?.publishedSnapshotId).toBeNull();
  });
});
