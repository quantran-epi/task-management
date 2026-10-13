import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  KnowledgeClientError,
  isFallbackAllowed,
  isTransportFailure,
} from '../knowledgeClient';
import {
  runGroundedTurn,
  type GroundedTurnInput,
  type GroundedTurnDeps,
} from '../../ai/groundedTurn';
import type { LocalGroundedResult } from '../../search/localGroundedRetrieval';
import type { EvidencePack } from '../../ai/evidencePack';
import type { GroundedAnswer } from '../../ai/groundedAnswerSchemas';

describe('isFallbackAllowed & isTransportFailure taxonomy (D-21, D-22)', () => {
  it('identifies network error as transport failure and fallback allowed', () => {
    const netErr = new KnowledgeClientError('NETWORK_ERROR', 'Failed to fetch');
    expect(isTransportFailure(netErr)).toBe(true);
    expect(isFallbackAllowed(netErr)).toBe(true);
  });

  it('identifies timeout as transport failure and fallback allowed', () => {
    const timeoutErr = new KnowledgeClientError('TIMEOUT', 'Request timeout');
    expect(isTransportFailure(timeoutErr)).toBe(true);
    expect(isFallbackAllowed(timeoutErr)).toBe(true);
  });

  it('identifies 5xx remote error as transport failure and fallback allowed', () => {
    const serverErr500 = new KnowledgeClientError('REMOTE_ERROR', 'Internal error', 500);
    const serverErr502 = new KnowledgeClientError('REMOTE_ERROR', 'Bad gateway', 502);
    const serverErr503 = new KnowledgeClientError('REMOTE_ERROR', 'Service unavailable', 503);
    const serverErr504 = new KnowledgeClientError('REMOTE_ERROR', 'Gateway timeout', 504);

    expect(isTransportFailure(serverErr500)).toBe(true);
    expect(isFallbackAllowed(serverErr500)).toBe(true);
    expect(isTransportFailure(serverErr502)).toBe(true);
    expect(isFallbackAllowed(serverErr502)).toBe(true);
    expect(isTransportFailure(serverErr503)).toBe(true);
    expect(isFallbackAllowed(serverErr503)).toBe(true);
    expect(isTransportFailure(serverErr504)).toBe(true);
    expect(isFallbackAllowed(serverErr504)).toBe(true);
  });

  it('identifies generic TypeError: Failed to fetch as transport failure and fallback allowed', () => {
    const fetchErr = new TypeError('Failed to fetch');
    expect(isTransportFailure(fetchErr)).toBe(true);
    expect(isFallbackAllowed(fetchErr)).toBe(true);
  });

  it('rejects 401 and 403 auth errors from fallback', () => {
    const err401 = new KnowledgeClientError('REMOTE_ERROR', 'Unauthorized', 401);
    const err403 = new KnowledgeClientError('REMOTE_ERROR', 'Forbidden', 403);
    expect(isTransportFailure(err401)).toBe(false);
    expect(isFallbackAllowed(err401)).toBe(false);
    expect(isTransportFailure(err403)).toBe(false);
    expect(isFallbackAllowed(err403)).toBe(false);
  });

  it('rejects 400 and 404 config errors from fallback', () => {
    const err400 = new KnowledgeClientError('REMOTE_ERROR', 'Bad request', 400);
    const err404 = new KnowledgeClientError('REMOTE_ERROR', 'Not found', 404);
    expect(isTransportFailure(err400)).toBe(false);
    expect(isFallbackAllowed(err400)).toBe(false);
    expect(isTransportFailure(err404)).toBe(false);
    expect(isFallbackAllowed(err404)).toBe(false);
  });

  it('rejects INVALID_RESPONSE from fallback', () => {
    const invErr = new KnowledgeClientError('INVALID_RESPONSE', 'Invalid schema', 200);
    expect(isTransportFailure(invErr)).toBe(false);
    expect(isFallbackAllowed(invErr)).toBe(false);
  });

  it('rejects ABORTED from fallback', () => {
    const abortErr = new KnowledgeClientError('ABORTED', 'Aborted');
    expect(isTransportFailure(abortErr)).toBe(false);
    expect(isFallbackAllowed(abortErr)).toBe(false);
  });
});

