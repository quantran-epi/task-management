import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { RemoteTerminalPanel } from '../toolwindows/RemoteTerminalPanel';
import * as sshPtyService from '../../services/sshPtyService';
import * as diagramSaveBridge from '../../services/diagramSaveBridge';
import type { SshConfig } from '../../types/ssh';

// Mock @xterm/xterm and addon-fit with vi.hoisted
const { mockOnDataDisposable, state } = vi.hoisted(() => {
  const mockOnDataDisposable = { dispose: vi.fn() };
  const state = { lastTerminalInstance: null as any };
  return { mockOnDataDisposable, state };
});

vi.mock('@xterm/xterm', () => {
  return {
    Terminal: class MockTerminal {
      cols = 80;
      rows = 24;
      _onDataCallback: ((data: string) => void) | null = null;
      open = vi.fn();
      write = vi.fn();
      clear = vi.fn();
      dispose = vi.fn();
      loadAddon = vi.fn();
      onData = vi.fn((cb) => {
        this._onDataCallback = cb;
        return mockOnDataDisposable;
      });

      constructor() {
        state.lastTerminalInstance = this;
      }
    },
  };
});

vi.mock('@xterm/addon-fit', () => {
  return {
    FitAddon: class MockFitAddon {
      fit = vi.fn();
    },
  };
});

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as any;

const mockConfig: SshConfig = {
  id: 'ssh-test-1',
  name: 'Test Server',
  host: '10.0.0.1',
  port: 22,
  username: 'ubuntu',
  authType: 'key_file',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('RemoteTerminalPanel Component (SDLC-REPO-EXP-04 & SDLC-REPO-EXP-05)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.lastTerminalInstance = null;
    vi.spyOn(sshPtyService, 'startPtySession').mockResolvedValue('test-session-id');
    vi.spyOn(sshPtyService, 'writePtyInput').mockResolvedValue();
    vi.spyOn(sshPtyService, 'resizePty').mockResolvedValue();
    vi.spyOn(sshPtyService, 'closePtySession').mockResolvedValue();
    vi.spyOn(sshPtyService, 'subscribePtyData').mockResolvedValue(vi.fn());
    vi.spyOn(sshPtyService, 'subscribePtyExit').mockResolvedValue(vi.fn());
  });

  it('mounts xterm container and connects PTY session when config is provided', async () => {
    render(
      <RemoteTerminalPanel
        config={mockConfig}
        repoPath="/var/www/my-project"
      />
    );

    expect(screen.getByTestId('remote-terminal-panel')).toBeInTheDocument();
    expect(screen.getByTestId('xterm-container')).toBeInTheDocument();

    await waitFor(() => {
      expect(sshPtyService.startPtySession).toHaveBeenCalledWith(
        expect.objectContaining({
          config: mockConfig,
          cols: 80,
          rows: 24,
        })
      );
    });

    expect(state.lastTerminalInstance).not.toBeNull();
    expect(state.lastTerminalInstance.open).toHaveBeenCalled();
  });

  it('renders disconnected message when no ssh config is passed', async () => {
    render(<RemoteTerminalPanel />);

    expect(screen.getByText('Disconnected')).toBeInTheDocument();

    await waitFor(() => {
      expect(state.lastTerminalInstance).not.toBeNull();
      expect(state.lastTerminalInstance.write).toHaveBeenCalledWith(
        expect.stringContaining('No remote SSH host selected')
      );
    });
    expect(sshPtyService.startPtySession).not.toHaveBeenCalled();
  });

  it('pipes terminal keystrokes to writePtyInput', async () => {
    render(
      <RemoteTerminalPanel
        config={mockConfig}
        repoPath="/home/ubuntu/repo"
      />
    );

    await waitFor(() => {
      expect(sshPtyService.startPtySession).toHaveBeenCalled();
    });

    // Simulate keystroke trigger
    expect(state.lastTerminalInstance.onData).toHaveBeenCalled();
    const onDataCb = state.lastTerminalInstance._onDataCallback;
    expect(onDataCb).toBeTypeOf('function');

    onDataCb('ls -la\r');
    expect(sshPtyService.writePtyInput).toHaveBeenCalledWith(
      expect.stringMatching(/^term-/),
      'ls -la\r'
    );
  });

  it('extracts diagrams from terminal buffer and saves to Diagram Studio', async () => {
    let ptyDataCb: ((data: string) => void) | null = null;
    vi.spyOn(sshPtyService, 'subscribePtyData').mockImplementation(async (_, cb) => {
      ptyDataCb = cb;
      return () => {};
    });

    const saveSpy = vi.spyOn(diagramSaveBridge, 'saveDiagramToStudio').mockResolvedValue({
      id: 'note-mermaid-1',
      type: 'diagram',
      title: 'Terminal Diagram 1',
      body: 'graph TD\n A-->B',
      tags: ['diagram'],
      isPinned: false,
      createdAt: '',
      updatedAt: '',
    });
    const openSpy = vi.spyOn(diagramSaveBridge, 'openDiagramInStudio').mockImplementation(() => {});

    render(
      <RemoteTerminalPanel
        config={mockConfig}
        repoPath="/home/ubuntu/repo"
      />
    );

    await waitFor(() => {
      expect(ptyDataCb).not.toBeNull();
    });

    // Simulate backend sending Claude Code Mermaid output
    const mermaidStream = '\r\n```mermaid\r\ngraph TD\r\n  A[Start] --> B[Finish]\r\n```\r\n';
    ptyDataCb!(mermaidStream);

    const extractBtn = screen.getByTestId('extract-diagrams-btn');
    fireEvent.click(extractBtn);

    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalled();
    });
    const callArgs = saveSpy.mock.calls[0];
    expect(callArgs).toBeDefined();
    expect(callArgs?.[0]).toContain('Terminal Diagram 1');
    expect(callArgs?.[1]).toBe('graph TD\n  A[Start] --> B[Finish]');
    expect(callArgs?.[2]).toEqual(['terminal', 'claude-code']);
    expect(openSpy).toHaveBeenCalledWith('note-mermaid-1');
  });

  it('aborts orphaned pty session on unmount or re-render', async () => {
    const { unmount } = render(
      <RemoteTerminalPanel
        config={mockConfig}
        repoPath="/var/www/my-project"
      />
    );

    await waitFor(() => {
      expect(sshPtyService.startPtySession).toHaveBeenCalled();
    });

    unmount();

    expect(sshPtyService.closePtySession).toHaveBeenCalled();
  });
});
