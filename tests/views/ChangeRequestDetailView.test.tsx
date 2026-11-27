import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../src/db';
import { createSystem } from '../../src/db/repositories/systemRepo';
import { createChangeRequest } from '../../src/db/repositories/changeRequestRepo';
import { createTask } from '../../src/db/repositories/taskRepo';
import { createNote } from '../../src/db/repositories/noteRepo';
import { ChangeRequestDetailView } from '../../src/views/ChangeRequestDetailView';
import { ThemeAppHolder } from '../../src/components/ui';
import { useLayoutStore } from '../../src/workbench/store/layoutStore';

/**
 * Plan 31.2-13 Task 1 (ENT-NORM-04, D-31/D-32).
 *
 * `ChangeRequestDetailView` is the single-screen CR detail tab: header with target
 * subsystem pills, a flat CR-scoped task table whose Subsystem cell is constrained
 * to `cr.targets`, and three collapsed secondary blocks.
 */
describe('ChangeRequestDetailView (ENT-NORM-04)', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase('test-cr-detail-' + Math.random().toString(36).slice(2));
    await db.open();
    useLayoutStore.getState().resetLayout();
  });

  afterEach(async () => {
    await db.delete();
    vi.restoreAllMocks();
  });

  async function seed(opts: { targets?: boolean; taskSystemId?: 'a' | 'b' } = {}) {
    const sysA = await createSystem({ parentId: null, name: 'Payment Service', code: 'PAYMENT_SVC', type: 'SERVICE' }, db);
    const sysB = await createSystem({ parentId: null, name: 'Ledger Service', code: 'LEDGER_SVC', type: 'SERVICE' }, db);
    const cr = await createChangeRequest(
      {
        name: 'Thanh toán QR',
        code: 'CR-2026-001',
        type: 'NEW_FEATURE',
        status: 'In Progress',
        targets: opts.targets === false ? [] : [{ systemId: sysA.id }, { systemId: sysB.id }],
      },
      db
    );
    const task = await createTask(
      {
        crId: cr.id,
        name: 'Implement OAuth callback',
        ...(opts.taskSystemId === 'a' ? { systemId: sysA.id } : {}),
        ...(opts.taskSystemId === 'b' ? { systemId: sysB.id } : {}),
        status: 'Open',
        priority: 'High',
        estimateMinutes: 90,
        deadline: '2020-01-01',
      },
      db
    );
    return { sysA, sysB, cr, task };
  }

  function openSubsystemDropdown(taskId: string) {
    const cell = screen.getByTestId(`subsystem-cell-${taskId}`);
    fireEvent.mouseDown(cell.querySelector('.ant-select') as HTMLElement);
  }

  function optionTexts(): string[] {
    return Array.from(document.querySelectorAll('.ant-select-item-option')).map(
      (node) => node.textContent ?? ''
    );
  }

  function clickOption(text: string) {
    const option = Array.from(document.querySelectorAll('.ant-select-item-option')).find(
      (node) => node.textContent === text
    );
    if (!option) throw new Error(`Option not found: ${text}`);
    fireEvent.click(option);
  }

  it('renders the CR code, name, type tag with its type color, status tag and target subsystem pills', async () => {
    const { cr } = await seed();
    render(<ChangeRequestDetailView changeRequestId={cr.id} db={db} />);

    expect(await screen.findByText('CR-2026-001')).toBeInTheDocument();
    expect(screen.getByText('Thanh toán QR')).toBeInTheDocument();

    const typeTag = screen.getByText('Tạo mới').closest('.ant-tag') as HTMLElement;
    expect(typeTag).not.toBeNull();
    expect(typeTag.getAttribute('style') ?? '').toContain('var(--accent)');

    expect(screen.getByText('Đang chạy')).toBeInTheDocument();
    expect(screen.getByText('PAYMENT_SVC')).toBeInTheDocument();
    expect(screen.getByText('LEDGER_SVC')).toBeInTheDocument();
  }, 30000);

  it('renders the muted Chưa gắn subsystem text plus a Chọn subsystem link when the CR has no targets', async () => {
    const { cr } = await seed({ targets: false });
    render(<ChangeRequestDetailView changeRequestId={cr.id} db={db} />);

    expect(await screen.findByText('Chưa gắn subsystem')).toBeInTheDocument();
    expect(screen.getByText('Chọn subsystem')).toBeInTheDocument();
  }, 30000);

  it('renders exactly the Task, Subsystem, Status, Ước lượng, Hạn and Thao tác columns in order', async () => {
    const { cr } = await seed({ taskSystemId: 'a' });
    render(<ChangeRequestDetailView changeRequestId={cr.id} db={db} />);

    await screen.findByText('Implement OAuth callback');
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['Task', 'Subsystem', 'Status', 'Ước lượng', 'Hạn', 'Thao tác']);
  }, 30000);

  it('deletes the task via the shared action menu without double-deleting the placeholder', async () => {
    const { cr, task } = await seed({ taskSystemId: 'a' });
    render(<ThemeAppHolder><ChangeRequestDetailView changeRequestId={cr.id} db={db} /></ThemeAppHolder>);

    await screen.findByText('Implement OAuth callback');
    const more = screen.getAllByRole('button', { name: 'Thao tác khác' })[0]!;
    fireEvent.click(more);
    const deleteItems = await screen.findAllByText('Xóa');
    fireEvent.click(deleteItems[deleteItems.length - 1]!);

    expect(await screen.findByText(/Bạn có chắc muốn xóa "Implement OAuth callback"/)).toBeInTheDocument();
    const okButtons = screen.getAllByRole('button', { name: 'Xóa' });
    fireEvent.click(okButtons[okButtons.length - 1]!);

    await waitFor(() => {
      expect(screen.queryByText('Implement OAuth callback')).not.toBeInTheDocument();
    });
    expect(await db.tasks.get(task.id)).toBeUndefined();
  }, 30000);

  it('renders the task table full width with five secondary blocks in one stacked column', async () => {
    const { cr } = await seed();
    render(<ChangeRequestDetailView changeRequestId={cr.id} db={db} />);

    await screen.findByRole('columnheader', { name: 'Task' });
    expect(screen.getByTestId('cr-detail-stats')).toBeInTheDocument();

    const table = screen.getByRole('columnheader', { name: 'Task' }).closest('table') as HTMLTableElement;
    const blockIds = [
      'cr-detail-block-notes',
      'cr-detail-block-jira',
      'cr-detail-block-documents',
      'cr-detail-block-quick-links',
      'cr-detail-block-reminders',
    ];
    const blocks = blockIds.map((id) => screen.getByTestId(id));

    let stack: HTMLElement | null = table;
    while (stack && !blocks.every((block) => stack!.contains(block))) {
      stack = stack.parentElement;
    }
    expect(stack).not.toBeNull();
    expect(stack!.getAttribute('style') ?? '').toContain('flex-direction: column');
    expect(stack!.querySelector('[style*="grid-template-columns"]')).toBeNull();

    const children = Array.from(stack!.children) as HTMLElement[];
    const tableIndex = children.findIndex((node) => node.contains(table));
    expect(tableIndex).toBeGreaterThanOrEqual(0);
    expect(blocks.map((block) => children.findIndex((node) => node.contains(block)))).toEqual([
      tableIndex + 1,
      tableIndex + 2,
      tableIndex + 3,
      tableIndex + 4,
      tableIndex + 5,
    ]);
  }, 30000);

  it('offers only the CR targets plus Chung (không gắn) in the Subsystem cell', async () => {
    const { cr, task } = await seed({ taskSystemId: 'a' });
    render(<ChangeRequestDetailView changeRequestId={cr.id} db={db} />);

    await screen.findByText('Implement OAuth callback');
    openSubsystemDropdown(task.id);

    await waitFor(() => {
      expect(optionTexts()).toEqual(['Payment Service (PAYMENT_SVC)', 'Ledger Service (LEDGER_SVC)', 'Chung (không gắn)']);
    });
  }, 30000);

  it('writes the new systemId through updateTask when a different target is selected', async () => {
    const { cr, task, sysB } = await seed({ taskSystemId: 'a' });
    render(<ChangeRequestDetailView changeRequestId={cr.id} db={db} />);

    await screen.findByText('Implement OAuth callback');
    openSubsystemDropdown(task.id);
    await waitFor(() => expect(optionTexts()).toContain('Ledger Service (LEDGER_SVC)'));
    clickOption('Ledger Service (LEDGER_SVC)');

    await waitFor(async () => {
      const updated = await db.tasks.get(task.id);
      expect(updated?.systemId).toBe(sysB.id);
    });
  }, 30000);

  it('clears systemId when Chung (không gắn) is selected', async () => {
    const { cr, task } = await seed({ taskSystemId: 'a' });
    render(<ChangeRequestDetailView changeRequestId={cr.id} db={db} />);

    await screen.findByText('Implement OAuth callback');
    openSubsystemDropdown(task.id);
    await waitFor(() => expect(optionTexts()).toContain('Payment Service (PAYMENT_SVC)'));
    clickOption('Chung (không gắn)');

    await waitFor(async () => {
      const updated = await db.tasks.get(task.id);
      expect(updated?.systemId).toBeUndefined();
    });
  }, 30000);

  it('shows the CR này chưa có tác vụ nào empty state when the CR has no tasks', async () => {
    const sysA = await createSystem({ parentId: null, name: 'Payment Service', code: 'PAYMENT_SVC', type: 'SERVICE' }, db);
    const cr = await createChangeRequest(
      { status: 'Open', name: 'Thanh toán QR', code: 'CR-2026-002', type: 'ENHANCEMENT', targets: [{ systemId: sysA.id }] },
      db
    );
    render(<ChangeRequestDetailView changeRequestId={cr.id} db={db} />);

    expect(await screen.findByText('CR này chưa có tác vụ nào')).toBeInTheDocument();
  }, 30000);

  it('shows all four secondary blocks expanded with counts and body content, plus header meta', async () => {
    const sysA = await createSystem({ parentId: null, name: 'Payment Service', code: 'PAYMENT_SVC', type: 'SERVICE' }, db);
    const cr = await createChangeRequest(
      { status: 'Open',
        name: 'Thanh toán QR',
        code: 'CR-2026-003',
        type: 'BUGFIX',
        targets: [{ systemId: sysA.id }],
        jiraEpicKey: 'EPIC-42',
        links: [{ name: 'Spec', url: 'https://example.com/doc' }],
        reminders: [{ id: '11111111-1111-4111-8111-111111111111', date: '2026-12-01' }],
      },
      db
    );
    render(<ChangeRequestDetailView changeRequestId={cr.id} db={db} />);

    await screen.findByText('CR-2026-003');

    expect(screen.getByTestId('cr-detail-block-jira').textContent).toContain('1');
    expect(screen.getByTestId('cr-detail-block-documents').textContent).toContain('1');
    expect(screen.getByTestId('cr-detail-block-reminders').textContent).toContain('1');

    // Bodies are mounted without any click.
    expect(screen.getAllByText('EPIC-42').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'https://example.com/doc' })).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link', { name: 'https://example.com/doc' })).toHaveAttribute('rel', 'noreferrer');
    expect(screen.getAllByText(/2026-12-01/).length).toBeGreaterThan(0);
    expect(screen.getByText(cr.updatedAt.slice(0, 10))).toBeInTheDocument();
  }, 30000);

  it('renders a stats strip from already-loaded tasks, notes, documents and reminders', async () => {
    const sysA = await createSystem({ parentId: null, name: 'Payment Service', code: 'PAYMENT_SVC', type: 'SERVICE' }, db);
    const cr = await createChangeRequest(
      { status: 'Open',
        name: 'Thanh toán QR',
        code: 'CR-2026-005',
        type: 'NEW_FEATURE',
        targets: [{ systemId: sysA.id }],
        links: [{ name: 'Spec', url: 'https://example.com/doc' }],
        reminders: [{ id: '11111111-1111-4111-8111-111111111111', date: '2026-12-01' }],
      },
      db
    );
    await createTask(
      { crId: cr.id, name: 'Implement OAuth callback', status: 'Open', priority: 'High', estimateMinutes: 90, deadline: '2020-01-01' },
      db
    );
    await createNote({ body: 'Nội dung CR 1', title: 'Ghi chú CR một', entityType: 'cr', entityId: cr.id }, db);
    await createNote({ body: 'Nội dung CR 2', title: 'Ghi chú CR hai', entityType: 'cr', entityId: cr.id }, db);

    render(<ChangeRequestDetailView changeRequestId={cr.id} db={db} />);

    const strip = await screen.findByTestId('cr-detail-stats');
    const statValue = (label: string): string => {
      const key = Array.from(strip.querySelectorAll('span')).find((node) => node.textContent === label);
      return key?.parentElement?.textContent?.slice(label.length) ?? '';
    };
    expect(statValue('TASK')).toBe('1');
    expect(statValue('MỞ / PENDING')).toBe('1');
    expect(statValue('ƯỚC TÍNH')).toBe('1h 30m');
    expect(statValue('HOÀN THÀNH')).toBe('0/1');
    expect(statValue('GHI CHÚ')).toBe('2');
    expect(statValue('DOC / REMINDER')).toBe('1 / 1');
  }, 30000);

  it('keeps reminder count consistent between stats strip and Nhắc nhở badge for legacy reminderDate', async () => {
    const sysA = await createSystem({ parentId: null, name: 'Payment Service', code: 'PAYMENT_SVC', type: 'SERVICE' }, db);
    const cr = await createChangeRequest(
      { status: 'Open', name: 'Legacy reminder', code: 'CR-2026-006', type: 'NEW_FEATURE',
        targets: [{ systemId: sysA.id }], reminders: [], reminderDate: '2026-12-05' },
      db
    );

    render(<ChangeRequestDetailView changeRequestId={cr.id} db={db} />);
    await screen.findByTestId('cr-detail-stats');

    expect(screen.getByTestId('cr-detail-block-reminders').textContent).toContain('1');
    expect(screen.getByTestId('cr-detail-stats').textContent).toContain('DOC / REMINDER0 / 1');
  }, 30000);

  it('counts only cr notes in the Ghi chú block and renders them without a click', async () => {
    const { cr } = await seed();
    await createNote({ body: 'Nội dung CR 1', title: 'Ghi chú CR một', entityType: 'cr', entityId: cr.id }, db);
    await createNote({ body: 'Nội dung CR 2', title: 'Ghi chú CR hai', entityType: 'cr', entityId: cr.id }, db);
    await createNote({ body: 'Nhiễu', title: 'Ghi chú nhiễu task', entityType: 'task', entityId: cr.id }, db);
    const deleted = await createNote({ body: 'Đã xóa', title: 'Ghi chú đã xóa', entityType: 'cr', entityId: cr.id }, db);
    await db.notes.update(deleted.id, { deletedAt: new Date().toISOString() });

    render(<ChangeRequestDetailView changeRequestId={cr.id} db={db} />);

    const block = await screen.findByTestId('cr-detail-block-notes');
    await waitFor(() => expect(block.textContent).toContain('2'));
    expect(await screen.findByText('Ghi chú liên kết')).toBeInTheDocument();
    expect(await screen.findByText('Ghi chú CR một')).toBeInTheDocument();
    expect(await screen.findByText('Ghi chú CR hai')).toBeInTheDocument();
    expect(screen.queryByText('Ghi chú nhiễu task')).not.toBeInTheDocument();
    expect(screen.queryByText('Ghi chú đã xóa')).not.toBeInTheDocument();
  }, 30000);

  it('does not delete existing task when task drawer is opened and closed without saving', async () => {
    const { cr, task } = await seed({ taskSystemId: 'a' });
    render(<ChangeRequestDetailView changeRequestId={cr.id} db={db} />);

    const taskElement = await screen.findByText('Implement OAuth callback');
    fireEvent.click(taskElement);

    // Drawer should open with "Chỉnh sửa tác vụ"
    const cancelButton = await screen.findByRole('button', { name: 'Hủy' });
    fireEvent.click(cancelButton);

    // Wait and ensure task still exists in DB and in view
    await waitFor(async () => {
      const persisted = await db.tasks.get(task.id);
      expect(persisted).toBeDefined();
      expect(persisted?.name).toBe('Implement OAuth callback');
    });
    expect(screen.getByText('Implement OAuth callback')).toBeInTheDocument();
  }, 30000);

  it('deletes newly created placeholder task when task drawer is cancelled without saving (WR-13)', async () => {
    const sysA = await createSystem({ parentId: null, name: 'Payment Service', code: 'PAYMENT_SVC', type: 'SERVICE' }, db);
    const cr = await createChangeRequest(
      { status: 'Open', name: 'Thanh toán QR', code: 'CR-2026-004', type: 'ENHANCEMENT', targets: [{ systemId: sysA.id }] },
      db
    );
    render(<ChangeRequestDetailView changeRequestId={cr.id} db={db} />);

    await screen.findByText('CR-2026-004');
    const addButtons = await screen.findAllByRole('button', { name: /Thêm tác vụ/ });
    expect(addButtons[0]).toBeDefined();
    fireEvent.click(addButtons[0]!);

    // Wait for drawer with "Hủy" button
    const cancelButton = await screen.findByRole('button', { name: 'Hủy' });
    fireEvent.click(cancelButton);

    // Placeholder task should be cleaned up
    await waitFor(async () => {
      const tasksInCr = await db.tasks.where('crId').equals(cr.id).toArray();
      expect(tasksInCr).toHaveLength(0);
    });
  }, 30000);

  async function seedFilterTasks() {
    const seeded = await seed();
    const inProgress = await createTask(
      {
        crId: seeded.cr.id,
        name: 'Nghiệm Thu',
        status: 'In Progress',
        priority: 'Medium',
        estimateMinutes: 30,
      },
      db
    );
    return { ...seeded, inProgress };
  }

  function taskRows(): HTMLElement[] {
    return Array.from(document.querySelectorAll('table tbody tr.ant-table-row')) as HTMLElement[];
  }

  function openStatusFilter() {
    const root = screen.getByTestId('cr-detail-status-filter');
    const target = root.matches('.ant-select') ? root : (root.querySelector('.ant-select') ?? root);
    fireEvent.mouseDown(target);
  }

  function changeSearch(value: string) {
    const input = screen.getByTestId('cr-detail-task-search').querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value } });
  }

  it('filters tasks by name without diacritics through cr-detail-task-search', async () => {
    const { cr } = await seedFilterTasks();
    render(<ChangeRequestDetailView changeRequestId={cr.id} db={db} />);
    await screen.findByText('Implement OAuth callback');
    expect(taskRows()).toHaveLength(2);

    changeSearch('oauth');

    await waitFor(() => expect(taskRows()).toHaveLength(1));
    expect(screen.getByText('Implement OAuth callback')).toBeInTheDocument();
    expect(screen.queryByText('Nghiệm Thu')).not.toBeInTheDocument();
  }, 30000);

  it('filters tasks by status and combines name and status with AND', async () => {
    const { cr } = await seedFilterTasks();
    render(<ChangeRequestDetailView changeRequestId={cr.id} db={db} />);
    await screen.findByText('Implement OAuth callback');

    openStatusFilter();
    await waitFor(() => expect(optionTexts()).toContain('Đang làm'));
    clickOption('Đang làm');

    await waitFor(() => expect(taskRows()).toHaveLength(1));
    expect(screen.getByText('Nghiệm Thu')).toBeInTheDocument();
    expect(screen.queryByText('Implement OAuth callback')).not.toBeInTheDocument();

    changeSearch('nghiem thu');
    await waitFor(() => expect(taskRows()).toHaveLength(1));
    expect(screen.getByText('Nghiệm Thu')).toBeInTheDocument();

    changeSearch('oauth');
    await waitFor(() => expect(screen.getByText('Không có tác vụ phù hợp')).toBeInTheDocument());
  }, 30000);

  it('shows a filter-only empty state with stats from all tasks and a clear-filter button', async () => {
    const { cr } = await seedFilterTasks();
    render(<ChangeRequestDetailView changeRequestId={cr.id} db={db} />);
    const strip = await screen.findByTestId('cr-detail-stats');
    expect(strip.textContent).toContain('TASK2');

    changeSearch('không khớp');

    expect(await screen.findByText('Không có tác vụ phù hợp')).toBeInTheDocument();
    expect(screen.getByTestId('cr-detail-stats').textContent).toContain('TASK2');
    expect(screen.getByTestId('cr-detail-block-notes')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Xóa lọc' }));
    await waitFor(() => expect(taskRows()).toHaveLength(2));
  }, 30000);

  it('restores all tasks when the status filter returns to Tất cả', async () => {
    const { cr } = await seedFilterTasks();
    render(<ChangeRequestDetailView changeRequestId={cr.id} db={db} />);
    await screen.findByText('Implement OAuth callback');

    openStatusFilter();
    await waitFor(() => expect(optionTexts()).toContain('Đang làm'));
    clickOption('Đang làm');
    await waitFor(() => expect(taskRows()).toHaveLength(1));

    openStatusFilter();
    await waitFor(() => expect(optionTexts()).toContain('Tất cả'));
    clickOption('Tất cả');
    await waitFor(() => expect(taskRows()).toHaveLength(2));
  }, 30000);

  it('renders Tải lại button and triggers reloadTab', async () => {
    const { cr } = await seed();
    render(<ChangeRequestDetailView changeRequestId={cr.id} db={db} />);

    const reloadBtn = await screen.findByRole('button', { name: /Tải lại/i });
    expect(reloadBtn).toBeInTheDocument();

    expect(useLayoutStore.getState().tabReloadKeys[`cr-${cr.id}`]).toBeUndefined();
    fireEvent.click(reloadBtn);
    expect(useLayoutStore.getState().tabReloadKeys[`cr-${cr.id}`]).toBe(1);
  }, 30000);
});
