/// <reference types="node" />
/**
 * Phase 28-05 Task 1 — end-to-end server contract for zero-local-docs retrieval.
 *
 * The real route handler, server-authoritative resolver and federated fan-out
 * are wired together. Only the per-set retrieval content and the SnapshotStore
 * contents are fixtures; the route, resolver, scope resolution, coverage ledger
 * and response validation are the production code under test. Every assertion
 * is on observable HTTP status and response-body fields.
 */
import { describe, expect, it } from 'vitest';
import { buildKnowledgeServer } from '../src/server.js';
import { SnapshotStore } from '../src/indexing/snapshotStore.js';
import { createPerSetRetriever, type PerSetRetriever } from '../src/services/perSetRetrievalRouter.js';
import type { ProjectionSnapshot } from '../src/indexing/incrementalProjector.js';
import type {
  FederatedRetrievalResponse,
  RetrievalResponse,
} from '../src/types/retrievalProtocol.js';
import type { FederatedRetrievalDependencies } from '../src/services/federatedRetrievalService.js';
import type { SetReadiness } from '../src/services/publishedSetDiscovery.js';

const ORIGIN = 'https://planner.example';
const TOKEN = 'server-test-token-very-secret';

const SET_PUBLISHED_ONLY = '11111111-1111-4111-8111-111111111111';
const SNAP_PUBLISHED_ONLY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DOC_PUBLISHED_ONLY = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const SET_GRAPH_READY = '22222222-2222-4222-8222-222222222222';
const SNAP_GRAPH_READY = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DOC_GRAPH_READY = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

interface PublishedFixture {
  setId: string;
  snapshotId: string;
  docId: string;
  title: string;
  content: string;
}

function snapshotFor(fixture: PublishedFixture): ProjectionSnapshot {
  return {
    snapshotId: fixture.snapshotId,
    setId: fixture.setId,
    chunkingPolicyVersion: 'v1',
    documents: [
      {
        documentId: fixture.docId,
        title: fixture.title,
        contentHash: 'e'.repeat(64),
        chunks: [
          {
            occurrenceId: `occ-${fixture.setId}`,
            representationId: `rep-${fixture.setId}`,
            contentHash: 'f'.repeat(64),
            chunkIndex: 0,
            headingPath: ['Rủi ro'],
            startLine: 1,
            endLine: 4,
            startOffset: 0,
            endOffset: fixture.content.length,
            rawContent: fixture.content,
          },
        ],
      },
    ],
  };
}

const PUBLISHED_ONLY: PublishedFixture = {
  setId: SET_PUBLISHED_ONLY,
  snapshotId: SNAP_PUBLISHED_ONLY,
  docId: DOC_PUBLISHED_ONLY,
  title: 'Chính sách rủi ro tín dụng',
  content: 'Quản trị rủi ro tín dụng định kỳ theo chính sách.',
};

const GRAPH_READY: PublishedFixture = {
  setId: SET_GRAPH_READY,
  snapshotId: SNAP_GRAPH_READY,
  docId: DOC_GRAPH_READY,
  title: 'Quy trình rủi ro tín dụng',
  content: 'Rủi ro tín dụng được rà soát theo quy trình nội bộ.',
};

type PerSetFn = FederatedRetrievalDependencies['retrievePerSet'];

