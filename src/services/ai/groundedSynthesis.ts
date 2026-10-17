import {
  GroundedAnswerSchemaV2,
  GroundedAnswerJsonSchema,
  type GroundedAnswerV2,
} from './groundedAnswerSchemas';
import {
  validateGroundedAnswerClosure,
  type EvidencePack,
  type ClosureIssue,
} from './evidencePack';
import {
  completeJson,
  NineRouterClientError,
  type CompleteJsonRequest,
} from './nineRouterClient';
import type { ChatTokenUsage } from '../../types/models';

export interface SynthesisInput {
  query: string;
  recentTurns?: readonly { role: 'user' | 'assistant'; content: string }[];
  pack: EvidencePack;
  endpoint: string;
  apiKey: string;
  model: string;
  promptVersion: string;
  signal: AbortSignal;
  capabilityProfile: { strictJsonSchema: boolean };
  responseLanguage?: 'vi' | 'en' | 'auto';
  speculation_requested?: boolean;
}

export interface SynthesisAttemptLog {
  attempt: number;
  latencyMs: number;
  usage: {
    inputTokens?: number;
    outputTokens?: number;
  };
  issueCodes: readonly string[];
  responseLanguage: 'vi' | 'en';
}

export type GroundedSynthesisErrorCode =
  | 'INVALID_GROUNDED_OUTPUT'
  | 'MODEL_UNAVAILABLE'
  | 'ABORTED'
  | 'TIMEOUT';

export class GroundedSynthesisError extends Error {
  constructor(
    public readonly code: GroundedSynthesisErrorCode,
    message: string,
    public readonly attempts: readonly SynthesisAttemptLog[] = []
  ) {
    super(message);
    this.name = 'GroundedSynthesisError';
  }
}

/**
 * Deterministic language detection helper:
 * Unicode diacritic characters in range [À-ỹ] or common Vietnamese stop words -> 'vi'; else 'en'.
 */
export function detectQueryLanguage(query: string): 'vi' | 'en' {
  if (/[À-ỹ]/.test(query)) {
    return 'vi';
  }
  const viWordPattern = /\b(của|và|hoặc|là|trong|không|được|với|này|cho)\b/i;
  if (viWordPattern.test(query)) {
    return 'vi';
  }
  return 'en';
}

