import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeKnowledgeRetrievalTool } from '../../src/services/ai/knowledgeRetrievalTool';

const SET_A = '10000000-0000-4000-8000-000000000001';
const SET_B = '20000000-0000-4000-8000-000000000002';
const SNAP_A = 'gsnap_11111111';

const mocks = vi.hoisted(() => ({
  retrieveFederated: vi.fn(),
  fetchSetCatalog: vi.fn(),
}));

vi.mock('../../src/services/knowledge/knowledgeClient', () => ({
  createKnowledgeClient: () => ({ retrieveFederated: mocks.retrieveFederated }),
}));

vi.mock('../../src/db/repositories/documentSetRepo', () => ({
  fetchSetCatalog: (...args: unknown[]) => mocks.fetchSetCatalog(...args),
}));

function dbWithSettings(entries: Record<string, unknown>) {
  return {
    settings: {
      get: async (key: string) => (key in entries ? { key, value: entries[key] } : undefined),
    },
  } as any;
}

const enabledDb = () =>
  dbWithSettings({
    knowledge_server_enabled: true,
    knowledge_server_base_url: 'http://127.0.0.1:3001',
    knowledge_server_token: 'token',
  });

const attributedResponse = () => ({
  outcome: 'READY',
  items: [
    {
      setId: SET_A,
      snapshotId: SNAP_A,
      roleGroup: 'baseline',
      item: {
        type: 'chunk',
        id: 'chunk-1',
        score: 10,
        modalitiesContributed: ['vector'],
        sourceDocumentId: '00000000-0000-4000-8000-000000000001',
        sourceDocumentTitle: 'Spec',
        sectionAnchor: 'Section 1',
        lineStart: 1,
        lineEnd: 5,
        rawSnippet: 'EVT_EVENT payload',
        publishedContentHash: 'a'.repeat(64),
        snapshotId: SNAP_A,
        hasConflict: false,
      },
    },
  ],
  paths: [],
  conflictGroups: [],
  modalityStatus: {
    fulltext: { status: 'ok', latencyMs: 1, itemCount: 1 },
    vector: { status: 'ok', latencyMs: 1, itemCount: 1 },
    graph: { status: 'ok', latencyMs: 1, itemCount: 0 },
  },
  diagnostics: {
    degraded: false,
    coverageWarnings: [],
    coverage: [
      {
        setId: SET_A,
        state: 'CONTRIBUTED',
        publishedSnapshotId: SNAP_A,
        retrievalSnapshotId: SNAP_A,
        staleIndex: false,
      },
    ],
  },
});

