/// <reference types="node" />
import { describe, expect, it, vi } from 'vitest';
import { createPerSetRetriever } from '../src/services/perSetRetrievalRouter.js';
import type { ProjectionSnapshot } from '../src/indexing/incrementalProjector.js';
import type { RetrievalResponse } from '../src/types/retrievalProtocol.js';

const SET_ID = '44444444-4444-4444-8444-444444444444';
const SNAPSHOT_ID = '55555555-5555-4555-8555-555555555555';
const DOC_ID = '66666666-6666-4666-8666-666666666666';

const snapshot: ProjectionSnapshot = {
  snapshotId: SNAPSHOT_ID,
  setId: SET_ID,
  chunkingPolicyVersion: 'v1',
  documents: [
    {
      documentId: DOC_ID,
      title: 'Rủi ro tín dụng',
      contentHash: 'c'.repeat(64),
      chunks: [
        {
          occurrenceId: 'occ-1',
          representationId: 'rep-1',
          contentHash: 'd'.repeat(64),
          chunkIndex: 0,
          headingPath: ['Rủi ro'],
          startLine: 1,
          endLine: 5,
          startOffset: 0,
          endOffset: 50,
          rawContent: 'Quản trị rủi ro tín dụng định kỳ.',
        },
      ],
    },
  ],
};

const request = { query: 'rui ro tin dung', limit: 20, includeInferred: false, recentTurns: [] };

function graphResponse(overrides: Partial<RetrievalResponse> = {}): RetrievalResponse {
  return {
    outcome: 'READY',
    snapshotId: SNAPSHOT_ID,
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
        id: 'graph-chunk',
        score: 1,
        modalitiesContributed: ['fulltext', 'graph'],
        sourceDocumentId: DOC_ID,
        sourceDocumentTitle: 'Rủi ro',
        sectionAnchor: 'root',
        lineStart: 1,
        lineEnd: 2,
        rawSnippet: 'graph evidence',
        publishedContentHash: 'c'.repeat(64),
        snapshotId: SNAPSHOT_ID,
        hasConflict: false,
      },
    ],
    paths: [],
    conflictGroups: [],
    totalCandidates: 1,
    modalitiesUsed: ['fulltext', 'graph'],
    modalityStatus: {
      fulltext: { status: 'ok', latencyMs: 1, itemCount: 1 },
      vector: { status: 'ok', latencyMs: 1, itemCount: 0 },
      graph: { status: 'ok', latencyMs: 1, itemCount: 0 },
    },
    diagnostics: { degraded: false },
    planTrace: { fastPath: true, degradedFallback: false },
    ...overrides,
  } as RetrievalResponse;
}

function unavailableGraphResponse(): RetrievalResponse {
  return graphResponse({
    outcome: 'NO_EVIDENCE',
    items: [],
    totalCandidates: 0,
    modalitiesUsed: [],
    reason: 'PINNED_SNAPSHOT_UNAVAILABLE',
    suggestedRefinements: ['rebuild graph'],
    modalityStatus: {
      fulltext: { status: 'unavailable', latencyMs: 0, itemCount: 0, reason: 'PINNED_SNAPSHOT_UNAVAILABLE' },
      vector: { status: 'unavailable', latencyMs: 0, itemCount: 0, reason: 'PINNED_SNAPSHOT_UNAVAILABLE' },
      graph: { status: 'unavailable', latencyMs: 0, itemCount: 0, reason: 'PINNED_SNAPSHOT_UNAVAILABLE' },
    },
  } as RetrievalResponse);
}

describe('perSetRetrievalRouter (Phase 28 Task 2)', () => {
  it('serves a published-but-unbuilt set through snapshot-lexical retrieval', async () => {
    const retriever = createPerSetRetriever({ snapshotStore: { getActiveSnapshot: () => snapshot } });
    const result = await retriever.retrievePerSet(SET_ID, request);
    expect(result.outcome).toBe('READY');
    expect(result.reason).not.toBe('PINNED_SNAPSHOT_UNAVAILABLE');
    expect(result.items[0]?.snapshotId).toBe(SNAPSHOT_ID);
    expect(result.modalityStatus.fulltext.reason).toBe('SNAPSHOT_LEXICAL');
  });

  it('falls back to lexical retrieval when the service reports PINNED_SNAPSHOT_UNAVAILABLE', async () => {
    const retrieve = vi.fn().mockResolvedValue(unavailableGraphResponse());
    const retriever = createPerSetRetriever({
      snapshotStore: { getActiveSnapshot: () => snapshot },
      retrievalService: { retrieve },
    });
    const result = await retriever.retrievePerSet(SET_ID, request);
    expect(retrieve).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe('READY');
    expect(result.items[0]?.snapshotId).toBe(SNAPSHOT_ID);
  });

  it('passes through real graph evidence unchanged', async () => {
    const expected = graphResponse();
    const retrieve = vi.fn().mockResolvedValue(expected);
    const retriever = createPerSetRetriever({
      snapshotStore: { getActiveSnapshot: () => snapshot },
      retrievalService: { retrieve },
    });
    const result = await retriever.retrievePerSet(SET_ID, request);
    expect(result).toBe(expected);
  });

  it('returns truthful all-modalities-unavailable when no snapshot exists', async () => {
    const retriever = createPerSetRetriever({ snapshotStore: { getActiveSnapshot: () => null } });
    const result = await retriever.retrievePerSet(SET_ID, request);
    expect(result.reason).toBe('NO_SEARCHABLE_SNAPSHOT');
    expect(result.items).toEqual([]);
    expect(result.modalityStatus.fulltext.status).toBe('unavailable');
    expect(result.modalityStatus.vector.status).toBe('unavailable');
    expect(result.modalityStatus.graph.status).toBe('unavailable');
    expect(result.snapshotId).toBe('gsnap_00000000');
  });
});
