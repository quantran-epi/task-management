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

  it('no longer renders the three superseded inline search inputs (D-11)', async () => {
    act(() => {
      useLayoutStore.getState().setActiveRemoteTarget('ssh-1', '/home/dev/my-repo', 'main');
    });

    render(
      <AntdThemeAdapter>
        <RemoteGitExplorer />
      </AntdThemeAdapter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('ssh-config-select')).toBeDefined();
    });
    // The old content/name placeholders and segmented control are gone.
    expect(screen.queryByPlaceholderText('Search file contents…')).toBeNull();
    expect(screen.queryByPlaceholderText('Search file/folder names…')).toBeNull();
    expect(screen.queryByTestId('remote-search-input')).toBeNull();
    expect(screen.queryByTestId('search-mode-segmented')).toBeNull();
    // grepRemoteRef is never called from the explorer anymore — the Find dialog owns it.
    expect(gitRemoteService.grepRemoteRef).not.toHaveBeenCalled();
  });

  it('keeps target selectors, global search and readonly tree intact after input removal', async () => {
    act(() => {
      useLayoutStore.getState().setActiveRemoteTarget('ssh-1', '/home/dev/my-repo', 'main');
    });

    render(
      <AntdThemeAdapter>
        <RemoteGitExplorer />
      </AntdThemeAdapter>
    );

    await waitFor(() => {
      expect(screen.getByText('package.json')).toBeDefined();
    });
    expect(screen.getByTestId('ssh-config-select')).toBeDefined();
    expect(screen.getByTestId('repo-path-input')).toBeDefined();
    expect(screen.getByTestId('branch-select')).toBeDefined();
    expect(screen.getByTestId('global-search-input')).toBeDefined();
    expect(screen.getByTestId('refresh-tree-btn')).toBeDefined();
    expect(screen.getByTestId('browse-remote-repo-btn')).toBeDefined();

    // Clicking a file still opens the readonly remote tab with no initialLine.
    fireEvent.click(screen.getByText('package.json'));
    const tab = useLayoutStore.getState().openTabs.find((t) => t.id === 'remote:package.json');
    expect(tab?.viewType).toBe('remote_file');
    expect(tab?.params?.filePath).toBe('package.json');
    expect(tab?.params?.initialLine).toBeUndefined();
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

  it('consumes a cross-branch pending reveal by syncing local selectedBranch from the store', async () => {
    act(() => {
      useLayoutStore.getState().setActiveRemoteTarget('ssh-1', '/home/dev/my-repo', 'main');
    });

    render(
      <AntdThemeAdapter>
        <RemoteGitExplorer />
      </AntdThemeAdapter>
    );

    await waitFor(() => {
      expect(screen.getByText('package.json')).toBeDefined();
    });

    act(() => {
      useLayoutStore.getState().setActiveRemoteTarget('ssh-1', '/home/dev/my-repo', 'feat/test');
      (useLayoutStore.getState() as any).setPendingRevealTarget?.({
        configId: 'ssh-1',
        repoPath: '/home/dev/my-repo',
        branch: 'feat/test',
        filePath: 'src/index.ts',
      });
    });

    await waitFor(() => {
      expect(gitRemoteTreeService.getRemoteTree).toHaveBeenCalledWith(
        mockSshConfigs[0], '/home/dev/my-repo', 'feat/test', 'src', 'secret-123'
      );
    });
    await waitFor(() => {
      expect((useLayoutStore.getState() as any).pendingRevealTarget).toBeNull();
    });
  });

  it('activating a global-search folder result hides the results panel and reveals the tree', async () => {
    act(() => {
      useLayoutStore.getState().setActiveRemoteTarget('ssh-1', '/home/dev/my-repo', 'main');
    });
    vi.spyOn(gitRemoteTreeService, 'searchRemoteTree').mockResolvedValue([
      { path: 'src/nested', name: 'nested', type: 'folder', matchStart: 0, matchLength: 6 },
    ]);

    render(
      <AntdThemeAdapter>
        <RemoteGitExplorer />
      </AntdThemeAdapter>
    );

    await waitFor(() => {
      expect(screen.getByText('package.json')).toBeDefined();
    });

    fireEvent.change(screen.getByTestId('global-search-input'), { target: { value: 'nested' } });
    const folderHit = await screen.findByTestId('global-search-hit-folder');
    fireEvent.click(folderHit);

    await waitFor(() => {
      expect(screen.queryByTestId('global-search-results')).toBeNull();
    });
    expect(screen.getByText('package.json')).toBeDefined(); // tree is visible again
    // The folder reveal runs against the aligned tree and consumes the pending target.
    await waitFor(() => {
      expect(gitRemoteTreeService.getRemoteTree).toHaveBeenCalledWith(
        mockSshConfigs[0], '/home/dev/my-repo', 'main', 'src', 'secret-123'
      );
    });
    await waitFor(() => {
      expect((useLayoutStore.getState() as any).pendingRevealTarget).toBeNull();
    });
  });

  it('renders a deep single-child folder chain as one dotted compact node (D-12)', async () => {
    act(() => {
      useLayoutStore.getState().setActiveRemoteTarget('ssh-1', '/home/dev/my-repo', 'main');
    });
    vi.spyOn(gitRemoteTreeService, 'getRemoteTree').mockImplementation(async (_cfg, _repo, _ref, dirPath) => {
      if (!dirPath) {
        return [{
          key: 'com', title: 'com', isLeaf: false, sha: 't-com',
          children: [{
            key: 'com/acme', title: 'acme', isLeaf: false, sha: 't-acme',
            children: [{ key: 'com/acme/orders', title: 'orders', isLeaf: false, sha: 't-orders' }],
          }],
        }];
      }
      return [];
    });

    render(
      <AntdThemeAdapter>
        <RemoteGitExplorer />
      </AntdThemeAdapter>
    );

    // Root renders the merged dotted label; intermediate segments are not separate rows.
    await waitFor(() => {
      expect(screen.getByText('com.acme.orders')).toBeDefined();
    });
    expect(screen.queryByText('acme')).toBeNull();
    expect(screen.queryByText('orders')).toBeNull();
  });

  it('re-fetches a same-path folder after a branch switch and drops stale expansion/selection (BUG-01)', async () => {
    act(() => {
      useLayoutStore.getState().setActiveRemoteTarget('ssh-1', '/home/dev/my-repo', 'main');
      useLayoutStore.getState().setActiveRemoteBranch('main');
    });
    // Root has one folder `src` and a file; expanding `src` fetches its children.
    vi.spyOn(gitRemoteTreeService, 'getRemoteTree').mockImplementation(async (_cfg, _repo, _ref, dirPath) => {
      if (!dirPath) {
        return [
          { key: 'src', title: 'src', isLeaf: false, sha: 'tree-src' },
          { key: 'root.ts', title: 'root.ts', isLeaf: true, size: 10, sha: 'blob-root' },
        ];
      }
      return [
        { key: `${dirPath}/child.ts`, title: 'child.ts', isLeaf: true, size: 10, sha: 'blob-child' },
      ];
    });

    render(
      <AntdThemeAdapter>
        <RemoteGitExplorer />
      </AntdThemeAdapter>
    );

    // Root loads for main.
    await waitFor(() => {
      expect(screen.getByText('src')).toBeDefined();
    });
    // Expand `src` on main -> loadData fetches dirPath='src'.
    const srcRow = screen.getByText('src').closest('.ant-tree-treenode')!;
    fireEvent.click(srcRow.querySelector('.ant-tree-switcher')!);
    await waitFor(() => {
      expect(gitRemoteTreeService.getRemoteTree).toHaveBeenCalledWith(
        mockSshConfigs[0], '/home/dev/my-repo', 'main', 'src', 'secret-123'
      );
    });
    await waitFor(() => {
      expect(screen.getByText('child.ts')).toBeDefined();
    });
    // Select the expanded folder's child so a stale selection would be visible.
    fireEvent.click(screen.getByText('child.ts'));
    expect(
      screen.getByText('child.ts').closest('.ant-tree-treenode')?.className
    ).toContain('ant-tree-treenode-selected');

    const callsBeforeSwitch = (gitRemoteTreeService.getRemoteTree as any).mock.calls.length;

    // Switch repo path from the store (as a 1-click Git action would).
    act(() => {
      useLayoutStore.getState().setActiveRemoteTarget('ssh-1', '/home/dev/my-repo-2', 'main');
    });

    // Root reloads for the new target.
    await waitFor(() => {
      expect(gitRemoteTreeService.getRemoteTree).toHaveBeenCalledWith(
        mockSshConfigs[0], '/home/dev/my-repo-2', 'main', '', 'secret-123'
      );
    });
    // Stale selection/expansion are cleared: no selected row survives the switch.
    await waitFor(() => {
      expect(document.querySelector('.ant-tree-treenode-selected')).toBeNull();
    });

    // Tree remounted: `src` starts collapsed, so expanding it calls loadData again for the new target.
    const srcRowAfter = screen.getByText('src').closest('.ant-tree-treenode')!;
    expect(srcRowAfter.className).not.toContain('ant-tree-treenode-expanded');
    fireEvent.click(srcRowAfter.querySelector('.ant-tree-switcher')!);
    await waitFor(() => {
      const newTargetCalls = ((gitRemoteTreeService.getRemoteTree as any).mock.calls as any[][]).filter(
        (c) => c[1] === '/home/dev/my-repo-2' && c[3] === 'src'
      );
      expect(newTargetCalls.length).toBeGreaterThan(0);
    });
    expect((gitRemoteTreeService.getRemoteTree as any).mock.calls.length).toBeGreaterThan(callsBeforeSwitch);
  });

  it('walks a single-child chain down to the deepest children with bounded calls (BUG-02)', async () => {
    act(() => {
      useLayoutStore.getState().setActiveRemoteTarget('ssh-1', '/home/dev/my-repo', 'main');
      useLayoutStore.getState().setActiveRemoteBranch('main');
    });
    // Root = single chain vn -> vn/shb -> vn/shb/core; expanding the compact node walks:
    // fetch vn (one folder shb) -> fetch vn/shb (one folder core) -> fetch vn/shb/core (deep file).
    vi.spyOn(gitRemoteTreeService, 'getRemoteTree').mockImplementation(async (_cfg, _repo, _ref, dirPath) => {
      if (!dirPath) {
        return [{ key: 'vn', title: 'vn', isLeaf: false, sha: 't-vn',
          children: [{ key: 'vn/shb', title: 'shb', isLeaf: false, sha: 't-shb' }] }];
      }
      if (dirPath === 'vn/shb') {
        return [{ key: 'vn/shb/core', title: 'core', isLeaf: false, sha: 't-core' }];
      }
      if (dirPath === 'vn/shb/core') {
        return [{ key: 'vn/shb/core/Main.ts', title: 'Main.ts', isLeaf: true, size: 10, sha: 'b-1' }];
      }
      return [];
    });

    render(
      <AntdThemeAdapter>
        <RemoteGitExplorer />
      </AntdThemeAdapter>
    );

    await waitFor(() => {
      expect(screen.getByText('vn.shb')).toBeDefined();
    });
    // Expand the compact node; rawPath = last path 'vn/shb'.
    const chainRow = screen.getByText('vn.shb').closest('.ant-tree-treenode')!;
    fireEvent.click(chainRow.querySelector('.ant-tree-switcher')!);

    // Deepest real file appears after the bounded walk.
    await waitFor(() => {
      expect(screen.getByText('Main.ts')).toBeDefined();
    });
    const calls = ((gitRemoteTreeService.getRemoteTree as any).mock.calls as any[][]);
    expect(calls.filter((c) => c[3] === 'vn/shb').length).toBe(1);
    expect(calls.filter((c) => c[3] === 'vn/shb/core').length).toBe(1);
    // No runaway walking past a leaf: root + exactly two walk fetches.
    expect(calls.length).toBe(3);
  });

  it('keeps a branch point expanded into separate nodes', async () => {
    act(() => {
      useLayoutStore.getState().setActiveRemoteTarget('ssh-1', '/home/dev/my-repo', 'main');
    });
    vi.spyOn(gitRemoteTreeService, 'getRemoteTree').mockImplementation(async (_cfg, _repo, _ref) => [
      { key: 'com/acme/one', title: 'one', isLeaf: false, sha: 't-1' },
      { key: 'com/acme/two', title: 'two', isLeaf: false, sha: 't-2' },
    ]);

    render(
      <AntdThemeAdapter>
        <RemoteGitExplorer />
      </AntdThemeAdapter>
    );

    await waitFor(() => {
      expect(screen.getByText('one')).toBeDefined();
      expect(screen.getByText('two')).toBeDefined();
    });
  });

  it('does not merge a status-badged node and keeps its badge visible', async () => {
    act(() => {
      useLayoutStore.getState().setActiveRemoteTarget('ssh-1', '/home/dev/my-repo', 'main');
    });
    vi.spyOn(gitRemoteService, 'checkDirtyStatus').mockResolvedValue({
      isClean: false,
      uncommittedFiles: [
        { path: 'src/changed.ts', indexStatus: ' ', workingTreeStatus: 'M' },
      ],
    });
    vi.spyOn(gitRemoteTreeService, 'getRemoteTree').mockImplementation(async (_cfg, _repo, _ref, dirPath) => {
      if (!dirPath) {
        // A badged single-child chain at root: the badge must stop compaction at `com/acme`.
        return [{
          key: 'com', title: 'com', isLeaf: false, sha: 't-com', gitStatus: 'M',
          children: [{ key: 'com/acme', title: 'acme', isLeaf: false, sha: 't-acme' }],
        }];
      }
      return [];
    });

    render(
      <AntdThemeAdapter>
        <RemoteGitExplorer />
      </AntdThemeAdapter>
    );

    await waitFor(() => {
      expect(screen.getByText('com')).toBeDefined();
      expect(screen.getAllByTestId('status-badge-modified').length).toBeGreaterThan(0);
    });
    // Badge stops the chain: the root label is not merged into a dotted `com.acme`.
    expect(screen.queryByText('com.acme')).toBeNull();
  });

  it('reveal of a path inside a compact chain selects the stable first-path key', async () => {
    act(() => {
      useLayoutStore.getState().setActiveRemoteTarget('ssh-1', '/home/dev/my-repo', 'main');
    });
    // Two children under com: one single-child chain (com/acme/orders) and a sibling so the
    // reveal target com/acme/orders/dto stays a separate node (revealTargets guard).
    vi.spyOn(gitRemoteTreeService, 'getRemoteTree').mockImplementation(async (_cfg, _repo, _ref, dirPath) => {
      if (!dirPath) {
        return [
          { key: 'src', title: 'src', isLeaf: false, sha: 't-src' },
          { key: 'lib', title: 'lib', isLeaf: false, sha: 't-lib' },
        ];
      }
      if (dirPath === 'src') {
        return [{ key: 'src/nested/deep.ts', title: 'deep.ts', isLeaf: true, sha: 'b-1', size: 10 }];
      }
      return [];
    });
    act(() => {
      (useLayoutStore.getState() as any).setPendingRevealTarget?.({
        configId: 'ssh-1',
        repoPath: '/home/dev/my-repo',
        branch: 'main',
        filePath: 'src/nested/deep.ts',
      });
    });

    render(
      <AntdThemeAdapter>
        <RemoteGitExplorer />
      </AntdThemeAdapter>
    );

    // The reveal target is in revealTargets, so it stays distinct and selects its stable key.
    await waitFor(() => {
      const node = screen.getByText('deep.ts').closest('.ant-tree-treenode');
      expect(node?.className).toContain('ant-tree-treenode-selected');
    });
    expect((useLayoutStore.getState() as any).pendingRevealTarget).toBeNull();
  });

  it('fetches each ancestor exactly once for a multi-level reveal', async () => {
    vi.spyOn(gitRemoteTreeService, 'getRemoteTree').mockImplementation(async (_cfg, _repo, _ref, dirPath) => {
      if (!dirPath) {
        return [{ key: 'src', title: 'src', isLeaf: false, sha: 'tree-1' }];
      }
      if (dirPath === 'src') {
        return [{ key: 'src/nested', title: 'nested', isLeaf: false, sha: 'tree-2' }];
      }
      if (dirPath === 'src/nested') {
        return [{ key: 'src/nested/deep.ts', title: 'deep.ts', isLeaf: true, size: 10, sha: 'blob-1' }];
      }
      return [];
    });
    act(() => {
      useLayoutStore.getState().setActiveRemoteTarget('ssh-1', '/home/dev/my-repo', 'main');
      (useLayoutStore.getState() as any).setPendingRevealTarget?.({
        configId: 'ssh-1',
        repoPath: '/home/dev/my-repo',
        branch: 'main',
        filePath: 'src/nested/deep.ts',
      });
    });

    render(
      <AntdThemeAdapter>
        <RemoteGitExplorer />
      </AntdThemeAdapter>
    );

    await waitFor(() => {
      const node = screen.getByText('deep.ts').closest('.ant-tree-treenode');
      expect(node?.className).toContain('ant-tree-treenode-selected');
    });
    // Let any re-entrant effect settle before asserting call counts.
    await act(async () => {
      await Promise.resolve();
    });

    const calls = (gitRemoteTreeService.getRemoteTree as any).mock.calls as any[][];
    expect(calls.filter((c) => c[3] === 'src').length).toBe(1);
    expect(calls.filter((c) => c[3] === 'src/nested').length).toBe(1);
  });
});
