import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Step3CodeGuideView } from '../Step3CodeGuideView';
import * as sshService from '../../../../services/sshService';
import * as gitRemoteService from '../../../../services/gitRemoteService';
import type { System } from '../../../../types/models';

/**
 * Plan 31.2-16 Task 2 — D-38b.
 *
 * Step 3 resolves its branch from the CR target and never guesses it from a branch name.
 * When the target has no `featureBranch`, it shows a picker and writes the user's choice back.
 */
const SYSTEM: System = {
  id: 's1',
  name: 'Card Authorization API',
  code: 'SC-AUTH-API',
  parentId: null,
  type: 'SERVICE',
  sshConfigId: 'ssh-1',
  remoteRepoPath: '/home/dev/repo',
  defaultBaseBranch: 'origin/develop',
  createdAt: '2026-11-06T00:00:00Z',
  updatedAt: '2026-11-06T00:00:00Z',
};

const SSH_CONFIG = {
  id: 'ssh-1',
  name: 'Dev WSL',
  host: '127.0.0.1',
  port: 2222,
  username: 'dev',
  authType: 'password' as const,
  createdAt: '2026-11-06T00:00:00Z',
  updatedAt: '2026-11-06T00:00:00Z',
};

const BRANCHES = [
  { name: 'origin/develop', isRemote: true, isHead: false },
  { name: 'origin/main', isRemote: true, isHead: false },
  { name: 'feature/CR-5', isRemote: true, isHead: false },
];

const stubRemote = () => {
  vi.spyOn(sshService, 'getSshConfigs').mockResolvedValue([SSH_CONFIG]);
  vi.spyOn(sshService, 'getSshSecret').mockResolvedValue('test-pass');
  vi.spyOn(gitRemoteService, 'getRemoteBranches').mockResolvedValue(BRANCHES);
  vi.spyOn(gitRemoteService, 'checkDirtyStatus').mockResolvedValue({
    isClean: true,
    uncommittedFiles: [],
  });
  const diffSpy = vi.spyOn(gitRemoteService, 'getDiffSummary').mockResolvedValue({
    baseBranch: 'origin/develop',
    targetBranch: 'feature/CR-5',
    headSha: 'abc1234567890',
    commits: [
      { sha: 'abc1234567890', shortSha: 'abc1234', author: 'Dev', date: '2026-11-06', message: 'feat: work' },
    ],
    files: [],
    totalAdditions: 0,
    totalDeletions: 0,
  });
  vi.spyOn(gitRemoteService, 'getFileDiff').mockResolvedValue('');
  return diffSpy;
};

const renderStep3 = (props: Partial<React.ComponentProps<typeof Step3CodeGuideView>> = {}) =>
  render(
    <Step3CodeGuideView
      crCode="CR-5"
      targetSystems={[SYSTEM]}
      crTargets={[{ systemId: 's1', featureBranch: 'feature/CR-5' }]}
      selectedSystemId="s1"
      approvedSolutionMarkdown="# Approved Solution"
      onProceedToStep4={vi.fn()}
      {...props}
    />
  );

describe('Step3CodeGuideView branch resolution from the CR target (D-38b)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('targets the featureBranch stored on the selected CR target', async () => {
    const diffSpy = stubRemote();
    renderStep3();

    await waitFor(() => {
      expect(diffSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'ssh-1' }),
        '/home/dev/repo',
        'origin/develop',
        'feature/CR-5',
        'test-pass'
      );
    });
  });

  it('takes baseBranch from the system defaultBaseBranch', async () => {
    const diffSpy = stubRemote();
    renderStep3();

    await waitFor(() => {
      expect(diffSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'origin/develop',
        expect.anything(),
        expect.anything()
      );
    });
  });

  it('falls back to origin/main when the system has no defaultBaseBranch', async () => {
    const diffSpy = stubRemote();
    const { defaultBaseBranch: _dropped, ...noBase } = SYSTEM;
    renderStep3({ targetSystems: [noBase as System] });

    await waitFor(() => {
      expect(diffSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'origin/main',
        'feature/CR-5',
        expect.anything()
      );
    });
  });

  it('shows a branch picker with no preselection when the target has no featureBranch', async () => {
    stubRemote();
    renderStep3({ crTargets: [{ systemId: 's1' }] });

    const picker = await screen.findByTestId('step3-branch-picker');
    expect(picker).toBeInTheDocument();
    // No auto-selection: the confirm action stays disabled until the user picks.
    expect(screen.getByRole('button', { name: /Xác nhận nhánh/i })).toBeDisabled();
  });

  it('writes the confirmed branch back to the CR target', async () => {
    stubRemote();
    const onFeatureBranchChange = vi.fn();
    renderStep3({ crTargets: [{ systemId: 's1' }], onFeatureBranchChange });

    const picker = await screen.findByTestId('step3-branch-picker');
    fireEvent.mouseDown(picker);
    fireEvent.click(await screen.findByText('feature/CR-5'));
    fireEvent.click(screen.getByRole('button', { name: /Xác nhận nhánh/i }));

    await waitFor(() => {
      expect(onFeatureBranchChange).toHaveBeenCalledWith('s1', 'feature/CR-5');
    });
  });

  it('does not render the picker once the target already has a branch', async () => {
    stubRemote();
    renderStep3();

    await waitFor(() => expect(screen.getByText('feature/CR-5')).toBeInTheDocument());
    expect(screen.queryByTestId('step3-branch-picker')).toBeNull();
  });
});
