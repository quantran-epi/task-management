import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../src/db';
import { createSystem } from '../../src/db/repositories/systemRepo';
import { createChangeRequest } from '../../src/db/repositories/changeRequestRepo';
import { createTask } from '../../src/db/repositories/taskRepo';
import { ChangeRequestDetailView } from '../../src/views/ChangeRequestDetailView';
import { useLayoutStore } from '../../src/workbench/store/layoutStore';

/**
 * Plan 31.2-13 Task 1 (ENT-NORM-04, D-31/D-32).
 *
 * `ChangeRequestDetailView` is the single-screen CR detail tab: header with target
 * subsystem pills, a 6-step SDLC progress strip that deep-links into the SDLC tab,
 * a flat CR-scoped task table whose Subsystem cell is constrained to `cr.targets`,
 * and three collapsed secondary blocks.
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
    expect(typeTag.getAttribute('style') ?? '').toMatch(/1677ff|22,\s*119,\s*255/i);

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

  it('renders the six SDLC progress steps with their short labels', async () => {
    const { cr } = await seed();
    render(<ChangeRequestDetailView changeRequestId={cr.id} db={db} />);

    await screen.findByText('CR-2026-001');
    for (const label of ['Nạp yêu cầu', 'Giải pháp', 'Coding', 'Change Pack', 'Tài liệu', 'CAB']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  }, 30000);

  it('opens the SDLC tab at the clicked step', async () => {
    const { cr } = await seed();
    render(<ChangeRequestDetailView changeRequestId={cr.id} db={db} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Coding' }));

    await waitFor(() => {
      const tab = useLayoutStore.getState().openTabs.find((t) => t.id === `sdlc-${cr.id}`);
      expect(tab).toBeDefined();
      expect(tab?.viewType).toBe('sdlc');
      expect(tab?.params?.stepId).toBe('CODE_GUIDE');
      expect(tab?.params?.changeRequestId).toBe(cr.id);
    });
  }, 30000);

  it('renders exactly the Task, Subsystem, Status, Ước lượng and Hạn columns in order', async () => {
    const { cr } = await seed({ taskSystemId: 'a' });
    render(<ChangeRequestDetailView changeRequestId={cr.id} db={db} />);

    await screen.findByText('Implement OAuth callback');
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['Task', 'Subsystem', 'Status', 'Ước lượng', 'Hạn']);
  }, 30000);

  it('offers only the CR targets plus Chung (không gắn) in the Subsystem cell', async () => {
    const { cr, task } = await seed({ taskSystemId: 'a' });
    render(<ChangeRequestDetailView changeRequestId={cr.id} db={db} />);

    await screen.findByText('Implement OAuth callback');
    openSubsystemDropdown(task.id);

    await waitFor(() => {
      expect(optionTexts()).toEqual(['PAYMENT_SVC', 'LEDGER_SVC', 'Chung (không gắn)']);
    });
  }, 30000);

  it('writes the new systemId through updateTask when a different target is selected', async () => {
    const { cr, task, sysB } = await seed({ taskSystemId: 'a' });
    render(<ChangeRequestDetailView changeRequestId={cr.id} db={db} />);

    await screen.findByText('Implement OAuth callback');
    openSubsystemDropdown(task.id);
    await waitFor(() => expect(optionTexts()).toContain('LEDGER_SVC'));
    clickOption('LEDGER_SVC');

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
    await waitFor(() => expect(optionTexts()).toContain('Chung (không gắn)'));
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

  it('keeps the three secondary blocks collapsed by default and badges their counts', async () => {
    const sysA = await createSystem({ parentId: null, name: 'Payment Service', code: 'PAYMENT_SVC', type: 'SERVICE' }, db);
    const cr = await createChangeRequest(
      { status: 'Open',
        name: 'Thanh toán QR',
        code: 'CR-2026-003',
        type: 'BUGFIX',
        targets: [{ systemId: sysA.id }],
        jiraEpicKey: 'EPIC-42',
        documentLinks: ['https://example.com/doc'],
        reminders: [{ id: '11111111-1111-4111-8111-111111111111', date: '2026-12-01' }],
      },
      db
    );
    render(<ChangeRequestDetailView changeRequestId={cr.id} db={db} />);

    await screen.findByText('CR-2026-003');

    expect(screen.getByTestId('cr-detail-block-jira').textContent).toContain('1');
    expect(screen.getByTestId('cr-detail-block-documents').textContent).toContain('1');
    expect(screen.getByTestId('cr-detail-block-reminders').textContent).toContain('1');

    // Collapsed: no panel body is mounted yet.
    expect(screen.queryByText('Chưa có')).not.toBeInTheDocument();
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

  it('updates SDLC step completion based on persisted workflow state', async () => {
    const { cr } = await seed();
    // Persist SDLC workflow state for this CR with pl01, pl02 (INTAKE) and solution (SOLUTION & CODE_GUIDE)
    await db.settings.put({
      key: `sdlc_workflow:${cr.id}:default-thread`,
      value: JSON.stringify({
        artifacts: {
          pl01: { content: 'PL01 content' },
          pl02: { content: 'PL02 content' },
          solution: { content: 'Solution doc' },
        },
      }),
    });

    render(<ChangeRequestDetailView changeRequestId={cr.id} db={db} />);

    await waitFor(() => {
      const intakeBtn = screen.getByRole('button', { name: 'Nạp yêu cầu' });
      expect(intakeBtn.querySelector('.anticon-check-circle')).not.toBeNull();
      const solutionBtn = screen.getByRole('button', { name: 'Giải pháp' });
      expect(solutionBtn.querySelector('.anticon-check-circle')).not.toBeNull();
      const cabBtn = screen.getByRole('button', { name: 'CAB' });
      expect(cabBtn.querySelector('.anticon-check-circle')).toBeNull();
    });
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
