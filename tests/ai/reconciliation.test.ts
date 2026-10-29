import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  canClaimNoDrift,
  CoverageLedgerSchema,
  DriftTupleSchema,
  ReconciliationResultSchema,
  reconcileSolutionWithPack,
} from '../../src/services/wizard/reconciliation';

const cases = (JSON.parse(
  fs.readFileSync(path.resolve('tests/fixtures/ai/wizard-reference.json'), 'utf8'),
) as {
  cases: Array<{
    id: string;
    expected: { drift: string[]; status: string; effects: string[] };
    forbiddenClaims: string[];
  }>;
}).cases;

const ids = {
  projectId: '25000000-0000-4000-8000-000000000006',
  threadId: '25000000-0000-4000-8000-000000000106',
  solutionNoteId: '25000000-0000-4000-8000-000000002006',
  solutionVersion: 4,
  solutionHash: '0404040404040404040404040404040404040404040404040404040404040404',
  packHash: '0606060606060606060606060606060606060606060606060606060606060606',
  cr: 'CR-25006',
  base: 'base-006',
  head: 'head-006',
};

const baseInput = {
  ...ids,
  solution: {
    projectId: ids.projectId,
    threadId: ids.threadId,
    noteId: ids.solutionNoteId,
    version: ids.solutionVersion,
    hash: ids.solutionHash,
    requirements: [
      { id: 'REQ-KEEP', category: 'implementation', summary: 'Keep approved rule', evidencePaths: ['src/feature.ts'] },
      { id: 'REQ-MISS', category: 'implementation', summary: 'Add missing rule', evidencePaths: ['src/missing.ts'] },
      { id: 'REQ-DIFF', category: 'database', summary: 'Use approved schema', evidencePaths: ['db/alter.sql'] },
    ],
    approvedDesign: {
      currentSystem: 'Existing service',
      affectedScreens: ['Limits'],
      affectedApis: ['/limits'],
      affectedTables: ['SYN_LIMIT'],
      regressionMatrix: [{ scenario: 'limit', expected: 'enforced' }],
    },
  },
  pack: {
    packHash: ids.packHash,
    identity: { cr: ids.cr, base: ids.base, head: ids.head, branch: 'feature/CR-25006' },
    entries: [
      {
        path: 'diff.patch',
        status: 'included',
        coverage: 'included',
        hunks: [
          { id: 'h-out', path: 'src/extra.ts', startLine: 3, endLine: 7, text: 'adds endpoint' },
          { id: 'h-diff', path: 'db/alter.sql', startLine: 1, endLine: 3, text: 'alter table' },
        ],
      },
      {
        path: 'new-files/src/feature.ts',
        status: 'included',
        coverage: 'included',
        hunks: [{ id: 'h-keep', path: 'src/feature.ts', startLine: 10, endLine: 20, text: 'approved rule' }],
      },
      {
        path: 'sql/alter.sql',
        status: 'included',
        coverage: 'included',
        hunks: [{ id: 'h-diff', path: 'db/alter.sql', startLine: 1, endLine: 3, text: 'alter table' }],
      },
    ],
  },
  evidence: [
    { id: 'h-out', path: 'src/extra.ts', startLine: 3, endLine: 7, text: 'adds endpoint' },
    { id: 'h-keep', path: 'src/feature.ts', startLine: 10, endLine: 20, text: 'approved rule' },
    { id: 'h-diff', path: 'db/alter.sql', startLine: 1, endLine: 3, text: 'alter table' },
  ],
  proposedDrift: [
    { requirementId: 'REQ-OUT', category: 'outside_solution', evidenceId: 'h-out' },
    { requirementId: 'REQ-MISS', category: 'missing', evidenceId: null },
    { requirementId: 'REQ-DIFF', category: 'different', evidenceId: 'h-diff' },
  ],
};

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

describe('reconciliation schemas', () => {
  it('requires the four PL03 sections and explicit coverage states', () => {
    expect(CoverageLedgerSchema.parse({ path: 'src/a.ts', state: 'included', evidenceIds: ['h-1'] })).toEqual({ path: 'src/a.ts', state: 'included', evidenceIds: ['h-1'] });
    expect(DriftTupleSchema.parse({ requirementId: 'REQ-1', category: 'missing', evidence: null, baselineRequirement: 'missing rule' })).toMatchObject({ category: 'missing' });
  });
});

