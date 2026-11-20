import { StrictMode } from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RemoteGitExplorer } from '../toolwindows/RemoteGitExplorer';
import { useLayoutStore } from '../store/layoutStore';
import { AntdThemeAdapter } from '../AntdThemeAdapter';
import * as sshService from '../../services/sshService';
import * as gitRemoteService from '../../services/gitRemoteService';
import * as gitRemoteTreeService from '../../services/gitRemoteTreeService';
import type { SshConfig } from '../../types/ssh';

const mockSshConfigs: SshConfig[] = [
  {
    id: 'ssh-1',
    name: 'Dev Server',
    host: '192.168.1.100',
    port: 22,
    username: 'dev',
    authType: 'key_file',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

describe('RemoteGitExplorer Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    act(() => {
      useLayoutStore.getState().resetLayout();
    });

    vi.spyOn(sshService, 'getSshConfigs').mockResolvedValue(mockSshConfigs);
    vi.spyOn(sshService, 'getSshSecret').mockResolvedValue('secret-123');

    vi.spyOn(gitRemoteService, 'getRemoteBranches').mockResolvedValue([
      { name: 'main', isRemote: false, isHead: true },
      { name: 'feat/test', isRemote: false, isHead: false },
    ]);

    vi.spyOn(gitRemoteService, 'checkDirtyStatus').mockResolvedValue({
      isClean: true,
      uncommittedFiles: [],
    });

    vi.spyOn(gitRemoteService, 'grepRemoteRef').mockResolvedValue({
      hits: [
        { path: 'src/index.ts', line: 7, text: 'const secret = "-Dtest";' },
        { path: 'package.json', line: 2, text: '"name": "demo"' },
      ],
      truncated: false,
    });

    vi.spyOn(gitRemoteTreeService, 'getRemoteTree').mockImplementation(async (_cfg, _repo, _ref, dirPath) => {
      if (!dirPath) {
        return [
          { key: 'src', title: 'src', isLeaf: false, sha: 'tree-sha-1' },
          { key: 'package.json', title: 'package.json', isLeaf: true, size: 1024, sha: 'blob-sha-1' },
        ];
      }
      if (dirPath === 'src') {
        return [
          { key: 'src/index.ts', title: 'index.ts', isLeaf: true, size: 2048, sha: 'blob-sha-2' },
        ];
      }
      return [];
    });
  });

  it('renders host selector, repo input, and loads branches on repo blur', async () => {
    render(
      <AntdThemeAdapter>
        <RemoteGitExplorer />
      </AntdThemeAdapter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('ssh-config-select')).toBeDefined();
    });

    const repoInput = screen.getByTestId('repo-path-input');
    fireEvent.change(repoInput, { target: { value: '/home/dev/my-repo' } });
    fireEvent.blur(repoInput);

    await waitFor(() => {
      expect(gitRemoteService.getRemoteBranches).toHaveBeenCalledWith(
        mockSshConfigs[0],
        '/home/dev/my-repo',
        'secret-123'
      );
    });

    // Root tree should load automatically for main branch
    await waitFor(() => {
      expect(gitRemoteTreeService.getRemoteTree).toHaveBeenCalledWith(
        mockSshConfigs[0],
        '/home/dev/my-repo',
        'main',
        '',
        'secret-123'
      );
    });

    await waitFor(() => {
      expect(screen.getByText('src')).toBeDefined();
      expect(screen.getByText('package.json')).toBeDefined();
    });
  });

  it('does not double-load the remote tree under StrictMode (WR-03)', async () => {
    act(() => {
      useLayoutStore.getState().setActiveRemoteTarget('ssh-1', '/home/dev/my-repo', 'feat/test');
    });

    render(
      <StrictMode>
        <AntdThemeAdapter>
          <RemoteGitExplorer />
        </AntdThemeAdapter>
      </StrictMode>
    );

    await waitFor(() => {
      expect(gitRemoteTreeService.getRemoteTree).toHaveBeenCalledWith(
        mockSshConfigs[0], '/home/dev/my-repo', 'feat/test', '', 'secret-123'
      );
    });
    expect(gitRemoteTreeService.getRemoteTree).toHaveBeenCalledTimes(1);
  });

  it('opens remote file tab in layoutStore when a file node is clicked', async () => {
    render(
      <AntdThemeAdapter>
        <RemoteGitExplorer />
      </AntdThemeAdapter>
    );

    const repoInput = screen.getByTestId('repo-path-input');
    fireEvent.change(repoInput, { target: { value: '/home/dev/my-repo' } });
    fireEvent.blur(repoInput);

    await waitFor(() => {
      expect(screen.getByText('package.json')).toBeDefined();
    });

    const fileNode = screen.getByText('package.json');
    fireEvent.click(fileNode);

    const tabs = useLayoutStore.getState().openTabs;
    const remoteTab = tabs.find((t) => t.id === 'remote:package.json');
    expect(remoteTab).toBeDefined();
    expect(remoteTab?.viewType).toBe('remote_file');
    expect(remoteTab?.params?.filePath).toBe('package.json');
    expect(remoteTab?.params?.branch).toBe('main');
    expect(remoteTab?.params?.size).toBe(1024);
  });

  it('renders remote folder browse button and opens modal when clicked', async () => {
    vi.spyOn(sshService, 'listRemoteDir').mockResolvedValue([
      { name: 'repo-one', path: '/home/dev/repo-one', isDir: true, isSymlink: false, size: 4096, modified: 1000 },
    ]);

    render(
      <AntdThemeAdapter>
        <RemoteGitExplorer />
      </AntdThemeAdapter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('ssh-config-select')).toBeDefined();
    });

    const browseBtn = screen.getByTestId('browse-remote-repo-btn');
    expect(browseBtn).toBeDefined();
    expect(browseBtn.hasAttribute('disabled')).toBe(false);

    fireEvent.click(browseBtn);

    await waitFor(() => {
      expect(screen.getByText(/Chọn thư mục Git Repository từ xa/i)).toBeDefined();
    });
  });

  it('automatically recovers branches and tree on remount without re-entering path', async () => {
    // Preset target and branch as if previously chosen before toolwindow collapsed
    act(() => {
      useLayoutStore.getState().setActiveRemoteTarget('ssh-1', '/home/dev/my-repo', 'feat/test');
    });

    render(
      <AntdThemeAdapter>
        <RemoteGitExplorer />
      </AntdThemeAdapter>
    );

    // Verify branches are loaded automatically once ssh configs resolve
    await waitFor(() => {
      expect(gitRemoteService.getRemoteBranches).toHaveBeenCalledWith(
        mockSshConfigs[0],
        '/home/dev/my-repo',
        'secret-123'
      );
    });

    // Verify tree is loaded automatically for the preserved active branch 'feat/test'
    await waitFor(() => {
      expect(gitRemoteTreeService.getRemoteTree).toHaveBeenCalledWith(
        mockSshConfigs[0],
        '/home/dev/my-repo',
        'feat/test',
        '',
        'secret-123'
      );
    });

    // Tree nodes should be visible immediately without typing in path input
    await waitFor(() => {
      expect(screen.getByText('src')).toBeDefined();
      expect(screen.getByText('package.json')).toBeDefined();
    });

    // Branch select should not be disabled
    const branchSelect = screen.getByTestId('branch-select');
    expect(branchSelect.className).not.toContain('ant-select-disabled');
  });

  it('displays uncommitted files with status badges and passes gitStatus to opened tab', async () => {
    vi.spyOn(gitRemoteService, 'checkDirtyStatus').mockResolvedValue({
      isClean: false,
      uncommittedFiles: [
        { path: 'package.json', indexStatus: ' ', workingTreeStatus: 'M' },
        { path: 'untracked-script.sh', indexStatus: '?', workingTreeStatus: '?' },
      ],
    });

    render(
      <AntdThemeAdapter>
        <RemoteGitExplorer />
      </AntdThemeAdapter>
    );

    const repoInput = screen.getByTestId('repo-path-input');
    fireEvent.change(repoInput, { target: { value: '/home/dev/my-repo' } });
    fireEvent.blur(repoInput);

    await waitFor(() => {
      expect(screen.getByText('package.json')).toBeDefined();
      expect(screen.getByText('untracked-script.sh')).toBeDefined();
    });

    // Check status tags/badges
    expect(screen.getByTestId('status-badge-modified')).toBeDefined();
    expect(screen.getByTestId('status-badge-untracked')).toBeDefined();

    // Click untracked file to open
    const untrackedNode = screen.getByText('untracked-script.sh');
    fireEvent.click(untrackedNode);

    const tabs = useLayoutStore.getState().openTabs;
    const untrackedTab = tabs.find((t) => t.id === 'remote:untracked-script.sh');
    expect(untrackedTab).toBeDefined();
    expect(untrackedTab?.params?.gitStatus).toBe('?');
  });

  it('content search calls grepRemoteRef with the active target and bounded limit, renders path:line:text, and opens at that line', async () => {
    act(() => {
      useLayoutStore.getState().setActiveRemoteTarget('ssh-1', '/home/dev/my-repo', 'main');
    });

    render(
      <AntdThemeAdapter>
        <RemoteGitExplorer />
      </AntdThemeAdapter>
    );

    const searchWrapper = screen.getByTestId('remote-search-input');
    // antd Input.Search puts the testid on its wrapper div; the real editable node is the input.
    const searchInput = searchWrapper.tagName === 'INPUT' ? searchWrapper : searchWrapper.querySelector('input')!;
    // A leading-dash / special-char pattern must be passed as DATA, never quoted here.
    // The renderer debounces 300ms; waitFor covers that plus the async service call.
    fireEvent.change(searchInput, { target: { value: '-Dtest; rm -rf /' } });

    await waitFor(() => {
      expect(gitRemoteService.grepRemoteRef).toHaveBeenCalledWith(
        mockSshConfigs[0],
        '/home/dev/my-repo',
        'main',
        expect.objectContaining({
          pattern: '-Dtest; rm -rf /',
          literal: true,
          limit: 200,
        }),
        'secret-123'
      );
    });

    // path:line:text rendering (repo-relative path used verbatim) on the hit row.
    const hits = await screen.findAllByTestId('content-search-hit');
    const hit = hits.find((h) => h.textContent?.includes('src/index.ts'))!;
    expect(hit.textContent).toContain('src/index.ts');
    expect(hit.textContent).toContain(':7:');
    expect(hit.textContent).toContain('const secret = "-Dtest";');

    fireEvent.click(hit);

    const remoteTab = useLayoutStore.getState().openTabs.find((t) => t.id === 'remote:src/index.ts');
    expect(remoteTab).toBeDefined();
    expect(remoteTab?.viewType).toBe('remote_file');
    expect(remoteTab?.params?.initialLine).toBe(7);
  });

  it('name mode filters the active tree by relative path and opens the remote tab without initialLine', async () => {
    act(() => {
      useLayoutStore.getState().setActiveRemoteTarget('ssh-1', '/home/dev/my-repo', 'main');
    });

    render(
      <AntdThemeAdapter>
        <RemoteGitExplorer />
      </AntdThemeAdapter>
    );

    // Load the tree first.
    await waitFor(() => {
      expect(screen.getByText('package.json')).toBeDefined();
    });

    // Switch to Name mode via the segmented control.
    const nameButton = screen.getByText('Name');
    fireEvent.click(nameButton);

    const wrapper = screen.getByTestId('remote-search-input');
    const input = wrapper.tagName === 'INPUT' ? wrapper : wrapper.querySelector('input')!;
    fireEvent.change(input, { target: { value: 'PACKAGE' } }); // case-insensitive, root-level leaf

    await waitFor(() => {
      expect(screen.getAllByTestId('name-search-hit').length).toBe(1);
    });
    const hits = screen.getAllByTestId('name-search-hit');
    expect(hits[0]?.getAttribute('data-file-path')).toBe('package.json');

    fireEvent.click(hits[0]!);
    const tab = useLayoutStore.getState().openTabs.find((t) => t.id === 'remote:package.json');
    expect(tab).toBeDefined();
    expect(tab?.viewType).toBe('remote_file');
    expect(tab?.params?.filePath).toBe('package.json');
    expect(tab?.params?.initialLine).toBeUndefined();

    // No new filesystem walker / whole-file read: only getRemoteTree + grepRemoteRef are used.
    expect(gitRemoteTreeService.getRemoteTree).toHaveBeenCalled();
  });

  it('switching modes clears the other mode\'s results', async () => {
    act(() => {
      useLayoutStore.getState().setActiveRemoteTarget('ssh-1', '/home/dev/my-repo', 'main');
    });

    render(
      <AntdThemeAdapter>
        <RemoteGitExplorer />
      </AntdThemeAdapter>
    );

    // Produce a content result first.
    const wrapper = screen.getByTestId('remote-search-input');
    const input = wrapper.tagName === 'INPUT' ? wrapper : wrapper.querySelector('input')!;
    fireEvent.change(input, { target: { value: 'secret' } });
    await waitFor(() => {
      expect(screen.getAllByTestId('content-search-hit').length).toBeGreaterThan(0);
    });

    // Switch to Name mode: the content hits must disappear, input cleared.
    fireEvent.click(screen.getByText('Name'));
    await waitFor(() => {
      expect(screen.queryByTestId('content-search-results')).toBeNull();
    });
    expect(screen.queryAllByTestId('name-search-hit').length).toBe(0);
  });

  it('reveals a pending file: expands ancestor folders, selects the node, and consumes the request', async () => {
    act(() => {
      useLayoutStore.getState().setActiveRemoteTarget('ssh-1', '/home/dev/my-repo', 'main');
      (useLayoutStore.getState() as any).setPendingRevealTarget?.({
        configId: 'ssh-1',
        repoPath: '/home/dev/my-repo',
        branch: 'main',
        filePath: 'src/index.ts',
      });
    });

    render(
      <AntdThemeAdapter>
        <RemoteGitExplorer />
      </AntdThemeAdapter>
    );

    // Ancestor folder is materialized through the confined tree service.
    await waitFor(() => {
      expect(gitRemoteTreeService.getRemoteTree).toHaveBeenCalledWith(
        mockSshConfigs[0], '/home/dev/my-repo', 'main', 'src', 'secret-123'
      );
    });

    // Child renders (ancestor expanded) and is the selected tree node.
    await waitFor(() => {
      const node = screen.getByText('index.ts').closest('.ant-tree-treenode');
      expect(node?.className).toContain('ant-tree-treenode-selected');
    });

    expect((useLayoutStore.getState() as any).pendingRevealTarget).toBeNull();
  });

  it('consumes a stale reveal target without selecting a wrong-node lookup or crashing', async () => {
    act(() => {
      useLayoutStore.getState().setActiveRemoteTarget('ssh-1', '/home/dev/my-repo', 'main');
      (useLayoutStore.getState() as any).setPendingRevealTarget?.({
        configId: 'other-config',
        repoPath: '/other/repo',
        branch: 'main',
        filePath: 'src/index.ts',
      });
    });

    render(
      <AntdThemeAdapter>
        <RemoteGitExplorer />
      </AntdThemeAdapter>
    );

    await waitFor(() => {
      expect((useLayoutStore.getState() as any).pendingRevealTarget).toBeNull();
    });
    expect(gitRemoteTreeService.getRemoteTree).not.toHaveBeenCalledWith(
      expect.anything(), '/other/repo', expect.anything(), expect.anything(), expect.anything()
    );
    // Explorer still loads its own tree after the stale request is discarded.
    await waitFor(() => {
      expect(screen.getByText('package.json')).toBeDefined();
    });
  });

  it('global search finds remote files/folders, highlights matches, opens files and reveals folders', async () => {
    act(() => {
      useLayoutStore.getState().setActiveRemoteTarget('ssh-1', '/home/dev/my-repo', 'main');
    });
    vi.spyOn(gitRemoteTreeService, 'searchRemoteTree').mockResolvedValue([
      { path: 'src/index.ts', name: 'index.ts', type: 'file', matchStart: 0, matchLength: 4 },
      { path: 'src/nested', name: 'nested', type: 'folder', matchStart: 0, matchLength: 4 },
    ]);

    render(
      <AntdThemeAdapter>
        <RemoteGitExplorer />
      </AntdThemeAdapter>
    );

    const input = screen.getByTestId('global-search-input');
    fireEvent.change(input, { target: { value: 'inde' } });

    await waitFor(() => {
      expect(gitRemoteTreeService.searchRemoteTree).toHaveBeenCalledWith(
        mockSshConfigs[0], '/home/dev/my-repo', 'main', 'inde', 'secret-123'
      );
    });

    const fileHit = await screen.findByTestId('global-search-hit-file');
    expect(fileHit.textContent).toContain('src');
    expect(fileHit.querySelector('mark')?.textContent).toBe('inde');
    expect(screen.getByTestId('global-search-hit-folder')).toBeDefined();

    fireEvent.click(fileHit);
    const tab = useLayoutStore.getState().openTabs.find((t) => t.id === 'remote:src/index.ts');
    expect(tab).toBeDefined();

    fireEvent.keyDown(screen.getByTestId('global-search-hit-folder'), { key: 'Enter' });
    await waitFor(() => {
      expect((useLayoutStore.getState() as any).pendingRevealTarget).toEqual(
        expect.objectContaining({ filePath: 'src/nested' })
      );
    });
  });

  it('global search is inert with no remote connected', async () => {
    const searchSpy = vi.spyOn(gitRemoteTreeService, 'searchRemoteTree').mockResolvedValue([]);

    render(
      <AntdThemeAdapter>
        <RemoteGitExplorer />
      </AntdThemeAdapter>
    );

    const input = screen.getByTestId('global-search-input');
    expect(input.hasAttribute('disabled')).toBe(true);
    fireEvent.change(input, { target: { value: 'anything' } });
    expect(searchSpy).not.toHaveBeenCalled();
  });
});
