import { describe, expect, it } from 'vitest';
import { INTENT_TAXONOMY } from '../../src/services/ai/intentRouter';
import { GOLDEN_EVAL_CASES } from './fixtures/intentGoldenFixtures';
import { SYNTHESIS_FIXTURES } from './fixtures/groundedSynthesisFixtures';

describe('Eval Harness: 20 Golden Test Cases (E-01..E-20)', () => {
  it('contains exactly 20 cases with sequential IDs from E-01 to E-20', () => {
    expect(GOLDEN_EVAL_CASES).toHaveLength(20);
    const ids = GOLDEN_EVAL_CASES.map((c) => c.id);
    for (let i = 1; i <= 20; i++) {
      const expectedId = `E-${i.toString().padStart(2, '0')}`;
      expect(ids).toContain(expectedId);
    }
  });

  it('ensures all expected intents belong to INTENT_TAXONOMY', () => {
    for (const testCase of GOLDEN_EVAL_CASES) {
      expect(INTENT_TAXONOMY).toContain(testCase.expectedIntent);
    }
  });

  it('validates language tagging is either vi or en with non-empty criteria', () => {
    for (const testCase of GOLDEN_EVAL_CASES) {
      expect(['vi', 'en']).toContain(testCase.language);
      expect(testCase.query.trim().length).toBeGreaterThan(0);
      expect(testCase.expectedModality.trim().length).toBeGreaterThan(0);
      expect(testCase.passCriteria.trim().length).toBeGreaterThan(0);
    }
  });

  it('verifies technical identifier routing cases (E-01, E-16) map to query_knowledge without speculation', () => {
    const e01 = GOLDEN_EVAL_CASES.find((c) => c.id === 'E-01');
    const e16 = GOLDEN_EVAL_CASES.find((c) => c.id === 'E-16');

    expect(e01?.expectedIntent).toBe('query_knowledge');
    expect(e01?.speculationRequested).toBe(false);

    expect(e16?.expectedIntent).toBe('query_knowledge');
    expect(e16?.speculationRequested).toBe(false);
  });

  it('verifies clarification cases (E-13, E-14) map to clarify intent', () => {
    const e13 = GOLDEN_EVAL_CASES.find((c) => c.id === 'E-13');
    const e14 = GOLDEN_EVAL_CASES.find((c) => c.id === 'E-14');

    expect(e13?.expectedIntent).toBe('clarify');
    expect(e14?.expectedIntent).toBe('clarify');
  });

  it('verifies explicit speculation query (E-07) flags speculation_requested as true', () => {
    const e07 = GOLDEN_EVAL_CASES.find((c) => c.id === 'E-07');
    expect(e07?.expectedIntent).toBe('query_knowledge');
    expect(e07?.speculationRequested).toBe(true);
  });

  it('verifies query_taskmate read status cases (E-08, E-09)', () => {
    const e08 = GOLDEN_EVAL_CASES.find((c) => c.id === 'E-08');
    const e09 = GOLDEN_EVAL_CASES.find((c) => c.id === 'E-09');

    expect(e08?.expectedIntent).toBe('query_taskmate');
    expect(e09?.expectedIntent).toBe('query_taskmate');
  });

  it('verifies operate_taskmate mutation cases (E-10, E-11, E-18)', () => {
    const e10 = GOLDEN_EVAL_CASES.find((c) => c.id === 'E-10');
    const e11 = GOLDEN_EVAL_CASES.find((c) => c.id === 'E-11');
    const e18 = GOLDEN_EVAL_CASES.find((c) => c.id === 'E-18');

    expect(e10?.expectedIntent).toBe('operate_taskmate');
    expect(e11?.expectedIntent).toBe('operate_taskmate');
    expect(e18?.expectedIntent).toBe('operate_taskmate');
  });
});

describe('Eval Harness: Synthesis Test Double Fixtures', () => {
  it('validates direct cited fixture schema and closure', () => {
    const fixture = SYNTHESIS_FIXTURES.directCited;
    expect(fixture.answerV2.schemaVersion).toBe(2);
    expect(fixture.answerV2.confidence).toBe('high');
    expect(fixture.answerV2.hypotheses).toHaveLength(0);
    expect(fixture.answerV2.claims[0]!.classification).toBe('DIRECT');
    expect(fixture.answerV2.claims[0]!.pathId).toBeNull();
    const citationId = fixture.answerV2.claims[0]!.citationIds[0]!;
    expect(fixture.evidencePack.citations[citationId as keyof typeof fixture.evidencePack.citations]).toBeDefined();
  });

  it('validates inferred graph path fixture closure', () => {
    const fixture = SYNTHESIS_FIXTURES.multiHopInferred;
    expect(fixture.answerV2.schemaVersion).toBe(2);
    expect(fixture.answerV2.confidence).toBe('medium');
    expect(fixture.answerV2.claims[0]!.classification).toBe('INFERRED');
    expect(fixture.answerV2.claims[0]!.pathId).toBe('P1');
    expect(fixture.evidencePack.paths.P1).toBeDefined();
  });

  it('validates zero-evidence abstention contract', () => {
    const fixture = SYNTHESIS_FIXTURES.zeroEvidenceAbstention;
    expect(fixture.answerV2.schemaVersion).toBe(2);
    expect(fixture.answerV2.confidence).toBe('unknown');
    expect(fixture.answerV2.claims).toHaveLength(0);
    expect(fixture.answerV2.hypotheses).toHaveLength(0);
    expect(fixture.answerV2.unsupportedParts.length).toBeGreaterThan(0);
  });

  it('validates explicit speculation isolation contract', () => {
    const fixture = SYNTHESIS_FIXTURES.explicitSpeculation;
    expect(fixture.answerV2.schemaVersion).toBe(2);
    expect(fixture.answerV2.confidence).toBe('low');
    expect(fixture.answerV2.claims).toHaveLength(0);
    expect(fixture.answerV2.hypotheses.length).toBeGreaterThan(0);
    expect(fixture.answerV2.hypotheses[0]!.justification.length).toBeGreaterThan(0);
  });

  it('preserves legacy v1 test fixture for backward-compatibility', () => {
    const v1 = SYNTHESIS_FIXTURES.legacyV1Answer;
    expect(v1.schemaVersion).toBe(1);
    expect(v1.claims[0]!.citationIds).toContain('S1');
  });
});
