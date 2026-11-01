import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { Packer } from 'docx';
import { buildPl03bDocument, type Pl03bDocxPayload } from '../../src/services/export/pl03bDocx';
import { buildWizardDocx } from '../../src/services/export/wizardDocx';

/**
 * D-14 regression guard: PL03B documents only what was actually implemented. The
 * SOLUTION-vs-implementation comparison (approved design + drift matrix) stays inside
 * TaskMate's DriftMatrixView and must never reach the exported document.
 */
const payload: Pl03bDocxPayload = {
  schemaVersion: 1,
  kind: 'PL03B',
  status: 'approved',
  inputRevision: 2,
  draftRevision: 2,
  approvedRevision: 2,
  metadata: {
    crCode: 'CR-D14-01',
    featureName: 'Đối soát chuyển tiền',
    author: 'Dev Lead',
    createdDate: '2026-11-01',
    version: '2',
  },
  introduction: { purpose: 'Triển khai đối soát.', users: '(chưa cung cấp)', databases: ['TRANSFER'], k8sServices: [] },
  technical: {
    overview: 'Đã triển khai API /transfer.',
    techStack: 'TypeScript',
    flows: [],
    services: [],
    databases: [],
    integrations: [],
    notifications: [],
  },
  reconciliationEvidence: {
    actualImplementation: {
      affectedFiles: ['src/transfer.ts'],
      affectedScreens: ['Màn hình chuyển tiền'],
      affectedApis: ['POST /transfer'],
      affectedTables: ['TRANSFER'],
    },
    coverage: [
      { path: 'src/transfer.ts', hunkId: 'h1', state: 'included', evidenceIds: ['ev-1'] },
      { path: 'assets/logo.bin', state: 'binary', evidenceIds: [] },
    ],
    dbChangesRollback: {
      affectedTables: ['TRANSFER'],
      changes: [{ path: 'sql/transfer.sql', evidenceIds: ['ev-sql'] }],
      rollback: { status: 'unknown', evidenceIds: [] },
    },
    regressionMatrix: [{ scenario: 'Chuyển 10k', expected: 'Thành công' }],
  },
};

async function documentText(): Promise<string> {
  const blob = await Packer.toBlob(buildPl03bDocument(payload));
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const xml = await zip.file('word/document.xml')!.async('string');
  return xml.replace(/<w:tab\/?\s*>/g, '\t').replace(/<w:br\/?\s*>/g, '\n').replace(/<[^>]+>/g, '');
}

describe('buildPl03bDocument (D-14)', () => {
  it('never carries the approved design, the drift matrix, or a reconciliation-status line', async () => {
    const text = await documentText();

    expect(text).not.toContain('THIẾT KẾ NHƯ ĐÃ DUYỆT');
    expect(text).not.toContain('BẢNG DRIFT');
    expect(text).not.toContain('Trạng thái đối soát');
    expect(text).not.toContain('Không có drift');
    expect(text).not.toContain('PARTIAL_COVERAGE');
    expect(text).not.toContain('NO_DRIFT_COMPLETE');
    expect(text).not.toContain('DRIFT_DETECTED');
  });

  it('renders the implemented file/screen/API/table lists, coverage table, DB rollback, and regression matrix', async () => {
    const text = await documentText();

    expect(text).toContain('THỰC TẾ TRIỂN KHAI');
    expect(text).toContain('File thay đổi: src/transfer.ts');
    expect(text).toContain('Màn hình thực tế: Màn hình chuyển tiền');
    expect(text).toContain('API thực tế: POST /transfer');
    expect(text).toContain('Bảng thực tế: TRANSFER');
    expect(text).toContain('binary');
    expect(text).toContain('THAY ĐỔI DB VÀ ROLLBACK');
    expect(text).toContain('Rollback: unknown');
    expect(text).toContain('MA TRẬN REGRESSION TEST');
    expect(text).toContain('Chuyển 10k');
  });

  it('is accepted by the real DOCX dispatcher with the narrowed payload shape', async () => {
    const blob = await buildWizardDocx('PL03B', payload);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('rejects a payload that still carries the removed reconciliation member', async () => {
    const legacy = { ...payload, reconciliation: { status: 'PARTIAL_COVERAGE' } };
    await expect(buildWizardDocx('PL03B', legacy)).rejects.toThrow('WIZARD_DOCX_PAYLOAD_INVALID');
  });
});
