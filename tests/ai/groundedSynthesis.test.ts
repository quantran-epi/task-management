import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  synthesizeGroundedAnswer,
  detectQueryLanguage,
  GroundedSynthesisError,
  type SynthesisInput,
} from '../../src/services/ai/groundedSynthesis';
import * as nineRouterClient from '../../src/services/ai/nineRouterClient';
import type { EvidencePack } from '../../src/services/ai/evidencePack';
import type { GroundedAnswer } from '../../src/services/ai/groundedAnswerSchemas';

describe('groundedSynthesis', () => {
  const completeJsonSpy = vi.spyOn(nineRouterClient, 'completeJson');

  beforeEach(() => {
    vi.clearAllMocks();
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

  const validAnswer: GroundedAnswer = {
    schemaVersion: 1,
    language: 'vi',
    conclusion: 'Quy trình CYTP1002 yêu cầu OTP SMS.',
    claims: [
      {
        id: 'C1',
        text: 'Khách hàng phải xác nhận qua OTP SMS.',
        classification: 'DIRECT',
        citationIds: ['S1'],
        pathId: null,
      },
    ],
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

  it('2. Repair-once-passes: first attempt has invalid citation, second passes', async () => {
    const invalidFirst: GroundedAnswer = {
      ...validAnswer,
      claims: [
        {
          id: 'C1',
          text: 'Unknown citation claim',
          classification: 'DIRECT',
          citationIds: ['S9'], // S9 does not exist in pack
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
    expect(result.attempts[0]?.issueCodes).toContain('unknown_citation_id');
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

  it('4. Closure rejection: first attempt INFERRED claim lacks pathId, repair fixes it', async () => {
    const invalidClosure = {
      schemaVersion: 1,
      language: 'vi',
      conclusion: 'Derived conclusion',
      claims: [
        {
          id: 'C1',
          text: 'Inferred claim without pathId',
          classification: 'INFERRED',
          citationIds: ['S1'],
          pathId: null, // violates schema and closure
        },
      ],
      unsupportedParts: [],
    };

    const validInferred: GroundedAnswer = {
      schemaVersion: 1,
      language: 'vi',
      conclusion: 'Derived conclusion',
      claims: [
        {
          id: 'C1',
          text: 'Inferred claim with pathId',
          classification: 'INFERRED',
          citationIds: ['S1'],
          pathId: 'P1',
        },
      ],
      unsupportedParts: [],
    };

    completeJsonSpy.mockResolvedValueOnce(invalidClosure);
    completeJsonSpy.mockResolvedValueOnce(validInferred);

    const input = createInput();
    const result = await synthesizeGroundedAnswer(input);

    expect(result.answer).toEqual(validInferred);
    expect(result.attempts.length).toBe(2);
    expect(result.attempts[0]?.issueCodes).toContain('custom');
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
        name: 'taskmate_grounded_answer_v1',
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

  it('10. Repair prompt carries no new evidence: assert repair user message evidence is identical', async () => {
    const invalidFirst: GroundedAnswer = {
      ...validAnswer,
      claims: [
        {
          id: 'C1',
          text: 'Unknown citation claim',
          classification: 'DIRECT',
          citationIds: ['S9'],
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

    // Repair message does NOT carry new evidence; repairUserJson has only issues, previousJson, allowed IDs
    expect(repairUserJson.evidence).toBeUndefined();
    expect(initialUserJson.evidence).toEqual(basePack.promptEvidence);
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

    const enAnswer: GroundedAnswer = {
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

    // VI query run
    const viAnswer: GroundedAnswer = {
      schemaVersion: 1,
      language: 'vi',
      conclusion: 'Kết luận',
      claims: [
        {
          id: 'C1',
          text: `Theo tài liệu: "${expectedQuote}"`,
          classification: 'DIRECT',
          citationIds: ['S1'],
          pathId: null,
        },
      ],
      unsupportedParts: [],
    };
    completeJsonSpy.mockResolvedValueOnce(viAnswer);

    const viResult = await synthesizeGroundedAnswer(
      createInput({ query: 'Quy trình CYTP1002 là gì?', responseLanguage: 'vi' })
    );

    // EN query run
    const enAnswer: GroundedAnswer = {
      schemaVersion: 1,
      language: 'en',
      conclusion: 'Conclusion',
      claims: [
        {
          id: 'C1',
          text: `According to spec: "${expectedQuote}" (Customers must verify via SMS OTP)`,
          classification: 'DIRECT',
          citationIds: ['S1'],
          pathId: null,
        },
      ],
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

    // Byte-identical comparison using Buffer.from
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

    const viAnswer: GroundedAnswer = {
      schemaVersion: 1,
      language: 'vi',
      conclusion: `Thực thể ${id1} cho ${id2}`,
      claims: [
        {
          id: 'C1',
          text: `${id1} định danh quy trình ${id2}`,
          classification: 'DIRECT',
          citationIds: ['S2'],
          pathId: null,
        },
      ],
      unsupportedParts: [],
    };
    completeJsonSpy.mockResolvedValueOnce(viAnswer);

    const viResult = await synthesizeGroundedAnswer(
      createInput({ query: 'Quy trình CYTP1002 là gì?', responseLanguage: 'vi' })
    );

    const enAnswer: GroundedAnswer = {
      schemaVersion: 1,
      language: 'en',
      conclusion: `Entity ${id1} for ${id2}`,
      claims: [
        {
          id: 'C1',
          text: `${id1} defines process ${id2}`,
          classification: 'DIRECT',
          citationIds: ['S2'],
          pathId: null,
        },
      ],
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
    const viQuery = 'Quy trình CYTP1002 là gì?'; // Vietnamese query
    const enAnswer: GroundedAnswer = {
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
});
