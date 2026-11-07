import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { Step4ChangePackView } from '../Step4ChangePackView';
import * as sshService from '../../../../services/sshService';
import * as gitRemoteService from '../../../../services/gitRemoteService';
import * as hubChangePack from '../../../../services/wizard/hubChangePack';
import * as packager from '../../../../services/changePackPackager';
import { getMultiPackState } from '../../../../services/wizard/sdlcCrManager';
import { TaskPlannerDatabase } from '../../../../db';
import type { BranchSnapshot } from '../../../../types/gitRemote';
import type { ChangePackManifest } from '../../../../services/wizard/changePack';
import type { ReconciliationResult } from '../../../../services/wizard/reconciliation';
import type { System } from '../../../../types/models';

vi.mock('../../../../services/changePackPackager', () => ({
  createChangePackFromSnapshot: vi.fn(),
}));

const HEAD_SHA = '2222222222222222222222222222222222222222';
const PACK_HASH = 'f'.repeat(64);
const SYSTEM_A = '44444444-4444-4444-8444-444444444444';
const SYSTEM_B = '55555555-5555-4555-8555-555555555555';

const snapshot: BranchSnapshot = {
  sshConfigId: 'ssh-1',
  remoteRepoPath: '/home/dev/repo',
  baseBranch: 'origin/main',
  targetBranch: 'feature/CR-001',
  baseCommit: '1111111111111111111111111111111111111111',
  headSha: HEAD_SHA,
  filesChangedCount: 3,
  approvedAt: '2026-11-06T00:00:00.000Z',
};

const snapshotB: BranchSnapshot = { ...snapshot, sshConfigId: 'ssh-2', remoteRepoPath: '/home/dev/repo-b' };

const systemA: System = {
  id: SYSTEM_A,
  name: 'SmartCard API',
  code: 'SMARTCARD_API',
  parentId: null,
  type: 'SERVICE',
  sshConfigId: 'ssh-1',
  remoteRepoPath: '/home/dev/repo',
  defaultBaseBranch: 'origin/main',
  createdAt: '2026-11-06T00:00:00.000Z',
  updatedAt: '2026-11-06T00:00:00.000Z',
};

const systemB: System = {
  ...systemA,
  id: SYSTEM_B,
  name: 'Card Gateway',
  code: 'CARD_GW',
  sshConfigId: 'ssh-2',
  remoteRepoPath: '/home/dev/repo-b',
};

const solutionArtifact = {
  noteId: '11111111-1111-4111-8111-111111111111',
  kind: 'SOLUTION' as const,
  version: 1,
  hash: 'a'.repeat(64),
  title: 'SOLUTION.md',
  content: '# Solution',
  sourceHashes: [],
  updatedAt: '2026-11-06T00:00:00.000Z',
};

const manifest = {
  schemaVersion: 1,
  packHash: PACK_HASH,
  identity: {
    cr: 'CR-001',
    base: snapshot.baseCommit,
    head: HEAD_SHA,
    branch: 'feature/CR-001',
  },
  meta: {},
  entries: [],
  compressedBytes: 3,
  expandedBytes: 3,
  commitCount: 1,
  fileCount: 0,
  coverageStatus: 'complete',
} as unknown as Readonly<ChangePackManifest>;

const reconciliation = {
  schemaVersion: 1,
  identity: {
    changeRequestId: 'proj-1',
    threadId: 'thread-1',
    solutionNoteId: solutionArtifact.noteId,
    solutionVersion: 1,
    solutionHash: solutionArtifact.hash,
    packHash: PACK_HASH,
    cr: 'CR-001',
    base: snapshot.baseCommit,
    head: HEAD_SHA,
  },
  status: 'NO_DRIFT_COMPLETE',
  approvedDesign: { currentSystem: '# Solution', affectedScreens: [], affectedApis: [], affectedTables: [] },
  actualImplementation: { affectedFiles: [], affectedScreens: [], affectedApis: [], affectedTables: [] },
  drift: [],
  dbChangesRollback: {
    affectedTables: [],
    changes: [],
    rollback: { status: 'unknown', evidenceIds: [] },
  },
  regressionMatrix: [],
  coverage: [{ path: 'diff.patch', state: 'included', evidenceIds: [] }],
} as unknown as ReconciliationResult;

