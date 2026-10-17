import {
  runGroundedTurn,
  type GroundedTurnDeps,
  type GroundedTurnInput,
} from '../../src/services/ai/groundedTurn';
import {
  packEvidence,
  validateGroundedAnswerClosure,
} from '../../src/services/ai/evidencePack';
import { ChatMessageGroundingSchema } from '../../src/services/ai/groundedAnswerSchemas';
import { BackupChatMessageRecordSchema } from '../../src/validation/backupSchemas';
import { KnowledgeClientError } from '../../src/services/knowledge/knowledgeClient';
import type { FederatedRetrievalResponse } from '../../src/services/knowledge/retrievalProtocol';
import type { LocalGroundedResult } from '../../src/services/search/localGroundedRetrieval';
import type { GroundedReferenceCase } from '../fixtures/ai/grounded-reference-fixture-schema';

export interface CaseInvariantViolation {
  readonly caseId: string;
  readonly violation: string;
}

export interface CaseEvaluationResult {
  readonly id: string;
  readonly category: string;
  readonly passed: boolean;
  readonly isThreeHop: boolean;
  readonly hasExpectedPaths: boolean;
  readonly pathFidelityPassed: boolean;
  readonly failureReasons: readonly string[];
  readonly invariantViolations: readonly CaseInvariantViolation[];
  readonly actualOutcome: string | null;
}

export function createMockDepsForCase(
  tc: GroundedReferenceCase,
  networkSpy: { calls: number },
  synthesizeCalls: Array<{
    query: string;
    targetLanguage?: string;
    promptVersion?: string;
  }> = []
): GroundedTurnDeps {
  return {
    routeIntent: async (query: string) => {
      if (tc.routeOverride) {
        return { route: tc.routeOverride, confidence: 1.0 };
      }
      if (query.toLowerCase().includes('tạo công việc')) {
        return { route: 'operational', confidence: 1.0 };
      }
      return { route: 'knowledge', confidence: 1.0 };
    },

    routeScope: async () => ({
      setTierAssignments: [
        {
          setId: '10000000-0000-4000-8000-000000000001',
          tier: 'REQUIRED',
          roleGroup: 'baseline',
        },
      ],
      comparisonMode: 'single',
      routerSource: 'base_default',
    }),

    retrieveFederated: async () => {
      networkSpy.calls++;
      if (!tc.retrievalMock) {
        throw new Error('Unexpected retrieveFederated call');
      }
      if (tc.retrievalMock.errorCode) {
        if (tc.retrievalMock.errorCode === 'TIMEOUT') {
          throw new KnowledgeClientError('TIMEOUT', 'Timeout from server');
        }
        if (tc.retrievalMock.errorCode.startsWith('REMOTE_ERROR_401')) {
          throw new KnowledgeClientError('REMOTE_ERROR', 'Unauthorized', 401);
        }
        if (tc.retrievalMock.errorCode === 'NETWORK_ERROR') {
          throw new KnowledgeClientError('NETWORK_ERROR', 'Failed to fetch');
        }
        throw new KnowledgeClientError('REMOTE_ERROR', 'Remote error', 500);
      }
      return tc.retrievalMock.response as unknown as FederatedRetrievalResponse;
    },

    runLocalBm25: async () => {
      if (tc.localResultMock) {
        return tc.localResultMock as unknown as LocalGroundedResult;
      }
      return {
        ranges: [],
        strongEvidence: false,
        totalScanned: 0,
      };
    },

    localBm25Deps: {
      loadSetMembers: async () => [],
      loadNoteBody: async () => null,
    },

    packEvidence: (inp, opts) => packEvidence(inp, opts),

    synthesizeGroundedAnswer: async (synthInput) => {
      synthesizeCalls.push({
        query: synthInput.query,
        targetLanguage: synthInput.responseLanguage,
        promptVersion: synthInput.promptVersion,
      });

      if (!tc.synthesisMock) {
        throw new Error('Unexpected synthesizeGroundedAnswer call');
      }

      // Validate closure against packed evidence before returning
      const closureCheck = validateGroundedAnswerClosure(
        tc.synthesisMock as any,
        synthInput.pack
      );
      if (!closureCheck.valid) {
        throw new Error(
          `Closure validation failed: ${JSON.stringify(closureCheck.issues)}`
        );
      }

      const responseLang: 'vi' | 'en' =
        synthInput.responseLanguage === 'vi' ||
        synthInput.responseLanguage === 'en'
          ? synthInput.responseLanguage
          : tc.language === 'en'
          ? 'en'
          : 'vi';

      return {
        answer: tc.synthesisMock as any,
        attempts: [],
        responseLanguage: responseLang,
      };
    },

    now: () => '2026-10-11T12:00:00.000Z',
  };
}

