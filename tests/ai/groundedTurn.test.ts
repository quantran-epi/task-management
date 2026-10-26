import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  runGroundedTurn,
  synthesizeFromStoredEvidence,
  createFreshLookupTurn,
  type GroundedTurnInput,
  type GroundedTurnDeps,
  type CandidateRef,
} from '../../src/services/ai/groundedTurn';
import { KnowledgeClientError } from '../../src/services/knowledge/knowledgeClient';
import { GroundedSynthesisError } from '../../src/services/ai/groundedSynthesis';
import type { ChatMessageGrounding, GroundedAnswer } from '../../src/services/ai/groundedAnswerSchemas';
import type { FederatedRetrievalResponse } from '../../src/services/knowledge/retrievalProtocol';
import type { LocalGroundedResult } from '../../src/services/search/localGroundedRetrieval';
import { validateGroundedAnswerClosure, type EvidencePack } from '../../src/services/ai/evidencePack';
import { normalizeMcpEvidence } from '../../src/services/ai/mcpEvidence';

function mcpResultFrom(items: any[]) {
  return {
    items,
    warnings: [],
    records: normalizeMcpEvidence(items).records,
    normalization: normalizeMcpEvidence(items).stats,
    completeness: 'complete' as const,
    pagesFetched: items.length,
    pagesCapped: false,
  };
}

