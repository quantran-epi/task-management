import { describe, expect, it } from 'vitest';
import { detectWorkflowStaleness } from '../stalenessDetector';
import type { SdlcWorkflowState } from '../workflowSchemas';

describe('detectWorkflowStaleness', () => {
  const dummyUuid1 = '11111111-1111-4111-8111-111111111111';
  const dummyUuid2 = '22222222-2222-4222-8222-222222222222';
  const dummyUuid3 = '33333333-3333-4333-8333-333333333333';

  const hash1 = 'a'.repeat(64);
  const hash2 = 'b'.repeat(64);
  const hash3 = 'c'.repeat(64);
  const hashNew = 'd'.repeat(64);

  const baseState: SdlcWorkflowState = {
    schemaVersion: 1,
    sessionId: dummyUuid1,
    projectId: dummyUuid2,
    threadId: dummyUuid3,
    currentStep: 'INTAKE',
    metadata: {
      cr: 'CR-TEST',
      featureName: 'Test Feature',
      author: 'Tester',
      requestingUnit: 'IT',
      date: '2026-10-30',
    },
    artifacts: {},
    staleSteps: [],
    createdAt: '2026-10-30T00:00:00.000Z',
    updatedAt: '2026-10-30T00:00:00.000Z',
  };

  it('báo 0 bước stale khi workflow ban đầu rỗng', () => {
    const report = detectWorkflowStaleness(baseState);
    expect(report.staleSteps).toEqual([]);
  });

  it('báo SOLUTION stale khi PL01 hoặc PL02 đổi hash', () => {
    const state: SdlcWorkflowState = {
      ...baseState,
      artifacts: {
        pl01: {
          kind: 'PL01',
          version: 1,
          hash: hashNew, // Mới cập nhật
          title: 'PL01',
          sourceHashes: [],
          updatedAt: '2026-10-30T00:00:00.000Z',
        },
        pl02: {
          kind: 'PL02',
          version: 1,
          hash: hash1,
          title: 'PL02',
          sourceHashes: [],
          updatedAt: '2026-10-30T00:00:00.000Z',
        },
        solution: {
          kind: 'SOLUTION',
          version: 1,
          hash: hash2,
          title: 'SOLUTION v1',
          sourceHashes: [hash1], // Thiếu hashNew của PL01
          updatedAt: '2026-10-30T00:00:00.000Z',
        },
      },
    };

    const report = detectWorkflowStaleness(state);
    expect(report.staleSteps).toContain('SOLUTION');
    expect(report.reasons.SOLUTION).toBeDefined();
  });

  it('báo CHANGE_PACK stale khi Solution lên v2 hoặc nạp pack mới', () => {
    const state: SdlcWorkflowState = {
      ...baseState,
      artifacts: {
        solution: {
          kind: 'SOLUTION',
          version: 2,
          hash: hashNew, // Solution đã lên v2
          title: 'SOLUTION v2',
          sourceHashes: [],
          updatedAt: '2026-10-30T00:00:00.000Z',
        },
        changePack: {
          kind: 'CHANGE_PACK',
          version: 1,
          hash: hash2,
          title: 'Pack v1',
          sourceHashes: [],
          updatedAt: '2026-10-30T00:00:00.000Z',
        },
        driftResult: {
          schemaVersion: 1,
          status: 'NO_DRIFT_COMPLETE',
          identity: {
            projectId: dummyUuid1,
            threadId: dummyUuid2,
            solutionNoteId: dummyUuid3,
            solutionVersion: 1,
            solutionHash: hash1, // Khác hashNew
            packHash: hash2,
            cr: 'CR-TEST',
            base: 'origin/main',
            head: 'HEAD',
          },
          approvedDesign: {
            currentSystem: 'Test system',
            affectedScreens: [],
            affectedApis: [],
            affectedTables: [],
          },
          actualImplementation: {
            affectedFiles: [],
            affectedScreens: [],
            affectedApis: [],
            affectedTables: [],
          },
          drift: [],
          dbChangesRollback: {
            affectedTables: [],
            changes: [],
            rollback: { status: 'verified', evidenceIds: [] },
          },
          regressionMatrix: [],
          coverage: [],
        },
      },
    };

    const report = detectWorkflowStaleness(state);
    expect(report.staleSteps).toContain('CHANGE_PACK');
  });

  it('báo TECH_DOCS và CAB stale khi dependency đổi', () => {
    const state: SdlcWorkflowState = {
      ...baseState,
      artifacts: {
        pl02: {
          kind: 'PL02',
          version: 1,
          hash: hash1,
          title: 'PL02',
          sourceHashes: [],
          updatedAt: '2026-10-30T00:00:00.000Z',
        },
        solution: {
          kind: 'SOLUTION',
          version: 1,
          hash: hash2,
          title: 'Solution v1',
          sourceHashes: [],
          updatedAt: '2026-10-30T00:00:00.000Z',
        },
        changePack: {
          kind: 'CHANGE_PACK',
          version: 1,
          hash: hashNew, // Pack mới
          title: 'Pack mới',
          sourceHashes: [],
          updatedAt: '2026-10-30T00:00:00.000Z',
        },
        pl03b: {
          kind: 'PL03B',
          version: 1,
          hash: hash3,
          title: 'PL03B',
          sourceHashes: [hash1, hash2], // Thiếu hashNew của pack
          updatedAt: '2026-10-30T00:00:00.000Z',
        },
        cab: {
          kind: 'CAB',
          version: 1,
          hash: 'e'.repeat(64),
          title: 'CAB',
          sourceHashes: [hash1, hash3],
          updatedAt: '2026-10-30T00:00:00.000Z',
        },
      },
    };

    const report = detectWorkflowStaleness(state);
    expect(report.staleSteps).toContain('TECH_DOCS');
  });
});
