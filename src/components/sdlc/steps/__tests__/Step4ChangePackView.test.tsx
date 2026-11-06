import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

vi.mock('../../../../services/changePackPackager', () => ({
  createChangePackFromSnapshot: vi.fn(),
}));

const HEAD_SHA = '2222222222222222222222222222222222222222';
const PACK_HASH = 'f'.repeat(64);

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
    projectId: 'proj-1',
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

describe('Step4ChangePackView render', () => {
  let db: TaskPlannerDatabase;

  beforeEach(() => {
    vi.clearAllMocks();
    db = new TaskPlannerDatabase(`test-step4-${Math.random()}`);
  });

  it('renders snapshot card with branch, commits and packaging CTA when snapshot provided', async () => {
    render(
      <Step4ChangePackView
        projectId="proj-1"
        crId="cr-1"
        crCode="CR-001"
        branchSnapshot={snapshot}
        solutionArtifact={solutionArtifact}
        onCommitChangePackAndDrift={vi.fn()}
        db={db}
      />
    );

    expect(screen.getByText(/Branch Snapshot đã duyệt \(Bước 3\)/i)).toBeInTheDocument();
    expect(screen.getByText('feature/CR-001')).toBeInTheDocument();
    expect(screen.getByText('11111111')).toBeInTheDocument();
    expect(screen.getByText('22222222')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Đóng gói & Đối chiếu từ Snapshot/i })
    ).toBeEnabled();
  });

  it('renders missing-snapshot warning and no packaging CTA when snapshot absent', async () => {
    render(
      <Step4ChangePackView
        projectId="proj-1"
        crId="cr-1"
        crCode="CR-001"
        solutionArtifact={solutionArtifact}
        onCommitChangePackAndDrift={vi.fn()}
        db={db}
      />
    );

    expect(screen.getByText(/Chưa có Branch Snapshot được duyệt/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Đóng gói & Đối chiếu từ Snapshot/i })).toBeNull();
    // D-03: manual fallback opens automatically without a snapshot.
    expect(await screen.findByRole('button', { name: 'Khu vực nạp change-pack' })).toBeInTheDocument();
  });

  it('houses the manual dropzone in a collapsed accordion by default', async () => {
    render(
      <Step4ChangePackView
        projectId="proj-1"
        crId="cr-1"
        crCode="CR-001"
        branchSnapshot={snapshot}
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

describe('Step4ChangePackView auto-package', () => {
  let db: TaskPlannerDatabase;

  beforeEach(() => {
    vi.clearAllMocks();
    db = new TaskPlannerDatabase(`test-step4-pack-${Math.random()}`);
    vi.spyOn(gitRemoteService, 'getProjectRepoSshBinding').mockResolvedValue({
      sshConfigId: 'ssh-1',
      remoteRepoPath: '/home/dev/repo',
      defaultBaseBranch: 'origin/main',
      updatedAt: '2026-11-06T00:00:00Z',
    });
    vi.spyOn(gitRemoteService, 'checkHeadDrift').mockResolvedValue({
      drifted: false,
      currentHeadSha: HEAD_SHA,
    });
    vi.spyOn(sshService, 'getSshConfigs').mockResolvedValue([
      {
        id: 'ssh-1',
        name: 'Dev WSL',
        host: '127.0.0.1',
        port: 2222,
        username: 'dev',
        authType: 'password',
        createdAt: '2026-11-06T00:00:00Z',
        updatedAt: '2026-11-06T00:00:00Z',
      },
    ]);
    vi.spyOn(hubChangePack, 'validateHubChangePack').mockResolvedValue(manifest);
    vi.spyOn(hubChangePack, 'buildHubReconciliation').mockResolvedValue(reconciliation);
    vi.mocked(packager.createChangePackFromSnapshot).mockResolvedValue({
      blob: new Blob(['zip']),
      meta: { cr: 'CR-001' } as never,
      warnings: ['Remote HEAD đã thay đổi'],
    });
  });

  it('auto-packages from snapshot, shows stepper stages, saves active pack and commits drift', async () => {
    const onCommit = vi.fn().mockResolvedValue(undefined);

    render(
      <Step4ChangePackView
        projectId="proj-1"
        crId="cr-1"
        crCode="CR-001"
        branchSnapshot={snapshot}
        solutionArtifact={solutionArtifact}
        onCommitChangePackAndDrift={onCommit}
        db={db}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Đóng gói & Đối chiếu từ Snapshot/i }));

    await waitFor(() => {
      expect(onCommit).toHaveBeenCalledWith(PACK_HASH, `CR-001-${HEAD_SHA.slice(0, 8)}.zip`, reconciliation);
    });

    expect(packager.createChangePackFromSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ssh-1' }),
      '/home/dev/repo',
      snapshot,
      'CR-001',
      expect.any(Function)
    );
    expect(hubChangePack.validateHubChangePack).toHaveBeenCalledTimes(1);
    expect(hubChangePack.buildHubReconciliation).toHaveBeenCalledTimes(1);

    const stepper = screen.getByTestId('packaging-stepper');
    expect(stepper).toHaveTextContent('Kiểm tra remote & tạo diff.patch');
    expect(stepper).toHaveTextContent('Thu thập tệp mới & SQL');
    expect(stepper).toHaveTextContent('Nén JSZip in-memory');
    expect(stepper).toHaveTextContent('Đối soát Drift Matrix');

    expect(await screen.findByText(/Remote HEAD đã thay đổi/)).toBeInTheDocument();

    const saved = await getMultiPackState('proj-1', 'cr-1', db);
    expect(saved.activePackHash).toBe(PACK_HASH);
    expect(saved.packs[0]?.hash).toBe(PACK_HASH);
    expect(await screen.findByText('Đang kích hoạt')).toBeInTheDocument();
  });

  it('opens the manual fallback and reports an error when SSH binding is missing', async () => {
    vi.spyOn(gitRemoteService, 'getProjectRepoSshBinding').mockResolvedValue(null);

    render(
      <Step4ChangePackView
        projectId="proj-1"
        crId="cr-1"
        crCode="CR-001"
        branchSnapshot={{ ...snapshot, sshConfigId: undefined, remoteRepoPath: undefined }}
        solutionArtifact={solutionArtifact}
        onCommitChangePackAndDrift={vi.fn()}
        db={db}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Đóng gói & Đối chiếu từ Snapshot/i }));

    expect(await screen.findByText(/Không thể kết nối SSH hoặc đóng gói thất bại/i)).toBeInTheDocument();
    expect(packager.createChangePackFromSnapshot).not.toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: 'Khu vực nạp change-pack' })).toBeInTheDocument();
  });
});

