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

describe('RemoteGitExplorer Component (SDLC-REPO-EXP-02)', () => {
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
});
