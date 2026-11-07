import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SdlcSidebar } from '../SdlcSidebar';
import { TaskPlannerDatabase } from '../../../db';
import { createSystem } from '../../../db/repositories/systemRepo';
import { createChangeRequest } from '../../../db/repositories/changeRequestRepo';

describe('SdlcSidebar Component (Unified CR Hierarchy)', () => {
  let db: TaskPlannerDatabase;
  let systemId: string;
  let crId: string;

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`test-sidebar-${Math.random()}`);
    await db.open();
    const parent = await createSystem(
      { name: 'Core', code: 'CORE', parentId: null, type: 'LOGICAL_GROUP' },
      db
    );
    const subsystem = await createSystem(
      {
        name: 'Payment Service',
        code: 'PAY-SVC',
        parentId: parent.id,
        type: 'SERVICE',
        sshConfigId: '00000000-0000-4000-8000-000000000001',
        remoteRepoPath: '/var/repos/payment-service',
        defaultBaseBranch: 'origin/main',
      },
      db
    );
    systemId = subsystem.id;
    const cr = await createChangeRequest(
      {
        name: 'Instant settlement',
        code: 'CR-2026-01',
        type: 'NEW_FEATURE',
        status: 'Open',
        targets: [{ systemId }],
      },
      db
    );
    crId = cr.id;
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('renders the CR picker, the 6-step list and the read-only Subsystems & Repos panel', async () => {
    const handleSelectStep = vi.fn();

    render(
      <SdlcSidebar
        projectId={crId}
        selectedStep="INTAKE"
        onSelectStep={handleSelectStep}
        activeCrId={crId}
        db={db}
      />
    );

    expect(screen.getAllByText(/Change Request \(CR\)/i).length).toBeGreaterThanOrEqual(1);
    expect(await screen.findByText('CR-2026-01')).toBeInTheDocument();

    // Steps
    expect(screen.getByText(/Bước 1: Nạp PL01 & PL02/i)).toBeInTheDocument();
    expect(screen.getByText(/Bước 2: Thiết kế giải pháp/i)).toBeInTheDocument();
    expect(screen.getByText(/Bước 3: Coding ngoài/i)).toBeInTheDocument();
    expect(screen.getByText(/Bước 4: Nạp Change Pack/i)).toBeInTheDocument();
    expect(screen.getByText(/Bước 5: Tài liệu kỹ thuật/i)).toBeInTheDocument();
    expect(screen.getByText(/Bước 6: Tờ trình CAB/i)).toBeInTheDocument();

    // Read-only panel replaces the deleted repo-config chip (D-37)
    expect(await screen.findByText('Subsystems & Repos')).toBeInTheDocument();
    expect(await screen.findByText('/var/repos/payment-service')).toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-btn-repo-config')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('sidebar-step-SOLUTION'));
    expect(handleSelectStep).toHaveBeenCalledWith('SOLUTION');
  });

  it('has no repo-config chip even before the CR resolves', async () => {
    render(
      <SdlcSidebar projectId={crId} selectedStep="INTAKE" onSelectStep={vi.fn()} db={db} />
    );
    await waitFor(() => expect(screen.getByTestId('sdlc-sidebar')).toBeInTheDocument());
    expect(screen.queryByTestId('sidebar-btn-repo-config')).not.toBeInTheDocument();
  });
});