export function buildSystemPrompt(
  targetLanguage: 'vi' | 'en',
  promptVersion: string,
  sampleCitationId: string = 'S1'
): string {
  const languageInstruction =
    targetLanguage === 'vi'
      ? 'Respond in Vietnamese; this is the user\'s query language. Source quotes and identifiers (URNs, codes, document titles, section anchors) MUST be reproduced byte-identical from EVIDENCE regardless of response language. If you need to translate a quote, present the original verbatim first, then an inline translation in parentheses; NEVER replace the quote with a translation. (D-06)'
      : 'Respond in English; this is the user\'s query language. Source quotes and identifiers (URNs, codes, document titles, section anchors) MUST be reproduced byte-identical from EVIDENCE regardless of response language. If you need to translate a quote, present the original verbatim first, then an inline translation in parentheses; NEVER replace the quote with a translation. (D-06)';

  const fewShotExample = JSON.stringify(
    {
      schemaVersion: 2,
      language: targetLanguage,
      conclusion:
        targetLanguage === 'vi'
          ? 'Quy trình CYTP1002 hoàn tất bước xác thực OTP theo đặc tả.'
          : 'Process CYTP1002 completes OTP verification per specification.',
      confidence: 'high',
      confidenceReason:
        targetLanguage === 'vi'
          ? 'Trực tiếp trích xuất từ tài liệu với độ bao phủ đầy đủ.'
          : 'Directly extracted from document with complete coverage.',
      claims: [
        {
          id: 'C1',
          text:
            targetLanguage === 'vi'
              ? 'Khách hàng phải xác thực mã OTP qua tin nhắn SMS.'
              : 'Customer must verify the OTP code via SMS message.',
          classification: 'DIRECT',
          citationIds: [sampleCitationId],
          pathId: null,
        },
      ],
      hypotheses: [],
      unsupportedParts: [],
    },
    null,
    2
  );

  return [
    `Version: ${promptVersion}`,
    'You are the Grounded Synthesis Engine for TaskMate. Your sole job is to answer the user query STRICTLY based on the provided EVIDENCE PACK.',
    'You must return a valid JSON object matching GroundedAnswerSchemaV2 (schemaVersion: 2).',
    'Never guess or introduce external training facts not present in EVIDENCE.',
    'INPUT STRUCTURE:',
    '- QUERY: User\'s question.',
    '- CONVERSATION_HISTORY: Prior turns between user and assistant for context resolution.',
    '- SPECULATION_REQUESTED: true | false.',
    '- EVIDENCE:',
    '  - Citations: [ { id: "S1", title: "...", excerpt: "..." }, ... ]',
    '  - Paths: [ { id: "P1", summary: "...", steps: [...] }, ... ]',
    'RULES:',
    '1. "language": ' + languageInstruction,
    '2. "conclusion": High-level executive synthesis answering the query directly in natural, beautiful, human-friendly Markdown formatting (using bullet points, bold key terms, tables or code blocks where appropriate) before technical citations.',
    '3. "confidence":',
    '   - "high": Query answered completely with direct evidence from authoritative documents or verified graph paths.',
    '   - "medium": Query partially answered or synthesized from multi-hop inferred paths without conflicts.',
    '   - "low": Conflicting evidence present, major steps missing, or speculative hypotheses requested.',
    '   - "unknown": Zero evidence found in the pack.',
    '4. "confidenceReason": One sentence explaining the confidence assignment based on evidence coverage.',
    '5. "claims":',
    '   - Every claim must state an atomic fact supported by one or more citationIds ("S1", "L1", etc.).',
    '   - classification is "DIRECT" if directly quoted/extracted from a citation (pathId must be null).',
    '   - classification is "INFERRED" if derived from graph traversal path (pathId must be "P1", "P2", etc.). Whenever an answer describes execution sequence, container flow, caller-callee steps, or entity relationships supported by a Path, you MUST set classification to "INFERRED" and pathId to the corresponding path id (e.g. "P1").',
    '   - If you cannot point to an exact citationId, DO NOT include the claim in claims. Put it in "unsupportedParts".',
    '6. "hypotheses":',
    '   - If SPECULATION_REQUESTED is false, this array MUST be empty [].',
    '   - If SPECULATION_REQUESTED is true, you may propose reasonable hypotheses based on domain context, each with a "justification". Hypotheses have NO citationIds.',
    '7. "unsupportedParts": Information requested by user that has no supporting evidence in the pack.',
    'NO-EVIDENCE RULE:',
    'If EVIDENCE is empty or contains no relevant facts:',
    '{"schemaVersion":2,"language":"vi","conclusion":"Không tìm thấy thông tin hoặc bằng chứng liên quan trong tài liệu và đồ thị tri thức hiện có.","confidence":"unknown","confidenceReason":"Không có trích dẫn hoặc đường đi đồ thị nào khớp với câu hỏi.","claims":[],"hypotheses":[],"unsupportedParts":["Toàn bộ yêu cầu không có dữ liệu đối chiếu trong hệ thống"]}',
    'VALID OUTPUT EXAMPLE:',
    fewShotExample,
  ].join('\n');
}

/**
 * Tolerant pre-parsing normalization:
 * Coerces common LLM formatting deviations before schema parsing and closure validation:
 * - Markdown code fences stripping
 * - Citation IDs format: numeric 1 -> 'S1', stripped brackets '[S1]' -> 'S1', filtered to allowedCitationIds
 * - Claim ID: missing/invalid coerced to 'C{i+1}'
 * - DIRECT claim pathId coerced to null; INFERRED without valid pathId downgraded to DIRECT
 * - Uncited claims are moved to unsupportedParts; NEVER given an arbitrary citation ID
 */
