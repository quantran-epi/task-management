import { describe, it, expect } from 'vitest';
import {
  BranchSnapshotSchema,
  SdlcWorkflowStateSchema,
} from '../../../src/services/wizard/workflowSchemas';

/**
 * Wave 0 contract for plan 31.2-17 Task 1 (ENT-NORM-05, D-40).
 *
 * `artifacts.branchSnapshots` becomes a per-subsystem record keyed by system id while the
 * legacy single `artifacts.branchSnapshot` stays readable. RED until plan 17 lands.
 */
const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const CR_ID = '22222222-2222-4222-8222-222222222222';
const THREAD_ID = '33333333-3333-4333-8333-333333333333';
const SYSTEM_A = '44444444-4444-4444-8444-444444444444';
const SYSTEM_B = '55555555-5555-4555-8555-555555555555';
const NOW = '2026-01-01T00:00:00.000Z';

const HASH = 'a'.repeat(64);

function snapshot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sshConfigId: 'ssh-1',
    remoteRepoPath: '/data/services/smartcard-api',
    baseBranch: 'origin/main',
    targetBranch: 'feature/CR-1',
    headSha: 'abc1234',
    approvedAt: NOW,
    ...overrides,
  };
}

function workflowState(artifacts: Record<string, unknown>): Record<string, unknown> {
  return {
    schemaVersion: 1,
    sessionId: SESSION_ID,
    projectId: CR_ID,
    threadId: THREAD_ID,
    currentStep: 'CHANGE_PACK',
    metadata: {
      cr: 'CR-1',
      featureName: 'Feature',
      author: 'Author',
      requestingUnit: 'Unit',
      date: '2026-01-01',
    },
    artifacts,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe('workflowSchemas — per-subsystem branch snapshots (ENT-NORM-05)', () => {
  it('accepts artifacts.branchSnapshots keyed by system id', () => {
    const result = SdlcWorkflowStateSchema.safeParse(
      workflowState({
        branchSnapshots: {
          [SYSTEM_A]: snapshot({ targetBranch: 'feature/CR-1-a' }),
          [SYSTEM_B]: snapshot({ targetBranch: 'feature/CR-1-b' }),
        },
      })
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(Object.keys(result.data.artifacts.branchSnapshots ?? {})).toEqual([SYSTEM_A, SYSTEM_B]);
    }
  });

  it('still reads the legacy single artifacts.branchSnapshot as a fallback', () => {
    const result = SdlcWorkflowStateSchema.safeParse(
      workflowState({ branchSnapshot: snapshot() })
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.artifacts.branchSnapshot?.targetBranch).toBe('feature/CR-1');
    }
  });

  it('defaults branchSnapshots to an empty record when absent', () => {
    const result = SdlcWorkflowStateSchema.safeParse(workflowState({}));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.artifacts.branchSnapshots).toEqual({});
    }
  });

  it('rejects a snapshot missing both targetBranch and branch', () => {
    const { targetBranch: _targetBranch, ...withoutBranch } = snapshot();
    expect(BranchSnapshotSchema.safeParse(withoutBranch).success).toBe(false);
  });

  it('rejects a snapshot missing both headSha and headCommit', () => {
    const { headSha: _headSha, ...withoutHead } = snapshot();
    expect(BranchSnapshotSchema.safeParse(withoutHead).success).toBe(false);
  });

  it('accepts a snapshot that uses branch and headCommit instead', () => {
    expect(
      BranchSnapshotSchema.safeParse({
        branch: 'feature/CR-1',
        headCommit: 'deadbeef',
        approvedAt: NOW,
      }).success
    ).toBe(true);
  });

  it('keeps the artifact ref schema untouched for other kinds', () => {
    const result = SdlcWorkflowStateSchema.safeParse(
      workflowState({
        solution: {
          kind: 'SOLUTION',
          version: 1,
          hash: HASH,
          title: 'SOLUTION',
          updatedAt: NOW,
        },
      })
    );
    expect(result.success).toBe(true);
  });
});
