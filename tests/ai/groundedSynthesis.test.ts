import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  synthesizeGroundedAnswer,
  detectQueryLanguage,
  buildSystemPrompt,
  normalizeRawGroundedOutput,
  GroundedSynthesisError,
  type SynthesisInput,
} from '../../src/services/ai/groundedSynthesis';
import * as nineRouterClient from '../../src/services/ai/nineRouterClient';
import type { EvidencePack } from '../../src/services/ai/evidencePack';
import type { GroundedAnswerV2 } from '../../src/services/ai/groundedAnswerSchemas';

describe('groundedSynthesis', () => {
  const completeJsonSpy = vi.spyOn(nineRouterClient, 'completeJson');

  beforeEach(() => {
    completeJsonSpy.mockReset();
  });

  const basePack: EvidencePack = {
    authority: 'server',
    citations: {
      S1: {
        citationId: 'S1',
        documentId: '00000000-0000-0000-0000-000000000001',
        documentTitle: 'CYTP1002 Process Spec',
        sectionAnchor: 'Section 1',
        lineStart: 1,
        lineEnd: 5,
        authority: 'server',
        evidenceClass: 'OBSERVED',
        snapshotId: 'gsnap_11111111',
        publishedContentHash: 'a'.repeat(64),
        citedExcerpt: 'Khách hàng phải xác nhận qua OTP SMS.',
        setMemberships: [{ setId: '10000000-0000-0000-0000-000000000001', setName: 'Spec' }],
      },
      S2: {
        citationId: 'S2',
        documentId: '00000000-0000-0000-0000-000000000002',
        documentTitle: 'Process Catalog',
        sectionAnchor: 'Section 2',
        lineStart: 10,
        lineEnd: 15,
        authority: 'server',
        evidenceClass: 'OBSERVED',
        snapshotId: 'gsnap_11111111',
        publishedContentHash: 'b'.repeat(64),
        citedExcerpt: 'PRC_PROCESS:60000006 định nghĩa quy trình CYTP1002',
        setMemberships: [{ setId: '10000000-0000-0000-0000-000000000001', setName: 'Spec' }],
      },
    },
    paths: {
      P1: {
        pathId: 'P1',
        snapshotId: 'gsnap_11111111',
        nodeUrns: ['urn:process:cytp1002', 'urn:system:smartvista'],
        edgeFactKeys: ['fact_1'],
        hopClassifications: ['OBSERVED'],
        hopCitationIds: [['S1']],
        classification: 'OBSERVED',
        hasConflict: false,
      },
    },
    conflicts: [],
    promptEvidence: [
      { id: 'S1', text: 'Khách hàng phải xác nhận qua OTP SMS.' },
      { id: 'S2', text: 'PRC_PROCESS:60000006 định nghĩa quy trình CYTP1002' },
    ],
    contextTruncated: false,
    coverageWarnings: [],
  };

  const validAnswer: GroundedAnswerV2 = {
    schemaVersion: 2,
    language: 'vi',
    conclusion: 'Quy trình CYTP1002 yêu cầu OTP SMS.',
    confidence: 'high',
    confidenceReason: 'Trực tiếp trích xuất từ tài liệu với độ bao phủ đầy đủ.',
    claims: [
      {
        id: 'C1',
        text: 'Khách hàng phải xác nhận qua OTP SMS.',
        classification: 'DIRECT',
        citationIds: ['S1'],
        pathId: null,
      },
    ],
    hypotheses: [],
    unsupportedParts: [],
  };

  function createInput(overrides: Partial<SynthesisInput> = {}): SynthesisInput {
    return {
      query: 'Quy trình CYTP1002 là gì?',
      pack: basePack,
      endpoint: 'http://localhost:20128',
      apiKey: 'test-key',
      model: 'gpt-4o',
      promptVersion: '2026.10.1',
      signal: new AbortController().signal,
      capabilityProfile: { strictJsonSchema: true },
      responseLanguage: 'auto',
      ...overrides,
    };
  }

  it('1. Happy path: valid pack + valid model JSON on first attempt', async () => {
    completeJsonSpy.mockResolvedValueOnce(validAnswer);

    const input = createInput();
    const result = await synthesizeGroundedAnswer(input);

    expect(result.answer).toEqual(validAnswer);
    expect(result.attempts.length).toBe(1);
    expect(result.attempts[0]?.attempt).toBe(1);
    expect(result.attempts[0]?.issueCodes).toEqual([]);
    expect(result.responseLanguage).toBe('vi');
    expect(completeJsonSpy).toHaveBeenCalledTimes(1);
  });

  it('2. Repair-once-passes: first attempt has unrepairable schema error, second passes', async () => {
    const invalidFirst = {
      ...validAnswer,
      claims: [
        {
          id: 'C1',
          text: '', // empty claim text cannot be repaired by normalization
          classification: 'DIRECT',
          citationIds: ['S1'],
          pathId: null,
        },
      ],
    };

    completeJsonSpy.mockResolvedValueOnce(invalidFirst);
    completeJsonSpy.mockResolvedValueOnce(validAnswer);

    const input = createInput();
    const result = await synthesizeGroundedAnswer(input);

    expect(result.answer).toEqual(validAnswer);
    expect(result.attempts.length).toBe(2);
    expect(result.attempts[0]?.attempt).toBe(1);
    expect(result.attempts[0]?.issueCodes).toContain('too_small');
    expect(result.attempts[1]?.attempt).toBe(2);
    expect(result.attempts[1]?.issueCodes).toEqual([]);
    expect(completeJsonSpy).toHaveBeenCalledTimes(2);
  });

  it('3. Two failed repairs → throws: all three attempts fail', async () => {
    const invalidJson = {
      invalidSchema: true,
    };

    completeJsonSpy.mockResolvedValue(invalidJson);

    const input = createInput();
    await expect(synthesizeGroundedAnswer(input)).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(GroundedSynthesisError);
      const synthErr = err as GroundedSynthesisError;
      expect(synthErr.code).toBe('INVALID_GROUNDED_OUTPUT');
      expect(synthErr.attempts.length).toBe(3); // 1 initial + 2 repairs
      expect(synthErr.attempts[0]?.attempt).toBe(1);
      expect(synthErr.attempts[1]?.attempt).toBe(2);
      expect(synthErr.attempts[2]?.attempt).toBe(3);
      return true;
    });

    expect(completeJsonSpy).toHaveBeenCalledTimes(3);
  });

  it('4. Closure rejection: first attempt fails closure due to unsupported path hop, repair fixes it', async () => {
    const packWithBrokenPath: EvidencePack = {
      ...basePack,
      paths: {
        P1: {
          ...basePack.paths.P1!,
          hopCitationIds: [['S_UNSUPPORTED']],
        },
      },
    };

    const invalidClosure = {
      schemaVersion: 2,
      language: 'vi',
      conclusion: 'Derived conclusion',
      confidence: 'medium',
      confidenceReason: 'Inferred path',
      claims: [
        {
          id: 'C1',
          text: 'Inferred claim with unsupported hop path',
          classification: 'INFERRED',
          citationIds: ['S1'],
          pathId: 'P1',
        },
      ],
      hypotheses: [],
      unsupportedParts: [],
    };

    const validInferred: GroundedAnswerV2 = {
      schemaVersion: 2,
      language: 'vi',
      conclusion: 'Derived conclusion',
      confidence: 'high',
      confidenceReason: 'Direct fallback',
      claims: [
        {
          id: 'C1',
          text: 'Direct claim fallback',
          classification: 'DIRECT',
          citationIds: ['S1'],
          pathId: null,
        },
      ],
      hypotheses: [],
      unsupportedParts: [],
    };

    completeJsonSpy.mockResolvedValueOnce(invalidClosure);
    completeJsonSpy.mockResolvedValueOnce(validInferred);

    const input = createInput({ pack: packWithBrokenPath });
    const result = await synthesizeGroundedAnswer(input);

    expect(result.answer).toEqual(validInferred);
    expect(result.attempts.length).toBe(2);
    expect(result.attempts[0]?.issueCodes).toContain('path_hop_unsupported');
  });

  it('5. Abort propagation: external AbortSignal fires mid-call', async () => {
    const abortErr = new nineRouterClient.NineRouterClientError('ABORTED', 'Request was aborted');
    completeJsonSpy.mockRejectedValueOnce(abortErr);

    const controller = new AbortController();
    const input = createInput({ signal: controller.signal });

    await expect(synthesizeGroundedAnswer(input)).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(GroundedSynthesisError);
      const synthErr = err as GroundedSynthesisError;
      expect(synthErr.code).toBe('ABORTED');
      return true;
    });
  });

  it('6. Timeout propagation: completeJson rejects with TIMEOUT', async () => {
    const timeoutErr = new nineRouterClient.NineRouterClientError('TIMEOUT', 'Request timed out');
    completeJsonSpy.mockRejectedValueOnce(timeoutErr);

    const input = createInput();
    await expect(synthesizeGroundedAnswer(input)).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(GroundedSynthesisError);
      const synthErr = err as GroundedSynthesisError;
      expect(synthErr.code).toBe('TIMEOUT');
      return true;
    });
  });

  it('7. Model unavailable (NETWORK_ERROR): completeJson rejects with NETWORK_ERROR', async () => {
    const netErr = new nineRouterClient.NineRouterClientError('NETWORK_ERROR', 'Connection failed');
    completeJsonSpy.mockRejectedValueOnce(netErr);

    const input = createInput();
    await expect(synthesizeGroundedAnswer(input)).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(GroundedSynthesisError);
      const synthErr = err as GroundedSynthesisError;
      expect(synthErr.code).toBe('MODEL_UNAVAILABLE');
      return true;
    });
  });

  it('8. No tools in request: completeJson call body does NOT contain tools', async () => {
    completeJsonSpy.mockResolvedValueOnce(validAnswer);

    const input = createInput();
    await synthesizeGroundedAnswer(input);

    expect(completeJsonSpy).toHaveBeenCalledTimes(1);
    const callArg = completeJsonSpy.mock.calls[0]![0];
    expect((callArg as any).tools).toBeUndefined();
    expect((callArg as any).tool_choice).toBeUndefined();
  });

  it('9. Strict JSON Schema when supported: response_format follows capabilityProfile', async () => {
    completeJsonSpy.mockResolvedValue(validAnswer);

    // strictJsonSchema === true
    await synthesizeGroundedAnswer(createInput({ capabilityProfile: { strictJsonSchema: true } }));
    let callArg = completeJsonSpy.mock.calls[0]![0];
    expect(callArg.response_format).toEqual({
      type: 'json_schema',
      json_schema: {
        name: 'taskmate_grounded_answer_v2',
        strict: true,
        schema: expect.any(Object),
      },
    });

    // strictJsonSchema === false
    completeJsonSpy.mockClear();
    await synthesizeGroundedAnswer(createInput({ capabilityProfile: { strictJsonSchema: false } }));
    callArg = completeJsonSpy.mock.calls[0]![0];
    expect(callArg.response_format).toEqual({
      type: 'json_object',
    });
  });

  it('10. Repair prompt reuses the exact frozen evidence without adding new evidence', async () => {
    const invalidFirst = {
      ...validAnswer,
      claims: [
        {
          id: 'C1',
          text: '', // schema invalid
          classification: 'DIRECT',
          citationIds: ['S1'],
          pathId: null,
        },
      ],
    };

    completeJsonSpy.mockResolvedValueOnce(invalidFirst);
    completeJsonSpy.mockResolvedValueOnce(validAnswer);

    const input = createInput();
    await synthesizeGroundedAnswer(input);

    expect(completeJsonSpy).toHaveBeenCalledTimes(2);
    const initialCall = completeJsonSpy.mock.calls[0]![0];
    const repairCall = completeJsonSpy.mock.calls[1]![0];

    const initialUserJson = JSON.parse(initialCall.messages[1]!.content);
    const repairUserJson = JSON.parse(repairCall.messages[1]!.content);

    expect(initialUserJson.evidence).toEqual(basePack.promptEvidence);
    expect(repairUserJson.evidence).toEqual(initialUserJson.evidence);
    expect(repairUserJson.allowedCitationIds).toEqual(Object.keys(basePack.citations));
  });

  it('11. No raw evidence in attempt logs: attempt log is content-free', async () => {
    completeJsonSpy.mockResolvedValueOnce(validAnswer);

    const input = createInput();
    const result = await synthesizeGroundedAnswer(input);

    for (const attempt of result.attempts) {
      expect((attempt as any).query).toBeUndefined();
      expect((attempt as any).prompt).toBeUndefined();
      expect((attempt as any).rawResponse).toBeUndefined();
      expect((attempt as any).evidence).toBeUndefined();
      expect(attempt).toHaveProperty('attempt');
      expect(attempt).toHaveProperty('latencyMs');
      expect(attempt).toHaveProperty('issueCodes');
      expect(attempt).toHaveProperty('responseLanguage');
    }
  });

  it('12. Prompt version in system message: stable marker included', async () => {
    completeJsonSpy.mockResolvedValueOnce(validAnswer);

    const input = createInput({ promptVersion: '2026.10.1-grounded-test' });
    await synthesizeGroundedAnswer(input);

    const callArg = completeJsonSpy.mock.calls[0]![0];
    const systemPrompt = callArg.messages[0]!.content;
    expect(systemPrompt).toContain('2026.10.1-grounded-test');
  });

  it('13. D-06 VI query returns VI prose', async () => {
    const viQuery = 'Quy trình CYTP1002 là gì?';
    expect(detectQueryLanguage(viQuery)).toBe('vi');

    completeJsonSpy.mockResolvedValueOnce(validAnswer);

    const input = createInput({ query: viQuery, responseLanguage: 'auto' });
    const result = await synthesizeGroundedAnswer(input);

    const systemPrompt = completeJsonSpy.mock.calls[0]![0].messages[0]!.content;
    expect(systemPrompt).toContain('Respond in Vietnamese');
    expect(result.responseLanguage).toBe('vi');
  });

  it('14. D-06 EN query returns EN prose', async () => {
    const enQuery = 'What is process CYTP1002?';
    expect(detectQueryLanguage(enQuery)).toBe('en');

    const enAnswer: GroundedAnswerV2 = {
      ...validAnswer,
      language: 'en',
      conclusion: 'Process CYTP1002 requires OTP SMS.',
    };
    completeJsonSpy.mockResolvedValueOnce(enAnswer);

    const input = createInput({ query: enQuery, responseLanguage: 'auto' });
    const result = await synthesizeGroundedAnswer(input);

    const systemPrompt = completeJsonSpy.mock.calls[0]![0].messages[0]!.content;
    expect(systemPrompt).toContain('Respond in English');
    expect(result.responseLanguage).toBe('en');
  });

  it('15. D-06 source quotes byte-identical regardless of query language', async () => {
    const expectedQuote = 'Khách hàng phải xác nhận qua OTP SMS.';

    const viAnswer: GroundedAnswerV2 = {
      schemaVersion: 2,
      language: 'vi',
      conclusion: 'Kết luận',
      confidence: 'high',
      confidenceReason: 'Trực tiếp trích dẫn',
      claims: [
        {
          id: 'C1',
          text: `Theo tài liệu: "${expectedQuote}"`,
          classification: 'DIRECT',
          citationIds: ['S1'],
          pathId: null,
        },
      ],
      hypotheses: [],
      unsupportedParts: [],
    };
    completeJsonSpy.mockResolvedValueOnce(viAnswer);

    const viResult = await synthesizeGroundedAnswer(
      createInput({ query: 'Quy trình CYTP1002 là gì?', responseLanguage: 'vi' })
    );

    const enAnswer: GroundedAnswerV2 = {
      schemaVersion: 2,
      language: 'en',
      conclusion: 'Conclusion',
      confidence: 'high',
      confidenceReason: 'Direct quote',
      claims: [
        {
          id: 'C1',
          text: `According to spec: "${expectedQuote}" (Customers must verify via SMS OTP)`,
          classification: 'DIRECT',
          citationIds: ['S1'],
          pathId: null,
        },
      ],
      hypotheses: [],
      unsupportedParts: [],
    };
    completeJsonSpy.mockResolvedValueOnce(enAnswer);

    const enResult = await synthesizeGroundedAnswer(
      createInput({ query: 'What is process CYTP1002?', responseLanguage: 'en' })
    );

    const viClaimText = viResult.answer.claims[0]!.text;
    const enClaimText = enResult.answer.claims[0]!.text;

    expect(viClaimText).toContain(expectedQuote);
    expect(enClaimText).toContain(expectedQuote);

    const expectedBuffer = Buffer.from(expectedQuote, 'utf8');
    const viExtracted = viClaimText.slice(
      viClaimText.indexOf(expectedQuote),
      viClaimText.indexOf(expectedQuote) + expectedQuote.length
    );
    const enExtracted = enClaimText.slice(
      enClaimText.indexOf(expectedQuote),
      enClaimText.indexOf(expectedQuote) + expectedQuote.length
    );

    expect(Buffer.from(viExtracted, 'utf8').equals(expectedBuffer)).toBe(true);
    expect(Buffer.from(enExtracted, 'utf8').equals(expectedBuffer)).toBe(true);
  });

  it('16. D-06 identifiers preserved verbatim: PRC_PROCESS:60000006 and CYTP1002 byte-identical', async () => {
    const id1 = 'PRC_PROCESS:60000006';
    const id2 = 'CYTP1002';

    const viAnswer: GroundedAnswerV2 = {
      schemaVersion: 2,
      language: 'vi',
      conclusion: `Thực thể ${id1} cho ${id2}`,
      confidence: 'high',
      confidenceReason: 'Trực tiếp trích dẫn',
      claims: [
        {
          id: 'C1',
          text: `${id1} định danh quy trình ${id2}`,
          classification: 'DIRECT',
          citationIds: ['S2'],
          pathId: null,
        },
      ],
      hypotheses: [],
      unsupportedParts: [],
    };
    completeJsonSpy.mockResolvedValueOnce(viAnswer);

    const viResult = await synthesizeGroundedAnswer(
      createInput({ query: 'Quy trình CYTP1002 là gì?', responseLanguage: 'vi' })
    );

    const enAnswer: GroundedAnswerV2 = {
      schemaVersion: 2,
      language: 'en',
      conclusion: `Entity ${id1} for ${id2}`,
      confidence: 'high',
      confidenceReason: 'Direct quote',
      claims: [
        {
          id: 'C1',
          text: `${id1} defines process ${id2}`,
          classification: 'DIRECT',
          citationIds: ['S2'],
          pathId: null,
        },
      ],
      hypotheses: [],
      unsupportedParts: [],
    };
    completeJsonSpy.mockResolvedValueOnce(enAnswer);

    const enResult = await synthesizeGroundedAnswer(
      createInput({ query: 'What is process CYTP1002?', responseLanguage: 'en' })
    );

    expect(viResult.answer.claims[0]!.text).toContain(id1);
    expect(viResult.answer.claims[0]!.text).toContain(id2);
    expect(enResult.answer.claims[0]!.text).toContain(id1);
    expect(enResult.answer.claims[0]!.text).toContain(id2);
  });

  it('17. D-06 explicit override: input.responseLanguage overrides query detection', async () => {
    const viQuery = 'Quy trình CYTP1002 là gì?';
    const enAnswer: GroundedAnswerV2 = {
      ...validAnswer,
      language: 'en',
      conclusion: 'Process CYTP1002 in English',
    };
    completeJsonSpy.mockResolvedValueOnce(enAnswer);

    const input = createInput({ query: viQuery, responseLanguage: 'en' });
    const result = await synthesizeGroundedAnswer(input);

    const systemPrompt = completeJsonSpy.mock.calls[0]![0].messages[0]!.content;
    expect(systemPrompt).toContain('Respond in English');
    expect(result.responseLanguage).toBe('en');
  });

  it('17b. system prompt instructs LLM to cite [M*] for live MCP tools', () => {
    const prompt = buildSystemPrompt('vi', '2026.10.1', 'S1');
    expect(prompt).toContain('[M*]');
    expect(prompt).toContain('Live MCP');
  });

  describe('D-11 NO_EVIDENCE honest abstention', () => {
    it('returns outcome NO_EVIDENCE, confidence unknown, 0 claims, 0 hypotheses when 0 citations and speculation_requested is false', async () => {
      const zeroPack: EvidencePack = {
        ...basePack,
        citations: {},
        paths: {},
        promptEvidence: [],
      };

      const input = createInput({ pack: zeroPack, speculation_requested: false });
      const result = await synthesizeGroundedAnswer(input);

      expect(completeJsonSpy).not.toHaveBeenCalled(); // zero evidence short-circuits without LLM call
      expect(result.answer.schemaVersion).toBe(2);
      expect(result.answer.confidence).toBe('unknown');
      expect(result.answer.claims).toEqual([]);
      expect(result.answer.hypotheses).toEqual([]);
      expect(result.answer.conclusion).toContain('Không tìm thấy thông tin');
    });
  });

  describe('D-10 Hypotheses & Speculation isolation', () => {
    it('strips hypotheses when speculation_requested is false', async () => {
      const modelOutputWithUnrequestedHypothesis = {
        ...validAnswer,
        hypotheses: [
          {
            id: 'H1',
            text: 'Có thể có quy trình phụ trợ',
            justification: 'Đoán mò',
          },
        ],
      };
      completeJsonSpy.mockResolvedValueOnce(modelOutputWithUnrequestedHypothesis);

      const input = createInput({ speculation_requested: false });
      const result = await synthesizeGroundedAnswer(input);

      expect(result.answer.hypotheses).toEqual([]);
    });

    it('permits hypotheses and sets confidence to low when speculation_requested is true', async () => {
      const modelOutputWithHypothesis = {
        ...validAnswer,
        confidence: 'high', // model might claim high, but system must enforce low
        hypotheses: [
          {
            id: 'H1',
            text: 'Cổng thanh toán trung gian xử lý điện',
            justification: 'Dựa trên kinh nghiệm kiến trúc',
          },
        ],
      };
      completeJsonSpy.mockResolvedValueOnce(modelOutputWithHypothesis);

      const input = createInput({ speculation_requested: true });
      const result = await synthesizeGroundedAnswer(input);

      expect(result.answer.hypotheses.length).toBe(1);
      expect(result.answer.confidence).toBe('low');
    });
  });

  describe('normalizeRawGroundedOutput & D-13 No Fallback Citation', () => {
    const allowedCitationIds = ['S1', 'S2'];
    const allowedPathIds = ['P1'];

    it('18. normalizes numeric citation IDs [1, 2] to ["S1", "S2"]', () => {
      const raw = {
        conclusion: 'Done',
        claims: [
          { id: '1', text: 'Some fact', classification: 'DIRECT', citationIds: [1, 2], pathId: null },
        ],
      };
      const res = normalizeRawGroundedOutput(raw, allowedCitationIds, allowedPathIds) as any;
      expect(res.claims[0].id).toBe('C1');
      expect(res.claims[0].citationIds).toEqual(['S1', 'S2']);
    });

    it('19. strips bracketed and parenthesized citations [S1], (S2)', () => {
      const raw = {
        conclusion: 'Done',
        claims: [
          { id: 'C1', text: 'Some fact', classification: 'DIRECT', citationIds: ['[S1]', '(S2)'], pathId: null },
        ],
      };
      const res = normalizeRawGroundedOutput(raw, allowedCitationIds, allowedPathIds) as any;
      expect(res.claims[0].citationIds).toEqual(['S1', 'S2']);
    });

    it('20. normalizes DIRECT claim with bogus pathId to pathId: null', () => {
      const raw = {
        conclusion: 'Done',
        claims: [
          { id: 'C1', text: 'Some fact', classification: 'DIRECT', citationIds: ['S1'], pathId: 'P1' },
        ],
      };
      const res = normalizeRawGroundedOutput(raw, allowedCitationIds, allowedPathIds) as any;
      expect(res.claims[0].pathId).toBeNull();
    });

    it('21. downgrades INFERRED claim with missing or invalid pathId to DIRECT with pathId: null', () => {
      const raw = {
        conclusion: 'Done',
        claims: [
          { id: 'C1', text: 'Some fact', classification: 'INFERRED', citationIds: ['S1'], pathId: null },
          { id: 'C2', text: 'Other fact', classification: 'INFERRED', citationIds: ['S1'], pathId: 'P99' },
        ],
      };
      const res = normalizeRawGroundedOutput(raw, allowedCitationIds, allowedPathIds) as any;
      expect(res.claims[0].classification).toBe('DIRECT');
      expect(res.claims[0].pathId).toBeNull();
      expect(res.claims[1].classification).toBe('DIRECT');
      expect(res.claims[1].pathId).toBeNull();
    });

    it('22. preserves valid INFERRED claim when pathId is in allowedPathIds', () => {
      const raw = {
        conclusion: 'Done',
        claims: [
          { id: 'C1', text: 'Valid inferred fact', classification: 'INFERRED', citationIds: ['S1'], pathId: 'P1' },
        ],
      };
      const res = normalizeRawGroundedOutput(raw, allowedCitationIds, allowedPathIds) as any;
      expect(res.claims[0].classification).toBe('INFERRED');
      expect(res.claims[0].pathId).toBe('P1');
    });

    it('23. D-13: does NOT inject fallback citation for ungrounded claims; moves to unsupportedParts', () => {
      const raw = {
        conclusion: 'Done',
        claims: [
          { id: 'C1', text: 'Ungrounded fact', classification: 'DIRECT', citationIds: ['S9', 'S99'], pathId: null },
        ],
      };
      const res = normalizeRawGroundedOutput(raw, allowedCitationIds, allowedPathIds) as any;
      // Claim has no valid citations; MUST NOT inherit S1
      expect(res.claims).toHaveLength(0);
      expect(res.unsupportedParts).toContain('Ungrounded fact');
    });

    it('24. D-13: does NOT reconstruct default DIRECT claim when claims array is empty', () => {
      const raw = {
        conclusion: 'Hệ thống đã xác nhận thành công.',
        claims: [],
      };
      const res = normalizeRawGroundedOutput(raw, allowedCitationIds, allowedPathIds) as any;
      expect(res.claims).toHaveLength(0);
    });

    it('25. strips markdown code fences from raw string JSON input', () => {
      const rawStr = '```json\n{\n  "conclusion": "Done",\n  "claims": []\n}\n```';
      const res = normalizeRawGroundedOutput(rawStr, allowedCitationIds, allowedPathIds) as any;
      expect(res.conclusion).toBe('Done');
      expect(res.schemaVersion).toBe(2);
    });

    it('27. normalizes S1 to L1 when only local citations are allowed', () => {
      const raw = {
        conclusion: 'Done',
        claims: [
          { id: 'C1', text: 'Local fact', classification: 'DIRECT', citationIds: ['S1'], pathId: null },
        ],
      };
      const res = normalizeRawGroundedOutput(raw, ['L1'], []) as any;
      expect(res.claims[0].citationIds).toEqual(['L1']);
    });

    it('29. extracts inline [S1] from claim.text when citationIds is omitted', () => {
      const raw = {
        conclusion: 'Done',
        claims: [
          { id: 'C1', text: 'Tiến trình 60000004 phân bổ nợ [S1].', classification: 'DIRECT' },
        ],
      };
      const res = normalizeRawGroundedOutput(raw, allowedCitationIds, allowedPathIds) as any;
      expect(res.claims).toHaveLength(1);
      expect(res.claims[0].citationIds).toEqual(['S1']);
    });

    it('30. expands comma-separated citation strings like "S1, S2"', () => {
      const raw = {
        conclusion: 'Done',
        claims: [
          { id: 'C1', text: 'Fact', classification: 'DIRECT', citationIds: ['S1, S2'] },
        ],
      };
      const res = normalizeRawGroundedOutput(raw, allowedCitationIds, allowedPathIds) as any;
      expect(res.claims[0].citationIds).toEqual(['S1', 'S2']);
    });

    it('34. attributes claims and adds inline citations when claims are empty but conclusion matches promptEvidence identifiers', () => {
      const raw = {
        conclusion: 'Tiến trình 60000004 xử lý chỉ thị MAIN1.OPR_OPERATION.\nMAIN1.CRD_PAYMENT_PKG.APPLY_PAYMENT cấn trừ nợ.',
        claims: [],
      };
      const mockEvidence = [
        {
          id: 'S1',
          documentTitle: '03 - Call chain',
          text: 'Tiến trình 60000004 kích hoạt chỉ thị MAIN1.OPR_OPERATION OPST0100',
        },
        {
          id: 'S2',
          documentTitle: 'Credit payment allocation',
          text: 'Thủ tục MAIN1.CRD_PAYMENT_PKG.APPLY_PAYMENT cấn trừ dư nợ',
        },
      ];
      const res = normalizeRawGroundedOutput(raw, ['S1', 'S2'], [], mockEvidence) as any;
      expect(res.claims).toHaveLength(2);
      expect(res.claims[0].citationIds).toEqual(['S1']);
      expect(res.claims[1].citationIds).toEqual(['S2']);
      expect(res.conclusion).toContain('[S1]');
      expect(res.conclusion).toContain('[S2]');
    });

    it('35. does NOT attribute citations or claims when confidence is unknown or response is no-evidence abstention', () => {
      const raw = {
        schemaVersion: 2,
        language: 'vi',
        conclusion: 'Không tìm thấy thông tin hoặc bằng chứng liên quan trong tài liệu và đồ thị tri thức hiện có.',
        confidence: 'unknown',
        confidenceReason: 'Không có trích dẫn hoặc đường đi đồ thị nào khớp với câu hỏi.',
        citationReasons: {},
        claims: [],
        hypotheses: [],
        unsupportedParts: ['Toàn bộ yêu cầu không có dữ liệu đối chiếu trong hệ thống'],
      };
      const mockEvidence = [
        {
          id: 'S1',
          documentTitle: '03 - Call chain',
          text: 'Tiến trình 60000004 kích hoạt chỉ thị MAIN1.OPR_OPERATION OPST0100',
        },
      ];
      const res = normalizeRawGroundedOutput(raw, ['S1'], [], mockEvidence) as any;
      expect(res.claims).toEqual([]);
      expect(res.conclusion).toBe('Không tìm thấy thông tin hoặc bằng chứng liên quan trong tài liệu và đồ thị tri thức hiện có.');
      expect(res.conclusion).not.toContain('[S1]');
    });

    it('36. normalizes and validates [M*] citations from live MCP tools', () => {
      const raw = {
        conclusion: 'Sở thích người dùng là chế độ tối [M1].',
        claims: [
          {
            id: 'C1',
            text: 'Người dùng chọn giao diện tối',
            classification: 'DIRECT',
            citationIds: ['M1'],
            pathId: null,
          },
        ],
      };
      const allowedCitationIds = ['S1', 'M1'];
      const res = normalizeRawGroundedOutput(raw, allowedCitationIds, []) as any;
      expect(res.claims).toHaveLength(1);
      expect(res.claims[0].citationIds).toEqual(['M1']);
      expect(res.claims[0].classification).toBe('DIRECT');
      expect(res.conclusion).toContain('[M1]');
    });

    it('37. extracts inline [M1] from claim.text when citationIds is omitted', () => {
      const raw = {
        conclusion: 'Done',
        claims: [
          { id: 'C1', text: 'Thông tin bộ nhớ thực tế [M1].', classification: 'DIRECT' },
        ],
      };
      const res = normalizeRawGroundedOutput(raw, ['M1'], []) as any;
      expect(res.claims).toHaveLength(1);
      expect(res.claims[0].citationIds).toEqual(['M1']);
    });
  });

  describe('buildSystemPrompt', () => {
    it('26. includes valid few-shot example and citation rules for schema v2', () => {
      const promptVi = buildSystemPrompt('vi', 'test-v1');
      expect(promptVi).toContain('VALID OUTPUT EXAMPLE:');
      expect(promptVi).toContain('"schemaVersion": 2');
      expect(promptVi).toContain('"confidence": "high"');
      expect(promptVi).toContain('NO-EVIDENCE RULE:');

      const promptEn = buildSystemPrompt('en', 'test-v1');
      expect(promptEn).toContain('Respond in English');
      expect(promptEn).toContain('VALID OUTPUT EXAMPLE:');
      expect(promptEn).toContain('"language": "en"');
    });

    it('28. adapts few-shot citationId to L1 when local authority citation provided', () => {
      const promptVi = buildSystemPrompt('vi', 'test-v1', 'L1');
      expect(promptVi).toContain('"citationIds": [\n        "L1"\n      ]');
    });

    it('29. enforces citationReasons with explicit entity/subject reference in system prompt', () => {
      const promptVi = buildSystemPrompt('vi', 'test-v1', 'S1');
      expect(promptVi).toContain('"citationReasons"');
      expect(promptVi).toContain('main subject/entity from the user query');
      expect(promptVi).toContain('Be strictly truthful and faithful to EVIDENCE');
    });

    it('30. requires neutral disclosure when Knowledge Server and MCP evidence conflict', () => {
      const promptVi = buildSystemPrompt('vi', 'test-v1', 'S1');
      expect(promptVi).toContain('MULTI-SOURCE CONFLICT RULE');
      expect(promptVi).toContain('describe each source position with its own citations');
      expect(promptVi).toContain('do not decide which source is correct');
      expect(promptVi).toContain('Absence from one source is not proof of non-existence');
    });
  });
});
