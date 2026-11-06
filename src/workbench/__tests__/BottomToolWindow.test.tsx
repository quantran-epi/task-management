import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { BottomToolWindow } from '../toolwindows/BottomToolWindow';
import * as sshService from '../../services/sshService';
import { useLayoutStore } from '../store/layoutStore';
import type { SshConfig } from '../../types/ssh';

vi.mock('../toolwindows/RemoteTerminalPanel', () => ({
  RemoteTerminalPanel: ({ config }: { config?: SshConfig }) => (
    <div data-testid="mock-remote-terminal-panel">
      {config ? `Config: ${config.name}` : 'No Config'}
    </div>
  ),
}));

const mockConfigs: SshConfig[] = [
  {
    id: 'ssh-1',
    name: 'Server 1',
    host: '10.0.0.1',
    port: 22,
    username: 'root',
    authType: 'password',
    createdAt: '',
    updatedAt: '',
  },
];

describe('BottomToolWindow multi-terminal management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders No Config when no ssh configs exist in db', async () => {
    vi.spyOn(sshService, 'getSshConfigs').mockResolvedValue([]);

    render(<BottomToolWindow />);

    await waitFor(() => {
      expect(screen.getByTestId('mock-remote-terminal-panel')).toHaveTextContent('No Config');
    });
  });

  it('automatically connects terminal to saved config independently of file explorer', async () => {
    vi.spyOn(sshService, 'getSshConfigs').mockResolvedValue(mockConfigs);

    render(<BottomToolWindow />);

    await waitFor(() => {
      expect(screen.getByTestId('mock-remote-terminal-panel')).toHaveTextContent('Config: Server 1');
    });
  });

  it('toggles isBottomMaximized when maximize button is clicked', () => {
    useLayoutStore.setState({ isBottomMaximized: false });
    render(<BottomToolWindow />);

    const maximizeBtn = screen.getByRole('button', { name: /fullscreen/i });
    maximizeBtn.click();
    expect(useLayoutStore.getState().isBottomMaximized).toBe(true);

    maximizeBtn.click();
    expect(useLayoutStore.getState().isBottomMaximized).toBe(false);
  });

  it('supports adding and closing multiple terminal tabs with confirmation', async () => {
    render(<BottomToolWindow />);

    expect(screen.getByText('Terminal 1')).toBeInTheDocument();

    // Click "+" button to add a new tab
    const addBtn = screen.getByTestId('new-terminal-tab-btn');
    act(() => {
      fireEvent.click(addBtn);
    });

    expect(screen.getByText('Terminal 2')).toBeInTheDocument();

    // Close button has Popconfirm
    const closeTabBtn = screen.getByTestId('close-tab-term-1');
    act(() => {
      fireEvent.click(closeTabBtn);
    });

    // Popconfirm should prompt
    expect(screen.getByText('Đóng terminal này?')).toBeInTheDocument();

    // Confirm close
    const confirmBtn = screen.getByRole('button', { name: 'Đóng' });
    act(() => {
      fireEvent.click(confirmBtn);
    });

    expect(screen.queryByText('Terminal 1')).not.toBeInTheDocument();
    expect(screen.getByText('Terminal 2')).toBeInTheDocument();
  });

  it('hides/minimizes bottom panel when closing the last terminal tab', async () => {
    useLayoutStore.setState({ bottomActiveId: 'terminal' });
    render(<BottomToolWindow />);

    expect(screen.getByText('Terminal 1')).toBeInTheDocument();

    const closeTabBtn = screen.getByTestId('close-tab-term-1');
    act(() => {
      fireEvent.click(closeTabBtn);
    });

    const confirmBtn = screen.getByRole('button', { name: 'Đóng' });
    act(() => {
      fireEvent.click(confirmBtn);
    });

    // When last tab is closed, bottom panel is minimized (bottomActiveId becomes null)
    expect(useLayoutStore.getState().bottomActiveId).toBeNull();
    expect(screen.queryByText('Terminal 1')).not.toBeInTheDocument();

    // When bottom panel reopens, it automatically creates a fresh Terminal 1
    act(() => {
      useLayoutStore.setState({ bottomActiveId: 'terminal' });
    });

    expect(screen.getByText('Terminal 1')).toBeInTheDocument();
  });
});
