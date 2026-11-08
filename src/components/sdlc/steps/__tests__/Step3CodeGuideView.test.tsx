import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RemoteDiffViewer } from '../../diff/RemoteDiffViewer';
import { Step3CodeGuideView } from '../Step3CodeGuideView';
import * as sshService from '../../../../services/sshService';
import * as gitRemoteService from '../../../../services/gitRemoteService';
import type { CrTarget, System } from '../../../../types/models';

/**
 * D-38b: Step 3 gets SSH/repo/base and the feature branch from the CR target's subsystem —
 * there is no settings-backed project binding any more.
 */
const TARGET_SYSTEM: System = {
  id: 'sys-1',
  name: 'Card Authorization API',
  code: 'SC-AUTH-API',
  parentId: null,
  type: 'SERVICE',
  sshConfigId: 'ssh-1',
  remoteRepoPath: '/home/dev/repo',
  defaultBaseBranch: 'origin/main',
  createdAt: '2026-11-06T00:00:00Z',
  updatedAt: '2026-11-06T00:00:00Z',
};
const TARGET_PROPS = {
  targetSystems: [TARGET_SYSTEM],
  crTargets: [{ systemId: 'sys-1', featureBranch: 'feature/CR-101' }] as CrTarget[],
  selectedSystemId: 'sys-1',
};

const SAMPLE_RAW_DIFF = `diff --git a/src/index.ts b/src/index.ts
index e69de29..49b78bb 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,4 @@
 import React from 'react';
-const oldConst = 1;
+const newConst = 2;
+console.log('hello');
 export default {};
`;

describe('RemoteDiffViewer Component', () => {  it('renders diff with file path and additions/deletions stats', () => {
    render(
      <RemoteDiffViewer
        rawDiff={SAMPLE_RAW_DIFF}
        filePath="src/index.ts"
      />
    );

    expect(screen.getByText('src/index.ts')).toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.getByText('−1')).toBeInTheDocument();
    expect(screen.getAllByText('const').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('newConst')).toBeInTheDocument();
  });

  it('switches between Unified and Split modes via Segmented control', () => {
    const handleModeChange = vi.fn();
    render(
      <RemoteDiffViewer
        rawDiff={SAMPLE_RAW_DIFF}
        filePath="src/index.ts"
        onViewModeChange={handleModeChange}
      />
    );

    const splitBtn = screen.getByRole('radio', { name: 'Split' });
    fireEvent.click(splitBtn);
    expect(handleModeChange).toHaveBeenCalledWith('split');
  });

  it('caps diff files exceeding 5000 lines with an alert and confirmation button', () => {
    // Generate diff with > 5000 lines
    const largeLines = ['diff --git a/huge.txt b/huge.txt', '--- a/huge.txt', '+++ b/huge.txt', '@@ -1,1 +1,5005 @@'];
    for (let i = 0; i < 5005; i++) {
      largeLines.push(`+line content ${i}`);
    }
    const hugeDiff = largeLines.join('\n');

    render(
      <RemoteDiffViewer
        rawDiff={hugeDiff}
        filePath="huge.txt"
      />
    );

    expect(
      screen.getByText(/Đã tự động giới hạn hiển thị 5\.000 dòng để đảm bảo hiệu năng giao diện\./i)
    ).toBeInTheDocument();

    const loadAllBtn = screen.getByRole('button', { name: /Tải toàn bộ nội dung diff/i });
    expect(loadAllBtn).toBeInTheDocument();
  });

  it('triggers toggle fullscreen callback when button is clicked', () => {
    const handleToggle = vi.fn();
    render(
      <RemoteDiffViewer
        rawDiff={SAMPLE_RAW_DIFF}
        filePath="src/index.ts"
        onToggleFullscreen={handleToggle}
      />
    );

    const fsBtn = screen.getByRole('button', { name: /Toàn màn hình/i });
    fireEvent.click(fsBtn);
    expect(handleToggle).toHaveBeenCalledTimes(1);
  });
});

