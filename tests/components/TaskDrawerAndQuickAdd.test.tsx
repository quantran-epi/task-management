import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../src/db';
import { message } from 'antd';
import { QuickAddBar } from '../../src/components/tasks/QuickAddBar';
import { TaskDrawer } from '../../src/components/tasks/TaskDrawer';
import type { ChangeRequest, System, Task } from '../../src/types/models';

vi.mock('antd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('antd')>();
  return {
    ...actual,
    message: { success: vi.fn(), info: vi.fn(), error: vi.fn(), warning: vi.fn() },
  };
});

describe('QuickAddBar and TaskDrawer Banking IT Fields', () => {
  let db: TaskPlannerDatabase;

  // D-46/D-47: ops-owner and BA inheritance now flows from the CR only.
  const sampleSystems: System[] = [
    {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Payments API',
      code: 'PAY-API',
      parentId: null,
      type: 'SERVICE',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];

  const sampleChangeRequests: ChangeRequest[] = [
    {
      id: '22222222-2222-4222-8222-222222222222',
      code: 'CR-2026-001',
      name: 'Core Banking Modernization',
      status: 'In Progress',
      type: 'ENHANCEMENT',
      targets: [{ systemId: '11111111-1111-4111-8111-111111111111' }],
      opsOwners: ['NamNV'],
      businessAnalysts: ['HuongTT'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];

  const sampleTask: Task = {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Implement Interbank Transfer API',
    crId: '22222222-2222-4222-8222-222222222222',
    systemId: '11111111-1111-4111-8111-111111111111',
    status: 'Open',
    priority: 'High',
    workType: 'code',
    estimateMinutes: 120,
    progress: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(async () => {
    db = new TaskPlannerDatabase('test-quickadd-drawer-' + Math.random().toString(36).slice(2));
    await db.open();
    await db.systems.bulkAdd(sampleSystems);
    await db.changeRequests.bulkAdd(sampleChangeRequests);
    await db.tasks.add(sampleTask);
  });

  afterEach(async () => {
    await db.delete();
  });

  it('QuickAddBar defaults workType to code and allows task creation with workType', async () => {
    const onTaskCreated = vi.fn();
    render(
      <QuickAddBar
        changeRequests={sampleChangeRequests}
        systems={sampleSystems}
        activeCrId="22222222-2222-4222-8222-222222222222"
        onTaskCreated={onTaskCreated}
        db={db}
      />
    );

    // Check default workType label "Lập trình" is rendered
    expect(screen.getByText('Lập trình')).toBeInTheDocument();

    const input = screen.getByLabelText('Thêm nhanh tên tác vụ và ước tính');
    fireEvent.change(input, { target: { value: 'Fix payment gateway bug ~1h' } });

    const submitBtn = screen.getByRole('button', { name: 'Thêm' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(onTaskCreated).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Fix payment gateway bug',
          estimateMinutes: 60,
          workType: 'code',
        })
      );
    });
  });

  it('TaskDrawer renders workType, opsOwners, and businessAnalysts form inputs with inheritance hints', async () => {
    render(
      <TaskDrawer
        taskId="33333333-3333-4333-8333-333333333333"
        open={true}
        onClose={vi.fn()}
        db={db}
      />
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Implement Interbank Transfer API')).toBeInTheDocument();
    });

    // Check workType label is present
    expect(screen.getByText('Loại công việc')).toBeInTheDocument();
    // Check Ops Owner and BA labels are present
    expect(screen.getByText('Ops Owner')).toBeInTheDocument();
    expect(screen.getByText('Business Analyst')).toBeInTheDocument();

    // Inheritance hint: both tag lists come from the CR.
    await waitFor(() => {
      expect(screen.getByText(/Kế thừa: \[NamNV\] \(từ CR\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Kế thừa: \[HuongTT\] \(từ CR\)/i)).toBeInTheDocument();
    });
  });
});