const sshConfigs = [
  {
    id: 'ssh-1', name: 'Dev WSL', host: '127.0.0.1', port: 2222, username: 'dev',
    authType: 'password' as const,
    createdAt: '2026-11-06T00:00:00Z', updatedAt: '2026-11-06T00:00:00Z',
  },
  {
    id: 'ssh-2', name: 'Dev B', host: '127.0.0.1', port: 2222, username: 'dev',
    authType: 'password' as const,
    createdAt: '2026-11-06T00:00:00Z', updatedAt: '2026-11-06T00:00:00Z',
  },
];

function mockHappyPath() {
  vi.spyOn(sshService, 'getSshConfigs').mockResolvedValue(sshConfigs);
  vi.spyOn(gitRemoteService, 'checkHeadDrift').mockResolvedValue({
    drifted: false,
    currentHeadSha: HEAD_SHA,
  });
  vi.spyOn(hubChangePack, 'validateHubChangePack').mockResolvedValue(manifest);
  vi.spyOn(hubChangePack, 'buildHubReconciliation').mockResolvedValue(reconciliation);
  vi.mocked(packager.createChangePackFromSnapshot).mockResolvedValue({
    blob: new Blob(['zip']),
    meta: { cr: 'CR-001' } as never,
    warnings: [],
  });
}

describe('Step4ChangePackView render', () => {
  let db: TaskPlannerDatabase;

  beforeEach(() => {
    vi.clearAllMocks();
    db = new TaskPlannerDatabase(`test-step4-${Math.random()}`);
  });

  it('renders one card per target subsystem, each with its own pack button and status', async () => {
    mockHappyPath();

    render(
      <Step4ChangePackView
        changeRequestId="proj-1"
        crId="cr-1"
        crCode="CR-001"
        branchSnapshots={{ [SYSTEM_A]: snapshot, [SYSTEM_B]: snapshotB }}
        targetSystems={[systemA, systemB]}
        solutionArtifact={solutionArtifact}
        onCommitChangePackAndDrift={vi.fn()}
        db={db}
      />
    );

    expect(screen.getByTestId(`pack-card-${SYSTEM_A}`)).toBeInTheDocument();
    expect(screen.getByTestId(`pack-card-${SYSTEM_B}`)).toBeInTheDocument();
    expect(screen.getByTestId(`btn-pack-${SYSTEM_A}`)).toBeEnabled();
    expect(screen.getByTestId(`btn-pack-${SYSTEM_B}`)).toBeEnabled();
    expect(screen.getAllByText('Chưa đóng gói')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /Đóng gói tất cả \(2\)/i })).toBeInTheDocument();
  });

  it('renders the missing-snapshot warning and no pack-all CTA when there are no targets', async () => {
    render(
      <Step4ChangePackView
        changeRequestId="proj-1"
        crId="cr-1"
        crCode="CR-001"
        solutionArtifact={solutionArtifact}
        onCommitChangePackAndDrift={vi.fn()}
        db={db}
      />
    );

    expect(screen.getByText(/Chưa có Branch Snapshot được duyệt/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Đóng gói tất cả/i })).toBeNull();
    // D-03: manual fallback opens automatically without a snapshot.
    expect(await screen.findByRole('button', { name: 'Khu vực nạp change-pack' })).toBeInTheDocument();
  });

  it('houses the manual dropzone in a collapsed accordion by default', async () => {
    mockHappyPath();

    render(
      <Step4ChangePackView
        changeRequestId="proj-1"
        crId="cr-1"
        crCode="CR-001"
        branchSnapshots={{ [SYSTEM_A]: snapshot }}
        targetSystems={[systemA]}
        solutionArtifact={solutionArtifact}
        onCommitChangePackAndDrift={vi.fn()}
        db={db}
      />
    );

    const header = screen.getByText(/Nạp Change Pack thủ công \(\.zip\)/i);
    expect(header).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Khu vực nạp change-pack' })).toBeNull();

    fireEvent.click(header);
    expect(await screen.findByRole('button', { name: 'Khu vực nạp change-pack' })).toBeInTheDocument();
  });
});

