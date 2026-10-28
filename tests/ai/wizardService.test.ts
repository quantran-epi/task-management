import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const fixture = JSON.parse(
  fs.readFileSync(path.resolve('tests/fixtures/ai/wizard-reference.json'), 'utf8')
) as {
  fixtureVersion: string;
  schemaVersion: number;
  promptVersion: string;
  builderVersion: string;
  requirements: string[];
  cases: Array<Record<string, unknown> & {
    id: string;
    roadmapIds: string[];
    evidence: Array<{ hash: string; range: { start: number; end: number } }>;
    expected: Record<string, unknown>;
    forbiddenClaims: string[];
  }>;
};

const REQUIRED_IDS = [
  'WIZ-UI-01',
  'WIZ-INTERACTIVE-01',
  'WIZ-DOCX-01',
  'WIZ-FLOW-01',
  'WIZ-LOOP-01',
  'WIZ-PACK-01',
];

describe('Phase 25 wizard reference contract', () => {
  it('pins versions and exactly contiguous F01-F16 IDs', () => {
    expect(fixture).toMatchObject({
      fixtureVersion: '25.04.1',
      schemaVersion: 1,
      promptVersion: 'wizard-v1',
      builderVersion: 'wizard-docx-v1',
    });
    expect(fixture.cases.map(({ id }) => id)).toEqual(
      Array.from({ length: 16 }, (_, index) => `F${String(index + 1).padStart(2, '0')}`)
    );
  });

  it('maps all six roadmap requirements and full expected contracts', () => {
    expect([...fixture.requirements].sort()).toEqual([...REQUIRED_IDS].sort());
    const mapped = new Set(fixture.cases.flatMap(({ roadmapIds }) => roadmapIds));
    REQUIRED_IDS.forEach((id) => expect(mapped.has(id)).toBe(true));

    for (const testCase of fixture.cases) {
      for (const key of [
        'initialRecords',
        'inputs',
        'evidence',
        'mockedResponses',
        'expected',
        'forbiddenClaims',
      ]) {
        expect(testCase).toHaveProperty(key);
      }
      expect(testCase.expected).toEqual(
        expect.objectContaining({ gaps: expect.any(Array), unknowns: expect.any(Array), drift: expect.any(Array), calls: expect.any(Object), status: expect.any(String), effects: expect.any(Array) })
      );
      expect(testCase.forbiddenClaims.length).toBeGreaterThan(0);
    }
  });

  it('pins valid evidence ranges and SHA-256 labels without production data', () => {
    for (const testCase of fixture.cases) {
      for (const evidence of testCase.evidence) {
        expect(evidence.range.start).toBeGreaterThan(0);
        expect(evidence.range.end).toBeGreaterThanOrEqual(evidence.range.start);
        expect(evidence.hash).toMatch(/^[a-f0-9]{64}$/);
      }
    }
    expect(JSON.stringify(fixture)).not.toContain('local-dev-knowledge-token');
    expect(JSON.stringify(fixture)).not.toContain('60000006');
  });
});

describe('wizard service behavior producer contracts', () => {
  it.todo('F01-F02 asks only unresolved gaps and keeps skip as unknown');
  it.todo('F03-F04 versions current project artifacts and rejects stale cross-project effects');
  it.todo('F07 and F12 bound attempts, tools, repairs, and reject incomplete strict outputs');
  it.todo('F11 treats source and MCP instructions as untrusted data');
  it.todo('F14 preserves scoped local retrieval and approved export when optional services fail');
});
