import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { DiffFile } from '../../../types/agent';
import type { WorktreeDescriptor } from '../../../types/codingZone';

const applyHunk = vi.fn(async (_desc: WorktreeDescriptor, _path: string, _h: unknown) => {});
const revertHunk = vi.fn(async (_desc: WorktreeDescriptor, _path: string, _h: unknown) => {});
vi.mock('../../../services/sshWorktreeService', () => ({
  applyHunk: (desc: WorktreeDescriptor, path: string, h: typeof hunk) => applyHunk(desc, path, h),
  revertHunk: (desc: WorktreeDescriptor, path: string, h: typeof hunk) => revertHunk(desc, path, h),
}));

import { CodingZoneDiffPanel, COPY, hunkContentHash, hasActiveAgentDeveloperSession } from '../CodingZoneDiffPanel';
import { CodingZoneTrigger } from '../office/CodingZoneTrigger';

const descriptor: WorktreeDescriptor = {
  sshConfigId: 'ssh-1',
  remoteRepoPath: '/srv/repo',
  remoteWorktreePath: '/srv/repo/.taskmate-worktrees/agent-developer-a1',
  branch: 'taskmate/agent-developer-a1',
};

const hunk = {
  oldStart: 1, oldCount: 1, newStart: 1, newCount: 2, header: '@@ -1 +1,2 @@',
  lines: [
    { type: 'delete' as const, oldLineNumber: 1, content: 'old' },
    { type: 'add' as const, newLineNumber: 1, content: 'new' },
    { type: 'add' as const, newLineNumber: 2, content: 'extra' },
  ],
};
const hunkDiff: DiffFile = {
  oldPath: 'src/AgentWorkbench.tsx', newPath: 'src/AgentWorkbench.tsx', status: 'modified',
  hunks: [hunk], additions: 2, deletions: 1,
};
const key = `src/AgentWorkbench.tsx::${hunk.header}::${hunkContentHash(hunk)}::1`;

function renderDiff(overrides: Partial<React.ComponentProps<typeof CodingZoneDiffPanel>> = {}) {
  const setHunkState = vi.fn();
  const view = render(
    <CodingZoneDiffPanel
      descriptor={descriptor}
      filePath="src/AgentWorkbench.tsx"
      files={[hunkDiff]}
      revision={1}
      hunkStates={{}}
      setHunkState={setHunkState}
      {...overrides}
    />
  );
  return { ...view, setHunkState };
}