function buildE2EApp(options: {
  published?: PublishedFixture[];
  readiness?: Record<string, SetReadiness>;
  perSetOverride?: (base: PerSetRetriever) => PerSetFn;
}) {
  const snapshotStore = new SnapshotStore();
  for (const fixture of options.published ?? []) {
    snapshotStore.registerActiveSnapshot(fixture.setId, snapshotFor(fixture));
  }
  const base = createPerSetRetriever({ snapshotStore });
  const retrievePerSet: PerSetFn = options.perSetOverride
    ? options.perSetOverride(base)
    : (setId, request, signal) => base.retrievePerSet(setId, request, signal);

  return buildKnowledgeServer({
    token: TOKEN,
    allowedOrigins: [ORIGIN],
    federatedDeps: { retrievePerSet },
    queryOnlyDeps: {
      listPublishedSets: () => snapshotStore.listActiveSnapshots(),
      getSetReadiness: async (setId) => options.readiness?.[setId] ?? 'PUBLISHED_ONLY',
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

/** A per-set response carrying one real chunk plus a path whose hop cites an id that was never returned. */
function graphResponseWithOrphanPath(snapshotId: string): RetrievalResponse {
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
    items: [
      {
        type: 'chunk',
        id: 'chunk-real',
        score: 0.9,
        modalitiesContributed: ['fulltext'],
        sourceDocumentId: DOC_GRAPH_READY,
        sourceDocumentTitle: 'Graph doc',
        sectionAnchor: 'intro',
        lineStart: 1,
        lineEnd: 5,
        rawSnippet: 'rui ro tin dung',
        publishedContentHash: '0'.repeat(64),
        snapshotId,
        hasConflict: false,
      },
    ],
    paths: [
      {
        pathId: 'P1',
        snapshotId,
        nodeUrns: ['urn:plannermate:test:Entity:A', 'urn:plannermate:test:Entity:B'],
        edgeFactKeys: ['a'.repeat(64)],
        hopClassifications: ['OBSERVED'],
        hopCitationIds: [['chunk-orphan']],
        hasConflict: false,
        classification: 'OBSERVED',
      },
    ],
    conflictGroups: [],
    totalCandidates: 1,
    modalitiesUsed: ['fulltext', 'graph'],
    modalityStatus: {
      fulltext: { status: 'ok', latencyMs: 5, itemCount: 1 },
      vector: { status: 'ok', latencyMs: 5, itemCount: 0 },
      graph: { status: 'ok', latencyMs: 5, itemCount: 1 },
    },
    diagnostics: { degraded: false },
    planTrace: { fastPath: true, degradedFallback: false },
  } as RetrievalResponse;
}

describe('Phase 28-05 server end-to-end: thin wire in, attributed federated answer out', () => {
  it('zero-local-docs {query, limit} over two published sets (published-only + graph-ready) returns attributed items and one coverage row per set', async () => {
    const app = buildE2EApp({
      published: [PUBLISHED_ONLY, GRAPH_READY],
      readiness: {
        [SET_PUBLISHED_ONLY]: 'PUBLISHED_ONLY',
        [SET_GRAPH_READY]: 'GRAPH_READY',
      },
    });

    const res = await postRetrieve(app, { query: 'rui ro tin dung', limit: 20 });
    expect(res.statusCode).toBe(200);

    const body = res.json() as FederatedRetrievalResponse;
    expect(body.items.length).toBeGreaterThan(0);
    const bySet = new Map([
      [SET_PUBLISHED_ONLY, SNAP_PUBLISHED_ONLY],
      [SET_GRAPH_READY, SNAP_GRAPH_READY],
    ]);
    for (const item of body.items) {
      expect(bySet.has(item.setId)).toBe(true);
      expect(item.snapshotId).toBe(bySet.get(item.setId));
    }
    // One coverage row per published set, no fabricated snapshots.
    expect(body.diagnostics.coverage).toHaveLength(2);
    expect(new Set(body.diagnostics.coverage.map((row) => row.setId))).toEqual(
      new Set([SET_PUBLISHED_ONLY, SET_GRAPH_READY])
    );
    for (const row of body.diagnostics.coverage) {
      expect(row.publishedSnapshotId).toBe(bySet.get(row.setId));
    }
  });

  it('zero-local-docs explicit setIds:[known] searches only that set; the other published set is absent from discovery', async () => {
    const app = buildE2EApp({
      published: [PUBLISHED_ONLY, GRAPH_READY],
      readiness: {
        [SET_PUBLISHED_ONLY]: 'PUBLISHED_ONLY',
        [SET_GRAPH_READY]: 'GRAPH_READY',
      },
    });

    const res = await postRetrieve(app, { query: 'rui ro tin dung', limit: 20, setIds: [SET_PUBLISHED_ONLY] });
    expect(res.statusCode).toBe(200);

    const body = res.json() as FederatedRetrievalResponse;
    expect(body.items.length).toBeGreaterThan(0);
    for (const item of body.items) {
      expect(item.setId).toBe(SET_PUBLISHED_ONLY);
      expect(item.snapshotId).toBe(SNAP_PUBLISHED_ONLY);
    }
    expect(body.items.some((item) => item.setId === SET_GRAPH_READY)).toBe(false);
    // Only the explicitly requested set appears in the ledger.
    expect(body.diagnostics.coverage.map((row) => row.setId)).toEqual([SET_PUBLISHED_ONLY]);
  });

  it('all-unknown explicit setIds returns HTTP 200 DEGRADED with a full UNAVAILABLE ledger', async () => {
    const unknown1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
    const unknown2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
    const app = buildE2EApp({ published: [PUBLISHED_ONLY, GRAPH_READY] });

    const res = await postRetrieve(app, { query: 'rui ro', setIds: [unknown1, unknown2] });
    expect(res.statusCode).toBe(200);

    const body = res.json() as FederatedRetrievalResponse;
    expect(body.outcome).toBe('DEGRADED');
    expect(body.diagnostics.degraded).toBe(true);
    expect(body.diagnostics.coverage).toHaveLength(2);
    expect(new Set(body.diagnostics.coverage.map((row) => row.setId))).toEqual(new Set([unknown1, unknown2]));
    for (const row of body.diagnostics.coverage) {
      expect(row.state).toBe('UNAVAILABLE');
      expect(row.publishedSnapshotId).toBeNull();
      expect(row.retrievalSnapshotId).toBeNull();
    }
    expect(body.items).toEqual([]);
    expect(res.body).not.toContain('NO_PUBLISHED_SETS');
    expect(res.body).not.toContain('NO_EVIDENCE');
  });

  it('a real published-only lexical no-match is NO_EVIDENCE (not DEGRADED) with full SEARCHED_NO_EVIDENCE coverage', async () => {
    // WR-01 regression: the real snapshot-lexical no-match path reports an ok-empty
    // fulltext modality. The federated aggregator must not escalate the structural
    // vector/graph absence to DEGRADED, so D-15 routes the client to refine.
    const app = buildE2EApp({ published: [PUBLISHED_ONLY] });

    // These tokens match no chunk in the published snapshot (title/body are about
    // "rui ro tin dung"), exercising the genuine empty-lexical path end-to-end.
    const res = await postRetrieve(app, { query: 'zzzzzqqqxxyy notfound', limit: 20 });
    expect(res.statusCode).toBe(200);

    const body = res.json() as FederatedRetrievalResponse;
    expect(body.outcome).toBe('NO_EVIDENCE');
    expect(body.diagnostics.degraded).toBe(false);
    expect(body.items).toEqual([]);
    // Full coverage for the one searched published set, correctly attributed.
    expect(body.diagnostics.coverage).toHaveLength(1);
    expect(body.diagnostics.coverage[0]).toMatchObject({
      setId: SET_PUBLISHED_ONLY,
      state: 'SEARCHED_NO_EVIDENCE',
      publishedSnapshotId: SNAP_PUBLISHED_ONLY,
      retrievalSnapshotId: SNAP_PUBLISHED_ONLY,
      staleIndex: false,
    });
    // The searched modality is ok but empty; vector/graph remain truthfully
    // disclosed as unavailable, which must not escalate the outcome to DEGRADED.
    expect(body.modalityStatus.fulltext.status).toBe('ok');
    expect(body.modalityStatus.fulltext.itemCount).toBe(0);
  });

  it('NO_PUBLISHED_SETS at HTTP 200 with an empty ledger when zero sets are published', async () => {
    const app = buildE2EApp({ published: [] });

    const res = await postRetrieve(app, { query: 'rui ro' });
    expect(res.statusCode).toBe(200);

    const body = res.json() as FederatedRetrievalResponse;
    expect(body.outcome).toBe('NO_PUBLISHED_SETS');
    expect(body.items).toEqual([]);
    expect(body.diagnostics.coverage).toEqual([]);
    expect(body.diagnostics.degraded).toBe(false);
  });

  it('zero-local-docs: an orphan hop path in a mocked per-set response never reaches a validated 200 response', async () => {
    const app = buildE2EApp({
      published: [GRAPH_READY],
      readiness: { [SET_GRAPH_READY]: 'GRAPH_READY' },
      perSetOverride: () => async () => graphResponseWithOrphanPath(SNAP_GRAPH_READY),
    });

    const res = await postRetrieve(app, { query: 'rui ro', limit: 20 });
    // The federated response schema rejects the orphan hop citation, so the
    // route fails closed with a safe 500 — never a 200 carrying the bad path.
    expect(res.statusCode).not.toBe(200);
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Request could not be processed.' },
    });
    expect(res.body).not.toContain('chunk-orphan');
    expect(res.body).not.toContain('P1');
  });
});