describe('groundedTurn state machine', () => {
  const dummyAnswer: GroundedAnswer = {
    schemaVersion: 1,
    language: 'vi',
    conclusion: 'Quy trình CYTP1002 hợp lệ.',
    claims: [
      {
        id: 'C1',
        text: 'Khách hàng xác nhận OTP SMS.',
        classification: 'DIRECT',
        citationIds: ['S1'],
        pathId: null,
      },
    ],
    unsupportedParts: [],
  };

  const dummyServerResponse: FederatedRetrievalResponse = {
    outcome: 'READY',
    items: [
      {
        setId: '10000000-0000-0000-0000-000000000001',
        snapshotId: 'gsnap_11111111',
        roleGroup: 'baseline',
        item: {
          type: 'chunk',
          id: 'chunk1',
          score: 10,
          modalitiesContributed: ['vector'],
          sourceDocumentId: '00000000-0000-0000-0000-000000000001',
          sourceDocumentTitle: 'CYTP1002 Spec',
          sectionAnchor: 'Section 1',
          lineStart: 1,
          lineEnd: 5,
          rawSnippet: 'Khách hàng xác nhận OTP SMS.',
          publishedContentHash: 'a'.repeat(64),
          snapshotId: 'gsnap_11111111',
          hasConflict: false,
        },
      },
    ],
    paths: [],
    conflictGroups: [],
    modalityStatus: {
      fulltext: { status: 'ok', latencyMs: 5, itemCount: 1 },
      vector: { status: 'ok', latencyMs: 10, itemCount: 1 },
      graph: { status: 'ok', latencyMs: 8, itemCount: 0 },
    },
    diagnostics: { degraded: false, coverageWarnings: [] },
  };

  const dummyServerPack: EvidencePack = {
    authority: 'server',
    citations: {
      S1: {
        citationId: 'S1',
        documentId: '00000000-0000-0000-0000-000000000001',
        documentTitle: 'CYTP1002 Spec',
        sectionAnchor: 'Section 1',
        lineStart: 1,
        lineEnd: 5,
        authority: 'server',
        evidenceClass: 'OBSERVED',
        snapshotId: 'gsnap_11111111',
        publishedContentHash: 'a'.repeat(64),
        citedExcerpt: 'Khách hàng xác nhận OTP SMS.',
        setMemberships: [],
      },
    },
    paths: {},
    conflicts: [],
    promptEvidence: [{ id: 'S1', text: 'Khách hàng xác nhận OTP SMS.' }],
    contextTruncated: false,
    coverageWarnings: [],
  };

  const dummyLocalPack: EvidencePack = {
    authority: 'local',
    citations: {
      L1: {
        citationId: 'L1',
        documentId: '00000000-0000-0000-0000-000000000001',
        documentTitle: 'CYTP1002 Spec Local',
        sectionAnchor: null,
        lineStart: 1,
        lineEnd: 5,
        authority: 'local',
        evidenceClass: 'LOCAL',
        snapshotId: null,
        publishedContentHash: null,
        citedExcerpt: 'Local snippet text',
        setMemberships: [],
      },
    },
    paths: {},
    conflicts: [],
    promptEvidence: [{ id: 'L1', text: 'Local snippet text' }],
    contextTruncated: false,
    coverageWarnings: [],
  };

  let mockDeps: GroundedTurnDeps;
  let mockInput: GroundedTurnInput;

  beforeEach(() => {
    mockDeps = {
      routeIntent: vi.fn().mockResolvedValue({
        intent: 'query_knowledge',
        confidence: 0.9,
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
        comparisonMode: 'single',
        routerSource: 'base_default',
      }),
      retrieveFederated: vi.fn().mockResolvedValue(dummyServerResponse),
      runLocalBm25: vi.fn().mockResolvedValue({
        ranges: [
          {
            documentId: '00000000-0000-0000-0000-000000000001',
            documentTitle: 'CYTP1002 Spec',
            sectionAnchor: null,
            lineStart: 1,
            lineEnd: 5,
            startOffset: 0,
            endOffset: 50,
            rawSnippet: 'Local snippet',
            contentHash: 'a'.repeat(64),
            score: 12,
            matchedTerms: ['otp', 'sms'],
            setMemberships: [],
          },
        ],
        strongEvidence: true,
        totalScanned: 1,
      } satisfies LocalGroundedResult),
      localBm25Deps: {
        loadSetMembers: vi.fn().mockResolvedValue([]),
        loadNoteBody: vi.fn().mockResolvedValue(null),
      },
      packEvidence: vi.fn().mockImplementation((input) => {
        if (input.authority === 'server') return dummyServerPack;
        return dummyLocalPack;
      }),
      synthesizeGroundedAnswer: vi.fn().mockResolvedValue({
        answer: dummyAnswer,
        attempts: [],
        responseLanguage: 'vi',
      }),
      now: vi.fn().mockReturnValue('2026-10-11T12:00:00.000Z'),
      generateTurnId: vi.fn().mockReturnValue('turn-123'),
    };

    mockInput = {
      query: 'Quy trình CYTP1002 hoạt động thế nào?',
      recentTurns: [],
      signal: new AbortController().signal,
      capabilities: {
        serverEnabled: true,
        modelConfigured: true,
      },
      config: {
        endpoint: 'https://router.local',
        apiKey: 'sk-test',
        model: 'gemini-2.5-pro',
        promptVersion: '2026.10.1',
        routerVersion: 'v1.0.0',
      },
      catalog: [
        {
          setId: '10000000-0000-0000-0000-000000000001',
          canonicalName: 'CYTP1002 Spec',
          domain: 'core',
          environment: null,
          version: null,
          aliases: ['cytp1002'],
          relation: null,
          isBase: true,
        },
      ],
      recentSessionId: 'sess-1',
    };
  });

  // 1. Operational intent -> {kind: 'operational'}; zero retrieve/synthesize calls
  it('1. Operational intent -> {kind: "operational"} with zero retrieve/synthesize', async () => {
    vi.mocked(mockDeps.routeIntent).mockResolvedValueOnce({
      intent: 'operate_taskmate',
      confidence: 0.95,
      entities: [],
      language: 'vi',
      needs_clarification: false,
      clarify_question: null,
      speculation_requested: false,
      require_mcp: false,
      target_mcp_servers: [],
    });

    const res = await runGroundedTurn(mockInput, mockDeps);
    expect(res).toEqual({
      kind: 'operational',
      routedQuery: mockInput.query,
    });
    expect(mockDeps.retrieveFederated).not.toHaveBeenCalled();
    expect(mockDeps.synthesizeGroundedAnswer).not.toHaveBeenCalled();
  });

  // 2. Knowledge intent + READY -> {kind: 'grounded_answer', grounding.outcome: 'READY'}
  it('2. Knowledge intent + READY -> grounded_answer', async () => {
    const res = await runGroundedTurn(mockInput, mockDeps);
    expect(res.kind).toBe('grounded_answer');
    if (res.kind === 'grounded_answer') {
      expect(res.grounding.outcome).toBe('READY');
      expect(res.grounding.authority).toBe('server');
      expect(res.grounding.fallbackReason).toBe('NONE');
      expect(res.grounding.citations).toHaveLength(1);
    }
    expect(mockDeps.synthesizeGroundedAnswer).toHaveBeenCalled();
  });

  // 3. Knowledge intent + DEGRADED -> outcome 'DEGRADED', coverageWarnings populated
  it('3. Knowledge intent + DEGRADED -> outcome DEGRADED', async () => {
    vi.mocked(mockDeps.retrieveFederated).mockResolvedValueOnce({
      ...dummyServerResponse,
      outcome: 'DEGRADED',
      diagnostics: {
        degraded: true,
        coverageWarnings: [{ code: 'TIMEOUT', setId: null, message: 'Graph timeout' }],
      },
    });

    const res = await runGroundedTurn(mockInput, mockDeps);
    expect(res.kind).toBe('grounded_answer');
    if (res.kind === 'grounded_answer') {
      expect(res.grounding.outcome).toBe('DEGRADED');
      expect(res.grounding.coverageWarnings).toContain('Graph timeout');
    }
  });

  // 4. NO_EVIDENCE -> {kind: 'refine', outcome: 'NO_EVIDENCE'}; synthesize NOT called (D-07)
  it('4. NO_EVIDENCE -> refine without synthesize (zero-model-call)', async () => {
    vi.mocked(mockDeps.retrieveFederated).mockResolvedValueOnce({
      ...dummyServerResponse,
      items: [],
      outcome: 'NO_EVIDENCE',
      suggestedRefinements: ['Gợi ý 1', 'Gợi ý 2'],
    } as unknown as FederatedRetrievalResponse);

    const res = await runGroundedTurn(mockInput, mockDeps);
    expect(res).toEqual({
      kind: 'refine',
      outcome: 'NO_EVIDENCE',
      refinementChips: ['Gợi ý 1', 'Gợi ý 2'],
    });
    expect(mockDeps.synthesizeGroundedAnswer).not.toHaveBeenCalled();
  });

  // 5. UNSUPPORTED -> {kind: 'refine', outcome: 'UNSUPPORTED'}; synthesize NOT called
  it('5. UNSUPPORTED -> refine without synthesize (zero-model-call)', async () => {
    vi.mocked(mockDeps.retrieveFederated).mockResolvedValueOnce({
      ...dummyServerResponse,
      items: [],
      outcome: 'UNSUPPORTED',
      suggestedRefinements: ['Refinement A'],
    } as unknown as FederatedRetrievalResponse);

    const res = await runGroundedTurn(mockInput, mockDeps);
    expect(res).toEqual({
      kind: 'refine',
      outcome: 'UNSUPPORTED',
      refinementChips: ['Refinement A'],
    });
    expect(mockDeps.synthesizeGroundedAnswer).not.toHaveBeenCalled();
  });

  // 6. NEEDS_CLARIFICATION -> {kind: 'clarify_entity', candidates}; synthesize NOT called
  it('6. NEEDS_CLARIFICATION -> clarify_entity without synthesize', async () => {
    const candidates: CandidateRef[] = [
      { urn: 'urn:plannermate:core:process:cytp1002', canonicalName: 'CYTP1002', kind: 'ScheduledProcess' },
    ];
    vi.mocked(mockDeps.retrieveFederated).mockResolvedValueOnce({
      ...dummyServerResponse,
      outcome: 'NEEDS_CLARIFICATION',
      candidates,
    } as unknown as FederatedRetrievalResponse);

    const res = await runGroundedTurn(mockInput, mockDeps);
    expect(res).toEqual({
      kind: 'clarify_entity',
      candidates,
      outcome: 'NEEDS_CLARIFICATION',
    });
    expect(mockDeps.synthesizeGroundedAnswer).not.toHaveBeenCalled();
  });

  // 7. Clarify intent (D-09) -> routeIntent returns 'clarify' -> {kind: 'clarify_intent'}; retrieve NOT called
  it('7. Clarify intent -> {kind: "clarify_intent"} with retrieve NOT called', async () => {
    vi.mocked(mockDeps.routeIntent).mockResolvedValueOnce({
      intent: 'clarify',
      confidence: 0.5,
      entities: [],
      language: 'vi',
      needs_clarification: true,
      clarify_question: null,
      speculation_requested: false,
      require_mcp: false,
      target_mcp_servers: [],
    });

    const res = await runGroundedTurn(mockInput, mockDeps);
    expect(res).toEqual({ kind: 'clarify_intent' });
    expect(mockDeps.retrieveFederated).not.toHaveBeenCalled();
    expect(mockDeps.synthesizeGroundedAnswer).not.toHaveBeenCalled();
  });

  // 8. Fallback allowlist — NETWORK_ERROR -> local BM25 runs -> LOCAL_FALLBACK_SYNTHESIS
  it('8. Fallback allowlist — NETWORK_ERROR -> local BM25 -> LOCAL_FALLBACK_SYNTHESIS', async () => {
    vi.mocked(mockDeps.retrieveFederated).mockRejectedValueOnce(
      new KnowledgeClientError('NETWORK_ERROR', 'Connection failed')
    );

    const res = await runGroundedTurn(mockInput, mockDeps);
    expect(res.kind).toBe('grounded_answer');
    if (res.kind === 'grounded_answer') {
      expect(res.grounding.outcome).toBe('LOCAL_FALLBACK_SYNTHESIS');
      expect(res.grounding.authority).toBe('local');
      expect(res.grounding.fallbackReason).toBe('NETWORK_ERROR');
    }
    expect(mockDeps.runLocalBm25).toHaveBeenCalled();
  });

  // 9. Fallback allowlist — TIMEOUT -> retrieve rejects TIMEOUT -> local path; fallbackReason === 'TIMEOUT'
  it('9. Fallback allowlist — TIMEOUT -> local path with fallbackReason TIMEOUT', async () => {
    vi.mocked(mockDeps.retrieveFederated).mockRejectedValueOnce(
      new KnowledgeClientError('TIMEOUT', 'Timeout occurred')
    );

    const res = await runGroundedTurn(mockInput, mockDeps);
    expect(res.kind).toBe('grounded_answer');
    if (res.kind === 'grounded_answer') {
      expect(res.grounding.outcome).toBe('LOCAL_FALLBACK_SYNTHESIS');
      expect(res.grounding.fallbackReason).toBe('TIMEOUT');
    }
    expect(mockDeps.runLocalBm25).toHaveBeenCalled();
  });

  // 10. Fallback inhibited — INVALID_RESPONSE -> {kind: 'error', code: 'ERROR_INVALID_RESPONSE'}; local NOT called
  it('10. Fallback inhibited — INVALID_RESPONSE -> error without local fallback', async () => {
    vi.mocked(mockDeps.retrieveFederated).mockRejectedValueOnce(
      new KnowledgeClientError('INVALID_RESPONSE', 'Malformed JSON')
    );

    const res = await runGroundedTurn(mockInput, mockDeps);
    expect(res.kind).toBe('error');
    if (res.kind === 'error') {
      expect(res.code).toBe('ERROR_INVALID_RESPONSE');
      expect(res.grounding.outcome).toBe('ERROR_INVALID_RESPONSE');
    }
    expect(mockDeps.runLocalBm25).not.toHaveBeenCalled();
    expect(mockDeps.synthesizeGroundedAnswer).not.toHaveBeenCalled();
  });

  // 11. Fallback inhibited — AUTH 401 -> {kind: 'error', code: 'ERROR_AUTH'}; local NOT called
  it('11. Fallback inhibited — AUTH 401 -> ERROR_AUTH without local fallback', async () => {
    vi.mocked(mockDeps.retrieveFederated).mockRejectedValueOnce(
      new KnowledgeClientError('REMOTE_ERROR', 'Unauthorized', 401)
    );

    const res = await runGroundedTurn(mockInput, mockDeps);
    expect(res.kind).toBe('error');
    if (res.kind === 'error') {
      expect(res.code).toBe('ERROR_AUTH');
      expect(res.grounding.outcome).toBe('ERROR_AUTH');
    }
    expect(mockDeps.runLocalBm25).not.toHaveBeenCalled();
  });

  // 12. Fallback inhibited — CONFIG 404 -> {kind: 'error', code: 'ERROR_CONFIG'}
  it('12. Fallback inhibited — CONFIG 404 -> ERROR_CONFIG', async () => {
    vi.mocked(mockDeps.retrieveFederated).mockRejectedValueOnce(
      new KnowledgeClientError('REMOTE_ERROR', 'Not found', 404)
    );

    const res = await runGroundedTurn(mockInput, mockDeps);
    expect(res.kind).toBe('error');
    if (res.kind === 'error') {
      expect(res.code).toBe('ERROR_CONFIG');
      expect(res.grounding.outcome).toBe('ERROR_CONFIG');
    }
    expect(mockDeps.runLocalBm25).not.toHaveBeenCalled();
  });

  // 13. ABORTED propagates -> retrieve rejects ABORTED -> runGroundedTurn throws
  it('13. ABORTED propagates -> throws without persisting', async () => {
    vi.mocked(mockDeps.retrieveFederated).mockRejectedValueOnce(
      new KnowledgeClientError('ABORTED', 'Turn aborted')
    );

    await expect(runGroundedTurn(mockInput, mockDeps)).rejects.toThrow('Turn aborted');
    expect(mockDeps.runLocalBm25).not.toHaveBeenCalled();
    expect(mockDeps.synthesizeGroundedAnswer).not.toHaveBeenCalled();
  });

  // 14. Server disabled -> capabilities.serverEnabled === false -> local path directly
  it('14. Server disabled -> direct local path with fallbackReason SERVER_DISABLED', async () => {
    mockInput.capabilities.serverEnabled = false;

    const res = await runGroundedTurn(mockInput, mockDeps);
    expect(res.kind).toBe('grounded_answer');
    if (res.kind === 'grounded_answer') {
      expect(res.grounding.fallbackReason).toBe('SERVER_DISABLED');
      expect(res.grounding.authority).toBe('local');
    }
    expect(mockDeps.retrieveFederated).not.toHaveBeenCalled();
    expect(mockDeps.runLocalBm25).toHaveBeenCalled();
  });

  // 15. Weak local evidence -> strongEvidence false -> {kind: 'local_fallback_results'}; synthesize NOT called (D-38)
  it('15. Weak local evidence -> local_fallback_results without synthesize', async () => {
    mockInput.capabilities.serverEnabled = false;
    vi.mocked(mockDeps.runLocalBm25).mockResolvedValueOnce({
      ranges: [],
      strongEvidence: false,
      totalScanned: 5,
    });

    const res = await runGroundedTurn(mockInput, mockDeps);
    expect(res.kind).toBe('local_fallback_results');
    if (res.kind === 'local_fallback_results') {
      expect(res.grounding.outcome).toBe('LOCAL_FALLBACK_RESULTS');
    }
    expect(mockDeps.synthesizeGroundedAnswer).not.toHaveBeenCalled();
  });

  // 16. Scope empty (D-37) -> setTierAssignments empty -> {kind: 'clarify_intent'}; runLocalBm25 NOT called
  it('16. Scope empty -> clarify_intent without runLocalBm25 or retrieveFederated (D-37)', async () => {
    mockInput.capabilities.serverEnabled = false;
    vi.mocked(mockDeps.routeScope).mockResolvedValueOnce({
      setTierAssignments: [],
      comparisonMode: null,
      routerSource: 'alias',
    });

    const res = await runGroundedTurn(mockInput, mockDeps);
    expect(res.kind).toBe('clarify_intent');
    expect(mockDeps.runLocalBm25).not.toHaveBeenCalled();
    expect(mockDeps.synthesizeGroundedAnswer).not.toHaveBeenCalled();
  });

  // 16b. Server-path scope empty -> retrieveFederated NEVER called with invalid empty assignments
  it('16b. Server enabled + scope empty -> clarify_intent without retrieveFederated', async () => {
    mockInput.capabilities.serverEnabled = true;
    vi.mocked(mockDeps.routeScope).mockResolvedValueOnce({
      setTierAssignments: [],
      comparisonMode: null,
      routerSource: 'alias',
    });

    const res = await runGroundedTurn(mockInput, mockDeps);
    expect(res.kind).toBe('clarify_intent');
    expect(mockDeps.retrieveFederated).not.toHaveBeenCalled();
    expect(mockDeps.synthesizeGroundedAnswer).not.toHaveBeenCalled();
  });

  // 16c. Non-transport retrieve failure (e.g. ZodError, unexpected error) degrades to local path instead of throwing
  it('16c. Non-transport retrieve failure degrades to local fallback without throw', async () => {
    mockInput.capabilities.serverEnabled = true;
    vi.mocked(mockDeps.retrieveFederated).mockRejectedValueOnce(
      new Error('ZodError: setTierAssignments invalid')
    );

    const res = await runGroundedTurn(mockInput, mockDeps);
    expect(res.kind).toBe('grounded_answer');
    if (res.kind === 'grounded_answer') {
      expect(res.grounding.outcome).toBe('LOCAL_FALLBACK_SYNTHESIS');
      expect(res.grounding.fallbackReason).toBe('NETWORK_ERROR');
    }
    expect(mockDeps.runLocalBm25).toHaveBeenCalled();
  });

  // 17. Model unavailable + server READY -> capabilities.modelConfigured === false -> {kind: 'evidence_only', grounding.outcome: 'MODEL_UNAVAILABLE'} (D-43)
  it('17. Model unavailable + server READY -> evidence_only with MODEL_UNAVAILABLE', async () => {
    mockInput.capabilities.modelConfigured = false;

    const res = await runGroundedTurn(mockInput, mockDeps);
    expect(res.kind).toBe('evidence_only');
    if (res.kind === 'evidence_only') {
      expect(res.grounding.outcome).toBe('MODEL_UNAVAILABLE');
      expect(res.grounding.authority).toBe('server');
      expect(res.grounding.citations).toHaveLength(1);
    }
    expect(mockDeps.synthesizeGroundedAnswer).not.toHaveBeenCalled();
  });

  // 18. INVALID_GROUNDED_OUTPUT -> synthesize throws INVALID_GROUNDED_OUTPUT -> {kind: 'error', code: 'INVALID_GROUNDED_OUTPUT'} (D-45)
  it('18. INVALID_GROUNDED_OUTPUT -> error with citations preserved for retry (D-45)', async () => {
    vi.mocked(mockDeps.synthesizeGroundedAnswer).mockRejectedValueOnce(
      new GroundedSynthesisError('INVALID_GROUNDED_OUTPUT', 'Output schema validation failed')
    );

    const res = await runGroundedTurn(mockInput, mockDeps);
    expect(res.kind).toBe('error');
    if (res.kind === 'error') {
      expect(res.code).toBe('INVALID_GROUNDED_OUTPUT');
      expect(res.grounding.outcome).toBe('INVALID_GROUNDED_OUTPUT');
      expect(res.grounding.citations).toHaveLength(1);
    }
  });

  // 19. synthesizeFromStoredEvidence (D-44) -> rebuild pack from stored, re-run synthesis -> returns grounded_answer
  it('19. synthesizeFromStoredEvidence rehydrates stored evidence unchanged without retrieve', async () => {
    const storedGrounding: ChatMessageGrounding = {
      schemaVersion: 1,
      authority: 'server',
      outcome: 'MODEL_UNAVAILABLE',
      answer: null,
      citations: [
        {
          citationId: 'S1',
          documentId: '00000000-0000-0000-0000-000000000001',
          documentTitle: 'CYTP1002 Spec',
          sectionAnchor: 'Section 1',
          lineStart: 1,
          lineEnd: 5,
          authority: 'server',
          evidenceClass: 'OBSERVED',
          snapshotId: 'gsnap_11111111',
          publishedContentHash: 'a'.repeat(64),
          citedExcerpt: 'Stored excerpt text',
        },
      ],
      paths: [],
      conflicts: [],
      scope: {
        setIds: ['10000000-0000-0000-0000-000000000001'],
        routedScope: {
          domain: null,
          environment: null,
          version: null,
          comparisonMode: 'single',
        },
      },
      modalityDiagnostics: {
        fulltext: { status: 'ok', latencyMs: 5, itemCount: 1 },
        vector: { status: 'ok', latencyMs: 5, itemCount: 1 },
        graph: { status: 'ok', latencyMs: 5, itemCount: 0 },
      },
      coverageWarnings: [],
      fallbackReason: 'NONE',
      routerVersion: 'v1.0.0',
      promptVersion: '2026.10.1',
      modelId: 'gemini-2.5-pro',
      createdAt: '2026-10-11T10:00:00.000Z',
    };

    const res = await synthesizeFromStoredEvidence(storedGrounding, mockDeps, {
      endpoint: 'https://router.local',
      apiKey: 'sk-test',
      model: 'gemini-2.5-pro',
    });

    expect(res.kind).toBe('grounded_answer');
    if (res.kind === 'grounded_answer') {
      expect(res.grounding.citations).toEqual(storedGrounding.citations);
      expect(res.grounding.paths).toEqual(storedGrounding.paths);
      expect(res.grounding.answer).toEqual(dummyAnswer);
    }
    expect(mockDeps.retrieveFederated).not.toHaveBeenCalled();
    expect(mockDeps.synthesizeGroundedAnswer).toHaveBeenCalled();
  });

  // 20. createFreshLookupTurn (D-49) -> returns new GroundedTurnInput; caller passes to runGroundedTurn
  it('20. createFreshLookupTurn preserves original grounding unchanged (D-49)', () => {
    const prevGrounding: ChatMessageGrounding = {
      schemaVersion: 1,
      authority: 'server',
      outcome: 'READY',
      answer: dummyAnswer,
      citations: [],
      paths: [],
      conflicts: [],
      scope: null,
      modalityDiagnostics: null,
      coverageWarnings: [],
      fallbackReason: 'NONE',
      routerVersion: null,
      promptVersion: '2026.10.1',
      modelId: 'gemini-2.5-pro',
      createdAt: '2026-10-11T10:00:00.000Z',
    };

    const freshInput = createFreshLookupTurn(prevGrounding, mockInput, mockDeps);
    expect(freshInput.query).toBe(mockInput.query);
    expect(freshInput.recentTurns).toEqual([
      { role: 'assistant', content: dummyAnswer.conclusion },
    ]);
    expect(prevGrounding.answer?.conclusion).toBe('Quy trình CYTP1002 hợp lệ.');
  });

  // 21. Mixed intent -> routeIntent returns 'mixed' -> grounded_answer with requiresOperationalContinuation: true
  it('21. Mixed intent -> grounded_answer with requiresOperationalContinuation', async () => {
    vi.mocked(mockDeps.routeIntent).mockResolvedValueOnce({
      intent: 'mixed',
      confidence: 0.85,
      entities: [],
      language: 'vi',
      needs_clarification: false,
      clarify_question: null,
      speculation_requested: false,
      require_mcp: false,
      target_mcp_servers: [],
    });

    const res = await runGroundedTurn(mockInput, mockDeps);
    expect(res.kind).toBe('grounded_answer');
    if (res.kind === 'grounded_answer') {
      expect(res.requiresOperationalContinuation).toBe(true);
    }
  });

  // Additional assertion: aborted signal before start throws immediately
  it('aborted signal before start throws immediately', async () => {
    const controller = new AbortController();
    controller.abort();
    mockInput.signal = controller.signal;

    await expect(runGroundedTurn(mockInput, mockDeps)).rejects.toThrow('ABORTED');
    expect(mockDeps.routeIntent).not.toHaveBeenCalled();
    expect(mockDeps.retrieveFederated).not.toHaveBeenCalled();
    expect(mockDeps.synthesizeGroundedAnswer).not.toHaveBeenCalled();
  });

  // 22. Scoped retrieval context hints (LINK-05, D-24)
  it('22. Scoped retrieval context hints forwards linked URNs and docIds into retrieval payload', async () => {
    const dummyLinks = [
      {
        id: 'link-1',
        linkKey: 'task:task-123:10000000-0000-0000-0000-000000000001:urn:node:process:cytp1002',
        taskMateEntityType: 'task' as const,
        taskMateEntityId: 'task-123',
        setId: '10000000-0000-0000-0000-000000000001',
        urn: 'urn:node:process:cytp1002',
        docId: '00000000-0000-0000-0000-000000000001',
        displayLabel: 'CYTP1002 Node',
        createdAt: '2026-10-14T00:00:00.000Z',
        updatedAt: '2026-10-14T00:00:00.000Z',
      },
    ];

    mockDeps.loadKnowledgeLinks = vi.fn().mockResolvedValue(dummyLinks);
    mockInput.scopedEntity = { type: 'task', id: 'task-123' };

    const res = await runGroundedTurn(mockInput, mockDeps);
    expect(res.kind).toBe('grounded_answer');
    expect(mockDeps.loadKnowledgeLinks).toHaveBeenCalledWith('task', 'task-123');

    // Assert retrieveFederated called with contextHints
    expect(mockDeps.retrieveFederated).toHaveBeenCalledWith(
      expect.objectContaining({
        contextHints: {
          setIds: ['10000000-0000-0000-0000-000000000001'],
          urns: ['urn:node:process:cytp1002'],
          docIds: ['00000000-0000-0000-0000-000000000001'],
        },
      }),
      mockInput.signal
    );
  });

  it('23. Stale or failing knowledge links gracefully degrades without crashing turn', async () => {
    mockDeps.loadKnowledgeLinks = vi.fn().mockRejectedValue(new Error('IndexedDB link read failed'));
    mockInput.scopedEntity = { type: 'task', id: 'task-stale' };

    const res = await runGroundedTurn(mockInput, mockDeps);
    expect(res.kind).toBe('grounded_answer');
    // Retrieval proceeds without contextHints
    expect(mockDeps.retrieveFederated).toHaveBeenCalledWith(
      expect.not.objectContaining({
        contextHints: expect.anything(),
      }),
      mockInput.signal
    );
  });

  it('24. Scoped entity in local daemon-down fallback passes prioritizedDocIds to local BM25', async () => {
    mockInput.capabilities.serverEnabled = false;
    mockInput.scopedEntity = { type: 'task', id: 'task-local' };
    mockDeps.loadKnowledgeLinks = vi.fn().mockResolvedValue([
      {
        id: 'link-2',
        linkKey: 'task:task-local:10000000-0000-0000-0000-000000000001:doc-999',
        taskMateEntityType: 'task' as const,
        taskMateEntityId: 'task-local',
        setId: '10000000-0000-0000-0000-000000000001',
        docId: '00000000-0000-0000-0000-000000000001',
        displayLabel: 'Local Linked Doc',
        createdAt: '2026-10-14T00:00:00.000Z',
        updatedAt: '2026-10-14T00:00:00.000Z',
      },
    ]);

    const res = await runGroundedTurn(mockInput, mockDeps);
    expect(res.kind).toBe('grounded_answer');
    expect(mockDeps.runLocalBm25).toHaveBeenCalledWith(
      expect.objectContaining({
        prioritizedDocIds: ['00000000-0000-0000-0000-000000000001'],
      }),
      mockDeps.localBm25Deps
    );
  });

  it('25. Uses a bounded 300-second federated retrieval budget', async () => {
    await runGroundedTurn(mockInput, mockDeps);

    expect(mockDeps.retrieveFederated).toHaveBeenCalledWith(
      expect.objectContaining({
        budgets: expect.objectContaining({ elapsedMs: 300000 }),
      }),
      mockInput.signal
    );
  });

  // Phase 24 SC-8: optional-daemon fallback proof (disabled / unreachable / seed-only).
  describe('optional knowledge daemon (SC-8)', () => {
    const SEED_URN = 'urn:plannermate:core:process:cytp1002';
    const SET_ID = '10000000-0000-0000-0000-000000000001';
    const SNAP = 'gsnap_11111111';

    function seedOnlyResponse(): FederatedRetrievalResponse {
      return {
        outcome: 'SEED_ONLY',
        items: [
          {
            setId: SET_ID,
            snapshotId: SNAP,
            roleGroup: 'baseline',
            item: {
              type: 'entity',
              id: SEED_URN,
              score: 5,
              modalitiesContributed: ['graph'],
              urn: SEED_URN,
              canonicalName: 'CYTP1002',
              kind: 'ScheduledProcess',
              snapshotId: SNAP,
              hasConflict: false,
            },
          },
        ],
        paths: [],
        conflictGroups: [],
        modalityStatus: {
          fulltext: { status: 'ok', latencyMs: 5, itemCount: 0 },
          vector: { status: 'ok', latencyMs: 5, itemCount: 0 },
          graph: {
            status: 'ok',
            latencyMs: 8,
            itemCount: 1,
            entityCount: 1,
            edgeCount: 0,
            pathCount: 0,
          },
        },
        diagnostics: { degraded: false, coverageWarnings: [] },
      };
    }

    function seedEvidencePack(): EvidencePack {
      return {
        authority: 'server',
        citations: {},
        paths: {},
        conflicts: [],
        entities: [
          {
            urn: SEED_URN,
            canonicalName: 'CYTP1002',
            kind: 'ScheduledProcess',
            snapshotId: SNAP,
            setId: SET_ID,
          },
        ],
        graphCounts: { entity: 1, edge: 0, path: 0 },
        promptEvidence: [],
        contextTruncated: false,
        coverageWarnings: [],
      };
    }

    /**
     * `GroundedTurnDeps` has no domain-write member at all; assert the called set
     * stays inside the read/synthesis allowlist so no persistence path sneaks in.
     */
    const READ_ONLY_DEPS = new Set([
      'routeIntent',
      'routeScope',
      'retrieveFederated',
      'runLocalBm25',
      'packEvidence',
      'synthesizeGroundedAnswer',
      'runMcpRetrieval',
      'loadKnowledgeLinks',
      'now',
      'generateTurnId',
    ]);

    function calledDepNames(deps: GroundedTurnDeps): string[] {
      return Object.entries(deps)
        .filter(([, value]) => typeof value === 'function' && vi.isMockFunction(value))
        .filter(([, value]) => (value as ReturnType<typeof vi.fn>).mock.calls.length > 0)
        .map(([name]) => name);
    }

    it('disabled daemon: zero server calls, local BM25 once, no seed-only grounding', async () => {
      mockInput.capabilities.serverEnabled = false;
      mockInput.capabilities.modelConfigured = false;

      const res = await runGroundedTurn(mockInput, mockDeps);

      expect(res.kind).toBe('local_fallback_results');
      if (res.kind === 'local_fallback_results') {
        expect(res.grounding.authority).toBe('local');
        expect(res.grounding.outcome).toBe('LOCAL_FALLBACK_RESULTS');
        expect(res.grounding.outcome).not.toBe('SEED_ONLY');
        expect(res.grounding.fallbackReason).toBe('SERVER_DISABLED');
      }
      expect(mockDeps.retrieveFederated).toHaveBeenCalledTimes(0);
      expect(mockDeps.runLocalBm25).toHaveBeenCalledTimes(1);
      expect(mockDeps.synthesizeGroundedAnswer).toHaveBeenCalledTimes(0);
      // Every dep invoked is a read/synthesis dep; the deps contract has no write member.
      for (const name of calledDepNames(mockDeps)) {
        expect(READ_ONLY_DEPS.has(name)).toBe(true);
      }
      expect(Object.keys(mockDeps)).not.toContain('saveMessage');
      expect(Object.keys(mockDeps)).not.toContain('writeRepository');
    });

    it('disabled daemon with model: local BM25 once and synthesis stays local authority', async () => {
      mockInput.capabilities.serverEnabled = false;

      const res = await runGroundedTurn(mockInput, mockDeps);

      expect(res.kind).toBe('grounded_answer');
      if (res.kind === 'grounded_answer') {
        expect(res.grounding.authority).toBe('local');
        expect(res.grounding.outcome).toBe('LOCAL_FALLBACK_SYNTHESIS');
        expect(res.grounding.paths).toBeNull();
      }
      expect(mockDeps.retrieveFederated).toHaveBeenCalledTimes(0);
      expect(mockDeps.runLocalBm25).toHaveBeenCalledTimes(1);
      expect(mockDeps.synthesizeGroundedAnswer).toHaveBeenCalledTimes(1);
    });

    it('unreachable daemon: one local BM25 call, no seed-only server grounding', async () => {
      vi.mocked(mockDeps.retrieveFederated).mockRejectedValueOnce(
        new KnowledgeClientError('NETWORK_ERROR', 'Connection refused')
      );

      const res = await runGroundedTurn(mockInput, mockDeps);

      expect(res.kind).toBe('grounded_answer');
      if (res.kind === 'grounded_answer') {
        expect(res.grounding.authority).toBe('local');
        expect(res.grounding.fallbackReason).toBe('NETWORK_ERROR');
        expect(res.grounding.outcome).not.toBe('SEED_ONLY');
        expect(res.grounding.entities).toBeUndefined();
      }
      expect(mockDeps.retrieveFederated).toHaveBeenCalledTimes(1);
      expect(mockDeps.runLocalBm25).toHaveBeenCalledTimes(1);
    });

    it('valid server SEED_ONLY: zero local BM25 calls, server authority retained', async () => {
      vi.mocked(mockDeps.retrieveFederated).mockResolvedValueOnce(seedOnlyResponse());
      mockDeps.packEvidence = vi.fn().mockReturnValue(seedEvidencePack());

      const res = await runGroundedTurn(mockInput, mockDeps);

      expect(res.kind).toBe('grounded_answer');
      if (res.kind === 'grounded_answer') {
        expect(res.grounding.outcome).toBe('SEED_ONLY');
        expect(res.grounding.authority).toBe('server');
        expect(res.grounding.citations).toEqual([]);
        expect(res.grounding.paths).toEqual([]);
      }
      expect(mockDeps.runLocalBm25).toHaveBeenCalledTimes(0);
      expect(mockDeps.retrieveFederated).toHaveBeenCalledTimes(1);
      expect(mockDeps.synthesizeGroundedAnswer).toHaveBeenCalledTimes(1);
    });
  });

  // 26. Dynamic MCP retrieval parallel dispatch (MCP-FEDERATED-01)
  it('26. When require_mcp is false, runs only Docs retrieval without invoking runMcpRetrieval', async () => {
    mockDeps.runMcpRetrieval = vi.fn();
    vi.mocked(mockDeps.routeIntent).mockResolvedValueOnce({
      intent: 'query_knowledge',
      confidence: 0.9,
      entities: [],
      language: 'vi',
      needs_clarification: false,
      clarify_question: null,
      require_mcp: false,
      target_mcp_servers: [],
    } as any);

    const res = await runGroundedTurn(mockInput, mockDeps);
    expect(res.kind).toBe('grounded_answer');
    expect(mockDeps.retrieveFederated).toHaveBeenCalled();
    expect(mockDeps.runMcpRetrieval).not.toHaveBeenCalled();
    expect(mockDeps.packEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        authority: 'server',
        mcpRecords: [],
      })
    );
  });

  it('27. When require_mcp is true, dispatches Docs and MCP retrieval in parallel and packs both', async () => {
    const dummyMcpItems = [
      {
        serverId: 'graphiti-banking',
        serverName: 'Graphiti Banking MCP',
        toolName: 'search_nodes',
        args: { query: 'SVFE_SHB.ACCOUNTS' },
        rawResult: 'Account details found',
        timestamp: '2026-10-20T00:00:00.000Z',
      },
    ];

    mockDeps.runMcpRetrieval = vi.fn().mockResolvedValue({
      items: dummyMcpItems,
      warnings: [],
    });

    vi.mocked(mockDeps.routeIntent).mockResolvedValueOnce({
      intent: 'query_knowledge',
      confidence: 0.95,
      entities: [],
      language: 'vi',
      needs_clarification: false,
      clarify_question: null,
      require_mcp: true,
      target_mcp_servers: ['graphiti-banking'],
    } as any);

    const res = await runGroundedTurn(mockInput, mockDeps);
    expect(res.kind).toBe('grounded_answer');
    expect(mockDeps.retrieveFederated).toHaveBeenCalled();
    expect(mockDeps.runMcpRetrieval).toHaveBeenCalledWith(
      expect.objectContaining({
        query: mockInput.query,
        serverIds: ['graphiti-banking'],
      })
    );
    expect(mockDeps.packEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        authority: 'server',
        mcpRecords: mcpResultFrom(dummyMcpItems).records,
      })
    );
  });

  it('28. When MCP retrieval fails, turn recovers with warning and marks Docs result degraded', async () => {
    mockDeps.runMcpRetrieval = vi.fn().mockRejectedValue(new Error('MCP server timeout or connection reset'));

    vi.mocked(mockDeps.routeIntent).mockResolvedValueOnce({
      intent: 'query_knowledge',
      confidence: 0.95,
      entities: [],
      language: 'vi',
      needs_clarification: false,
      clarify_question: null,
      require_mcp: true,
      target_mcp_servers: ['graphiti-banking'],
    } as any);

    const res = await runGroundedTurn(mockInput, mockDeps);
    expect(res.kind).toBe('grounded_answer');
    if (res.kind === 'grounded_answer') {
      expect(res.grounding.outcome).toBe('DEGRADED');
      expect(res.grounding.coverageWarnings).toContain(
        'Máy chủ MCP không phản hồi kịp thời; câu trả lời được tổng hợp từ tài liệu nội bộ.'
      );
    }
    expect(mockDeps.synthesizeGroundedAnswer).toHaveBeenCalled();
  });

  describe('retrieval source routing matrix', () => {
    const mcpItems = [
      {
        serverId: 'graphiti-banking',
        serverName: 'Graphiti Banking MCP',
        toolName: 'search_nodes',
        args: { query: 'SVFE_SHB.ACCOUNTS' },
        rawResult: 'Account details found',
        timestamp: '2026-10-20T00:00:00.000Z',
      },
    ];

    function intentWithMcp(requireMcp: boolean, servers: string[]) {
      return {
        intent: 'query_knowledge' as const,
        confidence: 0.95,
        entities: [],
        language: 'vi',
        needs_clarification: false,
        clarify_question: null,
        require_mcp: requireMcp,
        target_mcp_servers: servers,
      } as any;
    }

    it('MCP only: empty scope runs MCP without any Docs retrieve request', async () => {
      mockDeps.runMcpRetrieval = vi.fn().mockResolvedValue(mcpResultFrom(mcpItems));
      vi.mocked(mockDeps.routeIntent).mockResolvedValueOnce(intentWithMcp(true, ['graphiti-banking']));
      vi.mocked(mockDeps.routeScope).mockResolvedValueOnce({
        setTierAssignments: [],
        comparisonMode: null,
        routerSource: 'alias',
      });

      const res = await runGroundedTurn(mockInput, mockDeps);

      expect(res.kind).toBe('grounded_answer');
      expect(mockDeps.retrieveFederated).not.toHaveBeenCalled();
      expect(mockDeps.runMcpRetrieval).toHaveBeenCalledWith(
        expect.objectContaining({ serverIds: ['graphiti-banking'] })
      );
      expect(mockDeps.packEvidence).toHaveBeenCalledWith(
        expect.objectContaining({ serverResponse: expect.anything(), mcpRecords: mcpResultFrom(mcpItems).records })
      );
      expect(mockDeps.synthesizeGroundedAnswer).toHaveBeenCalled();
    });

    it('Docs only: non-empty scope skips MCP', async () => {
      mockDeps.runMcpRetrieval = vi.fn();
      vi.mocked(mockDeps.routeIntent).mockResolvedValueOnce(intentWithMcp(false, []));

      const res = await runGroundedTurn(mockInput, mockDeps);

      expect(res.kind).toBe('grounded_answer');
      expect(mockDeps.retrieveFederated).toHaveBeenCalled();
      expect(mockDeps.runMcpRetrieval).not.toHaveBeenCalled();
    });

    it('Docs + MCP: preserves both source families in the synthesis pack', async () => {
      const docsAndMcpPack: EvidencePack = {
        ...dummyServerPack,
        citations: {
          ...dummyServerPack.citations,
          M1: {
            citationId: 'M1',
            documentId: 'mcp:graphiti-banking:search_nodes',
            documentTitle: '[MCP] Graphiti Banking MCP - search_nodes',
            sectionAnchor: '{}',
            lineStart: 1,
            lineEnd: 1,
            authority: 'server',
            evidenceClass: 'OBSERVED',
            snapshotId: 'mcp_live',
            publishedContentHash: null,
            citedExcerpt: 'Account details found',
            setMemberships: [],
            evidenceKind: 'mcp_tool',
          },
        },
        promptEvidence: [
          ...dummyServerPack.promptEvidence,
          { id: 'M1', text: 'Account details found' },
        ],
      };
      mockDeps.packEvidence = vi.fn().mockReturnValue(docsAndMcpPack);
      mockDeps.runMcpRetrieval = vi.fn().mockResolvedValue(mcpResultFrom(mcpItems));
      vi.mocked(mockDeps.routeIntent).mockResolvedValueOnce(intentWithMcp(true, ['graphiti-banking']));

      await runGroundedTurn(mockInput, mockDeps);

      expect(mockDeps.synthesizeGroundedAnswer).toHaveBeenCalledWith(
        expect.objectContaining({
          pack: expect.objectContaining({
            promptEvidence: expect.arrayContaining([
              expect.objectContaining({ id: 'S1' }),
              expect.objectContaining({ id: 'M1' }),
            ]),
          }),
        })
      );
    });

    it('Docs + MCP: dispatches both in parallel before either settles', async () => {
      let resolveDocs!: (value: FederatedRetrievalResponse) => void;
      let resolveMcp!: (value: any) => void;

      mockDeps.retrieveFederated = vi.fn().mockImplementation(
        () => new Promise((resolve) => { resolveDocs = resolve; })
      );
      mockDeps.runMcpRetrieval = vi.fn().mockImplementation(
        () => new Promise((resolve) => { resolveMcp = resolve; })
      );
      vi.mocked(mockDeps.routeIntent).mockResolvedValueOnce(intentWithMcp(true, ['graphiti-banking']));

      const turn = runGroundedTurn(mockInput, mockDeps);
      await vi.waitFor(() => {
        expect(mockDeps.retrieveFederated).toHaveBeenCalled();
        expect(mockDeps.runMcpRetrieval).toHaveBeenCalled();
      });

      resolveDocs(dummyServerResponse);
      resolveMcp(mcpResultFrom(mcpItems));

      const res = await turn;
      expect(res.kind).toBe('grounded_answer');
      expect(mockDeps.packEvidence).toHaveBeenCalledWith(
        expect.objectContaining({ authority: 'server', mcpRecords: mcpResultFrom(mcpItems).records })
      );
    });

    it('Docs fail + MCP succeeds: synthesizes MCP evidence and marks degraded', async () => {
      mockDeps.runMcpRetrieval = vi.fn().mockResolvedValue(mcpResultFrom(mcpItems));
      vi.mocked(mockDeps.retrieveFederated).mockRejectedValueOnce(
        new KnowledgeClientError('NETWORK_ERROR', 'Docs down')
      );
      vi.mocked(mockDeps.routeIntent).mockResolvedValueOnce(intentWithMcp(true, ['graphiti-banking']));

      const res = await runGroundedTurn(mockInput, mockDeps);

      expect(res.kind).toBe('grounded_answer');
      if (res.kind === 'grounded_answer') {
        expect(res.grounding.outcome).toBe('DEGRADED');
        expect(res.grounding.coverageWarnings).toContain(
          'Máy chủ tài liệu không phản hồi; câu trả lời được tổng hợp từ dữ liệu MCP.'
        );
      }
      expect(mockDeps.runLocalBm25).not.toHaveBeenCalled();
      expect(mockDeps.synthesizeGroundedAnswer).toHaveBeenCalled();
    });

    it('Neither source: empty scope and no configured MCP clarifies without retrieval', async () => {
      mockDeps.runMcpRetrieval = vi.fn();
      vi.mocked(mockDeps.routeIntent).mockResolvedValueOnce(intentWithMcp(false, []));
      vi.mocked(mockDeps.routeScope).mockResolvedValueOnce({
        setTierAssignments: [],
        comparisonMode: null,
        routerSource: 'alias',
      });

      const res = await runGroundedTurn(mockInput, mockDeps);

      expect(res.kind).toBe('clarify_intent');
      expect(mockDeps.retrieveFederated).not.toHaveBeenCalled();
      expect(mockDeps.runMcpRetrieval).not.toHaveBeenCalled();
    });
  });

  it('26. Falls back locally when federated retrieval times out without evidence', async () => {
    mockDeps.retrieveFederated = vi.fn().mockResolvedValue({
      outcome: 'DEGRADED',
      items: [],
      paths: [],
      conflictGroups: [],
      modalityStatus: {
        fulltext: { status: 'timeout', latencyMs: 2500, itemCount: 0 },
        vector: { status: 'timeout', latencyMs: 2500, itemCount: 0 },
        graph: { status: 'timeout', latencyMs: 2500, itemCount: 0 },
      },
      diagnostics: {
        degraded: true,
        coverageWarnings: [
          {
            code: 'TIMEOUT',
            setId: '10000000-0000-0000-0000-000000000001',
            message: 'Set timed out',
          },
        ],
      },
    });

    const res = await runGroundedTurn(mockInput, mockDeps);

    expect(mockDeps.runLocalBm25).toHaveBeenCalled();
    expect(res.kind).toBe('grounded_answer');
    if (res.kind === 'grounded_answer') {
      expect(res.grounding.authority).toBe('local');
      expect(res.grounding.fallbackReason).toBe('TIMEOUT');
    }
  });

  it('27. Falls back locally when text modalities time out and graph is unavailable (e.g. NO_GRAPH_SEED)', async () => {
    mockDeps.retrieveFederated = vi.fn().mockResolvedValue({
      outcome: 'NO_EVIDENCE',
      items: [],
      paths: [],
      conflictGroups: [],
      modalityStatus: {
        fulltext: { status: 'timeout', latencyMs: 2500, itemCount: 0 },
        vector: { status: 'timeout', latencyMs: 2500, itemCount: 0 },
        graph: { status: 'unavailable', latencyMs: 0, itemCount: 0, reason: 'NO_GRAPH_SEED' },
      },
      diagnostics: {
        degraded: true,
        coverageWarnings: [],
      },
    });

    const res = await runGroundedTurn(mockInput, mockDeps);

    expect(mockDeps.runLocalBm25).toHaveBeenCalled();
    expect(res.kind).toBe('grounded_answer');
    if (res.kind === 'grounded_answer') {
      expect(res.grounding.authority).toBe('local');
      expect(res.grounding.fallbackReason).toBe('TIMEOUT');
    }
  });

  describe('Phase 24 SEED_ONLY routing (SC-6)', () => {
    const SEED_URN = 'urn:plannermate:core:process:cytp1002';
    const SET_ID = '10000000-0000-0000-0000-000000000001';
    const SNAP = 'gsnap_11111111';

    function seedOnlyResponse(
      overrides: Partial<FederatedRetrievalResponse> = {}
    ): FederatedRetrievalResponse {
      return {
        outcome: 'SEED_ONLY',
        items: [
          {
            setId: SET_ID,
            snapshotId: SNAP,
            roleGroup: 'baseline',
            item: {
              type: 'entity',
              id: SEED_URN,
              score: 5,
              modalitiesContributed: ['graph'],
              urn: SEED_URN,
              canonicalName: 'CYTP1002',
              kind: 'ScheduledProcess',
              snapshotId: SNAP,
              hasConflict: false,
            },
          },
        ],
        paths: [],
        conflictGroups: [],
        modalityStatus: {
          fulltext: { status: 'ok', latencyMs: 5, itemCount: 0 },
          vector: { status: 'ok', latencyMs: 5, itemCount: 0 },
          graph: {
            status: 'ok',
            latencyMs: 8,
            itemCount: 1,
            entityCount: 1,
            edgeCount: 0,
            pathCount: 0,
          },
        },
        diagnostics: {
          degraded: false,
          coverageWarnings: [],
          stageDiagnostics: [
            {
              stage: 'neo4j_traversal',
              status: 'ok',
              latencyMs: 8,
              accepted: 1,
              rejected: 0,
              truncated: true,
              fallback: true,
              fallbackReason: 'FALLBACK_ONE_HOP',
              reasonCodes: ['SEED_FOUND_NO_RELATION'],
            },
          ],
          failedSeeds: [{ urn: 'urn:plannermate:core:process:missing', reasonCode: 'SEED_NOT_FOUND' }],
        },
        ...overrides,
      };
    }

    function seedPack(): EvidencePack {
      return {
        authority: 'server',
        citations: {},
        paths: {},
        conflicts: [],
        entities: [
          {
            urn: SEED_URN,
            canonicalName: 'CYTP1002',
            kind: 'ScheduledProcess',
            snapshotId: SNAP,
            setId: SET_ID,
          },
        ],
        graphCounts: { entity: 1, edge: 0, path: 0 },
        promptEvidence: [],
        contextTruncated: false,
        coverageWarnings: [],
      };
    }

    it('synthesizes a grounded answer for SEED_ONLY without refine or local fallback', async () => {
      vi.mocked(mockDeps.retrieveFederated).mockResolvedValueOnce(seedOnlyResponse());
      mockDeps.packEvidence = vi.fn().mockReturnValue(seedPack());

      const res = await runGroundedTurn(mockInput, mockDeps);

      expect(res.kind).toBe('grounded_answer');
      if (res.kind === 'grounded_answer') {
        expect(res.grounding.outcome).toBe('SEED_ONLY');
        expect(res.grounding.authority).toBe('server');
        expect(res.grounding.answer).toBeTruthy();
      }
      expect(mockDeps.runLocalBm25).not.toHaveBeenCalled();
      expect(mockDeps.retrieveFederated).toHaveBeenCalledTimes(1);
    });

    it('returns evidence_only with outcome SEED_ONLY when no model is configured', async () => {
      mockInput.capabilities.modelConfigured = false;
      vi.mocked(mockDeps.retrieveFederated).mockResolvedValueOnce(seedOnlyResponse());
      mockDeps.packEvidence = vi.fn().mockReturnValue(seedPack());

      const res = await runGroundedTurn(mockInput, mockDeps);

      expect(res.kind).toBe('evidence_only');
      if (res.kind === 'evidence_only') {
        expect(res.grounding.outcome).toBe('SEED_ONLY');
        expect(res.grounding.authority).toBe('server');
        expect(res.grounding.answer).toBeNull();
        expect(res.grounding.entities).toEqual([
          {
            urn: SEED_URN,
            canonicalName: 'CYTP1002',
            kind: 'ScheduledProcess',
            snapshotId: SNAP,
          },
        ]);
      }
      expect(mockDeps.runLocalBm25).not.toHaveBeenCalled();
      expect(mockDeps.retrieveFederated).toHaveBeenCalledTimes(1);
      expect(mockDeps.synthesizeGroundedAnswer).not.toHaveBeenCalled();
    });

    it('persists entities, graph counts, stage diagnostics, and failed seeds', async () => {
      vi.mocked(mockDeps.retrieveFederated).mockResolvedValueOnce(seedOnlyResponse());
      mockDeps.packEvidence = vi.fn().mockReturnValue(seedPack());

      const res = await runGroundedTurn(mockInput, mockDeps);

      expect(res.kind).toBe('grounded_answer');
      if (res.kind === 'grounded_answer') {
        expect(res.grounding.graphCounts).toEqual({ entity: 1, edge: 0, path: 0 });
        expect(res.grounding.entities).toHaveLength(1);
        expect(res.grounding.stageDiagnostics).toEqual([
          expect.objectContaining({
            stage: 'neo4j_traversal',
            truncated: true,
            fallback: true,
            fallbackReason: 'FALLBACK_ONE_HOP',
          }),
        ]);
        expect(res.grounding.failedSeeds).toEqual([
          { urn: 'urn:plannermate:core:process:missing', reasonCode: 'SEED_NOT_FOUND' },
        ]);
      }
    });

    it('sends an existence-only instruction alongside the entity labels', async () => {
      vi.mocked(mockDeps.retrieveFederated).mockResolvedValueOnce(seedOnlyResponse());
      mockDeps.packEvidence = vi.fn().mockReturnValue(seedPack());

      await runGroundedTurn(mockInput, mockDeps);

      expect(mockDeps.synthesizeGroundedAnswer).toHaveBeenCalledWith(
        expect.objectContaining({
          instructions: expect.stringContaining('EXISTENCE ONLY'),
        })
      );
      expect(mockDeps.synthesizeGroundedAnswer).toHaveBeenCalledWith(
        expect.objectContaining({
          pack: expect.objectContaining({
            entities: expect.arrayContaining([
              expect.objectContaining({ canonicalName: 'CYTP1002' }),
            ]),
          }),
        })
      );
    });

    it('keeps runLocalBm25 at zero and issues no second retrieval', async () => {
      vi.mocked(mockDeps.retrieveFederated).mockResolvedValueOnce(seedOnlyResponse());
      mockDeps.packEvidence = vi.fn().mockReturnValue(seedPack());

      await runGroundedTurn(mockInput, mockDeps);

      expect(mockDeps.runLocalBm25).toHaveBeenCalledTimes(0);
      expect(mockDeps.retrieveFederated).toHaveBeenCalledTimes(1);
    });

    it('treats positive entity count as productive but zero entities with error as nonproductive', async () => {
      // Positive entity count + graph error status -> not reason for fallback
      vi.mocked(mockDeps.retrieveFederated).mockResolvedValueOnce(
        seedOnlyResponse({
          modalityStatus: {
            fulltext: { status: 'timeout', latencyMs: 5, itemCount: 0 },
            vector: { status: 'timeout', latencyMs: 5, itemCount: 0 },
            graph: {
              status: 'error',
              latencyMs: 8,
              itemCount: 1,
              entityCount: 1,
              edgeCount: 0,
              pathCount: 0,
            },
          },
        })
      );
      mockDeps.packEvidence = vi.fn().mockReturnValue(seedPack());

      const productive = await runGroundedTurn(mockInput, mockDeps);
      expect(productive.kind).toBe('grounded_answer');

      // Zero entities + timeout text/graph -> local fallback
      vi.mocked(mockDeps.retrieveFederated).mockResolvedValueOnce({
        outcome: 'NO_EVIDENCE',
        items: [],
        paths: [],
        conflictGroups: [],
        modalityStatus: {
          fulltext: { status: 'timeout', latencyMs: 2500, itemCount: 0 },
          vector: { status: 'timeout', latencyMs: 2500, itemCount: 0 },
          graph: { status: 'error', latencyMs: 0, itemCount: 0 },
        },
        diagnostics: { degraded: true, coverageWarnings: [] },
      });

      const nonProductive = await runGroundedTurn(mockInput, mockDeps);
      expect(nonProductive.kind).toBe('grounded_answer');
      if (nonProductive.kind === 'grounded_answer') {
        expect(nonProductive.grounding.authority).toBe('local');
        expect(nonProductive.grounding.fallbackReason).toBe('TIMEOUT');
      }
    });

    it('never emits NO_EVIDENCE copy or broadens the query for SEED_ONLY', async () => {
      vi.mocked(mockDeps.retrieveFederated).mockResolvedValueOnce(seedOnlyResponse());
      mockDeps.packEvidence = vi.fn().mockReturnValue(seedPack());

      const res = await runGroundedTurn(mockInput, mockDeps);

      expect(res.kind).not.toBe('refine');
      expect(mockDeps.retrieveFederated).toHaveBeenCalledTimes(1);
      expect(mockDeps.retrieveFederated).toHaveBeenCalledWith(
        expect.objectContaining({ query: mockInput.query }),
        mockInput.signal
      );
    });

    it('rejects a relationship claim unsupported by any path', async () => {
      // Real closure validation: seed-only pack has zero paths, so INFERRED is impossible.
      const closure = validateGroundedAnswerClosure(
        {
          schemaVersion: 1,
          language: 'vi',
          conclusion: 'CYTP1002 gọi CYTP2002.',
          claims: [
            {
              id: 'C1',
              text: 'CYTP1002 gọi CYTP2002.',
              classification: 'INFERRED',
              citationIds: ['S1'],
              pathId: null,
            },
          ],
          unsupportedParts: [],
        },
        seedPack()
      );
      expect(closure.valid).toBe(false);
      expect(closure.issues.some((i) => i.code === 'inferred_requires_path')).toBe(true);

      vi.mocked(mockDeps.retrieveFederated).mockResolvedValueOnce(seedOnlyResponse());
      mockDeps.packEvidence = vi.fn().mockReturnValue(seedPack());
      vi.mocked(mockDeps.synthesizeGroundedAnswer).mockRejectedValueOnce(
        new GroundedSynthesisError('INVALID_GROUNDED_OUTPUT', 'INFERRED requires path')
      );

      const res = await runGroundedTurn(mockInput, mockDeps);

      expect(res.kind).toBe('error');
      if (res.kind === 'error') {
        expect(res.code).toBe('INVALID_GROUNDED_OUTPUT');
      }
      expect(mockDeps.runLocalBm25).not.toHaveBeenCalled();
    });
  });

  it('29. preserves mcpMetadata and relevanceReason in final grounding citations', async () => {
    const dummyMcpItems = [
      {
        serverId: 'graphiti-banking',
        serverName: 'Graphiti Banking MCP',
        toolName: 'search_nodes',
        args: { query: 'ISS_CARD' },
        rawResult: 'ISS_CARD table definition',
        timestamp: '2026-10-20T00:00:00.000Z',
      },
    ];

    mockDeps.runMcpRetrieval = vi.fn().mockResolvedValue({
      items: dummyMcpItems,
      warnings: [],
    });

    vi.mocked(mockDeps.routeIntent).mockResolvedValueOnce({
      intent: 'query_knowledge',
      confidence: 0.95,
      entities: [],
      language: 'vi',
      needs_clarification: false,
      clarify_question: null,
      require_mcp: true,
      target_mcp_servers: ['graphiti-banking'],
    } as any);

    mockDeps.packEvidence = vi.fn().mockReturnValue({
      authority: 'server',
      citations: {
        M1: {
          citationId: 'M1',
          documentId: 'mcp:graphiti-banking:search_nodes',
          documentTitle: '[MCP] Graphiti Banking MCP - search_nodes',
          sectionAnchor: '{"query":"ISS_CARD"}',
          lineStart: 1,
          lineEnd: 1,
          authority: 'server',
          evidenceClass: 'OBSERVED',
          snapshotId: 'mcp_live',
          publishedContentHash: null,
          citedExcerpt: 'ISS_CARD table definition',
          setMemberships: [],
          evidenceKind: 'mcp_tool',
          mcpMetadata: {
            serverId: 'graphiti-banking',
            serverName: 'Graphiti Banking MCP',
            toolName: 'search_nodes',
          },
        },
      },
      paths: {},
      conflicts: [],
      promptEvidence: [{ id: 'M1', text: 'ISS_CARD table definition' }],
      contextTruncated: false,
      coverageWarnings: [],
    });

    vi.mocked(mockDeps.synthesizeGroundedAnswer).mockResolvedValueOnce({
      answer: {
        schemaVersion: 1,
        language: 'vi',
        conclusion: 'Bảng ISS_CARD lưu thông tin thẻ phát hành [M1].',
        claims: [
          {
            id: 'C1',
            text: 'Bảng ISS_CARD lưu thông tin thẻ phát hành.',
            classification: 'DIRECT',
            citationIds: ['M1'],
            pathId: null,
          },
        ],
        unsupportedParts: [],
      },
      attempts: [],
      responseLanguage: 'vi',
    });

    const res = await runGroundedTurn(mockInput, mockDeps);
    expect(res.kind).toBe('grounded_answer');
    if (res.kind === 'grounded_answer') {
      const mcpCitation = res.grounding.citations.find((c) => c.citationId === 'M1');
      expect(mcpCitation).toBeDefined();
      expect(mcpCitation?.mcpMetadata).toEqual({
        serverId: 'graphiti-banking',
        serverName: 'Graphiti Banking MCP',
        toolName: 'search_nodes',
      });
      expect(mcpCitation?.snapshotId).toBe('mcp_live');
      expect(mcpCitation?.publishedContentHash).toBeNull();
    }
  });
});