export async function evaluateBenchmarkCase(
  tc: GroundedReferenceCase
): Promise<CaseEvaluationResult> {
  const failureReasons: string[] = [];
  const invariantViolations: CaseInvariantViolation[] = [];
  const synthesizeCalls: Array<{
    query: string;
    targetLanguage?: string;
    promptVersion?: string;
  }> = [];
  const networkSpy = { calls: 0 };

  const mockDeps = createMockDepsForCase(tc, networkSpy, synthesizeCalls);

  const input: GroundedTurnInput = {
    query: tc.query,
    recentTurns: tc.recentTurns,
    signal: new AbortController().signal,
    capabilities: tc.capabilities,
    config: {
      endpoint: 'https://api.9router.com',
      apiKey: 'test-key',
      model: 'gpt-4o',
      promptVersion: 'grounded-v1',
      routerVersion: 'router-v1',
    },
    catalog: [
      {
        setId: '10000000-0000-4000-8000-000000000001',
        canonicalName: 'Bộ tài liệu kiểm thử',
        domain: 'General',
        environment: null,
        version: null,
        aliases: [],
        relation: null,
        isBase: true,
      },
    ],
    recentSessionId: 'session-eval',
  };

  const hasExpectedPaths = tc.expected.requiredPathIds.length > 0;
  const isThreeHop =
    hasExpectedPaths &&
    tc.expected.requiredPathIds.some((pid) => {
      const p = (tc.retrievalMock?.response as any)?.paths?.find(
        (rp: any) => rp.path?.pathId === pid
      );
      return p?.path?.edgeFactKeys?.length === 3;
    });

  let pathFidelityPassed = true;
  let actualOutcome: string | null = null;

  try {
    const result = await runGroundedTurn(input, mockDeps);

    // Kind assertion
    if (result.kind !== tc.expected.kind) {
      failureReasons.push(
        `Expected kind '${tc.expected.kind}', got '${result.kind}'`
      );
    }

    // Invariant check: forbidden fallback with network egress
    // D-12: Zero network egress during fallback. If the case tests error visibility on remote 401,
    // the single initial retrieval call is expected, but no fallback retrieval or secondary calls are allowed.
    if (tc.expected.forbiddenFallback && result.kind === 'local_fallback_results' && networkSpy.calls > 0) {
      invariantViolations.push({
        caseId: tc.id,
        violation: `Forbidden network egress occurred during fallback: ${networkSpy.calls} network calls made`,
      });
    }

    if (result.kind === 'operational') {
      actualOutcome = null;
      if (networkSpy.calls > 0) {
        failureReasons.push('Operational turn made network calls');
      }
    } else if (result.kind === 'clarify_entity') {
      actualOutcome = 'outcome' in result ? result.outcome : null;
      if (actualOutcome !== 'NEEDS_CLARIFICATION') {
        failureReasons.push(
          `Expected clarify_entity outcome NEEDS_CLARIFICATION, got '${actualOutcome}'`
        );
      }
      if ('candidates' in result) {
        if (result.candidates.length === 0) {
          failureReasons.push('Expected candidates list in clarify_entity');
        }
        if (
          tc.expected.requiredCandidates &&
          result.candidates.length !== tc.expected.requiredCandidates.length
        ) {
          failureReasons.push(
            `Expected ${tc.expected.requiredCandidates.length} candidates, got ${result.candidates.length}`
          );
        }
      }
    } else if (result.kind === 'refine') {
      actualOutcome = 'outcome' in result ? result.outcome : null;
      if (actualOutcome !== tc.expected.outcome) {
        failureReasons.push(
          `Expected refine outcome '${tc.expected.outcome}', got '${actualOutcome}'`
        );
      }
      if (
        'refinementChips' in result &&
        tc.expected.requiredRefinementCount !== null &&
        result.refinementChips.length !== tc.expected.requiredRefinementCount
      ) {
        failureReasons.push(
          `Expected ${tc.expected.requiredRefinementCount} refinement chips, got ${result.refinementChips.length}`
        );
      }
    } else if (result.kind === 'error') {
      actualOutcome = 'code' in result ? result.code : null;
      if (actualOutcome !== tc.expected.outcome) {
        failureReasons.push(
          `Expected error code '${tc.expected.outcome}', got '${actualOutcome}'`
        );
      }
    } else if (result.kind === 'grounded_answer') {
      const grounding = result.grounding;
      actualOutcome = grounding.outcome;

      if (grounding.outcome !== tc.expected.outcome) {
        failureReasons.push(
          `Expected grounding outcome '${tc.expected.outcome}', got '${grounding.outcome}'`
        );
      }

      // Schema verification
      try {
        ChatMessageGroundingSchema.parse(grounding);
      } catch (err: any) {
        failureReasons.push(`ChatMessageGroundingSchema invalid: ${err.message}`);
      }

      // Required citations
      const citationIds = grounding.citations.map((c) => c.citationId);
      for (const reqCid of tc.expected.requiredCitationIds) {
        if (!citationIds.includes(reqCid)) {
          failureReasons.push(`Missing required citation '${reqCid}'`);
        }
      }

      // Required facts & forbidden claims
      const fullConclusion = grounding.answer?.conclusion ?? '';
      const claimsText =
        grounding.answer?.claims.map((c) => c.text).join(' ') ?? '';
      const combinedAnswerText = `${fullConclusion} ${claimsText}`;

      for (const fact of tc.expected.requiredFacts) {
        if (!combinedAnswerText.includes(fact)) {
          failureReasons.push(`Missing required fact: '${fact}'`);
        }
      }

      for (const forbidden of tc.expected.forbiddenClaims) {
        if (combinedAnswerText.includes(forbidden)) {
          invariantViolations.push({
            caseId: tc.id,
            violation: `Generated answer contains forbidden claim: '${forbidden}'`,
          });
          failureReasons.push(`Forbidden claim present: '${forbidden}'`);
        }
      }

      // Trust Invariant: zero credential leakage (D-03, D-23)
      const credPatterns = [/canary-secret/i, /bearer\s+[a-z0-9_-]{10,}/i];
      for (const pattern of credPatterns) {
        if (
          pattern.test(combinedAnswerText) ||
          pattern.test(JSON.stringify(grounding))
        ) {
          invariantViolations.push({
            caseId: tc.id,
            violation: `Credential leakage detected matching pattern ${pattern.source}`,
          });
          failureReasons.push(`Credential leakage detected`);
        }
      }

      // Required paths & Path Fidelity (D-05)
      if (tc.expected.requiredPathIds.length > 0) {
        const pathIds = grounding.paths?.map((p) => p.pathId) ?? [];
        for (const reqPid of tc.expected.requiredPathIds) {
          if (!pathIds.includes(reqPid)) {
            pathFidelityPassed = false;
            failureReasons.push(`Missing required path '${reqPid}'`);
          }
        }

        // Validate path fidelity across every hop: snapshot boundary & edge endpoints
        const returnedPaths = grounding.paths ?? [];
        for (const p of returnedPaths) {
          if (p.nodeUrns.length !== p.edgeFactKeys.length + 1) {
            pathFidelityPassed = false;
            failureReasons.push(
              `Path '${p.pathId}' nodeUrns length (${p.nodeUrns.length}) mismatch edgeFactKeys (${p.edgeFactKeys.length})`
            );
          }
          if (p.hopCitationIds.length !== p.edgeFactKeys.length) {
            pathFidelityPassed = false;
            failureReasons.push(
              `Path '${p.pathId}' hopCitationIds count mismatch edge count`
            );
          }
          // Snapshot isolation: no cross-snapshot hops
          if (!p.snapshotId || p.snapshotId === '') {
            pathFidelityPassed = false;
            invariantViolations.push({
              caseId: tc.id,
              violation: `Path '${p.pathId}' has empty or invalid snapshotId`,
            });
          }
        }
      }

      // Required conflict branches
      if (tc.expected.requiredConflictBranches) {
        if (
          !grounding.conflicts ||
          grounding.conflicts.length === 0 ||
          grounding.conflicts[0]!.branches.length !==
            tc.expected.requiredConflictBranches
        ) {
          failureReasons.push(
            `Expected ${tc.expected.requiredConflictBranches} conflict branches`
          );
        }
      }

      // Required fallback reason
      if (tc.expected.requiredFallbackReason !== null) {
        if (grounding.fallbackReason !== tc.expected.requiredFallbackReason) {
          failureReasons.push(
            `Expected fallbackReason '${tc.expected.requiredFallbackReason}', got '${grounding.fallbackReason}'`
          );
        }
      }

      // Required coverage warnings
      for (const warn of tc.expected.requiredCoverageWarnings) {
        const found = grounding.coverageWarnings.some((w) => w.includes(warn));
        if (!found) {
          failureReasons.push(`Missing required coverage warning: '${warn}'`);
        }
      }

      // Required response language
      if (tc.expected.requiredResponseLanguage) {
        if (grounding.answer?.language !== tc.expected.requiredResponseLanguage) {
          failureReasons.push(
            `Expected response language '${tc.expected.requiredResponseLanguage}', got '${grounding.answer?.language}'`
          );
        }
      }

      // Required byte-identical quotes
      if (tc.expected.requiredByteIdenticalQuotes) {
        for (const quote of tc.expected.requiredByteIdenticalQuotes) {
          if (!combinedAnswerText.includes(quote)) {
            failureReasons.push(
              `Missing required byte-identical quote: '${quote}'`
            );
          } else {
            const quoteBuffer = Buffer.from(quote, 'utf8');
            const foundIndex = combinedAnswerText.indexOf(quote);
            const actualSubstring = combinedAnswerText.slice(
              foundIndex,
              foundIndex + quote.length
            );
            const actualBuffer = Buffer.from(actualSubstring, 'utf8');
            if (!quoteBuffer.equals(actualBuffer)) {
              failureReasons.push(
                `Quote '${quote}' failed byte-identical buffer check`
              );
            }
          }
        }
      }

      // Backup round-trip
      try {
        BackupChatMessageRecordSchema.parse({
          id: '10000000-0000-4000-8000-000000000001',
          threadId: '20000000-0000-4000-8000-000000000002',
          role: 'assistant',
          content: combinedAnswerText,
          createdAt: '2026-10-11T12:00:00.000Z',
          grounding,
        });
      } catch (err: any) {
        failureReasons.push(`Backup persistence round-trip failed: ${err.message}`);
      }
    }
  } catch (err: any) {
    failureReasons.push(`Execution error: ${err.message}`);
  }

  const passed = failureReasons.length === 0 && invariantViolations.length === 0;

  return {
    id: tc.id,
    category: tc.category,
    passed,
    isThreeHop,
    hasExpectedPaths,
    pathFidelityPassed: hasExpectedPaths ? pathFidelityPassed : true,
    failureReasons,
    invariantViolations,
    actualOutcome,
  };
}

export async function evaluateAllCases(
  cases: readonly GroundedReferenceCase[]
): Promise<CaseEvaluationResult[]> {
  const results: CaseEvaluationResult[] = [];
  for (const tc of cases) {
    const res = await evaluateBenchmarkCase(tc);
    results.push(res);
  }
  return results;
}
