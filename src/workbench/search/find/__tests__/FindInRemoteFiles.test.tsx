import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { FindInRemoteFiles } from '../FindInRemoteFiles';
import { useLayoutStore } from '../../../store/layoutStore';
import { useFindStore } from '../store';
import { FIND_DEBOUNCE_MS } from '../session';

const grepRemoteRef = vi.fn();
const getSshConfigById = vi.fn();
const getSshSecret = vi.fn();
const cancelToolCall = vi.fn();
const searchRemoteTree = vi.fn();

vi.mock('../../../../services/gitRemoteService', () => ({
  grepRemoteRef: (...args: unknown[]) => grepRemoteRef(...args),
}));
vi.mock('../../../../services/gitRemoteTreeService', () => ({
  searchRemoteTree: (...args: unknown[]) => searchRemoteTree(...args),
  getRemoteFileContent: vi.fn(async () => 'line one\nneedle here\nline three'),
  confineRepoPath: (p: string) => p,
}));
vi.mock('../../../../services/sshService', () => ({
  getSshConfigById: (...args: unknown[]) => getSshConfigById(...args),
  getSshSecret: (...args: unknown[]) => getSshSecret(...args),
  cancelToolCall: (...args: unknown[]) => cancelToolCall(...args),
}));

const CONFIG = {
  id: 'cfg-1',
  name: 'dev',
  host: 'example.com',
  port: 22,
  username: 'dev',
  authType: 'agent',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
} as const;

function seedStore() {
  useLayoutStore.setState({
    activeRemoteConfigId: CONFIG.id,
    activeRemoteRepoPath: '/srv/repo',
    activeRemoteBranch: 'main',
  });
}

