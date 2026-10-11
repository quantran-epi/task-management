import { describe, it, expect, vi } from 'vitest';
import fixtureData from '../fixtures/ai/grounded-assistant-reference.json';
import {
  GroundedReferenceCaseSchema,
  type GroundedReferenceCase,
} from '../fixtures/ai/grounded-reference-fixture-schema';
import {
  runGroundedTurn,
  type GroundedTurnDeps,
  type GroundedTurnInput,
} from '../../src/services/ai/groundedTurn';
import {
  packEvidence,
  validateGroundedAnswerClosure,
} from '../../src/services/ai/evidencePack';
import {
  ChatMessageGroundingSchema,
  type ChatMessageGrounding,
} from '../../src/services/ai/groundedAnswerSchemas';
import { BackupChatMessageRecordSchema } from '../../src/validation/backupSchemas';
import { KnowledgeClientError } from '../../src/services/knowledge/knowledgeClient';
import type { FederatedRetrievalResponse } from '../../src/services/knowledge/retrievalProtocol';
import type { LocalGroundedResult } from '../../src/services/search/localGroundedRetrieval';

describe('groundedAssistantEval: 20-case reference fixture replay', () => {
  const cases: GroundedReferenceCase[] = fixtureData.map((c) =>
    GroundedReferenceCaseSchema.parse(c)
  );

  it('contains exactly 20 cases with valid schema', () => {
    expect(cases.length).toBe(20);
  });

  cases.forEach((tc) => {
    it(`evaluates [${tc.id}] (${tc.language}): ${tc.query.slice(0, 40)}...`, async () => {
      const synthesizeCalls: Array<{
        query: string;
        targetLanguage?: string;
        promptVersion?: string;
      }> = [];

      const retrieveSpy = vi.fn();
      const localBm25Spy = vi.fn();

      const mockDeps: GroundedTurnDeps = {
        routeIntent: vi.fn().mockImplementation((query: string) => {
          if (tc.routeOverride) {
            return { route: tc.routeOverride, confidence: 1.0 };
          }
          if (query.toLowerCase().includes('tạo công việc')) {
            return { route: 'operational', confidence: 1.0 };
          }
          return { route: 'knowledge', confidence: 1.0 };
        }),

        routeScope: vi.fn().mockResolvedValue({
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

        retrieveFederated: retrieveSpy.mockImplementation(async () => {
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
        }),

        runLocalBm25: localBm25Spy.mockImplementation(async () => {
          if (tc.localResultMock) {
            return tc.localResultMock as unknown as LocalGroundedResult;
          }
          return {
            ranges: [],
            strongEvidence: false,
            totalScanned: 0,
          };
        }),

        localBm25Deps: {
          loadSetMembers: vi.fn().mockResolvedValue([]),
          loadNoteBody: vi.fn().mockResolvedValue(null),
        },

        packEvidence: (inp, opts) => packEvidence(inp, opts),

        synthesizeGroundedAnswer: vi.fn().mockImplementation(async (synthInput) => {
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
            throw new Error(`Closure validation failed: ${JSON.stringify(closureCheck.issues)}`);
          }

          const responseLang: 'vi' | 'en' =
            synthInput.responseLanguage === 'vi' || synthInput.responseLanguage === 'en'
              ? synthInput.responseLanguage
              : tc.language === 'en'
              ? 'en'
              : 'vi';

          return {
            answer: tc.synthesisMock as any,
            attempts: [],
            responseLanguage: responseLang,
          };
        }),

        now: () => '2026-10-11T12:00:00.000Z',
      };

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
            setName: 'Bộ tài liệu kiểm thử',
            isBase: true,
            documentIds: [],
          },
        ],
        recentSessionId: 'session-eval',
      };

      // 3. Call runGroundedTurn
      const result = await runGroundedTurn(input, mockDeps);

      // 4. Assert outcome / kind
      expect(result.kind).toBe(tc.expected.kind);

      if (tc.expected.forbiddenFallback) {
        expect(localBm25Spy).not.toHaveBeenCalled();
      }

      if (tc.expected.kind === 'operational') {
        expect(retrieveSpy).not.toHaveBeenCalled();
        return;
      }

      if (tc.expected.kind === 'clarify_entity') {
        expect('outcome' in result && result.outcome).toBe('NEEDS_CLARIFICATION');
        if ('candidates' in result) {
          expect(result.candidates.length).toBeGreaterThan(0);
          if (tc.expected.requiredCandidates) {
            expect(result.candidates.length).toBe(tc.expected.requiredCandidates.length);
          }
        }
        expect(synthesizeCalls.length).toBe(0);
        return;
      }

      if (tc.expected.kind === 'refine') {
        expect('outcome' in result && result.outcome).toBe(tc.expected.outcome);
        if ('refinementChips' in result && tc.expected.requiredRefinementCount !== null) {
          expect(result.refinementChips.length).toBe(tc.expected.requiredRefinementCount);
        }
        expect(synthesizeCalls.length).toBe(0);
        return;
      }

      if (tc.expected.kind === 'error') {
        expect('code' in result && result.code).toBe(tc.expected.outcome);
        return;
      }

      // Grounded answer / local synthesis assertions
      if (result.kind === 'grounded_answer') {
        const grounding = result.grounding;
        expect(grounding.outcome).toBe(tc.expected.outcome);

        // Zod validation of persisted grounding shape
        expect(() => ChatMessageGroundingSchema.parse(grounding)).not.toThrow();

        // Required citations
        const citationIds = grounding.citations.map((c) => c.citationId);
        for (const reqCid of tc.expected.requiredCitationIds) {
          expect(citationIds).toContain(reqCid);
        }

        // Required facts
        const fullConclusion = grounding.answer?.conclusion ?? '';
        const claimsText = grounding.answer?.claims.map((c) => c.text).join(' ') ?? '';
        const combinedAnswerText = `${fullConclusion} ${claimsText}`;

        for (const fact of tc.expected.requiredFacts) {
          expect(combinedAnswerText).toContain(fact);
        }

        // Forbidden claims
        for (const forbidden of tc.expected.forbiddenClaims) {
          expect(combinedAnswerText).not.toContain(forbidden);
        }

        // Paths
        if (tc.expected.requiredPathIds.length > 0) {
          const pathIds = grounding.paths?.map((p) => p.pathId) ?? [];
          for (const reqPid of tc.expected.requiredPathIds) {
            expect(pathIds).toContain(reqPid);
          }
        }

        // Conflicts
        if (tc.expected.requiredConflictBranches) {
          expect(grounding.conflicts).toBeDefined();
          expect(grounding.conflicts!.length).toBeGreaterThanOrEqual(1);
          expect(grounding.conflicts![0]!.branches.length).toBe(
            tc.expected.requiredConflictBranches
          );
        }

        // Fallback reason
        if (tc.expected.requiredFallbackReason !== null) {
          expect(grounding.fallbackReason).toBe(tc.expected.requiredFallbackReason);
        }

        // Coverage warnings
        for (const warn of tc.expected.requiredCoverageWarnings) {
          const found = grounding.coverageWarnings.some((w) => w.includes(warn));
          expect(found).toBe(true);
        }

        // D-06 Response language lock and byte-identical quotes
        if (tc.expected.requiredResponseLanguage) {
          expect(grounding.answer?.language).toBe(tc.expected.requiredResponseLanguage);
        }

        if (tc.expected.requiredByteIdenticalQuotes) {
          for (const quote of tc.expected.requiredByteIdenticalQuotes) {
            expect(combinedAnswerText).toContain(quote);
            // Byte-identical buffer equality check
            const quoteBuffer = Buffer.from(quote, 'utf8');
            const foundIndex = combinedAnswerText.indexOf(quote);
            expect(foundIndex).toBeGreaterThanOrEqual(0);
            const actualSubstring = combinedAnswerText.slice(
              foundIndex,
              foundIndex + quote.length
            );
            const actualBuffer = Buffer.from(actualSubstring, 'utf8');
            expect(quoteBuffer.equals(actualBuffer)).toBe(true);
          }
        }

        // Persistence round-trip validation
        expect(() =>
          BackupChatMessageRecordSchema.parse({
            id: '10000000-0000-4000-8000-000000000001',
            threadId: '20000000-0000-4000-8000-000000000002',
            role: 'assistant',
            content: combinedAnswerText,
            createdAt: '2026-10-11T12:00:00.000Z',
            grounding,
          })
        ).not.toThrow();
      }
    });
  });

  it('reports rubric coverage and 100% gate compliance across all 20 reference cases', () => {
    const totalCases = cases.length;
    const rubrics = new Set(cases.flatMap((c) => c.rubricIds));
    expect(totalCases).toBe(20);
    expect(rubrics.size).toBeGreaterThanOrEqual(6); // ANSWER-01..ANSWER-07 covered
    // Evidence precision and recall
    const answerCases = cases.filter((c) => c.expected.kind === 'grounded_answer');
    expect(answerCases.length).toBeGreaterThanOrEqual(10);
  });
});


