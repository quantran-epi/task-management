import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../src/db';
import { ChangeRequestTable } from '../../src/components/changeRequests/ChangeRequestTable';
import { ChangeRequestModal } from '../../src/components/changeRequests/ChangeRequestModal';
import { SystemTable } from '../../src/components/systems/SystemTable';
import { HierarchyBreadcrumb } from '../../src/components/tasks/HierarchyBreadcrumb';
import type { ChangeRequest, System, Task } from '../../src/types/models';

/**
 * D-46/D-47: the only hierarchy above a task is `CR > Subsystem`. The project/milestone tier
 * and its modals were deleted in the 31.2 normalization, so this suite covers the surviving
 * breadcrumb plus the CR and System tables that replaced the old project table.
 */
describe('CR → Subsystem hierarchy components', () => {
  let db: TaskPlannerDatabase;

  const sampleCr: ChangeRequest = {
    id: 'cr-1',
    code: 'CR-2026-001',
    name: 'Website Redesign',
    description: 'Revamp public marketing site',
    status: 'In Progress',
    type: 'ENHANCEMENT',
    targets: [{ systemId: 'sys-1' }],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  // `SystemTable` renders parents and their children only, so the fixture is a real pair.
  const sampleGroup: System = {
    id: 'grp-1',
    name: 'Payments Domain',
    code: 'PAY-GRP',
    parentId: null,
    type: 'LOGICAL_GROUP',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const sampleSystem: System = {
    id: 'sys-1',
    name: 'Payments API',
    code: 'PAY-API',
    parentId: 'grp-1',
    type: 'SERVICE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const sampleTask: Task = {
    id: 'task-1',
    crId: 'cr-1',
    systemId: 'sys-1',
    name: 'Design mockups',
    status: 'Open',
    priority: 'High',
    estimateMinutes: 120,
    progress: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(async () => {
    db = new TaskPlannerDatabase('test-hierarchy-' + Math.random().toString(36).slice(2));
    await db.open();
    await db.changeRequests.add(sampleCr);
    await db.systems.add(sampleGroup);
    await db.systems.add(sampleSystem);
    await db.tasks.add(sampleTask);
  });

  afterEach(async () => {
    await db.delete();
  });

  it('HierarchyBreadcrumb renders CR > Subsystem and calls onSelectCr', () => {
    const onSelectCr = vi.fn();
    render(
      <HierarchyBreadcrumb
        crId="cr-1"
        crCode="CR-2026-001"
        crName="Website Redesign"
        systemCode="PAY-API"
        systemName="Payments API"
        onSelectCr={onSelectCr}
      />
    );

    const badge = screen.getByText('CR-2026-001 > PAY-API');
    expect(badge).toBeInTheDocument();
    fireEvent.click(badge);
    expect(onSelectCr).toHaveBeenCalledWith('cr-1');
  });

  it('HierarchyBreadcrumb renders the standalone marker when no CR is attached', () => {
    render(<HierarchyBreadcrumb />);
    expect(screen.getByText('Chưa gắn CR')).toBeInTheDocument();
  });

  it('ChangeRequestTable renders CRs with their subsystem targets and task counts', async () => {
    const onViewTasks = vi.fn();
    const onOpenSdlcStudio = vi.fn();
    render(
      <ChangeRequestTable
        changeRequests={[sampleCr]}
        tasks={[sampleTask]}
        systems={[sampleSystem]}
        onEditChangeRequest={vi.fn()}
        onDeleteChangeRequest={vi.fn()}
        onViewTasks={onViewTasks}
        onOpenSdlcStudio={onOpenSdlcStudio}
        db={db}
      />
    );

    expect(await screen.findByText('Website Redesign')).toBeInTheDocument();
    expect(screen.getByText('CR-2026-001')).toBeInTheDocument();
    expect(screen.getByText('Đang làm')).toBeInTheDocument();
    expect(screen.getByText('PAY-API')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Website Redesign'));
    expect(onViewTasks).toHaveBeenCalledWith('cr-1');

    fireEvent.click(screen.getByRole('button', { name: /SDLC/ }));
    expect(onOpenSdlcStudio).toHaveBeenCalledWith('cr-1');
  });

  it('ChangeRequestModal refuses to save a CR with no target subsystem', async () => {
    const onSave = vi.fn();
    render(<ChangeRequestModal open={true} onClose={vi.fn()} onSave={onSave} db={db} />);

    expect(screen.getByText('Change Request mới')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Tên Change Request/i), {
      target: { value: 'Brand New System' },
    });
    fireEvent.change(screen.getByLabelText(/Mã CR/i), { target: { value: 'CR-2026-777' } });
    fireEvent.click(screen.getByRole('button', { name: /Tạo Change Request/i }));

    // `targets` is required (min 1): the form blocks the save and shows the field error.
    expect(
      await screen.findByText(/Vui lòng chọn ít nhất 1 subsystem chịu ảnh hưởng/i)
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('SystemTable renders subsystems and offers the add-subsystem action', () => {
    const onAddSubsystem = vi.fn();
    render(
      <SystemTable
        systems={[sampleGroup, sampleSystem]}
        onAddSubsystem={onAddSubsystem}
        onEditSystem={vi.fn()}
        onDeleteSystem={vi.fn()}
      />
    );

    expect(screen.getByText('Payments API')).toBeInTheDocument();
    expect(screen.getByText('PAY-API')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Thêm subsystem/i }));
    expect(onAddSubsystem).toHaveBeenCalledWith('grp-1');
  });
});
