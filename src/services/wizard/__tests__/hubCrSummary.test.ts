import { describe, expect, it } from 'vitest';
import {
  HubCrSummarySchema,
  buildHubCrSummary,
  renderHubCrSummaryMarkdown,
} from '../hubCrSummary';
import {
  SdlcWorkflowStateSchema,
  type SdlcWorkflowState,
} from '../workflowSchemas';
import type { ReconciliationResult } from '../reconciliation';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const THREAD_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const NOTE_ID = '55555555-5555-4555-8555-555555555555';
const NOW = '2026-11-01T12:00:00.000Z';
const HASH = 'ab'.repeat(32);

const PL03B_CONTENT = [
  '# PL03B',
  '## Thực tế triển khai',
  '- Thêm API /transfer',
  '- Thêm bảng TRANSFER',
  '## Ghi chú',
  '- Không phải bằng chứng triển khai',
].join('\n');

const SOLUTION_CONTENT = [
  '# SOLUTION',
  '## Phạm vi',
  '- Luồng chuyển tiền nhanh 24/7',
  '## Quyết định',
  '- Dùng hàng đợi nội bộ thay vì gọi đồng bộ',
].join('\n');

const driftResult = (rollbackStatus: 'verified' | 'unknown', evidenceIds: string[]): ReconciliationResult => ({
  schemaVersion: 1,
  identity: {
    projectId: PROJECT_ID, threadId: THREAD_ID, solutionNoteId: NOTE_ID,
    solutionVersion: 1, solutionHash: HASH, packHash: HASH,
    cr: 'CR-25006', base: 'base-1', head: 'head-2',
  },
  status: rollbackStatus === 'verified' ? 'NO_DRIFT_COMPLETE' : 'PARTIAL_COVERAGE',
  approvedDesign: { currentSystem: 'Core', affectedScreens: [], affectedApis: [], affectedTables: [] },
  actualImplementation: { affectedFiles: ['src/transfer.ts'], affectedScreens: [], affectedApis: [], affectedTables: ['TRANSFER'] },
  drift: [],
  dbChangesRollback: { affectedTables: ['TRANSFER'], changes: [], rollback: { status: rollbackStatus, evidenceIds } },
  regressionMatrix: [],
  coverage: [{ path: 'src/transfer.ts', state: 'included', evidenceIds: [] }],
});

function state(overrides: {
  withCab?: boolean;
  withChangePack?: boolean;
  withDrift?: boolean;
  withPl03b?: boolean;
  withSolution?: boolean;
  rollbackStatus?: 'verified' | 'unknown';
  rollbackEvidence?: string[];
} = {}): SdlcWorkflowState {
  const ref = (kind: string, title: string, version = 1) => ({
    kind, version, hash: HASH, title, sourceHashes: [], updatedAt: NOW,
  });
  return SdlcWorkflowStateSchema.parse({
    schemaVersion: 1,
    sessionId: SESSION_ID,
    projectId: PROJECT_ID,
    threadId: THREAD_ID,
    currentStep: 'CAB',
    metadata: { cr: 'CR-25006', featureName: 'Chuyển tiền nhanh', author: 'Dev Lead', requestingUnit: 'Digital Banking', date: '2026-11-01' },
    artifacts: {
      ...(overrides.withSolution === false ? {} : { solution: { ...ref('SOLUTION', 'SOLUTION.md'), noteId: NOTE_ID, content: SOLUTION_CONTENT } }),
      ...(overrides.withPl03b === false ? {} : { pl03b: { ...ref('PL03B', 'PL03B v1'), noteId: NOTE_ID, content: PL03B_CONTENT } }),
      ...(overrides.withChangePack === false ? {} : { changePack: ref('CHANGE_PACK', 'Change Pack') }),
      ...(overrides.withDrift === false ? {} : { driftResult: driftResult(overrides.rollbackStatus ?? 'unknown', overrides.rollbackEvidence ?? []) }),
      ...(overrides.withCab ? { cab: { ...ref('CAB', 'CAB v1'), noteId: NOTE_ID } } : {}),
    },
    createdAt: NOW,
    updatedAt: NOW,
  });
}

