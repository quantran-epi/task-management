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
import type { EvidencePack } from '../../src/services/ai/evidencePack';

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

  // 16. Local scope empty (D-37) -> setTierAssignments empty -> {kind: 'clarify_intent'}; runLocalBm25 NOT called
  it('16. Local scope empty -> clarify_intent without runLocalBm25 (D-37)', async () => {
    mockInput.capabilities.serverEnabled = false;
    vi.mocked(mockDeps.routeScope).mockResolvedValueOnce({
      setTierAssignments: [],
      comparisonMode: null,
      routerSource: 'alias',
    });

    const res = await runGroundedTurn(mockInput, mockDeps);
    expect(res).toEqual({ kind: 'clarify_intent' });
    expect(mockDeps.runLocalBm25).not.toHaveBeenCalled();
    expect(mockDeps.synthesizeGroundedAnswer).not.toHaveBeenCalled();
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

  it('25. Uses a bounded 20-second federated retrieval budget', async () => {
    await runGroundedTurn(mockInput, mockDeps);

    expect(mockDeps.retrieveFederated).toHaveBeenCalledWith(
      expect.objectContaining({
        budgets: expect.objectContaining({ elapsedMs: 20000 }),
      }),
      mockInput.signal
    );
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
});
