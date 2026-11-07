import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../src/db';
import { TaskDrawer } from '../../src/components/tasks/TaskDrawer';
import type { ChangeRequest, System } from '../../src/types/models';

const CR_A = '11111111-1111-4111-8111-111111111111';
const CR_B = '33333333-3333-4333-8333-333333333333';
const SYS_A = '22222222-2222-4222-8222-222222222222';
const SYS_B = '44444444-4444-4444-8444-444444444444';

const systems: System[] = [
  {
    id: SYS_A,
    code: 'PAYMENT_SVC',
    name: 'Payment Service',
    type: 'SERVICE',
    parentId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: SYS_B,
    code: 'LEDGER_SVC',
    name: 'Ledger Service',
    type: 'SERVICE',
    parentId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const changeRequests: ChangeRequest[] = [
  {
    id: CR_A,
    code: 'CR-2026-001',
    name: 'Thanh toán QR',
    type: 'NEW_FEATURE',
    status: 'In Progress',
    targets: [{ systemId: SYS_A }],
    opsOwners: ['NamNV'],
    businessAnalysts: ['HuongTT'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: CR_B,
    code: 'CR-2026-002',
    name: 'Sổ cái mới',
    type: 'ENHANCEMENT',
    status: 'Open',
    targets: [{ systemId: SYS_B }],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

describe('TaskDrawer', () => {
  let testDb: TaskPlannerDatabase;

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase(`test-drawer-${Math.random()}`);
    await testDb.open();
    await testDb.systems.bulkAdd(systems);
    await testDb.changeRequests.bulkAdd(changeRequests);
    vi.clearAllMocks();
  });

  const seedTask = async (overrides: Record<string, unknown> = {}) => {
    const now = new Date().toISOString();
    const task = {
      id: 'task-1',
      crId: CR_A,
      name: 'Implement OAuth callback',
      status: 'Open' as const,
      priority: 'High' as const,
      progress: 0,
      estimateMinutes: 90,
      workType: 'code' as const,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
    await testDb.tasks.add(task as never);
    return task;
  };

  it('renders a required Change Request (CR) select and an optional Subsystem select', async () => {
    const task = await seedTask({ systemId: SYS_A, notes: 'Handle PKCE verification code' });

    render(<TaskDrawer taskId={task.id} open={true} onClose={vi.fn()} db={testDb} />);

    expect(await screen.findByDisplayValue('Implement OAuth callback')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Handle PKCE verification code')).toBeInTheDocument();

    expect(screen.getByText('Thông tin chính')).toBeInTheDocument();
    expect(screen.getByText('Trạng thái & phân loại')).toBeInTheDocument();
    expect(screen.getByText('Thời gian & tiến độ')).toBeInTheDocument();
    expect(screen.getByText('Kế hoạch phân bổ')).toBeInTheDocument();
    expect(screen.getByText('Jira')).toBeInTheDocument();
    expect(screen.getByText('Tài liệu & ghi chú')).toBeInTheDocument();

    expect(screen.getByLabelText('Change Request (CR)')).toBeInTheDocument();
    expect(screen.getByLabelText('Subsystem')).toBeInTheDocument();
    expect(screen.queryByLabelText('Dự án')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Cột mốc')).not.toBeInTheDocument();

    expect(screen.getByLabelText('Giờ')).toHaveValue('1');
    expect(screen.getByLabelText('Phút')).toHaveValue('30');
  }, 30000);

  it('disables the Subsystem select with the Chọn CR trước tooltip while no CR is selected', async () => {
    const task = await seedTask();

    render(<TaskDrawer taskId={task.id} open={true} onClose={vi.fn()} db={testDb} />);
    await screen.findByDisplayValue('Implement OAuth callback');

    // Clear the CR select
    const crSelect = screen.getByLabelText('Change Request (CR)');
    fireEvent.mouseDown(crSelect);
    fireEvent.click(await screen.findByText('Thanh toán QR'));

    const subsystemSelect = screen.getByLabelText('Subsystem');
    expect(subsystemSelect).toBeDisabled();
    expect(screen.getByTitle('Chọn CR trước')).toBeInTheDocument();
  }, 30000);

  it('narrows Subsystem options to the CR targets plus Chung (không gắn)', async () => {
    const task = await seedTask();

    render(<TaskDrawer taskId={task.id} open={true} onClose={vi.fn()} db={testDb} />);
    await screen.findByDisplayValue('Implement OAuth callback');

    const subsystemSelect = screen.getByLabelText('Subsystem');
    fireEvent.mouseDown(subsystemSelect);

    expect(await screen.findByText('Payment Service')).toBeInTheDocument();
    expect(screen.getByText('Chung (không gắn)')).toBeInTheDocument();
    expect(screen.queryByText('Ledger Service')).not.toBeInTheDocument();
  }, 30000);

  it('clears a Subsystem that is not in the new CR targets when the CR changes', async () => {
    const task = await seedTask({ systemId: SYS_A });

    render(<TaskDrawer taskId={task.id} open={true} onClose={vi.fn()} db={testDb} />);
    await screen.findByDisplayValue('Implement OAuth callback');

    const crSelect = screen.getByLabelText('Change Request (CR)');
    fireEvent.mouseDown(crSelect);
    fireEvent.click(await screen.findByText('Sổ cái mới'));

    fireEvent.click(screen.getByRole('button', { name: /lưu tác vụ/i }));

    await waitFor(async () => {
      const updated = await testDb.tasks.get(task.id);
      expect(updated?.crId).toBe(CR_B);
    });

    const updated = await testDb.tasks.get(task.id);
    expect(updated?.systemId).toBeUndefined();
  }, 30000);

  it('saves crId and systemId, and writes undefined for Chung', async () => {
    const task = await seedTask();

    const onSave = vi.fn();
    render(
      <TaskDrawer taskId={task.id} open={true} onClose={vi.fn()} onSave={onSave} db={testDb} />
    );
    await screen.findByDisplayValue('Implement OAuth callback');

    const subsystemSelect = screen.getByLabelText('Subsystem');
    fireEvent.mouseDown(subsystemSelect);
    fireEvent.click(await screen.findByText('Payment Service'));

    fireEvent.click(screen.getByRole('button', { name: /lưu tác vụ/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    const updated = await testDb.tasks.get(task.id);
    expect(updated?.crId).toBe(CR_A);
    expect(updated?.systemId).toBe(SYS_A);
    expect(updated?.id).toBe(task.id); // Stable UUID preserved
  }, 30000);

  it('shows the inherited tags hint from the CR', async () => {
    await seedTask();

    render(<TaskDrawer taskId={'task-1'} open={true} onClose={vi.fn()} db={testDb} />);
    await screen.findByDisplayValue('Implement OAuth callback');

    expect(await screen.findByText(/Kế thừa: \[NamNV\] \(từ CR\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Kế thừa: \[HuongTT\] \(từ CR\)/i)).toBeInTheDocument();
  }, 30000);

  it('updates estimate using quick preset buttons (+30m, 1h, 2h, 4h, 8h) per D-21', async () => {
    await seedTask({ name: 'Preset task', estimateMinutes: 60 });

    render(<TaskDrawer taskId={'task-1'} open={true} onClose={vi.fn()} db={testDb} />);
    await screen.findByDisplayValue('Preset task');

    fireEvent.click(screen.getByRole('button', { name: '2h' }));
    expect(screen.getByLabelText('Giờ')).toHaveValue('2');
    expect(screen.getByLabelText('Phút')).toHaveValue('0');

    fireEvent.click(screen.getByRole('button', { name: '+30m' }));
    expect(screen.getByLabelText('Giờ')).toHaveValue('2');
    expect(screen.getByLabelText('Phút')).toHaveValue('30');
  }, 90000);

  it('validates document links with http/https regex per D-25, T-02-05', async () => {
    await seedTask({ name: 'Link task' });

    render(<TaskDrawer taskId={'task-1'} open={true} onClose={vi.fn()} db={testDb} />);
    await screen.findByDisplayValue('Link task');

    fireEvent.click(screen.getByRole('button', { name: /thêm liên kết/i }));

    const linkInput = screen.getByPlaceholderText('https://... hoặc C:\\folder hoặc /path/to/folder');
    fireEvent.change(linkInput, { target: { value: 'javascript:alert(1)' } });
    fireEvent.click(screen.getByRole('button', { name: /lưu tác vụ/i }));

    expect(
      await screen.findByText('Liên kết phải là URL (http/https), đường dẫn thư mục, hoặc file URI.')
    ).toBeInTheDocument();
  }, 60000);

  it('restores focus to trigger element on drawer close per D-29, D-30, UX-03', async () => {
    await seedTask({ name: 'Focus task' });

    const triggerBtn = document.createElement('button');
    document.body.appendChild(triggerBtn);
    triggerBtn.focus();

    const onClose = vi.fn();
    const { unmount } = render(
      <TaskDrawer
        taskId={'task-1'}
        open={true}
        onClose={onClose}
        triggerRef={triggerBtn}
        db={testDb}
      />
    );

    await screen.findByDisplayValue('Focus task');

    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalled();

    unmount();
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(document.activeElement).toBe(triggerBtn);

    document.body.removeChild(triggerBtn);
  });

  it('renders embedded TaskJiraSection with Jira linking capability per D-05, JIRA-03, JIRA-04', async () => {
    await seedTask({ name: 'Task with Jira Section' });

    render(<TaskDrawer taskId={'task-1'} open={true} onClose={vi.fn()} db={testDb} />);
    await screen.findByDisplayValue('Task with Jira Section');

    expect(screen.getByTestId('task-jira-section')).toBeInTheDocument();
    expect(screen.getByText('Tích hợp Jira Cloud')).toBeInTheDocument();
    expect(screen.getByText('Tác vụ chưa được liên kết với Jira Issue nào.')).toBeInTheDocument();
  });

  it('renders LinkedKnowledgeSection and triggers QuickPreviewDrawer on click', async () => {
    const { createNote } = await import('../../src/db/repositories/noteRepo');
    const doc = await createNote(
      {
        title: 'Tài liệu kiến trúc hệ thống',
        body: '# Kiến trúc\nChi tiết mô hình DB...',
        type: 'document',
      },
      testDb
    );

    await seedTask({
      name: 'Nhiệm vụ có doc liên kết',
      notes: `Ghi chú task [[doc:${doc.id}|Tài liệu kiến trúc hệ thống]]`,
      documentLinks: [doc.id],
    });

    render(<TaskDrawer taskId={'task-1'} open={true} onClose={vi.fn()} db={testDb} />);
    await screen.findByDisplayValue('Nhiệm vụ có doc liên kết');

    expect(await screen.findByText('Tài liệu kiến trúc hệ thống')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Tài liệu kiến trúc hệ thống'));
    expect(await screen.findByText('Mở trong Docs')).toBeInTheDocument();
  });
});