export function normalizeRawGroundedOutput(
  raw: unknown,
  allowedCitationIds: string[],
  allowedPathIds: string[]
): unknown {
  if (raw == null) return raw;

  let parsed = raw;
  if (typeof parsed === 'string') {
    let cleaned = parsed.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    }
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return raw;
    }
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return parsed;
  }

  const obj: Record<string, any> = { ...(parsed as Record<string, unknown>) };

  // 1. Coerce schemaVersion
  obj.schemaVersion = 2;

  // 2. Coerce language
  if (typeof obj.language === 'string') {
    obj.language = obj.language.trim();
  }

  // 3. Coerce conclusion
  if (typeof obj.conclusion === 'string') {
    obj.conclusion = obj.conclusion.trim();
  }

  // 4. Coerce confidence & confidenceReason
  if (
    typeof obj.confidence !== 'string' ||
    !['high', 'medium', 'low', 'unknown'].includes(obj.confidence)
  ) {
    obj.confidence = 'unknown';
  }
  if (typeof obj.confidenceReason !== 'string' || !obj.confidenceReason.trim()) {
    obj.confidenceReason = 'Đánh giá tự động dựa trên bằng chứng.';
  } else {
    obj.confidenceReason = obj.confidenceReason.trim();
  }

  // 5. Coerce unsupportedParts
  const unsupportedParts: string[] = [];
  if (Array.isArray(obj.unsupportedParts)) {
    for (const item of obj.unsupportedParts) {
      if (typeof item === 'string' && item.trim()) {
        unsupportedParts.push(item.trim());
      }
    }
  }

  // 6. Coerce hypotheses
  const normalizedHypotheses: any[] = [];
  if (Array.isArray(obj.hypotheses)) {
    for (let h = 0; h < obj.hypotheses.length; h++) {
      const rawHyp = obj.hypotheses[h];
      if (rawHyp && typeof rawHyp === 'object' && !Array.isArray(rawHyp)) {
        const text = typeof rawHyp.text === 'string' ? rawHyp.text.trim() : '';
        const justification =
          typeof rawHyp.justification === 'string' ? rawHyp.justification.trim() : '';
        if (text && justification) {
          normalizedHypotheses.push({
            id: typeof rawHyp.id === 'string' && /^H[1-9][0-9]*$/.test(rawHyp.id) ? rawHyp.id : `H${h + 1}`,
            text,
            justification,
          });
        }
      }
    }
  }
  obj.hypotheses = normalizedHypotheses;

  const allowedCitationSet = new Set(allowedCitationIds);
  const allowedPathSet = new Set(allowedPathIds);
  const isLocalAuthority = allowedCitationIds.some((id) => id.startsWith('L'));

  // 7. Coerce claims
  let rawClaims: unknown[] = [];
  if (Array.isArray(obj.claims)) {
    rawClaims = obj.claims;
  }

  const normalizedClaims: any[] = [];
  for (let i = 0; i < rawClaims.length; i++) {
    const rawClaim = rawClaims[i];
    if (rawClaim == null || typeof rawClaim !== 'object' || Array.isArray(rawClaim)) {
      continue;
    }
    const claim: Record<string, any> = { ...rawClaim };

    // Coerce claim id: C1, C2, etc.
    if (typeof claim.id !== 'string' || !/^C[1-9][0-9]*$/.test(claim.id)) {
      claim.id = `C${i + 1}`;
    }

    // Coerce text
    if (typeof claim.text !== 'string' && typeof claim.content === 'string') {
      claim.text = claim.content;
    }
    if (typeof claim.text === 'string') {
      claim.text = claim.text.trim();
    }

    // Coerce citationIds
    let claimCitations: unknown[] = [];
    if (Array.isArray(claim.citationIds)) {
      claimCitations = claim.citationIds;
    } else if (claim.citationIds != null) {
      claimCitations = [claim.citationIds];
    } else if (Array.isArray(claim.citations)) {
      claimCitations = claim.citations;
    }

    const resolvedCitations: string[] = [];
    for (const item of claimCitations) {
      let candidate = '';
      if (typeof item === 'number') {
        const primary = isLocalAuthority ? `L${item}` : `S${item}`;
        const secondary = isLocalAuthority ? `S${item}` : `L${item}`;
        if (allowedCitationSet.has(primary)) {
          candidate = primary;
        } else if (allowedCitationSet.has(secondary)) {
          candidate = secondary;
        } else {
          candidate = primary;
        }
      } else if (typeof item === 'string') {
        const clean = item.replace(/[\[\]\(\)\s]/g, '').trim();
        if (/^[0-9]+$/.test(clean)) {
          const primary = isLocalAuthority ? `L${clean}` : `S${clean}`;
          const secondary = isLocalAuthority ? `S${clean}` : `L${clean}`;
          if (allowedCitationSet.has(primary)) {
            candidate = primary;
          } else if (allowedCitationSet.has(secondary)) {
            candidate = secondary;
          } else {
            candidate = primary;
          }
        } else {
          const matchS = clean.match(/^S([0-9]+)$/);
          const matchL = clean.match(/^L([0-9]+)$/);
          if (matchS && isLocalAuthority) {
            const mappedToL = `L${matchS[1]}`;
            candidate = allowedCitationSet.has(mappedToL) ? mappedToL : clean;
          } else if (matchL && !isLocalAuthority) {
            const mappedToS = `S${matchL[1]}`;
            candidate = allowedCitationSet.has(mappedToS) ? mappedToS : clean;
          } else {
            candidate = clean;
          }
        }
      }

      if (candidate && allowedCitationSet.has(candidate)) {
        if (!resolvedCitations.includes(candidate)) {
          resolvedCitations.push(candidate);
        }
      }
    }

    // D-13: ZERO citation fallback injection. If resolved citations are empty, move claim to unsupportedParts!
    if (resolvedCitations.length === 0) {
      if (claim.text) {
        unsupportedParts.push(claim.text);
      }
      continue;
    }
    claim.citationIds = resolvedCitations;

    // Coerce classification and pathId (D-30: DIRECT claim must have null pathId)
    if (claim.classification === 'INFERRED') {
      let inferredPathId: string | null = null;
      if (
        typeof claim.pathId === 'string' &&
        allowedPathSet.has(claim.pathId) &&
        /^P[1-9][0-9]*$/.test(claim.pathId)
      ) {
        inferredPathId = claim.pathId;
      } else if (allowedPathIds.length === 1 && /quy trình|bước|luồng|container|flow|scheduler|pl\/sql/i.test(claim.text || '')) {
        inferredPathId = allowedPathIds[0] || null;
      }

      if (inferredPathId) {
        claim.classification = 'INFERRED';
        claim.pathId = inferredPathId;
      } else {
        claim.classification = 'DIRECT';
        claim.pathId = null;
      }
    } else {
      claim.classification = 'DIRECT';
      claim.pathId = null;
    }

    normalizedClaims.push(claim);
  }

  obj.claims = normalizedClaims;
  obj.unsupportedParts = unsupportedParts;

  return obj;
}

