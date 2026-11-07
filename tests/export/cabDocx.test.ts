import { describe, it, expect } from 'vitest';
import { buildCabDocument, type CabDocxPayload } from '../../src/services/export/cabDocx';
import { buildWizardDocx } from '../../src/services/export/wizardDocx';

/**
 * Wave 0 contract for plan 31.2-11 Task 2 (ENT-NORM-05, D-50).
 *
 * The CAB export payload is re-axed from `projectId` to `changeRequestId`, and the builder
 * must reject a source ref whose id does not match the payload with the source-invalid code
 * (not a generic payload-schema failure). RED until plan 11 lands: today the schema still
 * requires `projectId`, so a `changeRequestId`-only payload is rejected as PAYLOAD_INVALID.
 */
const CR_ID = '25000000-0000-4000-8000-000000000009';
const THREAD_ID = '25000000-0000-4000-8000-000000000109';
const OTHER_CR_ID = '25000000-0000-4000-8000-000000000099';

function payload(overrides: Record<string, unknown> = {}): CabDocxPayload {
  const base = {
    schemaVersion: 1,
    kind: 'CAB',
    status: 'approved',
    inputRevision: 6,
    draftRevision: 4,
    approvedRevision: 4,
    changeRequestId: CR_ID,
    threadId: THREAD_ID,
    sourceArtifactIds: {
      PL02: '25000000-0000-4000-8000-000000002009',
      PL03B: '25000000-0000-4000-8000-000000003009',
      PL07: '25000000-0000-4000-8000-000000007009',
    },
    sources: [
      { kind: 'PL02', artifactId: '25000000-0000-4000-8000-000000002009', version: 2, hash: '2'.repeat(64), changeRequestId: CR_ID, threadId: THREAD_ID, approved: true },
      { kind: 'PL03B', artifactId: '25000000-0000-4000-8000-000000003009', version: 1, hash: '3'.repeat(64), changeRequestId: CR_ID, threadId: THREAD_ID, approved: true },
      { kind: 'PL07', artifactId: '25000000-0000-4000-8000-000000007009', version: 1, hash: '7'.repeat(64), changeRequestId: CR_ID, threadId: THREAD_ID, approved: true },
    ],
    expectedVersions: { PL02: 2, PL03B: 1, PL07: 1 },
    expectedHashes: { PL02: '2'.repeat(64), PL03B: '3'.repeat(64), PL07: '7'.repeat(64) },
    title: 'TÓM TẮT TRÌNH CAB - CR TOKENIZATION',
    contextObjective: 'Điều chỉnh cấp token theo luồng đã thống nhất.',
    businessChanges: ['Bổ sung kênh cấp token.'],
    technicalChanges: ['Thêm POST /tokens.'],
    sit: null,
    uat: null,
    risks: ['REQ-DIFF còn chưa xử lý.'],
    unresolvedDrift: ['REQ-DIFF'],
    rollback: { summary: 'Chưa có bằng chứng rollback.', verified: false },
    caveats: ['Coverage mã nguồn còn PARTIAL.'],
  };
  return { ...base, ...overrides } as unknown as CabDocxPayload;
}

describe('cabDocx payload contract (ENT-NORM-05)', () => {
  it('builds a document from a changeRequestId payload with no projectId', () => {
    const built = payload();
    expect('changeRequestId' in built).toBe(true);
    expect('projectId' in built).toBe(false);
    expect(() => buildCabDocument(built)).not.toThrow();
  });

  it('accepts a changeRequestId-only CAB payload through the wizard dispatcher', async () => {
    const blob = await buildWizardDocx('CAB', payload());
    expect(blob.size).toBeGreaterThan(0);
  });

  it('rejects a source ref whose changeRequestId does not match the payload', async () => {
    const mismatched = payload({
      sources: payload().sources.map((source) =>
        source.kind === 'PL03B' ? { ...source, changeRequestId: OTHER_CR_ID } : source
      ),
    });
    // The identity check must be the thing that rejects, not the payload schema.
    await expect(buildWizardDocx('CAB', mismatched)).rejects.toThrow(
      'WIZARD_DOCX_CAB_SOURCE_INVALID'
    );
  });

  it('rejects a source ref that still carries projectId instead of changeRequestId', async () => {
    const legacySource = payload({
      sources: payload().sources.map((source) => {
        const { changeRequestId: _changeRequestId, ...rest } = source;
        return { ...rest, projectId: CR_ID };
      }),
    });
    await expect(buildWizardDocx('CAB', legacySource)).rejects.toThrow();
  });
});
