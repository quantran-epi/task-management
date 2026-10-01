import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Form } from 'antd';
import { TaskPlannerDatabase } from '../../src/db/index';
import { createTask } from '../../src/db/repositories/taskRepo';
import { upsertAllocation } from '../../src/db/repositories/allocationRepo';
import { TaskDrawerPlanning } from '../../src/components/tasks/TaskDrawerPlanning';
import { TaskDrawer } from '../../src/components/tasks/TaskDrawer';

describe('TaskDrawerPlanning Component (PLAN-01, PLAN-02, PLAN-06, D-09, D-10)', () => {
  let testDb: TaskPlannerDatabase;

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase('TestPlanningDrawerDB_' + Math.random().toString(36).slice(2));
    await testDb.open();
  });

  afterEach(async () => {
    await testDb.delete();
  });

  it('renders progress bar, metrics, and empty table when no allocations exist', async () => {
    const task = await createTask(
      { name: 'Implement feature', estimateMinutes: 240, status: 'Open' },
      testDb
    );

    render(<TaskDrawerPlanning task={task} db={testDb} />);

    expect(await screen.findByText('Lập kế hoạch & Phân bổ hàng ngày')).toBeInTheDocument();
    expect(screen.getByTestId('planning-metrics-total')).toHaveTextContent('Đã phân bổ: 0m / Ước tính: 4h');
    expect(screen.getByTestId('planning-metrics-balance')).toHaveTextContent('Còn lại cần phân bổ: 4h');
    expect(screen.getByText('Chưa có phân bổ nào trên các ngày lịch')).toBeInTheDocument();
  });

  it('adding a 120m allocation updates the progress bar to 50% (PLAN-01, D-09)', async () => {
    const task = await createTask(
      { name: 'Implement feature', estimateMinutes: 240, status: 'Open' },
      testDb
    );

    render(<TaskDrawerPlanning task={task} db={testDb} />);

    await screen.findByText('Lập kế hoạch & Phân bổ hàng ngày');

    // Click 2h preset (120m)
    const preset2h = screen.getByRole('button', { name: 'Plan 2h' });
    fireEvent.click(preset2h);

    // Click Add Allocation button
    const addBtn = screen.getByTestId('add-allocation-btn');
    fireEvent.click(addBtn);

    await waitFor(async () => {
      expect(screen.getByTestId('planning-metrics-total')).toHaveTextContent('Đã phân bổ: 2h / Ước tính: 4h');
      expect(screen.getByTestId('planning-metrics-balance')).toHaveTextContent('Còn lại cần phân bổ: 2h');
      const progressBar = screen.getByTestId('planning-progress-bar');
      expect(progressBar).toBeInTheDocument();
    });
  });

  it('deleting an allocation removes row and restores balance (PLAN-02)', async () => {
    const task = await createTask(
      { name: 'Task with allocation', estimateMinutes: 180, status: 'Open' },
      testDb
    );
    await upsertAllocation(task.id, '2026-10-25', 60, testDb);

    render(<TaskDrawerPlanning task={task} db={testDb} />);

    await waitFor(() => {
      expect(screen.getByTestId('planning-metrics-total')).toHaveTextContent('Đã phân bổ: 1h / Ước tính: 3h');
    });

    // Click delete allocation button
    const deleteBtn = screen.getByRole('button', { name: /Xóa phân bổ ngày 2026-10-25/i });
    fireEvent.click(deleteBtn);

    // Confirm popconfirm
    const confirmBtn = await screen.findByRole('button', { name: 'Xóa' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByTestId('planning-metrics-total')).toHaveTextContent('Đã phân bổ: 0m / Ước tính: 3h');
      expect(screen.getByTestId('planning-metrics-balance')).toHaveTextContent('Còn lại cần phân bổ: 3h');
    });
  });

  it('shows soft warning alert when total allocated exceeds task estimate (D-10, PLAN-06)', async () => {
    const task = await createTask(
      { name: 'Small task', estimateMinutes: 60, status: 'Open' },
      testDb
    );
    // Allocate 120m to a 60m task
    await upsertAllocation(task.id, '2026-10-25', 120, testDb);

    render(<TaskDrawerPlanning task={task} db={testDb} />);

    const warning = await screen.findByTestId('planning-overflow-warning');
    expect(warning).toHaveTextContent(/Thời gian phân bổ vượt quá ước tính tác vụ 1h/i);
    expect(screen.getByTestId('planning-metrics-balance')).toHaveTextContent('Phân bổ vượt mức: +1h');
  });

  it('integrates seamlessly inside TaskDrawer when task is loaded (D-09)', async () => {
    const task = await createTask(
      { name: 'Drawer Task', estimateMinutes: 120, status: 'Open' },
      testDb
    );
    await upsertAllocation(task.id, '2026-10-26', 60, testDb);

    render(<TaskDrawer taskId={task.id} open={true} onClose={() => {}} db={testDb} />);

    expect(await screen.findByText('Lập kế hoạch & Phân bổ hàng ngày')).toBeInTheDocument();
    expect(await screen.findByTestId('planning-metrics-total')).toHaveTextContent('Đã phân bổ: 1h / Ước tính: 2h');
  });

  it('uses loaded task estimate while drawer form watchers are not hydrated', async () => {
    const useWatchSpy = vi.spyOn(Form, 'useWatch').mockReturnValue(undefined);
    const task = await createTask(
      { name: 'Drawer Task', estimateMinutes: 120, status: 'Open' },
      testDb
    );
    await upsertAllocation(task.id, '2026-10-26', 60, testDb);

    try {
      render(<TaskDrawer taskId={task.id} open={true} onClose={() => {}} db={testDb} />);

      expect(await screen.findByText('Lập kế hoạch & Phân bổ hàng ngày')).toBeInTheDocument();
      expect(await screen.findByTestId('planning-metrics-total')).toHaveTextContent('Đã phân bổ: 1h / Ước tính: 2h');
    } finally {
      useWatchSpy.mockRestore();
    }
  });
});