describe('Step4ChangePackView per-subsystem packing', () => {
  let db: TaskPlannerDatabase;

  beforeEach(() => {
    vi.clearAllMocks();
    db = new TaskPlannerDatabase(`test-step4-pack-${Math.random()}`);
    mockHappyPath();
  });

  it('packing one card sets only that card status; the other stays Chưa đóng gói', async () => {
    const onCommit = vi.fn().mockResolvedValue(undefined);

    render(
      <Step4ChangePackView
        changeRequestId="proj-1"
        crId="cr-1"
        crCode="CR-001"
        branchSnapshots={{ [SYSTEM_A]: snapshot, [SYSTEM_B]: snapshotB }}
        targetSystems={[systemA, systemB]}
        solutionArtifact={solutionArtifact}
        onCommitChangePackAndDrift={onCommit}
        db={db}
      />
    );

    fireEvent.click(screen.getByTestId(`btn-pack-${SYSTEM_A}`));

    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    expect(packager.createChangePackFromSnapshot).toHaveBeenCalledTimes(1);
    expect(packager.createChangePackFromSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ssh-1' }),
      '/home/dev/repo',
      snapshot,
      'CR-001'
    );

    const cardA = screen.getByTestId(`pack-card-${SYSTEM_A}`);
    const cardB = screen.getByTestId(`pack-card-${SYSTEM_B}`);
    expect(within(cardA).getByText('Thành công')).toBeInTheDocument();
    expect(within(cardB).getByText('Chưa đóng gói')).toBeInTheDocument();

    const saved = await getMultiPackState('proj-1', 'cr-1', db);
    expect(saved.packs[0]?.systemId).toBe(SYSTEM_A);
  });

  it('Đóng gói tất cả runs both sequentially and shows {done}/{n} progress', async () => {
    const onCommit = vi.fn().mockResolvedValue(undefined);

    render(
      <Step4ChangePackView
        changeRequestId="proj-1"
        crId="cr-1"
        crCode="CR-001"
        branchSnapshots={{ [SYSTEM_A]: snapshot, [SYSTEM_B]: snapshotB }}
        targetSystems={[systemA, systemB]}
        solutionArtifact={solutionArtifact}
        onCommitChangePackAndDrift={onCommit}
        db={db}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Đóng gói tất cả \(2\)/i }));

    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(2));
    expect(packager.createChangePackFromSnapshot).toHaveBeenCalledTimes(2);
    expect(packager.createChangePackFromSnapshot).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: 'ssh-1' }),
      '/home/dev/repo',
      snapshot,
      'CR-001'
    );
    expect(packager.createChangePackFromSnapshot).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: 'ssh-2' }),
      '/home/dev/repo-b',
      snapshotB,
      'CR-001'
    );

    const summary = await screen.findByTestId('pack-all-summary');
    expect(summary).toHaveTextContent('Đóng gói hoàn tất: 2/2 subsystem thành công.');
  });

  it('continues to the second subsystem when the first throws and names the failed code', async () => {
    vi.mocked(packager.createChangePackFromSnapshot)
      .mockRejectedValueOnce(new Error('SSH_CONNECTION_TIMEOUT'))
      .mockResolvedValueOnce({
        blob: new Blob(['zip']),
        meta: { cr: 'CR-001' } as never,
        warnings: [],
      });

    const onCommit = vi.fn().mockResolvedValue(undefined);

    render(
      <Step4ChangePackView
        changeRequestId="proj-1"
        crId="cr-1"
        crCode="CR-001"
        branchSnapshots={{ [SYSTEM_A]: snapshot, [SYSTEM_B]: snapshotB }}
        targetSystems={[systemA, systemB]}
        solutionArtifact={solutionArtifact}
        onCommitChangePackAndDrift={onCommit}
        db={db}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Đóng gói tất cả \(2\)/i }));

    const summary = await screen.findByTestId('pack-all-summary');
    expect(summary).toHaveTextContent('Đóng gói hoàn tất một phần: 1/2 subsystem thành công. Lỗi: SMARTCARD_API.');
    expect(summary.className).toContain('ant-alert-warning');

    expect(packager.createChangePackFromSnapshot).toHaveBeenCalledTimes(2);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(within(screen.getByTestId(`pack-card-${SYSTEM_A}`)).getByText('Thất bại')).toBeInTheDocument();
    expect(within(screen.getByTestId(`pack-card-${SYSTEM_B}`)).getByText('Thành công')).toBeInTheDocument();
  });

  it('stops after the in-flight card settles and marks the rest Bỏ qua', async () => {
    let releaseFirst: (() => void) | undefined;
    vi.mocked(packager.createChangePackFromSnapshot).mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseFirst = () =>
            resolve({
              blob: new Blob(['zip']),
              meta: { cr: 'CR-001' } as never,
              warnings: [],
            });
        })
    );

    render(
      <Step4ChangePackView
        changeRequestId="proj-1"
        crId="cr-1"
        crCode="CR-001"
        branchSnapshots={{ [SYSTEM_A]: snapshot, [SYSTEM_B]: snapshotB }}
        targetSystems={[systemA, systemB]}
        solutionArtifact={solutionArtifact}
        onCommitChangePackAndDrift={vi.fn().mockResolvedValue(undefined)}
        db={db}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Đóng gói tất cả \(2\)/i }));

    const stopButton = await screen.findByRole('button', { name: /Dừng đóng gói/i });
    fireEvent.click(stopButton);
    expect(await screen.findByRole('button', { name: /Đang dừng\.\.\./i })).toBeInTheDocument();

    releaseFirst?.();

    const summary = await screen.findByTestId('pack-all-summary');
    expect(summary.className).toContain('ant-alert-info');
    expect(packager.createChangePackFromSnapshot).toHaveBeenCalledTimes(1);
    expect(within(screen.getByTestId(`pack-card-${SYSTEM_B}`)).getByText('Bỏ qua')).toBeInTheDocument();
  });
});

