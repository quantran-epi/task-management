import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RepoConfigView } from '../RepoConfigView';
import * as sshService from '../../../../services/sshService';
import * as gitRemoteService from '../../../../services/gitRemoteService';
import * as conventionService from '../../../../services/conventionService';

describe('RepoConfigView Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders preloaded SSH configs, project binding, and conventions', async () => {
    vi.spyOn(sshService, 'getSshConfigs').mockResolvedValue([
      {
        id: 'ssh-1',
        name: 'Dev Server',
        host: '192.168.1.10',
        port: 22,
        username: 'ubuntu',
        authType: 'password',
        createdAt: '2026-11-06T00:00:00Z',
        updatedAt: '2026-11-06T00:00:00Z',
      },
    ]);

    vi.spyOn(gitRemoteService, 'getProjectRepoSshBinding').mockResolvedValue({
      sshConfigId: 'ssh-1',
      remoteRepoPath: '/home/ubuntu/repo',
      defaultBaseBranch: 'origin/main',
      updatedAt: '2026-11-06T00:00:00Z',
    });

    vi.spyOn(conventionService, 'getGlobalConventions').mockResolvedValue(
      '# Global Convention\nFollow clean code'
    );

    vi.spyOn(conventionService, 'loadRepoConventions').mockResolvedValue({
      content: '# Repo Convention\nUse TypeScript strictly',
      foundPath: 'CONVENTIONS.md',
      loadedAt: '2026-11-07T10:00:00Z',
    });

    render(<RepoConfigView projectId="proj-test-1" />);

    // Header check
    expect(await screen.findByText(/Cấu hình Repository & Quy ước Dự án/i)).toBeInTheDocument();

    // Inputs check
    await waitFor(() => {
      expect(screen.getByDisplayValue('/home/ubuntu/repo')).toBeInTheDocument();
      expect(screen.getByText('Dev Server (ubuntu@192.168.1.10:22)')).toBeInTheDocument();
    });

    // Conventions check
    expect(screen.getByText(/Quy ước Repository \(CONVENTIONS\.md\):/i)).toBeInTheDocument();
    expect(screen.getByText(/# Repo Convention/)).toBeInTheDocument();
    expect(screen.getByText(/# Global Convention/)).toBeInTheDocument();
  });

  it('calls saveProjectRepoSshBinding when Save button is clicked', async () => {
    vi.spyOn(sshService, 'getSshConfigs').mockResolvedValue([
      {
        id: 'ssh-1',
        name: 'Dev Server',
        host: '192.168.1.10',
        port: 22,
        username: 'ubuntu',
        authType: 'password',
        createdAt: '2026-11-06T00:00:00Z',
        updatedAt: '2026-11-06T00:00:00Z',
      },
    ]);

    vi.spyOn(gitRemoteService, 'getProjectRepoSshBinding').mockResolvedValue(null);
    vi.spyOn(conventionService, 'getGlobalConventions').mockResolvedValue('');
    vi.spyOn(conventionService, 'loadRepoConventions').mockResolvedValue(null);

    const saveSpy = vi.spyOn(gitRemoteService, 'saveProjectRepoSshBinding').mockResolvedValue();
    const handleSaved = vi.fn();

    render(<RepoConfigView projectId="proj-test-2" onBindingSaved={handleSaved} />);

    await waitFor(() => {
      expect(screen.getByTestId('btn-save-repo-config')).toBeInTheDocument();
    });

    // Fill remoteRepoPath
    const pathInput = screen.getByPlaceholderText('/home/user/workspace/repo');
    fireEvent.change(pathInput, { target: { value: '/var/www/my-app' } });

    // Click Save
    const saveBtn = screen.getByTestId('btn-save-repo-config');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalledWith(
        'proj-test-2',
        expect.objectContaining({
          sshConfigId: 'ssh-1',
          remoteRepoPath: '/var/www/my-app',
        }),
        expect.anything()
      );
      expect(handleSaved).toHaveBeenCalled();
    });
  });
});
