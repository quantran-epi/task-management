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
let previewImpl: (...args: unknown[]) => Promise<string> = async () => 'line one\nneedle here\nline three';

vi.mock('../../../../services/gitRemoteService', () => ({
  grepRemoteRef: (...args: unknown[]) => grepRemoteRef(...args),
}));
vi.mock('../../../../services/gitRemoteTreeService', () => ({
  searchRemoteTree: (...args: unknown[]) => searchRemoteTree(...args),
  getRemoteFileContent: (...args: unknown[]) => previewImpl(...args),
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
    previewImpl = async () => 'line one\nneedle here\nline three';
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

  it('arrow/PageDown nav moves active row and preview header follows; rows show highlighted code + relPath:line', async () => {
    vi.useFakeTimers();
    try {
      grepRemoteRef.mockResolvedValue({
        hits: [
          { path: 'src/a.ts', line: 3, text: 'needle one' },
          { path: 'src/b.ts', line: 7, text: 'needle two' },
        ],
        truncated: false,
      });
      render(<FindInRemoteFiles />);
      fireEvent.change(screen.getByLabelText('Pattern'), { target: { value: 'needle' } });
      await act(async () => {
        vi.advanceTimersByTime(FIND_DEBOUNCE_MS);
        await Promise.resolve();
        await Promise.resolve();
      });
      const root = screen.getByLabelText('Pattern').closest('.find-root')!;
      const row0 = screen.getByTestId('find-result-row-0');
      expect(row0.textContent).toContain('src/a.ts:3');
      expect(row0.querySelector('mark')?.textContent).toBe('needle');

      fireEvent.keyDown(root, { key: 'ArrowDown' });
      expect(screen.getByTestId('find-result-row-1').querySelector('.find-rrow')?.classList.contains('on')).toBe(true);
      expect(document.querySelector('.find-pane-head')?.textContent).toContain('src/b.ts');
      fireEvent.keyDown(root, { key: 'PageUp' });
      expect(screen.getByTestId('find-result-row-0').querySelector('.find-rrow')?.classList.contains('on')).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a binary preview shows the truthful notice and an Open full file action', async () => {
    vi.useFakeTimers();
    try {
      previewImpl = async () => 'binary\0content';
      grepRemoteRef.mockResolvedValue({
        hits: [{ path: 'assets/blob.bin', line: 1, text: 'needle' }],
        truncated: false,
      });
      render(<FindInRemoteFiles />);
      fireEvent.change(screen.getByLabelText('Pattern'), { target: { value: 'needle' } });
      await act(async () => {
        vi.advanceTimersByTime(FIND_DEBOUNCE_MS);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(screen.getByText(/Preview unavailable for this binary or large file/)).toBeDefined();
      expect(screen.getByRole('button', { name: 'Open full file' })).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  function treeResult(overrides: Partial<{ path: string; name: string; type: 'file' | 'folder' }>) {
    return {
      path: overrides.path ?? 'alpha.ts',
      name: overrides.name ?? 'alpha.ts',
      type: overrides.type ?? 'file',
      matchStart: 0,
      matchLength: 0,
    };
  }

  it('Files mode lists only files filtered by query + mask; Folders mode only directories', async () => {
    searchRemoteTree.mockResolvedValue([
      treeResult({ path: 'alpha.ts', name: 'alpha.ts', type: 'file' }),
      treeResult({ path: 'beta.ts', name: 'beta.ts', type: 'file' }),
      treeResult({ path: 'gamma.js', name: 'gamma.js', type: 'file' }),
      treeResult({ path: 'src', name: 'src', type: 'folder' }),
      treeResult({ path: 'docs', name: 'docs', type: 'folder' }),
    ]);
    render(<FindInRemoteFiles />);
    fireEvent.change(screen.getByRole('textbox', { name: 'File mask' }), { target: { value: '*.ts' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Files' }));
    fireEvent.change(screen.getByLabelText('Pattern'), { target: { value: 'alpha' } });

    expect(await screen.findByTestId('find-result-row-0')).toBeDefined();
    const countRows = () => document.querySelectorAll('[data-testid^="find-result-row-"]');
    expect(countRows().length).toBe(1);
    expect(screen.getByTestId('find-result-row-0').textContent).toContain('alpha.ts');

    fireEvent.click(screen.getByRole('tab', { name: 'Folders' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'File mask' }), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Pattern'), { target: { value: 'sr' } });
    await act(async () => { await Promise.resolve(); });
    const folderRows = Array.from(countRows()).map((r) => r.textContent);
    expect(folderRows.some((t) => t?.includes('src'))).toBe(true);
    expect(folderRows.some((t) => t?.includes('alpha.ts'))).toBe(false);
  });

  it('a query change in Files mode never calls grepRemoteRef', async () => {
    searchRemoteTree.mockResolvedValue([treeResult({ path: 'alpha.ts', name: 'alpha.ts' })]);
    render(<FindInRemoteFiles />);
    fireEvent.click(screen.getByRole('tab', { name: 'Files' }));
    fireEvent.change(screen.getByLabelText('Pattern'), { target: { value: 'a' } });
    fireEvent.change(screen.getByLabelText('Pattern'), { target: { value: 'al' } });
    expect(grepRemoteRef).not.toHaveBeenCalled();
  });

  it('Enter on a Files row opens the file with no initialLine', async () => {
    const openTab = vi.fn();
    useLayoutStore.setState({ openTab });
    searchRemoteTree.mockResolvedValue([treeResult({ path: 'alpha.ts', name: 'alpha.ts' })]);
    render(<FindInRemoteFiles />);
    fireEvent.click(screen.getByRole('tab', { name: 'Files' }));
    fireEvent.change(screen.getByLabelText('Pattern'), { target: { value: 'alpha' } });
    await screen.findByTestId('find-result-row-0');

    fireEvent.keyDown(screen.getByLabelText('Pattern'), { key: 'Enter' });
    expect(openTab).toHaveBeenCalledTimes(1);
    const tab = openTab.mock.calls[0]![0] as any;
    expect(tab.params.filePath).toBe('alpha.ts');
    expect(tab.params.initialLine).toBeUndefined();
  });

  it('Enter on a Folders row sets the one-shot pendingRevealTarget consumed by the explorer', async () => {
    useLayoutStore.setState({
      activeRemoteConfigId: CONFIG.id,
      activeRemoteRepoPath: '/srv/repo',
      activeRemoteBranch: 'main',
      pendingRevealTarget: null,
    });
    searchRemoteTree.mockResolvedValue([treeResult({ path: 'src/main', name: 'main', type: 'folder' })]);
    render(<FindInRemoteFiles />);
    fireEvent.click(screen.getByRole('tab', { name: 'Folders' }));
    fireEvent.change(screen.getByLabelText('Pattern'), { target: { value: 'main' } });
    await screen.findByTestId('find-result-row-0');

    fireEvent.keyDown(screen.getByLabelText('Pattern'), { key: 'Enter' });

    expect(useLayoutStore.getState().pendingRevealTarget).toEqual({
      configId: CONFIG.id,
      repoPath: '/srv/repo',
      branch: 'main',
      filePath: 'src/main',
    });
  });

  it('an explicit onReveal prop overrides the default store wiring', async () => {
    const onReveal = vi.fn();
    searchRemoteTree.mockResolvedValue([treeResult({ path: 'src/main', name: 'main', type: 'folder' })]);
    render(<FindInRemoteFiles onReveal={onReveal} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Folders' }));
    fireEvent.change(screen.getByLabelText('Pattern'), { target: { value: 'main' } });
    await screen.findByTestId('find-result-row-0');

    fireEvent.keyDown(screen.getByLabelText('Pattern'), { key: 'Enter' });
    expect(onReveal).toHaveBeenCalledWith('src/main');
  });

  it('cancels the in-flight SSH call when the dialog closes (WR-03)', async () => {
    vi.useFakeTimers();
    try {
      let finish!: (v: { hits: unknown[]; truncated: boolean }) => void;
      grepRemoteRef.mockImplementation(() => new Promise((res) => { finish = res; }));
      render(<FindInRemoteFiles />);
      fireEvent.change(screen.getByLabelText('Pattern'), { target: { value: 'needle' } });
      await act(async () => {
        vi.advanceTimersByTime(FIND_DEBOUNCE_MS);
        await Promise.resolve();
      });
      const callId = grepRemoteRef.mock.calls[0]![5] as string;

      act(() => { useFindStore.getState().closeFind(); });

      expect(cancelToolCall).toHaveBeenCalledWith(callId);
      // Late response must not commit into a closed dialog.
      await act(async () => { finish({ hits: [{ path: 'late.ts', line: 1, text: 'x' }], truncated: false }); });
      expect(cancelToolCall).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows Stop while searching; Stop cancels and keeps partial results (WR-03)', async () => {
    vi.useFakeTimers();
    try {
      let finish!: (v: { hits: unknown[]; truncated: boolean }) => void;
      grepRemoteRef.mockImplementation(() => new Promise((res) => { finish = res; }));
      render(<FindInRemoteFiles />);
      fireEvent.change(screen.getByLabelText('Pattern'), { target: { value: 'needle' } });
      await act(async () => {
        vi.advanceTimersByTime(FIND_DEBOUNCE_MS);
        await Promise.resolve();
      });
      const stop = screen.getByRole('button', { name: 'Stop' });
      const callId = grepRemoteRef.mock.calls[0]![5] as string;

      fireEvent.click(stop);
      expect(cancelToolCall).toHaveBeenCalledWith(callId);
      expect(screen.getByText(/Stopped — showing partial results/)).toBeDefined();

      // The late SSH response is stale after Stop and cannot overwrite the partial state.
      await act(async () => { finish({ hits: [{ path: 'late.ts', line: 1, text: 'x' }], truncated: false }); });
      expect(document.querySelectorAll('[data-testid^="find-result-row-"]').length).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels the previous session when the seed changes (WR-03)', async () => {
    vi.useFakeTimers();
    try {
      grepRemoteRef.mockImplementation(() => new Promise(() => {})); // stays in flight
      const { rerender } = render(<FindInRemoteFiles />);
      fireEvent.change(screen.getByLabelText('Pattern'), { target: { value: 'needle' } });
      await act(async () => {
        vi.advanceTimersByTime(FIND_DEBOUNCE_MS);
        await Promise.resolve();
      });
      const firstCallId = grepRemoteRef.mock.calls[0]![5] as string;

      act(() => {
        useFindStore.getState().openFind({ configId: CONFIG.id, repoPath: '/srv/other', branch: 'dev' });
      });
      rerender(<FindInRemoteFiles />);

      expect(cancelToolCall).toHaveBeenCalledWith(firstCallId);
    } finally {
      vi.useRealTimers();
    }
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
