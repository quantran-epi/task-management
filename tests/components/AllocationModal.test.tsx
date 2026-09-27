import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../src/db/index';
import { createTask } from '../../src/db/repositories/taskRepo';
import { upsertAllocation } from '../../src/db/repositories/allocationRepo';
import { AllocationModal } from '../../src/components/planner/AllocationModal';
import { TaskAllocationCard } from '../../src/components/planner/TaskAllocationCard';

describe('Task Allocation UI Components (PLAN-01, PLAN-02, PLAN-06, D-09, D-10, D-11, D-16)', () => {
  let testDb: TaskPlannerDatabase;

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase('TestAllocationUI_' + Math.random().toString(36).slice(2));
    await testDb.open();
  });

  afterEach(async () => {
    await testDb.delete();
  });

  describe('AllocationModal', () => {
    it('renders task selector, date picker, duration inputs, and preset buttons', async () => {
      await createTask({ name: 'Alpha Task', estimateMinutes: 120, status: 'Open' }, testDb);

      const onCancel = vi.fn();
      render(<AllocationModal open={true} onCancel={onCancel} db={testDb} />);

      expect(await screen.findByText('Phân bổ thời gian tác vụ')).toBeInTheDocument();
      expect(screen.getByText('Chọn tác vụ')).toBeInTheDocument();
      expect(screen.getByText('Ngày thực hiện')).toBeInTheDocument();
      expect(screen.getByText('Thời gian dự kiến')).toBeInTheDocument();

      // Quick presets
      expect(screen.getByRole('button', { name: '1h' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '2h' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '4h' })).toBeInTheDocument();
    });

    it('shows soft warning alert when allocated time exceeds task estimate (D-10, PLAN-06)', async () => {
      const task = await createTask(
        { name: 'Short Task', estimateMinutes: 60, status: 'Open' },
        testDb
      );

      render(
        <AllocationModal
          open={true}
          initialTaskId={task.id}
          initialDate="2026-10-21"
          onCancel={vi.fn()}
          db={testDb}
        />
      );

      // Default is 1h (60m) - exactly equals estimate, no warning
      expect(await screen.findByTestId('estimate-comparison')).toBeInTheDocument();
      expect(screen.queryByTestId('soft-overflow-warning')).toBeNull();

      // Click preset 2h (120m) -> exceeds 60m estimate
      const preset2h = screen.getByRole('button', { name: '2h' });
      fireEvent.click(preset2h);

      // Soft warning appears with overage calculation
      const warning = await screen.findByTestId('soft-overflow-warning');
      expect(warning).toHaveTextContent(/Tổng thời gian phân bổ vượt quá ước tính tác vụ 1h/i);
    });

    it('submits allocation successfully via upsertAllocation and triggers onSuccess', async () => {
      const task = await createTask(
        { name: 'Feature Sprint', estimateMinutes: 240, status: 'In Progress' },
        testDb
      );

      const onSuccess = vi.fn();
      const onCancel = vi.fn();

      render(
        <AllocationModal
          open={true}
          initialTaskId={task.id}
          initialDate="2026-10-22"
          onCancel={onCancel}
          onSuccess={onSuccess}
          db={testDb}
        />
      );

      await screen.findByTestId('estimate-comparison');

      // Click 4h preset
      const preset4h = screen.getByRole('button', { name: '4h' });
      fireEvent.click(preset4h);

      // Click Save Allocation button
      const saveBtn = screen.getByRole('button', { name: 'Lưu phân bổ' });
      fireEvent.click(saveBtn);

      await waitFor(async () => {
        const stored = await testDb.plannedAllocations.where('taskId').equals(task.id).first();
        expect(stored).toBeDefined();
        expect(stored?.date).toBe('2026-10-22');
        expect(stored?.allocatedMinutes).toBe(240);
        expect(onSuccess).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('TaskAllocationCard', () => {
    it('renders active task card with duration tag and priority', async () => {
      const task = await createTask(
        { name: 'Fix auth bug', priority: 'High', status: 'Open' },
        testDb
      );
      const alloc = await upsertAllocation(task.id, '2026-10-20', 90, testDb);

      render(
        <TaskAllocationCard
          allocation={alloc}
          task={task}
          isActive={true}
          db={testDb}
        />
      );

      expect(screen.getByText('Fix auth bug')).toBeInTheDocument();
      expect(screen.getByText('Cao')).toBeInTheDocument();
      expect(screen.getByText('1h 30m')).toBeInTheDocument();
    });

    it('renders inactive Done task with muted styling and exclusion badge (D-16)', async () => {
      const task = await createTask(
        { name: 'Finished feature', priority: 'Medium', status: 'Done' },
        testDb
      );
      const alloc = await upsertAllocation(task.id, '2026-10-20', 60, testDb);

      render(
        <TaskAllocationCard
          allocation={alloc}
          task={task}
          isActive={false}
          db={testDb}
        />
      );

      expect(screen.getByText('Finished feature')).toBeInTheDocument();
      expect(screen.getByText('Hoàn thành - không tính')).toBeInTheDocument();

      const card = screen.getByTestId(`allocation-card-${alloc.id}`);
      expect(card.style.opacity).toBe('0.5');
    });

    it('removes allocation on delete confirmation', async () => {
      const task = await createTask({ name: 'Disposable', status: 'Open' }, testDb);
      const alloc = await upsertAllocation(task.id, '2026-10-20', 45, testDb);

      render(
        <TaskAllocationCard
          allocation={alloc}
          task={task}
          isActive={true}
          db={testDb}
        />
      );

      const deleteBtn = screen.getByRole('button', { name: `Remove allocation of ${task.name}` });
      fireEvent.click(deleteBtn);

      const confirmBtn = await screen.findByRole('button', { name: 'Xóa' });
      fireEvent.click(confirmBtn);

      await waitFor(async () => {
        const remaining = await testDb.plannedAllocations.get(alloc.id);
        expect(remaining).toBeUndefined();
      });
    });
  });
});
