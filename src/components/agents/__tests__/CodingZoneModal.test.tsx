import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { DiffFile } from '../../../types/agent';
import type { WorktreeDescriptor } from '../../../types/codingZone';
import type { CodingZoneMessage } from '../CodingZoneChatStrip';

const viewerProps = vi.fn();

vi.mock('../../../workbench/editor/RemoteFileViewer', () => ({
  RemoteFileViewer: (props: Record<string, unknown>) => {
    viewerProps(props);
    return <div data-testid="remote-file-viewer">viewer</div>;
  },
}));

import { CodingZoneModal } from '../CodingZoneModal';

const descriptor: WorktreeDescriptor = {
  sshConfigId: 'ssh-1',
  remoteRepoPath: '/srv/repo',
  remoteWorktreePath: '/srv/repo/.taskmate-worktrees/agent-developer-a1',
  branch: 'taskmate/agent-developer-a1',
};

const diffFile: DiffFile = {
  oldPath: 'src/AgentWorkbench.tsx',
  newPath: 'src/AgentWorkbench.tsx',
  status: 'modified',
  additions: 4,
  deletions: 2,
  hunks: [],
};

const messages: CodingZoneMessage[] = [
  { id: 'm1', author: 'Bạn', time: '09:00', text: 'Mở coding zone', kind: 'chat' },
  { id: 'm2', author: 'Agent Developer', time: '09:01', text: 'Đã đọc worktree', kind: 'agent' },
];

function renderModal(overrides: Record<string, unknown> = {}) {
  const onSend = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <CodingZoneModal
      descriptor={descriptor}
      sshConfig={undefined}
      messages={messages}
      connection="connected"
      allFiles={['src/AgentWorkbench.tsx', 'README.md', 'src/utils/compactFileTree.ts']}
      diffFiles={[diffFile]}
      onClose={onClose}
      onSendMessage={onSend}
      {...overrides}
    />
  );
  return { ...view, onSend, onClose };
}

describe('CodingZoneModal shell', () => {
  beforeEach(() => {
    viewerProps.mockClear();
    document.documentElement.dataset.theme = 'light';
  });

  it('renders both perspectives and switches layout without losing shared state', () => {
    renderModal();
    expect(screen.getByTestId('cz-perspective-code')).toBeInTheDocument();
    expect(screen.getByTestId('cz-perspective-chat')).toBeInTheDocument();
    expect(screen.getByTestId('cz-modal-body').className).toContain('cz-perspective-code');
    fireEvent.click(screen.getByTitle('src/AgentWorkbench.tsx'));
    expect(screen.getByTestId('cz-tab-diff')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('cz-perspective-chat'));
    expect(screen.getByTestId('cz-modal-body').className).toContain('cz-perspective-chat');
    expect(screen.getByTestId('cz-activity-pane').textContent).toContain('src/AgentWorkbench.tsx');
    fireEvent.click(screen.getByTestId('cz-perspective-code'));
    expect(screen.getByTestId('cz-tab-diff')).toBeInTheDocument();
  });

  it('viewer parity props reach RemoteFileViewer from the active worktree file', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Tất cả' }));
    fireEvent.click(screen.getByTitle('README.md'));
    await waitFor(() => {
      const last = viewerProps.mock.calls.at(-1)?.[0] as Record<string, unknown> | undefined;
      expect(last).toMatchObject({
        repoPath: descriptor.remoteWorktreePath,
        branch: descriptor.branch,
        filePath: 'README.md',
      });
      expect(last).not.toHaveProperty('config');
    });
  });

  it('pinned overview tab has no close; closing active tab falls to neighbor', () => {
    renderModal();
    expect(screen.getByTestId('cz-tab-overview').querySelector('button')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tất cả' }));
    fireEvent.click(screen.getByTitle('README.md'));
    fireEvent.click(screen.getByTitle('src/AgentWorkbench.tsx'));
    expect(screen.getByTestId('cz-tab-code')).toBeInTheDocument();
    expect(screen.getByTestId('cz-tab-diff')).toBeInTheDocument();
    const diffTab = screen.getByTestId('cz-tab-diff');
    fireEvent.click(diffTab);
    expect(diffTab).toHaveClass('active');
    fireEvent.click(screen.getByTestId('cz-tab-close-diff'));
    expect(screen.queryByTestId('cz-tab-diff')).not.toBeInTheDocument();
    expect(screen.getByTestId('cz-tab-code')).toHaveClass('active');
  });

  it('tree search filters and diff scope hides unchanged files', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Tất cả' }));
    const search = screen.getByTestId('coding-zone-tree-search');
    fireEvent.change(search, { target: { value: 'compact' } });
    expect(screen.getAllByTestId('coding-zone-tree-row').some((row) => row.textContent?.includes('compactFileTree.ts'))).toBe(true);
    expect(screen.getAllByTestId('coding-zone-tree-row').some((row) => row.textContent?.includes('README.md'))).toBe(false);
    fireEvent.change(search, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tất cả' }));
    expect(screen.getAllByTestId('coding-zone-tree-row').some((row) => row.textContent?.includes('README.md'))).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Diff' }));
    expect(screen.getAllByTestId('coding-zone-tree-row').some((row) => row.textContent?.includes('README.md'))).toBe(false);
    expect(screen.getByTestId('cz-status-M')).toHaveTextContent('M');
    expect(screen.getByText('+4')).toBeInTheDocument();
  });

  it('chat composer sends on Enter without Shift and preserves Shift+Enter', () => {
    const { onSend } = renderModal();
    const composer = screen.getByTestId('coding-zone-composer');
    expect(composer).toHaveAttribute('placeholder', 'Gõ tin từ Coding Zone...');
    fireEvent.change(composer, { target: { value: 'tin mới' } });
    fireEvent.keyDown(composer, { key: 'Enter', shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(composer, { key: 'Enter' });
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith('tin mới');
    expect(composer).toHaveValue('');
  });

  it('uses Vietnamese copy only and no draft sample-data strings', () => {
    const { container } = renderModal();
    const text = container.textContent ?? '';
    expect(text).not.toContain('DỮ LIỆU MẪU');
    expect(text).not.toContain('sample');
    expect(text).not.toContain('DỮ LIỆU MẪU / SAMPLE DATA');
    expect(text).toContain('Agent Developer Workbench');
    expect(text).toContain('Chọn file trong cây worktree để mở tab.');
  });

  it('Escape closes the modal', () => {
    const { onClose } = renderModal();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