describe('Step4ChangePackView drift & resilience', () => {
  let db: TaskPlannerDatabase;

  beforeEach(() => {
    vi.clearAllMocks();
    db = new TaskPlannerDatabase(`test-step4-drift-${Math.random()}`);
    vi.spyOn(gitRemoteService, 'getProjectRepoSshBinding').mockResolvedValue({
      sshConfigId: 'ssh-1',
      remoteRepoPath: '/home/dev/repo',
      defaultBaseBranch: 'origin/main',
      updatedAt: '2026-11-06T00:00:00Z',
    });
    vi.spyOn(gitRemoteService, 'checkHeadDrift').mockResolvedValue({
      drifted: false,
      currentHeadSha: HEAD_SHA,
    });
    vi.spyOn(sshService, 'getSshConfigs').mockResolvedValue([
      {
        id: 'ssh-1',
        name: 'Dev WSL',
        host: '127.0.0.1',
        port: 2222,
        username: 'dev',
        authType: 'password',
        createdAt: '2026-11-06T00:00:00Z',
        updatedAt: '2026-11-06T00:00:00Z',
      },
    ]);
    vi.spyOn(hubChangePack, 'validateHubChangePack').mockResolvedValue(manifest);
    vi.spyOn(hubChangePack, 'buildHubReconciliation').mockResolvedValue(reconciliation);
    vi.mocked(packager.createChangePackFromSnapshot).mockResolvedValue({
      blob: new Blob(['zip']),
      meta: { cr: 'CR-001' } as never,
      warnings: [],
    });
  });

  it('navigates to Step 3 from the missing-snapshot banner and keeps the manual fallback open', async () => {
    const onNavigateToStep = vi.fn();

    render(
      <Step4ChangePackView
        projectId="proj-1"
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

  it('warns about remote drift and packages the approved commit only after confirmation', async () => {
    const onCommit = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(gitRemoteService, 'checkHeadDrift').mockResolvedValue({
      drifted: true,
      currentHeadSha: '9'.repeat(40),
    });

    render(
      <Step4ChangePackView
        projectId="proj-1"
        crId="cr-1"
        crCode="CR-001"
        branchSnapshot={snapshot}
        solutionArtifact={solutionArtifact}
        onCommitChangePackAndDrift={onCommit}
        db={db}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Đóng gói & Đối chiếu từ Snapshot/i }));

    const driftBanner = await screen.findByTestId('drift-warning');
    expect(driftBanner).toHaveTextContent('Cảnh báo: Remote HEAD đã thay đổi');
    expect(driftBanner).toHaveTextContent('99999999');
    expect(packager.createChangePackFromSnapshot).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục với commit đã duyệt/i }));

    await waitFor(() => {
      expect(onCommit).toHaveBeenCalledWith(PACK_HASH, `CR-001-${HEAD_SHA.slice(0, 8)}.zip`, reconciliation);
    });
    expect(packager.createChangePackFromSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ssh-1' }),
      '/home/dev/repo',
      snapshot,
      'CR-001',
      expect.any(Function)
    );
    expect(screen.queryByTestId('drift-warning')).toBeNull();
  });

  it('returns to Step 3 when the user rejects the drifted remote HEAD', async () => {
    const onNavigateToStep = vi.fn();
    vi.spyOn(gitRemoteService, 'checkHeadDrift').mockResolvedValue({
      drifted: true,
      currentHeadSha: '9'.repeat(40),
    });

    render(
      <Step4ChangePackView
        projectId="proj-1"
        crId="cr-1"
        crCode="CR-001"
        branchSnapshot={snapshot}
        solutionArtifact={solutionArtifact}
        onCommitChangePackAndDrift={vi.fn()}
        onNavigateToStep={onNavigateToStep}
        db={db}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Đóng gói & Đối chiếu từ Snapshot/i }));

    await screen.findByTestId('drift-warning');
    fireEvent.click(screen.getByRole('button', { name: /Quay lại Bước 3 duyệt lại/i }));

    expect(onNavigateToStep).toHaveBeenCalledWith('CODE_GUIDE');
    expect(packager.createChangePackFromSnapshot).not.toHaveBeenCalled();
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
        projectId="proj-1"
        crId="cr-1"
        crCode="CR-001"
        branchSnapshot={snapshot}
        solutionArtifact={solutionArtifact}
        onCommitChangePackAndDrift={onCommit}
        db={db}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Đóng gói & Đối chiếu từ Snapshot/i }));

    const dirtyBanner = await screen.findByTestId('dirty-warning');
    expect(dirtyBanner).toHaveTextContent('Repository remote đang có tệp chưa commit');
    expect(dirtyBanner).toHaveTextContent('không bị ảnh hưởng bởi working tree');
    await waitFor(() => {
      expect(onCommit).toHaveBeenCalledWith(PACK_HASH, `CR-001-${HEAD_SHA.slice(0, 8)}.zip`, reconciliation);
    });
  });

  it('offers a retry and opens the manual fallback when SSH packaging fails', async () => {
    vi.mocked(packager.createChangePackFromSnapshot).mockRejectedValue(
      new Error('SSH_CONNECTION_TIMEOUT')
    );

    render(
      <Step4ChangePackView
        projectId="proj-1"
        crId="cr-1"
        crCode="CR-001"
        branchSnapshot={snapshot}
        solutionArtifact={solutionArtifact}
        onCommitChangePackAndDrift={vi.fn()}
        db={db}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Đóng gói & Đối chiếu từ Snapshot/i }));

    expect(await screen.findByText(/Lỗi kết nối SSH hoặc đóng gói: SSH_CONNECTION_TIMEOUT/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thử lại kết nối' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Khu vực nạp change-pack' })).toBeInTheDocument();

    vi.mocked(packager.createChangePackFromSnapshot).mockResolvedValue({
      blob: new Blob(['zip']),
      meta: { cr: 'CR-001' } as never,
      warnings: [],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại kết nối' }));
    await waitFor(() => {
      expect(packager.createChangePackFromSnapshot).toHaveBeenCalledTimes(2);
    });
  });
});
