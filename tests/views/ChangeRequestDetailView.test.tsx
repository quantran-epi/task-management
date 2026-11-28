import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../src/db';
import { createSystem } from '../../src/db/repositories/systemRepo';
import { createChangeRequest } from '../../src/db/repositories/changeRequestRepo';
import { createTask } from '../../src/db/repositories/taskRepo';
import { createNote } from '../../src/db/repositories/noteRepo';
import { createCrMilestone } from '../../src/db/repositories/crMilestoneRepo';
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

  it('renders exactly the Mốc, Task, Subsystem, Status, Ước lượng, Hạn and Thao tác columns in order', async () => {
    const { cr } = await seed({ taskSystemId: 'a' });
    render(<ChangeRequestDetailView changeRequestId={cr.id} db={db} />);

    await screen.findByText('Implement OAuth callback');
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['Mốc', 'Task', 'Subsystem', 'Status', 'Ước lượng', 'Hạn', 'Thao tác']);
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

  it('lays out a full-width task table above a two-column grid of secondary blocks', async () => {
    const { cr } = await seed();
    render(<ChangeRequestDetailView changeRequestId={cr.id} db={db} />);

    await screen.findByRole('columnheader', { name: 'Task' });
    expect(screen.getByTestId('cr-detail-stats')).toBeInTheDocument();

    const table = screen.getByRole('columnheader', { name: 'Task' }).closest('table') as HTMLTableElement;
    const tableWrap = screen.getByTestId('cr-detail-task-table');
    const grid = screen.getByTestId('cr-detail-secondary-grid');
    const blockIds = [
      'cr-detail-block-reminders',
      'cr-detail-block-documents',
      'cr-detail-block-notes',
      'cr-detail-milestones',
      'cr-detail-block-jira',
    ];
    const blocks = blockIds.map((id) => screen.getByTestId(id));

    expect(tableWrap.contains(table)).toBe(true);
    expect(tableWrap.style.width).toBe('100%');
    expect(tableWrap.contains(grid)).toBe(false);
    expect(tableWrap.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    expect(grid.className).toContain('cr-detail-secondary-grid');
    expect(grid.querySelectorAll('style')).toHaveLength(0);
    expect(grid.style.gridTemplateColumns).toBe('');
    expect(grid.children).toHaveLength(5);
    expect(blocks.map((block) => Array.from(grid.children).findIndex((node) => node.contains(block)))).toEqual([0, 1, 2, 3, 4]);
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

  it('shows all three secondary blocks expanded with counts and body content, plus header meta', async () => {
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
    expect(screen.getByRole('button', { name: /Spec/ })).toHaveAttribute('title', 'https://example.com/doc');
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
    expect(statValue('LINKS')).toBe('1');
    expect(statValue('NHẮC NHỞ')).toBe('1');
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
    expect(screen.getByTestId('cr-detail-stats').textContent).toContain('NHẮC NHỞ1');
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

  async function seedLinkView() {
    const { cr } = await seed();
    render(<ThemeAppHolder><ChangeRequestDetailView changeRequestId={cr.id} db={db} /></ThemeAppHolder>);
    await screen.findByTestId('cr-detail-link-url');
    return cr;
  }

  function setLinkInput(testId: string, value: string) {
    const node = screen.getByTestId(testId);
    const input = (node.matches('input') ? node : node.querySelector('input')) as HTMLInputElement;
    fireEvent.change(input, { target: { value } });
  }

  it('shows the empty milestone state and creates a milestone inline with notes mounted on selection', async () => {
    const { cr } = await seed();
    render(<ThemeAppHolder><ChangeRequestDetailView changeRequestId={cr.id} db={db} /></ThemeAppHolder>);

    const section = await screen.findByTestId('cr-detail-milestones');
    await waitFor(() => {
      expect(screen.getByTestId('cr-detail-milestones-body').textContent).toContain('Chưa có mốc triển khai');
    });
    expect(section.textContent).toContain('Mốc triển khai');
    expect(screen.getByTestId('cr-detail-milestones-body').textContent).toContain('Thêm mốc để nhóm tác vụ theo từng đợt triển khai.');

    fireEvent.click(screen.getByTestId('cr-detail-milestone-add'));
    await waitFor(() => {
      expect(screen.getByTestId('cr-detail-milestone-name')).toBeInTheDocument();
    });
    const nameInput = screen.getByPlaceholderText('Tên mốc') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(await screen.findByText('Nhập tên mốc')).toBeInTheDocument();

    fireEvent.change(nameInput, { target: { value: 'Đợt 1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(async () => {
      const rows = await db.crMilestones.where('crId').equals(cr.id).toArray();
      expect(rows.map((m) => m.name)).toContain('Đợt 1');
    });
    const milestone = (await db.crMilestones.where('crId').equals(cr.id).toArray())[0]!;
    fireEvent.click(await screen.findByRole('button', { name: `Chọn mốc ${milestone.name}` }));
    await waitFor(() => {
      expect(screen.getByTestId('cr-detail-milestones-body').textContent).toContain('Chưa có ghi chú nào cho mục này');
    });
  }, 30000);

  it('shows Chưa gán mốc for tasks without a milestone and groups them last', async () => {
    const { cr } = await seed();
    const milestone = await createCrMilestone({ crId: cr.id, name: 'Đợt A' }, db);
    await createTask({ crId: cr.id, name: 'Task có mốc', status: 'Open', priority: 'Medium', estimateMinutes: 30, milestoneId: milestone.id }, db);
    render(<ChangeRequestDetailView changeRequestId={cr.id} db={db} />);

    await screen.findByText('Task có mốc');
    const columnHeaders = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(columnHeaders.indexOf('Mốc')).toBeLessThan(columnHeaders.indexOf('Task'));
    const cells = screen.getAllByText(/Chưa gán mốc \(1\)|Đợt A \(1\)/);
    expect(cells.map((c) => c.textContent)).toEqual(['Đợt A (1)', 'Chưa gán mốc (1)']);
  }, 30000);

  it('deletes a milestone through Popconfirm and keeps its tasks', async () => {
    const { cr } = await seed();
    const milestone = await createCrMilestone({ crId: cr.id, name: 'Đợt cần xóa' }, db);
    await createTask({ crId: cr.id, name: 'Task trong mốc', status: 'Open', priority: 'Medium', estimateMinutes: 30, milestoneId: milestone.id }, db);
    render(<ThemeAppHolder><ChangeRequestDetailView changeRequestId={cr.id} db={db} /></ThemeAppHolder>);

    await screen.findByText('Task trong mốc');
    const deleteButtons = screen.getAllByRole('button', { name: 'Xóa mốc' });
    fireEvent.click(deleteButtons[0]!);
    expect(await screen.findByText(`Xóa mốc «${milestone.name}»?`)).toBeInTheDocument();
    const confirmButtons = screen.getAllByRole('button', { name: 'Xóa' });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]!);

    await waitFor(async () => {
      expect(await db.crMilestones.get(milestone.id)).toBeUndefined();
    });
    expect((await db.tasks.toArray()).some((t) => t.milestoneId === milestone.id)).toBe(false);
    expect((await db.tasks.toArray()).some((t) => t.name === 'Task trong mốc')).toBe(true);
    await waitFor(() => expect(screen.queryByText('Đợt cần xóa')).not.toBeInTheDocument());
  }, 30000);

  it('adds a link with an empty name straight into cr.links and labels it with the URL', async () => {
    const cr = await seedLinkView();
    const url = 'https://example.com/runbook';

    setLinkInput('cr-detail-link-url', url);
    fireEvent.click(screen.getByTestId('cr-detail-link-add'));

    await waitFor(async () => {
      const stored = await db.changeRequests.get(cr.id);
      expect(stored?.links).toEqual([{ name: '', url }]);
    });
    const linkButton = screen.getByRole('button', { name: `link ${url}` });
    expect(linkButton).toHaveAttribute('title', url);
    expect(screen.getByTestId('cr-detail-stats').textContent).toContain('LINKS1');
    expect(screen.queryByText('Chỉnh sửa Change Request')).not.toBeInTheDocument();
    expect(screen.getByTestId('cr-detail-link-url')).toHaveValue('');
  }, 30000);

  it('adds a named link and shows the name with the URL as tooltip', async () => {
    const cr = await seedLinkView();
    const url = 'https://example.com/runbook';

    setLinkInput('cr-detail-link-name', 'Runbook');
    setLinkInput('cr-detail-link-url', url);
    fireEvent.click(screen.getByTestId('cr-detail-link-add'));

    await waitFor(async () => {
      const stored = await db.changeRequests.get(cr.id);
      expect(stored?.links).toEqual([{ name: 'Runbook', url }]);
    });
    expect(screen.getByRole('button', { name: 'link Runbook' })).toHaveAttribute('title', url);
    expect(screen.getByTestId('cr-detail-link-name')).toHaveValue('');
  }, 30000);

  it('rejects an unsafe URL without writing to cr.links', async () => {
    const cr = await seedLinkView();

    setLinkInput('cr-detail-link-url', 'javascript:alert(1)');
    fireEvent.click(screen.getByTestId('cr-detail-link-add'));

    await waitFor(() => {
      expect(screen.getByText('URL không hợp lệ')).toBeInTheDocument();
    });
    const stored = await db.changeRequests.get(cr.id);
    expect(stored?.links).toBeUndefined();
    expect(screen.getByTestId('cr-detail-stats').textContent).not.toContain('LINKS1');
  }, 30000);
});
