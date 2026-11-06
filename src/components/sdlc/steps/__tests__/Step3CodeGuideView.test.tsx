import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RemoteDiffViewer } from '../../diff/RemoteDiffViewer';
import { Step3CodeGuideView } from '../Step3CodeGuideView';
import * as sshService from '../../../../services/sshService';
import * as gitRemoteService from '../../../../services/gitRemoteService';

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

describe('RemoteDiffViewer Component', () => {
  it('renders diff with file path and additions/deletions stats', () => {
    render(
      <RemoteDiffViewer
        rawDiff={SAMPLE_RAW_DIFF}
        filePath="src/index.ts"
      />
    );

    expect(screen.getByText('src/index.ts')).toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.getByText('−1')).toBeInTheDocument();
    expect(screen.getByText("const newConst = 2;")).toBeInTheDocument();
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

    fireEvent.click(loadAllBtn);
    expect(
      screen.queryByText(/Đã tự động giới hạn hiển thị 5\.000 dòng để đảm bảo hiệu năng giao diện\./i)
    ).not.toBeInTheDocument();
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

    vi.spyOn(gitRemoteService, 'getProjectRepoSshBinding').mockResolvedValue({
      sshConfigId: 'ssh-1',
      remoteRepoPath: '/home/dev/repo',
      defaultBaseBranch: 'origin/main',
      updatedAt: '2026-11-06T00:00:00Z',
    });

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
        projectId="proj-1"
        crCode="CR-101"
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

    vi.spyOn(gitRemoteService, 'getProjectRepoSshBinding').mockResolvedValue({
      sshConfigId: 'ssh-1',
      remoteRepoPath: '/home/dev/repo',
      defaultBaseBranch: 'origin/main',
      updatedAt: '2026-11-06T00:00:00Z',
    });

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
        projectId="proj-1"
        crCode="CR-101"
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
      expect(screen.getByText('line for src/fileB.ts')).toBeInTheDocument();
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