describe('HubCrSummarySchema', () => {
  it('rejects a summary missing any required section', () => {
    const complete = buildHubCrSummary({ state: state() });
    for (const key of ['scope', 'actualChanges', 'keyDecisions', 'risksRollback', 'openGaps', 'evidenceLinks'] as const) {
      const { [key]: _removed, ...rest } = complete;
      expect(HubCrSummarySchema.safeParse(rest).success).toBe(false);
    }
  });

  it('rejects unknown keys inside the nested risk/rollback block', () => {
    const complete = buildHubCrSummary({ state: state() });
    const result = HubCrSummarySchema.safeParse({ ...complete, risksRollback: { ...complete.risksRollback, bogus: 1 } });
    expect(result.success).toBe(false);
  });
});

describe('buildHubCrSummary', () => {
  it('states missing evidence explicitly instead of returning an empty gap list', () => {
    const summary = buildHubCrSummary({ state: state({ withCab: false, withChangePack: false, withDrift: false, withPl03b: false }) });

    expect(summary.openGaps.length).toBeGreaterThan(0);
    expect(summary.openGaps.join(' ')).toMatch(/Thiếu bằng chứng/);
    expect(summary.openGaps.join(' ')).toMatch(/Change Pack/);
  });

  it('maps evidence links from the artifact refs actually present', () => {
    const summary = buildHubCrSummary({ state: state({ withCab: true }) });

    expect(summary.evidenceLinks).toContainEqual({ kind: 'PL03B', version: 1, hash: HASH });
    expect(summary.evidenceLinks).toContainEqual({ kind: 'CAB', version: 1, hash: HASH });
    expect(summary.evidenceLinks.some((link) => link.kind === 'PL07')).toBe(false);
  });

  it('reads actual changes from PL03B implementation bullets only, never from SOLUTION', () => {
    const summary = buildHubCrSummary({ state: state() });

    expect(summary.actualChanges).toEqual(['Thêm API /transfer', 'Thêm bảng TRANSFER']);
    expect(summary.actualChanges.join(' ')).not.toMatch(/hàng đợi nội bộ/);
  });

  it('marks rollback unverified when status is verified but no evidence ids exist', () => {
    const summary = buildHubCrSummary({ state: state({ rollbackStatus: 'verified', rollbackEvidence: [] }) });

    expect(summary.risksRollback.rollbackVerified).toBe(false);
    expect(summary.openGaps.join(' ')).toMatch(/rollback chưa được kiểm chứng/i);
  });

  it('sets rollbackVerified only with status verified AND non-empty evidence ids', () => {
    const summary = buildHubCrSummary({ state: state({ rollbackStatus: 'verified', rollbackEvidence: ['ev-1'] }) });

    expect(summary.risksRollback.rollbackVerified).toBe(true);
  });

  it('contains no GoLive, addressee, or approval-request wording', () => {
    const summary = buildHubCrSummary({ state: state({ withCab: true }) });
    const prose = renderHubCrSummaryMarkdown(summary);

    expect(prose).not.toMatch(/GoLive|go-live|Kính gửi|Đề nghị phê duyệt|phê duyệt đề xuất/i);
  });
});

describe('renderHubCrSummaryMarkdown', () => {
  it('includes every open gap and renders Chưa kiểm chứng for an unverified rollback', () => {
    const summary = buildHubCrSummary({ state: state() });
    const prose = renderHubCrSummaryMarkdown(summary);

    for (const gap of summary.openGaps) expect(prose).toContain(gap);
    expect(prose).toContain('Chưa kiểm chứng');
  });
});

describe('SdlcWorkflowStateSchema artifacts.crSummary', () => {
  it('accepts a saved summary snapshot and rejects an unknown key inside it', () => {
    const base = state();
    const withSummary = SdlcWorkflowStateSchema.parse({
      ...base,
      artifacts: { ...base.artifacts, crSummary: { markdown: '# Tóm tắt', updatedAt: NOW } },
    });
    expect(withSummary.artifacts.crSummary?.markdown).toBe('# Tóm tắt');

    const rejected = SdlcWorkflowStateSchema.safeParse({
      ...base,
      artifacts: { ...base.artifacts, crSummary: { markdown: '# Tóm tắt', updatedAt: NOW, extra: true } },
    });
    expect(rejected.success).toBe(false);
  });
});
