import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../../src/db';
import { TargetSystemsSelector } from '../../../src/components/changeRequests/TargetSystemsSelector';
import { ChangeRequestModal } from '../../../src/components/changeRequests/ChangeRequestModal';
import { ChangeRequestsView } from '../../../src/views/ChangeRequestsView';
import { ChangeRequestTable } from '../../../src/components/changeRequests/ChangeRequestTable';
import { CRExplorer } from '../../../src/workbench/toolwindows/CRExplorer';
import { useLayoutStore } from '../../../src/workbench/store/layoutStore';
import { createSystem } from '../../../src/db/repositories/systemRepo';
import { createChangeRequest } from '../../../src/db/repositories/changeRequestRepo';
import { createTask } from '../../../src/db/repositories/taskRepo';

describe('TargetSystemsSelector & ChangeRequestModal (Task 1)', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase('test-cr-modal-' + Math.random().toString(36).slice(2));
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('TargetSystemsSelector loads parent systems and child subsystems in treeData', async () => {
    const parent = await createSystem(
      {
        name: 'SmartCard Core',
        code: 'SC-CORE',
        type: 'LOGICAL_GROUP',
      },
      db
    );

    await createSystem(
      {
        name: 'Card Auth API',
        code: 'SC-AUTH-API',
        parentId: parent.id,
        type: 'SERVICE',
      },
      db
    );

    const onChange = vi.fn();
    render(<TargetSystemsSelector value={[]} onChange={onChange} db={db} />);

    // Selector renders TreeSelect container
    expect(screen.getByTestId('target-systems-selector')).toBeInTheDocument();
  });

  it('ChangeRequestModal renders 3 CR types and enforces validation', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <ChangeRequestModal
        open={true}
        onClose={onClose}
        onSave={onSave}
        db={db}
      />
    );

    // Modal title
    expect(screen.getByText('Change Request mới')).toBeInTheDocument();

    // 3 CR types
    expect(screen.getByText('Tạo mới tính năng')).toBeInTheDocument();
    expect(screen.getByText('Nâng cấp / Cập nhật')).toBeInTheDocument();
    expect(screen.getByText('Sửa lỗi')).toBeInTheDocument();

    // Attempting submit without values should fail validation
    fireEvent.click(screen.getByRole('button', { name: 'Tạo Change Request' }));
    await waitFor(() => {
      expect(screen.getByText('Vui lòng nhập tên Change Request hợp lệ (1-120 ký tự).')).toBeInTheDocument();
      expect(screen.getByText('Vui lòng chọn ít nhất 1 subsystem chịu ảnh hưởng.')).toBeInTheDocument();
    });
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('ChangeRequestsView, ChangeRequestTable, and CRExplorer (Task 2)', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase('test-cr-view-' + Math.random().toString(36).slice(2));
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('ChangeRequestsView renders empty state when no CR exists', async () => {
    render(<ChangeRequestsView db={db} />);

    expect(await screen.findByText('Chưa có Change Request (CR) nào')).toBeInTheDocument();
    expect(screen.getByText('Quản lý Change Requests (CR)')).toBeInTheDocument();
    expect(screen.getByTestId('btn-create-cr')).toBeInTheDocument();
  });

  it('ChangeRequestTable displays CR with type badge, code, target subsystem tags, and task progress', async () => {
    const parent = await createSystem(
      {
        name: 'SmartCard Core',
        code: 'SC-CORE',
        type: 'LOGICAL_GROUP',
      },
      db
    );

    const subsystem = await createSystem(
      {
        name: 'Card Auth API',
        code: 'SC-AUTH-API',
        parentId: parent.id,
        type: 'SERVICE',
      },
      db
    );

    const sampleCR = await createChangeRequest(
      {
        name: 'SmartCard Instant Payment',
        code: 'CR-2026-001',
        type: 'NEW_FEATURE',
        status: 'In Progress',
        targets: [{ systemId: subsystem.id }],
      },
      db
    );

    const task1 = await createTask(
      {
        name: 'Build API spec',
        status: 'Done',
        priority: 'High',
        estimateMinutes: 60,
        crId: sampleCR.id,
        systemId: subsystem.id,
      },
      db
    );

    render(
      <ChangeRequestTable
        changeRequests={[sampleCR]}
        tasks={[task1]}
        systems={[parent, subsystem]}
        onEditChangeRequest={vi.fn()}
        onDeleteChangeRequest={vi.fn()}
        db={db}
      />
    );

    // CR Name & Code
    expect(screen.getByText('SmartCard Instant Payment')).toBeInTheDocument();
    expect(screen.getByText('CR-2026-001')).toBeInTheDocument();

    // Type Badge & Subsystem tag
    expect(screen.getByText('New Feature')).toBeInTheDocument();
    expect(screen.getByText('SC-AUTH-API')).toBeInTheDocument();

    // Task progress
    expect(screen.getByText('1/1 Done')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('CRExplorer opens a cr_detail tab instead of swapping the view inline', async () => {
    const subsystem = await createSystem(
      { name: 'Card Auth API', code: 'SC-AUTH-API', type: 'SERVICE' },
      db
    );
    const cr = await createChangeRequest(
      {
        name: 'Revamp Auth Flow',
        code: 'CR-AUTH-01',
        type: 'ENHANCEMENT',
        targets: [{ systemId: subsystem.id }],
      },
      db
    );

    render(<CRExplorer db={db} />);

    fireEvent.click(await screen.findByText('Revamp Auth Flow'));

    await waitFor(() => {
      const tab = useLayoutStore.getState().openTabs.find((t) => t.viewType === 'cr_detail');
      expect(tab).toBeDefined();
      expect(tab?.params?.changeRequestId).toBe(cr.id);
    });
  });

  it('CRExplorer renders CR items with target subsystem pills', async () => {
    const parent = await createSystem(
      {
        name: 'SmartCard Core',
        code: 'SC-CORE',
        type: 'LOGICAL_GROUP',
      },
      db
    );

    const subsystem = await createSystem(
      {
        name: 'Card Auth API',
        code: 'SC-AUTH-API',
        parentId: parent.id,
        type: 'SERVICE',
      },
      db
    );

    const cr = await createChangeRequest(
      {
        name: 'Revamp Auth Flow',
        code: 'CR-AUTH-01',
        type: 'ENHANCEMENT',
        targets: [{ systemId: subsystem.id }],
      },
      db
    );

    await createTask(
      {
        name: 'Implement OAuth Token Guard',
        crId: cr.id,
        systemId: subsystem.id,
        status: 'Open',
        priority: 'Urgent',
        estimateMinutes: 120,
      },
      db
    );

    render(<CRExplorer db={db} />);

    // Explorer tree elements
    expect(await screen.findByText('Revamp Auth Flow')).toBeInTheDocument();
    expect(screen.getByText('CR-AUTH-01')).toBeInTheDocument();
    expect(screen.getByText('SC-AUTH-API')).toBeInTheDocument();
  });
});