describe('Step3CodeGuideView: configuration and dirty banner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preloads SSH configs and project binding, and renders dirty banner when repo is dirty', async () => {
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
    vi.spyOn(sshService, 'getSshSecret').mockResolvedValue('test-pass');

    vi.spyOn(gitRemoteService, 'getRemoteBranches').mockResolvedValue([
      { name: 'origin/main', isRemote: true, isHead: false },
      { name: 'feature/CR-101', isRemote: true, isHead: false },
    ]);

    vi.spyOn(gitRemoteService, 'checkDirtyStatus').mockResolvedValue({
      isClean: false,
      uncommittedFiles: [
        { path: 'src/dirty.ts', indexStatus: 'M', workingTreeStatus: ' ' },
        { path: 'temp.log', indexStatus: '?', workingTreeStatus: '?' },
      ],
    });

    vi.spyOn(gitRemoteService, 'getDiffSummary').mockResolvedValue({
      baseBranch: 'origin/main',
      targetBranch: 'feature/CR-101',
      headSha: 'abc1234567890',
      commits: [
        {
          sha: 'abc1234567890',
          shortSha: 'abc1234',
          author: 'Dev',
          date: '2026-11-06',
          message: 'feat: add stuff',
        },
      ],
      files: [
        {
          path: 'src/dirty.ts',
          status: 'modified',
          additions: 5,
          deletions: 2,
        },
      ],
      totalAdditions: 5,
      totalDeletions: 2,
    });

    vi.spyOn(gitRemoteService, 'getFileDiff').mockResolvedValue(SAMPLE_RAW_DIFF);

    render(
      <Step3CodeGuideView
        crCode="CR-101"
        {...TARGET_PROPS}
        approvedSolutionMarkdown="# Approved Solution"
        onProceedToStep4={vi.fn()}
      />
    );

    // Verify header title
    expect(screen.getByText(/Bước 3: Review Nhánh & Diff Repository Remote qua SSH/i)).toBeInTheDocument();

    // Verify dirty working tree warning alert
    await waitFor(() => {
      expect(
        screen.getByText(/Thư mục làm việc remote có 2 tệp chưa commit/i)
      ).toBeInTheDocument();
    });

    const dirtyMatches = screen.getAllByText('src/dirty.ts');
    expect(dirtyMatches.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Step3CodeGuideView: 2-column review pane and interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders 2-column review pane with commit timeline, changed files list, and diff viewer', async () => {
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
    vi.spyOn(sshService, 'getSshSecret').mockResolvedValue('test-pass');

    vi.spyOn(gitRemoteService, 'getRemoteBranches').mockResolvedValue([
      { name: 'origin/main', isRemote: true, isHead: false },
      { name: 'feature/CR-101', isRemote: true, isHead: false },
    ]);

    vi.spyOn(gitRemoteService, 'checkDirtyStatus').mockResolvedValue({
      isClean: true,
      uncommittedFiles: [],
    });

    vi.spyOn(gitRemoteService, 'getDiffSummary').mockResolvedValue({
      baseBranch: 'origin/main',
      targetBranch: 'feature/CR-101',
      headSha: 'abc1234567890',
      commits: [
        {
          sha: 'abc1234567890',
          shortSha: 'abc1234',
          author: 'Alice',
          date: '2026-11-06',
          message: 'feat: add awesome feature',
        },
      ],
      files: [
        {
          path: 'src/fileA.ts',
          status: 'added',
          additions: 10,
          deletions: 0,
        },
        {
          path: 'src/fileB.ts',
          status: 'modified',
          additions: 3,
          deletions: 2,
        },
      ],
      totalAdditions: 13,
      totalDeletions: 2,
    });

    vi.spyOn(gitRemoteService, 'getFileDiff').mockImplementation(async (_cfg, _path, _base, _target, filePath) => {
      return `diff --git a/${filePath} b/${filePath}\n--- a/${filePath}\n+++ b/${filePath}\n@@ -1,1 +1,2 @@\n+line for ${filePath}\n`;
    });

    const handleCommitSnapshot = vi.fn();

    render(
      <Step3CodeGuideView
        crCode="CR-101"
        {...TARGET_PROPS}
        approvedSolutionMarkdown="# Approved Solution"
        onCommitBranchSnapshot={handleCommitSnapshot}
        onProceedToStep4={vi.fn()}
      />
    );

    // Wait for diffSummary and review pane
    await waitFor(() => {
      expect(screen.getByTestId('two-column-review-pane')).toBeInTheDocument();
      expect(screen.getByText('abc1234')).toBeInTheDocument();
    });

    // Check resize splitter mounted
    expect(screen.getByTestId('resize-splitter')).toBeInTheDocument();

    // Check commit log item
    expect(screen.getByText('feat: add awesome feature')).toBeInTheDocument();

    // Check changed files
    const fileAMatches = screen.getAllByText('src/fileA.ts');
    expect(fileAMatches.length).toBeGreaterThanOrEqual(1);

    const fileBMatches = screen.getAllByText('src/fileB.ts');
    expect(fileBMatches.length).toBeGreaterThanOrEqual(1);

    // Click fileB to switch diff
    fireEvent.click(fileBMatches[0]!);

    await waitFor(() => {
      expect(screen.getByText('src/fileB.ts', { selector: 'span[title="src/fileB.ts"]' })).toBeInTheDocument();
    });

    // Approve snapshot CTA
    const approveBtn = screen.getByRole('button', { name: /Chấp thuận kết quả review/i });
    expect(approveBtn).toBeEnabled();
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(handleCommitSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          baseBranch: 'origin/main',
          targetBranch: 'feature/CR-101',
          headSha: 'abc1234567890',
          totalAdditions: 13,
          totalDeletions: 2,
        })
      );
    });
  });
});

