import { describe, it, expect } from 'vitest';
import fixtureData from '../fixtures/ai/grounded-assistant-reference.json';
import {
  GroundedReferenceCaseSchema,
  type GroundedReferenceCase,
} from '../fixtures/ai/grounded-reference-fixture-schema';
import {
  evaluateBenchmarkCase,
  type CaseEvaluationResult,
} from './evaluatorCore';

describe('groundedAssistantEval: 40-case reference fixture replay', () => {
  const cases: GroundedReferenceCase[] = fixtureData.map((c) =>
    GroundedReferenceCaseSchema.parse(c)
  );

  it('contains exactly 40 cases with valid schema', () => {
    expect(cases.length).toBe(40);
  });

  cases.forEach((tc) => {
    it(`evaluates [${tc.id}] (${tc.category}/${tc.language}): ${tc.query.slice(0, 40)}...`, async () => {
      const result: CaseEvaluationResult = await evaluateBenchmarkCase(tc);

      if (!result.passed) {
        console.error(
          `Case [${tc.id}] failed reasons:`,
          result.failureReasons,
          'invariants:',
          result.invariantViolations
        );
      }

      expect(result.invariantViolations).toEqual([]);
      expect(result.failureReasons).toEqual([]);
      expect(result.pathFidelityPassed).toBe(true);
      expect(result.passed).toBe(true);
    });
  });

  it('reports rubric coverage and 100% gate compliance across all 40 reference cases', async () => {
    const totalCases = cases.length;
    const rubrics = new Set(cases.flatMap((c) => c.rubricIds));
    expect(totalCases).toBe(40);
    expect(rubrics.size).toBeGreaterThanOrEqual(6); // ANSWER-01..ANSWER-07 covered

    const answerCases = cases.filter(
      (c) => c.expected.kind === 'grounded_answer'
    );
    expect(answerCases.length).toBeGreaterThanOrEqual(20);
  });
});
