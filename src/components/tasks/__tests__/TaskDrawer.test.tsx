// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ThemeAppHolder } from '../../ui';
import { TaskPlannerDatabase } from '../../../db';
import { TaskDrawer } from '../TaskDrawer';

const CR_A = '11111111-1111-4111-8111-111111111111';
const CR_B = '33333333-3333-4333-8333-333333333333';
const MS_A = '22222222-2222-4222-8222-222222222222';
const MS_B = '44444444-4444-4444-8444-444444444444';
const SYS_A = '55555555-5555-4555-8555-555555555555';
const SYS_B = '66666666-6666-4666-8666-666666666666';

describe('TaskDrawer milestone select', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`test-drawer-ms-${Math.random()}`);
    await db.open();
    const now = new Date().toISOString();
    await db.systems.bulkAdd([
      { id: SYS_A, name: 'Payment Service', code: 'PAY_SVC', type: 'SERVICE', parentId: null, createdAt: now, updatedAt: now },
      { id: SYS_B, name: 'Ledger Service', code: 'LEDGER_SVC', type: 'SERVICE', parentId: null, createdAt: now, updatedAt: now },
    ]);
    await db.changeRequests.bulkAdd([
      { id: CR_A, name: 'Thanh toán QR', code: 'CR-1', type: 'NEW_FEATURE', status: 'Open', targets: [{ systemId: SYS_A }], createdAt: now, updatedAt: now },
      { id: CR_B, name: 'Sổ cái mới', code: 'CR-2', type: 'ENHANCEMENT', status: 'Open', targets: [{ systemId: SYS_B }], createdAt: now, updatedAt: now },
    ]);
    await db.crMilestones.bulkAdd([
      { id: MS_A, crId: CR_A, name: 'Đợt thanh toán', createdAt: now, updatedAt: now },
      { id: MS_B, crId: CR_B, name: 'Đợt sổ cái', createdAt: now, updatedAt: now },
    ]);
    vi.clearAllMocks();
  });

  async function seedTask(milestoneId?: string) {
    const now = new Date().toISOString();
    const task = {
      id: 'task-1',
      crId: CR_A,
      name: 'Task có mốc',
      status: 'Open',
      priority: 'High',
      progress: 0,
      estimateMinutes: 30,
      workType: 'code',
      createdAt: now,
      updatedAt: now,
      ...(milestoneId !== undefined ? { milestoneId } : {}),
    };
    await db.tasks.add(task as never);
    return task;
  }

  function open(taskId = 'task-1') {
    render(
      <ThemeAppHolder>
        <TaskDrawer taskId={taskId} open onClose={vi.fn()} db={db} />
      </ThemeAppHolder>
    );
  }

  function selectedMilestoneText(): string {
    const select = screen.getByLabelText('Mốc').closest('.ant-select') as HTMLElement;
    return select.querySelector('.ant-select-content')?.textContent ?? '';
  }

  it('prefills the milestone name and clears it when the CR changes', async () => {
    await seedTask(MS_A);
    open();
    await screen.findByDisplayValue('Task có mốc');
    await waitFor(() => expect(selectedMilestoneText()).toBe('Đợt thanh toán'));

    fireEvent.mouseDown(screen.getByLabelText('Change Request (CR)'));
    fireEvent.click(await screen.findByText(/Sổ cái mới/));
    await waitFor(() => expect(selectedMilestoneText()).toBe('Chưa gán mốc'));
  }, 30000);

  it('saves the selected milestone through updateTask', async () => {
    await seedTask();
    open();
    await screen.findByDisplayValue('Task có mốc');

    fireEvent.mouseDown(screen.getByLabelText('Mốc'));
    const option = await waitFor(() => {
      const node = Array.from(document.querySelectorAll('.ant-select-item-option')).find(
        (n) => n.textContent === 'Đợt thanh toán'
      );
      if (!node) throw new Error('milestone option not rendered');
      return node;
    });
    fireEvent.click(option);
    fireEvent.click(screen.getByRole('button', { name: /lưu tác vụ/i }));

    await waitFor(async () => {
      const saved = await db.tasks.get('task-1');
      expect(saved?.milestoneId).toBe(MS_A);
    });
  }, 30000);

  it('falls back to Chưa gán mốc for a dangling milestone id', async () => {
    await seedTask('99999999-9999-4999-8999-999999999999');
    open();
    await screen.findByDisplayValue('Task có mốc');
    await waitFor(() => expect(selectedMilestoneText()).toBe('Chưa gán mốc'));
  }, 30000);

  it('shows the no-milestone hint when the selected CR has no milestones', async () => {
    await db.crMilestones.clear();
    await seedTask();
    open();
    await screen.findByDisplayValue('Task có mốc');

    fireEvent.mouseDown(screen.getByLabelText('Mốc'));
    await waitFor(() => {
      const dropdown = document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
      expect(dropdown?.textContent ?? '').toMatch(/CR này chưa có mốc|Chưa gán mốc/);
    });
  }, 30000);
});