describe('FindInRemoteFiles — entry, seed, modes, debounce and Enter (Task 1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedStore();
    useFindStore.getState().openFind({
      configId: CONFIG.id,
      repoPath: '/srv/repo',
      branch: 'main',
    });
    getSshConfigById.mockResolvedValue(CONFIG);
    getSshSecret.mockResolvedValue('secret');
    cancelToolCall.mockResolvedValue(true);
    grepRemoteRef.mockResolvedValue({ hits: [], truncated: false });
    searchRemoteTree.mockResolvedValue([]);
  });

  it('renders pattern input, three modes, two scopes, mask and three toggles; no OpenIdea tabs', () => {
    render(<FindInRemoteFiles />);

    expect(screen.getByLabelText('Pattern')).toBeDefined();
    for (const tab of ['Content', 'Files', 'Folders']) {
      expect(screen.getByRole('tab', { name: tab })).toBeDefined();
    }
    for (const tab of ['Whole ref', 'Directory']) {
      expect(screen.getByRole('tab', { name: tab })).toBeDefined();
    }
    expect(screen.getByRole('textbox', { name: 'File mask' })).toBeDefined();
    for (const toggle of ['Match Case', 'Words', 'Regex']) {
      expect(screen.getByRole('checkbox', { name: toggle })).toBeDefined();
    }
    expect(screen.queryByRole('tab', { name: 'Module' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Scope' })).toBeNull();
  });

  it('seeds from layoutStore active remote config / repo / branch', () => {
    render(<FindInRemoteFiles />);

    expect(screen.getByTestId('find-seed-config')).toHaveTextContent(CONFIG.id);
    expect(screen.getByTestId('find-seed-repo')).toHaveTextContent('/srv/repo');
    expect(screen.getByTestId('find-seed-branch')).toHaveTextContent('main');
  });

  it('debounces 150 ms, calls session.search with an untransformed RemoteQuery; deps.start calls grepRemoteRef with limit 2000', async () => {
    vi.useFakeTimers();
    try {
      grepRemoteRef.mockResolvedValue({
        hits: [{ path: 'src/a.ts', line: 3, text: 'needle here' }],
        truncated: false,
      });
      render(<FindInRemoteFiles />);
      fireEvent.change(screen.getByLabelText('Pattern'), { target: { value: 'needle' } });
      expect(grepRemoteRef).not.toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(FIND_DEBOUNCE_MS);
        await Promise.resolve();
      });

      expect(grepRemoteRef).toHaveBeenCalledTimes(1);
      const [, repo, ref, options, secret, callId] = grepRemoteRef.mock.calls[0]! as any[];
      expect(repo).toBe('/srv/repo');
      expect(ref).toBe('main');
      expect(options).toMatchObject({ pattern: 'needle', literal: true, limit: 2000 });
      expect(secret).toBe('secret');
      expect(typeof callId).toBe('string');
    } finally {
      vi.useRealTimers();
    }
  });

  it('Enter on the first result row opens a readonly remote tab with one-shot initialLine', async () => {
    vi.useFakeTimers();
    try {
      const openTab = vi.fn();
      useLayoutStore.setState({ openTab });
      grepRemoteRef.mockResolvedValue({
        hits: [{ path: 'src/a.ts', line: 42, text: 'needle here' }],
        truncated: false,
      });
      render(<FindInRemoteFiles />);
      fireEvent.change(screen.getByLabelText('Pattern'), { target: { value: 'needle' } });
      await act(async () => {
        vi.advanceTimersByTime(FIND_DEBOUNCE_MS);
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(screen.getByTestId('find-result-row-0')).toBeDefined();

      fireEvent.keyDown(screen.getByLabelText('Pattern'), { key: 'Enter' });

      expect(openTab).toHaveBeenCalledTimes(1);
      const tab = openTab.mock.calls[0]![0] as any;
      expect(tab.viewType).toBe('remote_file');
      expect(tab.params.filePath).toBe('src/a.ts');
      expect(tab.params.initialLine).toBe(42);
    } finally {
      vi.useRealTimers();
    }
  });

  it('Shift+Enter opens a second tab with a distinct id', async () => {
    vi.useFakeTimers();
    try {
      const openTab = vi.fn();
      useLayoutStore.setState({ openTab });
      grepRemoteRef.mockResolvedValue({
        hits: [{ path: 'src/a.ts', line: 42, text: 'needle here' }],
        truncated: false,
      });
      render(<FindInRemoteFiles />);
      fireEvent.change(screen.getByLabelText('Pattern'), { target: { value: 'needle' } });
      await act(async () => {
        vi.advanceTimersByTime(FIND_DEBOUNCE_MS);
        await Promise.resolve();
        await Promise.resolve();
      });
      fireEvent.keyDown(screen.getByLabelText('Pattern'), { key: 'Enter', shiftKey: true });

      expect(openTab).toHaveBeenCalledTimes(1);
      const tab = openTab.mock.calls[0]![0] as any;
      expect(tab.id).not.toBe('remote:src/a.ts');
      expect(tab.params.initialLine).toBe(42);
    } finally {
      vi.useRealTimers();
    }
  });

  it('Esc closes when not pinned', () => {
    render(<FindInRemoteFiles />);
    const root = screen.getByLabelText('Pattern').closest('.find-root')!;

    fireEvent.keyDown(root, { key: 'Escape' });
    expect(useFindStore.getState().open).toBe(false);
  });

  it('Esc does not close when pinned', () => {
    useFindStore.getState().togglePinned();
    render(<FindInRemoteFiles />);
    const root = screen.getByLabelText('Pattern').closest('.find-root')!;

    fireEvent.keyDown(root, { key: 'Escape' });
    expect(useFindStore.getState().open).toBe(true);
    expect(useFindStore.getState().pinned).toBe(true);
  });

  it('icon-only buttons expose aria-label + tooltip and are focusable', () => {
    render(<FindInRemoteFiles />);
    const close = screen.getByRole('button', { name: /close/i });
    expect(close).toBeDefined();
    expect(close.getAttribute('aria-label')).toBeTruthy();
    close.focus();
    expect(document.activeElement).toBe(close);
  });
});