describe('groundedTurn error taxonomy and fallback allowlist integration (D-21, D-22)', () => {
  const dummyAnswer: GroundedAnswer = {
    schemaVersion: 1,
    language: 'vi',
    conclusion: 'Quy trình CYTP1002 hợp lệ.',
    claims: [
      {
        id: 'C1',
        text: 'Khách hàng xác nhận OTP SMS.',
        classification: 'DIRECT',
        citationIds: ['L1'],
        pathId: null,
      },
    ],
    unsupportedParts: [],
  };

  const dummyLocalResult: LocalGroundedResult = {
    ranges: [
      {
        documentId: '00000000-0000-0000-0000-000000000001',
        documentTitle: 'CYTP1002 Spec',
        sectionAnchor: 'Section 1',
        lineStart: 1,
        lineEnd: 5,
        startOffset: 0,
        endOffset: 30,
        rawSnippet: 'Khách hàng xác nhận OTP SMS.',
        contentHash: 'a'.repeat(64),
        score: 1.0,
        matchedTerms: ['OTP'],
        setMemberships: [{ setId: '10000000-0000-0000-0000-000000000001', setName: 'Core' }],
      },
    ],
    strongEvidence: true,
    totalScanned: 1,
  };

  const dummyLocalPack: EvidencePack = {
    authority: 'local',
    citations: {
      L1: {
        citationId: 'L1',
        documentId: '00000000-0000-0000-0000-000000000001',
        documentTitle: 'CYTP1002 Spec',
        sectionAnchor: 'Section 1',
        lineStart: 1,
        lineEnd: 5,
        authority: 'local',
        evidenceClass: 'LOCAL',
        snapshotId: null,
        publishedContentHash: null,
        citedExcerpt: 'Khách hàng xác nhận OTP SMS.',
        setMemberships: [],
      },
    },
    paths: {},
    conflicts: [],
    promptEvidence: [{ id: 'L1', text: 'Khách hàng xác nhận OTP SMS.' }],
    contextTruncated: false,
    coverageWarnings: [],
  };

  let mockInput: GroundedTurnInput;
  let mockDeps: GroundedTurnDeps;

  beforeEach(() => {
    mockInput = {
      query: 'CYTP1002 xử lý thế nào?',
      recentTurns: [],
      signal: new AbortController().signal,
      capabilities: {
        serverEnabled: true,
        modelConfigured: true,
      },
      config: {
        endpoint: 'https://api.9router.test',
        apiKey: 'sk-test',
        model: 'gemini-2.5-flash',
        promptVersion: '1.0.0',
        routerVersion: '1.0.0',
      },
      catalog: [
        {
          setId: '10000000-0000-0000-0000-000000000001',
          canonicalName: 'Core Banking',
          domain: 'Core',
          environment: null,
          version: null,
          aliases: ['core', 'cytp'],
          relation: null,
          isBase: true,
        },
      ],
      recentSessionId: 'sess-1',
    };

    mockDeps = {
      routeIntent: vi.fn().mockResolvedValue({
        intent: 'query_knowledge',
        confidence: 0.95,
        entities: [],
        language: 'vi',
        needs_clarification: false,
        clarify_question: null,
      }),
      routeScope: vi.fn().mockResolvedValue({
        setTierAssignments: [
          {
            setId: '10000000-0000-0000-0000-000000000001',
            tier: 'REQUIRED',
            roleGroup: 'baseline',
          },
        ],
        comparisonMode: null,
        routerSource: 'alias',
      }),
      retrieveFederated: vi.fn(),
      runLocalBm25: vi.fn().mockResolvedValue(dummyLocalResult),
      localBm25Deps: {
        loadSetMembers: vi.fn().mockResolvedValue([]),
        loadNoteBody: vi.fn().mockResolvedValue(null),
      },
      packEvidence: vi.fn().mockReturnValue(dummyLocalPack),
      synthesizeGroundedAnswer: vi.fn().mockResolvedValue({
        answer: dummyAnswer,
        attempts: [],
        responseLanguage: 'vi',
      }),
      now: () => '2026-10-12T00:00:00.000Z',
      generateTurnId: () => 'turn-1',
    };
  });

  // Test 1: Network disconnection (TypeError: Failed to fetch) and request timeout trigger local BM25 fallback (D-21)
  it('Test 1: Network disconnection and request timeout trigger local BM25 fallback with coverage warnings', async () => {
    // Network disconnection: TypeError
    vi.mocked(mockDeps.retrieveFederated).mockRejectedValueOnce(
      new TypeError('Failed to fetch')
    );

    const res1 = await runGroundedTurn(mockInput, mockDeps);
    expect(res1.kind).toBe('grounded_answer');
    if (res1.kind === 'grounded_answer') {
      expect(res1.grounding.outcome).toBe('LOCAL_FALLBACK_SYNTHESIS');
      expect(res1.grounding.authority).toBe('local');
      expect(res1.grounding.fallbackReason).toBe('NETWORK_ERROR');
    }
    expect(mockDeps.runLocalBm25).toHaveBeenCalledTimes(1);

    // Timeout
    vi.mocked(mockDeps.retrieveFederated).mockRejectedValueOnce(
      new KnowledgeClientError('TIMEOUT', 'Gateway timeout')
    );

    const res2 = await runGroundedTurn(mockInput, mockDeps);
    expect(res2.kind).toBe('grounded_answer');
    if (res2.kind === 'grounded_answer') {
      expect(res2.grounding.outcome).toBe('LOCAL_FALLBACK_SYNTHESIS');
      expect(res2.grounding.authority).toBe('local');
      expect(res2.grounding.fallbackReason).toBe('TIMEOUT');
    }
    expect(mockDeps.runLocalBm25).toHaveBeenCalledTimes(2);
  });

  // Test 2: HTTP 500/502/503/504 server errors trigger local BM25 fallback (D-21)
  it('Test 2: HTTP 500/502/503/504 server errors trigger local BM25 fallback', async () => {
    for (const status of [500, 502, 503, 504]) {
      vi.mocked(mockDeps.retrieveFederated).mockRejectedValueOnce(
        new KnowledgeClientError('REMOTE_ERROR', `Server error ${status}`, status)
      );

      const res = await runGroundedTurn(mockInput, mockDeps);
      expect(res.kind).toBe('grounded_answer');
      if (res.kind === 'grounded_answer') {
        expect(res.grounding.outcome).toBe('LOCAL_FALLBACK_SYNTHESIS');
        expect(res.grounding.authority).toBe('local');
        expect(res.grounding.fallbackReason).toBe('NETWORK_ERROR');
      }
    }
    expect(mockDeps.runLocalBm25).toHaveBeenCalledTimes(4);
  });

  // Test 3: HTTP 401 and 403 return kind: 'error', code: 'ERROR_AUTH' without triggering BM25 fallback (D-22)
  it('Test 3: HTTP 401 and 403 return kind: "error", code: "ERROR_AUTH" without triggering BM25 fallback', async () => {
    for (const status of [401, 403]) {
      vi.mocked(mockDeps.retrieveFederated).mockRejectedValueOnce(
        new KnowledgeClientError('REMOTE_ERROR', 'Unauthorized', status)
      );

      const res = await runGroundedTurn(mockInput, mockDeps);
      expect(res.kind).toBe('error');
      if (res.kind === 'error') {
        expect(res.code).toBe('ERROR_AUTH');
        expect(res.grounding.outcome).toBe('ERROR_AUTH');
      }
      expect(mockDeps.runLocalBm25).not.toHaveBeenCalled();
    }
  });

  // Test 4: HTTP 400 and 404 return kind: 'error', code: 'ERROR_CONFIG' without triggering BM25 fallback (D-22)
  it('Test 4: HTTP 400 and 404 return kind: "error", code: "ERROR_CONFIG" without triggering BM25 fallback', async () => {
    for (const status of [400, 404]) {
      vi.mocked(mockDeps.retrieveFederated).mockRejectedValueOnce(
        new KnowledgeClientError('REMOTE_ERROR', 'Bad Request', status)
      );

      const res = await runGroundedTurn(mockInput, mockDeps);
      expect(res.kind).toBe('error');
      if (res.kind === 'error') {
        expect(res.code).toBe('ERROR_CONFIG');
        expect(res.grounding.outcome).toBe('ERROR_CONFIG');
      }
      expect(mockDeps.runLocalBm25).not.toHaveBeenCalled();
    }
  });

  // Test 5: Malformed JSON or Zod schema mismatch return kind: 'error', code: 'ERROR_INVALID_RESPONSE' without triggering BM25 fallback (D-22)
  it('Test 5: Malformed JSON or schema mismatch return kind: "error", code: "ERROR_INVALID_RESPONSE" without triggering BM25 fallback', async () => {
    vi.mocked(mockDeps.retrieveFederated).mockRejectedValueOnce(
      new KnowledgeClientError('INVALID_RESPONSE', 'Invalid response body')
    );

    const res = await runGroundedTurn(mockInput, mockDeps);
    expect(res.kind).toBe('error');
    if (res.kind === 'error') {
      expect(res.code).toBe('ERROR_INVALID_RESPONSE');
      expect(res.grounding.outcome).toBe('ERROR_INVALID_RESPONSE');
    }
    expect(mockDeps.runLocalBm25).not.toHaveBeenCalled();
  });

  // Test 6: User abort signal re-throws ABORTED without creating any fallback grounding
  it('Test 6: User abort signal re-throws ABORTED without creating any fallback grounding', async () => {
    const controller = new AbortController();
    mockInput.signal = controller.signal;
    controller.abort();

    await expect(runGroundedTurn(mockInput, mockDeps)).rejects.toThrow('ABORTED');
    expect(mockDeps.runLocalBm25).not.toHaveBeenCalled();

    // Or when client rejects with ABORTED error
    const controller2 = new AbortController();
    mockInput.signal = controller2.signal;
    vi.mocked(mockDeps.retrieveFederated).mockRejectedValueOnce(
      new KnowledgeClientError('ABORTED', 'Turn aborted')
    );

    await expect(runGroundedTurn(mockInput, mockDeps)).rejects.toThrow('Turn aborted');
    expect(mockDeps.runLocalBm25).not.toHaveBeenCalled();
  });
});