describe('reconcileSolutionWithPack', () => {
  it('returns exact drift tuples and evidence-bounded four-section output', () => {
    const result = reconcileSolutionWithPack(baseInput);
    expect(result.status).toBe('DRIFT_DETECTED');
    expect(result.approvedDesign).toMatchObject({ currentSystem: 'Existing service' });
    expect(result.actualImplementation).toMatchObject({ affectedFiles: ['db/alter.sql', 'src/extra.ts', 'src/feature.ts'] });
    expect(result.drift.map((tuple) => `${tuple.requirementId}|${tuple.category}|${tuple.evidence?.path ?? 'solution'}`)).toEqual([
      'REQ-OUT|outside_solution|src/extra.ts',
      'REQ-MISS|missing|solution',
      'REQ-DIFF|different|db/alter.sql',
    ]);
    expect(result.dbChangesRollback).toMatchObject({ affectedTables: ['SYN_LIMIT'], rollback: { status: 'unknown' } });
    expect(result.regressionMatrix).toEqual([{ scenario: 'limit', expected: 'enforced' }]);
    expect(ReconciliationResultSchema.parse(result)).toEqual(result);
  });

  it('claims no drift only with complete included coverage and no tuples', () => {
    const clean = reconcileSolutionWithPack({
      ...baseInput,
      proposedDrift: [],
      pack: { ...baseInput.pack, entries: baseInput.pack.entries.map((entry) => ({ ...entry, status: 'included', coverage: 'included' })) },
    });
    expect(clean.status).toBe('NO_DRIFT_COMPLETE');
    expect(canClaimNoDrift(clean)).toBe(true);
    expect(canClaimNoDrift({ ...clean, coverage: [{ path: 'x', state: 'deferred', evidenceIds: [] }] })).toBe(false);
  });

  it('marks binary, unreadable, and deferred entries partial', () => {
    const result = reconcileSolutionWithPack({
      ...baseInput,
      proposedDrift: [],
      pack: { ...baseInput.pack, entries: [{ path: 'assets/logo.bin', status: 'binary', coverage: 'binary', hunks: [] }, { path: 'src/deferred.ts', status: 'deferred', coverage: 'deferred', hunks: [] }] },
    });
    expect(result.status).toBe('PARTIAL_COVERAGE');
    expect(canClaimNoDrift(result)).toBe(false);
    expect(result.coverage.map((entry) => entry.state)).toEqual(['binary', 'deferred']);
  });

  it.each([
    ['projectId', 'WRONG_PROJECT'],
    ['solutionVersion', 'STALE_SOLUTION'],
    ['packHash', 'PACK_HASH_MISMATCH'],
    ['cr', 'CR_MISMATCH'],
    ['base', 'BASE_MISMATCH'],
    ['head', 'HEAD_MISMATCH'],
  ])('rejects %s mismatch before producing result', (field, code) => {
    const input = JSON.parse(JSON.stringify(baseInput)) as typeof baseInput;
    if (field === 'solutionVersion') input.solution.version = 99;
    else if (field === 'projectId') input.projectId = '25000000-0000-4000-8000-000000000099';
    else if (field === 'packHash') input.pack.packHash = '9999999999999999999999999999999999999999999999999999999999999999';
    else input.pack.identity[field as 'cr' | 'base' | 'head'] = 'wrong';
    expect(() => reconcileSolutionWithPack(input)).toThrow(code);
  });
});

describe('reconciliation behavior acceptance', () => {
  it('emits all four PL03 sections and gates no-drift on complete coverage', () => {
    const result = reconcileSolutionWithPack({ ...baseInput, proposedDrift: [] });
    expect(result).toEqual(expect.objectContaining({
      approvedDesign: expect.any(Object),
      actualImplementation: expect.any(Object),
      drift: expect.any(Array),
      dbChangesRollback: expect.any(Object),
    }));
    expect(result.status).toBe('NO_DRIFT_COMPLETE');
    expect(canClaimNoDrift(result)).toBe(true);
  });

  it('matches normalized requirement/category/file-hunk tuples exactly', () => {
    const result = reconcileSolutionWithPack(baseInput);
    expect(result.drift.map((tuple) => [
      tuple.requirementId,
      tuple.category,
      tuple.evidence?.path ?? 'solution',
      tuple.evidence ? `${tuple.evidence.startLine}-${tuple.evidence.endLine}` : null,
    ])).toEqual([
      ['REQ-OUT', 'outside_solution', 'src/extra.ts', '3-7'],
      ['REQ-MISS', 'missing', 'solution', null],
      ['REQ-DIFF', 'different', 'db/alter.sql', '1-3'],
    ]);
  });

  it('rejects wrong project, stale solution, wrong CR, and mixed artifact revisions', () => {
    for (const [field, code] of [
      ['projectId', 'WRONG_PROJECT'],
      ['solutionVersion', 'STALE_SOLUTION'],
      ['packHash', 'PACK_HASH_MISMATCH'],
      ['cr', 'CR_MISMATCH'],
      ['base', 'BASE_MISMATCH'],
      ['head', 'HEAD_MISMATCH'],
    ] as const) {
      const input = JSON.parse(JSON.stringify(baseInput)) as typeof baseInput;
      if (field === 'solutionVersion') input.solution.version = 99;
      else if (field === 'projectId') input.projectId = '25000000-0000-4000-8000-000000000099';
      else if (field === 'packHash') input.pack.packHash = '9'.repeat(64);
      else input.pack.identity[field] = 'wrong';
      expect(() => reconcileSolutionWithPack(input)).toThrow(code);
    }
  });

  it('retains unresolved drift, missing tests, and unverified rollback in CAB input', () => {
    const result = reconcileSolutionWithPack({ ...baseInput, proposedDrift: [{ requirementId: 'REQ-MISS', category: 'missing', evidenceId: null }] });
    expect(result.drift).toEqual([expect.objectContaining({ requirementId: 'REQ-MISS', category: 'missing' })]);
    expect(result.dbChangesRollback.rollback).toMatchObject({ status: 'unknown' });
    expect(canClaimNoDrift(result)).toBe(false);
  });
});
