import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { DiffFile } from '../../../types/agent';
import type { WorktreeDescriptor } from '../../../types/codingZone';
import type { CodingZoneMessage } from '../CodingZoneChatStrip';

const viewerProps = vi.fn();
const openPopoutMock = vi.fn();
const syncEmitterMock = vi.fn(async (_label: string, _event: string, _payload: unknown) => {});
const activityHandlers: Record<string, (event: { payload: unknown }) => void> = {};

vi.mock('../../../utils/codingZonePopout', () => ({
  openCodingZonePopout: (state: unknown) => openPopoutMock(state),
  isCodingZonePopoutOpen: async () => false,
  isTauriApp: () => false,
  CODING_ZONE_LABEL: 'coding-zone-popout',
  CODING_ZONE_HANDOFF_EVENT: 'coding-zone-handoff',
  CODING_ZONE_SYNC_EVENT: 'coding-zone-sync',
}));

vi.mock('../../../workbench/editor/RemoteFileViewer', () => ({
  RemoteFileViewer: (props: Record<string, unknown>) => {
    viewerProps(props);
    return <div data-testid="remote-file-viewer">viewer</div>;
  },
}));

import { CodingZoneModal } from '../CodingZoneModal';
import { deriveConnectionState, CONNECTION_COPY, setActivityListenerForTest } from '../CodingZoneLiveState';
import { setCodingZoneEmitterForTest } from '../../../hooks/useCodingZoneSync';

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
    openPopoutMock.mockClear();
    syncEmitterMock.mockClear();
    Object.keys(activityHandlers).forEach((key) => delete activityHandlers[key]);
    setCodingZoneEmitterForTest(syncEmitterMock);
    setActivityListenerForTest(async (event, handler) => {
      activityHandlers[event] = handler;
      return () => { delete activityHandlers[event]; };
    });
    document.documentElement.dataset.theme = 'light';
  });

  afterEach(() => {
    setCodingZoneEmitterForTest(undefined);
    setActivityListenerForTest(undefined);
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

  it('popout button opens the util with the current shared state', () => {
    const onPopout = vi.fn();
    renderModal({ onPopout });
    fireEvent.click(screen.getByTestId('cz-popout-button'));
    expect(onPopout).toHaveBeenCalledWith(expect.objectContaining({
      tabs: [], activeTabId: '__overview__',
      descriptor, connection: 'connected',
    }));
  });

  it('does not run a turn twice when a chat send event is re-delivered (WR-04)', async () => {
    const { onSend } = renderModal();
    const message = { id: 'dup-1', author: 'Bạn', time: '09:00', text: 'gửi một lần', kind: 'chat' };
    for (const revision of [10, 11]) {
      window.dispatchEvent(new MessageEvent('message', {
        origin: window.location.origin,
        data: {
          type: 'coding-zone-sync',
          payload: {
            originWindowId: 'popout', revision, kind: 'chat',
            payload: { message, intent: 'send' },
          },
        },
      }));
    }
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend).toHaveBeenCalledWith('gửi một lần');
  });

  it('closing and reordering a tab publishes tabs + activeFile sync events (WR-03)', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Tất cả' }));
    fireEvent.click(screen.getByTitle('README.md'));
    fireEvent.click(screen.getByTitle('src/AgentWorkbench.tsx'));
    syncEmitterMock.mockClear();

    fireEvent.click(screen.getByTestId('cz-tab-close-diff'));
    await waitFor(() => {
      const events = syncEmitterMock.mock.calls.map((call) => call[2] as { kind: string; payload: unknown });
      expect(events.some((event) => event.kind === 'tabs')).toBe(true);
      expect(events.some((event) => event.kind === 'activeFile')).toBe(true);
    });
  });

  it('a hunk decision publishes a newer-revision sync event', async () => {
    renderModal({
      renderDiffPanel: ({ hunkStates, setHunkState }: {
        hunkStates: Record<string, string>;
        setHunkState: (key: string, state: 'accepted') => void;
      }) => (
        <button type="button" data-testid="cz-test-accept" onClick={() => setHunkState('h1', 'accepted')}>
          {hunkStates.h1 ?? 'pending'}
        </button>
      ),
    });
    fireEvent.click(screen.getByTitle('src/AgentWorkbench.tsx'));
    fireEvent.click(screen.getByTestId('cz-test-accept'));
    await waitFor(() => {
      const events = syncEmitterMock.mock.calls.map((call) => call[2] as { revision: number; kind: string; payload: unknown });
      expect(events.some((event) => event.kind === 'hunk' && event.payload
        && typeof event.payload === 'object' && 'key' in event.payload && (event.payload as { key: string }).key === 'h1')).toBe(true);
      expect(events.at(-1)?.revision).toBeGreaterThanOrEqual(1);
    });
  });

  it('activity events render live and no sample timeline appears', async () => {
    renderModal();
    fireEvent.click(screen.getByTestId('cz-perspective-chat'));
    expect(screen.queryByTestId('cz-activity-item')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(activityHandlers['ghost-dev:stream-chunk']).toBeDefined();
      expect(activityHandlers['ghost-dev:session-finished']).toBeDefined();
    });
    act(() => {
      activityHandlers['ghost-dev:stream-chunk']?.({ payload: { type: 'tool_use', content: 'Đọc src/AgentWorkbench.tsx' } });
      activityHandlers['ghost-dev:session-finished']?.({ payload: null });
    });
    await waitFor(() => {
      const items = screen.getAllByTestId('cz-activity-item').map((item) => item.textContent);
      expect(items.some((text) => text?.includes('Đọc src/AgentWorkbench.tsx'))).toBe(true);
      expect(items.some((text) => text?.includes('Phiên Agent Developer đã kết thúc'))).toBe(true);
    });
  });

  it('derives truthful connection states with exact copy', () => {
    expect(deriveConnectionState({ sshProbeOk: true, worktreeValid: true, sessionActive: true, popoutOpen: true })).toBe('connected');
    expect(deriveConnectionState({ sshProbeOk: false, worktreeValid: true, sessionActive: true, popoutOpen: true })).toBe('disconnected');
    expect(deriveConnectionState({ sshProbeOk: true, worktreeValid: false, sessionActive: true, popoutOpen: true })).toBe('invalid-worktree');
    expect(deriveConnectionState({ sshProbeOk: true, worktreeValid: true, sessionActive: false, popoutOpen: true })).toBe('session-ended');
    expect(deriveConnectionState({ sshProbeOk: true, worktreeValid: true, sessionActive: true })).toBe('connecting');
    expect(CONNECTION_COPY.disconnected.chip).toBe('Mất kết nối');
    expect(CONNECTION_COPY['invalid-worktree'].detail).toBe('Đường dẫn worktree không hợp lệ. Kiểm tra cấu hình repository từ xa.');
    expect(CONNECTION_COPY['session-ended'].detail).toBe('Phiên Agent Developer đã kết thúc. Mở phiên mới để tiếp tục.');
  });

  it('no unconditional sync chip when SSH probe fails', () => {
    renderModal({ connection: 'disconnected' });
    const chip = screen.getByTestId('coding-zone-connection');
    expect(chip).toHaveTextContent('Mất kết nối');
    expect(chip).not.toHaveTextContent('Đồng bộ');
    expect(screen.getByTestId('cz-connection-detail')).toHaveTextContent('Không kết nối được SSH target. Kiểm tra cấu hình SSH và thử lại.');
  });
});