describe('Step4ChangePackView drift & failure surface', () => {
  let db: TaskPlannerDatabase;

  beforeEach(() => {
    vi.clearAllMocks();
    db = new TaskPlannerDatabase(`test-step4-drift-${Math.random()}`);
    mockHappyPath();
  });

  it('navigates to Step 3 from the missing-snapshot banner and keeps the manual fallback open', async () => {
    const onNavigateToStep = vi.fn();

    render(
      <Step4ChangePackView
        changeRequestId="proj-1"
        crId="cr-1"
        crCode="CR-001"
        solutionArtifact={solutionArtifact}
        onCommitChangePackAndDrift={vi.fn()}
        onNavigateToStep={onNavigateToStep}
        db={db}
      />
    );

    expect(screen.getByText(/Chưa có Branch Snapshot được duyệt/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Quay lại Bước 3: Duyệt nhánh/i }));
    expect(onNavigateToStep).toHaveBeenCalledWith('CODE_GUIDE');
    expect(await screen.findByRole('button', { name: 'Khu vực nạp change-pack' })).toBeInTheDocument();
  });

  it('warns about remote drift on a single card and packages only after confirmation', async () => {
    const onCommit = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(gitRemoteService, 'checkHeadDrift').mockResolvedValue({
      drifted: true,
      currentHeadSha: '9'.repeat(40),
    });

    render(
      <Step4ChangePackView
        changeRequestId="proj-1"
        crId="cr-1"
        crCode="CR-001"
        branchSnapshots={{ [SYSTEM_A]: snapshot }}
        targetSystems={[systemA]}
        solutionArtifact={solutionArtifact}
        onCommitChangePackAndDrift={onCommit}
        db={db}
      />
    );

    fireEvent.click(screen.getByTestId(`btn-pack-${SYSTEM_A}`));

    const driftBanner = await screen.findByTestId('drift-warning');
    expect(driftBanner).toHaveTextContent('Cảnh báo: Remote HEAD đã thay đổi');
    expect(driftBanner).toHaveTextContent('99999999');
    expect(packager.createChangePackFromSnapshot).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục với commit đã duyệt/i }));

    await waitFor(() => {
      expect(onCommit).toHaveBeenCalledWith(PACK_HASH, `CR-001-${HEAD_SHA.slice(0, 8)}.zip`, reconciliation);
    });
    expect(screen.queryByTestId('drift-warning')).toBeNull();
  });

  it('shows a dirty-tree info notice without failing packaging', async () => {
    const onCommit = vi.fn().mockResolvedValue(undefined);
    vi.mocked(packager.createChangePackFromSnapshot).mockResolvedValue({
      blob: new Blob(['zip']),
      meta: { cr: 'CR-001' } as never,
      warnings: ['Remote có 2 tệp chưa commit; chỉ đóng gói commit Snapshot đã duyệt.'],
    });

    render(
      <Step4ChangePackView
        changeRequestId="proj-1"
        crId="cr-1"
        crCode="CR-001"
        branchSnapshots={{ [SYSTEM_A]: snapshot }}
        targetSystems={[systemA]}
        solutionArtifact={solutionArtifact}
        onCommitChangePackAndDrift={onCommit}
        db={db}
      />
    );

    fireEvent.click(screen.getByTestId(`btn-pack-${SYSTEM_A}`));

    const dirtyBanner = await screen.findByTestId('dirty-warning');
    expect(dirtyBanner).toHaveTextContent('Repository remote đang có tệp chưa commit');
    await waitFor(() => {
      expect(onCommit).toHaveBeenCalledWith(PACK_HASH, `CR-001-${HEAD_SHA.slice(0, 8)}.zip`, reconciliation);
    });
  });

  it('reports a packaging failure inline on that card, not as a step-wide error', async () => {
    vi.mocked(packager.createChangePackFromSnapshot).mockRejectedValue(
      new Error('SSH_CONNECTION_TIMEOUT')
    );

    render(
      <Step4ChangePackView
        changeRequestId="proj-1"
        crId="cr-1"
        crCode="CR-001"
        branchSnapshots={{ [SYSTEM_A]: snapshot }}
        targetSystems={[systemA]}
        solutionArtifact={solutionArtifact}
        onCommitChangePackAndDrift={vi.fn()}
        db={db}
      />
    );

    fireEvent.click(screen.getByTestId(`btn-pack-${SYSTEM_A}`));

    const card = screen.getByTestId(`pack-card-${SYSTEM_A}`);
    expect(
      await within(card).findByText(/Lỗi kết nối SSH hoặc đóng gói: SSH_CONNECTION_TIMEOUT/i)
    ).toBeInTheDocument();
    expect(within(card).getByText('Thất bại')).toBeInTheDocument();
  });

  it('reports a missing SSH config inline on the card', async () => {
    const { sshConfigId: _ssh, remoteRepoPath: _repo, ...bareSystem } = systemA;

    render(
      <Step4ChangePackView
        changeRequestId="proj-1"
        crId="cr-1"
        crCode="CR-001"
        branchSnapshots={{
          [SYSTEM_A]: { ...snapshot, sshConfigId: undefined, remoteRepoPath: undefined },
        }}
        targetSystems={[bareSystem]}
        solutionArtifact={solutionArtifact}
        onCommitChangePackAndDrift={vi.fn()}
        db={db}
      />
    );

    fireEvent.click(screen.getByTestId(`btn-pack-${SYSTEM_A}`));

    expect(
      await screen.findByText(/Không thể kết nối SSH hoặc đóng gói thất bại/i)
    ).toBeInTheDocument();
    expect(packager.createChangePackFromSnapshot).not.toHaveBeenCalled();
  });

  it('renders the drift matrix as one shared table with a Subsystem column', async () => {
    const onCommit = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(hubChangePack, 'buildHubReconciliation').mockResolvedValue({
      ...reconciliation,
      drift: [
        {
          category: 'outside_solution',
          path: 'src/x.ts',
          detail: 'ngoài thiết kế',
          evidenceIds: [],
        },
      ],
    } as unknown as ReconciliationResult);

    render(
      <Step4ChangePackView
        changeRequestId="proj-1"
        crId="cr-1"
        crCode="CR-001"
        branchSnapshots={{ [SYSTEM_A]: snapshot, [SYSTEM_B]: snapshotB }}
        targetSystems={[systemA, systemB]}
        solutionArtifact={solutionArtifact}
        onCommitChangePackAndDrift={onCommit}
        db={db}
      />
    );

    fireEvent.click(screen.getByTestId(`btn-pack-${SYSTEM_A}`));
    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));

    // One shared pack/drift table carries the Subsystem column — not one table per card.
    expect(screen.getAllByText('Subsystem')).toHaveLength(1);
    // Once in the card header, once in the shared table's Subsystem cell.
    expect(screen.getAllByText('SMARTCARD_API')).toHaveLength(2);
  });
});
