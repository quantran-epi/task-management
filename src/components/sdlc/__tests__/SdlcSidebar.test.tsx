import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SdlcSidebar } from '../SdlcSidebar';
import * as sdlcCrManager from '../../../services/wizard/sdlcCrManager';
import * as gitRemoteService from '../../../services/gitRemoteService';

describe('SdlcSidebar Component (3-Tier Hierarchy)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Tier 1 (Project), Tier 2 (CR), and Tier 3 (Steps)', async () => {
    vi.spyOn(gitRemoteService, 'getProjectRepoSshBinding').mockResolvedValue({
      sshConfigId: 'ssh-1',
      remoteRepoPath: '/home/user/my-repo',
      defaultBaseBranch: 'origin/main',
      updatedAt: '2026-11-07T00:00:00Z',
    });

    vi.spyOn(sdlcCrManager, 'listCrs').mockResolvedValue([
      {
        id: 'cr-1',
        projectId: 'proj-1',
        crCode: 'CR-2026-01',
        featureName: 'Test Feature',
        author: 'Tester',
        requestingUnit: 'QA',
        date: '2026-11-07',
        status: 'active',
        createdAt: '2026-11-07T00:00:00Z',
        updatedAt: '2026-11-07T00:00:00Z',
      },
    ]);

    const handleSelectStep = vi.fn();
    const handleSelectConfig = vi.fn();

    render(
      <SdlcSidebar
        projectId="proj-1"
        selectedStep="INTAKE"
        onSelectStep={handleSelectStep}
        activeCrId="cr-1"
        onSelectConfig={handleSelectConfig}
      />
    );

    // Tier 1: Project & Repo Binding
    expect(screen.getByText(/Dự án \(Project\)/i)).toBeInTheDocument();
    expect(await screen.findByText('/home/user/my-repo')).toBeInTheDocument();

    // Tier 2: Change Request
    expect(screen.getByText(/Change Request \(CR\)/i)).toBeInTheDocument();
    expect(await screen.findByText('CR-2026-01')).toBeInTheDocument();

    // Tier 3: Steps
    expect(screen.getByText(/Bước 1: Nạp PL01 & PL02/i)).toBeInTheDocument();
    expect(screen.getByText(/Bước 2: Thiết kế giải pháp/i)).toBeInTheDocument();
    expect(screen.getByText(/Bước 3: Coding ngoài/i)).toBeInTheDocument();
    expect(screen.getByText(/Bước 4: Nạp Change Pack/i)).toBeInTheDocument();
    expect(screen.getByText(/Bước 5: Tài liệu kỹ thuật/i)).toBeInTheDocument();
    expect(screen.getByText(/Bước 6: Tờ trình CAB/i)).toBeInTheDocument();

    // Click step
    const step2 = screen.getByTestId('sidebar-step-SOLUTION');
    fireEvent.click(step2);
    expect(handleSelectStep).toHaveBeenCalledWith('SOLUTION');

    // Click config
    const configBtn = screen.getByTestId('sidebar-btn-repo-config');
    fireEvent.click(configBtn);
    expect(handleSelectConfig).toHaveBeenCalledTimes(1);
  });
});