import { BranchSnapshotSchema } from '../../../../services/wizard/workflowSchemas';
import { createSdlcWorkflowCoordinator } from '../../../../services/wizard/workflowCoordinator';
import type { SdlcWorkflowState } from '../../../../services/wizard/workflowSchemas';

describe('Task 1: SdlcWorkflowState schema and coordinator BranchSnapshot persistence', () => {
  it('BranchSnapshotSchema validates complete branch snapshot object', () => {
    const fullSnapshot = {
      sshConfigId: 'ssh-1',
      remoteRepoPath: '/home/dev/repo',
      baseBranch: 'origin/main',
      targetBranch: 'feature/CR-101',
      headSha: '0123456789abcdef0123456789abcdef01234567',
      commitCount: 2,
      commitShas: ['0123456789abcdef0123456789abcdef01234567'],
      filesChangedCount: 1,
      totalAdditions: 10,
      totalDeletions: 2,
      fileStats: [
        {
          path: 'src/index.ts',
          status: 'modified' as const,
          additions: 10,
          deletions: 2,
        },
      ],
      approvedAt: '2026-11-06T12:00:00.000Z',
    };

    const parsed = BranchSnapshotSchema.parse(fullSnapshot);
    expect(parsed.headSha).toBe('0123456789abcdef0123456789abcdef01234567');
    expect(parsed.commitCount).toBe(2);

    // Also validates branch, baseCommit, headCommit, commitCount, filesSummary, approvedAt
    const aliasSnapshot = {
      branch: 'feature/CR-101',
      baseCommit: 'origin/main',
      headCommit: 'abcdef1234567890abcdef1234567890abcdef12',
      commitCount: 1,
      filesSummary: [
        {
          path: 'src/index.ts',
          status: 'modified' as const,
          additions: 5,
          deletions: 1,
        },
      ],
      approvedAt: '2026-11-06T12:00:00.000Z',
    };
    const parsedAlias = BranchSnapshotSchema.parse(aliasSnapshot);
    expect(parsedAlias.branch).toBe('feature/CR-101');
    expect(parsedAlias.headCommit).toBe('abcdef1234567890abcdef1234567890abcdef12');
  });

  it('coordinator.commitBranchSnapshot saves branchSnapshot into artifacts and persists state to Dexie', async () => {
    let savedState: SdlcWorkflowState | undefined;
    const dummyState: SdlcWorkflowState = {
      schemaVersion: 1,
      sessionId: '11111111-1111-4111-8111-111111111111',
      projectId: '22222222-2222-4222-8222-222222222222',
      threadId: '33333333-3333-4333-8333-333333333333',
      currentStep: 'CODE_GUIDE',
      metadata: {
        cr: 'CR-101',
        featureName: 'Test',
        author: 'Dev',
        requestingUnit: 'Unit',
        date: '2026-11-06',
      },
      artifacts: {
        branchSnapshots: {},
        solution: {
          kind: 'SOLUTION',
          version: 1,
          hash: 'a'.repeat(64),
          title: 'SOLUTION.md',
          content: 'Solution content',
          sourceHashes: [],
          updatedAt: '2026-11-06T00:00:00.000Z',
        },
      },
      staleSteps: [],
      createdAt: '2026-11-06T00:00:00.000Z',
      updatedAt: '2026-11-06T00:00:00.000Z',
    };

    const coordinator = createSdlcWorkflowCoordinator({
      changeRequestId: '22222222-2222-4222-8222-222222222222',
      threadId: '33333333-3333-4333-8333-333333333333',
      loadState: async () => dummyState,
      saveState: async (s) => {
        savedState = s;
      },
    });

    const snapshot = {
      baseBranch: 'origin/main',
      targetBranch: 'feature/CR-101',
      headSha: '0123456789abcdef0123456789abcdef01234567',
      commitShas: ['0123456789abcdef0123456789abcdef01234567'],
      fileStats: [],
      totalAdditions: 0,
      totalDeletions: 0,
      approvedAt: '2026-11-06T12:00:00.000Z',
    };

    const res = await coordinator.commitBranchSnapshot(snapshot);
    expect(res.artifacts.branchSnapshot).toBeDefined();
    expect(res.artifacts.branchSnapshot?.headSha).toBe(snapshot.headSha);
    expect(savedState?.artifacts.branchSnapshot?.headSha).toBe(snapshot.headSha);
  });

  it('commitBranchSnapshot with a systemId keeps one snapshot per subsystem (D-40)', async () => {
    const dummyState: SdlcWorkflowState = {
      schemaVersion: 1,
      sessionId: '11111111-1111-4111-8111-111111111111',
      projectId: '22222222-2222-4222-8222-222222222222',
      threadId: '33333333-3333-4333-8333-333333333333',
      currentStep: 'CODE_GUIDE',
      metadata: {
        cr: 'CR-101',
        featureName: 'Test',
        author: 'Dev',
        requestingUnit: 'Unit',
        date: '2026-11-06',
      },
      artifacts: {
        branchSnapshots: {},
        solution: {
          kind: 'SOLUTION',
          version: 1,
          hash: 'a'.repeat(64),
          title: 'SOLUTION.md',
          content: 'Solution content',
          sourceHashes: [],
          updatedAt: '2026-11-06T00:00:00.000Z',
        },
      },
      staleSteps: [],
      createdAt: '2026-11-06T00:00:00.000Z',
      updatedAt: '2026-11-06T00:00:00.000Z',
    };

    const coordinator = createSdlcWorkflowCoordinator({
      changeRequestId: '22222222-2222-4222-8222-222222222222',
      threadId: '33333333-3333-4333-8333-333333333333',
      loadState: async () => dummyState,
    });

    const snapshotFor = (sha: string) => ({
      baseBranch: 'origin/main',
      targetBranch: 'feature/CR-101',
      headSha: sha,
      commitShas: [sha],
      fileStats: [],
      totalAdditions: 0,
      totalDeletions: 0,
      approvedAt: '2026-11-06T12:00:00.000Z',
    });

    const shaA = '0123456789abcdef0123456789abcdef01234567';
    const shaB = 'fedcba9876543210fedcba9876543210fedcba98';

    await coordinator.commitBranchSnapshot(snapshotFor(shaA), 'sys-a');
    const res = await coordinator.commitBranchSnapshot(snapshotFor(shaB), 'sys-b');

    expect(res.artifacts.branchSnapshots['sys-a']?.headSha).toBe(shaA);
    expect(res.artifacts.branchSnapshots['sys-b']?.headSha).toBe(shaB);
    expect(res.artifacts.branchSnapshot).toBeUndefined();
  });

  it('attempting to commit branch snapshot without approved SOLUTION throws guard error', async () => {
    const dummyStateWithoutSolution: SdlcWorkflowState = {
      schemaVersion: 1,
      sessionId: '11111111-1111-4111-8111-111111111111',
      projectId: '22222222-2222-4222-8222-222222222222',
      threadId: '33333333-3333-4333-8333-333333333333',
      currentStep: 'CODE_GUIDE',
      metadata: {
        cr: 'CR-101',
        featureName: 'Test',
        author: 'Dev',
        requestingUnit: 'Unit',
        date: '2026-11-06',
      },
      artifacts: { branchSnapshots: {} },
      staleSteps: [],
      createdAt: '2026-11-06T00:00:00.000Z',
      updatedAt: '2026-11-06T00:00:00.000Z',
    };

    const coordinator = createSdlcWorkflowCoordinator({
      changeRequestId: '22222222-2222-4222-8222-222222222222',
      threadId: '33333333-3333-4333-8333-333333333333',
      loadState: async () => dummyStateWithoutSolution,
    });

    const snapshot = {
      baseBranch: 'origin/main',
      targetBranch: 'feature/CR-101',
      headSha: '0123456789abcdef0123456789abcdef01234567',
      approvedAt: '2026-11-06T12:00:00.000Z',
    };

    await expect(coordinator.commitBranchSnapshot(snapshot)).rejects.toThrow(
      'SOLUTION_REQUIRED_FOR_CHANGE_PACK'
    );
  });
});