describe('CodingZoneDiffPanel', () => {
  beforeEach(() => {
    applyHunk.mockClear();
    revertHunk.mockClear();
  });

  it('accept calls confined applyHunk and reject calls revertHunk; counters count pending only', async () => {
    const { setHunkState } = renderDiff();
    expect(screen.getByTestId('cz-diff-counters')).toHaveTextContent('+2');
    expect(screen.getByTestId('cz-diff-counters')).toHaveTextContent('−1');
    fireEvent.click(screen.getByTestId('cz-hunk-accept'));
    await waitFor(() => {
      expect(applyHunk).toHaveBeenCalledWith(descriptor, 'src/AgentWorkbench.tsx', hunk);
      expect(setHunkState).toHaveBeenCalledWith(key, 'accepted');
    });
    fireEvent.click(screen.getByTestId('cz-hunk-reject'));
    await waitFor(() => expect(revertHunk).toHaveBeenCalledWith(descriptor, 'src/AgentWorkbench.tsx', hunk));
  });

  it('clicking same decision toggles back to pending without a verb', () => {
    const { setHunkState } = renderDiff({ hunkStates: { [key]: 'accepted' } });
    expect(screen.getByTestId('cz-hunk-tag')).toHaveTextContent(COPY.accepted);
    expect(screen.getByTestId('cz-diff-counters')).toHaveTextContent('+0');
    fireEvent.click(screen.getByTestId('cz-hunk-accept'));
    expect(setHunkState).toHaveBeenCalledWith(key, 'pending');
    expect(applyHunk).not.toHaveBeenCalled();
  });

  it('failed apply surfaces fixed copy and retains state', async () => {
    applyHunk.mockRejectedValueOnce(new Error('boom'));
    const { setHunkState } = renderDiff();
    fireEvent.click(screen.getByTestId('cz-hunk-accept'));
    await waitFor(() => {
      expect(screen.getByTestId('cz-diff-error')).toHaveTextContent(COPY.failed);
      expect(setHunkState).not.toHaveBeenCalled();
    });
  });

  it('stale revision surfaces exact conflict copy after a later refresh', async () => {
    const view = renderDiff();
    expect(screen.queryByTestId('cz-diff-stale')).not.toBeInTheDocument();
    view.rerender(
      <CodingZoneDiffPanel
        descriptor={descriptor}
        filePath="src/AgentWorkbench.tsx"
        files={[hunkDiff]}
        revision={2}
        hunkStates={{}}
        setHunkState={view.setHunkState}
      />
    );
    expect(screen.getByTestId('cz-diff-stale')).toHaveTextContent(COPY.stale);
  });

  it('bulk revert confirmation copy is worktree-local; bulk disabled when all decided', async () => {
    const { setHunkState } = renderDiff({ hunkStates: { [key]: 'accepted' } });
    expect(screen.getByTestId('cz-accept-all')).toBeDisabled();
    expect(screen.getByTestId('cz-revert-all')).toBeEnabled();
    fireEvent.click(screen.getByTestId('cz-revert-all'));
    expect((await screen.findAllByText(COPY.confirmTitle)).length).toBeGreaterThan(0);
    expect(screen.getByText(COPY.confirmBody)).toHaveTextContent('không đụng nhánh hiện tại');
    fireEvent.click(screen.getByRole('button', { name: COPY.confirmOk }));
    await waitFor(() => expect(revertHunk).toHaveBeenCalledWith(descriptor, 'src/AgentWorkbench.tsx', hunk));
    expect(setHunkState).toHaveBeenCalledWith(key, 'rejected');
  });

  it('renders no merge/PR copy and supports side-by-side', () => {
    const { container } = renderDiff();
    expect(container.textContent ?? '').not.toMatch(/merge|pull request/i);
    fireEvent.click(screen.getByTestId('cz-diff-split'));
    expect(screen.getAllByTestId('cz-split-line').length).toBeGreaterThan(0);
  });
});

describe('CodingZoneTrigger', () => {
  it('visible only with active Agent Developer session', () => {
    const { rerender } = render(
      <CodingZoneTrigger active={false} descriptor={descriptor} sshConfig={undefined} messages={[]} connection="connected" onSendMessage={() => {}} />
    );
    expect(screen.queryByTestId('coding-zone-trigger')).not.toBeInTheDocument();
    rerender(
      <CodingZoneTrigger active descriptor={descriptor} sshConfig={undefined} messages={[]} connection="connected" onSendMessage={() => {}} />
    );
    expect(screen.getByTestId('coding-zone-trigger')).toHaveTextContent('Mở Coding Zone');
    fireEvent.click(screen.getByTestId('coding-zone-trigger'));
    expect(screen.getByTestId('coding-zone-modal')).toBeInTheDocument();
  });

  it('derives active session from live roster and status', () => {
    const roster = [{ id: 'dev-1', name: 'Agent Developer' }, { id: 'lead-1', name: 'Lead' }];
    expect(hasActiveAgentDeveloperSession([{ agentId: 'dev-1', status: 'running' }], roster)).toBe(true);
    expect(hasActiveAgentDeveloperSession([{ agentId: 'dev-1', status: 'done' }], roster)).toBe(false);
    expect(hasActiveAgentDeveloperSession([{ agentId: 'lead-1', status: 'running' }], roster)).toBe(false);
  });
});