function mapToGroundedSynthesisError(
  err: unknown,
  attempts: readonly SynthesisAttemptLog[]
): GroundedSynthesisError {
  if (err instanceof GroundedSynthesisError) {
    return err;
  }
  if (err instanceof NineRouterClientError) {
    if (err.code === 'ABORTED') {
      return new GroundedSynthesisError('ABORTED', err.message, attempts);
    }
    if (err.code === 'TIMEOUT') {
      return new GroundedSynthesisError('TIMEOUT', err.message, attempts);
    }
    return new GroundedSynthesisError('MODEL_UNAVAILABLE', err.message, attempts);
  }
  if (err instanceof Error) {
    if (err.name === 'AbortError') {
      return new GroundedSynthesisError('ABORTED', err.message, attempts);
    }
    if (err.name === 'TimeoutError') {
      return new GroundedSynthesisError('TIMEOUT', err.message, attempts);
    }
  }
  return new GroundedSynthesisError('MODEL_UNAVAILABLE', String(err), attempts);
}

export async function synthesizeGroundedAnswer(
  input: SynthesisInput
): Promise<{
  answer: GroundedAnswerV2;
  attempts: readonly SynthesisAttemptLog[];
  responseLanguage: 'vi' | 'en';
  tokenUsage?: ChatTokenUsage | undefined;
}> {
  const targetLanguage: 'vi' | 'en' =
    input.responseLanguage === 'auto' || input.responseLanguage == null
      ? detectQueryLanguage(input.query)
      : input.responseLanguage;

  const allowedCitationIds = Object.keys(input.pack.citations);
  const allowedPathIds = Object.keys(input.pack.paths);
  const speculationRequested = !!input.speculation_requested;

  // D-11: Zero evidence abstention when 0 citations AND 0 paths, and no speculation requested
  if (allowedCitationIds.length === 0 && allowedPathIds.length === 0 && !speculationRequested) {
    const noEvidenceAnswer: GroundedAnswerV2 = {
      schemaVersion: 2,
      language: targetLanguage,
      conclusion:
        targetLanguage === 'vi'
          ? 'Không tìm thấy thông tin hoặc bằng chứng liên quan trong tài liệu và đồ thị tri thức hiện có.'
          : 'No relevant information or evidence found in indexed documents and knowledge graph.',
      confidence: 'unknown',
      confidenceReason:
        targetLanguage === 'vi'
          ? 'Không có trích dẫn hoặc đường đi đồ thị nào khớp với câu hỏi.'
          : 'No citations or graph paths matched the query.',
      claims: [],
      hypotheses: [],
      unsupportedParts: [
        targetLanguage === 'vi'
          ? 'Toàn bộ yêu cầu không có dữ liệu đối chiếu trong hệ thống'
          : 'Entire query has no matching evidence in the system',
      ],
    };
    return {
      answer: noEvidenceAnswer,
      attempts: [
        {
          attempt: 1,
          latencyMs: 0,
          usage: {},
          issueCodes: [],
          responseLanguage: targetLanguage,
        },
      ],
      responseLanguage: targetLanguage,
    };
  }

  const sampleCitationId = allowedCitationIds[0] || 'S1';
  const primarySystemPrompt = buildSystemPrompt(targetLanguage, input.promptVersion, sampleCitationId);
  const baseUserPayload = {
    query: input.query,
    conversation_history: input.recentTurns && input.recentTurns.length > 0 ? input.recentTurns : undefined,
    speculation_requested: speculationRequested,
    evidence: input.pack.promptEvidence,
    allowedCitationIds,
    allowedPathIds,
    conflicts: input.pack.conflicts,
    responseLanguage: targetLanguage,
  };

  const attempts: SynthesisAttemptLog[] = [];
  const maxAttempts = 3; // 1 initial + up to 2 repairs

  let lastRaw: unknown = null;
  let lastIssues: { path: string; code: string }[] = [];
  let lastClosureIssues: readonly ClosureIssue[] = [];

  for (let attemptIndex = 0; attemptIndex < maxAttempts; attemptIndex++) {
    const isRepair = attemptIndex > 0;
    const attemptNum = attemptIndex + 1;

    let systemContent = primarySystemPrompt;
    if (isRepair) {
      systemContent +=
        '\nPrevious answer failed validation at listed paths. Produce corrected JSON that honors schema v2, allowed ids, and response language lock.';
    }

    let userContent: string;
    if (!isRepair) {
      userContent = JSON.stringify(baseUserPayload);
    } else {
      userContent = JSON.stringify({
        issues: lastIssues,
        closureIssues: lastClosureIssues,
        allowedCitationIds,
        allowedPathIds,
        previousJson: lastRaw,
        speculation_requested: speculationRequested,
        responseLanguage: targetLanguage,
      });
    }

    let callSignal = input.signal;
    let repairCleanup: (() => void) | undefined;
    if (isRepair) {
      const repairTimeout = AbortSignal.timeout(45_000);
      callSignal = (AbortSignal as any).any
        ? (AbortSignal as any).any([input.signal, repairTimeout])
        : input.signal;
      repairCleanup = () => {};
    }

    const responseFormat: CompleteJsonRequest['response_format'] =
      input.capabilityProfile.strictJsonSchema
        ? {
            type: 'json_schema',
            json_schema: {
              name: 'taskmate_grounded_answer_v2',
              strict: true,
              schema: GroundedAnswerJsonSchema as Record<string, unknown>,
            },
          }
        : ({ type: 'json_object' } as any);

  const startTime = Date.now();
    let rawOutput: unknown;
    let capturedUsage: ChatTokenUsage | undefined;

    try {
      rawOutput = await completeJson({
        endpoint: input.endpoint,
        apiKey: input.apiKey,
        model: input.model,
        messages: [
          { role: 'system', content: systemContent },
          { role: 'user', content: userContent },
        ],
        response_format: responseFormat,
        signal: callSignal,
        onUsage: (u) => {
          capturedUsage = u;
        },
      });
    } catch (err: unknown) {
      repairCleanup?.();
      throw mapToGroundedSynthesisError(err, attempts);
    }
    repairCleanup?.();

    const latencyMs = Date.now() - startTime;

    // Tolerant pre-parsing normalization
    const normalizedOutput = normalizeRawGroundedOutput(rawOutput, allowedCitationIds, allowedPathIds);
    lastRaw = normalizedOutput;

    // Speculation policy check (D-10)
    if (!speculationRequested && (normalizedOutput as any)?.hypotheses?.length > 0) {
      // Hypotheses not permitted when speculation_requested is false
      (normalizedOutput as any).hypotheses = [];
    }
    if (speculationRequested && (normalizedOutput as any)?.hypotheses?.length > 0) {
      (normalizedOutput as any).confidence = 'low';
    }

    // Validate with Zod Schema V2
    const zodResult = GroundedAnswerSchemaV2.safeParse(normalizedOutput);

    if (zodResult.success) {
      const answer = zodResult.data;
      const closureResult = validateGroundedAnswerClosure(answer, input.pack);

      if (closureResult.valid) {
        const usageObj: SynthesisAttemptLog['usage'] = {};
        if (capturedUsage?.promptTokens !== undefined) usageObj.inputTokens = capturedUsage.promptTokens;
        if (capturedUsage?.completionTokens !== undefined) usageObj.outputTokens = capturedUsage.completionTokens;

        attempts.push({
          attempt: attemptNum,
          latencyMs,
          usage: usageObj,
          issueCodes: [],
          responseLanguage: targetLanguage,
        });
        return {
          answer,
          attempts,
          responseLanguage: targetLanguage,
          ...(capturedUsage ? { tokenUsage: capturedUsage } : {}),
        };
      }

      // Closure failure
      const issueCodes = closureResult.issues.map((i) => i.code);
      lastClosureIssues = closureResult.issues;
      lastIssues = closureResult.issues.map((i) => ({ path: i.path, code: i.code }));
      attempts.push({
        attempt: attemptNum,
        latencyMs,
        usage: {},
        issueCodes,
        responseLanguage: targetLanguage,
      });
    } else {
      // Zod parse failure
      const issueCodes = zodResult.error.issues.map((i) => i.code);
      lastIssues = zodResult.error.issues.map((i) => ({
        path: i.path.join('.'),
        code: i.code,
      }));
      lastClosureIssues = [];
      attempts.push({
        attempt: attemptNum,
        latencyMs,
        usage: {},
        issueCodes,
        responseLanguage: targetLanguage,
      });
    }
  }

  // Exhausted bounded repair attempts
  throw new GroundedSynthesisError(
    'INVALID_GROUNDED_OUTPUT',
    'Failed to synthesize valid grounded answer after 2 repair attempts',
    attempts
  );
}