describe('executeKnowledgeRetrievalTool', () => {
  beforeEach(() => {
    mocks.retrieveFederated.mockReset();
    mocks.fetchSetCatalog.mockReset();
    mocks.fetchSetCatalog.mockResolvedValue([]);
    mocks.retrieveFederated.mockResolvedValue(attributedResponse());
  });

  it('requires a query string', async () => {
    const res = JSON.parse(await executeKnowledgeRetrievalTool({}, dbWithSettings({})));
    expect(res.error).toMatch(/query/i);
  });

  it('reports unconfigured knowledge server instead of calling it', async () => {
    const db = dbWithSettings({ knowledge_server_enabled: false });
    const res = JSON.parse(await executeKnowledgeRetrievalTool({ query: 'EVT_EVENT' }, db));
    expect(res.error).toMatch(/Knowledge server/i);
  });

  it('sends a thin query-only wire body and never consults the local catalog', async () => {
    const res = JSON.parse(await executeKnowledgeRetrievalTool({ query: 'EVT_EVENT' }, enabledDb()));

    expect(mocks.retrieveFederated).toHaveBeenCalledTimes(1);
    expect(mocks.fetchSetCatalog).not.toHaveBeenCalled();
    expect(mocks.retrieveFederated.mock.calls[0]![0]).toEqual({
      query: 'EVT_EVENT',
      limit: 20,
      includeInferred: true,
      recentTurns: [],
    });
    const body = mocks.retrieveFederated.mock.calls[0]![0];
    expect(body).not.toHaveProperty('budgets');
    expect(body).not.toHaveProperty('comparisonMode');
    expect(body).not.toHaveProperty('setTierAssignments');
    expect(res.outcome).toBe('READY');
  });

  it('returns empty-catalog results with set/snapshot attribution and status, no error string', async () => {
    const res = JSON.parse(await executeKnowledgeRetrievalTool({ query: 'EVT_EVENT' }, enabledDb()));

    expect(res.error).toBeUndefined();
    expect(res).toHaveProperty('outcome');
    expect(res).toHaveProperty('warnings');
    expect(res).toHaveProperty('sets');
    expect(res).toHaveProperty('status');
    expect(res.status).toEqual({
      code: 'READY',
      publishedSetCount: 1,
      searchedSetCount: 1,
      contributedSetCount: 1,
    });
    expect(res.excerpts[0]).toHaveProperty('setId', SET_A);
    expect(res.excerpts[0]).toHaveProperty('snapshotId', SNAP_A);
    expect(res.sets).toEqual([
      {
        setId: SET_A,
        state: 'CONTRIBUTED',
        publishedSnapshotId: SNAP_A,
        retrievalSnapshotId: SNAP_A,
        staleIndex: false,
      },
    ]);
  });

  it('forwards explicit setIds exactly, with no catalog lookup', async () => {
    await executeKnowledgeRetrievalTool({ query: 'EVT_EVENT', setIds: [SET_B, SET_A] }, enabledDb());

    expect(mocks.fetchSetCatalog).not.toHaveBeenCalled();
    expect(mocks.retrieveFederated.mock.calls[0]![0].setIds).toEqual([SET_B, SET_A]);
  });

  it('keeps the 10..50 limit clamp', async () => {
    await executeKnowledgeRetrievalTool({ query: 'EVT_EVENT', limit: 999 }, enabledDb());
    expect(mocks.retrieveFederated.mock.calls[0]![0].limit).toBe(50);

    mocks.retrieveFederated.mockClear();
    await executeKnowledgeRetrievalTool({ query: 'EVT_EVENT', limit: 1 }, enabledDb());
    expect(mocks.retrieveFederated.mock.calls[0]![0].limit).toBe(10);
  });

  it('forwards the abort signal to retrieveFederated', async () => {
    const controller = new AbortController();
    await executeKnowledgeRetrievalTool({ query: 'EVT_EVENT' }, enabledDb(), controller.signal);
    expect(mocks.retrieveFederated.mock.calls[0]![1]).toBe(controller.signal);
  });

  it('rejects with AbortError when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      executeKnowledgeRetrievalTool({ query: 'EVT_EVENT' }, enabledDb(), controller.signal)
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocks.retrieveFederated).not.toHaveBeenCalled();
  });

  it('rethrows AbortError raised during retrieval instead of returning an error payload', async () => {
    mocks.retrieveFederated.mockRejectedValue(new DOMException('Aborted', 'AbortError'));
    await expect(
      executeKnowledgeRetrievalTool({ query: 'EVT_EVENT' }, enabledDb(), new AbortController().signal)
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('keeps non-abort failures as a JSON error payload', async () => {
    mocks.retrieveFederated.mockRejectedValue(new Error('server down'));
    const res = JSON.parse(
      await executeKnowledgeRetrievalTool({ query: 'EVT_EVENT' }, enabledDb(), new AbortController().signal)
    );
    expect(res.error).toMatch(/server down/);
  });

  it('returns a machine-readable status for NO_PUBLISHED_SETS without canonical prose', async () => {
    mocks.retrieveFederated.mockResolvedValueOnce({
      ...attributedResponse(),
      outcome: 'NO_PUBLISHED_SETS',
      items: [],
      diagnostics: { degraded: false, coverageWarnings: [], coverage: [] },
    });
    const res = JSON.parse(await executeKnowledgeRetrievalTool({ query: 'EVT_EVENT' }, enabledDb()));
    expect(res.status.code).toBe('NO_PUBLISHED_SETS');
    expect(JSON.stringify(res)).not.toContain('Knowledge Server chưa có bộ tài liệu nào');
  });
});
