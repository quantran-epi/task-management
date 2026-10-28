import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const cases = (JSON.parse(
  fs.readFileSync(path.resolve('tests/fixtures/ai/wizard-reference.json'), 'utf8')
) as { cases: Array<{ id: string; expected: { drift: string[]; status: string; effects: string[] }; forbiddenClaims: string[] }> }).cases;

describe('reconciliation reference labels', () => {
  it('pins exact F06 outside-solution, missing, and different tuples', () => {
    const f06 = cases.find(({ id }) => id === 'F06');
    expect(f06?.expected.drift).toEqual([
      'REQ-OUT|outside-solution|src/extra.ts:3-7',
      'REQ-MISS|missing|solution',
      'REQ-DIFF|different|db/alter.sql:1-3',
    ]);
    expect(f06?.expected.status).toBe('DRIFT_DETECTED');
    expect(f06?.forbiddenClaims).toContain('Rollback đã kiểm chứng');
  });

  it('allows clean drift only after complete coverage and preserves CAB caveats', () => {
    const f05 = cases.find(({ id }) => id === 'F05');
    const f07 = cases.find(({ id }) => id === 'F07');
    const f09 = cases.find(({ id }) => id === 'F09');
    expect(f05?.expected.status).toBe('NO_DRIFT_COMPLETE');
    expect(f07?.expected.status).toBe('PARTIAL_COVERAGE');
    expect(f07?.forbiddenClaims).toContain('Không có drift');
    expect(f09?.expected.effects).toContain('retain-caveats');
    expect(f09?.forbiddenClaims).toContain('CAB đã phê duyệt');
  });
});

describe('reconciliation behavior producer contracts', () => {
  it.todo('emits four sections and complete coverage before no-drift');
  it.todo('matches normalized requirement/category/file-hunk tuples exactly');
  it.todo('rejects wrong project, stale solution, wrong CR, and mixed artifact revisions');
  it.todo('retains unresolved drift, missing tests, and unverified rollback in CAB input');
});