describe('Task 2: approval snapshot and drift handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders drift alert banner and allows re-inspect when remote HEAD changed', async () => {
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
    vi.spyOn(sshService, 'getSshSecret').mockResolvedValue('test-pass');

    vi.spyOn(gitRemoteService, 'getRemoteBranches').mockResolvedValue([
      { name: 'origin/main', isRemote: true, isHead: false },
      { name: 'feature/CR-101', isRemote: true, isHead: false },
    ]);

    vi.spyOn(gitRemoteService, 'checkDirtyStatus').mockResolvedValue({
      isClean: true,
      uncommittedFiles: [],
    });

    vi.spyOn(gitRemoteService, 'getDiffSummary').mockResolvedValue({
      baseBranch: 'origin/main',
      targetBranch: 'feature/CR-101',
      headSha: '1111111111111111111111111111111111111111',
      commits: [
        {
          sha: '1111111111111111111111111111111111111111',
          shortSha: '1111111',
          author: 'Dev',
          date: '2026-11-06',
          message: 'feat: drift commit',
        },
      ],
      files: [],
      totalAdditions: 0,
      totalDeletions: 0,
    });

    vi.spyOn(gitRemoteService, 'checkHeadDrift').mockResolvedValue({
      drifted: true,
      currentHeadSha: '2222222222222222222222222222222222222222',
    });

    const savedSnapshot = {
      baseBranch: 'origin/main',
      targetBranch: 'feature/CR-101',
      headSha: '0000000000000000000000000000000000000000',
      commitShas: ['0000000000000000000000000000000000000000'],
      fileStats: [],
      totalAdditions: 0,
      totalDeletions: 0,
      approvedAt: '2026-11-06T10:00:00.000Z',
    };

    const handleProceed = vi.fn();

    render(
      <Step3CodeGuideView
        crCode="CR-101"
        {...TARGET_PROPS}
        approvedSolutionMarkdown="# Approved Solution"
        savedSnapshot={savedSnapshot}
        onProceedToStep4={handleProceed}
      />
    );

    // Verify drift alert renders
    await waitFor(() => {
      expect(
        screen.getByText(/Remote HEAD đã thay đổi so với snapshot đã duyệt/i)
      ).toBeInTheDocument();
    });

    const reInspectBtn = screen.getByRole('button', {
      name: /Kiểm tra lại & Cập nhật snapshot/i,
    });
    expect(reInspectBtn).toBeInTheDocument();
    fireEvent.click(reInspectBtn);

    // Forward button is unlocked since snapshot exists
    const forwardBtn = screen.getByRole('button', {
      name: /Chuyển sang Bước 4: Change Pack/i,
    });
    expect(forwardBtn).toBeEnabled();
    fireEvent.click(forwardBtn);
    expect(handleProceed).toHaveBeenCalledTimes(1);
  });

  it('renders ConventionsSummaryCard above the step body', async () => {
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

    render(
      <Step3CodeGuideView
        crCode="CR-101"
        {...TARGET_PROPS}
        approvedSolutionMarkdown="# Approved Solution"
        conventionsSummary={{
          globalText: 'Global rule',
          repoText: 'Repo rule',
          sshStatus: 'connected',
        }}
        onProceedToStep4={vi.fn()}
      />
    );

    expect(await screen.findByText(/Global:/i)).toBeInTheDocument();
    expect(screen.getByText(/Repository:/i)).toBeInTheDocument();
    // The settings-backed binding is gone (D-36/D-38b): no save-binding control.
    expect(screen.queryByTestId('step3-btn-save-binding')).toBeNull();
  });
});



