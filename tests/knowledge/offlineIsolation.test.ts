import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db';
import { createNote, permanentDeleteNote, updateNote } from '../../src/db/repositories/noteRepo';
import { getDocumentPublishStatuses } from '../../src/db/repositories/documentSetRepo';
import { rankBM25 } from '../../src/utils/bm25';
import { createKnowledgeClient, KnowledgeClientError } from '../../src/services/knowledge/knowledgeClient';
import { runGroundedTurn, type GroundedTurnDeps, type GroundedTurnInput } from '../../src/services/ai/groundedTurn';
import { packEvidence } from '../../src/services/ai/evidencePack';
import { runLocalGroundedRetrieval } from '../../src/services/search/localGroundedRetrieval';

const databases: TaskPlannerDatabase[] = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.delete()));
  vi.unstubAllGlobals();
});

describe('optional daemon outage isolation', () => {
  it('keeps local CRUD, autosave-equivalent edits, folder moves, navigation data, BM25, and cached status with zero egress', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('daemon unavailable'));
    vi.stubGlobal('fetch', fetcher);
    const database = new TaskPlannerDatabase(`offline-isolation-${crypto.randomUUID()}`);
    databases.push(database);
    await database.open();

    const folder = await createNote({ title: 'Thư mục nghiệp vụ', body: '', type: 'folder' }, database);
    const document = await createNote({ title: 'Quy trình thẻ', body: '# Quy trình thẻ', type: 'document' }, database);
    await updateNote(document.id, { parentId: folder.id, body: '# Quy trình thẻ\nTra cứu ngoại tuyến' }, database);
    const navigation = await database.notes.where('parentId').equals(folder.id).toArray();
    expect(navigation.map((item) => item.id)).toContain(document.id);

    expect(rankBM25('tra cuu ngoai tuyen', navigation.map((item) => ({
      id: item.id, title: item.title ?? '', body: item.body, tags: item.tags ?? [],
    })))[0]?.doc.id).toBe(document.id);

    await database.documentSets.add({
      id: 'set-a', name: 'Bộ nghiệp vụ', documentIds: [document.id], createdAt: document.createdAt, updatedAt: document.updatedAt,
    });
    await database.publishAttempts.add({
      id: 'attempt-a', setId: 'set-a', startedAt: document.createdAt, status: 'Warning',
      addedCount: 1, changedCount: 0, removedCount: 0, unchangedCount: 0, warningCount: 1,
    });
    await database.publishedDocuments.add({
      setId: 'set-a', documentId: document.id, lastKnownRemoteAt: document.updatedAt,
      publishedContentHash: '0'.repeat(64), lastPrimaryState: 'Warning',
    });
    expect((await getDocumentPublishStatuses([document.id], database))[document.id]).toMatchObject({ aggregateState: 'Warning' });
    expect(await database.publishAttempts.get('attempt-a')).toMatchObject({ status: 'Warning', warningCount: 1 });

    await permanentDeleteNote(document.id, database);
    expect(await database.notes.get(document.id)).toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('starts local persistence and search without daemon process or configuration', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const database = new TaskPlannerDatabase(`no-daemon-startup-${crypto.randomUUID()}`);
    databases.push(database);
    await database.open();
    const document = await createNote({ title: 'Khởi động cục bộ', body: 'Không cần máy chủ tri thức', type: 'document' }, database);

    expect(await database.notes.get(document.id)).toEqual(document);
    expect(rankBM25('khoi dong cuc bo', [{ id: document.id, title: document.title ?? '', body: document.body, tags: document.tags ?? [] }])).toHaveLength(1);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('gracefully reports NETWORK_ERROR for graph status and rebuild when daemon is offline without throwing unhandled exceptions', async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const client = createKnowledgeClient({
      baseUrl: 'http://127.0.0.1:3001',
      token: 'test-token',
      fetcher,
    });

    await expect(client.getGraphStatus('60000006-0000-4000-8000-000000000000')).rejects.toThrow(KnowledgeClientError);
    await expect(client.getGraphStatus('60000006-0000-4000-8000-000000000000')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });

    await expect(client.triggerGraphRebuild('60000006-0000-4000-8000-000000000000', 'rebuild-1')).rejects.toThrow(KnowledgeClientError);
    await expect(client.triggerGraphRebuild('60000006-0000-4000-8000-000000000000', 'rebuild-1')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });

  // MODE A: Daemon Disabled (serverEnabled: false)
  it('Transport Mode A (SERVER_DISABLED): falls back to local BM25 with zero network calls', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);

    const database = new TaskPlannerDatabase(`server-disabled-${crypto.randomUUID()}`);
    databases.push(database);
    await database.open();

    const note = await createNote(
      {
        title: 'Tài liệu không máy chủ',
        body: 'Thông tin tài liệu cục bộ chỉ đọc.',
        type: 'document',
      },
      database
    );

    const setId = '20000000-0000-4000-8000-000000000002';
    await database.documentSets.add({
      id: setId,
      name: 'Bộ tài liệu cục bộ',
      documentIds: [note.id],
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    });

    const deps: GroundedTurnDeps = {
      routeIntent: vi.fn().mockResolvedValue({ route: 'knowledge', confidence: 1 }),
      routeScope: vi.fn().mockResolvedValue({
        setTierAssignments: [{ setId, tier: 'REQUIRED', roleGroup: 'baseline' }],
        comparisonMode: 'single',
        routerSource: 'base_default',
      }),
      retrieveFederated: vi.fn(),
      runLocalBm25: (inp, d) => runLocalGroundedRetrieval(inp, d),
      localBm25Deps: {
        loadSetMembers: async (setIds) => {
          const sets = await database.documentSets.where('id').anyOf(setIds).toArray();
          return sets.flatMap((s) => (s.documentIds ?? []).map((docId) => ({ setId: s.id, setName: s.name, documentId: docId })));
        },
        loadNoteBody: async (docId) => {
          const n = await database.notes.get(docId);
          return n ? { title: n.title, body: n.body, updatedAt: n.updatedAt } : null;
        },
      },
      packEvidence: (inp) => packEvidence(inp),
      synthesizeGroundedAnswer: vi.fn().mockResolvedValue({
        answer: {
          schemaVersion: 1,
          language: 'vi',
          conclusion: 'Thông tin tài liệu cục bộ chỉ đọc.',
          claims: [
            {
              id: 'C1',
              text: 'Thông tin tài liệu cục bộ chỉ đọc.',
              classification: 'DIRECT',
              citationIds: ['L1'],
              pathId: null,
            },
          ],
          unsupportedParts: [],
        },
        attempts: [],
        responseLanguage: 'vi',
      }),
      now: () => '2026-10-11T12:00:00.000Z',
    };

    const input: GroundedTurnInput = {
      query: 'Tài liệu cục bộ ghi gì?',
      recentTurns: [],
      signal: new AbortController().signal,
      capabilities: { serverEnabled: false, modelConfigured: true },
      config: {
        endpoint: 'https://api.9router.com',
        apiKey: 'test-key',
        model: 'gpt-4o',
        promptVersion: 'v1.0',
        routerVersion: 'v1.0',
      },
      catalog: [
        {
          setId,
          canonicalName: 'Bộ tài liệu cục bộ',
          domain: 'General',
          environment: null,
          version: null,
          aliases: [],
          relation: null,
          isBase: true,
        },
      ],
      recentSessionId: 'sess-2',
    };

    const result = await runGroundedTurn(input, deps);

    expect(result.kind).toBe('grounded_answer');
    if (result.kind === 'grounded_answer') {
      expect(result.grounding.outcome).toBe('LOCAL_FALLBACK_SYNTHESIS');
      expect(result.grounding.fallbackReason).toBe('SERVER_DISABLED');
      expect(result.grounding.authority).toBe('local');
    }

    expect(fetcher).not.toHaveBeenCalled();
  });

  // MODE B: Connection Refused (NETWORK_ERROR)
  it('Transport Mode B (NETWORK_ERROR): falls back to local BM25 with zero subsequent egress', async () => {
    const database = new TaskPlannerDatabase(`grounded-network-error-${crypto.randomUUID()}`);
    databases.push(database);
    await database.open();

    const note = await createNote(
      {
        title: 'Quy trình thẻ tín dụng nội bộ',
        body: 'Quy trình trích nợ tự động chạy ngày 25 hàng tháng cho toàn bộ thẻ tín dụng.',
        type: 'document',
      },
      database
    );

    const setId = '10000000-0000-4000-8000-000000000001';
    await database.documentSets.add({
      id: setId,
      name: 'Bộ quy trình thẻ',
      documentIds: [note.id],
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    });

    const networkSpy = vi.fn().mockRejectedValue(new KnowledgeClientError('NETWORK_ERROR', 'Connection refused'));

    const deps: GroundedTurnDeps = {
      routeIntent: vi.fn().mockResolvedValue({ route: 'knowledge', confidence: 1 }),
      routeScope: vi.fn().mockResolvedValue({
        setTierAssignments: [{ setId, tier: 'REQUIRED', roleGroup: 'baseline' }],
        comparisonMode: 'single',
        routerSource: 'base_default',
      }),
      retrieveFederated: networkSpy,
      runLocalBm25: (inp, d) => runLocalGroundedRetrieval(inp, d),
      localBm25Deps: {
        loadSetMembers: async (setIds) => {
          const sets = await database.documentSets.where('id').anyOf(setIds).toArray();
          return sets.flatMap((s) => (s.documentIds ?? []).map((docId) => ({ setId: s.id, setName: s.name, documentId: docId })));
        },
        loadNoteBody: async (docId) => {
          const n = await database.notes.get(docId);
          return n ? { title: n.title, body: n.body, updatedAt: n.updatedAt } : null;
        },
      },
      packEvidence: (inp) => packEvidence(inp),
      synthesizeGroundedAnswer: vi.fn().mockResolvedValue({
        answer: {
          schemaVersion: 1,
          language: 'vi',
          conclusion: 'Quy trình trích nợ tự động chạy ngày 25 hàng tháng.',
          claims: [
            {
              id: 'C1',
              text: 'Quy trình trích nợ tự động chạy ngày 25 hàng tháng.',
              classification: 'DIRECT',
              citationIds: ['L1'],
              pathId: null,
            },
          ],
          unsupportedParts: [],
        },
        attempts: [],
        responseLanguage: 'vi',
      }),
      now: () => '2026-10-11T12:00:00.000Z',
    };

    const input: GroundedTurnInput = {
      query: 'Quy trình trích nợ tự động chạy ngày nào?',
      recentTurns: [],
      signal: new AbortController().signal,
      capabilities: { serverEnabled: true, modelConfigured: true },
      config: {
        endpoint: 'https://api.9router.com',
        apiKey: 'test-key',
        model: 'gpt-4o',
        promptVersion: 'v1.0',
        routerVersion: 'v1.0',
      },
      catalog: [
        {
          setId,
          canonicalName: 'Bộ quy trình thẻ',
          domain: 'General',
          environment: null,
          version: null,
          aliases: [],
          relation: null,
          isBase: true,
        },
      ],
      recentSessionId: 'sess-1',
    };

    const result = await runGroundedTurn(input, deps);

    expect(result.kind).toBe('grounded_answer');
    if (result.kind === 'grounded_answer') {
      expect(result.grounding.outcome).toBe('LOCAL_FALLBACK_SYNTHESIS');
      expect(result.grounding.fallbackReason).toBe('NETWORK_ERROR');
      expect(result.grounding.authority).toBe('local');
    }

    expect(networkSpy).toHaveBeenCalledTimes(1);
  });

  // MODE C: Request Timeout (TIMEOUT)
  it('Transport Mode C (TIMEOUT): falls back to local BM25 with zero subsequent egress', async () => {
    const database = new TaskPlannerDatabase(`grounded-timeout-${crypto.randomUUID()}`);
    databases.push(database);
    await database.open();

    const note = await createNote(
      {
        title: 'Tài liệu timeout',
        body: 'Nội dung tìm kiếm cục bộ khi máy chủ timeout.',
        type: 'document',
      },
      database
    );

    const setId = '30000000-0000-4000-8000-000000000003';
    await database.documentSets.add({
      id: setId,
      name: 'Bộ timeout',
      documentIds: [note.id],
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    });

    const timeoutSpy = vi.fn().mockRejectedValue(new KnowledgeClientError('TIMEOUT', 'Timeout from server'));

    const deps: GroundedTurnDeps = {
      routeIntent: vi.fn().mockResolvedValue({ route: 'knowledge', confidence: 1 }),
      routeScope: vi.fn().mockResolvedValue({
        setTierAssignments: [{ setId, tier: 'REQUIRED', roleGroup: 'baseline' }],
        comparisonMode: 'single',
        routerSource: 'base_default',
      }),
      retrieveFederated: timeoutSpy,
      runLocalBm25: (inp, d) => runLocalGroundedRetrieval(inp, d),
      localBm25Deps: {
        loadSetMembers: async (setIds) => {
          const sets = await database.documentSets.where('id').anyOf(setIds).toArray();
          return sets.flatMap((s) => (s.documentIds ?? []).map((docId) => ({ setId: s.id, setName: s.name, documentId: docId })));
        },
        loadNoteBody: async (docId) => {
          const n = await database.notes.get(docId);
          return n ? { title: n.title, body: n.body, updatedAt: n.updatedAt } : null;
        },
      },
      packEvidence: (inp) => packEvidence(inp),
      synthesizeGroundedAnswer: vi.fn().mockResolvedValue({
        answer: {
          schemaVersion: 1,
          language: 'vi',
          conclusion: 'Nội dung tìm kiếm cục bộ khi máy chủ timeout.',
          claims: [
            {
              id: 'C1',
              text: 'Nội dung tìm kiếm cục bộ khi máy chủ timeout.',
              classification: 'DIRECT',
              citationIds: ['L1'],
              pathId: null,
            },
          ],
          unsupportedParts: [],
        },
        attempts: [],
        responseLanguage: 'vi',
      }),
      now: () => '2026-10-11T12:00:00.000Z',
    };

    const input: GroundedTurnInput = {
      query: 'Nội dung tìm kiếm là gì?',
      recentTurns: [],
      signal: new AbortController().signal,
      capabilities: { serverEnabled: true, modelConfigured: true },
      config: {
        endpoint: 'https://api.9router.com',
        apiKey: 'test-key',
        model: 'gpt-4o',
        promptVersion: 'v1.0',
        routerVersion: 'v1.0',
      },
      catalog: [
        {
          setId,
          canonicalName: 'Bộ timeout',
          domain: 'General',
          environment: null,
          version: null,
          aliases: [],
          relation: null,
          isBase: true,
        },
      ],
      recentSessionId: 'sess-3',
    };

    const result = await runGroundedTurn(input, deps);

    expect(result.kind).toBe('grounded_answer');
    if (result.kind === 'grounded_answer') {
      expect(result.grounding.outcome).toBe('LOCAL_FALLBACK_SYNTHESIS');
      expect(result.grounding.fallbackReason).toBe('TIMEOUT');
      expect(result.grounding.authority).toBe('local');
    }

    expect(timeoutSpy).toHaveBeenCalledTimes(1);
  });

  // MODE D: Authentication Failure (401 Unauthorized / ERROR_AUTH)
  it('Transport Mode D (ERROR_AUTH): returns visible error and inhibits local fallback', async () => {
    const authSpy = vi.fn().mockRejectedValue(new KnowledgeClientError('REMOTE_ERROR', 'Unauthorized', 401));
    const localBm25Spy = vi.fn();
    const setId = '40000000-0000-4000-8000-000000000004';

    const deps: GroundedTurnDeps = {
      routeIntent: vi.fn().mockResolvedValue({ route: 'knowledge', confidence: 1 }),
      routeScope: vi.fn().mockResolvedValue({
        setTierAssignments: [{ setId, tier: 'REQUIRED', roleGroup: 'baseline' }],
        comparisonMode: 'single',
        routerSource: 'base_default',
      }),
      retrieveFederated: authSpy,
      runLocalBm25: localBm25Spy,
      localBm25Deps: {
        loadSetMembers: async () => [],
        loadNoteBody: async () => null,
      },
      packEvidence: (inp) => packEvidence(inp),
      synthesizeGroundedAnswer: vi.fn(),
      now: () => '2026-10-11T12:00:00.000Z',
    };

    const input: GroundedTurnInput = {
      query: 'Query needing authentication',
      recentTurns: [],
      signal: new AbortController().signal,
      capabilities: { serverEnabled: true, modelConfigured: true },
      config: {
        endpoint: 'https://api.9router.com',
        apiKey: 'test-key',
        model: 'gpt-4o',
        promptVersion: 'v1.0',
        routerVersion: 'v1.0',
      },
      catalog: [
        {
          setId,
          canonicalName: 'Bộ auth',
          domain: 'General',
          environment: null,
          version: null,
          aliases: [],
          relation: null,
          isBase: true,
        },
      ],
      recentSessionId: 'sess-4',
    };

    const result = await runGroundedTurn(input, deps);

    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.code).toBe('ERROR_AUTH');
      expect(result.grounding.outcome).toBe('ERROR_AUTH');
      expect(result.grounding.fallbackReason).toBe('NONE');
    }

    // Local fallback must be strictly inhibited per D-20
    expect(localBm25Spy).not.toHaveBeenCalled();
  });

  // MODE E: Malformed/Invalid JSON Response (ERROR_INVALID_RESPONSE)
  it('Transport Mode E (ERROR_INVALID_RESPONSE): returns visible error and inhibits local fallback', async () => {
    const invalidResponseSpy = vi.fn().mockRejectedValue(new KnowledgeClientError('INVALID_RESPONSE', 'Malformed payload'));
    const localBm25Spy = vi.fn();
    const setId = '50000000-0000-4000-8000-000000000005';

    const deps: GroundedTurnDeps = {
      routeIntent: vi.fn().mockResolvedValue({ route: 'knowledge', confidence: 1 }),
      routeScope: vi.fn().mockResolvedValue({
        setTierAssignments: [{ setId, tier: 'REQUIRED', roleGroup: 'baseline' }],
        comparisonMode: 'single',
        routerSource: 'base_default',
      }),
      retrieveFederated: invalidResponseSpy,
      runLocalBm25: localBm25Spy,
      localBm25Deps: {
        loadSetMembers: async () => [],
        loadNoteBody: async () => null,
      },
      packEvidence: (inp) => packEvidence(inp),
      synthesizeGroundedAnswer: vi.fn(),
      now: () => '2026-10-11T12:00:00.000Z',
    };

    const input: GroundedTurnInput = {
      query: 'Query returning malformed response',
      recentTurns: [],
      signal: new AbortController().signal,
      capabilities: { serverEnabled: true, modelConfigured: true },
      config: {
        endpoint: 'https://api.9router.com',
        apiKey: 'test-key',
        model: 'gpt-4o',
        promptVersion: 'v1.0',
        routerVersion: 'v1.0',
      },
      catalog: [
        {
          setId,
          canonicalName: 'Bộ malformed',
          domain: 'General',
          environment: null,
          version: null,
          aliases: [],
          relation: null,
          isBase: true,
        },
      ],
      recentSessionId: 'sess-5',
    };

    const result = await runGroundedTurn(input, deps);

    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.code).toBe('ERROR_INVALID_RESPONSE');
      expect(result.grounding.outcome).toBe('ERROR_INVALID_RESPONSE');
      expect(result.grounding.fallbackReason).toBe('NONE');
    }

    // Local fallback must be strictly inhibited per D-20
    expect(localBm25Spy).not.toHaveBeenCalled();
  });
});
